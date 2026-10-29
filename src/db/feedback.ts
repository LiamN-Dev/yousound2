import fs from 'fs';
import path from 'path';
import { checkSqlAvailability, createPool } from './index.ts';

export type FeedbackType = 'feature' | 'bug';
export type FeedbackStatus = 'new' | 'in_progress' | 'done' | 'declined';

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  details: string;
  area?: string | null;
  userId?: string | null;
  username: string;
  userAgent?: string | null;
  status: FeedbackStatus;
  adminNote?: string | null;
  createdAt: string;
  /** Last time an admin changed the status or note */
  updatedAt: string;
  /** When the status last changed (used for the 24 hour clean-up) */
  statusChangedAt?: string | null;
  /** When the person last looked at their reports */
  userSeenAt?: string | null;
  /** Computed for the person who sent it: has something changed since they last looked? */
  unread?: boolean;
}

// How long finished (done / declined) items stay visible
const CLOSED_KEEP_HOURS = 24;

// ---- JSON file fallback (used when no SQL database is connected) ----
const DATA_DIR = path.resolve(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'feedback.json');

function readFile(): FeedbackItem[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as FeedbackItem[];
  } catch {
    return [];
  }
}

function writeFile(items: FeedbackItem[]) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
  } catch (err) {
    console.warn('[Feedback] Could not write local file:', err);
  }
}

const iso = (v: any): string | null => (v ? new Date(v).toISOString() : null);

function rowToItem(r: any): FeedbackItem {
  const createdAt = iso(r.created_at) || new Date().toISOString();
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    details: r.details || '',
    area: r.area,
    userId: r.user_id,
    username: r.username || 'Guest',
    userAgent: r.user_agent,
    status: r.status,
    adminNote: r.admin_note,
    createdAt,
    updatedAt: iso(r.updated_at) || createdAt,
    statusChangedAt: iso(r.status_changed_at),
    userSeenAt: iso(r.user_seen_at) || createdAt,
  };
}

function withUnread(item: FeedbackItem): FeedbackItem {
  const seen = new Date(item.userSeenAt || item.createdAt).getTime();
  const updated = new Date(item.updatedAt || item.createdAt).getTime();
  return { ...item, unread: updated - seen > 1000 };
}

export async function createFeedbackDb(
  data: Pick<FeedbackItem, 'type' | 'title' | 'details' | 'area' | 'userId' | 'username' | 'userAgent'>
): Promise<FeedbackItem> {
  const now = new Date().toISOString();
  const item: FeedbackItem = {
    id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: data.type,
    title: data.title,
    details: data.details,
    area: data.area || null,
    userId: data.userId || null,
    username: data.username || 'Guest',
    userAgent: data.userAgent || null,
    status: 'new',
    adminNote: null,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    userSeenAt: now,
  };

  if (await checkSqlAvailability()) {
    try {
      await createPool().query(
        `INSERT INTO feedback_items
           (id, type, title, details, area, user_id, username, user_agent, status, created_at, updated_at, status_changed_at, user_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9,$9,$9,$9)`,
        [item.id, item.type, item.title, item.details, item.area, item.userId, item.username, item.userAgent, now]
      );
      return item;
    } catch (err: any) {
      console.error('[Feedback] SQL insert failed, using local file:', err?.cause?.message || err?.message || err);
    }
  }
  const all = readFile();
  all.unshift(item);
  writeFile(all);
  return item;
}

async function listAll(): Promise<FeedbackItem[]> {
  const local = readFile();
  if (await checkSqlAvailability()) {
    try {
      const res = await createPool().query('SELECT * FROM feedback_items ORDER BY created_at DESC LIMIT 500');
      const fromSql = res.rows.map(rowToItem);
      const ids = new Set(fromSql.map((i) => i.id));
      return [...fromSql, ...local.filter((i) => !ids.has(i.id))];
    } catch (err: any) {
      console.error('[Feedback] SQL list failed, using local file:', err?.cause?.message || err?.message || err);
    }
  }
  return local;
}

export async function listFeedbackDb(): Promise<FeedbackItem[]> {
  await purgeClosedFeedbackDb();
  return listAll();
}

/** Only the person's own reports, with an "unread" flag for anything that changed since they last looked */
export async function listFeedbackForUserDb(userId: string): Promise<FeedbackItem[]> {
  await purgeClosedFeedbackDb();
  const all = await listAll();
  return all.filter((i) => i.userId === userId).map(withUnread);
}

export async function markFeedbackSeenDb(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (await checkSqlAvailability()) {
    try {
      await createPool().query('UPDATE feedback_items SET user_seen_at = $2 WHERE user_id = $1', [userId, now]);
    } catch (err: any) {
      console.error('[Feedback] mark seen failed:', err?.cause?.message || err?.message || err);
    }
  }
  const all = readFile();
  let changed = false;
  for (const i of all) {
    if (i.userId === userId) {
      i.userSeenAt = now;
      changed = true;
    }
  }
  if (changed) writeFile(all);
}

export async function updateFeedbackDb(
  id: string,
  patch: { status?: FeedbackStatus; adminNote?: string | null }
): Promise<boolean> {
  if (await checkSqlAvailability()) {
    try {
      const res = await createPool().query(
        `UPDATE feedback_items SET
           status = COALESCE($2::text, status),
           status_changed_at = CASE WHEN $2::text IS NOT NULL AND $2::text IS DISTINCT FROM status THEN NOW() ELSE status_changed_at END,
           updated_at = CASE
             WHEN ($2::text IS NOT NULL AND $2::text IS DISTINCT FROM status)
               OR ($3::boolean AND $4::text IS DISTINCT FROM admin_note) THEN NOW()
             ELSE updated_at END,
           admin_note = CASE WHEN $3::boolean THEN $4::text ELSE admin_note END
         WHERE id = $1`,
        [id, patch.status ?? null, patch.adminNote !== undefined, patch.adminNote ?? null]
      );
      if ((res.rowCount ?? 0) > 0) return true;
    } catch (err: any) {
      console.error('[Feedback] SQL update failed:', err?.cause?.message || err?.message || err);
    }
  }
  const all = readFile();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  const now = new Date().toISOString();
  if (patch.status && patch.status !== all[idx].status) {
    all[idx].status = patch.status;
    all[idx].statusChangedAt = now;
    all[idx].updatedAt = now;
  }
  if (patch.adminNote !== undefined && patch.adminNote !== all[idx].adminNote) {
    all[idx].adminNote = patch.adminNote;
    all[idx].updatedAt = now;
  }
  writeFile(all);
  return true;
}

export async function deleteFeedbackDb(id: string): Promise<boolean> {
  let done = false;
  if (await checkSqlAvailability()) {
    try {
      const res = await createPool().query('DELETE FROM feedback_items WHERE id = $1', [id]);
      done = (res.rowCount ?? 0) > 0;
    } catch (err: any) {
      console.error('[Feedback] SQL delete failed:', err?.cause?.message || err?.message || err);
    }
  }
  const all = readFile();
  const next = all.filter((i) => i.id !== id);
  if (next.length !== all.length) {
    writeFile(next);
    done = true;
  }
  return done;
}

/** Removes finished (done / declined) items. olderThanHours = 0 removes all of them right now. */
async function removeClosed(olderThanHours: number): Promise<number> {
  let removed = 0;
  if (await checkSqlAvailability()) {
    try {
      const res = await createPool().query(
        `DELETE FROM feedback_items
          WHERE status IN ('done','declined')
            AND COALESCE(status_changed_at, updated_at, created_at) <= NOW() - ($1::int * INTERVAL '1 hour')`,
        [olderThanHours]
      );
      removed += res.rowCount ?? 0;
    } catch (err: any) {
      console.error('[Feedback] clean-up failed:', err?.cause?.message || err?.message || err);
    }
  }
  const all = readFile();
  const cutoff = Date.now() - olderThanHours * 3600_000;
  const next = all.filter((i) => {
    if (i.status !== 'done' && i.status !== 'declined') return true;
    const when = new Date(i.statusChangedAt || i.updatedAt || i.createdAt).getTime();
    return when > cutoff;
  });
  if (next.length !== all.length) {
    removed += all.length - next.length;
    writeFile(next);
  }
  return removed;
}

/** Automatic clean-up: finished items disappear 24 hours after they were completed or declined */
export const purgeClosedFeedbackDb = () => removeClosed(CLOSED_KEEP_HOURS);

/** Admin button: remove every finished item right now */
export const clearClosedFeedbackDb = () => removeClosed(0);
