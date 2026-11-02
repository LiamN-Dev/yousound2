import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import {
  getUsersDb,
  getUserByUid,
  getUserByUsername,
  createUserDb,
  updateUserDb,
  deleteUserDb,
  getSongsDb,
  getSongsPersistentDb,
  getPersistentDbNowMs,
  updateSongDurationExactDb,
  insertSongDb,
  updateSongDb,
  deleteSongDb,
  incrementSongPlayDb,
  resetSongPlaysDb,
  bulkResetSongPlaysDb,
  getPlaylistsDb,
  createPlaylistDb,
  updatePlaylistDb,
  deletePlaylistDb,
  getFavoritesDb,
  toggleFavoriteDb,
  getRequestsDb,
  getRequestByIdDb,
  getRequestsPersistentDb,
  getRequestByIdPersistentDb,
  publishStagedSongRequestDb,
  unpublishSongRequestDb,
  createRequestDb,
  updateRequestDb,
  updateRequestFullDb,
  deleteRequestDb,
  cleanupExpiredSongRequestsDb,
  getPopupsDb,
  createPopupDb,
  updatePopupDb,
  deletePopupDb,
  cleanupExpiredPopupsDb,
  purgeWelcomePopupsDb,
  getSettingDb,
  setSettingDb,
  getPersistentSettingDb,
  setPersistentSettingDb,
  getMediaIdsDb,
  getMediaIdByCodeDb,
  reserveMediaIdDb,
  saveMediaIdDb,
  stageSongRequestMediaDb,
  releaseUnusedMediaIdReservationDb,
  saveMediaFileDb,
  getMediaFileDb,
  recordUserLoginDb,
  recordUserSongListenedDb,
  consumeUserDailyListenDb,
  getTodayUserDailyListenCountsDb,
  getSongByIdDb,
  getChatRequestsDb,
  getChatRequestsForUserDb,
  createChatRequestDb,
  updateChatRequestStatusDb,
  deleteChatRequestDb,
  getChatThreadsDb,
  getChatThreadsForUserDb,
  getChatThreadByIdDb,
  createOrForceChatThreadDb,
  getChatRequestByIdDb,
  setChatThreadTerminatedDb,
  deleteChatThreadDb,
  hideChatThreadForUserDb,
  createOrGetAppealThreadDb,
  getChatMessagesDb,
  getAllChatMessagesDb,
  getRadioChatMessagesDb,
  createRadioChatMessageDb,
  clearRadioChatMessagesDb,
  listRadioChatBansDb,
  getRadioChatBanDb,
  upsertRadioChatBanDb,
  deleteRadioChatBanDb,
  createChatMessageDb,
  deleteChatMessageDb,
  getChatPairingBlocksDb,
  createChatPairingBlockDb,
  deleteChatPairingBlockDb,
  isChatPairingBlockedDb,
  bulkUpdateSongsDb,
  bulkDeleteSongsDb,
  initDatabaseSchemaExtensions,
} from './src/db/queries.ts';
import { seedDatabaseIfEmpty } from './src/db/seed.ts';
import { ensureTables } from './src/db/ensureTables.ts';
import {
  attachUser,
  enforcePolicy,
  getAuthUser,
  isAdminReq,
  hashPasswordSecure,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  createAccountUnlockCode,
  verifyAccountUnlockCode,
  loginBlocked,
  noteLoginFailure,
  clearLoginFailures,
} from './src/services/auth.ts';
import {
  createFeedbackDb,
  listFeedbackDb,
  listFeedbackForUserDb,
  markFeedbackSeenDb,
  updateFeedbackDb,
  deleteFeedbackDb,
  purgeClosedFeedbackDb,
  clearClosedFeedbackDb,
} from './src/db/feedback.ts';
import { uploadMp3ToGoogleDrive, uploadImageToGoogleDrive, deleteGoogleDriveFile, getDriveLibraryFolderId } from './src/services/audioPipeline.ts';
import {
  generateSupabaseMigrationSql,
  testSupabaseDbConnection,
  syncLocalDataToSupabase,
} from './src/services/supabaseMigration.ts';
import {
  setSupabaseConnectionString,
  getActiveConnectionString,
  checkSqlAvailability,
  getDatabaseHealth,
  createPool,
  clearDbError,
} from './src/db/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const getPort = () => {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    return parseInt(process.argv[portArgIndex + 1], 10);
  }
  // Render (and most hosts) inject PORT; always honor it, regardless of NODE_ENV.
  if (process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }
  return 3000;
};
const PORT = getPort();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Render sits behind a proxy; this lets us see real IPs and detect https
app.set('trust proxy', 1);
// Every /api request: work out who is calling (from the signed cookie), then apply the route rules
app.use('/api', attachUser, enforcePolicy);

// Statically serve images and assets so covers never 404
app.use('/src/assets', express.static(path.resolve(__dirname, 'src/assets')));
app.use('/assets', express.static(path.resolve(__dirname, 'src/assets')));

// ----------------- PERSISTENT MEDIA STORAGE -----------------
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const AUDIO_DIR = path.resolve(UPLOADS_DIR, 'audio');
const COVERS_DIR = path.resolve(UPLOADS_DIR, 'covers');

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

/**
 * Inline audio data URIs are expensive and dangerous to keep in the songs table:
 * every /api/songs response would resend the whole encoded audio file. Persist the
 * bytes once in media_files and store only the small media URL on the song record.
 */
const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename: (_req, file, cb) => {
    const clean = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${clean}`);
  },
});
const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 150 * 1024 * 1024, files: 2 }, // 150 MB MP3; cover images are separately limited to 25 MB.
});

// Helper password hasher (matching frontend)

function toIsoString(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  try {
    return new Date(val).toISOString();
  } catch {
    return String(val);
  }
}

// ----------------- MEDIA UPLOADS & STREAMING -----------------
// Legacy media-to-database uploads for song audio and cover art are disabled.
// New track media must be uploaded using the Google Drive-only admin endpoints.
for (const route of ['/api/upload/audio', '/api/upload/audio-base64', '/api/upload/cover', '/api/upload/cover-base64']) {
  app.all(route, (_req: Request, res: Response) => {
    return res.status(410).json({
      success: false,
      error: 'This song-media upload endpoint has been retired. Use the Google Drive uploader in the admin panel.',
    });
  });
}

// Audio Stream Endpoint with HTTP 206 Partial Content (Range) support for scrubbing/seeking
// Resurrects from PostgreSQL database automatically if ephemeral container disk was cleared
app.get('/api/media/audio/:filename', async (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(AUDIO_DIR, filename);

  // The database is the durable source; the server's disk copy is only a cache.
  if (!fs.existsSync(filePath)) {
    try {
      const dbMedia = await getMediaFileDb(filename);
      if (dbMedia?.data) {
        const buffer = Buffer.from(dbMedia.data, 'base64');
        fs.writeFileSync(filePath, buffer);
      } else {
        return res.status(404).send('Audio file not found');
      }
    } catch (error) {
      console.error('Failed to restore audio from database:', error);
      return res.status(404).send('Audio file not found');
    }
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  // Upload URLs use unique filenames and are immutable; use a stable validator so a
  // process restart/cache restore does not invalidate every client's cached audio.
  const etag = `"${createHash('sha256').update(`${filename}:${fileSize}`).digest('base64url')}"`;
  const lastModified = stat.mtime.toUTCString();
  res.setHeader('Content-Type', filename.endsWith('.wav') ? 'audio/wav'
    : filename.endsWith('.ogg') ? 'audio/ogg'
    : filename.endsWith('.webm') ? 'audio/webm'
    : filename.endsWith('.m4a') || filename.endsWith('.aac') ? 'audio/mp4'
    : filename.endsWith('.flac') ? 'audio/flac' : 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', lastModified);

  // Browser refreshes can reuse cached media instead of downloading it again.
  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];
  const notModified = ifNoneMatch
    ? ifNoneMatch.split(',').map((value) => value.trim()).some((value) => value === '*' || value === etag || value === `W/${etag}`)
    : Boolean(ifModifiedSince && !Number.isNaN(Date.parse(ifModifiedSince)) && stat.mtime.getTime() <= Date.parse(ifModifiedSince) + 999);
  if (notModified && !req.headers.range) return res.status(304).end();
  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', fileSize);
    return res.status(200).end();
  }

  let rangeHeader = req.headers.range;
  const ifRange = req.headers['if-range'];
  if (rangeHeader && ifRange && ifRange !== etag && ifRange !== lastModified) {
    rangeHeader = undefined; // changed file: ignore stale byte range and send the current representation
  }

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || (!match[1] && !match[2])) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }
    let start = match[1] ? Number(match[1]) : Math.max(0, fileSize - Number(match[2]));
    let end = match[2] && match[1] ? Number(match[2]) : fileSize - 1;
    if (!match[1] && match[2]) end = fileSize - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= fileSize || end < start) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }
    end = Math.min(end, fileSize - 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', end - start + 1);
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', (error) => {
      console.error('Audio range stream error:', error);
      if (!res.headersSent) res.status(500).end(); else res.destroy(error);
    });
    return stream.pipe(res);
  }

  res.status(200);
  res.setHeader('Content-Length', fileSize);
  const stream = fs.createReadStream(filePath);
  stream.on('error', (error) => {
    console.error('Audio stream error:', error);
    if (!res.headersSent) res.status(500).end(); else res.destroy(error);
  });
  stream.pipe(res);
});

// Cover Image Endpoint with Caching Headers
// Resurrects from PostgreSQL database automatically if ephemeral container disk was cleared
app.get('/api/media/cover/:filename', async (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(COVERS_DIR, filename);

  // If missing from local disk cache, restore from persistent PostgreSQL database
  if (!fs.existsSync(filePath)) {
    try {
      const dbMedia = await getMediaFileDb(filename);
      if (dbMedia && dbMedia.data) {
        const buffer = Buffer.from(dbMedia.data, 'base64');
        fs.writeFileSync(filePath, buffer);
      } else {
        return res.status(404).send('Cover not found');
      }
    } catch (e) {
      console.error('Failed to restore cover from database:', e);
      return res.status(404).send('Cover not found');
    }
  }

  const stat = fs.statSync(filePath);
  // Cover uploads also use unique filenames; preserve the validator across restarts.
  const etag = `\"${createHash('sha256').update(`${filename}:${stat.size}`).digest('base64url')}\"`;
  const lastModified = stat.mtime.toUTCString();
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', lastModified);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch.split(',').map((value) => value.trim()).some((value) => value === '*' || value === etag || value === `W/${etag}`)) {
    return res.status(304).end();
  }
  if (!ifNoneMatch && req.headers['if-modified-since'] && stat.mtime.getTime() <= Date.parse(String(req.headers['if-modified-since'])) + 999) {
    return res.status(304).end();
  }

  let contentType = 'image/jpeg';
  if (filename.endsWith('.png')) contentType = 'image/png';
  else if (filename.endsWith('.webp')) contentType = 'image/webp';
  else if (filename.endsWith('.gif')) contentType = 'image/gif';
  else if (filename.endsWith('.svg')) contentType = 'image/svg+xml';
  else if (filename.endsWith('.mp4')) contentType = 'video/mp4';
  else if (filename.endsWith('.webm')) contentType = 'video/webm';
  else if (filename.endsWith('.mov')) contentType = 'video/quicktime';
  else if (filename.endsWith('.ogg')) contentType = 'video/ogg';

  const fileSize = stat.size;
  const range = req.headers.range;

  if (range && contentType.startsWith('video/')) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(filePath).pipe(res);
  }
});

// ----------------- GOOGLE DRIVE & 3RD-PARTY CLOUD AUDIO STREAMING -----------------
// Helper to extract Google Drive file ID or convert cloud links
function extractDriveFileId(inputUrl: string): string | null {
  const trimmed = String(inputUrl || '').trim();
  if (!trimmed || trimmed.length > 2048) return null;

  // Accept an ID directly, standard Drive/Docs share URLs, and this app's own stream URLs.
  if (/^[a-zA-Z0-9_-]{10,200}$/.test(trimmed)) return trimmed;
  const localRouteMatch = trimmed.match(/^\/api\/(?:drive\/stream|media\/drive-stream)\/([a-zA-Z0-9_-]{10,200})(?:[?#].*)?$/);
  if (localRouteMatch) return localRouteMatch[1];

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'www.drive.google.com', 'lh3.googleusercontent.com'].includes(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    const dIndex = segments.indexOf('d');
    const id = (dIndex >= 0 ? segments[dIndex + 1] : '') || url.searchParams.get('id') || '';
    return /^[a-zA-Z0-9_-]{10,200}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

// Legacy local stream URLs now forward to the single Google Drive playback handler.
app.get('/api/media/drive-stream/:fileId', (req: Request, res: Response) => {
  const fileId = String(req.params.fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) return res.status(400).send('Invalid Google Drive file ID');
  return res.redirect(307, `/api/drive/stream/${encodeURIComponent(fileId)}`);
});

// Import Cloud File (Google Drive, Dropbox, OneDrive, or Direct URL) into PostgreSQL Database
app.post('/api/media/import-cloud-file', async (req: Request, res: Response) => {
  try {
    const { url, preferredTitle } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const driveId = extractDriveFileId(url);
    let targetDownloadUrl = url.trim();

    if (driveId) {
      targetDownloadUrl = `https://docs.google.com/uc?export=download&id=${driveId}`;
    } else if (targetDownloadUrl.includes('dropbox.com')) {
      targetDownloadUrl = targetDownloadUrl.replace(/\?dl=[01]/, '?raw=1').replace(/&dl=[01]/, '&raw=1');
      if (!targetDownloadUrl.includes('?raw=1') && !targetDownloadUrl.includes('&raw=1')) {
        targetDownloadUrl += (targetDownloadUrl.includes('?') ? '&raw=1' : '?raw=1');
      }
    }

    console.log('Server fetching cloud audio from:', targetDownloadUrl);
    let fetchRes = await fetch(targetDownloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      redirect: 'follow',
    });

    // Check for Google Drive virus confirmation token
    const htmlPeek = await fetchRes.clone().text().catch(() => '');
    if (htmlPeek && htmlPeek.includes('uc-download-link')) {
      const match = htmlPeek.match(/href="([^"]+confirm=[^"]+)"/);
      if (match && match[1]) {
        const confirmUrl = match[1].replace(/&amp;/g, '&');
        fetchRes = await fetch(confirmUrl, { redirect: 'follow' });
      }
    }

    if (!fetchRes.ok) {
      return res.status(400).json({
        success: false,
        error: `Could not fetch file (${fetchRes.status}). If using Google Drive, make sure the link sharing is set to "Anyone with the link".`,
      });
    }

    const arrayBuf = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length < 500) {
      return res.status(400).json({
        success: false,
        error: 'File appears too small or is not an audio file. Please check link permissions.',
      });
    }

    const cleanBaseName = (preferredTitle || 'cloud_track').replace(/[^a-zA-Z0-9.-]/g, '_');
    const finalFilename = `${Date.now()}-${cleanBaseName}.mp3`;
    const filePath = path.join(AUDIO_DIR, finalFilename);

    // 1. Write to local disk cache
    fs.writeFileSync(filePath, buffer);

    // 2. Persist permanently into PostgreSQL database
    const base64Data = buffer.toString('base64');
    const mimeType = fetchRes.headers.get('content-type') || 'audio/mpeg';
    await saveMediaFileDb(finalFilename, base64Data, mimeType, buffer.length);

    let duration = 0;
    try {
      const mm = await import('music-metadata');
      const meta = await mm.parseBuffer(buffer);
      if (meta.format?.duration && isFinite(meta.format.duration)) {
        duration = Math.round(meta.format.duration);
      }
    } catch (parseErr) {
      console.warn('Could not parse duration for cloud audio:', parseErr);
    }

    res.json({
      success: true,
      audioUrl: `/api/media/audio/${finalFilename}`,
      filename: finalFilename,
      duration,
      size: buffer.length,
      streamUrl: driveId ? `/api/media/drive-stream/${driveId}` : `/api/media/audio/${finalFilename}`,
    });
  } catch (err: any) {
    console.error('Import cloud file error:', err);
    res.status(500).json({ success: false, error: err.message || 'Import failed' });
  }
});

// Import Cloud Artwork (Google Drive Image/GIF/Video, Dropbox, or Direct Image URL)
app.post('/api/media/import-cloud-cover', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const driveId = extractDriveFileId(url);
    let targetDownloadUrl = url.trim();

    if (driveId) {
      targetDownloadUrl = `https://docs.google.com/uc?export=download&id=${driveId}`;
    }

    let fetchRes = await fetch(targetDownloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      redirect: 'follow',
    });

    // Check for Google Drive virus confirmation token
    const htmlPeek = await fetchRes.clone().text().catch(() => '');
    if (htmlPeek && htmlPeek.includes('uc-download-link')) {
      const match = htmlPeek.match(/href="([^"]+confirm=[^"]+)"/);
      if (match && match[1]) {
        const confirmUrl = match[1].replace(/&amp;/g, '&');
        fetchRes = await fetch(confirmUrl, { redirect: 'follow' });
      }
    }

    // High performance direct Google CDN fallback if uc download fails
    if (!fetchRes.ok && driveId) {
      fetchRes = await fetch(`https://lh3.googleusercontent.com/d/${driveId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      });
    }

    if (!fetchRes.ok) {
      return res.status(400).json({
        success: false,
        error: `Could not fetch image (${fetchRes.status}). Ensure the Google Drive file is set to "Anyone with the link".`,
      });
    }

    const arrayBuf = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Image file appears invalid or too small.',
      });
    }

    const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('mp4')) ext = '.mp4';
    else if (contentType.includes('webm')) ext = '.webm';

    const finalFilename = `${Date.now()}-drive_cover${ext}`;
    const filePath = path.join(COVERS_DIR, finalFilename);

    fs.writeFileSync(filePath, buffer);
    const base64Data = buffer.toString('base64');
    await saveMediaFileDb(finalFilename, base64Data, contentType, buffer.length);

    res.json({
      success: true,
      coverUrl: `/api/media/cover/${finalFilename}`,
      filename: finalFilename,
      mimeType: contentType,
      size: buffer.length,
    });
  } catch (err: any) {
    console.error('Import cloud cover error:', err);
    res.status(500).json({ success: false, error: err.message || 'Cover import failed' });
  }
});

// Accurate Audio Duration Detection (Inspects local files or Google Drive / Cloud streams)
app.post('/api/media/detect-duration', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'url is required' });
    }

    const mm = await import('music-metadata');
    let duration = 0;

    // 1. Local audio file
    if (url.startsWith('/api/media/audio/')) {
      const filename = path.basename(url);
      const filePath = path.join(AUDIO_DIR, filename);
      if (fs.existsSync(filePath)) {
        const meta = await mm.parseFile(filePath);
        if (meta.format?.duration && isFinite(meta.format.duration)) {
          duration = Math.round(meta.format.duration);
        }
      }
    } else {
      // 2. Google Drive stream or cloud link
      const driveId = extractDriveFileId(url);
      let targetUrl = url.trim();
      if (driveId) {
        targetUrl = `https://docs.google.com/uc?export=download&id=${driveId}`;
      }
      const fetchRes = await fetch(targetUrl, {
        headers: { Range: 'bytes=0-1048576', 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      });
      if (fetchRes.ok) {
        const arrayBuf = await fetchRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const meta = await mm.parseBuffer(buffer);
        if (meta.format?.duration && isFinite(meta.format.duration)) {
          duration = Math.round(meta.format.duration);
        }
      }
    }

    if (duration > 0) {
      res.json({ success: true, duration });
    } else {
      res.json({ success: false, error: 'Could not detect duration' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Duration detection failed' });
  }
});

// Probe external audio / media URL (for the "Pull from web/video" feature)
app.post('/api/media/probe-url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Try HEAD request first
    let headRes = await fetch(url, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
    if (!headRes || !headRes.ok) {
      // Fallback: try GET with small range
      headRes = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-1024' },
        redirect: 'follow',
      }).catch(() => null);
    }

    if (!headRes || !headRes.ok) {
      return res.json({
        success: true,
        reachable: false,
        warning: 'URL could not be probed directly (CORS or network restriction), but can still be used as a stream player link.',
      });
    }

    const contentType = headRes.headers.get('content-type') || 'audio/mpeg';
    const contentLength = headRes.headers.get('content-length');
    const size = contentLength ? parseInt(contentLength, 10) : 0;

    res.json({
      success: true,
      reachable: true,
      contentType,
      size,
    });
  } catch (err: any) {
    res.json({
      success: true,
      reachable: false,
      warning: err.message || 'Probe error',
    });
  }
});

// ----------------- SYSTEM STATUS & HEALTH -----------------
app.get('/api/health', async (_req: Request, res: Response) => {
  const connected = await checkSqlAvailability();
  res.json({ ok: true, database: connected ? 'postgres' : 'local-temporary', persistent: connected });
});

app.get('/api/status', async (req: Request, res: Response) => {
  try {
    const banner = (await getSettingDb('banner')) || {
      enabled: true,
      versionName: 'v2.6 Pro Edition',
      sloganText: 'School Audio Hub',
      colorTheme: 'sapphire-ice',
      ribbonEnabled: true,
      ribbonNotice: 'All audio streams are school-safe, ad-free, and curated for focused study',
    };
    const maintenance = (await getSettingDb('maintenance')) || {
      enabled: false,
      message: 'System maintenance in progress. Please check back shortly.',
      updatedAt: new Date().toISOString(),
      hasCountdown: false,
      estimatedFinishTime: null,
    };

    const dbOnline = await checkSqlAvailability();
    res.json({
      status: 'online',
      appName: 'YouSong',
      creator: 'Admin',
      database: dbOnline
        ? 'PostgreSQL (saved permanently)'
        : 'TEMPORARY LOCAL STORAGE (data is erased on redeploy)',
      version: banner.versionName,
      maintenance,
      banner,
    });
  } catch (error: any) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Status check failed' });
  }
});

// ----------------- AUTHENTICATION -----------------
// 1. Password login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    const cleanUsername = username.trim();
    const throttleKey = `${req.ip}|${cleanUsername.toLowerCase()}`;
    if (loginBlocked(throttleKey)) {
      return res.status(429).json({ success: false, error: 'Too many failed attempts. Please wait 15 minutes and try again.' });
    }

    const user = await getUserByUsername(cleanUsername);

    if (!user) {
      noteLoginFailure(throttleKey);
      return res.status(404).json({
        success: false,
        error: 'User does not exist. You can submit an account request below.',
      });
    }

    const check = await verifyPassword(password, user.passwordHash);
    if (!check.ok) {
      noteLoginFailure(throttleKey);
      return res.status(401).json({
        success: false,
        error: user.passwordHash
          ? 'Incorrect password.'
          : 'This account has no password set. Ask an admin to assign you a temporary password.',
      });
    }
    if (user.isSuspended && user.role !== 'admin') {
      clearLoginFailures(throttleKey);
      return res.status(403).json({
        success: false,
        error: user.suspendedReason
          ? 'This account is suspended: ' + String(user.suspendedReason).slice(0, 240)
          : 'This account is suspended. Contact an administrator or submit an appeal.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }
    clearLoginFailures(throttleKey);

    // Quietly upgrade old weak password storage to salted scrypt
    let passwordHash = user.passwordHash;
    if (check.needsUpgrade) {
      try {
        passwordHash = await hashPasswordSecure(password);
        await updateUserDb(user.uid, { passwordHash });
      } catch (e) {
        console.warn('[Security] Could not upgrade password storage for', user.username, e);
        passwordHash = user.passwordHash;
      }
    }

    // Record login timestamp
    await recordUserLoginDb(user.uid);

    // Start the signed session
    setSessionCookie(req, res, { uid: user.uid, passwordHash, sessionVersion: user.sessionVersion });

    res.json({
      success: true,
      user: {
        id: user.uid,
        username: user.username,
        role: user.role,
        isApproved: user.isApproved,
        createdAt: toIsoString(user.createdAt) || new Date().toISOString(),
        note: user.note,
        temporaryPasswordAssigned: user.temporaryPasswordAssigned,
        isSuspended: user.isSuspended || false,
        isLocked: user.isLocked || false,
        suspendedReason: user.suspendedReason || null,
        lastLoginAt: new Date().toISOString(),
        lastSongListened: user.lastSongListened,
        lastSongListenedAt: toIsoString(user.lastSongListenedAt),
        chatBlocked: user.chatBlocked || false,
        christmasMode: !!user.christmasMode,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message || 'Login failed' });
  }
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.post('/api/auth/unlock', async (req: Request, res: Response) => {
 const user=getAuthUser(req);if(!user)return res.status(401).json({success:false,error:'Please log in again.'});
 if(user.role==='admin'||!user.isLocked)return res.json({success:true,unlocked:true});
 if(!verifyAccountUnlockCode(user.uid,req.body?.code))return res.status(401).json({success:false,error:'Incorrect or expired seven-digit code.'});
 await updateUserDb(user.uid,{isLocked:false});return res.json({success:true,unlocked:true});
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Please log in again.' });
  res.json({
    success: true,
    user: {
      id: user.uid,
      username: user.username,
      role: user.role,
      isApproved: user.isApproved,
      createdAt: toIsoString(user.createdAt) || new Date().toISOString(),
      note: user.note,
      temporaryPasswordAssigned: user.temporaryPasswordAssigned,
      isSuspended: user.isSuspended || false,
      isLocked: user.isLocked || false,
      suspendedReason: user.suspendedReason || null,
      lastLoginAt: toIsoString(user.lastLoginAt),
      lastSongListened: user.lastSongListened,
      lastSongListenedAt: toIsoString(user.lastSongListenedAt),
      chatBlocked: user.chatBlocked || false,
      christmasMode: !!user.christmasMode,
    },
  });
});

app.get('/api/auth/me/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const me = getAuthUser(req);
    if (!me) return res.status(401).json({ success: false, error: 'Please log in again.' });
    if (me.uid !== userId && me.role !== 'admin') return res.status(403).json({ success: false, error: 'Not allowed' });
    const user = await getUserByUid(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.uid,
        username: user.username,
        role: user.role,
        isApproved: user.isApproved,
        createdAt: toIsoString(user.createdAt) || new Date().toISOString(),
        note: user.note,
        temporaryPasswordAssigned: user.temporaryPasswordAssigned,
        isSuspended: user.isSuspended || false,
        isLocked: user.isLocked || false,
        suspendedReason: user.suspendedReason || null,
        lastLoginAt: toIsoString(user.lastLoginAt),
        lastSongListened: user.lastSongListened,
        lastSongListenedAt: toIsoString(user.lastSongListenedAt),
        chatBlocked: user.chatBlocked || false,
        christmasMode: !!user.christmasMode,
      },
    });
  } catch (error: any) {
    console.error('Fetch me error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Member Account Request (Requires Admin Approval)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, password, note } = req.body;
    const clean = (username || '').trim().slice(0, 40);
    if (!clean) return res.status(400).json({ success: false, error: 'Username is required' });
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
    }

    const existing = await getUserByUsername(clean);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username is already taken or pending' });
    }

    const uid = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const created = await createUserDb({
      uid,
      username: clean,
      passwordHash: await hashPasswordSecure(password),
      role: 'user',
      isApproved: false,
      note: (note || '').trim(),
    });

    res.json({
      success: true,
      user: {
        id: created.uid,
        username: created.username,
        role: created.role,
        isApproved: created.isApproved,
        createdAt:
          created.createdAt instanceof Date
            ? created.createdAt.toISOString()
            : String(created.createdAt || new Date().toISOString()),
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: error.message || 'Registration failed' });
  }
});

// 4. Change own password
app.post('/api/auth/change-password', async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const me = getAuthUser(req);
    if (!me) return res.status(401).json({ success: false, error: 'Please log in again.' });
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Valid new password required (minimum 4 characters)' });
    }

    // You can only change your own password here
    const user = await getUserByUid(me.uid);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const isTemp = user.temporaryPasswordAssigned === true;
    const typedCurrent = typeof currentPassword === 'string' ? currentPassword.trim() : '';

    // A temporary password may be replaced directly; otherwise the current password is required
    if (!isTemp || typedCurrent) {
      const check = await verifyPassword(typedCurrent, user.passwordHash);
      if (!check.ok) {
        return res.status(401).json({
          success: false,
          error: isTemp ? 'Current temporary password is incorrect' : 'Current password is incorrect',
        });
      }
    }

    const passwordHash = await hashPasswordSecure(newPassword.trim());
    await updateUserDb(user.uid, { passwordHash, temporaryPasswordAssigned: false });
    // The old session stops working after a password change, so give this browser a fresh one
    setSessionCookie(req, res, { uid: user.uid, passwordHash, sessionVersion: user.sessionVersion });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update password' });
  }
});

// ----------------- USER MANAGEMENT (ADMIN) -----------------
app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const all = await getUsersDb();
    const dailyListenCounts = isAdminReq(req) ? await getTodayUserDailyListenCountsDb() : {};
    if (!isAdminReq(req)) {
      // Regular members only get the basics (needed to pick someone to chat with)
      return res.json({
        users: all
          .filter((u) => u.isApproved && !u.isSuspended)
          .map((u) => ({
            id: u.uid,
            username: u.username,
            role: u.role,
            isApproved: u.isApproved,
            createdAt: toIsoString(u.createdAt) || new Date().toISOString(),
          })),
      });
    }
    const formatted = all.map((u) => ({
      id: u.uid,
      username: u.username,
      role: u.role,
      isApproved: u.isApproved,
      note: u.note,
      createdAt: toIsoString(u.createdAt) || new Date().toISOString(),
      temporaryPasswordAssigned: u.temporaryPasswordAssigned,
      isSuspended: u.isSuspended || false,
      isLocked: u.isLocked || false,
      suspendedReason: u.suspendedReason || null,
      lastLoginAt: toIsoString(u.lastLoginAt),
      lastSongListened: u.lastSongListened || null,
      lastSongListenedAt: toIsoString(u.lastSongListenedAt),
      chatBlocked: u.chatBlocked || false,
      dailyListenLimit: u.dailyListenLimit ?? null,
      dailyListensToday: dailyListenCounts[u.uid] || 0,
      christmasMode: !!u.christmasMode,
    }));
    res.json({ users: formatted });
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:uid/approve', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    await updateUserDb(uid, { isApproved: true });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:uid/reject', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    const { reason } = req.body || {};
    if (reason && reason.trim()) {
      await updateUserDb(uid, { isApproved: false, adminNote: reason.trim() });
    } else {
      await deleteUserDb(uid);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Reject user error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/users/:uid', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    const requester = getAuthUser(req);
    if (!requester) return res.status(401).json({ error: 'Please log in again.' });
    const bodyKeys = Object.keys(req.body || {});
    const selfAccentOnly = requester.uid === uid && bodyKeys.length === 1 && bodyKeys[0] === 'colorAccent';
    if (!isAdminReq(req) && !selfAccentOnly) {
      return res.status(403).json({ error: 'Only administrators can update account settings.' });
    }

    const {
      newUsername,
      username,
      newTemporaryPassword,
      password,
      role,
      isApproved,
      chatBlocked,
      isSuspended,
      suspendedReason,
      adminNote,
      colorAccent,
      dailyListenLimit,
      isLocked,
      christmasMode,
    } = req.body;
    const updates: any = {};

    const targetUsername = newUsername || username;
    if (targetUsername && targetUsername.trim()) {
      updates.username = targetUsername.trim();
    }

    const targetPassword = newTemporaryPassword || password;
    if (targetPassword && targetPassword.trim()) {
      updates.passwordHash = await hashPasswordSecure(targetPassword.trim());
      updates.temporaryPasswordAssigned = true;
    }

    if (role && (role === 'admin' || role === 'user')) {
      updates.role = role;
    }

    if (typeof isApproved === 'boolean') {
      updates.isApproved = isApproved;
    }

    if (typeof chatBlocked === 'boolean') {
      updates.chatBlocked = chatBlocked;
    }

    if (typeof isSuspended === 'boolean') {
      updates.isSuspended = isSuspended;
    }
    if (typeof isLocked === 'boolean') {
      const target=await getUserByUid(uid);if(!target)return res.status(404).json({success:false,error:'User not found.'});
      if(target.role==='admin'&&isLocked)return res.status(400).json({success:false,error:'Admin accounts cannot be locked with member codes.'});updates.isLocked=isLocked;
    }

    if (suspendedReason !== undefined) {
      updates.suspendedReason = suspendedReason;
    }

    if (adminNote !== undefined) {
      updates.adminNote = adminNote;
    }

    if (colorAccent !== undefined) {
      updates.colorAccent = colorAccent;
    }

    if (typeof christmasMode === 'boolean') {
      updates.christmasMode = christmasMode;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'dailyListenLimit')) {
      if (dailyListenLimit === null || dailyListenLimit === '') {
        updates.dailyListenLimit = null; // blank means unlimited
      } else {
        const parsedLimit = Number(dailyListenLimit);
        if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 0 || parsedLimit > 1000000) {
          return res.status(400).json({ error: 'Daily listen limit must be a whole number from 0 to 1,000,000, or blank for unlimited.' });
        }
        updates.dailyListenLimit = parsedLimit;
      }
    }

    const updated = await updateUserDb(uid, updates);
    res.json({
      success: true,
      user: updated
        ? {
            id: updated.uid,
            uid: updated.uid,
            username: updated.username,
            role: updated.role,
            isApproved: updated.isApproved,
            note: updated.note,
            temporaryPasswordAssigned: updated.temporaryPasswordAssigned,
            chatBlocked: updated.chatBlocked || false,
            isSuspended: updated.isSuspended || false,
            isLocked: updated.isLocked || false,
            suspendedReason: updated.suspendedReason || null,
            adminNote: updated.adminNote || null,
            colorAccent: updated.colorAccent || 'cyan',
            dailyListenLimit: updated.dailyListenLimit ?? null,
            christmasMode: !!updated.christmasMode,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users/:uid/lock-code', async (req: Request, res: Response) => {
 if(!isAdminReq(req))return res.status(403).json({success:false,error:'Administrators only.'});const user=await getUserByUid(String(req.params.uid||''));
 if(!user||user.role==='admin'||!user.isLocked)return res.status(404).json({success:false,error:'Locked member account not found.'});const current=createAccountUnlockCode(user.uid);res.setHeader('Cache-Control','no-store, private');return res.json({success:true,username:user.username,code:current.code,expiresAt:current.expiresAt});
});
app.post('/api/admin/users/logout-all-except-admin', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    const users = await getUsersDb();
    const members = users.filter((user: any) => user.role !== 'admin');
    let revoked = 0;
    for (const user of members) {
      const version = Math.max(0, Number(user.sessionVersion) || 0) + 1;
      const updated = await updateUserDb(user.uid, { sessionVersion: version });
      if (!updated) throw new Error(`Could not revoke sessions for ${user.username || user.uid}.`);
      revoked += 1;
    }
    return res.json({ success: true, revokedCount: revoked, excludedAdmins: users.length - members.length });
  } catch (error: any) {
    console.error('[Sessions] Could not revoke all member sessions:', error);
    return res.status(500).json({ success: false, error: error.message || 'Could not log out all non-admin accounts.' });
  }
});

app.post('/api/admin/users/:uid/logout-all', async (req: Request, res: Response) => {
 if(!isAdminReq(req))return res.status(403).json({success:false,error:'Administrators only.'});const user=await getUserByUid(String(req.params.uid||''));if(!user)return res.status(404).json({success:false,error:'User not found.'});
 await updateUserDb(user.uid,{sessionVersion:(Number(user.sessionVersion)||0)+1});return res.json({success:true,sessionsRevoked:true});
});

app.post('/api/users/activity/listen', async (req: Request, res: Response) => {
  try {
    const { songTitle, songArtist } = req.body;
    const userId = getAuthUser(req)?.uid;
    if (userId && songTitle) {
      const summary = songArtist ? `${songTitle} · ${songArtist}` : songTitle;
      await recordUserSongListenedDb(userId, summary);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:uid', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    const user = await getUserByUid(uid);
    if (user?.role === 'admin') {
      return res.status(403).json({ error: 'Cannot delete primary admin account' });
    }
    await deleteUserDb(uid);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------- SONGS -----------------
app.get('/api/songs', async (req: Request, res: Response) => {
  try {
    const storedSongs = await getSongsDb();
    // Existing inline-media records are intentionally not migrated. The owner is clearing
    // legacy songs manually; never return their embedded media bytes to browsers.
    const songsList = (storedSongs as any[]).map((song) => (
      typeof song.audioUrl === 'string' && song.audioUrl.startsWith('data:audio/')
        ? { ...song, audioUrl: '' }
        : song
    ));
    const body = JSON.stringify({ songs: songsList });
    const etag = `W/\"${createHash('sha256').update(body).digest('base64url')}\"`;
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match']?.split(',').map((value) => value.trim()).includes(etag)) {
      return res.status(304).end();
    }
    res.type('application/json').send(body);
  } catch (error: any) {
    console.error('Get songs error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/songs', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ error: 'Administrators only.' });
    const songData = req.body || {};
    if (!songData.title || !songData.artist || !songData.audioUrl || !songData.coverUrl) {
      return res.status(400).json({ error: 'Title, artist, Google Drive audio, and Google Drive cover are required.' });
    }
    if (!(await checkSqlAvailability())) return res.status(503).json({ error: 'The persistent database is unavailable. No song was saved.' });
    const audioUrl = String(songData.audioUrl);
    const coverUrl = String(songData.coverUrl);
    if (!/^https:\/\/drive\.google\.com\/uc\?export=download&id=[A-Za-z0-9_-]+/i.test(audioUrl)) {
      return res.status(400).json({ error: 'New library audio must be uploaded to the site Google Drive first.' });
    }
    if (!/^https:\/\/lh3\.googleusercontent\.com\/d\/[A-Za-z0-9_-]+/i.test(coverUrl)) {
      return res.status(400).json({ error: 'New library artwork must be uploaded to the site Google Drive first.' });
    }

    const newSong = {
      id: songData.id || `song-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: songData.title.trim(),
      artist: songData.artist.trim(),
      album: songData.album?.trim() || '',
      genre: songData.genre?.trim() || 'Study',
      tags: songData.tags || [songData.genre?.toLowerCase() || 'study'],
      typeMood: songData.typeMood || 'Instrumental',
      duration: Number(songData.duration) || 180,
      audioUrl,
      coverUrl,
      addedAt: new Date().toISOString(),
      plays: 0,
      featured: !!songData.featured,
      description: songData.description || '',
      isLimitedEdition: !!songData.isLimitedEdition,
      limitedUntil: songData.limitedUntil || null,
      autoRemoveOnExpire: !!songData.autoRemoveOnExpire,
      badgeType: songData.badgeType || null,
      badgeMessage: songData.badgeMessage || songData.badgeCustomText || null,
      isPinned: !!songData.isPinned,
      isDroppingSoon: !!songData.isDroppingSoon,
      dropDate: songData.dropDate || null,
      autoReleaseOnDrop: !!songData.autoReleaseOnDrop,
    };

    const inserted = await insertSongDb(newSong, true);
    res.json({ success: true, song: inserted });
  } catch (error: any) {
    console.error('Insert song error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Any listener's player can report a song's real length, but only while it is still a placeholder
app.post('/api/songs/:id/duration', async (req: Request, res: Response) => {
  try {
    const seconds = Math.round(Number(req.body?.seconds));
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > 43200) {
      return res.status(400).json({ error: 'Invalid duration' });
    }
    const song = (await getSongsDb()).find((s: any) => s.id === req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });
    const current = Number(song.duration) || 0;
    const placeholder = current <= 0 || current === 180;
    if (!isAdminReq(req) && !placeholder) return res.json({ success: true, unchanged: true });
    if (Math.abs(current - seconds) < 2) return res.json({ success: true, unchanged: true });
    await updateSongDb(req.params.id, { duration: seconds });
    res.json({ success: true, duration: seconds });
  } catch (error: any) {
    console.error('Report duration error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/songs/:id', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    if (!(await checkSqlAvailability())) {
      return res.status(503).json({ success: false, error: 'The persistent database is unavailable. Song changes were not saved.' });
    }
    const { id } = req.params;
    const updates = { ...(req.body || {}) };

    if (Object.prototype.hasOwnProperty.call(updates, 'audioUrl')) {
      const value = String(updates.audioUrl || '').trim();
      if (!/^https:\/\/drive\.google\.com\/uc\?export=download&id=[A-Za-z0-9_-]+$/i.test(value)) {
        return res.status(400).json({ success: false, error: 'Song audio must be a direct file in the site Google Drive.' });
      }
      updates.audioUrl = value;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'coverUrl')) {
      const value = String(updates.coverUrl || '').trim();
      const match = value.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)(?:=w\d+(?:-h\d+)?)?$/i);
      if (!match) {
        return res.status(400).json({ success: false, error: 'Song artwork must remain a valid Google Drive image. Choose a cover image rather than leaving this field empty.' });
      }
      // Store a stable canonical Drive image URL. Display sizing is added by MediaCover.
      updates.coverUrl = 'https://lh3.googleusercontent.com/d/' + match[1];
    }

    const updated = await updateSongDb(id, updates);
    return res.json({ success: true, song: updated });
  } catch (error: any) {
    console.error('Update song error:', error);
    const status = /not found/i.test(String(error?.message || '')) ? 404 : /persistent database/i.test(String(error?.message || '')) ? 503 : 400;
    return res.status(status).json({ success: false, error: error.message || 'Could not save song changes.' });
  }
});

app.delete('/api/songs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteSongDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete song error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/songs/:id/play', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, error: 'Please log in again.', code: 'AUTH_REQUIRED' });

    // Admins can preview tracks without consuming a user's daily allowance or changing play metrics.
    if (authUser.role === 'admin') {
      return res.json({ success: true, ignored: true, reason: 'Admin listens are excluded from usage and play metrics.' });
    }

    const song = await getSongByIdDb(id);
    if (!song) return res.status(404).json({ success: false, error: 'Song not found.' });

    const allowance = await consumeUserDailyListenDb(authUser.uid);
    if (!allowance.allowed) {
      return res.status(429).json({
        success: false,
        code: 'DAILY_LISTEN_LIMIT',
        error: allowance.limit === 0
          ? 'Your account is currently not allowed to play songs.'
          : `You have reached your daily listen limit (${allowance.limit} per UTC day). Try again after the daily reset.`,
        listensToday: allowance.listensToday,
        dailyListenLimit: allowance.limit,
      });
    }

    await incrementSongPlayDb(id);
    await recordUserSongListenedDb(authUser.uid, song.artist ? `${song.title} · ${song.artist}` : song.title);
    return res.json({
      success: true,
      listensToday: allowance.listensToday,
      dailyListenLimit: allowance.limit,
    });
  } catch (error: any) {
    console.error('Validate listen error:', error);
    return res.status(503).json({ success: false, error: error.message || 'Could not verify your daily listen allowance.' });
  }
});

// Reset Plays Counter for a Song
app.post('/api/songs/:id/reset-plays', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await resetSongPlaysDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Reset song plays error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk Reset Plays Counter for multiple or all songs
app.post('/api/songs/bulk-reset-plays', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body || {};
    await bulkResetSongPlaysDb(Array.isArray(ids) ? ids : undefined);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Bulk reset song plays error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fix all previous songs with incorrect duration across database
app.post('/api/admin/songs/fix-durations', async (req: Request, res: Response) => {
  try {
    const updatedCount = await fixAllPreviousSongsDuration(AUDIO_DIR);
    res.json({ success: true, updatedCount });
  } catch (error: any) {
    console.error('Fix durations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk Update Songs. Admin-only; the database helper applies the full allow-listed update payload.
app.post('/api/songs/bulk-update', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    const { songIds, updates, tagOperation } = req.body || {};
    if (!Array.isArray(songIds) || songIds.length === 0 || songIds.some((id: unknown) => typeof id !== 'string' || !id.trim())) {
      return res.status(400).json({ success: false, error: 'A non-empty songIds array is required.' });
    }
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: 'A valid updates object is required.' });
    }
    if (tagOperation && (!['add', 'remove', 'set'].includes(tagOperation.action) || !Array.isArray(tagOperation.tags))) {
      return res.status(400).json({ success: false, error: 'Invalid tag operation.' });
    }
    const updated = await bulkUpdateSongsDb(songIds, updates, tagOperation);
    if (updated.length !== new Set(songIds).size) {
      return res.status(409).json({ success: false, error: 'Some selected songs were not found. Refresh the library and try again.', count: updated.length, songs: updated });
    }
    return res.json({ success: true, count: updated.length, songs: updated });
  } catch (error: any) {
    console.error('Bulk update songs error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Bulk update failed.' });
  }
});

// Bulk Delete Songs
app.post('/api/songs/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { songIds } = req.body;
    if (!Array.isArray(songIds) || songIds.length === 0) {
      return res.status(400).json({ success: false, error: 'songIds array is required' });
    }
    await bulkDeleteSongsDb(songIds);
    res.json({ success: true, count: songIds.length });
  } catch (error: any) {
    console.error('Bulk delete songs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-Tag Rules Endpoints
app.get('/api/settings/auto-tags', async (_req: Request, res: Response) => {
  try {
    const rules = await getSettingDb('auto_tag_rules');
    res.json({ success: true, rules: rules || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/auto-tags', async (req: Request, res: Response) => {
  try {
    const { rules } = req.body;
    await setSettingDb('auto_tag_rules', rules);
    res.json({ success: true, rules });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Spotlight Config Endpoints
app.get('/api/settings/spotlight', async (_req: Request, res: Response) => {
  try {
    const config = await getSettingDb('spotlight_config');
    res.json({
      success: true,
      config: config || {
        enabled: false,
        title: '🌟 Exclusive Spotlight Showcase',
        subtitle: 'Experience this week’s premier sound selection — all regular channels paused.',
        bannerBadgeText: 'SPOTLIGHT ONLY MODE ACTIVE',
        theme: 'gold',
        hideAllOtherElements: true,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/spotlight', async (req: Request, res: Response) => {
  try {
    const { config } = req.body;
    await setSettingDb('spotlight_config', config);
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// ----------------- LIVE RADIO -----------------
const RADIO_CONFIG_SETTING = 'radio_config_v1';
const RADIO_CHAT_BANS_SETTING = 'radio_chat_banned_users_v1';

type RadioProgram = {
  name: string;
  description: string;
  songIds: string[];
  startsAt?: string | null;
};

type RadioConfig = {
  enabled: boolean;
  stationName: string;
  stationDescription: string;
  currentProgram: RadioProgram;
  startedAt: string;
  nextProgram: RadioProgram | null;
  autoStartScheduled?: boolean;
  pausedAt?: string | null;
  loopPlaylist?: boolean;
  playbackRate?: number;
  /** Changes whenever the authoritative playback timeline is repositioned. */
  syncRevision?: number;
  /** A single server-issued audible start boundary shared by every connected listener. */
  syncAtServerMs?: number | null;
  /** The track associated with the stored synchronization boundary. */
  syncTrackId?: string | null;
};

const DEFAULT_RADIO_CONFIG: RadioConfig = {
  enabled: false,
  stationName: 'YouSong Radio',
  stationDescription: 'Live music, shared together.',
  currentProgram: { name: 'Now Playing', description: '', songIds: [] },
  startedAt: new Date().toISOString(),
  nextProgram: null,
  autoStartScheduled: true,
  pausedAt: null,
  loopPlaylist: false,
  playbackRate: 1,
  syncRevision: 0,
};

function cleanRadioProgram(value: any): RadioProgram {
  const startsAtDate = value?.startsAt ? new Date(value.startsAt) : null;
  return {
    name: String(value?.name || 'Untitled program').trim().slice(0, 80) || 'Untitled program',
    description: String(value?.description || '').trim().slice(0, 240),
    songIds: Array.isArray(value?.songIds)
      ? [...new Set<string>((value.songIds as unknown[]).map((id: unknown) => String(id)).filter((id: string) => id.length > 0))].slice(0, 100)
      : [],
    startsAt: startsAtDate && Number.isFinite(startsAtDate.getTime()) ? startsAtDate.toISOString() : null,
  };
}

async function resolveRadioState() {
  let config = await getPersistentSettingDb<RadioConfig>(RADIO_CONFIG_SETTING) || { ...DEFAULT_RADIO_CONFIG };
  let now = await getPersistentDbNowMs();
  const playbackRate = Math.min(2, Math.max(0.5, Number(config.playbackRate) || 1));
  const nextStartsAt = config.nextProgram?.startsAt ? new Date(config.nextProgram.startsAt).getTime() : NaN;

  // Promote a scheduled program on the server, so every connected listener sees the same transition.
  if (config.nextProgram && Number.isFinite(nextStartsAt) && nextStartsAt <= now) {
    // A scheduled program is an instruction to go live at its start time.
    config = {
      ...config,
      enabled: config.autoStartScheduled !== false,
      pausedAt: null,
      currentProgram: { ...config.nextProgram, startsAt: null },
      startedAt: new Date(nextStartsAt).toISOString(),
      nextProgram: null,
      syncRevision: Math.max(0, Number(config.syncRevision) || 0) + 1,
      syncTrackId: null,
      syncAtServerMs: now + 6000,
    };
    await setPersistentSettingDb(RADIO_CONFIG_SETTING, config);
    await clearRadioChatMessagesDb();
  }

  const songs = await getSongsPersistentDb();
  // Anchor the elapsed clock after the playlist read, immediately before deriving the state.
  now = await getPersistentDbNowMs();
  const songMap = new Map(songs.map((song: any) => [String(song.id), song]));
  const playlist = (config.currentProgram?.songIds || [])
    .map((id) => songMap.get(String(id)))
    .filter(Boolean) as any[];
  let currentSong: any = null;
  let elapsedSeconds = 0;
  let currentIndex = 0;
  let programElapsedSeconds = 0;

  if (config.enabled && playlist.length) {
    const durations = playlist.map((song) => Math.max(1, Number(song.durationExact) || Number(song.duration) || 180));
    const totalDuration = durations.reduce((sum, value) => sum + value, 0);
    const startedAtMs = new Date(config.startedAt || now).getTime();
    const radioClockMs = config.pausedAt ? new Date(config.pausedAt).getTime() : now;
    programElapsedSeconds = Math.max(0, ((Number.isFinite(radioClockMs) ? radioClockMs : now) - (Number.isFinite(startedAtMs) ? startedAtMs : now)) / 1000) * playbackRate;
    if (!config.pausedAt && !config.loopPlaylist && programElapsedSeconds >= totalDuration) {
      // A broadcast ends when its selected playlist finishes; do not silently loop it forever.
      config = { ...config, enabled: false };
      await setPersistentSettingDb(RADIO_CONFIG_SETTING, config);
      await clearRadioChatMessagesDb();
    }
    let offset = config.loopPlaylist ? programElapsedSeconds % totalDuration : Math.min(programElapsedSeconds, Math.max(0, totalDuration - 0.25));
    for (let index = 0; index < playlist.length; index++) {
      if (offset < durations[index] || index === playlist.length - 1) {
        currentSong = playlist[index];
        currentIndex = index;
        elapsedSeconds = Math.min(durations[index] - 0.25, offset);
        break;
      }
      offset -= durations[index];
    }
    if (!config.enabled) { currentSong = null; elapsedSeconds = 0; currentIndex = 0; }
  }

  // The first state request that observes a natural track transition writes one
  // future start barrier to persistent config. All listeners then receive the
  // same boundary instead of independently rounding their local clocks.
  if (config.enabled && !config.pausedAt && currentSong) {
    const currentTrackId = String(currentSong.id);
    if (config.syncTrackId !== currentTrackId) {
      config = {
        ...config,
        syncTrackId: currentTrackId,
        syncAtServerMs: now + 6000,
      };
      await setPersistentSettingDb(RADIO_CONFIG_SETTING, config);
    }
  }

  const nextAt = config.nextProgram?.startsAt ? new Date(config.nextProgram.startsAt).getTime() : NaN;
  return {
    enabled: Boolean(config.enabled),
    stationName: config.stationName || 'YouSong Radio',
    stationDescription: config.stationDescription || '',
    currentProgram: config.currentProgram || null,
    startedAt: config.startedAt,
    currentSong,
    elapsedSeconds,
    currentIndex,
    playlist,
    nextProgram: config.nextProgram || null,
    nextStartsInMs: Number.isFinite(nextAt) ? Math.max(0, nextAt - now) : null,
    paused: Boolean(config.pausedAt),
    loopPlaylist: Boolean(config.loopPlaylist),
    playbackRate,
    syncRevision: Math.max(0, Number(config.syncRevision) || 0),
    syncAtServerMs: Number.isFinite(Number(config.syncAtServerMs)) ? Number(config.syncAtServerMs) : null,
    serverNow: new Date(now).toISOString(),
  };
}

app.get('/api/radio/state', async (req: Request, res: Response) => {
  // Capture both ends of the server-side request window. RadioView combines these
  // with the browser's monotonic timestamps using the NTP four-timestamp equation.
  const serverReceivedAtMs = Date.now();
  try {
    res.setHeader('Cache-Control', 'no-store');
    const state = await resolveRadioState();
    // Regular listeners receive only the currently playing track, never the station lineup or schedule.
    if (!isAdminReq(req)) {
      delete (state as any).playlist;
      delete (state as any).nextProgram;
      delete (state as any).nextStartsInMs;
      delete (state as any).currentIndex;
      if (state.currentProgram) state.currentProgram = { name: state.currentProgram.name, description: state.currentProgram.description, songIds: [] };
    }
    // Bracket a PostgreSQL clock read with app-server timestamps so the
    // browser clock can be translated to the authoritative database clock.
    const dbClockRequestStartedAtMs = Date.now();
    const serverDbTimeMs = await getPersistentDbNowMs();
    const dbClockRequestFinishedAtMs = Date.now();
    const databaseOffsetMs = serverDbTimeMs - (dbClockRequestStartedAtMs + dbClockRequestFinishedAtMs) / 2;
    const serverSentAtMs = Date.now();
    return res.json({
      success: true,
      state,
      clock: { serverReceivedAtMs, serverSentAtMs, databaseOffsetMs },
    });
  } catch (error: any) {
    console.error('[Radio] State error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Could not load radio state.' });
  }
});

app.post('/api/radio/duration', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Sign in before reporting radio playback duration.' });
    const songId = String(req.body?.songId || '');
    const exactSeconds = Number(req.body?.seconds);
    if (!songId || !Number.isFinite(exactSeconds) || exactSeconds < 5 || exactSeconds > 43200) {
      return res.status(400).json({ success: false, error: 'Invalid radio song duration.' });
    }
    const exact = Math.round(exactSeconds * 1000) / 1000;
    const rounded = Math.round(exact);
    const state = await resolveRadioState();
    if (!state.enabled || String(state.currentSong?.id || '') !== songId) {
      return res.status(409).json({ success: false, error: 'Duration can only be reported for the current live radio song.' });
    }
    const currentExact = Number(state.currentSong?.durationExact) || Number(state.currentSong?.duration) || 0;
    if (!Number(state.currentSong?.durationExact) || Math.abs(currentExact - exact) >= 0.02) {
      await updateSongDurationExactDb(songId, exact);
    }
    return res.json({ success: true, duration: rounded, durationExact: exact });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Could not update radio duration.' });
  }
});

app.get('/api/admin/radio/config', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    const config = await getPersistentSettingDb<RadioConfig>(RADIO_CONFIG_SETTING) || DEFAULT_RADIO_CONFIG;
    return res.json({ success: true, config });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Could not load radio settings.' });
  }
});

app.put('/api/admin/radio/config', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    const body = req.body || {};
    const sharedNowMs = await getPersistentDbNowMs();
    const existing = await getPersistentSettingDb<RadioConfig>(RADIO_CONFIG_SETTING) || DEFAULT_RADIO_CONFIG;
    const currentProgram = cleanRadioProgram(body.currentProgram || existing.currentProgram);
    const nextProgram = body.nextProgram ? cleanRadioProgram(body.nextProgram) : null;
    const allSongs = await getSongsPersistentDb();
    const validIds = new Set(allSongs.map((song: any) => String(song.id)));
    const requestedIds = [...currentProgram.songIds, ...(nextProgram?.songIds || [])];
    if (requestedIds.some((id) => !validIds.has(id))) {
      return res.status(400).json({ success: false, error: 'Some selected songs no longer exist. Refresh the admin song list and try again.' });
    }
    if (body.enabled !== false && currentProgram.songIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Choose at least one song before starting the radio.' });
    }
    if (nextProgram) {
      if (!nextProgram.songIds.length) return res.status(400).json({ success: false, error: 'Choose at least one song for the scheduled program.' });
      if (!nextProgram.startsAt || !Number.isFinite(new Date(nextProgram.startsAt).getTime())) {
        return res.status(400).json({ success: false, error: 'Set a valid start time for the next program.' });
      }
      if (new Date(nextProgram.startsAt).getTime() <= sharedNowMs) {
        return res.status(400).json({ success: false, error: 'The next program must be scheduled in the future.' });
      }
    }
    const startNow = body.startNow !== false;
    const config: RadioConfig = {
      enabled: Boolean(body.enabled),
      stationName: String(body.stationName || existing.stationName || 'YouSong Radio').trim().slice(0, 80) || 'YouSong Radio',
      stationDescription: String(body.stationDescription || '').trim().slice(0, 240),
      currentProgram,
      startedAt: startNow ? new Date(sharedNowMs).toISOString() : existing.startedAt,
      nextProgram,
      autoStartScheduled: body.autoStartScheduled !== false,
      pausedAt: body.enabled === false ? null : (startNow ? null : (existing.pausedAt || null)),
      loopPlaylist: existing.loopPlaylist === true,
      playbackRate: Math.min(2, Math.max(0.5, Number(existing.playbackRate) || 1)),
      syncRevision: Math.max(0, Number(existing.syncRevision) || 0) + 1,
      syncTrackId: null,
      syncAtServerMs: body.enabled && startNow ? sharedNowMs + 6000 : null,
    };
    await setPersistentSettingDb(RADIO_CONFIG_SETTING, config);
    if (existing.enabled && !config.enabled) await clearRadioChatMessagesDb();
    return res.json({ success: true, config });
  } catch (error: any) {
    console.error('[Radio] Config update error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Could not save radio settings.' });
  }
});

app.post('/api/admin/radio/control', async (req: Request, res: Response) => {
  const serverReceivedAtMs = Date.now();
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    const action = String(req.body?.action || '');
    const config = await getPersistentSettingDb<RadioConfig>(RADIO_CONFIG_SETTING) || DEFAULT_RADIO_CONFIG;
    const commandNowMs = await getPersistentDbNowMs();
    if (action === 'toggle-pause') {
      if (!config.enabled) return res.status(409).json({ success: false, error: 'There is no active broadcast to pause or resume.' });
      if (config.pausedAt) {
        const pausedAtMs = new Date(config.pausedAt).getTime();
        const startedAtMs = new Date(config.startedAt).getTime();
        if (!Number.isFinite(pausedAtMs) || !Number.isFinite(startedAtMs)) {
          return res.status(409).json({ success: false, error: 'The saved radio clock is invalid. Restart the broadcast to reset it.' });
        }
        config.startedAt = new Date(startedAtMs + Math.max(0, commandNowMs - pausedAtMs)).toISOString();
        config.pausedAt = null;
      } else {
        config.pausedAt = new Date(commandNowMs).toISOString();
      }
    } else if (action === 'pause') {
      if (!config.enabled) return res.status(409).json({ success: false, error: 'There is no active broadcast to pause.' });
      config.pausedAt = config.pausedAt || new Date(commandNowMs).toISOString();
    } else if (action === 'resume') {
      if (!config.enabled) return res.status(409).json({ success: false, error: 'There is no active broadcast to resume.' });
      if (config.pausedAt) {
        const pausedAtMs = new Date(config.pausedAt).getTime();
        const startedAtMs = new Date(config.startedAt).getTime();
        config.startedAt = new Date(startedAtMs + Math.max(0, commandNowMs - pausedAtMs)).toISOString();
        config.pausedAt = null;
      }
    } else if (action === 'seek') {
      if (!config.enabled) return res.status(409).json({ success: false, error: 'There is no active broadcast to seek.' });
      const state = await resolveRadioState();
      const playlist = Array.isArray(state.playlist) ? state.playlist : [];
      const index = Number(state.currentIndex);
      if (!state.currentSong || !playlist[index]) return res.status(409).json({ success: false, error: 'There is no current song to seek.' });
      const duration = Math.max(1, Number(playlist[index].durationExact) || Number(playlist[index].duration) || 180);
      const requested = Number(req.body?.positionSeconds);
      if (!Number.isFinite(requested)) return res.status(400).json({ success: false, error: 'A valid song position is required.' });
      const positionSeconds = Math.min(duration - 0.25, Math.max(0, requested));
      const programOffset = playlist.slice(0, index).reduce((sum: number, song: any) => sum + Math.max(1, Number(song.durationExact) || Number(song.duration) || 180), 0) + positionSeconds;
      const stateNowMs = Date.parse(state.serverNow);
      const anchor = config.pausedAt ? new Date(config.pausedAt).getTime() : (Number.isFinite(stateNowMs) ? stateNowMs : commandNowMs);
      const rate = Math.min(2, Math.max(0.5, Number(config.playbackRate) || 1));
      config.startedAt = new Date(anchor - (programOffset / rate) * 1000).toISOString();
    } else if (action === 'set-speed') {
      if (!config.enabled) return res.status(409).json({ success: false, error: 'There is no active broadcast to change speed.' });
      const requestedRate = Number(req.body?.playbackRate);
      if (!Number.isFinite(requestedRate) || requestedRate < 0.5 || requestedRate > 2) {
        return res.status(400).json({ success: false, error: 'Broadcast speed must be between 0.5x and 2x.' });
      }
      const state = await resolveRadioState();
      const playlist = Array.isArray(state.playlist) ? state.playlist : [];
      const index = Number(state.currentIndex);
      if (!state.currentSong || !playlist[index]) return res.status(409).json({ success: false, error: 'There is no current song to change speed.' });
      const programOffset = playlist.slice(0, index).reduce((sum: number, song: any) => sum + Math.max(1, Number(song.durationExact) || Number(song.duration) || 180), 0) + Number(state.elapsedSeconds || 0);
      const stateNowMs = Date.parse(state.serverNow);
      const anchor = config.pausedAt ? new Date(config.pausedAt).getTime() : (Number.isFinite(stateNowMs) ? stateNowMs : commandNowMs);
      config.playbackRate = requestedRate;
      config.startedAt = new Date(anchor - (programOffset / requestedRate) * 1000).toISOString();
    } else if (action === 'next') {
      if (!config.enabled) return res.status(409).json({ success: false, error: 'There is no active broadcast.' });
      const state = await resolveRadioState();
      const playlist = Array.isArray(state.playlist) ? state.playlist : [];
      if (!state.currentSong || !playlist.length) return res.status(409).json({ success: false, error: 'There is no current song to skip.' });
      const nextIndex = Number(state.currentIndex) + 1;
      if (nextIndex >= playlist.length && !config.loopPlaylist) {
        config.enabled = false;
        config.pausedAt = null;
        await clearRadioChatMessagesDb();
      } else {
        const targetIndex = nextIndex % playlist.length;
        const elapsedBeforeTarget = playlist.slice(0, targetIndex).reduce((sum: number, song: any) => sum + Math.max(1, Number(song.durationExact) || Number(song.duration) || 180), 0);
        const stateNowMs = Date.parse(state.serverNow);
        const now = config.pausedAt ? new Date(config.pausedAt).getTime() : (Number.isFinite(stateNowMs) ? stateNowMs : commandNowMs);
        const rate = Math.min(2, Math.max(0.5, Number(config.playbackRate) || 1));
        config.startedAt = new Date(now - (elapsedBeforeTarget / rate) * 1000).toISOString();
      }
    } else if (action === 'toggle-loop') {
      config.loopPlaylist = !config.loopPlaylist;
    } else {
      return res.status(400).json({ success: false, error: 'Unknown radio control action.' });
    }
    if (['toggle-pause', 'pause', 'resume', 'seek', 'set-speed', 'next'].includes(action)) {
      config.syncRevision = Math.max(0, Number(config.syncRevision) || 0) + 1;
      config.syncAtServerMs = config.enabled && !config.pausedAt ? commandNowMs + 6000 : null;
    }
    await setPersistentSettingDb(RADIO_CONFIG_SETTING, config);
    const state = await resolveRadioState();
    // Bracket a PostgreSQL clock read with app-server timestamps so the
    // browser clock can be translated to the authoritative database clock.
    const dbClockRequestStartedAtMs = Date.now();
    const serverDbTimeMs = await getPersistentDbNowMs();
    const dbClockRequestFinishedAtMs = Date.now();
    const databaseOffsetMs = serverDbTimeMs - (dbClockRequestStartedAtMs + dbClockRequestFinishedAtMs) / 2;
    const serverSentAtMs = Date.now();
    return res.json({
      success: true,
      paused: Boolean(config.pausedAt),
      loopPlaylist: Boolean(config.loopPlaylist),
      state,
      clock: { serverReceivedAtMs, serverSentAtMs, databaseOffsetMs },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Could not control radio.' });
  }
});

let radioBanMigrationPromise: Promise<void> | null = null;

/**
 * Import the old JSON settings list into the durable moderation table exactly once.
 * Every current permission check uses the dedicated SQL table and fails closed if
 * the persistent database is unavailable.
 */
async function ensureRadioBanMigration(): Promise<void> {
  if (!radioBanMigrationPromise) {
    radioBanMigrationPromise = (async () => {
      await listRadioChatBansDb(); // Assert persistent storage before trusting any ban state.
      const legacy = await getSettingDb<unknown>(RADIO_CHAT_BANS_SETTING);
      if (!Array.isArray(legacy) || legacy.length === 0) return;
      for (const rawId of legacy) {
        const userId = String(rawId || '').trim();
        if (!userId) continue;
        const existing = await getRadioChatBanDb(userId);
        if (existing) continue;
        const target = await getUserByUid(userId);
        if (!target || target.role === 'admin') continue;
        await upsertRadioChatBanDb({
          userId: target.uid,
          username: String(target.username || 'Member'),
          reason: 'Migrated from the previous radio moderation system.',
          bannedBy: 'system-migration',
        });
      }
      // Clearing the old list is cleanup only. A failed clear is harmless because
      // the migration is idempotent and will not duplicate the dedicated records.
      await setSettingDb(RADIO_CHAT_BANS_SETTING, []);
    })().catch((error) => {
      radioBanMigrationPromise = null;
      throw error;
    });
  }
  await radioBanMigrationPromise;
}

app.get('/api/radio/chat', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Log in to join radio chat.' });
    await ensureRadioBanMigration();
    const station = await resolveRadioState();
    const banned = user.role !== 'admin' ? await getRadioChatBanDb(user.uid) : null;
    const canChat = user.role === 'admin' || (!banned && !user.chatBlocked);
    const messages = station.enabled && canChat ? await getRadioChatMessagesDb(60) : [];
    return res.json({
      success: true,
      messages,
      canChat,
      banned: Boolean(banned),
      banReason: user.chatBlocked ? 'account-chat-block' : banned ? 'radio-chat-ban' : null,
      banNote: banned?.reason || null,
    });
  } catch (error: any) {
    console.error('[RadioChat] Could not read chat or moderation state:', error);
    return res.status(503).json({ success: false, error: error.message || 'Radio chat is temporarily unavailable.' });
  }
});

app.post('/api/radio/chat', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Log in to chat.' });
    await ensureRadioBanMigration();
    const station = await resolveRadioState();
    if (!station.enabled) return res.status(409).json({ success: false, error: 'Radio chat is closed because there is no active broadcast.' });
    const banned = user.role !== 'admin' ? await getRadioChatBanDb(user.uid) : null;
    if (user.role !== 'admin' && (banned || user.chatBlocked)) {
      return res.status(403).json({
        success: false,
        error: user.chatBlocked ? 'Chat access is disabled for this account.' : 'You are banned from radio chat by an administrator.',
        code: user.chatBlocked ? 'CHAT_ACCOUNT_BLOCKED' : 'RADIO_CHAT_BANNED',
        banNote: banned?.reason || null,
      });
    }
    const message = String(req.body?.message || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!message) return res.status(400).json({ success: false, error: 'Write a message first.' });
    const created = await createRadioChatMessageDb({
      id: 'radio-chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      userId: user.uid,
      username: String(user.username || 'Listener').slice(0, 40),
      message,
    });
    return res.json({ success: true, message: created });
  } catch (error: any) {
    console.error('[RadioChat] Could not send chat message:', error);
    return res.status(503).json({ success: false, error: error.message || 'Radio chat is temporarily unavailable.' });
  }
});

app.get('/api/admin/radio/chat-bans', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    await ensureRadioBanMigration();
    const bans = await listRadioChatBansDb();
    return res.json({
      success: true,
      bans: bans.map((ban) => ({
        userId: ban.userId,
        username: ban.username,
        reason: ban.reason || '',
        bannedBy: ban.bannedBy,
        createdAt: ban.createdAt instanceof Date ? ban.createdAt.toISOString() : String(ban.createdAt || ''),
      })),
      bannedUserIds: bans.map((ban) => ban.userId),
    });
  } catch (error: any) {
    console.error('[RadioModeration] Could not load bans:', error);
    return res.status(503).json({ success: false, error: error.message || 'Could not load the persistent radio ban list.' });
  }
});

app.put('/api/admin/radio/chat-ban', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    await ensureRadioBanMigration();
    const userId = String(req.body?.userId || '').trim();
    if (!userId || userId.length > 200) return res.status(400).json({ success: false, error: 'Choose a valid user account.' });
    if (typeof req.body?.banned !== 'boolean') return res.status(400).json({ success: false, error: 'The ban action must be true or false.' });
    const target = await getUserByUid(userId);
    if (!target) return res.status(404).json({ success: false, error: 'User not found. Refresh the account list and try again.' });
    if (target.role === 'admin') return res.status(400).json({ success: false, error: 'An administrator cannot be blocked from radio chat.' });

    if (req.body.banned) {
      await upsertRadioChatBanDb({
        userId: target.uid,
        username: String(target.username || 'Member').slice(0, 80),
        reason: String(req.body?.reason || '').trim().slice(0, 300) || null,
        bannedBy: String(getAuthUser(req)?.uid || 'admin'),
      });
    } else {
      await deleteRadioChatBanDb(target.uid);
    }

    const bans = await listRadioChatBansDb();
    return res.json({
      success: true,
      bannedUserIds: bans.map((ban) => ban.userId),
      bans: bans.map((ban) => ({
        userId: ban.userId,
        username: ban.username,
        reason: ban.reason || '',
        bannedBy: ban.bannedBy,
        createdAt: ban.createdAt instanceof Date ? ban.createdAt.toISOString() : String(ban.createdAt || ''),
      })),
      changedUserId: target.uid,
      banned: req.body.banned,
    });
  } catch (error: any) {
    console.error('[RadioModeration] Ban update failed:', error);
    return res.status(503).json({ success: false, error: error.message || 'Radio moderation could not save this change.' });
  }
});

// ----------------- PLAYLISTS -----------------
app.get('/api/playlists', async (req: Request, res: Response) => {
  try {
    // Members only ever get their own playlists; admins may ask for anyone's
    const userId = isAdminReq(req) ? (req.query.userId as string | undefined) : getAuthUser(req).uid;
    const list = await getPlaylistsDb(userId);
    res.json({ playlists: list });
  } catch (error: any) {
    console.error('Get playlists error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/playlists', async (req: Request, res: Response) => {
  try {
    const { name, description, coverUrl } = req.body;
    const userId = getAuthUser(req).uid;
    if (!name || !userId) {
      return res.status(400).json({ error: 'Name and userId are required' });
    }

    const newPl = await createPlaylistDb({
      id: `pl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      name: name.trim(),
      description: description?.trim() || '',
      coverUrl: coverUrl || '/src/assets/images/lofi_study_glass_1791054585559.jpg',
      songIds: [],
      createdAt: new Date().toISOString(),
    });
    res.json({ success: true, playlist: newPl });
  } catch (error: any) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/playlists/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isAdminReq(req)) {
      const mine = await getPlaylistsDb(getAuthUser(req).uid);
      if (!mine.some((p: any) => p.id === id)) return res.status(403).json({ error: 'Not your playlist' });
    }
    const { userId: _ignoredOwner, id: _ignoredId, ...updates } = req.body || {};
    const updated = await updatePlaylistDb(id, updates);
    res.json({ success: true, playlist: updated });
  } catch (error: any) {
    console.error('Update playlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/playlists/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isAdminReq(req)) {
      const mine = await getPlaylistsDb(getAuthUser(req).uid);
      if (!mine.some((p: any) => p.id === id)) return res.status(403).json({ error: 'Not your playlist' });
    }
    await deletePlaylistDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete playlist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------- FAVORITES -----------------
app.get('/api/favorites/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (getAuthUser(req).uid !== userId && !isAdminReq(req)) return res.status(403).json({ error: 'Not allowed' });
    const favs = await getFavoritesDb(userId);
    res.json({ favorites: favs });
  } catch (error: any) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/favorites/:userId/toggle', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (getAuthUser(req).uid !== userId && !isAdminReq(req)) return res.status(403).json({ error: 'Not allowed' });
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });
    const isFav = await toggleFavoriteDb(userId, songId);
    res.json({ success: true, isFavorite: isFav });
  } catch (error: any) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------- SONG REQUESTS & GOOGLE DRIVE UPLOAD PIPELINE -----------------
app.get('/api/requests', async (req: Request, res: Response) => {
  try {
    const list = await getRequestsPersistentDb();
    // Regular users only ever see their own submissions. The holding queue stays hidden.
    if (!isAdminReq(req)) {
      const me = getAuthUser(req).uid;
      const userFiltered = list.filter((r) => r.requestedByUserId === me);
      res.setHeader('Cache-Control', 'no-store, private');
      return res.json({ requests: userFiltered });
    }

    // Admin sees all requests in the admin dashboard review queue
    res.setHeader('Cache-Control', 'no-store, private');
    res.json({ requests: list });
  } catch (error: any) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: error.message });
  }
});

const SONG_REQUEST_SETTINGS = 'song_request_settings_v1';
type SongRequestSettings = { enabled: boolean; notice: string; icon: string; showImageLink: boolean; requireImageLink: boolean };
const DEFAULT_SONG_REQUEST_SETTINGS: SongRequestSettings = {
  enabled: true, notice: '', icon: '🎵', showImageLink: true, requireImageLink: true,
};

app.get('/api/song-requests/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getPersistentSettingDb<SongRequestSettings>(SONG_REQUEST_SETTINGS) || DEFAULT_SONG_REQUEST_SETTINGS;
    return res.json({ success: true, settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Could not load song request settings.' });
  }
});

app.get('/api/admin/song-requests/settings', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    const settings = await getPersistentSettingDb<SongRequestSettings>(SONG_REQUEST_SETTINGS) || DEFAULT_SONG_REQUEST_SETTINGS;
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, settings });
  } catch (error: any) {
    return res.status(503).json({ success: false, error: error.message || 'Could not load persistent song request settings.' });
  }
});

app.put('/api/admin/song-requests/settings', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    const body = req.body || {};
    const settings: SongRequestSettings = {
      enabled: body.enabled !== false,
      notice: String(body.notice || '').trim().slice(0, 300),
      icon: String(body.icon || '🎵').trim().slice(0, 12) || '🎵',
      showImageLink: body.showImageLink !== false,
      requireImageLink: body.showImageLink !== false && body.requireImageLink !== false,
    };
    await setPersistentSettingDb(SONG_REQUEST_SETTINGS, settings);
    return res.json({ success: true, settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Could not save song request settings.' });
  }
});

app.post('/api/requests', async (req: Request, res: Response) => {
  try {
    const { songTitle, artist, notes, genre } = req.body || {};
    const requestSettings = await getPersistentSettingDb<SongRequestSettings>(SONG_REQUEST_SETTINGS) || DEFAULT_SONG_REQUEST_SETTINGS;
    if (!requestSettings.enabled) {
      return res.status(403).json({ success: false, error: requestSettings.notice || 'Song requests are temporarily closed.', requestClosed: true, icon: requestSettings.icon });
    }
    const submittedImageLink = String(req.body?.webLink || req.body?.imageLink || '').trim();
    if (requestSettings.showImageLink && requestSettings.requireImageLink && !submittedImageLink) {
      return res.status(400).json({ success: false, error: 'An image link is required with every song request.' });
    }
    if (submittedImageLink) {
      try {
        const parsed = new URL(submittedImageLink);
        if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error('invalid');
      } catch {
        return res.status(400).json({ success: false, error: 'Enter a valid HTTPS image link.' });
      }
    }
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ error: 'Please log in again.' });
    if (!songTitle || !String(songTitle).trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const newReq = await createRequestDb({
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      songTitle: String(songTitle).trim(),
      artist: String(artist || '').trim(),
      webLink: submittedImageLink,
      notes: String(notes || '').trim(),
      requestedByUserId: authUser.uid,
      requestedByUsername: authUser.username || 'Listener',
      createdAt: new Date().toISOString(),
      status: 'pending',
      requestType: 'song',
      genre: String(genre || 'Vibe / Chill').trim().slice(0, 80),
    });

    console.log(`[SongPipeline] New Google Drive-only song request: "${newReq.songTitle}" by ${newReq.requestedByUsername}`);
    return res.json({ success: true, request: newReq });
  } catch (error: any) {
    console.error('Create request error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Admin review step: update request metadata and the estimated upload time before the Drive-only upload.
app.patch('/api/admin/requests/:id', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ error: 'Administrators only.' });
    if (!(await checkSqlAvailability())) return res.status(503).json({ success: false, error: 'The persistent database is unavailable. The request was not changed.' });
    const { id } = req.params;
    const {
      songTitle,
      artist,
      coverUrl,
      notes,
      genre,
      status,
      adminNote,
      duration,
      estimatedUploadAt,
    } = req.body;

    const existingReq = await getRequestByIdPersistentDb(id);
    if (!existingReq) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const updates: any = {};
    if (existingReq.status === 'published' && (songTitle !== undefined || artist !== undefined || genre !== undefined || coverUrl !== undefined)) {
      return res.status(409).json({ success: false, error: 'Unpublish this song before changing its request metadata. This keeps the request and published library entry consistent.' });
    }
    if (songTitle !== undefined) {
      const cleanTitle = String(songTitle || '').trim();
      if (!cleanTitle) return res.status(400).json({ success: false, error: 'Song title cannot be empty.' });
      updates.songTitle = cleanTitle.slice(0, 160);
    }
    if (artist !== undefined) updates.artist = String(artist || '').trim().slice(0, 120);
    if (coverUrl !== undefined) {
      const normalizedCover = String(coverUrl).trim();
      if (normalizedCover && !/^https:\/\/lh3\.googleusercontent\.com\/d\/[A-Za-z0-9_-]+/i.test(normalizedCover)) {
        return res.status(400).json({ error: 'Request artwork must be uploaded to the site Google Drive.' });
      }
      updates.coverUrl = normalizedCover;
    }
    if (notes !== undefined) updates.notes = String(notes || '').trim().slice(0, 1000);
    if (genre !== undefined) updates.genre = String(genre || '').trim().slice(0, 80);
    if (adminNote !== undefined) updates.adminNote = String(adminNote || '').trim().slice(0, 1000);
    if (estimatedUploadAt !== undefined) {
      const parsedEta = estimatedUploadAt ? new Date(estimatedUploadAt) : null;
      if (parsedEta && Number.isNaN(parsedEta.getTime())) return res.status(400).json({ error: 'Estimated upload time is invalid.' });
      updates.estimatedUploadAt = parsedEta ? parsedEta.toISOString() : null;
    }
    if (status !== undefined) {
      if (!['approved', 'declined'].includes(String(status))) return res.status(400).json({ success: false, error: 'Use the dedicated upload and publish actions for staging or publishing. Direct status changes are limited to approve or decline.' });
      const eligible = status === 'approved'
        ? ['pending', 'processing', 'approved'].includes(existingReq.status)
        : ['pending', 'processing', 'approved', 'declined'].includes(existingReq.status);
      if (!eligible) return res.status(409).json({ success: false, error: 'This request has already moved beyond review. Refresh the pipeline before trying again.' });
      updates.status = status;
      updates.reviewedAt = new Date().toISOString();
      if (status === 'approved') {
        updates.approvedAt = new Date().toISOString();
        updates.reviewedAt = new Date().toISOString();
        updates.processingProgress = 'Approved and waiting for an administrator to upload the audio file.';
        updates.processingError = null;
      } else {
        updates.processingProgress = 'Declined by an administrator.';
      }
    }
    if (typeof duration === 'number' && duration >= 5 && duration <= 43200) updates.duration = Math.round(duration);

    const updated = await updateRequestFullDb(id, updates);
    console.log(`[SongPipeline] Admin updated request metadata for ${id}: "${updated?.songTitle}" - "${updated?.artist}"`);
    res.json({ success: true, request: updated });
  } catch (error: any) {
    console.error('Patch request error:', error);
    res.status(500).json({ error: error.message });
  }
});


// ----------------- SITE-WIDE GOOGLE DRIVE CONNECTION -----------------
// One Google Drive account is connected to the site. OAuth refresh tokens are encrypted
// before storage in system_settings, so the browser never owns the long-lived credential.
const DRIVE_TOKEN_SETTING = 'site_google_drive_refresh_token_v1';
const DRIVE_STATE_SETTING = 'site_google_drive_oauth_state_v1';
const DRIVE_LIBRARY_SCOPE_VERSION_SETTING = 'site_google_drive_library_scope_version_v3';
const DRIVE_LIBRARY_SCOPE_VERSION = '3';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata';
function driveClientId(): string { return String(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim(); }
function driveClientSecret(): string { return String(process.env.GOOGLE_CLIENT_SECRET || '').trim(); }
function driveRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI.trim();
  const base = String(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://yousound.onrender.com').replace(/\/$/, '');
  return `${base}/api/admin/google-drive/oauth/callback`;
}
function driveEncryptionKey(): Buffer {
  const raw = String(process.env.DRIVE_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('DRIVE_TOKEN_ENCRYPTION_KEY must be a 64-character hex value (32 random bytes).');
  return Buffer.from(raw, 'hex');
}
function encryptDriveToken(token: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', driveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
function decryptDriveToken(payload: string): string {
  const [iv, tag, data] = payload.split('.');
  if (!iv || !tag || !data) throw new Error('Stored Google Drive credential is malformed. Reconnect Drive.');
  const decipher = createDecipheriv('aes-256-gcm', driveEncryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
function signDriveState(payload: string): string {
  const secret = String(process.env.SESSION_SECRET || '').trim();
  if (secret.length < 32) throw new Error('SESSION_SECRET must be configured before connecting Google Drive.');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
let cachedDriveAccessToken: { token: string; expiresAt: number } | null = null;

async function getDriveAccessToken(): Promise<string> {
  if (!driveClientId() || !driveClientSecret()) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Render.');
  if (cachedDriveAccessToken && cachedDriveAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedDriveAccessToken.token;
  }
  const encrypted = await getPersistentSettingDb<string>(DRIVE_TOKEN_SETTING);
  if (!encrypted) throw new Error('The site Google Drive account is not connected yet. Connect it once in Admin → Requests.');

  let refreshToken: string;
  try { refreshToken = decryptDriveToken(encrypted); }
  catch { throw new Error('The saved Google Drive credential cannot be decrypted. Restore the original, unchanged DRIVE_TOKEN_ENCRYPTION_KEY in Render; reconnect only if that key was lost.'); }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: driveClientId(), client_secret: driveClientSecret(), refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const tokenData: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    if (tokenData.error === 'invalid_grant') {
      throw new Error('Google rejected the saved Drive refresh token (invalid_grant). If Google Auth Platform → Audience is still set to Testing, switch Publishing status to In production, then reconnect the site Drive account once. Also confirm the token was not revoked and DRIVE_TOKEN_ENCRYPTION_KEY has not changed.');
    }
    throw new Error(`Google Drive could not refresh its access token (${tokenRes.status}${tokenData.error ? `: ${tokenData.error}` : ''}). Check Render logs; reconnect only if Google has actually revoked or expired the refresh token.`);
  }
  const accessToken = String(tokenData.access_token);
  const expiresInSeconds = Math.max(60, Number(tokenData.expires_in) || 3600);
  cachedDriveAccessToken = { token: accessToken, expiresAt: Date.now() + expiresInSeconds * 1000 };
  return accessToken;
}

// Stream private Google Drive artwork through the site's connected account.
// The browser never depends on Drive's public thumbnail CDN or link-sharing settings.
app.get('/api/drive/cover/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId || '').trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return res.status(400).send('Invalid Google Drive artwork ID.');

  try {
    const accessToken = await getDriveAccessToken();
    const metadataResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?fields=id,name,mimeType,size,trashed&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(20_000) },
    );
    if (!metadataResponse.ok) {
      const detail = (await metadataResponse.text().catch(() => '')).slice(0, 300);
      const status = metadataResponse.status === 404 || metadataResponse.status === 403 ? 404 : 502;
      console.warn('[DriveArtwork] Metadata lookup failed:', metadataResponse.status, detail);
      return res.status(status).send('Artwork is unavailable in the connected Google Drive account.');
    }

    const metadata: any = await metadataResponse.json().catch(() => ({}));
    const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    const mimeType = String(metadata.mimeType || '').toLowerCase();
    const size = Number(metadata.size || 0);
    if (!allowedImageTypes.has(mimeType)) return res.status(415).send('The selected Google Drive file is not a supported image.');
    if (size > 25 * 1024 * 1024) return res.status(413).send('Artwork exceeds the 25 MB image limit.');

    const imageResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(30_000) },
    );
    if (!imageResponse.ok || !imageResponse.body) {
      console.warn('[DriveArtwork] Download failed:', imageResponse.status);
      return res.status(502).send('Google Drive could not stream this artwork.');
    }

    const responseLength = Number(imageResponse.headers.get('content-length') || size || 0);
    if (responseLength > 25 * 1024 * 1024) {
      await imageResponse.body.cancel().catch(() => undefined);
      return res.status(413).send('Artwork exceeds the 25 MB image limit.');
    }
    res.status(200);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (responseLength > 0) res.setHeader('Content-Length', String(responseLength));
    const etag = imageResponse.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);

    const imageStream = (await import('stream')).Readable.fromWeb(imageResponse.body as any);
    imageStream.on('error', (error) => {
      console.error('[DriveArtwork] Stream error:', error);
      if (!res.headersSent) res.status(502).end(); else res.destroy(error);
    });
    res.on('close', () => {
      if (!res.writableEnded) imageStream.destroy();
    });
    return imageStream.pipe(res);
  } catch (error: any) {
    console.error('[DriveArtwork] Could not stream Google Drive artwork:', error);
    return res.status(502).send('Could not connect to Google Drive to load this artwork.');
  }
});

app.get('/api/admin/google-drive/status', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: 'Admin only' });
  const configured = Boolean(driveClientId() && driveClientSecret() && process.env.DRIVE_TOKEN_ENCRYPTION_KEY);
  try {
    if (!configured) return res.json({ connected: false, accountMode: 'site-wide', redirectUri: driveRedirectUri(), configured: false, storageReady: false, error: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and a stable DRIVE_TOKEN_ENCRYPTION_KEY in Render.' });
    driveEncryptionKey();
    const encrypted = await getPersistentSettingDb<string>(DRIVE_TOKEN_SETTING);
    if (encrypted) decryptDriveToken(encrypted); // catches a changed/missing encryption key before a migration starts
    const grantedScopeVersion = await getPersistentSettingDb<string>(DRIVE_LIBRARY_SCOPE_VERSION_SETTING);
    const libraryAccessReady = Boolean(encrypted && grantedScopeVersion === DRIVE_LIBRARY_SCOPE_VERSION);
    return res.json({
      connected: Boolean(encrypted),
      libraryAccessReady,
      reconnectRequired: Boolean(encrypted && !libraryAccessReady),
      accountMode: 'site-wide',
      redirectUri: driveRedirectUri(),
      configured: true,
      storageReady: true,
      storage: 'postgresql',
      libraryAccess: 'read and rename file metadata',
    });
  } catch (error: any) {
    return res.status(200).json({ connected: false, accountMode: 'site-wide', redirectUri: driveRedirectUri(), configured, storageReady: false, error: error.message || 'Persistent Google Drive storage is not available.' });
  }
});

app.get('/api/admin/google-drive/auth-url', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: 'Admin only' });
  try {
    if (!driveClientId() || !driveClientSecret()) return res.status(500).json({ error: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Render.' });
    driveEncryptionKey(); // fail early if encryption is not configured
    const nonce = randomBytes(24).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ nonce, exp: Date.now() + 10 * 60 * 1000, scopeVersion: DRIVE_LIBRARY_SCOPE_VERSION })).toString('base64url');
    const state = `${payload}.${signDriveState(payload)}`;
    await setPersistentSettingDb(DRIVE_STATE_SETTING, state);
    const params = new URLSearchParams({
      client_id: driveClientId(),
      redirect_uri: driveRedirectUri(),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: DRIVE_FILE_SCOPE + ' ' + DRIVE_METADATA_SCOPE,
      state,
    });
    return res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (error: any) { return res.status(500).json({ error: error.message || 'Could not start Google OAuth.' }); }
});

async function getGrantedDriveScopes(accessToken: string): Promise<Set<string>> {
  const response = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken), {
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Google could not verify the Drive permissions granted to this connection (' + response.status + ').');
  return new Set(String(data.scope || '').split(/\s+/).filter(Boolean));
}

app.get('/api/admin/google-drive/oauth/callback', async (req: Request, res: Response) => {
  try {
    // The auth.ts route policy marks this callback public, but it can only save a credential
    // when the one-time signed state matches a value that an authenticated admin stored in DB.
    if (req.query.error) return res.status(400).send(`Google Drive authorization failed: ${String(req.query.error)}. Return to YouSong and try again.`);
    const state = String(req.query.state || ''); const [payload, signature] = state.split('.');
    const expected = payload ? signDriveState(payload) : '';
    if (!payload || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(400).send('Invalid OAuth state. Return to YouSong and reconnect Google Drive.');
    const savedState = await getPersistentSettingDb<string>(DRIVE_STATE_SETTING);
    if (!savedState || savedState !== state) return res.status(400).send('OAuth state expired or already used. Return to YouSong and reconnect Google Drive.');
    const stateData = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!stateData.exp || Date.now() > stateData.exp) return res.status(400).send('OAuth request expired. Return to YouSong and reconnect Google Drive.');
    if (String(stateData.scopeVersion || '') !== DRIVE_LIBRARY_SCOPE_VERSION) return res.status(400).send('This Google Drive authorization request is outdated. Return to YouSong and start the Drive connection again.');
    const code = String(req.query.code || ''); if (!code) return res.status(400).send('Google did not return an authorization code.');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: driveClientId(), client_secret: driveClientSecret(), redirect_uri: driveRedirectUri(), grant_type: 'authorization_code' }) });
    const tokens: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) return res.status(502).send(`Google token exchange failed (${tokenRes.status}). Check the OAuth client and exact redirect URI in Google Cloud Console.`);
    const grantedScopes = await getGrantedDriveScopes(String(tokens.access_token));
    if (!grantedScopes.has(DRIVE_METADATA_SCOPE)) {
      return res.status(403).send('Google did not grant YouSong permission to view and rename Drive file metadata. Return to the site and approve the additional Drive metadata permission so the folder selector can search files and match audio with cover artwork.');
    }
    let refreshToken = tokens.refresh_token as string | undefined;
    if (!refreshToken) {
      const prior = await getPersistentSettingDb<string>(DRIVE_TOKEN_SETTING);
      if (prior) refreshToken = decryptDriveToken(prior);
    }
    if (!refreshToken) return res.status(502).send('Google did not issue an offline refresh token. Keep access_type=offline, authorize with consent, and check Google Auth Platform → Audience.');

    const refreshCheck = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: driveClientId(),
        client_secret: driveClientSecret(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const refreshedTokens: any = await refreshCheck.json().catch(() => ({}));
    if (!refreshCheck.ok || !refreshedTokens.access_token) {
      return res.status(502).send('Google granted the new permission but the site could not verify its saved refresh token. Reconnect Google Drive and approve the requested permissions again.');
    }
    const refreshedScopes = await getGrantedDriveScopes(String(refreshedTokens.access_token));
    if (!refreshedScopes.has(DRIVE_METADATA_SCOPE)) {
      return res.status(502).send('The saved Google Drive connection did not retain permission to rename file metadata. Reconnect Drive and approve the additional permission.');
    }

    await setPersistentSettingDb(DRIVE_TOKEN_SETTING, encryptDriveToken(refreshToken));
    cachedDriveAccessToken = null; // The new grant may include additional Drive file permissions.
    await setPersistentSettingDb(DRIVE_LIBRARY_SCOPE_VERSION_SETTING, DRIVE_LIBRARY_SCOPE_VERSION);
    await setPersistentSettingDb(DRIVE_STATE_SETTING, null);
    const base = String(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://yousound.onrender.com').replace(/\/$/, '');
    return res.redirect(`${base}/?driveConnected=1`);
  } catch (error: any) {
    console.error('[GoogleDriveOAuth] callback failed:', error);
    return res.status(500).send(`Google Drive connection could not be saved to the persistent database. ${String(error.message || 'Check Render environment variables and database connection.')}`);
  }
});

// Admin uploads both request assets on the website. Temporary files are immediately moved to Drive.
app.post('/api/admin/requests/:id/upload-media', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  if (!(await checkSqlAvailability())) return res.status(503).json({ success: false, error: 'The persistent database is unavailable. Upload was stopped before any files were transferred.' });
  const upload = uploadAudio.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);
  upload(req, res, async (uploadError: any) => {
    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const audioFile = files.audio?.[0];
    const coverFile = files.cover?.[0];
    let audioTempPath: string | null = audioFile?.path || null;
    let coverTempPath: string | null = coverFile?.path || null;
    let coverMimeType = String(coverFile?.mimetype || '').toLowerCase();
    let coverOriginalName = String(coverFile?.originalname || '');
    let coverSize = Number(coverFile?.size || 0);
    let uploadedAudioId: string | null = null;
    let uploadedCoverId: string | null = null;
    let claimedMediaCode: string | null = null;
    let mediaStaged = false;
    let accessToken: string | null = null;
    try {
      if (uploadError) {
        const tooLarge = uploadError.code === 'LIMIT_FILE_SIZE';
        return res.status(tooLarge ? 413 : 400).json({
          success: false,
          code: uploadError.code || 'UPLOAD_FAILED',
          error: tooLarge
            ? 'The selected file exceeds the 150 MB upload limit. Cover images are limited to 25 MB.'
            : uploadError.message || 'Upload failed.',
        });
      }
      if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
      if (!audioFile || !audioTempPath) {
        return res.status(400).json({ success: false, error: 'Choose an MP3 audio file.' });
      }
      if (!/\.mp3$/i.test(audioFile.originalname || '') || (audioFile.mimetype && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(audioFile.mimetype.toLowerCase()))) {
        return res.status(400).json({ success: false, error: 'Audio must be an MP3. No conversion is performed.' });
      }
      const requestItem = await getRequestByIdPersistentDb(req.params.id);
      if (!requestItem) return res.status(404).json({ success: false, error: 'Request not found.' });
      if (requestItem.status !== 'approved') return res.status(409).json({ success: false, error: 'Approve this request for upload before selecting its files.' });

      if (!coverTempPath && req.body?.useSubmittedImage === 'true' && requestItem.webLink) {
        const imageUrl = new URL(String(requestItem.webLink));
        const blockedArtworkHost = (hostname: string) => {
          const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
          return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
            || host === '::1' || host === '0.0.0.0'
            || /^(10\.|127\.|192\.168\.)/.test(host)
            || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
        };
        if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password || blockedArtworkHost(imageUrl.hostname)) {
          return res.status(400).json({ success: false, error: 'The submitted artwork link must be a public HTTPS image URL.' });
        }
        const submittedDriveId = extractGoogleDriveFileId(requestItem.webLink);
        let imageResponse: Awaited<ReturnType<typeof fetch>>;
        if (submittedDriveId) {
          // Drive's legacy uc?export=download endpoint often returns an HTML virus-scan
          // confirmation page for larger files. Use the user-content download endpoint
          // with the same public-link permission, then validate the resulting binary.
          const driveDownloads = [
            'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(submittedDriveId) + '&export=download&confirm=t',
            'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(submittedDriveId),
          ];
          let lastStatus = 0;
          let usable: Awaited<ReturnType<typeof fetch>> | null = null;
          for (const downloadUrl of driveDownloads) {
            const candidate = await fetch(downloadUrl, { redirect: 'follow', signal: AbortSignal.timeout(25_000) });
            lastStatus = candidate.status;
            const mime = String(candidate.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (candidate.ok && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
              usable = candidate;
              break;
            }
            await candidate.body?.cancel().catch(() => undefined);
          }
          if (!usable) {
            throw new Error('Google Drive did not return the submitted image as a public image file. Change its sharing to “Anyone with the link — Viewer” and submit the link again (last response ' + lastStatus + ').');
          }
          imageResponse = usable;
        } else {
          imageResponse = await fetch(imageUrl.toString(), { redirect: 'follow', signal: AbortSignal.timeout(25_000) });
        }
        if (!imageResponse.ok) throw new Error('Could not download the submitted artwork link (' + imageResponse.status + ').');
        const finalImageUrl = imageResponse.url ? new URL(imageResponse.url) : imageUrl;
        if (finalImageUrl.protocol !== 'https:' || blockedArtworkHost(finalImageUrl.hostname)) {
          await imageResponse.body?.cancel().catch(() => undefined);
          throw new Error('The artwork link redirected to an address that is not allowed.');
        }
        const contentLength = Number(imageResponse.headers.get('content-length') || 0);
        if (contentLength > 25 * 1024 * 1024) {
          await imageResponse.body?.cancel().catch(() => undefined);
          throw new Error('Submitted artwork is larger than 25 MB.');
        }
        coverMimeType = String(imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(coverMimeType)) {
          await imageResponse.body?.cancel().catch(() => undefined);
          throw new Error('The submitted link did not return a supported image. Use a direct JPG, PNG, WEBP, or GIF image link.');
        }
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        if (!imageBuffer.length || imageBuffer.length > 25 * 1024 * 1024) throw new Error('Submitted artwork is empty or larger than 25 MB.');
        coverSize = imageBuffer.length;
        const imageExtension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' } as Record<string, string>)[coverMimeType] || '.jpg';
        coverOriginalName = path.basename(imageUrl.pathname) || 'submitted-artwork' + imageExtension;
        if (!path.extname(coverOriginalName)) coverOriginalName += imageExtension;
        coverTempPath = path.join(UPLOADS_DIR, 'request-art-' + Date.now() + '-' + Math.random().toString(36).slice(2) + imageExtension);
        fs.writeFileSync(coverTempPath, imageBuffer);
      }
      if (!coverTempPath) return res.status(400).json({ success: false, error: 'Choose a cover image or use the submitted artwork link.' });
      if (coverSize > 25 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(coverMimeType)) {
        return res.status(400).json({ success: false, error: 'Cover must be a JPG, PNG, WEBP, or GIF image up to 25 MB.' });
      }

      accessToken = await getDriveAccessToken();
      const mediaCode = await generateSongMediaCode();
      claimedMediaCode = mediaCode;
      const driveAudio = await uploadMp3ToGoogleDrive(audioTempPath, requestItem.songTitle || 'Track', requestItem.artist || 'Unknown Artist', accessToken, mediaCode);
      audioTempPath = null;
      uploadedAudioId = driveAudio.fileId;
      const coverExtension = path.extname(coverOriginalName || '') || ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' } as Record<string, string>)[coverMimeType] || '.jpg';
      const driveCover = await uploadImageToGoogleDrive(coverTempPath, coverOriginalName || 'submitted-artwork' + coverExtension, coverMimeType || 'image/jpeg', accessToken, (requestItem.songTitle || 'Song') + ' - ' + mediaCode + coverExtension);
      coverTempPath = null;
      uploadedCoverId = driveCover.fileId;

      const updated = await stageSongRequestMediaDb(req.params.id, {
        code: mediaCode,
        title: requestItem.songTitle || 'Song',
        artist: requestItem.artist || 'Unknown Artist',
        audioFileId: driveAudio.fileId,
        artworkFileId: driveCover.fileId,
      }, {
        audioUrl: driveAudio.streamingUrl,
        stagingAudioUrl: driveAudio.streamingUrl,
        driveFileId: driveAudio.fileId,
        driveFolderId: driveAudio.folderId || null,
        coverUrl: driveCover.imageUrl,
        duration: driveAudio.duration || requestItem.duration || 180,
        processingProgress: 'MP3 and artwork uploaded to Google Drive. Waiting for the administrator to publish.',
        processingError: null,
      });
      if (!updated || updated.status !== 'staging') throw new Error('Media uploaded, but the request could not be moved into staging.');
      mediaStaged = true;
      console.log(`[SongPipeline] Uploaded request media to Drive: ${driveAudio.fileId}, ${driveCover.fileId}`);
      return res.json({ success: true, request: updated, audioFileId: driveAudio.fileId, coverFileId: driveCover.fileId });
    } catch (error: any) {
      console.error('[SongPipeline] Request media upload failed:', error);
      if (!mediaStaged) {
        if (accessToken && uploadedAudioId) await deleteGoogleDriveFile(uploadedAudioId, accessToken).catch(() => undefined);
        if (accessToken && uploadedCoverId) await deleteGoogleDriveFile(uploadedCoverId, accessToken).catch(() => undefined);
        if (claimedMediaCode) await releaseUnusedMediaIdReservationDb(claimedMediaCode, req.params.id).catch((cleanupError) => {
          console.error('[SongPipeline] Could not release unused Media ID reservation:', cleanupError);
        });
      }
      return res.status(500).json({ success: false, error: error?.message || 'Could not upload request files to Google Drive.' });
    } finally {
      if (audioTempPath && fs.existsSync(audioTempPath)) { try { fs.unlinkSync(audioTempPath); } catch {} }
      if (coverTempPath && fs.existsSync(coverTempPath)) { try { fs.unlinkSync(coverTempPath); } catch {} }
    }
  });
});

function extractMediaCodeFromName(filename: unknown): string | null {
  const match = String(filename || '').trim().match(/\s-\s([0-9]{3})(?=\.[^.]+$)/i);
  return match?.[1] || null;
}

async function getDriveFileMetadata(fileId: string, accessToken: string): Promise<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }> {
  const url = new URL('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId));
  url.searchParams.set('fields', 'id,name,mimeType,size,modifiedTime,webViewLink');
  url.searchParams.set('supportsAllDrives', 'true');
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(20_000) });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Google Drive could not read file metadata (' + response.status + '). ' + String(data?.error?.message || '').slice(0, 250));
  if (!data.id || !data.name) throw new Error('Google Drive returned incomplete file metadata.');
  return data;
}

async function renameDriveFileMetadata(fileId: string, name: string, accessToken: string): Promise<void> {
  const url = new URL('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId));
  url.searchParams.set('fields', 'id,name');
  url.searchParams.set('supportsAllDrives', 'true');
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(20_000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Google Drive could not rename a file (' + response.status + '). ' + String(data?.error?.message || '').slice(0, 250));
}

async function findDriveArtworkByCode(code: string, accessToken: string): Promise<Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }>> {
  if (!/^[0-9]{3}$/.test(code)) throw new Error('A valid three-digit Media ID is required.');
  const folderId = await getDriveLibraryFolderId(accessToken, 'Artwork');
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', "'" + folderId + "' in parents and trashed=false and name contains '" + code + "'");
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('orderBy', 'name');
  url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime)');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');

  const candidates: any[] = [];
  let pageToken = '';
  let pages = 0;
  do {
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    else url.searchParams.delete('pageToken');
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(20_000),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error('Could not search the YouSong Artwork folder (' + response.status + '). ' + String(data?.error?.message || '').slice(0, 250));
    }
    candidates.push(...(Array.isArray(data.files) ? data.files : []));
    pageToken = String(data.nextPageToken || '');
    pages += 1;
  } while (pageToken && pages < 10);

  if (pageToken) {
    throw new Error('Artwork search reached its 1,000-file safety limit. Narrow the Artwork folder or select the image manually.');
  }

  const suffix = new RegExp("\\s-\\s" + code + "\\.(jpe?g|png|webp|gif)$", "i");
  return candidates
    .filter((file: any) => suffix.test(String(file?.name || '')))
    .map((file: any) => ({
      id: String(file.id),
      name: String(file.name),
      mimeType: String(file.mimeType || ''),
      size: file.size ? String(file.size) : undefined,
      modifiedTime: file.modifiedTime || undefined,
    }));
}
async function renameDriveSongAsset(fileId: string, kind: 'audio' | 'image', title: string, artist: string, mediaCode: string, accessToken: string): Promise<string> {
  const metadataUrl = new URL('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId));
  metadataUrl.searchParams.set('fields', 'id,name,mimeType');
  metadataUrl.searchParams.set('supportsAllDrives', 'true');
  const metadataResponse = await fetch(metadataUrl, { headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(20_000) });
  const metadata: any = await metadataResponse.json().catch(() => ({}));
  if (!metadataResponse.ok) throw new Error('Could not read the selected Drive file details (' + metadataResponse.status + '). Check the site Drive access.');
  const currentName = String(metadata.name || '');
  const mimeType = String(metadata.mimeType || '').toLowerCase();
  const imageExtensions: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  if (kind === 'audio' && !(/\.mp3$/i.test(currentName) || ['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(mimeType))) throw new Error('The selected audio file is not an MP3.');
  if (kind === 'image' && !imageExtensions[mimeType] && !/\.(jpe?g|png|webp|gif)$/i.test(currentName)) throw new Error('The selected artwork file is not a supported image.');
  const extension = kind === 'audio' ? '.mp3' : (path.extname(currentName).toLowerCase() || imageExtensions[mimeType] || '.jpg');
  const baseName = kind === 'audio' ? title + ' by ' + artist + ' - ' + mediaCode : title + ' - ' + mediaCode;
  const safeName = (baseName.replace(/[\\/\\\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim() || 'Song') + extension;
  const renameUrl = new URL('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId));
  renameUrl.searchParams.set('fields', 'id,name');
  renameUrl.searchParams.set('supportsAllDrives', 'true');
  const renameResponse = await fetch(renameUrl, { method: 'PATCH', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: safeName }), signal: AbortSignal.timeout(20_000) });
  const renamed: any = await renameResponse.json().catch(() => ({}));
  if (!renameResponse.ok) {
    const detail = renamed?.error?.message ? String(renamed.error.message).slice(0, 250) : '';
    throw new Error('Google Drive could not rename the selected ' + kind + ' file (' + renameResponse.status + '). Approve the Drive metadata permission and confirm the connected account can edit this file.' + (detail ? ' ' + detail : ''));
  }
  return String(renamed.name || safeName);
}

// Manual library upload: both files go directly to Google Drive; this endpoint stores no media bytes in the DB.
app.post('/api/admin/library/upload-media', (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  const upload = uploadAudio.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);
  upload(req, res, async (uploadError: any) => {
    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const audioFile = files.audio?.[0];
    const coverFile = files.cover?.[0];
    let audioTempPath: string | null = audioFile?.path || null;
    let coverTempPath: string | null = coverFile?.path || null;
    let uploadedAudioId: string | null = null;
    let uploadedCoverId: string | null = null;
    let accessToken: string | null = null;
    try {
      if (uploadError) {
        const tooLarge = uploadError.code === 'LIMIT_FILE_SIZE';
        return res.status(tooLarge ? 413 : 400).json({
          success: false,
          code: uploadError.code || 'UPLOAD_FAILED',
          error: tooLarge
            ? 'The selected file exceeds the 150 MB upload limit. Cover images are limited to 25 MB.'
            : uploadError.message || 'Upload failed.',
        });
      }
      if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
      const audioDriveId = extractGoogleDriveFileId(req.body?.audioDriveLink);
      const coverDriveId = extractGoogleDriveFileId(req.body?.coverDriveLink);
      if (req.body?.audioDriveLink && !audioDriveId) return res.status(400).json({ success: false, error: 'The selected Drive audio file is not a valid Google Drive file.' });
      if (req.body?.coverDriveLink && !coverDriveId) return res.status(400).json({ success: false, error: 'The selected Drive artwork file is not a valid Google Drive file.' });
      if (!audioFile && !audioDriveId) {
        return res.status(400).json({ success: false, error: 'Choose an MP3 using a file upload, a Drive folder selection, or a share link.' });
      }
      if (audioFile && audioDriveId) return res.status(400).json({ success: false, error: 'Choose either a Drive MP3 or a local MP3, not both.' });
      if (coverFile && coverDriveId) return res.status(400).json({ success: false, error: 'Choose either Drive artwork or a local image, not both.' });
      if (audioFile && (!audioTempPath || !/\.mp3$/i.test(audioFile.originalname || '') || (audioFile.mimetype && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(audioFile.mimetype.toLowerCase())))) {
        return res.status(400).json({ success: false, error: 'Audio must be an MP3. No conversion is performed.' });
      }
      if (coverFile && (coverFile.size > 25 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(coverFile.mimetype || '').toLowerCase()))) {
        return res.status(400).json({ success: false, error: 'Cover must be a JPG, PNG, WEBP, or GIF image up to 25 MB.' });
      }
      if (!(await checkSqlAvailability())) {
        return res.status(503).json({ success: false, error: 'The persistent database is unavailable. No song was added.' });
      }

      const title = String(req.body?.title || (audioFile ? audioFile.originalname.replace(/\.mp3$/i, '') : '')).trim();
      const artist = String(req.body?.artist || '').trim();
      if (!title || !artist) throw new Error('Song title and artist are required.');
      if (audioDriveId) accessToken = await getDriveAccessToken();
      const selectedAudioMetadata = audioDriveId ? await getDriveFileMetadata(audioDriveId, accessToken!) : null;
      await assertDriveFilesAreNotAlreadyLinked(audioDriveId, coverDriveId);
      const preferredMediaCode = extractMediaCodeFromName(selectedAudioMetadata?.name || audioFile?.originalname);
      if (!coverDriveId && !coverFile && !preferredMediaCode) {
        throw new Error('Choose artwork, or select an audio file whose filename already ends in a three-digit Media ID so YouSong can locate its matching artwork.');
      }
      const mediaCode = await generateSongMediaCode(undefined, preferredMediaCode || undefined);
      const genre = String(req.body?.genre || 'Other').trim().slice(0, 80) || 'Other';
      const tags = String(req.body?.tags || '').split(',').map((tag: string) => tag.trim().toLowerCase()).filter(Boolean);

      let audioUrl = '';
      let coverUrl = '';
      let duration = 180;
      if (audioDriveId) {
        accessToken = await getDriveAccessToken();
        await renameDriveSongAsset(audioDriveId, 'audio', title, artist, mediaCode, accessToken);
        audioUrl = '/api/drive/stream/' + encodeURIComponent(audioDriveId);
        const suppliedDuration = Number(req.body?.duration);
        if (Number.isFinite(suppliedDuration) && suppliedDuration > 0 && suppliedDuration <= 24 * 60 * 60) duration = Math.max(1, Math.round(suppliedDuration));
      } else if (audioFile && audioTempPath) {
        accessToken = await getDriveAccessToken();
        const driveAudio = await uploadMp3ToGoogleDrive(audioTempPath, title, artist, accessToken, mediaCode);
        audioTempPath = null;
        uploadedAudioId = driveAudio.fileId;
        audioUrl = driveAudio.streamingUrl;
        duration = driveAudio.duration || duration;
      }

      let resolvedCoverDriveId = coverDriveId;
      if (!resolvedCoverDriveId && !coverFile) {
        accessToken = accessToken || await getDriveAccessToken();
        const artworkMatches = await findDriveArtworkByCode(mediaCode, accessToken);
        if (artworkMatches.length > 1) throw new Error('More than one artwork file has Media ID ' + mediaCode + '. Remove or rename the duplicate files in the Artwork folder.');
        if (artworkMatches.length === 1) resolvedCoverDriveId = artworkMatches[0].id;
        else throw new Error('No artwork file ending in - ' + mediaCode + ' was found. Select the artwork manually or add the matching image to the Artwork folder.');
      }
      await assertDriveFilesAreNotAlreadyLinked(audioDriveId, resolvedCoverDriveId);
      if (resolvedCoverDriveId) {
        accessToken = accessToken || await getDriveAccessToken();
        await renameDriveSongAsset(resolvedCoverDriveId, 'image', title, artist, mediaCode, accessToken);
        coverUrl = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(resolvedCoverDriveId);
      } else if (coverFile && coverTempPath) {
        accessToken = accessToken || await getDriveAccessToken();
        const coverExtension = path.extname(coverFile.originalname || '') || ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' } as Record<string, string>)[String(coverFile.mimetype || '').toLowerCase()] || '.jpg';
        const driveCover = await uploadImageToGoogleDrive(coverTempPath, coverFile.originalname, coverFile.mimetype || 'image/jpeg', accessToken, title + ' - ' + mediaCode + coverExtension);
        coverTempPath = null;
        uploadedCoverId = driveCover.fileId;
        coverUrl = driveCover.imageUrl;
      }

      const id = `song-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const song = await insertSongDb({
        id,
        title,
        artist,
        mediaCode,
        album: '',
        genre,
        tags: Array.from(new Set([genre.toLowerCase(), ...tags])),
        duration,
        audioUrl,
        coverUrl,
        addedAt: new Date().toISOString(),
        plays: 0,
        featured: false,
        description: String(req.body?.description || '').trim(),
      }, true);
      await saveMediaIdDb({ code: mediaCode, status: 'assigned', songId: id, title, artist, audioFileId: audioDriveId || uploadedAudioId, artworkFileId: resolvedCoverDriveId || uploadedCoverId });
      return res.json({
        success: true,
        song,
        // Include top-level URLs as well as the canonical song object so clients
        // can validate the uploaded media without guessing the response shape.
        audioUrl,
        coverUrl,
        audioFileId: audioDriveId || uploadedAudioId,
        coverFileId: (typeof resolvedCoverDriveId !== 'undefined' ? resolvedCoverDriveId : coverDriveId) || uploadedCoverId,
      });
    } catch (error: any) {
      console.error('[LibraryUpload] Drive media upload failed:', error);
      if (accessToken && uploadedAudioId) await deleteGoogleDriveFile(uploadedAudioId, accessToken).catch(() => undefined);
      if (accessToken && uploadedCoverId) await deleteGoogleDriveFile(uploadedCoverId, accessToken).catch(() => undefined);
      return res.status(500).json({ success: false, error: error?.message || 'Could not upload media to Google Drive.' });
    } finally {
      if (audioTempPath && fs.existsSync(audioTempPath)) { try { fs.unlinkSync(audioTempPath); } catch {} }
      if (coverTempPath && fs.existsSync(coverTempPath)) { try { fs.unlinkSync(coverTempPath); } catch {} }
    }
  });
});

// Import existing, publicly shareable Google Drive files without uploading duplicate copies.
function extractGoogleDriveFileId(raw: unknown): string | null {
  return extractDriveFileId(String(raw || ''));
}

function extractDriveFilenameFromHeader(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = disposition.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1];
  const standard = disposition.match(/filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]+))/i);
  let filename = encoded
    ? encoded.trim().replace(/^["']|["']$/g, '')
    : standard?.[1] || standard?.[2] || '';
  if (!filename) return null;
  try { filename = decodeURIComponent(filename); } catch {}
  filename = filename.replace(/[\\/]+/g, '_').replace(/[\u0000-\u001f]/g, '').trim();
  return filename && filename !== '.' && filename !== '..' ? filename.slice(0, 255) : null;
}

// Admin-only filename search in the site's existing Google Drive media folders.
app.get('/api/admin/library/drive-files', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  const kind = String(req.query.kind || '');
  if (kind !== 'audio' && kind !== 'image') {
    return res.status(400).json({ success: false, error: 'Choose an audio or image library.' });
  }

  const searchTerm = String(req.query.q || '').trim().slice(0, 100).toLowerCase();
  const showNumbered = String(req.query.showNumbered || '') === '1';
  const requestedPageToken = String(req.query.pageToken || '').trim().slice(0, 2048);
  try {
    const scopeVersion = await getPersistentSettingDb<string>(DRIVE_LIBRARY_SCOPE_VERSION_SETTING);
    if (scopeVersion !== DRIVE_LIBRARY_SCOPE_VERSION) {
      return res.status(409).json({
        success: false,
        code: 'DRIVE_REAUTHORIZE_REQUIRED',
        error: 'Reconnect the site Google Drive account and approve permission to view and rename file metadata before searching existing Drive folders.',
      });
    }

    const accessToken = await getDriveAccessToken();
    const registeredIds = showNumbered ? [] : await getMediaIdsDb();
    const alreadyNumberedFileIds = new Set<string>(registeredIds.flatMap((item: any) =>
      [item.audioFileId, item.artworkFileId].filter(Boolean).map(String)
    ));
    const folderName = kind === 'audio' ? 'Audio Tracks' : 'Artwork';
    const folderId = await getDriveLibraryFolderId(accessToken, folderName);
    // Drive's name-contains operator only matches prefixes. Keep substring matching
    // in this server-side scan so terms in the middle of a filename still work.
    const query = `'${folderId}' in parents and trashed=false`;
    const driveUrl = new URL('https://www.googleapis.com/drive/v3/files');
    driveUrl.searchParams.set('q', query);
    driveUrl.searchParams.set('pageSize', '100');
    driveUrl.searchParams.set('orderBy', 'name');
    driveUrl.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime)');
    driveUrl.searchParams.set('supportsAllDrives', 'true');
    driveUrl.searchParams.set('includeItemsFromAllDrives', 'true');

    const files: any[] = [];
    let pageToken = requestedPageToken;
    let nextPageToken: string | null = null;
    let scans = 0;
    const maxScansPerRequest = 10;
    const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

    do {
      if (pageToken) driveUrl.searchParams.set('pageToken', pageToken);
      else driveUrl.searchParams.delete('pageToken');

      const driveResponse = await fetch(driveUrl, {
        headers: { Authorization: 'Bearer ' + accessToken },
        signal: AbortSignal.timeout(20_000),
      });
      const data: any = await driveResponse.json().catch(() => ({}));
      if (!driveResponse.ok) {
        const reason = data?.error?.message ? String(data.error.message).slice(0, 300) : 'Google Drive rejected the folder listing.';
        throw new Error(reason);
      }

      const pageFiles = Array.isArray(data.files) ? data.files : [];
      for (const file of pageFiles) {
        const name = String(file?.name || '');
        const lowerName = name.toLowerCase();
        const mimeType = String(file?.mimeType || '').toLowerCase();
        const supported = kind === 'audio'
          ? lowerName.endsWith('.mp3') || mimeType === 'audio/mpeg' || mimeType === 'audio/mp3'
          : supportedImageTypes.has(mimeType) || /\.(jpe?g|png|webp|gif)$/i.test(name);
        const hasThreeDigitId = /\s-\s[0-9]{3}(?=\.[^.]+$)/i.test(name);
        if (!supported || (searchTerm && !lowerName.includes(searchTerm))) continue;
        if (!showNumbered && (alreadyNumberedFileIds.has(String(file.id)) || hasThreeDigitId)) continue;
        files.push({
          id: String(file.id),
          name: name || 'Untitled file',
          mimeType: String(file.mimeType || ''),
          size: file.size ? String(file.size) : null,
          modifiedTime: file.modifiedTime || null,
        });
      }

      pageToken = String(data.nextPageToken || '');
      nextPageToken = pageToken || null;
      scans += 1;
    } while (files.length < 100 && nextPageToken && scans < maxScansPerRequest);

    return res.json({ success: true, folder: folderName, files, nextPageToken, scannedPages: scans, numberedFilesHidden: !showNumbered });
  } catch (error: any) {
    console.error('[DriveLibraryPicker] Could not list Google Drive files:', error?.message || error);
    return res.status(502).json({
      success: false,
      error: error?.message || 'Could not read the Google Drive media folder. Check the site Drive connection and folder permissions.',
    });
  }
});

// Read selected Drive file metadata through the OAuth connection; no media bytes are downloaded.
// ----------------- ADMIN MEDIA ID SYSTEM -----------------
app.get('/api/admin/media-ids', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  try {
    const [registry, songs] = await Promise.all([getMediaIdsDb(), getSongsDb()]);
    const used = new Set<string>([
      ...registry.map((item: any) => String(item.code)),
      ...songs.map((item: any) => String(item.mediaCode || '')).filter((code: string) => /^[0-9]{3}$/.test(code)),
    ]);
    return res.json({
      success: true, registry, totalSongs: songs.length,
      assignedSongs: songs.filter((song: any) => /^[0-9]{3}$/.test(String(song.mediaCode || ''))).length,
      missingSongIds: songs.filter((song: any) => !/^[0-9]{3}$/.test(String(song.mediaCode || ''))).length,
      availableCount: Math.max(0, 1000 - used.size), capacity: 1000,
    });
  } catch (error: any) {
    return res.status(503).json({ success: false, error: error?.message || 'Could not load the Media ID Bank.' });
  }
});

app.post('/api/admin/media-ids/generate', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  try {
    const count = Math.max(1, Math.min(20, Math.floor(Number(req.body?.count) || 1)));
    const generated: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const code = await generateSongMediaCode();
      await saveMediaIdDb({ code, status: 'reserved', title: 'Reserved by administrator' });
      generated.push(code);
    }
    return res.json({ success: true, generated });
  } catch (error: any) {
    return res.status(409).json({ success: false, error: error?.message || 'Could not generate Media IDs.' });
  }
});

app.get('/api/admin/library/artwork-for-code/:code', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  const code = String(req.params.code || '');
  if (!/^[0-9]{3}$/.test(code)) return res.status(400).json({ success: false, error: 'Media ID must contain exactly three digits.' });
  try {
    const [registry, songs] = await Promise.all([getMediaIdsDb(), getSongsDb()]);
    const entry: any = registry.find((item: any) => item.code === code);
    const owner: any = songs.find((song: any) => String(song.mediaCode || '') === code);
    if (owner || entry?.status === 'assigned' || entry?.status === 'retired' || entry?.requestId) {
      const ownerName = owner?.title || entry?.title || 'another song or request';
      return res.status(409).json({ success: false, code, inUse: true, error: 'Media ID ' + code + ' is already assigned to ' + ownerName + '. It cannot be reused for a new song.' });
    }
    const accessToken = await getDriveAccessToken();
    const files = await findDriveArtworkByCode(code, accessToken);
    return res.json({ success: true, code, files, matchCount: files.length });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || 'Could not search the Artwork folder.' });
  }
});

app.post('/api/admin/media-ids/backfill', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  try {
    if (!(await checkSqlAvailability())) return res.status(503).json({ success: false, error: 'The persistent Supabase/PostgreSQL database is unavailable. No IDs were assigned.' });
    const songs = await getSongsDb();
    const needsDrive = songs.some((song: any) => extractDriveFileId(String(song.audioUrl || '')) || extractDriveFileId(String(song.coverUrl || '')));
    const accessToken = needsDrive ? await getDriveAccessToken() : '';
    const results: Array<{ songId: string; title: string; mediaCode?: string; status: 'updated' | 'unchanged' | 'error'; detail: string }> = [];
    for (const song of songs) {
      try {
        const audioFileId = extractDriveFileId(String(song.audioUrl || ''));
        let artworkFileId = extractDriveFileId(String(song.coverUrl || ''));
        const audioMetadata = audioFileId ? await getDriveFileMetadata(audioFileId, accessToken) : null;
        const preferredCode = /^[0-9]{3}$/.test(String(song.mediaCode || '')) ? String(song.mediaCode) : extractMediaCodeFromName(audioMetadata?.name) || undefined;
        const code = await generateSongMediaCode(song.id, preferredCode);
        const originalAudioName = audioMetadata?.name || null;
        const artworkMetadata = artworkFileId ? await getDriveFileMetadata(artworkFileId, accessToken) : null;
        const originalArtworkName = artworkMetadata?.name || null;
        let matchedArtwork = false;
        if (!artworkFileId) {
          const matches = await findDriveArtworkByCode(code, accessToken);
          if (matches.length > 1) throw new Error('Multiple artwork files match this Media ID. Resolve the duplicates in Drive before continuing.');
          if (matches.length === 1) { artworkFileId = matches[0].id; matchedArtwork = true; }
        }
        try {
          if (audioFileId) await renameDriveSongAsset(audioFileId, 'audio', song.title, song.artist, code, accessToken);
          if (artworkFileId) await renameDriveSongAsset(artworkFileId, 'image', song.title, song.artist, code, accessToken);
        } catch (renameError) {
          if (audioFileId && originalAudioName) await renameDriveFileMetadata(audioFileId, originalAudioName, accessToken).catch(() => undefined);
          if (artworkFileId && originalArtworkName) await renameDriveFileMetadata(artworkFileId, originalArtworkName, accessToken).catch(() => undefined);
          throw renameError;
        }
        const coverUrl = matchedArtwork && artworkFileId ? 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(artworkFileId) : song.coverUrl;
        if (song.mediaCode && song.mediaCode !== code) {
          const oldRecord = await getMediaIdByCodeDb(String(song.mediaCode));
          if (oldRecord?.songId === song.id) {
            // Release the unique song_id link before attaching the new ID to this song.
            await saveMediaIdDb({ code: String(song.mediaCode), status: 'retired', title: song.title, artist: song.artist });
          }
        }
        await updateSongDb(song.id, { mediaCode: code, ...(coverUrl !== song.coverUrl ? { coverUrl } : {}) });
        await saveMediaIdDb({ code, status: 'assigned', songId: song.id, title: song.title, artist: song.artist, audioFileId, artworkFileId });
        const wasAlreadyComplete = song.mediaCode === code && (!audioFileId || extractMediaCodeFromName(originalAudioName) === code) && (!artworkFileId || extractMediaCodeFromName(originalArtworkName || '') === code);
        results.push({
          songId: song.id, title: song.title, mediaCode: code,
          status: wasAlreadyComplete && !matchedArtwork ? 'unchanged' : 'updated',
          detail: matchedArtwork ? 'Assigned ID and automatically matched artwork from the Artwork folder.'
            : audioFileId || artworkFileId ? 'Assigned ID and synchronized available Drive filenames.'
            : 'Assigned an ID. No Google Drive file IDs were available to rename.',
        });
      } catch (error: any) {
        results.push({ songId: song.id, title: song.title, status: 'error', detail: error?.message || 'Could not assign this Media ID.' });
      }
    }
    return res.json({
      success: true, total: results.length,
      updatedCount: results.filter((result) => result.status === 'updated').length,
      unchangedCount: results.filter((result) => result.status === 'unchanged').length,
      errorCount: results.filter((result) => result.status === 'error').length,
      results,
    });
  } catch (error: any) {
    return res.status(503).json({ success: false, error: error?.message || 'Media ID backfill could not run.' });
  }
});

app.patch('/api/admin/library/songs/:id/media-id', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  try {
    const song = await getSongByIdDb(req.params.id);
    if (!song) return res.status(404).json({ success: false, error: 'Song not found.' });
    const code = String(req.body?.mediaCode || '').trim();
    if (!/^[0-9]{3}$/.test(code)) return res.status(400).json({ success: false, error: 'Enter exactly three digits, including leading zeroes.' });
    const title = String(req.body?.title || song.title).trim().slice(0, 150);
    const artist = String(req.body?.artist || song.artist).trim().slice(0, 150);
    if (!title || !artist) return res.status(400).json({ success: false, error: 'Song title and artist cannot be empty.' });
    const [songs, requests, registry] = await Promise.all([getSongsDb(), getRequestsDb(), getMediaIdsDb()]);
    const conflictSong = songs.find((item: any) => item.id !== song.id && String(item.mediaCode || '') === code);
    if (conflictSong) return res.status(409).json({ success: false, error: 'That Media ID already belongs to "' + conflictSong.title + '".' });
    const conflictRequest = requests.find((item: any) => item.status !== 'published' && String(item.mediaCode || '') === code && item.id !== song.id);
    if (conflictRequest) return res.status(409).json({ success: false, error: 'That Media ID is reserved by a song request.' });
    const registryEntry: any = registry.find((item: any) => item.code === code);
    if (registryEntry?.status === 'retired') return res.status(409).json({ success: false, error: 'That Media ID is retired and cannot be reused.' });
    if (registryEntry && ((registryEntry.songId && registryEntry.songId !== song.id) || registryEntry.requestId)) {
      return res.status(409).json({ success: false, error: 'That Media ID is already assigned or reserved.' });
    }
    if (code !== String(song.mediaCode || '') && !registryEntry && !(await reserveMediaIdDb(code))) {
      return res.status(409).json({ success: false, error: 'That Media ID was just claimed by another upload. Generate another number.' });
    }
    const audioFileId = extractDriveFileId(String(song.audioUrl || ''));
    const artworkFileId = extractDriveFileId(String(song.coverUrl || ''));
    const accessToken = audioFileId || artworkFileId ? await getDriveAccessToken() : '';
    const oldAudio = audioFileId ? await getDriveFileMetadata(audioFileId, accessToken) : null;
    const oldArtwork = artworkFileId ? await getDriveFileMetadata(artworkFileId, accessToken) : null;
    try {
      if (audioFileId) await renameDriveSongAsset(audioFileId, 'audio', title, artist, code, accessToken);
      if (artworkFileId) await renameDriveSongAsset(artworkFileId, 'image', title, artist, code, accessToken);
    } catch (renameError) {
      if (audioFileId && oldAudio?.name) await renameDriveFileMetadata(audioFileId, oldAudio.name, accessToken).catch(() => undefined);
      if (artworkFileId && oldArtwork?.name) await renameDriveFileMetadata(artworkFileId, oldArtwork.name, accessToken).catch(() => undefined);
      throw renameError;
    }
    const updated = await updateSongDb(song.id, { mediaCode: code, title, artist });
    if (song.mediaCode && song.mediaCode !== code) {
      await saveMediaIdDb({ code: String(song.mediaCode), status: 'retired', title: song.title, artist: song.artist });
    }
    await saveMediaIdDb({ code, status: 'assigned', songId: song.id, title, artist, audioFileId, artworkFileId });
    return res.json({ success: true, song: updated || { ...song, mediaCode: code, title, artist }, renamed: { audio: Boolean(audioFileId), artwork: Boolean(artworkFileId) } });
  } catch (error: any) {
    console.error('[MediaIdUpdate] Failed:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Could not update the Media ID.' });
  }
});

app.get('/api/admin/library/drive-file-info/:fileId', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  const fileId = String(req.params.fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) return res.status(400).json({ success: false, error: 'Invalid Google Drive file ID.' });
  try {
    const accessToken = await getDriveAccessToken();
    const metadata = await getDriveFileMetadata(fileId, accessToken);
    const title = path.basename(metadata.name, path.extname(metadata.name))
      .replace(/\s-\s[0-9]{3}$/i, '')
      .replace(/ by .+$/i, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150);
    return res.json({
      success: true, fileName: metadata.name, title,
      mediaCode: extractMediaCodeFromName(metadata.name),
      mimeType: metadata.mimeType,
      fileSize: metadata.size ? Number(metadata.size) : undefined,
      modifiedTime: metadata.modifiedTime || undefined,
    });
  } catch (error: any) {
    console.warn('[DriveFileInfo] Metadata lookup failed:', error?.message || error);
    return res.status(422).json({ success: false, error: error?.message || 'Could not read this file through the site Drive connection. Reconnect Drive or check access to this file.' });
  }
});

// The uploader sends multipart FormData. Parse those text fields before reading req.body.
const parseDriveLinkForm = multer({ limits: { fields: 20, fieldSize: 8192 } }).none();

app.post('/api/admin/library/import-drive-links', parseDriveLinkForm, async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  try {
    const audioId = extractGoogleDriveFileId(req.body?.audioDriveLink);
    let coverId = extractGoogleDriveFileId(req.body?.coverDriveLink);
    if (!audioId) return res.status(400).json({ success: false, error: 'Paste a valid Google Drive link for the MP3.' });
    if (audioId === coverId) return res.status(400).json({ success: false, error: 'The MP3 and cover image must be two different Drive files.' });
    const title = String(req.body?.title || '').trim().slice(0, 150);
    const artist = String(req.body?.artist || '').trim().slice(0, 150);
    if (!title || !artist) return res.status(400).json({ success: false, error: 'Song title and artist are required.' });
    if (!(await checkSqlAvailability())) return res.status(503).json({ success: false, error: 'The persistent database is unavailable. No song was added.' });
    const accessToken = await getDriveAccessToken();
    const audioMetadata = await getDriveFileMetadata(audioId, accessToken);
    await assertDriveFilesAreNotAlreadyLinked(audioId, coverId);
    const preferredCode = extractMediaCodeFromName(audioMetadata.name);
    const mediaCode = await generateSongMediaCode(undefined, preferredCode || undefined);
    if (!coverId) {
      const matches = await findDriveArtworkByCode(mediaCode, accessToken);
      if (matches.length > 1) return res.status(409).json({ success: false, error: 'Multiple artwork files match Media ID ' + mediaCode + '. Choose the correct artwork manually.' });
      if (!matches.length) return res.status(422).json({ success: false, error: 'No artwork file matching Media ID ' + mediaCode + ' was found. Paste its Drive link or select it from the Artwork folder.' });
      coverId = matches[0].id;
    }
    const originalCoverMetadata = await getDriveFileMetadata(coverId, accessToken);
    await assertDriveFilesAreNotAlreadyLinked(audioId, coverId);
    await renameDriveSongAsset(audioId, 'audio', title, artist, mediaCode, accessToken);
    try {
      await renameDriveSongAsset(coverId, 'image', title, artist, mediaCode, accessToken);
    } catch (error) {
      await renameDriveFileMetadata(audioId, audioMetadata.name, accessToken).catch(() => undefined);
      await renameDriveFileMetadata(coverId, originalCoverMetadata.name, accessToken).catch(() => undefined);
      throw error;
    }
    const audioUrl = '/api/drive/stream/' + encodeURIComponent(audioId);
    const coverUrl = 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(coverId);
    const genre = String(req.body?.genre || 'Other').trim().slice(0, 80) || 'Other';
    const tags = String(req.body?.tags || '').split(',').map((tag: string) => tag.trim().toLowerCase()).filter(Boolean);
    const songId = 'song-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const song = await insertSongDb({
      id: songId, title, artist, mediaCode, album: '', genre,
      tags: Array.from(new Set([genre.toLowerCase(), ...tags])),
      duration: (() => {
        const detected = Number(req.body?.duration);
        return Number.isFinite(detected) && detected > 0 && detected <= 24 * 60 * 60 ? Math.max(1, Math.round(detected)) : 180;
      })(),
      audioUrl, coverUrl, addedAt: new Date().toISOString(), plays: 0, featured: false,
      description: String(req.body?.description || '').trim(),
    }, true);
    await saveMediaIdDb({ code: mediaCode, status: 'assigned', songId, title, artist, audioFileId: audioId, artworkFileId: coverId });
    return res.json({ success: true, song, audioUrl, coverUrl, audioFileId: audioId, coverFileId: coverId, reusedExistingDriveFiles: true });
  } catch (error: any) {
    console.error('[DriveLinkImport] Could not add existing Drive files:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Could not add the existing Google Drive files.' });
  }
});

// Upload a replacement cover directly to the site's Drive account from the song editor.
app.post('/api/admin/library/upload-cover', (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  uploadAudio.single('cover')(req, res, async (uploadError: any) => {
    const coverFile = req.file;
    const tempPath = coverFile?.path || null;
    try {
      if (uploadError) {
        const tooLarge = uploadError.code === 'LIMIT_FILE_SIZE';
        return res.status(tooLarge ? 413 : 400).json({
          success: false,
          code: uploadError.code || 'UPLOAD_FAILED',
          error: tooLarge ? 'The cover image exceeds the 25 MB limit.' : uploadError.message || 'Cover upload failed.',
        });
      }
      if (!coverFile || !tempPath) return res.status(400).json({ success: false, error: 'Choose a cover image.' });
      if (coverFile.size > 25 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(coverFile.mimetype || '').toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Cover must be a JPG, PNG, WEBP, or GIF image up to 25 MB.' });
      }
      const accessToken = await getDriveAccessToken();
      const songId = String(req.body?.songId || '').trim();
      const song = songId ? await getSongByIdDb(songId) : null;
      const mediaCode = String(song?.mediaCode || req.body?.mediaCode || '').trim();
      const title = String(song?.title || req.body?.title || path.basename(coverFile.originalname, path.extname(coverFile.originalname))).trim();
      const extension = path.extname(coverFile.originalname || '') || ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' } as Record<string, string>)[String(coverFile.mimetype || '').toLowerCase()] || '.jpg';
      const desiredFilename = /^[0-9]{3}$/.test(mediaCode) ? title + ' - ' + mediaCode + extension : undefined;
      const driveCover = await uploadImageToGoogleDrive(tempPath, coverFile.originalname, coverFile.mimetype || 'image/jpeg', accessToken, desiredFilename);
      if (song?.id && /^[0-9]{3}$/.test(mediaCode)) {
        const existingRecord = await getMediaIdByCodeDb(mediaCode);
        await saveMediaIdDb({
          code: mediaCode, status: 'assigned', songId: song.id, title: song.title, artist: song.artist,
          audioFileId: existingRecord?.audioFileId || extractDriveFileId(String(song.audioUrl || '')),
          artworkFileId: driveCover.fileId,
        });
      }
      return res.json({ success: true, coverUrl: driveCover.imageUrl, fileId: driveCover.fileId, filename: desiredFilename || coverFile.originalname });
    } catch (error: any) {
      console.error('[LibraryCoverUpload] Drive upload failed:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Could not upload the cover image to Google Drive.' });
    } finally {
      if (tempPath && fs.existsSync(tempPath)) { try { fs.unlinkSync(tempPath); } catch {} }
    }
  });
});

// Publish only a staged MP3 hosted directly on Google Drive. This keeps song bytes out of this app host.
// Publish/unpublish a request atomically. Retries reuse the existing library row.
app.post('/api/admin/requests/:id/publish', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    if (!(await checkSqlAvailability())) {
      return res.status(503).json({ success: false, error: 'The persistent database is unavailable. Nothing was published or unpublished.' });
    }
    const { isPublished } = req.body || {};
    if (typeof isPublished !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Choose whether to publish or unpublish this request.' });
    }
    const requestItem = await getRequestByIdPersistentDb(id);
    if (!requestItem) return res.status(404).json({ success: false, error: 'Request not found.' });

    if (isPublished) {
      if (!['staging', 'published'].includes(requestItem.status)) {
        return res.status(409).json({ success: false, error: 'Approve the request and upload its MP3 and artwork before publishing.' });
      }
      const requestAudioUrl = String(requestItem.audioUrl || '');
      const hasDrivePlaybackUrl = requestAudioUrl.startsWith('/api/drive/stream/')
        || requestAudioUrl.startsWith('https://drive.google.com/uc?export=download&id=');
      if (!requestItem.driveFileId || !hasDrivePlaybackUrl || !String(requestItem.coverUrl || '').startsWith('https://lh3.googleusercontent.com/d/')) {
        return res.status(400).json({ success: false, error: 'This request needs both a Google Drive MP3 and a Google Drive cover image before publishing.' });
      }

      const publication = await publishStagedSongRequestDb(id);
      console.log(`[SongPipeline] ${publication.alreadyPublished ? 'Verified existing publication for' : 'Published'} "${publication.song.title}" (${requestItem.driveFileId}).`);
      return res.json({
        success: true,
        request: publication.request,
        song: publication.song,
        alreadyPublished: publication.alreadyPublished,
      });
    }

    const updated = await unpublishSongRequestDb(id);
    return res.json({ success: true, request: updated });
  } catch (error: any) {
    console.error('[SongPipeline] Atomic publish/unpublish failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Publish failed.' });
  }
});

// Stream public Google Drive MP3s through a same-origin endpoint.
 // Google Drive's download URL can return an HTML safety-confirmation page instead of audio.
 // Redirecting an <audio> element directly to that page causes a source-unavailable failure.
app.get('/api/drive/stream/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId || '').trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return res.status(400).send('Invalid Google Drive file ID');

  const driveUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  };
  if (req.headers.range) headers.Range = String(req.headers.range);

  try {
    let driveRes = await fetch(driveUrl, { headers, redirect: 'follow' });
    let contentType = driveRes.headers.get('content-type') || '';

    // Large public files can be returned as an HTML "download anyway" interstitial.
    if (contentType.toLowerCase().includes('text/html')) {
      const html = await driveRes.text();
      const href = html.match(/href=["']([^"']*confirm=[^"']+)["']/i)?.[1];
      const confirmToken = html.match(/name=["']confirm["']\s+value=["']([^"']+)["']/i)?.[1]
        || html.match(/value=["']([^"']+)["']\s+name=["']confirm["']/i)?.[1];

      if (href) {
        const decodedHref = href.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
        driveRes = await fetch(new URL(decodedHref, driveUrl), { headers, redirect: 'follow' });
      } else if (confirmToken) {
        const confirmationUrl = new URL('https://drive.usercontent.google.com/download');
        confirmationUrl.searchParams.set('id', fileId);
        confirmationUrl.searchParams.set('export', 'download');
        confirmationUrl.searchParams.set('confirm', confirmToken);
        driveRes = await fetch(confirmationUrl, { headers, redirect: 'follow' });
      } else {
        return res.status(502).send('Google Drive returned a confirmation page instead of the MP3. Make sure the file is shared with Anyone with the link.');
      }
      contentType = driveRes.headers.get('content-type') || '';
    }

    if (!driveRes.ok && driveRes.status !== 206) {
      const status = [401, 403, 404].includes(driveRes.status) ? 502 : driveRes.status;
      return res.status(status).send('Google Drive could not provide this MP3. Check that the selected MP3 is accessible to the site\'s Drive account and, for public-link playback, is shared with Anyone with the link.');
    }
    if (contentType.toLowerCase().includes('text/html')) {
      return res.status(502).send('Google Drive still returned a webpage instead of audio. Check the file sharing permissions and that the selected file is an MP3.');
    }
    if (!driveRes.body) return res.status(502).send('Google Drive returned an empty audio response.');

    res.status(driveRes.status === 206 ? 206 : 200);
    res.setHeader('Content-Type', contentType.toLowerCase().startsWith('audio/') ? contentType : 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="yousong-track.mp3"');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    for (const name of ['content-length', 'content-range', 'etag', 'last-modified']) {
      const value = driveRes.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    const nodeStream = (await import('stream')).Readable.fromWeb(driveRes.body as any);
    nodeStream.on('error', (error) => {
      console.error('[DriveAudio] Stream error:', error);
      if (!res.headersSent) res.status(502).end(); else res.destroy(error);
    });
    res.on('close', () => {
      if (!res.writableEnded) nodeStream.destroy();
    });
    return nodeStream.pipe(res);
  } catch (error: any) {
    console.error('[DriveAudio] Could not stream Google Drive file:', error);
    return res.status(502).send('Could not connect to Google Drive to stream this MP3.');
  }
});

// A requester may remove their own request until it has been published.
app.delete('/api/requests/:id', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Please log in again.' });
    const item = await getRequestByIdDb(req.params.id);
    if (!item || (item.requestedByUserId !== user.uid && user.role !== 'admin')) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }
    if (item.status === 'published') {
      return res.status(409).json({ success: false, error: 'This song is already published. Ask an administrator to remove it from the library.' });
    }
    await deleteRequestDb(req.params.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Requester delete request error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Could not delete request.' });
  }
});

app.delete('/api/admin/requests/:id', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
    const { id } = req.params;
    const item = await getRequestByIdDb(id);
    // ?keepSong=1 only removes the entry from the admin list; the song stays live in the library
    if (item?.publishedSongId && req.query.keepSong !== '1') {
      await deleteSongDb(item.publishedSongId);
    }
    await deleteRequestDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete request error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------- POPUPS -----------------
app.get('/api/popups', async (req: Request, res: Response) => {
  try {
    const list = await getPopupsDb();
    res.json({ popups: list });
  } catch (error: any) {
    console.error('Get popups error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/popups', async (req: Request, res: Response) => {
  try {
    const { targetUserId, title, message, type, durationMinutes, expiresAt, isDismissible } = req.body;
    let computedExpiresAt = null;
    if (durationMinutes && Number(durationMinutes) > 0) {
      computedExpiresAt = new Date(Date.now() + Number(durationMinutes) * 60 * 1000);
    } else if (expiresAt) {
      computedExpiresAt = new Date(expiresAt);
    }

    const newPopup = await createPopupDb({
      id: `popup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      targetUserId: targetUserId || 'all',
      title: title || 'Notice',
      message: message || '',
      type: type || 'announcement',
      createdAt: new Date().toISOString(),
      active: true,
      expiresAt: computedExpiresAt || undefined,
      isDismissible: isDismissible !== false,
    });
    res.json({ success: true, popup: newPopup });
  } catch (error: any) {
    console.error('Create popup error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/admin/popups/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    const updated = await updatePopupDb(id, active);
    res.json({ success: true, popup: updated });
  } catch (error: any) {
    console.error('Patch popup error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/popups/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deletePopupDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete popup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------- BANNER & MAINTENANCE SETTINGS -----------------
const getBannerHandler = async (_req: Request, res: Response) => {
  try {
    const banner = (await getSettingDb('banner')) || {
      enabled: true,
      versionName: 'v2.6 Pro Edition',
      sloganText: 'School Audio Hub',
      colorTheme: 'sapphire-ice',
      ribbonEnabled: true,
      ribbonNotice: 'All audio streams are school-safe, ad-free, and curated for focused study',
    };
    res.json({ banner });
  } catch (error: any) {
    console.error('Get banner error:', error);
    res.status(500).json({ error: error.message });
  }
};

const postBannerHandler = async (req: Request, res: Response) => {
  try {
    const current = (await getSettingDb('banner')) || {};
    const updated = {
      ...current,
      ...req.body,
      customGradientFrom: req.body.customGradientFrom !== undefined ? req.body.customGradientFrom : current.customGradientFrom,
      customGradientTo: req.body.customGradientTo !== undefined ? req.body.customGradientTo : current.customGradientTo,
    };
    await setSettingDb('banner', updated);
    res.json({ success: true, banner: updated });
  } catch (error: any) {
    console.error('Post banner error:', error);
    res.status(500).json({ error: error.message });
  }
};

app.get('/api/banner', getBannerHandler);
app.get('/api/admin/banner', getBannerHandler);
app.post('/api/banner', postBannerHandler);
app.post('/api/admin/banner', postBannerHandler);

app.get('/api/maintenance', async (req: Request, res: Response) => {
  try {
    const maintenance = (await getSettingDb('maintenance')) || {
      enabled: false,
      message: 'System maintenance in progress.',
      updatedAt: new Date().toISOString(),
      hasCountdown: false,
      estimatedFinishTime: null,
      autoDisableOnCountdown: false,
      tabMaintenance: {},
    };

    // Auto-disable maintenance mode if countdown timer reached zero and setting is enabled
    if (
      maintenance.enabled &&
      maintenance.hasCountdown &&
      maintenance.autoDisableOnCountdown &&
      maintenance.estimatedFinishTime
    ) {
      const finishDate = new Date(maintenance.estimatedFinishTime);
      if (!isNaN(finishDate.getTime()) && new Date() >= finishDate) {
        maintenance.enabled = false;
        await setSettingDb('maintenance', maintenance);
      }
    }

    res.json({ maintenance });
  } catch (error: any) {
    console.error('Get maintenance error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/maintenance', async (req: Request, res: Response) => {
  try {
    const { enabled, message, hasCountdown, estimatedFinishTime, autoDisableOnCountdown } = req.body;
    const current = (await getSettingDb('maintenance')) || {};
    const allowedTabs = ['library', 'playlists', 'favorites', 'chat', 'featureRequests'] as const;
    const requestedTabMaintenance = req.body?.tabMaintenance;
    const tabMaintenance = { ...(current.tabMaintenance || {}) };

    for (const tab of allowedTabs) {
      const requested = requestedTabMaintenance?.[tab];
      if (!requested || typeof requested !== 'object') continue;
      const previousMessage = tabMaintenance[tab]?.message || 'This section is temporarily unavailable while maintenance is in progress.';
      tabMaintenance[tab] = {
        enabled: Boolean(requested.enabled),
        message: typeof requested.message === 'string'
          ? requested.message.trim().slice(0, 500)
          : previousMessage,
      };
    }

    const updated = {
      ...current,
      enabled: !!enabled,
      message: typeof message === 'string' && message.trim()
        ? message.trim().slice(0, 1000)
        : current.message || 'System maintenance in progress.',
      updatedAt: new Date().toISOString(),
      hasCountdown: !!hasCountdown,
      estimatedFinishTime: hasCountdown ? estimatedFinishTime || null : null,
      autoDisableOnCountdown: !!autoDisableOnCountdown,
      tabMaintenance,
    };
    await setSettingDb('maintenance', updated);
    res.json({ success: true, maintenance: updated });
  } catch (error: any) {
    console.error('Post maintenance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------- CHAT SYSTEM (WITH STRICT ADMIN APPROVAL & OVERSIGHT) -----------------
// 1. Chat Requests
app.get('/api/chat/requests', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) {
      const member = getAuthUser(req);
      if (member?.chatBlocked) return res.status(403).json({ error: 'Your account is blocked from chat.' });
      return res.json({ requests: await getChatRequestsForUserDb(member.uid) });
    }
    const { userId } = req.query;
    if (userId && typeof userId === 'string') {
      const userRequests = await getChatRequestsForUserDb(userId);
      return res.json({ requests: userRequests });
    }
    const allRequests = await getChatRequestsDb();
    res.json({ requests: allRequests });
  } catch (error: any) {
    console.error('Get chat requests error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/requests', async (req: Request, res: Response) => {
  try {
    const { receiverId, receiverUsername, reason } = req.body;
    const senderId = getAuthUser(req).uid;
    const senderUsername = getAuthUser(req).username;
    if (!senderId || !receiverId) {
      return res.status(400).json({ error: 'Sender and receiver are required' });
    }
    if (senderId === receiverId) {
      return res.status(400).json({ error: 'Cannot request a chat with yourself' });
    }

    // Check if sender has global chat block
    const sender = await getUserByUid(senderId);
    if (sender?.chatBlocked) {
      return res.status(403).json({ error: 'Your chat privileges have been disabled by Administrator' });
    }

    // Check pairing block
    const isBlocked = await isChatPairingBlockedDb(senderId, receiverId);
    if (isBlocked) {
      return res.status(403).json({
        error: 'Communication between these two accounts is restricted by Administrator',
      });
    }

    const requestId = `chreq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const created = await createChatRequestDb({
      id: requestId,
      senderId,
      senderUsername: senderUsername || sender?.username || 'User',
      receiverId,
      receiverUsername: receiverUsername || 'User',
      reason,
    });

    res.json({ success: true, request: created });
  } catch (error: any) {
    console.error('Create chat request error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/chat/requests/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;
    if (status !== 'approved' && status !== 'declined') {
      return res.status(400).json({ error: 'Status must be approved or declined' });
    }

    const updated = await updateChatRequestStatusDb(id, status, adminNote);

    // Approving a request opens the conversation between the two users
    let thread = null;
    if (status === 'approved') {
      const reqItem: any = (await getChatRequestByIdDb(id)) || updated;
      if (reqItem?.senderId && reqItem?.receiverId) {
        thread = await createOrForceChatThreadDb(
          reqItem.senderId,
          reqItem.senderUsername || 'User',
          reqItem.receiverId,
          reqItem.receiverUsername || 'User',
          false
        );
      }
    }
    res.json({ success: true, request: updated, thread });
  } catch (error: any) {
    console.error('Update chat request error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/chat/requests/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isAdminReq(req)) {
      const item: any = await getChatRequestByIdDb(id);
      if (!item || item.senderId !== getAuthUser(req).uid) {
        return res.status(403).json({ error: 'You can only cancel your own requests' });
      }
    }
    await deleteChatRequestDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete chat request error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Chat Threads
app.get('/api/chat/threads', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) {
      const member = getAuthUser(req);
      const threads = await getChatThreadsForUserDb(member.uid);
      // Account-wide chat blocks may keep access to a suspension appeal thread only.
      return res.json({ threads: member.chatBlocked ? threads.filter((thread: any) => thread.isAppealThread) : threads });
    }
    const { userId, mode } = req.query;
    if (userId && typeof userId === 'string') {
      const user = await getUserByUid(userId);
      // Admin in oversight mode gets all threads; in personal messaging mode gets their own threads
      if (user?.role === 'admin' && mode === 'oversight') {
        const allThreads = await getChatThreadsDb();
        return res.json({ threads: allThreads });
      }
      const userThreads = await getChatThreadsForUserDb(userId);
      return res.json({ threads: userThreads });
    }
    // Admin master list of all threads
    const allThreads = await getChatThreadsDb();
    res.json({ threads: allThreads });
  } catch (error: any) {
    console.error('Get chat threads error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin force-start a chat between any two users
app.post('/api/chat/threads/force', async (req: Request, res: Response) => {
  try {
    const { user1Id, user1Username, user2Id, user2Username } = req.body;
    if (!user1Id || !user2Id) {
      return res.status(400).json({ error: 'Both users required' });
    }
    if (user1Id === user2Id) {
      return res.status(400).json({ error: 'Cannot pair user with themselves' });
    }

    const thread = await createOrForceChatThreadDb(
      user1Id,
      user1Username || 'User A',
      user2Id,
      user2Username || 'User B',
      false
    );
    res.json({ success: true, thread });
  } catch (error: any) {
    console.error('Force chat thread error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin terminate / stop thread
app.patch('/api/chat/threads/:id/terminate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const updated = await setChatThreadTerminatedDb(
      id,
      true,
      reason || 'Messaging disabled by Administrator'
    );
    res.json({ success: true, thread: updated });
  } catch (error: any) {
    console.error('Terminate thread error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin re-open thread
app.patch('/api/chat/threads/:id/reopen', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await setChatThreadTerminatedDb(id, false, undefined);
    res.json({ success: true, thread: updated });
  } catch (error: any) {
    console.error('Reopen thread error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/chat/threads/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteChatThreadDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete chat thread error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User hide/delete thread from their view (pops back up on new message)
app.post('/api/chat/threads/:id/hide', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getAuthUser(req).uid;
    await hideChatThreadForUserDb(id, userId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Hide chat thread error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Suspended user creates/retrieves direct appeal thread with Admin
app.post('/api/chat/appeal', async (req: Request, res: Response) => {
  try {
    // A suspended person can only open an appeal for their own account
    const userId = getAuthUser(req).uid;
    const username = getAuthUser(req).username;
    const user = await getUserByUid(userId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }
    const thread = await createOrGetAppealThreadDb(userId, username);
    res.json({ success: true, thread });
  } catch (error: any) {
    console.error('Appeal chat thread error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Chat Messages
app.get('/api/chat/messages/:threadId', async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const me = getAuthUser(req);
    if (me.role !== 'admin') {
      const thread: any = await getChatThreadByIdDb(threadId);
      if (!thread || (thread.user1Id !== me.uid && thread.user2Id !== me.uid)) {
        return res.status(403).json({ error: 'You are not part of this conversation' });
      }
      if (me.chatBlocked && !thread.isAppealThread) {
        return res.status(403).json({ error: 'Your account is blocked from chat.' });
      }
    }
    const messages = await getChatMessagesDb(threadId);
    res.json({ messages });
  } catch (error: any) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete specific chat message
app.delete('/api/chat/messages/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteChatMessageDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin master feed across all conversations for live moderation
app.get('/api/chat/messages-all', async (_req: Request, res: Response) => {
  try {
    const messages = await getAllChatMessagesDb(150);
    res.json({ messages });
  } catch (error: any) {
    console.error('Get all messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/messages', async (req: Request, res: Response) => {
  try {
    const { threadId, content } = req.body;
    const me = getAuthUser(req);
    const senderId = me.uid;
    const senderUsername = me.username;
    if (!threadId || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Thread and content are required' });
    }

    const thread = await getChatThreadByIdDb(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Conversation thread not found' });
    }
    // Only people in the conversation (or an admin) can post in it
    if (me.role !== 'admin' && thread.user1Id !== me.uid && thread.user2Id !== me.uid) {
      return res.status(403).json({ error: 'You are not part of this conversation' });
    }
    const receiverId = thread.user1Id === me.uid ? thread.user2Id : thread.user1Id;

    // If appeal thread: check participants
    if (thread.isAppealThread) {
      const u1 = await getUserByUid(thread.user1Id);
      const u2 = await getUserByUid(thread.user2Id);
      const hasSuspendedUser = (u1 && u1.isSuspended) || (u2 && u2.isSuspended);
      const sender = await getUserByUid(senderId);
      if (!hasSuspendedUser && sender?.role !== 'admin') {
        return res.status(403).json({ error: 'This suspension appeal is already resolved. Account is active.' });
      }
    }

    // Verify sender is not globally blocked or suspended (except for active direct suspension appeal threads)
    const sender = await getUserByUid(senderId);
    if (sender?.isSuspended && !thread?.isAppealThread) {
      return res.status(403).json({ error: 'Your account is suspended. Please use the suspension appeal screen.' });
    }
    if (sender?.chatBlocked && !thread?.isAppealThread) {
      return res.status(403).json({ error: 'Your chat privileges have been disabled by Administrator' });
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const created = await createChatMessageDb({
      id: messageId,
      threadId,
      senderId,
      senderUsername: senderUsername || sender?.username || 'User',
      receiverId: receiverId || '',
      content: content.trim().slice(0, 2000),
    });

    res.json({ success: true, message: created });
  } catch (error: any) {
    console.error('Send message error:', error);
    res.status(400).json({ error: error.message || 'Could not send message' });
  }
});

// 4. Pairing Blocks
app.get('/api/chat/pairing-blocks', async (_req: Request, res: Response) => {
  try {
    const blocks = await getChatPairingBlocksDb();
    res.json({ blocks });
  } catch (error: any) {
    console.error('Get pairing blocks error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/pairing-blocks', async (req: Request, res: Response) => {
  try {
    const { user1Id, user2Id, blockedBy, reason } = req.body;
    if (!user1Id || !user2Id) {
      return res.status(400).json({ error: 'Both user IDs are required' });
    }
    const created = await createChatPairingBlockDb(
      user1Id,
      user2Id,
      blockedBy || 'admin',
      reason
    );
    res.json({ success: true, block: created });
  } catch (error: any) {
    console.error('Create pairing block error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/chat/pairing-blocks/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await deleteChatPairingBlockDb(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete pairing block error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------- DATABASE SAVE TEST (admin) -----------------
// Actually saves, reads back and deletes a test song / account / setting using the app's own
// code, and checks the rows really landed in the database (not in the temporary local store).
app.post('/api/admin/database/self-test', async (_req: Request, res: Response) => {
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];
  const connected = await checkSqlAvailability();
  results.push({
    name: 'Connected to the database',
    ok: connected,
    error: connected ? undefined : getDatabaseHealth().lastError || 'Not connected',
  });
  if (!connected) return res.json({ ok: false, results });

  const pool = createPool();
  const stamp = Date.now();
  const check = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e: any) {
      const root = e?.cause || e;
      results.push({ name, ok: false, error: String(root?.message || e).slice(0, 300) });
    }
  };

  await check('All tables exist', async () => {
    for (const t of ['users', 'songs', 'popups', 'song_requests', 'system_settings', 'chat_requests', 'chat_threads', 'chat_messages']) {
      await pool.query(`SELECT 1 FROM ${t} LIMIT 1`);
    }
  });

  const songId = `selftest-song-${stamp}`;
  await check('Saving a song', async () => {
    await insertSongDb({
      id: songId,
      title: 'Save test',
      artist: 'System',
      genre: 'Test',
      duration: 1,
      audioUrl: 'https://example.com/test.mp3',
      coverUrl: 'https://example.com/x.jpg',
      addedAt: new Date().toISOString(),
    });
    const r = await pool.query('SELECT id FROM songs WHERE id = $1', [songId]);
    if (!r.rowCount) {
      throw new Error(`The song was NOT stored in the database. ${getDatabaseHealth().lastDbError?.message || ''}`.trim());
    }
  });
  try { await deleteSongDb(songId); } catch (_) {}

  const userId = `selftest-user-${stamp}`;
  await check('Saving an account', async () => {
    await createUserDb({
      uid: userId,
      username: `selftest_${stamp}`,
      passwordHash: 'x',
      role: 'user',
      isApproved: false,
      note: 'database save test',
    });
    const r = await pool.query('SELECT uid FROM users WHERE uid = $1', [userId]);
    if (!r.rowCount) {
      throw new Error(`The account was NOT stored in the database. ${getDatabaseHealth().lastDbError?.message || ''}`.trim());
    }
  });
  try { await deleteUserDb(userId); } catch (_) {}

  await check('Saving a site setting (banner, maintenance, announcements)', async () => {
    await setSettingDb('selftest', { at: stamp });
    const r = await pool.query('SELECT key FROM system_settings WHERE key = $1', ['selftest']);
    if (!r.rowCount) {
      throw new Error(`The setting was NOT stored in the database. ${getDatabaseHealth().lastDbError?.message || ''}`.trim());
    }
    await pool.query('DELETE FROM system_settings WHERE key = $1', ['selftest']);
  });

  const allOk = results.every((r) => r.ok);
  if (allOk) clearDbError();
  res.json({ ok: allOk, results });
});

// ----------------- FEATURE REQUESTS & BUG REPORTS -----------------
const feedbackHits = new Map<string, number[]>();

async function isAdminUserId(uid: unknown): Promise<boolean> {
  if (!uid || typeof uid !== 'string') return false;
  try {
    const u = await getUserByUid(uid);
    return u?.role === 'admin';
  } catch {
    return false;
  }
}

app.post('/api/feedback', async (req: Request, res: Response) => {
  try {
    const { type, title, details, area, userAgent } = req.body || {};
    const authed = getAuthUser(req);
    const userId: string | undefined = authed?.uid;
    const username: string = authed?.username || 'Guest';
    if (type !== 'feature' && type !== 'bug') {
      return res.status(400).json({ error: 'Type must be feature or bug' });
    }

    if (type === 'feature' && !isAdminReq(req)) {
      const maintenance = await getSettingDb<any>('maintenance');
      const featureMaintenance = maintenance?.tabMaintenance?.featureRequests;
      if (featureMaintenance?.enabled) {
        return res.status(503).json({
          error: featureMaintenance.message || 'Feature requests are temporarily paused for maintenance.',
        });
      }
    }

    const cleanTitle = String(title || '').trim().slice(0, 140);
    const cleanDetails = String(details || '').trim().slice(0, 4000);
    if (!cleanTitle) return res.status(400).json({ error: 'Please add a short title' });
    if (!cleanDetails) return res.status(400).json({ error: 'Please add some details' });

    // Simple spam guard: 10 submissions per hour per visitor
    const key = (typeof userId === 'string' && userId) || req.ip || 'anon';
    const now = Date.now();
    const recent = (feedbackHits.get(key) || []).filter((t) => now - t < 3600_000);
    if (recent.length >= 10) {
      return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    }
    recent.push(now);
    feedbackHits.set(key, recent);

    let name = String(username || '').trim().slice(0, 60);
    if (!name && typeof userId === 'string') {
      const u = await getUserByUid(userId);
      name = u?.username || '';
    }
    const item = await createFeedbackDb({
      type,
      title: cleanTitle,
      details: cleanDetails,
      area: area ? String(area).slice(0, 60) : null,
      userId: typeof userId === 'string' ? userId : null,
      username: name || 'Guest',
      userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
    });
    res.json({ success: true, item });
  } catch (error: any) {
    console.error('Create feedback error:', error);
    res.status(500).json({ error: error.message || 'Could not save your submission' });
  }
});

// A person's own reports, with progress and an "unread" flag for anything that changed
app.get('/api/feedback/mine', async (req: Request, res: Response) => {
  try {
    const items = await listFeedbackForUserDb(getAuthUser(req).uid);
    res.json({ items });
  } catch (error: any) {
    console.error('My feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/feedback/mine/seen', async (req: Request, res: Response) => {
  try {
    await markFeedbackSeenDb(getAuthUser(req).uid);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/feedback/clear-closed', async (_req: Request, res: Response) => {
  try {
    const removed = await clearClosedFeedbackDb();
    res.json({ success: true, removed });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/feedback', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json({ items: await listFeedbackDb() });
  } catch (error: any) {
    console.error('List feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/admin/feedback/:id', async (req: Request, res: Response) => {
  try {
    const { userId, status, adminNote } = req.body || {};
    if (!isAdminReq(req)) return res.status(403).json({ error: 'Admin only' });
    if (status && !['new', 'in_progress', 'done', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const ok = await updateFeedbackDb(req.params.id, {
      status,
      adminNote: adminNote === undefined ? undefined : String(adminNote).slice(0, 1000),
    });
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Update feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/feedback/:id', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ error: 'Admin only' });
    await deleteFeedbackDb(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------- DATABASE BACKUP & RESTORE -----------------
app.get('/api/admin/database/export', (_req: Request, res: Response) => {
  try {
    const dbPath = path.resolve(process.cwd(), 'data/local_db.json');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="yousong_db_backup_${timestamp}.json"`);
    res.sendFile(dbPath);
  } catch (err: any) {
    console.error('Database export error:', err);
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

app.post('/api/admin/database/import', express.json({ limit: '50mb' }), (req: Request, res: Response) => {
  try {
    const raw = req.body;
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.users) || !Array.isArray(raw.songs)) {
      return res.status(400).json({ error: 'Invalid database backup JSON format' });
    }
    const dbPath = path.resolve(process.cwd(), 'data/local_db.json');
    fs.writeFileSync(dbPath, JSON.stringify(raw, null, 2));
    res.json({ success: true, message: 'Database successfully restored from backup' });
  } catch (err: any) {
    console.error('Database import error:', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

// --- Supabase Hosting, Migration & Status Endpoints ---
app.get('/api/admin/database/status', async (_req: Request, res: Response) => {
  try {
    const isSql = await checkSqlAvailability();
    const connStr = getActiveConnectionString() || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
    const maskedConn = connStr
      ? connStr.replace(/:([^:@]+)@/, ':****@')
      : null;

    res.json({
      activeHosting: isSql ? 'supabase' : 'local_file',
      engine: isSql ? 'Supabase / PostgreSQL Cloud Database' : 'Local Persistent Storage (local_db.json)',
      isSqlConnected: isSql,
      persistent: isSql,
      connectionSource: getDatabaseHealth().source,
      lastError: isSql ? null : getDatabaseHealth().lastError,
      lastDbError: getDatabaseHealth().lastDbError,
      configuredConnectionString: maskedConn,
      supabaseUrl: process.env.SUPABASE_URL || null,
      hasCredentials: Boolean(connStr || process.env.SUPABASE_URL),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/database/supabase-schema', (_req: Request, res: Response) => {
  try {
    const schemaPath = path.resolve(process.cwd(), 'supabase-schema.sql');
    if (!fs.existsSync(schemaPath)) {
      return res.status(404).json({ error: 'Schema file not found' });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(schemaPath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/database/supabase-migration-sql', (_req: Request, res: Response) => {
  try {
    const fullSql = generateSupabaseMigrationSql();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="yousong_supabase_full_migration.sql"');
    res.send(fullSql);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/database/test-supabase', async (req: Request, res: Response) => {
  try {
    const { connectionString } = req.body;
    const target = connectionString || getActiveConnectionString() || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!target) {
      return res.status(400).json({ error: 'Supabase PostgreSQL connection string is required' });
    }

    const result = await testSupabaseDbConnection(target);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/database/connect-supabase', async (req: Request, res: Response) => {
  try {
    const { connectionString } = req.body;
    if (!connectionString || !connectionString.trim()) {
      setSupabaseConnectionString(undefined);
      return res.json({ success: true, message: 'Switched to local database store.', activeHosting: 'local_file' });
    }

    const test = await testSupabaseDbConnection(connectionString.trim());
    if (!test.success) {
      return res.status(400).json({
        success: false,
        error: `Could not connect to Supabase: ${test.error || 'Connection failed'}. Please check your database password.`,
      });
    }

    setSupabaseConnectionString(connectionString.trim());
    const isConnected = await checkSqlAvailability();

    res.json({
      success: true,
      message: 'Successfully connected and switched active database hosting to Supabase PostgreSQL!',
      version: test.version,
      latencyMs: test.latencyMs,
      activeHosting: isConnected ? 'supabase' : 'local_file',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/database/sync-to-supabase', async (req: Request, res: Response) => {
  try {
    const { connectionString } = req.body;
    const target = connectionString || getActiveConnectionString() || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!target) {
      return res.status(400).json({ error: 'Supabase connection string is required to perform data sync' });
    }

    const result = await syncLocalDataToSupabase(target);
    if (result.success) {
      setSupabaseConnectionString(target);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------- SONG DURATION AUTO-FIX & BACKGROUND WORKERS -----------------
async function fixAllPreviousSongsDuration(audioDir: string): Promise<number> {
  let updatedCount = 0;
  try {
    const mm = await import('music-metadata');
    const allSongs = await getSongsDb();

    for (const song of allSongs) {
      let trueDuration = 0;

      if (song.audioUrl) {
        if (song.audioUrl.startsWith('/api/media/audio/')) {
          const fname = path.basename(song.audioUrl);
          const fpath = path.join(audioDir, fname);

          if (fs.existsSync(fpath)) {
            try {
              const meta = await mm.parseFile(fpath);
              if (meta.format?.duration && isFinite(meta.format.duration)) {
                trueDuration = Math.round(meta.format.duration);
              }
            } catch (err) {
              console.warn(`Could not parse ${fname} for duration fix:`, err);
            }
          }

          if (!trueDuration) {
            // Seed wav fallbacks if container disk is fresh
            if (fname.includes('seed_acoustic')) trueDuration = 20;
            else if (fname.includes('seed_ambient')) trueDuration = 20;
            else if (fname.includes('seed_lofi')) trueDuration = 15;
            else if (fname.includes('seed_synthwave')) trueDuration = 20;
          }
        } else if (
          song.audioUrl.includes('drive.google.com')
          || song.audioUrl.includes('/api/media/drive-stream/')
          || song.audioUrl.includes('/api/drive/stream/')
        ) {
          const driveId = extractDriveFileId(song.audioUrl);
          if (driveId) {
            try {
              const streamUrl = `https://docs.google.com/uc?export=download&id=${driveId}`;
              const resp = await fetch(streamUrl, {
                headers: { Range: 'bytes=0-1048576', 'User-Agent': 'Mozilla/5.0' },
                redirect: 'follow',
              });
              if (resp.ok) {
                const ab = await resp.arrayBuffer();
                const meta = await mm.parseBuffer(Buffer.from(ab));
                if (meta.format?.duration && isFinite(meta.format.duration)) {
                  trueDuration = Math.round(meta.format.duration);
                }
              }
            } catch {}
          }
        }
      }

      // If duration is inaccurate (e.g. defaulted to 210 / 180 or differs from true file length), fix it!
      if (trueDuration > 0 && Math.abs(song.duration - trueDuration) >= 1) {
        await updateSongDb(song.id, { duration: trueDuration });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`Auto-corrected durations for ${updatedCount} song(s) in database.`);
    }
  } catch (e) {
    console.error('Error during fixAllPreviousSongsDuration:', e);
  }
  return updatedCount;
}

// ----------------- START SERVER & VITE -----------------
async function startServer() {
  // Make sure every table exists (chat, feedback, ...) before serving traffic
  try {
    await ensureTables();
  } catch (err) {
    console.warn('[Schema] ensureTables failed:', err);
  }
  // Finished feature requests / bug reports disappear 24 hours after they are completed or declined
  purgeClosedFeedbackDb().catch(() => {});
  setInterval(() => purgeClosedFeedbackDb().catch(() => {}), 60 * 60 * 1000);

  // Admin account: optionally (re)set from ADMIN_PASSWORD, and warn about the default password
  try {
    const adminName = (process.env.ADMIN_USERNAME || 'admin').trim();
    const adminPw = process.env.ADMIN_PASSWORD;
    if (adminPw && adminPw.length >= 8) {
      const hash = await hashPasswordSecure(adminPw);
      const existingAdmin = await getUserByUsername(adminName);
      if (existingAdmin) {
        await updateUserDb(existingAdmin.uid, {
          passwordHash: hash,
          role: 'admin',
          isApproved: true,
          isSuspended: false,
          temporaryPasswordAssigned: false,
        });
      } else {
        await createUserDb({
          uid: `user-admin-${Date.now()}`,
          username: adminName,
          passwordHash: hash,
          role: 'admin',
          isApproved: true,
          note: 'Created from ADMIN_PASSWORD',
        });
      }
      console.log(`[Security] Password for admin account "${adminName}" was set from ADMIN_PASSWORD.`);
    }
    const defaultAdmin = await getUserByUsername('admin');
    if (defaultAdmin && (await verifyPassword('admin123', defaultAdmin.passwordHash)).ok) {
      console.warn('[Security] WARNING: the "admin" account still uses the default password. Change it now.');
    }
  } catch (err) {
    console.warn('[Security] Admin account check skipped:', err);
  }
  // Ensure schema extensions exist
  await initDatabaseSchemaExtensions();
  // Ensure database has default seed data
  await seedDatabaseIfEmpty();

  // Purge any legacy automated welcome broadcast completely
  await purgeWelcomePopupsDb();
  await cleanupExpiredPopupsDb();

  // Auto-delete approved and declined song requests (12-hour rule)
  await cleanupExpiredSongRequestsDb();

  // Fix all previous uploaded songs that have incorrect or default durations
  await fixAllPreviousSongsDuration(AUDIO_DIR);

  // Active automated background cleanup: auto-deletes expired broadcasts every 4 seconds
  setInterval(async () => {
    try {
      await cleanupExpiredPopupsDb();
    } catch {}
  }, 4000);

  // Automated background cleanup: auto-deletes approved/declined song requests older than 12h every 10 minutes
  setInterval(async () => {
    try {
      const removed = await cleanupExpiredSongRequestsDb();
      if (removed > 0) {
        console.log(`Auto-cleaned ${removed} expired song requests (12h rule)`);
      }
    } catch (err) {
      console.error('Request cleanup interval error:', err);
    }
  }, 10 * 60 * 1000);

  // Render sets RENDER=true; treat it as production even if NODE_ENV isn't set,
  // otherwise the server falls into Vite dev mode and the page can render blank.
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtml = path.join(distPath, 'index.html');

    if (!fs.existsSync(indexHtml)) {
      console.error(
        `[static] ${indexHtml} not found. Did the Render build command run "npm run build"?`
      );
    }

    // Serve the built frontend (hashed JS/CSS live in dist/assets)
    app.use(express.static(distPath, { index: false }));

    // Unknown API routes should 404 as JSON, not return the HTML shell
    app.use('/api', (_req, res) => {
      res.status(404).json({ success: false, error: 'API route not found' });
    });

    // SPA fallback: only for page navigations, never for files with an extension.
    // A missing /assets/xyz.js must 404, not return index.html (which causes a blank screen).
    app.get('*', (req, res, next) => {
      if (path.extname(req.path)) return next();
      if (!fs.existsSync(indexHtml)) {
        return res.status(500).send('Frontend build missing: run "npm run build" before starting the server.');
      }
      res.sendFile(indexHtml);
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`YouSong Server running on port ${PORT} connected to Cloud SQL PostgreSQL`);
  });
}

startServer();
async function assertDriveFilesAreNotAlreadyLinked(audioFileId?: string | null, artworkFileId?: string | null): Promise<void> {
  if (!audioFileId && !artworkFileId) return;
  const [registry, songs] = await Promise.all([getMediaIdsDb(), getSongsDb()]);
  const registryMatch: any = registry.find((item: any) =>
    (audioFileId && item.audioFileId === audioFileId) ||
    (artworkFileId && item.artworkFileId === artworkFileId)
  );
  if (registryMatch?.status === 'assigned' && registryMatch.songId) {
    throw new Error('That Google Drive file is already registered to another song (Media ID ' + registryMatch.code + '). Choose a different file.');
  }
  const songMatch: any = songs.find((song: any) =>
    (audioFileId && extractDriveFileId(String(song.audioUrl || '')) === audioFileId) ||
    (artworkFileId && extractDriveFileId(String(song.coverUrl || '')) === artworkFileId)
  );
  if (songMatch) {
    throw new Error('That Google Drive file is already linked to "' + songMatch.title + '". Choose a different file so an existing song is not changed.');
  }
}

async function generateSongMediaCode(excludeSongId?: string, preferredCode?: string): Promise<string> {
  const [songs, requests, registry] = await Promise.all([getSongsDb(), getRequestsDb(), getMediaIdsDb()]);
  const registryByCode = new Map((registry || []).map((item: any) => [String(item.code), item]));
  const usedCodes = new Set<string>();
  for (const item of Array.isArray(songs) ? songs : []) {
    if (item?.id === excludeSongId) continue;
    const code = String(item?.mediaCode || '').trim();
    if (/^[0-9]{3}$/.test(code)) usedCodes.add(code);
  }
  for (const item of Array.isArray(requests) ? requests : []) {
    if (item?.status === 'published') continue;
    const code = String(item?.mediaCode || '').trim();
    if (/^[0-9]{3}$/.test(code)) usedCodes.add(code);
  }
  for (const item of registry || []) {
    const belongsToCurrentSong = Boolean(excludeSongId && item.songId === excludeSongId);
    if (!belongsToCurrentSong) usedCodes.add(String(item.code));
  }
  const tryClaim = async (candidate: string, explicitlyRequested = false): Promise<boolean> => {
    const existing: any = registryByCode.get(candidate);
    const isFreeReservation = existing?.status === 'reserved' && !existing.songId && !existing.requestId;
    const belongsToCurrentSong = Boolean(excludeSongId && existing?.songId === excludeSongId);
    if (!/^[0-9]{3}$/.test(candidate) || (usedCodes.has(candidate) && !(explicitlyRequested && isFreeReservation))) return false;
    if (existing && !isFreeReservation && !belongsToCurrentSong) return false;
    if (existing) return true;
    return reserveMediaIdDb(candidate);
  };
  if (preferredCode && await tryClaim(preferredCode, true)) return preferredCode;
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    const candidate = String(randomBytes(2).readUInt16BE(0) % 1000).padStart(3, '0');
    if (await tryClaim(candidate)) return candidate;
  }
  throw new Error('All available three-digit Media IDs are assigned or reserved. Retire or clean up an ID before adding another song.');
}

