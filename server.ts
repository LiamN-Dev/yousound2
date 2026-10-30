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
import { uploadMp3ToGoogleDrive, uploadImageToGoogleDrive, deleteGoogleDriveFile } from './src/services/audioPipeline.ts';
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
const MAX_INLINE_AUDIO_BYTES = 20 * 1024 * 1024;
async function persistInlineAudioDataUri(dataUri: string, title = 'track'): Promise<string> {
  const match = /^data:(audio\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUri);
  if (!match) throw new Error('Audio data URI is malformed or is not base64-encoded audio.');

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/[\r\n]/g, '');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new Error('Audio data is empty.');
  if (buffer.length > MAX_INLINE_AUDIO_BYTES) throw new Error('Inline audio exceeds the 20 MB limit. Upload larger audio files using the audio upload form.');
  // Reject malformed base64 rather than silently storing a truncated/corrupt file.
  if (buffer.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) {
    throw new Error('Audio data URI contains invalid base64.');
  }

  const extensionByMime: Record<string, string> = {
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
    'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/webm': 'webm',
    'audio/wave': 'wav', 'audio/vnd.wave': 'wav',
  };
  const ext = extensionByMime[mimeType];
  if (!ext) throw new Error(`Unsupported inline audio MIME type: ${mimeType}`);
  const safeStem = (title || 'track').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'track';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safeStem}.${ext}`;
  const filePath = path.join(AUDIO_DIR, filename);

  fs.writeFileSync(filePath, buffer, { flag: 'wx' });
  try {
    // Store a durable database copy as well as the local cache, matching the existing media route.
    await saveMediaFileDb(filename, buffer.toString('base64'), mimeType, buffer.length);
  } catch (error) {
    try { fs.unlinkSync(filePath); } catch (_) { /* best effort cleanup */ }
    throw error;
  }
  return `/api/media/audio/${encodeURIComponent(filename)}`;
}

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename: (_req, file, cb) => {
    const clean = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${clean}`);
  },
});
const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, COVERS_DIR),
  filename: (_req, file, cb) => {
    const clean = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${clean}`);
  },
});
const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: 35 * 1024 * 1024 }, // 35MB for animated loop video covers & high-res GIFs
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
// Audio File Upload (Multipart Form Data)
app.post('/api/upload/audio', (req: Request, res: Response) => {
  uploadAudio.single('audio')(req, res, async (err: any) => {
    if (err) {
      console.error('Audio upload error:', err);
      return res.status(400).json({ success: false, error: err.message || 'Audio upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file provided' });
    }
    const filename = req.file.filename;
    const audioUrl = `/api/media/audio/${filename}`;

    // Persist permanently into PostgreSQL so it NEVER gets erased across container restarts or 4-hour timeouts
    // Extract exact duration using music-metadata
    let duration = 0;
    try {
      const mm = await import('music-metadata');
      const fileBuffer = fs.readFileSync(req.file.path);
      const meta = await mm.parseBuffer(fileBuffer);
      if (meta.format?.duration && isFinite(meta.format.duration)) {
        duration = Math.round(meta.format.duration);
      }
      const base64Data = fileBuffer.toString('base64');
      const mime = req.file.mimetype || 'audio/mpeg';
      await saveMediaFileDb(filename, base64Data, mime, req.file.size);
    } catch (saveErr) {
      console.error('Failed to parse or persist audio into PostgreSQL database:', saveErr);
    }

    return res.json({
      success: true,
      audioUrl,
      filename,
      duration,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });
});

// Audio File Upload Fallback (Base64 JSON - immune to proxy multipart issues)
app.post('/api/upload/audio-base64', async (req: Request, res: Response) => {
  try {
    const { filename, base64 } = req.body;
    if (!base64) {
      return res.status(400).json({ success: false, error: 'No audio data provided' });
    }
    const cleanName = (filename || 'track.mp3').replace(/[^a-zA-Z0-9.-]/g, '_');
    const finalFilename = `${Date.now()}-${cleanName}`;
    const filePath = path.join(AUDIO_DIR, finalFilename);
    const rawData = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(rawData, 'base64');
    fs.writeFileSync(filePath, buffer);

    let mimeType = 'audio/mpeg';
    if (cleanName.endsWith('.wav')) mimeType = 'audio/wav';
    else if (cleanName.endsWith('.ogg')) mimeType = 'audio/ogg';
    else if (cleanName.endsWith('.m4a') || cleanName.endsWith('.aac')) mimeType = 'audio/mp4';
    else if (cleanName.endsWith('.flac')) mimeType = 'audio/flac';

    // Persist permanently into PostgreSQL database
    await saveMediaFileDb(finalFilename, rawData, mimeType, buffer.length);

    let duration = 0;
    try {
      const mm = await import('music-metadata');
      const meta = await mm.parseBuffer(buffer);
      if (meta.format?.duration && isFinite(meta.format.duration)) {
        duration = Math.round(meta.format.duration);
      }
    } catch (err) {
      console.warn('Could not parse audio duration from base64:', err);
    }

    res.json({
      success: true,
      audioUrl: `/api/media/audio/${finalFilename}`,
      filename: finalFilename,
      duration,
      size: buffer.length,
    });
  } catch (err: any) {
    console.error('Base64 audio upload error:', err);
    res.status(500).json({ success: false, error: err.message || 'Audio upload failed' });
  }
});

// Cover Image Upload (Multipart Form Data)
app.post('/api/upload/cover', (req: Request, res: Response) => {
  uploadCover.single('cover')(req, res, async (err: any) => {
    if (err) {
      console.error('Cover upload error:', err);
      return res.status(400).json({ success: false, error: err.message || 'Cover upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No cover image file provided' });
    }
    const filename = req.file.filename;
    const coverUrl = `/api/media/cover/${filename}`;

    // Persist permanently into PostgreSQL
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const base64Data = fileBuffer.toString('base64');
      const mime = req.file.mimetype || 'image/jpeg';
      await saveMediaFileDb(filename, base64Data, mime, req.file.size);
    } catch (saveErr) {
      console.error('Failed to persist cover into PostgreSQL database:', saveErr);
    }

    return res.json({
      success: true,
      coverUrl,
      filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  });
});

// Cover Image Upload Fallback (Base64 JSON)
app.post('/api/upload/cover-base64', async (req: Request, res: Response) => {
  try {
    const { filename, base64 } = req.body;
    if (!base64) {
      return res.status(400).json({ success: false, error: 'No cover data provided' });
    }
    const cleanName = (filename || 'cover.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
    const finalFilename = `${Date.now()}-${cleanName}`;
    const filePath = path.join(COVERS_DIR, finalFilename);
    const rawData = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(rawData, 'base64');
    fs.writeFileSync(filePath, buffer);

    let mimeType = 'image/jpeg';
    if (cleanName.endsWith('.png')) mimeType = 'image/png';
    else if (cleanName.endsWith('.webp')) mimeType = 'image/webp';
    else if (cleanName.endsWith('.gif')) mimeType = 'image/gif';
    else if (cleanName.endsWith('.svg')) mimeType = 'image/svg+xml';

    // Persist permanently into PostgreSQL
    await saveMediaFileDb(finalFilename, rawData, mimeType, buffer.length);

    res.json({
      success: true,
      coverUrl: `/api/media/cover/${finalFilename}`,
      filename: finalFilename,
      size: buffer.length,
    });
  } catch (err: any) {
    console.error('Base64 cover upload error:', err);
    res.status(500).json({ success: false, error: err.message || 'Cover upload failed' });
  }
});

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
  const trimmed = inputUrl.trim();
  const match = trimmed.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|uc\?export=download&id=)|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  if (match) return match[1];
  // If user pasted just the ID
  if (/^[a-zA-Z0-9_-]{25,45}$/.test(trimmed)) return trimmed;
  return null;
}

// Google Drive Audio Streaming Proxy with Byte-Range Scrubbing Support
app.get('/api/media/drive-stream/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]{20,45}$/.test(fileId)) {
    return res.status(400).send('Invalid Google Drive file ID');
  }
  const driveUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

  // Normal playback goes straight to Drive so the application's host does not pay to retransmit audio bytes.
  // Add ?proxy=1 only as a compatibility fallback for a public Drive file that will not stream directly.
  if (req.query.proxy !== '1') return res.redirect(302, driveUrl);

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    };
    if (req.headers.range) headers.Range = req.headers.range;
    let driveRes = await fetch(driveUrl, { headers, redirect: 'follow' });

    // Only read a body when Google returned an HTML confirmation page; never duplicate-read a normal audio stream.
    const contentType = driveRes.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await driveRes.text();
      const match = html.match(/href="([^"]+confirm=[^"]+)"/);
      if (match?.[1]) {
        const confirmUrl = match[1].replace(/&amp;/g, '&');
        driveRes = await fetch(new URL(confirmUrl, driveUrl), { headers, redirect: 'follow' });
      } else {
        return res.status(502).send('Google Drive returned a download confirmation page. Ensure the file is shared with anyone who has the link.');
      }
    }
    if (!driveRes.ok && driveRes.status !== 206) {
      return res.status(driveRes.status).send('Could not retrieve audio from Google Drive. Check that link sharing is set to Anyone with the link.');
    }
    res.status(driveRes.status);
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = driveRes.headers.get(header);
      if (value) res.setHeader(header === 'content-type' ? 'Content-Type' : header === 'content-length' ? 'Content-Length' : header === 'content-range' ? 'Content-Range' : header === 'accept-ranges' ? 'Accept-Ranges' : header === 'etag' ? 'ETag' : 'Last-Modified', value);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (!driveRes.body) return res.end();
    const nodeStream = (await import('stream')).Readable.fromWeb(driveRes.body as any);
    nodeStream.on('error', (error) => {
      console.error('Drive proxy stream error:', error);
      if (!res.headersSent) res.status(502).end(); else res.destroy(error);
    });
    return nodeStream.pipe(res);
  } catch (error: any) {
    console.error('Drive stream proxy error:', error);
    return res.status(502).send('Failed to stream audio from Google Drive');
  }
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
    setSessionCookie(req, res, { uid: user.uid, passwordHash });

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
        suspendedReason: user.suspendedReason || null,
        lastLoginAt: new Date().toISOString(),
        lastSongListened: user.lastSongListened,
        lastSongListenedAt: toIsoString(user.lastSongListenedAt),
        chatBlocked: user.chatBlocked || false,
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
      suspendedReason: user.suspendedReason || null,
      lastLoginAt: toIsoString(user.lastLoginAt),
      lastSongListened: user.lastSongListened,
      lastSongListenedAt: toIsoString(user.lastSongListenedAt),
      chatBlocked: user.chatBlocked || false,
    },
  });
});

app.get('/api/auth/me/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const me = getAuthUser(req);
    if (!me || (me.uid !== userId && me.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'Not allowed' });
    }
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
        suspendedReason: user.suspendedReason || null,
        lastLoginAt: toIsoString(user.lastLoginAt),
        lastSongListened: user.lastSongListened,
        lastSongListenedAt: toIsoString(user.lastSongListenedAt),
        chatBlocked: user.chatBlocked || false,
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
    setSessionCookie(req, res, { uid: user.uid, passwordHash });

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
      suspendedReason: u.suspendedReason || null,
      lastLoginAt: toIsoString(u.lastLoginAt),
      lastSongListened: u.lastSongListened || null,
      lastSongListenedAt: toIsoString(u.lastSongListenedAt),
      chatBlocked: u.chatBlocked || false,
      dailyListenLimit: u.dailyListenLimit ?? null,
      dailyListensToday: dailyListenCounts[u.uid] || 0,
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

    if (suspendedReason !== undefined) {
      updates.suspendedReason = suspendedReason;
    }

    if (adminNote !== undefined) {
      updates.adminNote = adminNote;
    }

    if (colorAccent !== undefined) {
      updates.colorAccent = colorAccent;
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
            suspendedReason: updated.suspendedReason || null,
            adminNote: updated.adminNote || null,
            colorAccent: updated.colorAccent || 'cyan',
            dailyListenLimit: updated.dailyListenLimit ?? null,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
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
    const songsList = await getSongsDb();
    // One-time migration of legacy songs that stored their entire WAV/MP3 in audioUrl.
    // This prevents the library metadata endpoint from retransmitting audio on every refresh.
    for (const song of songsList as any[]) {
      if (typeof song.audioUrl !== 'string' || !song.audioUrl.startsWith('data:audio/')) continue;
      try {
        const audioUrl = await persistInlineAudioDataUri(song.audioUrl, song.title || song.id);
        await updateSongDb(song.id, { audioUrl });
        song.audioUrl = audioUrl;
      } catch (migrationError) {
        // Do not accidentally send a multi-megabyte base64 blob to every client if migration fails.
        console.error(`Could not migrate inline audio for song ${song.id}; omitting it from this response:`, migrationError);
        song.audioUrl = '';
      }
    }
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

    const inserted = await insertSongDb(newSong);
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
    if (!isAdminReq(req)) return res.status(403).json({ error: 'Administrators only.' });
    const { id } = req.params;
    const updates = { ...req.body };
    if (typeof updates.audioUrl === 'string' && updates.audioUrl.startsWith('data:audio/')) {
      updates.audioUrl = await persistInlineAudioDataUri(updates.audioUrl, updates.title || id);
    }
    const updated = await updateSongDb(id, updates);
    res.json({ success: true, song: updated });
  } catch (error: any) {
    console.error('Update song error:', error);
    res.status(500).json({ error: error.message });
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

// ----------------- SONG REQUESTS & CONVERSION PIPELINE -----------------
app.get('/api/requests', async (req: Request, res: Response) => {
  try {
    const list = await getRequestsDb();
    // Regular users only ever see their own submissions. The holding queue stays hidden.
    if (!isAdminReq(req)) {
      const me = getAuthUser(req).uid;
      const userFiltered = list.filter((r) => r.requestedByUserId === me);
      return res.json({ requests: userFiltered });
    }

    // Admin sees all requests in the admin dashboard review queue
    res.json({ requests: list });
  } catch (error: any) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/requests', async (req: Request, res: Response) => {
  try {
    const { songTitle, artist, notes, genre } = req.body || {};
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ error: 'Please log in again.' });
    if (!songTitle || !String(songTitle).trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const newReq = await createRequestDb({
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      songTitle: String(songTitle).trim(),
      artist: String(artist || '').trim(),
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

// Admin Review & Editing Step (Mandatory Gate):
// Admin edits song title, artist info, cover art, or notes before any conversion happens
app.patch('/api/admin/requests/:id', async (req: Request, res: Response) => {
  try {
    if (!isAdminReq(req)) return res.status(403).json({ error: 'Administrators only.' });
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

    const existingReq = await getRequestByIdDb(id);
    if (!existingReq) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const updates: any = {};
    if (songTitle !== undefined) updates.songTitle = songTitle.trim();
    if (artist !== undefined) updates.artist = artist.trim();
    if (coverUrl !== undefined) updates.coverUrl = coverUrl.trim();
    if (notes !== undefined) updates.notes = notes.trim();
    if (genre !== undefined) updates.genre = genre.trim();
    if (adminNote !== undefined) updates.adminNote = adminNote;
    if (estimatedUploadAt !== undefined) {
      const parsedEta = estimatedUploadAt ? new Date(estimatedUploadAt) : null;
      if (parsedEta && Number.isNaN(parsedEta.getTime())) return res.status(400).json({ error: 'Estimated upload time is invalid.' });
      updates.estimatedUploadAt = parsedEta ? parsedEta.toISOString() : null;
    }
    if (status !== undefined) {
      updates.status = status;
      if (status === 'approved') {
        updates.approvedAt = new Date().toISOString();
        updates.reviewedAt = new Date().toISOString();
        updates.processingProgress = 'Approved and waiting for an administrator to upload the audio file.';
        updates.processingError = null;
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
async function getDriveAccessToken(): Promise<string> {
  if (!driveClientId() || !driveClientSecret()) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Render.');
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
  return tokenData.access_token as string;
}

app.get('/api/admin/google-drive/status', async (req: Request, res: Response) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: 'Admin only' });
  const configured = Boolean(driveClientId() && driveClientSecret() && process.env.DRIVE_TOKEN_ENCRYPTION_KEY);
  try {
    if (!configured) return res.json({ connected: false, accountMode: 'site-wide', redirectUri: driveRedirectUri(), configured: false, storageReady: false, error: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and a stable DRIVE_TOKEN_ENCRYPTION_KEY in Render.' });
    driveEncryptionKey();
    const encrypted = await getPersistentSettingDb<string>(DRIVE_TOKEN_SETTING);
    if (encrypted) decryptDriveToken(encrypted); // catches a changed/missing encryption key before a migration starts
    return res.json({ connected: Boolean(encrypted), accountMode: 'site-wide', redirectUri: driveRedirectUri(), configured: true, storageReady: true, storage: 'postgresql' });
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
    const payload = Buffer.from(JSON.stringify({ nonce, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
    const state = `${payload}.${signDriveState(payload)}`;
    await setPersistentSettingDb(DRIVE_STATE_SETTING, state);
    const params = new URLSearchParams({ client_id: driveClientId(), redirect_uri: driveRedirectUri(), response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope: 'https://www.googleapis.com/auth/drive.file', state });
    return res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (error: any) { return res.status(500).json({ error: error.message || 'Could not start Google OAuth.' }); }
});

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
    const code = String(req.query.code || ''); if (!code) return res.status(400).send('Google did not return an authorization code.');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: driveClientId(), client_secret: driveClientSecret(), redirect_uri: driveRedirectUri(), grant_type: 'authorization_code' }) });
    const tokens: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) return res.status(502).send(`Google token exchange failed (${tokenRes.status}). Check the OAuth client and exact redirect URI in Google Cloud Console.`);
    let refreshToken = tokens.refresh_token as string | undefined;
    if (!refreshToken) {
      const prior = await getPersistentSettingDb<string>(DRIVE_TOKEN_SETTING);
      if (prior) refreshToken = decryptDriveToken(prior);
    }
    if (!refreshToken) return res.status(502).send('Google did not issue an offline refresh token. Keep access_type=offline, authorize with consent, and check Google Auth Platform → Audience.');
    await setPersistentSettingDb(DRIVE_TOKEN_SETTING, encryptDriveToken(refreshToken));
    await setPersistentSettingDb(DRIVE_STATE_SETTING, null);
    const base = String(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://yousound.onrender.com').replace(/\/$/, '');
    return res.redirect(`${base}/?driveConnected=1`);
  } catch (error: any) {
    console.error('[GoogleDriveOAuth] callback failed:', error);
    return res.status(500).send(`Google Drive connection could not be saved to the persistent database. ${String(error.message || 'Check Render environment variables and database connection.')}`);
  }
});

// Admin uploads both request assets on the website. Temporary files are immediately moved to Drive.
app.post('/api/admin/requests/:id/upload-media', (req: Request, res: Response) => {
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
      if (uploadError) return res.status(400).json({ success: false, error: uploadError.message || 'Upload failed.' });
      if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
      if (!audioFile || !coverFile || !audioTempPath || !coverTempPath) {
        return res.status(400).json({ success: false, error: 'Choose both an MP3 audio file and a cover image.' });
      }
      if (!/\.mp3$/i.test(audioFile.originalname || '') || (audioFile.mimetype && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(audioFile.mimetype.toLowerCase()))) {
        return res.status(400).json({ success: false, error: 'Audio must be an MP3. No conversion is performed.' });
      }
      if (coverFile.size > 25 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(coverFile.mimetype || '').toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Cover must be a JPG, PNG, WEBP, or GIF image up to 25 MB.' });
      }
      const requestItem = await getRequestByIdDb(req.params.id);
      if (!requestItem) return res.status(404).json({ success: false, error: 'Request not found.' });
      if (requestItem.status !== 'approved') return res.status(409).json({ success: false, error: 'Approve this request for upload before selecting its files.' });

      accessToken = await getDriveAccessToken();
      const driveAudio = await uploadMp3ToGoogleDrive(audioTempPath, requestItem.songTitle || 'Track', requestItem.artist || 'Unknown Artist', accessToken);
      audioTempPath = null;
      uploadedAudioId = driveAudio.fileId;
      const driveCover = await uploadImageToGoogleDrive(coverTempPath, coverFile.originalname, coverFile.mimetype || 'image/jpeg', accessToken);
      coverTempPath = null;
      uploadedCoverId = driveCover.fileId;

      const updated = await updateRequestFullDb(req.params.id, {
        status: 'staging',
        audioUrl: driveAudio.streamingUrl,
        stagingAudioUrl: driveAudio.streamingUrl,
        driveFileId: driveAudio.fileId,
        driveFolderId: driveAudio.folderId || null,
        coverUrl: driveCover.imageUrl,
        duration: driveAudio.duration || requestItem.duration || 180,
        processingProgress: 'MP3 and artwork uploaded to Google Drive. Waiting for the administrator to publish.',
        processingError: null,
      });
      if (!updated || updated.status !== 'staging') throw new Error('Media uploaded, but the request record could not be updated. Check Drive and database status before retrying.');
      console.log(`[SongPipeline] Uploaded request media to Drive: ${driveAudio.fileId}, ${driveCover.fileId}`);
      return res.json({ success: true, request: updated, audioFileId: driveAudio.fileId, coverFileId: driveCover.fileId });
    } catch (error: any) {
      console.error('[SongPipeline] Request media upload failed:', error);
      if (accessToken && uploadedAudioId) await deleteGoogleDriveFile(uploadedAudioId, accessToken).catch(() => undefined);
      if (accessToken && uploadedCoverId) await deleteGoogleDriveFile(uploadedCoverId, accessToken).catch(() => undefined);
      return res.status(500).json({ success: false, error: error?.message || 'Could not upload request files to Google Drive.' });
    } finally {
      if (audioTempPath && fs.existsSync(audioTempPath)) { try { fs.unlinkSync(audioTempPath); } catch {} }
      if (coverTempPath && fs.existsSync(coverTempPath)) { try { fs.unlinkSync(coverTempPath); } catch {} }
    }
  });
});

// Manual library upload: both files go directly to Google Drive; this endpoint stores no media bytes in the DB.
app.post('/api/admin/library/upload-media', (req: Request, res: Response) => {
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
      if (uploadError) return res.status(400).json({ success: false, error: uploadError.message || 'Upload failed.' });
      if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
      if (!audioFile || !coverFile || !audioTempPath || !coverTempPath) return res.status(400).json({ success: false, error: 'Choose both an MP3 and cover image.' });
      if (!/\.mp3$/i.test(audioFile.originalname || '') || (audioFile.mimetype && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(audioFile.mimetype.toLowerCase()))) {
        return res.status(400).json({ success: false, error: 'Audio must be an MP3. No conversion is performed.' });
      }
      if (coverFile.size > 25 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(coverFile.mimetype || '').toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Cover must be a JPG, PNG, WEBP, or GIF image up to 25 MB.' });
      }
      accessToken = await getDriveAccessToken();
      const trackTitle = String(req.body?.title || audioFile.originalname.replace(/\.mp3$/i, '')).trim();
      const trackArtist = String(req.body?.artist || 'Unknown Artist').trim();
      const driveAudio = await uploadMp3ToGoogleDrive(audioTempPath, trackTitle, trackArtist, accessToken);
      audioTempPath = null;
      uploadedAudioId = driveAudio.fileId;
      const driveCover = await uploadImageToGoogleDrive(coverTempPath, coverFile.originalname, coverFile.mimetype || 'image/jpeg', accessToken);
      coverTempPath = null;
      uploadedCoverId = driveCover.fileId;
      return res.json({
        success: true,
        audioUrl: driveAudio.streamingUrl,
        coverUrl: driveCover.imageUrl,
        audioFileId: driveAudio.fileId,
        coverFileId: driveCover.fileId,
        duration: driveAudio.duration,
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

// Retired endpoint: requests are approved and uploaded manually as MP3 files now.
app.post('/api/admin/requests/:id/approve-and-process', (_req: Request, res: Response) => {
  return res.status(410).json({ success: false, error: 'The conversion workflow has been removed. Approve the request, then upload an MP3 directly.' });
});

// Publish only a staged MP3 hosted directly on Google Drive. This keeps song bytes out of this app host.
app.post('/api/admin/requests/:id/publish', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    if (!isAdminReq(req)) return res.status(403).json({ error: 'Administrators only.' });
    const { isPublished } = req.body || {};
    const requestItem = await getRequestByIdDb(id);
    if (!requestItem) return res.status(404).json({ error: 'Request not found' });

    if (isPublished) {
      if (requestItem.status !== 'staging') {
        return res.status(409).json({ error: 'Only a request with an uploaded MP3 can be published. Upload an MP3 directly to Google Drive first.' });
      }
      if (!requestItem.driveFileId || !String(requestItem.audioUrl || '').startsWith('https://drive.google.com/uc?export=download&id=') || !String(requestItem.coverUrl || '').startsWith('https://lh3.googleusercontent.com/d/')) {
        return res.status(400).json({ error: 'This request needs both a Google Drive MP3 and a Google Drive cover image before publishing.' });
      }

      const songId = `song-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newSong = await insertSongDb({
        id: songId,
        title: requestItem.songTitle,
        artist: requestItem.artist || 'Unknown Artist',
        album: 'YouSong Community',
        genre: requestItem.genre || 'Vibe / Chill',
        duration: requestItem.duration || 180,
        audioUrl: requestItem.audioUrl,
        coverUrl: requestItem.coverUrl,
        addedAt: new Date().toISOString(),
        plays: 0,
        featured: false,
        description: `Requested by ${requestItem.requestedByUsername} via YouSong Pipeline.`,
        tags: [requestItem.genre?.toLowerCase() || 'vibe', 'community', 'drive-mp3'],
      });

      const updated = await updateRequestFullDb(id, {
        status: 'published',
        publishedSongId: songId,
        publishedAt: new Date().toISOString(),
        processingProgress: 'Published. Audio streams directly from Google Drive.',
        processingError: null,
      });
      console.log(`[SongPipeline] Published Drive MP3 "${newSong.title}" (${requestItem.driveFileId}).`);
      return res.json({ success: true, request: updated, song: newSong });
    }

    // Unpublishing removes the library entry, but deliberately leaves the uploaded MP3 in Drive.
    if (requestItem.publishedSongId) await deleteSongDb(requestItem.publishedSongId);
    const updated = await updateRequestFullDb(id, {
      status: 'staging',
      publishedSongId: null,
      publishedAt: null,
      processingProgress: 'Unpublished; MP3 remains in staging.',
    });
    return res.json({ success: true, request: updated });
  } catch (error: any) {
    console.error('Publish request error:', error);
    return res.status(500).json({ error: error.message || 'Publish failed.' });
  }
});

// Google Drive Streaming Proxy with Range Support
app.get('/api/drive/stream/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId || '').trim();
  if (!/^[A-Za-z0-9_-]{20,45}$/.test(fileId)) return res.status(400).send('Invalid Google Drive file ID');
  const driveUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  // Backward-compatible route: redirect to Drive rather than retransmitting song bytes through this host.
  if (req.query.proxy !== '1') return res.redirect(302, driveUrl);

  try {
    const headers: Record<string, string> = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const driveRes = await fetch(driveUrl, { headers, redirect: 'follow' });
    if (!driveRes.ok && driveRes.status !== 206) return res.redirect(302, driveUrl);
    res.status(driveRes.status);
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = driveRes.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!driveRes.body) return res.redirect(302, driveUrl);
    // Stream without buffering the entire file in app memory.
    const reader = driveRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) await new Promise<void>((resolve) => res.once('drain', resolve));
      }
      res.end();
    } finally {
      reader.releaseLock();
    }
  } catch (err: any) {
    console.error('Drive streaming compatibility proxy error:', err);
    if (!res.headersSent) res.redirect(302, driveUrl); else res.destroy(err);
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
    const updated = {
      ...current,
      enabled: !!enabled,
      message: message || current.message || 'System maintenance in progress.',
      updatedAt: new Date().toISOString(),
      hasCountdown: !!hasCountdown,
      estimatedFinishTime: hasCountdown ? estimatedFinishTime || null : null,
      autoDisableOnCountdown: !!autoDisableOnCountdown,
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
      return res.json({ requests: await getChatRequestsForUserDb(getAuthUser(req).uid) });
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
      return res.json({ threads: await getChatThreadsForUserDb(getAuthUser(req).uid) });
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
      audioUrl: 'youtube:aaaaaaaaaaa',
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
        } else if (song.audioUrl.includes('drive.google.com') || song.audioUrl.includes('/api/media/drive-stream/')) {
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
