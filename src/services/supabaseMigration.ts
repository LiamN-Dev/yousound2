import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { localStore } from '../db/localStore.ts';

const SCHEMA_PATH = path.resolve(process.cwd(), 'supabase-schema.sql');

function escapeSql(str: any): string {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'boolean') return str ? 'true' : 'false';
  if (typeof str === 'number') return isFinite(str) ? String(str) : '0';
  if (typeof str === 'object') {
    return `'${JSON.stringify(str).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(str).replace(/'/g, "''")}'`;
}

export function generateSupabaseMigrationSql(): string {
  let baseSchema = '';
  if (fs.existsSync(SCHEMA_PATH)) {
    baseSchema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  }

  const users = localStore.getUsers();
  const songs = localStore.getSongs();
  const requests = localStore.getRequests();
  const popups = localStore.getPopups();
  const playlists = localStore.getPlaylists();

  let dataSql = '\n-- ==========================================================\n';
  dataSql += '-- SEED DATA MIGRATION FROM CURRENT LOCAL DATABASE\n';
  dataSql += '-- ==========================================================\n\n';

  // Users
  if (users.length > 0) {
    dataSql += '-- 1. Users\n';
    for (const u of users) {
      dataSql += `INSERT INTO users (uid, username, email, password_hash, role, is_approved, note, temporary_password_assigned, is_suspended, suspended_reason, admin_note, color_accent, created_at)\n`;
      dataSql += `VALUES (${escapeSql(u.uid)}, ${escapeSql(u.username)}, ${escapeSql(u.email)}, ${escapeSql(u.passwordHash)}, ${escapeSql(u.role)}, ${u.isApproved ? 'true' : 'false'}, ${escapeSql(u.note)}, ${u.temporaryPasswordAssigned ? 'true' : 'false'}, ${u.isSuspended ? 'true' : 'false'}, ${escapeSql(u.suspendedReason)}, ${escapeSql(u.adminNote)}, ${escapeSql(u.colorAccent)}, ${escapeSql(u.createdAt)})\n`;
      dataSql += `ON CONFLICT (uid) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role, is_approved = EXCLUDED.is_approved;\n\n`;
    }
  }

  // Songs
  if (songs.length > 0) {
    dataSql += '-- 2. Songs\n';
    for (const s of songs) {
      dataSql += `INSERT INTO songs (id, title, artist, album, genre, tags, type_mood, duration, audio_url, cover_url, added_at, plays, featured, description, is_limited_edition, is_pinned, is_spotlight, spotlight_order, daily_plays, weekly_plays)\n`;
      dataSql += `VALUES (${escapeSql(s.id)}, ${escapeSql(s.title)}, ${escapeSql(s.artist)}, ${escapeSql(s.album)}, ${escapeSql(s.genre)}, ${escapeSql(s.tags || [])}, ${escapeSql(s.typeMood)}, ${s.duration || 0}, ${escapeSql(s.audioUrl)}, ${escapeSql(s.coverUrl)}, ${escapeSql(s.addedAt)}, ${s.plays || 0}, ${s.featured ? 'true' : 'false'}, ${escapeSql(s.description)}, ${s.isLimitedEdition ? 'true' : 'false'}, ${s.isPinned ? 'true' : 'false'}, ${s.isSpotlight ? 'true' : 'false'}, ${s.spotlightOrder || 0}, ${s.dailyPlays || 0}, ${s.weeklyPlays || 0})\n`;
      dataSql += `ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, artist = EXCLUDED.artist, audio_url = EXCLUDED.audio_url, cover_url = EXCLUDED.cover_url;\n\n`;
    }
  }

  // Requests
  if (requests.length > 0) {
    dataSql += '-- 3. Song Requests\n';
    for (const r of requests) {
      dataSql += `INSERT INTO song_requests (id, song_title, artist, web_link, cover_url, notes, requested_by_user_id, requested_by_username, created_at, status, admin_note, request_type, genre, duration, audio_url, drive_file_id)\n`;
      dataSql += `VALUES (${escapeSql(r.id)}, ${escapeSql(r.songTitle)}, ${escapeSql(r.artist)}, ${escapeSql(r.webLink)}, ${escapeSql(r.coverUrl)}, ${escapeSql(r.notes)}, ${escapeSql(r.requestedByUserId)}, ${escapeSql(r.requestedByUsername)}, ${escapeSql(r.createdAt)}, ${escapeSql(r.status)}, ${escapeSql(r.adminNote)}, ${escapeSql(r.requestType)}, ${escapeSql(r.genre)}, ${r.duration || 0}, ${escapeSql(r.audioUrl)}, ${escapeSql(r.driveFileId)})\n`;
      dataSql += `ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, audio_url = EXCLUDED.audio_url;\n\n`;
    }
  }

  // Popups
  if (popups.length > 0) {
    dataSql += '-- 4. Popups\n';
    for (const p of popups) {
      dataSql += `INSERT INTO popups (id, target_user_id, title, message, type, created_at, active, is_dismissible)\n`;
      dataSql += `VALUES (${escapeSql(p.id)}, ${escapeSql(p.targetUserId)}, ${escapeSql(p.title)}, ${escapeSql(p.message)}, ${escapeSql(p.type)}, ${escapeSql(p.createdAt)}, ${p.active ? 'true' : 'false'}, ${p.isDismissible ? 'true' : 'false'})\n`;
      dataSql += `ON CONFLICT (id) DO NOTHING;\n\n`;
    }
  }

  // Playlists
  if (playlists.length > 0) {
    dataSql += '-- 5. Playlists\n';
    for (const pl of playlists) {
      dataSql += `INSERT INTO playlists (id, user_id, name, description, cover_url, song_ids, created_at)\n`;
      dataSql += `VALUES (${escapeSql(pl.id)}, ${escapeSql(pl.userId)}, ${escapeSql(pl.name)}, ${escapeSql(pl.description)}, ${escapeSql(pl.coverUrl)}, ${escapeSql(pl.songIds || [])}, ${escapeSql(pl.createdAt)})\n`;
      dataSql += `ON CONFLICT (id) DO NOTHING;\n\n`;
    }
  }

  return baseSchema + dataSql;
}

export async function testSupabaseDbConnection(connStr: string): Promise<{ success: boolean; version?: string; latencyMs?: number; error?: string }> {
  const start = Date.now();
  const client = new pg.Client({
    connectionString: connStr.trim(),
    ssl: {
      rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const res = await client.query('SELECT version(), NOW() as server_time');
    const latencyMs = Date.now() - start;
    const version = res.rows[0]?.version || 'PostgreSQL';
    await client.end();
    return { success: true, version, latencyMs };
  } catch (err: any) {
    try {
      await client.end();
    } catch (_) {}
    return { success: false, error: err.message || 'Connection failed' };
  }
}

export async function syncLocalDataToSupabase(connStr: string): Promise<{ success: boolean; migratedCounts: Record<string, number>; error?: string }> {
  const client = new pg.Client({
    connectionString: connStr.trim(),
    ssl: {
      rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();

    // 1. Ensure Schema Exists
    const fullMigrationSql = generateSupabaseMigrationSql();
    await client.query(fullMigrationSql);

    const users = localStore.getUsers();
    const songs = localStore.getSongs();
    const requests = localStore.getRequests();
    const playlists = localStore.getPlaylists();

    await client.end();

    return {
      success: true,
      migratedCounts: {
        users: users.length,
        songs: songs.length,
        requests: requests.length,
        playlists: playlists.length,
      },
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch (_) {}
    return {
      success: false,
      migratedCounts: {},
      error: err.message || 'Migration to Supabase failed',
    };
  }
}
