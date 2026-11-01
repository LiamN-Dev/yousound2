import { eq, desc, and, or, asc, inArray, isNotNull, lte, ilike, sql } from 'drizzle-orm';
import { db, checkSqlAvailability, noteDbError, createPool, getDatabaseHealth } from './index.ts';
import { localStore } from './localStore.ts';
import {
  users,
  songs,
  playlists,
  favorites,
  songRequests,
  popups,
  systemSettings,
  mediaIds,
  mediaFiles,
  chatRequests,
  chatThreads,
  chatMessages,
  radioChatMessages,
  radioChatBans,
  chatPairingBlocks,
} from './schema.ts';

// ----------------- USERS -----------------
export async function getUsersDb() {
  if (!(await checkSqlAvailability())) {
    return localStore.getUsers();
  }
  try {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  } catch (error) {
    noteDbError('getUsersDb', error);
    return localStore.getUsers();
  }
}

export async function getUserByUid(uid: string) {
  if (!(await checkSqlAvailability())) {
    return localStore.getUserByUid(uid);
  }
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] || null;
  } catch (error) {
    noteDbError('getUserByUid', error);
    return localStore.getUserByUid(uid);
  }
}

export async function getUserByUsername(username: string) {
  if (!(await checkSqlAvailability())) {
    return localStore.getUserByUsername(username);
  }
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, username.trim()))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    noteDbError('getUserByUsername', error);
    return localStore.getUserByUsername(username);
  }
}

export async function createUserDb(data: {
  uid: string;
  username: string;
  email?: string;
  passwordHash?: string;
  role?: string;
  isApproved?: boolean;
  note?: string;
  temporaryPasswordAssigned?: boolean;
}) {
  if (!(await checkSqlAvailability())) {
    return localStore.createUser(data);
  }
  try {
    const inserted = await db
      .insert(users)
      .values({
        uid: data.uid,
        username: data.username.trim(),
        email: data.email || null,
        passwordHash: data.passwordHash || null,
        role: data.role || 'user',
        isApproved: data.isApproved ?? false,
        note: data.note || null,
        temporaryPasswordAssigned: data.temporaryPasswordAssigned ?? false,
      })
      .returning();
    localStore.createUser(data);
    return inserted[0];
  } catch (error) {
    noteDbError('createUserDb', error);
    return localStore.createUser(data);
  }
}

export async function updateUserDb(
  userId: string | number,
  updates: {
    username?: string;
    email?: string;
    passwordHash?: string;
    role?: string;
    isApproved?: boolean;
    note?: string;
    temporaryPasswordAssigned?: boolean;
    isSuspended?: boolean;
    suspendedReason?: string;
    adminNote?: string;
    chatBlocked?: boolean;
    colorAccent?: string;
    dailyListenLimit?: number | null;
    isLocked?: boolean;
    sessionVersion?: number;
    christmasMode?: boolean;
  }
) {
  if (!(await checkSqlAvailability())) {
    return localStore.updateUser(userId, updates);
  }
  try {
    const whereClause =
      typeof userId === 'number'
        ? eq(users.id, userId)
        : isNaN(Number(userId))
        ? eq(users.uid, userId)
        : or(eq(users.id, Number(userId)), eq(users.uid, userId));

    const updated = await db
      .update(users)
      .set(updates)
      .where(whereClause!)
      .returning();
    localStore.updateUser(userId, updates);
    return updated[0] || localStore.updateUser(userId, updates);
  } catch (error) {
    noteDbError('updateUserDb', error);
    return localStore.updateUser(userId, updates);
  }
}

export async function recordUserLoginDb(uid: string) {
  localStore.recordUserLogin(uid);
  if (!(await checkSqlAvailability())) return;
  try {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.uid, uid));
  } catch (_) { noteDbError('recordUserLoginDb', _); }
}

export async function recordUserSongListenedDb(uid: string, songSummary: string) {
  localStore.recordUserSongListened(uid, songSummary);
  if (!(await checkSqlAvailability())) return;
  try {
    await db
      .update(users)
      .set({
        lastSongListened: songSummary,
        lastSongListenedAt: new Date(),
      })
      .where(eq(users.uid, uid));
  } catch (_) { noteDbError('recordUserSongListenedDb', _); }
}

/** Consume one listen using an atomic Postgres upsert so simultaneous requests cannot exceed the cap. */
export async function consumeUserDailyListenDb(uid: string) {
  const usageDate = new Date().toISOString().slice(0, 10); // UTC day, consistent across app instances
  if (!(await checkSqlAvailability())) {
    if (getDatabaseHealth().configured) {
      throw new Error('Supabase is configured but unreachable, so the listen limit cannot be verified. Please try again shortly.');
    }
    return localStore.consumeDailyListen(uid, usageDate);
  }

  try {
    const result = await createPool().query(
      `WITH target AS (
         SELECT daily_listen_limit FROM users WHERE uid = $1
       ), bump AS (
         INSERT INTO user_daily_listen_usage (uid, usage_date, listens)
         SELECT $1, $2::date, 1 FROM target
         WHERE target.daily_listen_limit IS NULL OR target.daily_listen_limit > 0
         ON CONFLICT (uid, usage_date) DO UPDATE
           SET listens = user_daily_listen_usage.listens + 1
         WHERE (SELECT daily_listen_limit FROM target) IS NULL
            OR user_daily_listen_usage.listens < (SELECT daily_listen_limit FROM target)
         RETURNING listens
       )
       SELECT target.daily_listen_limit,
              COALESCE(bump.listens, (
                SELECT usage.listens FROM user_daily_listen_usage AS usage
                WHERE usage.uid = $1 AND usage.usage_date = $2::date
              ), 0)::integer AS listens_today,
              (bump.listens IS NOT NULL) AS allowed
       FROM target LEFT JOIN bump ON TRUE`,
      [uid, usageDate]
    );
    const row = result.rows[0];
    if (!row) return { allowed: false, listensToday: 0, limit: null as number | null };
    return {
      allowed: Boolean(row.allowed),
      listensToday: Number(row.listens_today || 0),
      limit: row.daily_listen_limit === null ? null : Number(row.daily_listen_limit),
    };
  } catch (error) {
    noteDbError('consumeUserDailyListenDb', error);
    // Fail closed on a configured SQL database error. Do not let an outage silently bypass limits.
    throw new Error('Could not verify today’s listen allowance. Please try again shortly.');
  }
}

/** Current UTC-day listen counts for rendering the admin user table. */
export async function getTodayUserDailyListenCountsDb(): Promise<Record<string, number>> {
  const usageDate = new Date().toISOString().slice(0, 10);
  if (!(await checkSqlAvailability())) return localStore.getDailyListenCounts(usageDate);
  try {
    const result = await createPool().query(
      'SELECT uid, listens FROM user_daily_listen_usage WHERE usage_date = $1::date',
      [usageDate]
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) counts[String(row.uid)] = Number(row.listens || 0);
    return counts;
  } catch (error) {
    noteDbError('getTodayUserDailyListenCountsDb', error);
    return localStore.getDailyListenCounts(usageDate);
  }
}

export async function deleteUserDb(uid: string) {
  localStore.deleteUser(uid);
  if (!(await checkSqlAvailability())) return true;
  try {
    await db.delete(users).where(eq(users.uid, uid));
    return true;
  } catch (_) {
    noteDbError('deleteUserDb', _);
    return true;
  }
}

// ----------------- SONGS -----------------
export async function getSongsDb() {
  if (!(await checkSqlAvailability())) {
    return localStore.getSongs();
  }
  try {
    const list = await db.select().from(songs).orderBy(desc(songs.addedAt));
    return list;
  } catch (error) {
    noteDbError('getSongsDb', error);
    return localStore.getSongs();
  }
}

/** Live radio must use the same durable song catalogue on every Render instance. */
export async function getSongsPersistentDb() {
  if (!(await checkSqlAvailability())) {
    throw new Error('The radio song catalogue is unavailable because the persistent database is disconnected.');
  }
  try {
    return await db.select().from(songs).orderBy(desc(songs.addedAt));
  } catch (error) {
    noteDbError('getSongsPersistentDb', error);
    throw new Error('Could not load the radio song catalogue from the persistent database.');
  }
}

/** Persist the exact media duration used by the radio scheduler; never accept a local-only update. */
export async function updateSongDurationExactDb(id: string, seconds: number) {
  const durationExact = Math.round(seconds * 1000) / 1000;
  if (!id || !Number.isFinite(durationExact) || durationExact < 5 || durationExact > 43200) {
    throw new Error('The decoded song duration is invalid.');
  }
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. Radio timing was not updated.');
  }
  try {
    const rows = await db.update(songs).set({
      duration: Math.round(durationExact),
      durationExact,
    }).where(eq(songs.id, id)).returning();
    if (!rows[0]) throw new Error('The current radio song no longer exists in the shared library.');
    localStore.updateSong(id, { duration: Math.round(durationExact), durationExact });
    return rows[0];
  } catch (error) {
    noteDbError('updateSongDurationExactDb', error);
    throw new Error(error instanceof Error ? error.message : 'Could not persist the exact radio song duration.');
  }
}

export async function getSongByIdDb(id: string) {
  if (!(await checkSqlAvailability())) {
    return localStore.getSongs().find((song: any) => song.id === id) || null;
  }
  try {
    const rows = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
    return rows[0] || null;
  } catch (error) {
    noteDbError('getSongByIdDb', error);
    return localStore.getSongs().find((song: any) => song.id === id) || null;
  }
}

export async function insertSongDb(songData: {
  id: string;
  title: string;
  artist: string;
  mediaCode?: string;
  album?: string;
  genre: string;
  tags?: string[];
  typeMood?: string;
  duration: number;
  durationExact?: number;
  audioUrl: string;
  coverUrl: string;
  addedAt: string;
  plays?: number;
  featured?: boolean;
  description?: string;
  isLimitedEdition?: boolean;
  limitedUntil?: string;
  autoRemoveOnExpire?: boolean;
  badgeType?: string;
  badgeMessage?: string;
  isPinned?: boolean;
  isDroppingSoon?: boolean;
  dropDate?: string;
  autoReleaseOnDrop?: boolean;
  hiddenFrom?: string[];
  isSpotlight?: boolean;
  spotlightOrder?: number;
  spotlightNote?: string;
  dailyPlays?: number;
  dailyPlaysResetDate?: string;
  weeklyPlays?: number;
  weeklyPlaysResetDate?: string;
  isScheduledForDeletion?: boolean;
  scheduledDeletionAt?: string;
}, requirePersistent = false) {
  if (!(await checkSqlAvailability())) {
    if (requirePersistent) throw new Error('The persistent database is unavailable. The song was not saved.');
    localStore.insertSong(songData);
    return songData;
  }
  try {
    const inserted = await db
      .insert(songs)
      .values({
        id: songData.id,
        title: songData.title.trim(),
        artist: songData.artist.trim(),
        mediaCode: songData.mediaCode || null,
        album: songData.album || null,
        genre: songData.genre.trim(),
        tags: songData.tags || [],
        typeMood: songData.typeMood || null,
        duration: songData.duration,
        durationExact: songData.durationExact ?? null,
        audioUrl: songData.audioUrl.trim(),
        coverUrl: songData.coverUrl.trim(),
        addedAt: songData.addedAt,
        plays: songData.plays ?? 0,
        featured: songData.featured ?? false,
        description: songData.description || null,
        isLimitedEdition: songData.isLimitedEdition ?? false,
        limitedUntil: songData.limitedUntil || null,
        autoRemoveOnExpire: songData.autoRemoveOnExpire ?? false,
        badgeType: songData.badgeType || null,
        badgeMessage: songData.badgeMessage || null,
        isPinned: songData.isPinned ?? false,
        isDroppingSoon: songData.isDroppingSoon ?? false,
        dropDate: songData.dropDate || null,
        autoReleaseOnDrop: songData.autoReleaseOnDrop ?? false,
        hiddenFrom: songData.hiddenFrom || [],
        isSpotlight: songData.isSpotlight ?? false,
        spotlightOrder: songData.spotlightOrder ?? 0,
        spotlightNote: songData.spotlightNote || null,
        dailyPlays: songData.dailyPlays ?? 0,
        dailyPlaysResetDate: songData.dailyPlaysResetDate || null,
        weeklyPlays: songData.weeklyPlays ?? 0,
        weeklyPlaysResetDate: songData.weeklyPlaysResetDate || null,
        isScheduledForDeletion: songData.isScheduledForDeletion ?? false,
        scheduledDeletionAt: songData.scheduledDeletionAt || null,
      })
      .returning();
  
    if (!inserted[0]) throw new Error('The database did not return the new song.');
    localStore.insertSong(inserted[0]);
    return inserted[0];
  } catch (error) {
    noteDbError('insertSongDb', error);
    throw error;
  }
}
export async function updateSongDb(id: string, updates: any) {
  localStore.updateSong(id, updates);
  if (!(await checkSqlAvailability())) {
    return localStore.updateSong(id, updates);
  }
  try {
    const updated = await db
      .update(songs)
      .set(updates)
      .where(eq(songs.id, id))
      .returning();
    return updated[0] || localStore.updateSong(id, updates);
  } catch (error) {
    noteDbError('updateSongDb', error);
    return localStore.updateSong(id, updates);
  }
}

export async function bulkUpdateSongsDb(
  songIds: string[],
  updates: Record<string, any>,
  tagOperation?: { action: 'add' | 'remove' | 'set'; tags: string[] }
) {
  const allowedColumns = new Set([
    'title', 'artist', 'album', 'genre', 'typeMood', 'duration',
    'featured', 'description', 'isLimitedEdition', 'limitedUntil', 'autoRemoveOnExpire',
    'badgeType', 'badgeMessage', 'isPinned', 'isDroppingSoon', 'dropDate', 'autoReleaseOnDrop',
    'hiddenFrom', 'isSpotlight', 'spotlightOrder', 'spotlightNote',
    'isScheduledForDeletion', 'scheduledDeletionAt',
  ]);
  const cleanUpdates: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (key === 'badgeCustomText') cleanUpdates.badgeMessage = value;
    else if (allowedColumns.has(key) && value !== undefined) cleanUpdates[key] = value;
  }

  const ids = Array.from(new Set(songIds.map(String).filter(Boolean)));
  if (!ids.length) return [];
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. No bulk changes were saved.');
  }

  const results: any[] = await db.transaction(async (tx) => {
    const existing = await tx.select().from(songs).where(inArray(songs.id, ids));
    const changed: any[] = [];
    for (const song of existing) {
      const updatePayload: Record<string, any> = { ...cleanUpdates };
      if (tagOperation) {
        const currentTags = Array.isArray(song.tags) ? [...song.tags] : [];
        const requested = Array.from(new Set((tagOperation.tags || []).map((tag) => String(tag).trim()).filter(Boolean)));
        if (tagOperation.action === 'set') updatePayload.tags = requested;
        else if (tagOperation.action === 'add') {
          const merged = new Map(currentTags.map((tag) => [String(tag).toLowerCase(), tag]));
          requested.forEach((tag) => merged.set(tag.toLowerCase(), tag));
          updatePayload.tags = Array.from(merged.values());
        } else if (tagOperation.action === 'remove') {
          const remove = new Set(requested.map((tag) => tag.toLowerCase()));
          updatePayload.tags = currentTags.filter((tag) => !remove.has(String(tag).toLowerCase()));
        }
      }
      if (Object.keys(updatePayload).length === 0) {
        changed.push(song);
        continue;
      }
      const updated = await tx.update(songs).set(updatePayload).where(eq(songs.id, song.id)).returning();
      if (updated[0]) changed.push(updated[0]);
    }
    return changed;
  });
  // Update the local cache only after the database writes have succeeded.
  for (const song of results) {
    localStore.updateSong(song.id, song);
  }
  return results;
}
export async function deleteSongDb(id: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. The song was not deleted.');
  }
  try {
    const deleted = await db.delete(songs).where(eq(songs.id, id)).returning({ id: songs.id });
    if (!deleted.length) throw new Error('Song not found.');
    localStore.deleteSong(id);
    return true;
  } catch (error) {
    noteDbError('deleteSongDb', error);
    throw error;
  }
}

export async function bulkDeleteSongsDb(songIds: string[]) {
  localStore.bulkDeleteSongs(songIds);
  if (!(await checkSqlAvailability())) return true;
  try {
    await db.delete(songs).where(inArray(songs.id, songIds));
    return true;
  } catch (error) {
    noteDbError('bulkDeleteSongsDb', error);
    return true;
  }
}

export async function incrementSongPlayDb(id: string, isAdmin: boolean = false) {
  const localRes = localStore.incrementSongPlay(id, isAdmin);
  if (!(await checkSqlAvailability())) {
    return localRes;
  }
  try {
    if (isAdmin) {
      const rows = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
      return rows[0] || localRes;
    }
    const updated = await db
      .update(songs)
      .set({
        plays: sql`${songs.plays} + 1`,
        dailyPlays: sql`${songs.dailyPlays} + 1`,
        weeklyPlays: sql`${songs.weeklyPlays} + 1`,
        lastPlayedAt: new Date().toISOString(),
      })
      .where(eq(songs.id, id))
      .returning();
    return updated[0] || localRes;
  } catch (error) {
    noteDbError('incrementSongPlayDb', error);
    return localRes;
  }
}

export async function resetSongPlaysDb(id: string) {
  localStore.resetSongPlays(id);
  if (!(await checkSqlAvailability())) return localStore.resetSongPlays(id);
  try {
    const updated = await db
      .update(songs)
      .set({
        plays: 0,
        dailyPlays: 0,
        weeklyPlays: 0,
      })
      .where(eq(songs.id, id))
      .returning();
    return updated[0] || localStore.resetSongPlays(id);
  } catch (error) {
    noteDbError('resetSongPlaysDb', error);
    return localStore.resetSongPlays(id);
  }
}

export async function bulkResetSongPlaysDb(ids?: string[]) {
  localStore.bulkResetSongPlays(ids);
  if (!(await checkSqlAvailability())) return true;
  try {
    if (ids && ids.length > 0) {
      await db
        .update(songs)
        .set({ plays: 0, dailyPlays: 0, weeklyPlays: 0 })
        .where(inArray(songs.id, ids));
    } else {
      await db.update(songs).set({ plays: 0, dailyPlays: 0, weeklyPlays: 0 });
    }
    return true;
  } catch (error) {
    noteDbError('bulkResetSongPlaysDb', error);
    return true;
  }
}

export async function initDatabaseSchemaExtensions() {
  return true;
}

// ----------------- PLAYLISTS -----------------
export async function getPlaylistsDb(userId?: string) {
  if (!(await checkSqlAvailability())) {
    return localStore.getPlaylists(userId);
  }
  try {
    if (userId) {
      return await db.select().from(playlists).where(eq(playlists.userId, userId));
    }
    return await db.select().from(playlists);
  } catch (error) {
    noteDbError('getPlaylistsDb', error);
    return localStore.getPlaylists(userId);
  }
}

export async function createPlaylistDb(data: {
  id: string;
  userId: string;
  name: string;
  description?: string;
  coverUrl?: string;
  songIds?: string[];
  createdAt: string;
}) {
  localStore.createPlaylist(data);
  if (!(await checkSqlAvailability())) {
    return data;
  }
  try {
    const inserted = await db
      .insert(playlists)
      .values({
        id: data.id,
        userId: data.userId,
        name: data.name,
        description: data.description || null,
        coverUrl: data.coverUrl || null,
        songIds: data.songIds || [],
        createdAt: data.createdAt,
      })
      .returning();
    return inserted[0] || data;
  } catch (error) {
    noteDbError('createPlaylistDb', error);
    return data;
  }
}

export async function updatePlaylistDb(id: string, updates: any) {
  localStore.updatePlaylist(id, updates);
  if (!(await checkSqlAvailability())) {
    return localStore.updatePlaylist(id, updates);
  }
  try {
    const updated = await db
      .update(playlists)
      .set(updates)
      .where(eq(playlists.id, id))
      .returning();
    return updated[0] || localStore.updatePlaylist(id, updates);
  } catch (error) {
    noteDbError('updatePlaylistDb', error);
    return localStore.updatePlaylist(id, updates);
  }
}

export async function deletePlaylistDb(id: string) {
  localStore.deletePlaylist(id);
  if (!(await checkSqlAvailability())) return true;
  try {
    await db.delete(playlists).where(eq(playlists.id, id));
    return true;
  } catch (error) {
    noteDbError('deletePlaylistDb', error);
    return true;
  }
}

// ----------------- FAVORITES -----------------
export async function getFavoritesDb(userId: string): Promise<string[]> {
  if (!(await checkSqlAvailability())) {
    return localStore.getFavorites(userId);
  }
  try {
    const rows = await db.select().from(favorites).where(eq(favorites.userId, userId));
    return rows.map((r) => r.songId);
  } catch (error) {
    noteDbError('getFavoritesDb', error);
    return localStore.getFavorites(userId);
  }
}

export async function toggleFavoriteDb(userId: string, songId: string): Promise<boolean> {
  const localResult = localStore.toggleFavorite(userId, songId);
  if (!(await checkSqlAvailability())) {
    return localResult;
  }
  try {
    const existing = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.songId, songId)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(favorites).where(eq(favorites.id, existing[0].id));
      return false;
    } else {
      await db.insert(favorites).values({ userId, songId });
      return true;
    }
  } catch (error) {
    noteDbError('toggleFavoriteDb', error);
    return localResult;
  }
}

// ----------------- SONG REQUESTS & PIPELINE -----------------
export async function cleanupExpiredSongRequestsDb(): Promise<number> {
  return localStore.cleanupExpiredSongRequests();
}

export async function getRequestsDb() {
  if (!(await checkSqlAvailability())) {
    return localStore.getRequests();
  }
  try {
    await cleanupExpiredSongRequestsDb();
    return await db.select().from(songRequests).orderBy(desc(songRequests.createdAt));
  } catch (error) {
    noteDbError('getRequestsDb', error);
    return localStore.getRequests();
  }
}

/** Request queue reads used by the admin pipeline must never return a process-local shadow copy. */
export async function getRequestsPersistentDb() {
  if (!(await checkSqlAvailability())) {
    throw new Error('Song requests are unavailable because the persistent database is disconnected.');
  }
  try {
    await cleanupExpiredSongRequestsDb();
    return await db.select().from(songRequests).orderBy(desc(songRequests.createdAt));
  } catch (error) {
    noteDbError('getRequestsPersistentDb', error);
    throw new Error('Could not load song requests from the persistent database.');
  }
}

export async function getRequestByIdPersistentDb(id: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('Song requests are unavailable because the persistent database is disconnected.');
  }
  try {
    const rows = await db.select().from(songRequests).where(eq(songRequests.id, id)).limit(1);
    return rows[0] || null;
  } catch (error) {
    noteDbError('getRequestByIdPersistentDb', error);
    throw new Error('Could not read the request from the persistent database.');
  }
}

export async function getRequestByIdDb(id: string) {
  if (!(await checkSqlAvailability())) {
    return localStore.getRequestById(id);
  }
  try {
    const rows = await db.select().from(songRequests).where(eq(songRequests.id, id)).limit(1);
    return rows[0] || localStore.getRequestById(id);
  } catch (error) {
    noteDbError('getRequestByIdDb', error);
    return localStore.getRequestById(id);
  }
}

export async function createRequestDb(data: {
  id: string;
  songTitle: string;
  artist?: string;
  webLink?: string;
  coverUrl?: string;
  notes?: string;
  requestedByUserId?: string;
  requestedByUsername: string;
  createdAt: string;
  status?: string;
  adminNote?: string;
  requestType?: string;
  genre?: string;
}) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. The request was not saved.');
  }
  try {
    const inserted = await db
      .insert(songRequests)
      .values({
        id: data.id,
        songTitle: data.songTitle,
        artist: data.artist || null,
        webLink: data.webLink || null,
        coverUrl: null,
        notes: data.notes || null,
        requestedByUserId: data.requestedByUserId || null,
        requestedByUsername: data.requestedByUsername,
        createdAt: data.createdAt,
        status: data.status || 'pending',
        adminNote: data.adminNote || null,
        requestType: data.requestType || 'song',
        genre: data.genre || 'Vibe / Chill',
      })
      .returning();
    if (!inserted[0]) throw new Error('The database did not return the new song request.');
    localStore.createRequest(inserted[0]);
    return inserted[0];
  } catch (error) {
    noteDbError('createRequestDb', error);
    throw error;
  }
}

export async function updateRequestFullDb(
  id: string,
  updates: {
    songTitle?: string;
    artist?: string | null;
    mediaCode?: string | null;
    webLink?: string | null;
    coverUrl?: string | null;
    notes?: string | null;
    status?: string;
    adminNote?: string | null;
    reviewedAt?: string | null;
    approvedAt?: string | null;
    estimatedUploadAt?: string | null;
    audioUrl?: string | null;
    driveFileId?: string | null;
    driveFolderId?: string | null;
    duration?: number | null;
    genre?: string;
    stagingAudioUrl?: string | null;
    publishedSongId?: string | null;
    publishedAt?: string | null;
    processingProgress?: string | null;
    processingError?: string | null;
  }
) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. The request update was not saved.');
  }
  try {
    const updated = await db
      .update(songRequests)
      .set({ ...updates })
      .where(eq(songRequests.id, id))
      .returning();
    if (!updated[0]) throw new Error('Song request not found or no longer available.');
    localStore.updateRequestFull(id, updates);
    return updated[0];
  } catch (error) {
    noteDbError('updateRequestFullDb', error);
    throw error;
  }
}

/**
 * Publish a staged song request as one atomic database transaction. Retrying the
 * endpoint cannot create duplicate library songs or leave the request halfway published.
 */
export async function publishStagedSongRequestDb(requestId: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. The song was not published.');
  }
  try {
    const publication = await db.transaction(async (tx) => {
      const locked = await tx.select().from(songRequests)
        .where(eq(songRequests.id, requestId)).for('update').limit(1);
      const request = locked[0];
      if (!request) throw new Error('Song request not found.');

      if (request.status === 'published' && request.publishedSongId) {
        const existing = await tx.select().from(songs)
          .where(eq(songs.id, request.publishedSongId)).limit(1);
        if (!existing[0]) throw new Error('This request is marked published, but its library song is missing. Do not retry until the database is reviewed.');
        return { request, song: existing[0], alreadyPublished: true };
      }
      if (request.status !== 'staging') {
        throw new Error('Only a staged request with an uploaded MP3 can be published.');
      }

      const audioFileId = String(request.driveFileId || '').trim();
      const coverUrl = String(request.coverUrl || '').trim();
      const artworkFileId = coverUrl.match(/\/d\/([A-Za-z0-9_-]+)/i)?.[1] || '';
      const mediaCode = String(request.mediaCode || '').trim();
      if (!audioFileId || !artworkFileId || !/^[0-9]{3}$/.test(mediaCode) || !request.audioUrl) {
        throw new Error('This staged request is missing its Drive audio, Drive artwork, or Media ID. Upload the files again before publishing.');
      }

      const songId = 'song-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const title = String(request.songTitle || '').trim();
      const artist = String(request.artist || 'Unknown Artist').trim() || 'Unknown Artist';
      if (!title) throw new Error('A song title is required before publishing.');
      const addedAt = new Date().toISOString();
      const inserted = await tx.insert(songs).values({
        id: songId,
        title,
        artist,
        mediaCode,
        album: 'YouSong Community',
        genre: String(request.genre || 'Vibe / Chill').trim() || 'Vibe / Chill',
        duration: Math.max(5, Number(request.duration) || 180),
        durationExact: Number(request.duration) > 0 ? Number(request.duration) : null,
        audioUrl: String(request.audioUrl),
        coverUrl,
        addedAt,
        plays: 0,
        featured: false,
        description: `Requested by ${request.requestedByUsername} via YouSong Pipeline.`,
        tags: [String(request.genre || 'vibe').toLowerCase(), 'community', 'drive-mp3'],
      }).returning();
      if (!inserted[0]) throw new Error('The database did not confirm the new library song.');

      const now = new Date();
      await tx.insert(mediaIds).values({
        code: mediaCode,
        status: 'assigned',
        songId,
        requestId: null,
        title: inserted[0].title,
        artist: inserted[0].artist,
        audioFileId,
        artworkFileId,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: mediaIds.code,
        set: {
          status: 'assigned',
          songId,
          requestId: null,
          title: inserted[0].title,
          artist: inserted[0].artist,
          audioFileId,
          artworkFileId,
          updatedAt: now,
        },
      });

      const publishedAt = now.toISOString();
      const updated = await tx.update(songRequests).set({
        status: 'published',
        publishedSongId: songId,
        publishedAt,
        processingProgress: 'Published. Audio streams directly from Google Drive.',
        processingError: null,
      }).where(eq(songRequests.id, requestId)).returning();
      if (!updated[0]) throw new Error('The song was added, but the request record could not be updated. The transaction was rolled back.');
      return { request: updated[0], song: inserted[0], alreadyPublished: false };
    });
    if (!publication.alreadyPublished) {
      localStore.insertSong(publication.song);
      localStore.updateRequestFull(requestId, {
        status: 'published',
        publishedSongId: publication.song.id,
        publishedAt: publication.request.publishedAt,
        processingProgress: 'Published. Audio streams directly from Google Drive.',
        processingError: null,
      });
    }
    return publication;
  } catch (error) {
    noteDbError('publishStagedSongRequestDb', error);
    throw error;
  }
}

/** Undo publication without deleting the Drive files; all database rows change together. */
export async function unpublishSongRequestDb(requestId: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. The song was not unpublished.');
  }
  try {
    const publication = await db.transaction(async (tx) => {
      const locked = await tx.select().from(songRequests)
        .where(eq(songRequests.id, requestId)).for('update').limit(1);
      const request = locked[0];
      if (!request) throw new Error('Song request not found.');
      if (request.status === 'staging' && !request.publishedSongId) return request;
      if (request.status !== 'published' || !request.publishedSongId) {
        throw new Error('Only a published request can be unpublished.');
      }

      await tx.delete(songs).where(eq(songs.id, request.publishedSongId));
      const mediaCode = String(request.mediaCode || '').trim();
      if (/^[0-9]{3}$/.test(mediaCode)) {
        const now = new Date();
        await tx.insert(mediaIds).values({
          code: mediaCode,
          status: 'reserved',
          songId: null,
          requestId,
          title: request.songTitle,
          artist: request.artist || 'Unknown Artist',
          audioFileId: request.driveFileId || null,
          artworkFileId: String(request.coverUrl || '').match(/\/d\/([A-Za-z0-9_-]+)/i)?.[1] || null,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: mediaIds.code,
          set: {
            status: 'reserved',
            songId: null,
            requestId,
            title: request.songTitle,
            artist: request.artist || 'Unknown Artist',
            audioFileId: request.driveFileId || null,
            artworkFileId: String(request.coverUrl || '').match(/\/d\/([A-Za-z0-9_-]+)/i)?.[1] || null,
            updatedAt: now,
          },
        });
      }

      const updated = await tx.update(songRequests).set({
        status: 'staging',
        publishedSongId: null,
        publishedAt: null,
        processingProgress: 'Unpublished; MP3 remains in staging.',
        processingError: null,
      }).where(eq(songRequests.id, requestId)).returning();
      if (!updated[0]) throw new Error('The request could not be restored to staging.');
      return updated[0];
    });
    if (publication.publishedSongId) localStore.deleteSong(publication.publishedSongId);
    localStore.updateRequestFull(requestId, {
      status: 'staging',
      publishedSongId: null,
      publishedAt: null,
      processingProgress: 'Unpublished; MP3 remains in staging.',
      processingError: null,
    });
    return publication;
  } catch (error) {
    noteDbError('unpublishSongRequestDb', error);
    throw error;
  }
}

export async function updateRequestDb(id: string, status: string, adminNote?: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. The request status was not saved.');
  }
  try {
    const updates: any = { status };
    if (adminNote !== undefined) updates.adminNote = adminNote;
    if (['approved', 'declined', 'staging', 'published'].includes(status)) {
      updates.reviewedAt = new Date().toISOString();
    }
    const updated = await db
      .update(songRequests)
      .set(updates)
      .where(eq(songRequests.id, id))
      .returning();
    if (!updated[0]) throw new Error('Song request not found or no longer available.');
    localStore.updateRequest(id, status, adminNote);
    return updated[0];
  } catch (error) {
    noteDbError('updateRequestDb', error);
    throw error;
  }
}

export async function deleteRequestDb(id: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. The request was not deleted.');
  }
  try {
    const deleted = await db.delete(songRequests).where(eq(songRequests.id, id)).returning({ id: songRequests.id });
    if (!deleted.length) throw new Error('Song request not found.');
    localStore.deleteRequest(id);
    return true;
  } catch (error) {
    noteDbError('deleteRequestDb', error);
    throw error;
  }
}

// ----------------- POPUPS -----------------
export async function getPopupsDb() {
  if (!(await checkSqlAvailability())) {
    return localStore.getPopups();
  }
  try {
    const list = await db.select().from(popups).orderBy(desc(popups.createdAt));
    return list;
  } catch (error) {
    noteDbError('getPopupsDb', error);
    return localStore.getPopups();
  }
}

export async function cleanupExpiredPopupsDb(): Promise<number> {
  return localStore.cleanupExpiredPopups();
}

export async function purgeWelcomePopupsDb(): Promise<void> {
  localStore.purgeWelcomePopups();
  if (!(await checkSqlAvailability())) return;
  try {
    const list = await db.select().from(popups);
    const toDelete: string[] = [];
    for (const p of list) {
      const titleLower = (p.title || '').toLowerCase();
      const msgLower = (p.message || '').toLowerCase();
      if (
        titleLower.includes('welcome') ||
        titleLower.includes('getting started') ||
        msgLower.includes('welcome to yousong') ||
        msgLower.includes('explore school-friendly')
      ) {
        toDelete.push(p.id);
      }
    }
    if (toDelete.length > 0) {
      await db.delete(popups).where(inArray(popups.id, toDelete));
    }
  } catch (_) { noteDbError('purgeWelcomePopupsDb', _); }
}

export async function createPopupDb(data: {
  id: string;
  targetUserId: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  active?: boolean;
  expiresAt?: Date | null;
  isDismissible?: boolean;
}) {
  localStore.createPopup(data);
  if (!(await checkSqlAvailability())) return localStore.createPopup(data);
  try {
    const inserted = await db
      .insert(popups)
      .values({
        id: data.id,
        targetUserId: data.targetUserId,
        title: data.title,
        message: data.message,
        type: data.type,
        createdAt: data.createdAt,
        active: data.active ?? true,
        expiresAt: data.expiresAt || null,
        isDismissible: data.isDismissible ?? true,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    noteDbError('createPopupDb', error);
    return localStore.createPopup(data);
  }
}

export async function updatePopupDb(id: string, active: boolean) {
  localStore.updatePopup(id, active);
  if (!(await checkSqlAvailability())) return localStore.updatePopup(id, active);
  try {
    const updated = await db
      .update(popups)
      .set({ active })
      .where(eq(popups.id, id))
      .returning();
    return updated[0];
  } catch (error) {
    noteDbError('updatePopupDb', error);
    return localStore.updatePopup(id, active);
  }
}

export async function deletePopupDb(id: string) {
  localStore.deletePopup(id);
  if (!(await checkSqlAvailability())) return true;
  try {
    await db.delete(popups).where(eq(popups.id, id));
    return true;
  } catch (error) {
    noteDbError('deletePopupDb', error);
    return true;
  }
}


/** Recent station chat messages, ordered oldest-to-newest for the client. */
/** Radio chat is shared across Render instances; never return process-local phantom messages. */
export async function getRadioChatMessagesDb(limit = 60) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 60));
  if (!(await checkSqlAvailability())) {
    throw new Error('Radio chat is unavailable because the persistent database is disconnected.');
  }
  try {
    const rows = await db.select().from(radioChatMessages)
      .orderBy(desc(radioChatMessages.createdAt)).limit(safeLimit);
    return rows.reverse().map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.username,
      message: row.message,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    }));
  } catch (error) {
    noteDbError('getRadioChatMessagesDb', error);
    throw new Error('Could not load radio chat messages from the persistent database.');
  }
}

export async function clearRadioChatMessagesDb() {
  if (!(await checkSqlAvailability())) {
    throw new Error('Radio chat cannot be cleared because the persistent database is disconnected.');
  }
  try {
    await db.delete(radioChatMessages);
    return true;
  } catch (error) {
    noteDbError('clearRadioChatMessagesDb', error);
    throw new Error('Could not clear persistent radio chat messages.');
  }
}

export async function createRadioChatMessageDb(data: {
  id: string; userId: string; username: string; message: string;
}) {
  if (!(await checkSqlAvailability())) {
    throw new Error('Radio chat is unavailable because the persistent database is disconnected. Your message was not sent.');
  }
  try {
    const rows = await db.insert(radioChatMessages).values(data).returning();
    const row = rows[0];
    if (!row) throw new Error('The database did not confirm your message.');
    return {
      id: row.id,
      userId: row.userId,
      username: row.username,
      message: row.message,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    };
  } catch (error) {
    noteDbError('createRadioChatMessageDb', error);
    throw new Error(error instanceof Error ? error.message : 'Could not send your radio chat message.');
  }
}

/** Strict persistent radio-moderation reads. A disconnected database is an error, not an empty ban list. */
export async function listRadioChatBansDb() {
  if (!(await checkSqlAvailability())) {
    throw new Error('Radio moderation is unavailable because the persistent database is disconnected. No moderation changes were applied.');
  }
  try {
    return await db.select().from(radioChatBans).orderBy(desc(radioChatBans.createdAt));
  } catch (error) {
    noteDbError('listRadioChatBansDb', error);
    throw new Error('Could not read the persistent radio ban list.');
  }
}

export async function getRadioChatBanDb(userId: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('Radio moderation is unavailable because the persistent database is disconnected.');
  }
  try {
    const rows = await db.select().from(radioChatBans).where(eq(radioChatBans.userId, userId)).limit(1);
    return rows[0] || null;
  } catch (error) {
    noteDbError('getRadioChatBanDb', error);
    throw new Error('Could not verify radio chat permissions.');
  }
}

export async function upsertRadioChatBanDb(data: {
  userId: string; username: string; reason?: string | null; bannedBy: string;
}) {
  if (!(await checkSqlAvailability())) {
    throw new Error('Radio moderation is unavailable because the persistent database is disconnected. The user was not banned.');
  }
  try {
    const now = new Date();
    const rows = await db.insert(radioChatBans).values({
      userId: data.userId,
      username: data.username,
      reason: data.reason || null,
      bannedBy: data.bannedBy,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: radioChatBans.userId,
      set: {
        username: data.username,
        reason: data.reason || null,
        bannedBy: data.bannedBy,
        updatedAt: now,
      },
    }).returning();
    if (!rows[0]) throw new Error('The database did not confirm the ban.');
    return rows[0];
  } catch (error) {
    noteDbError('upsertRadioChatBanDb', error);
    throw new Error(error instanceof Error ? error.message : 'Could not save the radio ban.');
  }
}

export async function deleteRadioChatBanDb(userId: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('Radio moderation is unavailable because the persistent database is disconnected. The ban was not removed.');
  }
  try {
    const rows = await db.delete(radioChatBans).where(eq(radioChatBans.userId, userId)).returning({ userId: radioChatBans.userId });
    return rows.length > 0;
  } catch (error) {
    noteDbError('deleteRadioChatBanDb', error);
    throw new Error('Could not remove the persistent radio ban.');
  }
}

// ----------------- SYSTEM SETTINGS -----------------
// Older versions wrote plain strings to system_settings but always attempted JSON.parse
// while reading them. That made encrypted OAuth refresh tokens appear to be missing after
// a process restart and silently fall back to Render's ephemeral local store. Accept both
// legacy raw strings and JSON-serialized values so existing rows remain readable.
function parseStoredSetting(raw: string): any {
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function getSettingDb<T = any>(key: string): Promise<T | null> {
  if (!(await checkSqlAvailability())) {
    return localStore.getSetting(key) as T;
  }
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (!rows[0]) return localStore.getSetting(key) as T;
    return parseStoredSetting(rows[0].value) as T;
  } catch (error) {
    noteDbError('getSettingDb', error);
    return localStore.getSetting(key) as T;
  }
}

export async function setSettingDb(key: string, value: any) {
  localStore.setSetting(key, value);
  if (!(await checkSqlAvailability())) return value;
  try {
    const serialized = JSON.stringify(value);
    const stringified = serialized === undefined ? 'null' : serialized;
    await db
      .insert(systemSettings)
      .values({ key, value: stringified, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stringified, updatedAt: new Date() },
      });
    return value;
  } catch (error) {
    noteDbError('setSettingDb', error);
    return value;
  }
}

// OAuth refresh tokens and OAuth state must never be stored only in Render's local file
// fallback. These strict helpers require PostgreSQL/Supabase and fail instead of claiming
// the Drive connection is saved when the database is unavailable.
export async function getPersistentSettingDb<T = any>(key: string): Promise<T | null> {
  if (!(await checkSqlAvailability())) {
    throw new Error('Persistent PostgreSQL/Supabase storage is unavailable. Check DATABASE_URL or SUPABASE_DB_URL; the site Google Drive connection cannot be safely loaded from Render local storage.');
  }
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return rows[0] ? (parseStoredSetting(rows[0].value) as T) : null;
  } catch (error) {
    noteDbError('getPersistentSettingDb', error);
    throw new Error('Could not read the saved Google Drive connection from PostgreSQL/Supabase. Check the system_settings table and database connection.');
  }
}

export async function setPersistentSettingDb(key: string, value: any): Promise<void> {
  if (!(await checkSqlAvailability())) {
    throw new Error('Persistent PostgreSQL/Supabase storage is unavailable. Connect the database before linking Google Drive.');
  }
  const serialized = JSON.stringify(value);
  const stringified = serialized === undefined ? 'null' : serialized;
  try {
    await db
      .insert(systemSettings)
      .values({ key, value: stringified, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: stringified, updatedAt: new Date() },
      });
    const rows = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (!rows[0] || rows[0].value !== stringified) {
      throw new Error('Database did not confirm the saved setting.');
    }
  } catch (error) {
    noteDbError('setPersistentSettingDb', error);
    throw new Error('Could not persist the Google Drive connection in PostgreSQL/Supabase. No local-only connection was created.');
  }
}

// ----------------- ADMIN MEDIA ID REGISTRY -----------------
export async function getMediaIdsDb() {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. Media IDs cannot be managed safely.');
  }
  return db.select().from(mediaIds).orderBy(asc(mediaIds.code));
}

export async function getMediaIdByCodeDb(code: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. Media IDs cannot be managed safely.');
  }
  const rows = await db.select().from(mediaIds).where(eq(mediaIds.code, code)).limit(1);
  return rows[0] || null;
}

/** Atomically claims a code. The primary key prevents simultaneous admins from claiming it twice. */
export async function reserveMediaIdDb(code: string): Promise<boolean> {
  if (!/^[0-9]{3}$/.test(code)) throw new Error('Media IDs must contain exactly three digits.');
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. Media IDs cannot be reserved safely.');
  }
  const rows = await db.insert(mediaIds)
    .values({ code, status: 'reserved', updatedAt: new Date() })
    .onConflictDoNothing({ target: mediaIds.code })
    .returning({ code: mediaIds.code });
  return rows.length > 0;
}

/** Release a reservation created by a failed upload; never delete an assigned or another request's ID. */
export async function releaseUnusedMediaIdReservationDb(code: string, requestId?: string) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. Media ID reservation could not be cleaned up.');
  }
  try {
    const rows = await db.select().from(mediaIds).where(eq(mediaIds.code, code)).limit(1);
    const record = rows[0];
    if (!record || record.status !== 'reserved' || record.songId) return false;
    if (record.requestId && record.requestId !== requestId) return false;
    const deleted = await db.delete(mediaIds)
      .where(eq(mediaIds.code, code))
      .returning({ code: mediaIds.code });
    return deleted.length > 0;
  } catch (error) {
    noteDbError('releaseUnusedMediaIdReservationDb', error);
    throw new Error('Could not safely release the unused Media ID reservation.');
  }
}

/**
 * Complete a Drive upload in one transaction: bind its reserved Media ID and move
 * the approved request into staging together, or persist neither change.
 */
export async function stageSongRequestMediaDb(
  requestId: string,
  media: {
    code: string;
    title: string;
    artist: string;
    audioFileId: string;
    artworkFileId: string;
  },
  requestUpdates: Partial<typeof songRequests.$inferInsert>,
) {
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. The uploaded media was not attached to the request.');
  }
  if (!/^[0-9]{3}$/.test(media.code)) throw new Error('Media IDs must contain exactly three digits.');
  try {
    const updated = await db.transaction(async (tx) => {
      const locked = await tx.select().from(songRequests)
        .where(eq(songRequests.id, requestId)).for('update').limit(1);
      const request = locked[0];
      if (!request) throw new Error('Song request not found.');
      if (request.status !== 'approved') throw new Error('This request is no longer approved for upload. Refresh the pipeline before retrying.');

      const reservedRows = await tx.select().from(mediaIds)
        .where(eq(mediaIds.code, media.code)).for('update').limit(1);
      const reservation = reservedRows[0];
      if (!reservation || reservation.status !== 'reserved' || reservation.songId
        || (reservation.requestId && reservation.requestId !== requestId)) {
        throw new Error('The selected Media ID is no longer reserved for this upload. Try the upload again.');
      }

      const now = new Date();
      const mediaRows = await tx.update(mediaIds).set({
        status: 'reserved',
        songId: null,
        requestId,
        title: media.title,
        artist: media.artist,
        audioFileId: media.audioFileId,
        artworkFileId: media.artworkFileId,
        updatedAt: now,
      }).where(eq(mediaIds.code, media.code)).returning();
      if (!mediaRows[0]) throw new Error('The Media ID reservation could not be attached to this request.');

      const requestRows = await tx.update(songRequests).set({
        ...requestUpdates,
        status: 'staging',
        mediaCode: media.code,
      }).where(eq(songRequests.id, requestId)).returning();
      if (!requestRows[0] || requestRows[0].status !== 'staging') {
        throw new Error('The request could not be moved into staging. The database rolled back the Media ID update.');
      }
      return requestRows[0];
    });
    localStore.updateRequestFull(requestId, requestUpdates);
    localStore.updateRequestFull(requestId, { status: 'staging', mediaCode: media.code });
    return updated;
  } catch (error) {
    noteDbError('stageSongRequestMediaDb', error);
    throw error;
  }
}

export async function saveMediaIdDb(record: {
  code: string;
  status: 'reserved' | 'assigned' | 'retired';
  songId?: string | null;
  requestId?: string | null;
  title?: string | null;
  artist?: string | null;
  audioFileId?: string | null;
  artworkFileId?: string | null;
}) {
  if (!/^[0-9]{3}$/.test(record.code)) throw new Error('Media IDs must contain exactly three digits.');
  if (!(await checkSqlAvailability())) {
    throw new Error('The persistent database is unavailable. Media ID changes were not saved.');
  }
  const values = {
    code: record.code,
    status: record.status,
    songId: record.songId ?? null,
    requestId: record.requestId ?? null,
    title: record.title ?? null,
    artist: record.artist ?? null,
    audioFileId: record.audioFileId ?? null,
    artworkFileId: record.artworkFileId ?? null,
    updatedAt: new Date(),
  };
  const rows = await db.insert(mediaIds).values(values)
    .onConflictDoUpdate({
      target: mediaIds.code,
      set: {
        status: values.status,
        songId: values.songId,
        requestId: values.requestId,
        title: values.title,
        artist: values.artist,
        audioFileId: values.audioFileId,
        artworkFileId: values.artworkFileId,
        updatedAt: values.updatedAt,
      },
    }).returning();
  return rows[0] || null;
}

// ----------------- MEDIA FILES -----------------
export async function saveMediaFileDb(
  id: string,
  data: string,
  mimeType: string = 'audio/mpeg',
  size: number = 0
) {
  localStore.saveMediaFile(id, data, mimeType, size);
  if (!(await checkSqlAvailability())) return;
  try {
    await db
      .insert(mediaFiles)
      .values({ id, data, mimeType, size, createdAt: new Date() })
      .onConflictDoUpdate({
        target: mediaFiles.id,
        set: { data, mimeType, size, createdAt: new Date() },
      });
  } catch (_) { noteDbError('saveMediaFileDb', _); }
}

export async function getMediaFileDb(id: string) {
  if (!(await checkSqlAvailability())) {
    return localStore.getMediaFile(id);
  }
  try {
    const rows = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
    return rows[0] || localStore.getMediaFile(id);
  } catch (_) {
    noteDbError('getMediaFileDb', _);
    return localStore.getMediaFile(id);
  }
}

// ----------------- CHAT SYSTEM QUERIES -----------------
export async function getChatRequestsDb() {
  if (!(await checkSqlAvailability())) return localStore.getChatRequests();
  try {
    return await db.select().from(chatRequests).orderBy(desc(chatRequests.createdAt));
  } catch (e) {
    noteDbError('getChatRequestsDb', e);
    return localStore.getChatRequests();
  }
}

export async function getChatRequestsForUserDb(userId: string) {
  if (!(await checkSqlAvailability())) return localStore.getChatRequestsForUser(userId);
  try {
    return await db
      .select()
      .from(chatRequests)
      .where(or(eq(chatRequests.senderId, userId), eq(chatRequests.receiverId, userId)))
      .orderBy(desc(chatRequests.createdAt));
  } catch (e) {
    noteDbError('getChatRequestsForUserDb', e);
    return localStore.getChatRequestsForUser(userId);
  }
}

export async function getChatRequestByIdDb(id: string) {
  const all = await getChatRequestsDb();
  return (all as any[]).find((r) => r.id === id) || null;
}

export async function createChatRequestDb(data: {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  receiverUsername: string;
  reason?: string;
}) {
  if (!(await checkSqlAvailability())) return localStore.createChatRequest(data);
  try {
    const inserted = await db
      .insert(chatRequests)
      .values({
        id: data.id,
        senderId: data.senderId,
        senderUsername: data.senderUsername,
        receiverId: data.receiverId,
        receiverUsername: data.receiverUsername,
        reason: data.reason || null,
        status: 'pending',
      })
      .returning();
    return inserted[0];
  } catch (e) {
    noteDbError('createChatRequestDb', e);
    return localStore.createChatRequest(data);
  }
}

export async function updateChatRequestStatusDb(
  id: string,
  status: 'pending' | 'approved' | 'declined',
  adminNote?: string
) {
  localStore.updateChatRequestStatus(id, status, adminNote);
  if (!(await checkSqlAvailability())) return localStore.updateChatRequestStatus(id, status, adminNote);
  try {
    const updated = await db
      .update(chatRequests)
      .set({
        status,
        adminNote: adminNote || null,
        reviewedAt: new Date(),
      })
      .where(eq(chatRequests.id, id))
      .returning();
    return updated[0];
  } catch (e) {
    noteDbError('updateChatRequestStatusDb', e);
    return localStore.updateChatRequestStatus(id, status, adminNote);
  }
}

export async function deleteChatRequestDb(id: string) {
  localStore.deleteChatRequest(id);
  if (!(await checkSqlAvailability())) return true;
  try {
    await db.delete(chatRequests).where(eq(chatRequests.id, id));
    return true;
  } catch (e) {
    noteDbError('deleteChatRequestDb', e);
    return true;
  }
}

export async function getChatThreadsDb() {
  if (!(await checkSqlAvailability())) return localStore.getChatThreads();
  try {
    return await db.select().from(chatThreads).orderBy(desc(chatThreads.lastMessageAt));
  } catch (e) {
    noteDbError('getChatThreadsDb', e);
    return localStore.getChatThreads();
  }
}

export async function getChatThreadsForUserDb(userId: string) {
  if (!(await checkSqlAvailability())) return localStore.getChatThreadsForUser(userId);
  try {
    const all = await db
      .select()
      .from(chatThreads)
      .where(or(eq(chatThreads.user1Id, userId), eq(chatThreads.user2Id, userId)))
      .orderBy(desc(chatThreads.lastMessageAt));
    return all.filter((t) => !(t.hiddenByUserIds || []).includes(userId));
  } catch (e) {
    noteDbError('getChatThreadsForUserDb', e);
    return localStore.getChatThreadsForUser(userId);
  }
}

export async function hideChatThreadForUserDb(threadId: string, userId: string) {
  localStore.hideChatThreadForUser(threadId, userId);
  if (!(await checkSqlAvailability())) return true;
  try {
    const thread = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
    if (!thread[0]) return false;
    const currentHidden = Array.isArray(thread[0].hiddenByUserIds) ? [...thread[0].hiddenByUserIds] : [];
    if (!currentHidden.includes(userId)) {
      currentHidden.push(userId);
      await db
        .update(chatThreads)
        .set({ hiddenByUserIds: currentHidden })
        .where(eq(chatThreads.id, threadId));
    }
    return true;
  } catch (e) {
    noteDbError('hideChatThreadForUserDb', e);
    return true;
  }
}

export async function createOrGetAppealThreadDb(userId: string, username: string) {
  return createOrForceChatThreadDb(userId, username, 'admin', 'Administrator', true);
}

export async function getChatThreadByIdDb(threadId: string) {
  if (!(await checkSqlAvailability())) return localStore.getChatThreadById(threadId);
  try {
    const rows = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
    return rows[0] || localStore.getChatThreadById(threadId);
  } catch (e) {
    noteDbError('getChatThreadByIdDb', e);
    return localStore.getChatThreadById(threadId);
  }
}

export async function createOrForceChatThreadDb(
  user1Id: string,
  user1Username: string,
  user2Id: string,
  user2Username: string,
  isAppeal: boolean = false
) {
  const threadId = isAppeal
    ? `appeal-${user1Id}-${user2Id}`
    : `thread-${[user1Id, user2Id].sort().join('-')}`;

  if (!(await checkSqlAvailability())) {
    return localStore.createOrForceChatThread(user1Id, user1Username, user2Id, user2Username, isAppeal);
  }
  try {
    const existing = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
    if (existing[0]) {
      // Re-start: make sure a previously hidden thread shows up again
      if ((existing[0].hiddenByUserIds || []).length > 0) {
        const updated = await db
          .update(chatThreads)
          .set({ hiddenByUserIds: [] })
          .where(eq(chatThreads.id, threadId))
          .returning();
        return updated[0] || existing[0];
      }
      return existing[0];
    }
    const inserted = await db
      .insert(chatThreads)
      .values({
        id: threadId,
        user1Id,
        user1Username,
        user2Id,
        user2Username,
        isApproved: true,
        isTerminated: false,
        hiddenByUserIds: [],
        isAppealThread: isAppeal,
      })
      .returning();
    return inserted[0];
  } catch (err) {
    noteDbError('createOrForceChatThreadDb', err);
    console.error('[Chat] createOrForceChatThreadDb failed, using local store:', err);
    return localStore.createOrForceChatThread(user1Id, user1Username, user2Id, user2Username, isAppeal);
  }
}

export async function setChatThreadTerminatedDb(
  threadId: string,
  isTerminated: boolean,
  reason?: string
) {
  if (!(await checkSqlAvailability())) {
    return localStore.setChatThreadTerminated(threadId, isTerminated, reason);
  }
  try {
    const patch: any = { isTerminated };
    if (reason !== undefined) patch.terminatedReason = reason;
    else if (!isTerminated) patch.terminatedReason = null;
    const updated = await db.update(chatThreads).set(patch).where(eq(chatThreads.id, threadId)).returning();
    return updated[0] || localStore.setChatThreadTerminated(threadId, isTerminated, reason);
  } catch (err) {
    noteDbError('setChatThreadTerminatedDb', err);
    console.error('[Chat] setChatThreadTerminatedDb failed:', err);
    return localStore.setChatThreadTerminated(threadId, isTerminated, reason);
  }
}

export async function deleteChatThreadDb(threadId: string) {
  localStore.deleteChatThread(threadId);
  if (!(await checkSqlAvailability())) return true;
  try {
    await db.delete(chatMessages).where(eq(chatMessages.threadId, threadId));
    await db.delete(chatThreads).where(eq(chatThreads.id, threadId));
  } catch (err) {
    noteDbError('deleteChatThreadDb', err);
    console.error('[Chat] deleteChatThreadDb failed:', err);
  }
  return true;
}

export async function deleteChatMessageDb(messageId: string) {
  localStore.deleteChatMessage(messageId);
  if (!(await checkSqlAvailability())) return true;
  try {
    await db.delete(chatMessages).where(eq(chatMessages.id, messageId));
  } catch (err) {
    noteDbError('deleteChatMessageDb', err);
    console.error('[Chat] deleteChatMessageDb failed:', err);
  }
  return true;
}

export async function getChatMessagesDb(threadId: string) {
  if (!(await checkSqlAvailability())) return localStore.getChatMessages(threadId);
  try {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.createdAt));
  } catch (err) {
    noteDbError('getChatMessagesDb', err);
    console.error('[Chat] getChatMessagesDb failed:', err);
    return localStore.getChatMessages(threadId);
  }
}

export async function getAllChatMessagesDb(limitCount: number = 200) {
  if (!(await checkSqlAvailability())) return localStore.getAllChatMessages(limitCount);
  try {
    return await db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(limitCount);
  } catch (err) {
    noteDbError('getAllChatMessagesDb', err);
    console.error('[Chat] getAllChatMessagesDb failed:', err);
    return localStore.getAllChatMessages(limitCount);
  }
}

export async function createChatMessageDb(data: {
  id: string;
  threadId: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  content: string;
}) {
  if (!(await checkSqlAvailability())) return localStore.createChatMessage(data);
  try {
    const now = new Date();
    const inserted = await db
      .insert(chatMessages)
      .values({
        id: data.id,
        threadId: data.threadId,
        senderId: data.senderId,
        senderUsername: data.senderUsername,
        receiverId: data.receiverId || '',
        content: data.content,
        createdAt: now,
      })
      .returning();

    // Keep the conversation list preview fresh and bring hidden threads back
    await db
      .update(chatThreads)
      .set({
        lastMessage: data.content,
        lastMessageSender: data.senderUsername,
        lastMessageAt: now,
        hiddenByUserIds: [],
      })
      .where(eq(chatThreads.id, data.threadId));

    return inserted[0];
  } catch (err) {
    noteDbError('createChatMessageDb', err);
    console.error('[Chat] createChatMessageDb failed:', err);
    throw err;
  }
}

export async function getChatPairingBlocksDb() {
  if (!(await checkSqlAvailability())) return localStore.getChatPairingBlocks();
  try {
    return await db.select().from(chatPairingBlocks).orderBy(desc(chatPairingBlocks.createdAt));
  } catch (err) {
    noteDbError('getChatPairingBlocksDb', err);
    console.error('[Chat] getChatPairingBlocksDb failed:', err);
    return localStore.getChatPairingBlocks();
  }
}

export async function createChatPairingBlockDb(
  user1Id: string,
  user2Id: string,
  blockedBy: string,
  reason?: string
) {
  if (!(await checkSqlAvailability())) {
    return localStore.createChatPairingBlock(user1Id, user2Id, blockedBy, reason);
  }
  try {
    const inserted = await db
      .insert(chatPairingBlocks)
      .values({ user1Id, user2Id, blockedBy, reason: reason || null })
      .returning();
    return inserted[0];
  } catch (err) {
    noteDbError('createChatPairingBlockDb', err);
    console.error('[Chat] createChatPairingBlockDb failed:', err);
    return localStore.createChatPairingBlock(user1Id, user2Id, blockedBy, reason);
  }
}

export async function deleteChatPairingBlockDb(id: number) {
  if (!(await checkSqlAvailability())) return localStore.deleteChatPairingBlock(id);
  try {
    await db.delete(chatPairingBlocks).where(eq(chatPairingBlocks.id, id));
    return true;
  } catch (err) {
    noteDbError('deleteChatPairingBlockDb', err);
    console.error('[Chat] deleteChatPairingBlockDb failed:', err);
    return localStore.deleteChatPairingBlock(id);
  }
}

export async function isChatPairingBlockedDb(user1Id: string, user2Id: string) {
  if (!(await checkSqlAvailability())) return localStore.isChatPairingBlocked(user1Id, user2Id);
  try {
    const rows = await db
      .select()
      .from(chatPairingBlocks)
      .where(
        or(
          and(eq(chatPairingBlocks.user1Id, user1Id), eq(chatPairingBlocks.user2Id, user2Id)),
          and(eq(chatPairingBlocks.user1Id, user2Id), eq(chatPairingBlocks.user2Id, user1Id))
        )
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    noteDbError('isChatPairingBlockedDb', err);
    console.error('[Chat] isChatPairingBlockedDb failed:', err);
    return localStore.isChatPairingBlocked(user1Id, user2Id);
  }
}
