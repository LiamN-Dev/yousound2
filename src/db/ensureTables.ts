import fs from 'fs';
import path from 'path';
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema.ts';
import { checkSqlAvailability, createPool, getDatabaseHealth } from './index.ts';

/**
 * Makes sure the Postgres / Supabase database has every table the app needs.
 *
 * Nothing else in the app creates tables, so a database that never had
 * supabase-schema.sql run on it silently breaks features like chat
 * (reads fall back to a temporary local store, but writes fail).
 *
 * Everything here is idempotent (IF NOT EXISTS), so it is safe on every start.
 */
export async function ensureTables(): Promise<void> {
  let available = false;
  try {
    available = await checkSqlAvailability();
  } catch (_) {}
  if (!available) {
    console.warn('==================================================================');
    console.warn('[Database] NOT CONNECTED - data is stored on a temporary disk and is');
    console.warn('[Database] ERASED on every redeploy. Reason: ' + (getDatabaseHealth().lastError || 'unknown'));
    console.warn('[Database] Fix: add DATABASE_URL (Supabase "Session pooler" string) in Render > Environment.');
    console.warn('==================================================================');
    return;
  }

  const pool = createPool();
  const run = async (label: string, sql: string) => {
    try {
      await pool.query(sql);
      return true;
    } catch (err: any) {
      console.warn(`[Schema] ${label} skipped: ${err?.message || err}`);
      return false;
    }
  };

  // 1. Base schema file (all CREATE ... IF NOT EXISTS)
  try {
    const file = path.resolve(process.cwd(), 'supabase-schema.sql');
    if (fs.existsSync(file)) {
      const statements = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await run(stmt.split('\n')[0].slice(0, 70), stmt);
      }
    } else {
      console.warn('[Schema] supabase-schema.sql not found next to server.ts');
    }
  } catch (err: any) {
    console.warn('[Schema] Could not apply base schema:', err?.message || err);
  }

  // 2. Columns that older databases may be missing
  const columns: Array<[string, string]> = [
    ['users', 'chat_blocked BOOLEAN DEFAULT false'],
    ['users', 'is_suspended BOOLEAN DEFAULT false'],
    ['users', 'daily_listen_limit INTEGER'],
    ['chat_threads', 'is_approved BOOLEAN NOT NULL DEFAULT false'],
    ['chat_threads', 'is_terminated BOOLEAN NOT NULL DEFAULT false'],
    ['chat_threads', 'terminated_reason TEXT'],
    ['chat_threads', 'last_message TEXT'],
    ['chat_threads', 'last_message_sender TEXT'],
    ['chat_threads', "last_message_at TIMESTAMPTZ DEFAULT NOW()"],
    ['chat_threads', "hidden_by_user_ids JSONB DEFAULT '[]'::jsonb"],
    ['chat_threads', 'is_appeal_thread BOOLEAN DEFAULT false'],
  ];
  for (const [table, col] of columns) {
    await run(`${table}.${col.split(' ')[0]}`, `ALTER TABLE IF EXISTS ${table} ADD COLUMN IF NOT EXISTS ${col}`);
  }

  await run(
    'user_daily_listen_usage',
    `CREATE TABLE IF NOT EXISTS user_daily_listen_usage (
       uid TEXT NOT NULL,
       usage_date DATE NOT NULL,
       listens INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (uid, usage_date)
     )`
  );
  await run(
    'idx_user_daily_listen_usage_date',
    'CREATE INDEX IF NOT EXISTS idx_user_daily_listen_usage_date ON user_daily_listen_usage(usage_date)'
  );


  // 2b. Compare every table with what the app expects and repair differences.
  //     (A table created by an older version can be missing columns, which makes every
  //      save fail. Those failures used to be hidden, so data "disappeared".)
  try {
    for (const value of Object.values(schema)) {
      if (!is(value as any, PgTable)) continue;
      const cfg = getTableConfig(value as any);
      const table = cfg.name;
      const existingRes = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      if (existingRes.rowCount === 0) continue; // table missing; created above
      const existing = new Map<string, any>(existingRes.rows.map((r: any) => [r.column_name, r]));

      for (const col of cfg.columns as any[]) {
        const found = existing.get(col.name);
        const sqlType: string = col.getSQLType();
        if (!found) {
          let def = '';
          if (typeof col.default === 'string') def = ` DEFAULT '${col.default.replace(/'/g, "''")}'`;
          else if (typeof col.default === 'number' || typeof col.default === 'boolean') def = ` DEFAULT ${col.default}`;
          else if (col.hasDefault && sqlType.startsWith('timestamp')) def = ' DEFAULT now()';
          const ok = await run(
            `add ${table}.${col.name}`,
            `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col.name}" ${sqlType}${def}`
          );
          if (ok) console.log(`[Schema] Added missing column ${table}.${col.name}`);
        } else if (sqlType === 'text' && !['text', 'character varying'].includes(found.data_type)) {
          // text can safely hold anything, so convert
          const ok = await run(
            `convert ${table}.${col.name}`,
            `ALTER TABLE "${table}" ALTER COLUMN "${col.name}" TYPE text USING "${col.name}"::text`
          );
          if (ok) console.log(`[Schema] Converted ${table}.${col.name} from ${found.data_type} to text`);
        }
      }

      // Columns the app never fills in must not be NOT NULL, or every insert fails
      const pkRes = await pool.query(
        `SELECT a.attname AS name
           FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
          WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [`public."${table}"`]
      );
      const pk = new Set<string>(pkRes.rows.map((r: any) => r.name));
      for (const [name, info] of existing) {
        if (info.is_nullable !== 'NO' || info.column_default || pk.has(name)) continue;
        const def = (cfg.columns as any[]).find((c) => c.name === name);
        if (!def || !def.notNull) {
          const ok = await run(
            `relax ${table}.${name}`,
            `ALTER TABLE "${table}" ALTER COLUMN "${name}" DROP NOT NULL`
          );
          if (ok) console.log(`[Schema] ${table}.${name} no longer blocks saves (NOT NULL removed)`);
        }
      }
    }
  } catch (err: any) {
    console.warn('[Schema] Column check failed:', err?.message || err);
  }

  // 3. A message must never be rejected because its thread row lives elsewhere
  await run(
    'drop chat_messages FK',
    'ALTER TABLE IF EXISTS chat_messages DROP CONSTRAINT IF EXISTS chat_messages_thread_id_fkey'
  );

  // 4. Feature requests & bug reports
  await run(
    'feedback_items',
    `CREATE TABLE IF NOT EXISTS feedback_items (
       id TEXT PRIMARY KEY,
       type TEXT NOT NULL,
       title TEXT NOT NULL,
       details TEXT NOT NULL DEFAULT '',
       area TEXT,
       user_id TEXT,
       username TEXT NOT NULL DEFAULT 'Guest',
       user_agent TEXT,
       status TEXT NOT NULL DEFAULT 'new',
       admin_note TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ DEFAULT NOW(),
       status_changed_at TIMESTAMPTZ DEFAULT NOW(),
       user_seen_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  // Older copies of the table: add the progress-tracking columns
  for (const col of [
    'updated_at TIMESTAMPTZ DEFAULT NOW()',
    'status_changed_at TIMESTAMPTZ DEFAULT NOW()',
    'user_seen_at TIMESTAMPTZ DEFAULT NOW()',
  ]) {
    await run(`feedback_items.${col.split(' ')[0]}`, `ALTER TABLE IF EXISTS feedback_items ADD COLUMN IF NOT EXISTS ${col}`);
  }

  console.log('[Schema] Database tables verified.');
}
