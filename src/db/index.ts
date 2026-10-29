import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
  var _isSqlAvailable: boolean | undefined;
  var _isSqlChecked: boolean | undefined;
  var _activeSupabaseUrl: string | undefined;
}

let isChecked = false;
let isAvailable = false;
let activeConnectionString: string | undefined =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

export const setSupabaseConnectionString = (connStr: string | undefined) => {
  activeConnectionString = connStr;
  isChecked = false;
  isAvailable = false;
  if (global._postgresPool) {
    try {
      global._postgresPool.end();
    } catch (_) {}
    global._postgresPool = undefined;
  }
};

export const getActiveConnectionString = (): string | undefined => {
  return activeConnectionString;
};

export const getPoolConfig = (): PoolConfig => {
  const connStr = activeConnectionString || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (connStr && connStr.trim().startsWith('postgres')) {
    return {
      connectionString: connStr.trim(),
      ssl: {
        rejectUnauthorized: false,
      },
      max: 10,
      connectionTimeoutMillis: 8000,
    };
  }

  return {
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    max: 10,
    connectionTimeoutMillis: 1500,
  };
};

let lastError: string | null = null;
let lastDbError: { where: string; message: string; at: string } | null = null;
const recentDbErrors = new Map<string, number>();
let lastCheckAt = 0;
let checkInFlight: Promise<boolean> | null = null;
const RECHECK_MS = 30_000;

const hasConfig = (): boolean => {
  const config = getPoolConfig();
  return Boolean(config.connectionString || (config.host && config.user));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tryConnectOnce(): Promise<boolean> {
  const testPool = new Pool(getPoolConfig());
  try {
    await testPool.query('SELECT 1');
    lastError = null;
    return true;
  } catch (err: any) {
    lastError = err?.message || String(err);
    return false;
  } finally {
    try {
      await testPool.end();
    } catch (_) {}
  }
}

/**
 * Is the SQL database reachable?
 * - Retries a few times on the first check (databases can be slow to wake up on deploy).
 * - After a failure it checks again every 30 seconds instead of staying on the temporary
 *   local store until the next restart.
 */
export const checkSqlAvailability = async (): Promise<boolean> => {
  if (!hasConfig()) {
    isChecked = true;
    isAvailable = false;
    lastError = 'No database connection string is set (DATABASE_URL is missing).';
    return false;
  }

  if (isChecked && (isAvailable || Date.now() - lastCheckAt < RECHECK_MS)) return isAvailable;
  if (checkInFlight) return checkInFlight;

  const firstEver = !isChecked;
  checkInFlight = (async () => {
    const attempts = firstEver ? 3 : 1;
    let ok = false;
    for (let i = 0; i < attempts && !ok; i++) {
      ok = await tryConnectOnce();
      if (!ok && i < attempts - 1) await sleep(2000);
    }
    const wasAvailable = isAvailable;
    isAvailable = ok;
    isChecked = true;
    lastCheckAt = Date.now();
    if (ok && !wasAvailable) {
      console.log('[Database] Successfully connected to PostgreSQL / Supabase!');
    } else if (!ok) {
      console.error(`[Database] Could not connect: ${lastError}. Data will NOT be saved permanently until this is fixed.`);
    }
    return ok;
  })().finally(() => {
    checkInFlight = null;
  });

  return checkInFlight;
};

/**
 * Records (and logs) a database error that the app would otherwise swallow.
 * The error text never includes the SQL parameters (those can contain passwords).
 */
export const noteDbError = (where: string, err: any) => {
  const root = err?.cause || err;
  let message: string = String(root?.message || err?.message || err || 'unknown error');
  if (root?.detail) message += ` (${root.detail})`;
  if (message.length > 300) message = message.slice(0, 300) + '...';
  lastDbError = { where, message, at: new Date().toISOString() };
  const key = `${where}|${message}`;
  const now = Date.now();
  const prev = recentDbErrors.get(key);
  if (!prev || now - prev > 60_000) {
    recentDbErrors.set(key, now);
    console.error(`[Database] ${where} failed: ${message}`);
  }
};

export const clearDbError = () => {
  lastDbError = null;
};

export const getDatabaseHealth = () => ({
  lastDbError,
  configured: hasConfig(),
  connected: isAvailable,
  lastError,
  source: (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL
    ? 'env'
    : activeConnectionString
      ? 'admin-panel'
      : 'none') as 'env' | 'admin-panel' | 'none',
});

export const getSqlAvailabilitySync = (): boolean => {
  return isAvailable;
};

export const createPool = () => {
  if (!global._postgresPool) {
    const config = getPoolConfig();
    global._postgresPool = new Pool(config);

    global._postgresPool.on('error', (err) => {
      if (err.message.includes('ENOENT') || err.message.includes('Connection terminated')) {
        isAvailable = false;
        return;
      }
      console.warn('[SQL Pool Warning]:', err.message);
    });
  }
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });
