import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ProcessedAudioResult {
  fileId: string;
  streamingUrl: string;
  webViewLink?: string;
  folderId?: string;
  duration: number; // in seconds
}

/**
 * Probe audio duration in seconds using ffprobe or fallback
 */
async function probeAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    const parsed = parseFloat(stdout.trim());
    if (!isNaN(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  } catch (err) {
    console.warn('ffprobe duration check failed, using fallback estimate:', err);
  }
  return 180;
}

/**
 * Convert an administrator-supplied local audio file to a temporary MP3.
 * This is the fallback path for sources that YouTube blocks from the server.
 */
export async function convertLocalAudioToMp3(
  inputFilePath: string,
  requestId: string
): Promise<{ tempFilePath: string; duration: number }> {
  if (!fs.existsSync(inputFilePath)) {
    throw new Error('The uploaded audio file could not be found on the server. Upload it again.');
  }

  const safeRequestId = String(requestId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'upload';
  const outputPath = path.join('/tmp', `yousong_${safeRequestId}_${Date.now()}.mp3`);

  try {
    await execFileAsync('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputFilePath,
      '-vn', '-map_metadata', '-1',
      '-codec:a', 'libmp3lame', '-qscale:a', '0',
      outputPath,
    ], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });

    if (!fs.existsSync(outputPath)) {
      throw new Error('ffmpeg finished without creating an MP3 file. Try a standard MP3, WAV, or M4A audio file.');
    }
    const stats = fs.statSync(outputPath);
    if (stats.size < 500) {
      throw new Error('The uploaded audio is empty or too small to be valid.');
    }
    return { tempFilePath: outputPath, duration: await probeAudioDuration(outputPath) };
  } catch (error: any) {
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    const detail = String(error?.stderr || error?.message || error || '').trim().slice(-1200);
    throw new Error(`Could not convert the uploaded audio to MP3. Check that the file is a playable audio file. ${detail}`);
  }
}

function getYouTubeExtractionMessage(error: any): string {
  const detail = [error?.stderr, error?.stdout, error?.message]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n');

  if (/HTTP Error 429|Too Many Requests|Sign in to confirm you.?re not a bot|confirm you.?re not a bot|bot challenge/i.test(detail)) {
    return 'YouTube rejected the request with rate limiting (HTTP 429) or an anti-bot verification challenge. This is not an ffmpeg failure. The server cannot fetch this video until YouTube permits the request. Try again later, or use the manual audio-file upload fallback for a file you own or are licensed to re-host.';
  }
  if (/No supported JavaScript runtime|JavaScript runtime.*not found|yt-dlp-ejs|challenge solver/i.test(detail)) {
    return 'The server is missing a supported yt-dlp JavaScript runtime or challenge-solver package. Redeploy using the included Dockerfile, which installs yt-dlp with its default components and uses Node.js as the runtime.';
  }
  if (/ffmpeg.*not found|ffmpeg.*not installed|not found.*ffmpeg/i.test(detail)) {
    return 'ffmpeg is missing on the server. Redeploy the service with the included Dockerfile so ffmpeg and ffprobe are installed.';
  }

  const conciseDetail = String(error?.stderr || error?.stdout || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-6)
    .join(' | ')
    .replace(/https?:\/\/[^\s]+/gi, '[source URL]')
    .slice(-1000);
  return `yt-dlp could not download this source. Confirm you have permission to access and re-host the audio. ${conciseDetail || 'Check the Render service logs for the extraction details.'}`;
}

/**
 * If YT_AUDIO_API_URL is set, use the dedicated converter service rather than the main
 * YouSong Render process to retrieve/convert the source. This is compatible with the
 * token flow used by alperensumeroglu/yt-audio-api and expects the protected YouSong
 * converter-service included in this repository. The resulting MP3 is still uploaded
 * to Google Drive by the existing pipeline and never used for playback from Render.
 */
async function extractAudioViaConfiguredApi(
  youtubeUrl: string,
  requestId: string,
  baseUrl: string,
  apiKey: string,
): Promise<{ tempFilePath: string; duration: number }> {
  const safeRequestId = String(requestId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'track';
  const tempFilePath = path.join('/tmp', `yousong_converter_${safeRequestId}_${Date.now()}.mp3`);
  const apiBase = baseUrl.trim().replace(/\/+$/, '');
  const headers = { 'X-API-Key': apiKey, Authorization: `Bearer ${apiKey}` };
  const requestTimeoutMs = Math.max(60_000, Number(process.env.YT_AUDIO_API_TIMEOUT_MS || 270_000));

  try {
    const tokenResponse = await fetch(`${apiBase}/?url=${encodeURIComponent(youtubeUrl)}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    let tokenPayload: any = {};
    try { tokenPayload = await tokenResponse.json(); } catch {}
    if (!tokenResponse.ok) {
      const detail = String(tokenPayload?.detail || tokenPayload?.error || `HTTP ${tokenResponse.status}`).slice(0, 1200);
      if (/429|too many requests|bot|verification|blocked|refused/i.test(detail)) {
        throw new Error(`The configured converter could not retrieve this YouTube video: ${detail}`);
      }
      throw new Error(`The configured YouTube converter failed (${tokenResponse.status}): ${detail}`);
    }
    const token = typeof tokenPayload?.token === 'string' ? tokenPayload.token : '';
    if (!token || token.length > 512) {
      throw new Error('The configured YouTube converter returned no valid download token. Check that YT_AUDIO_API_URL points to the YouSong converter service.');
    }

    const downloadResponse = await fetch(`${apiBase}/download?token=${encodeURIComponent(token)}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!downloadResponse.ok) {
      let detail = '';
      try {
        const payload: any = await downloadResponse.json();
        detail = String(payload?.detail || payload?.error || '');
      } catch {
        detail = await downloadResponse.text().catch(() => '');
      }
      throw new Error(`The converter created a token but MP3 retrieval failed (${downloadResponse.status}). ${detail.slice(0, 800)}`.trim());
    }

    const contentType = downloadResponse.headers.get('content-type') || '';
    if (/application\/json|text\/html/i.test(contentType)) {
      const detail = (await downloadResponse.text()).slice(0, 800);
      throw new Error(`The converter did not return an MP3 file. ${detail}`);
    }
    const contentLength = Number(downloadResponse.headers.get('content-length') || 0);
    if (contentLength > 60 * 1024 * 1024) {
      throw new Error('The converted MP3 exceeds YouSong’s 60 MB import limit.');
    }
    const mp3Buffer = Buffer.from(await downloadResponse.arrayBuffer());
    if (mp3Buffer.length < 500) throw new Error('The converter returned an empty or invalid MP3 file.');
    if (mp3Buffer.length > 60 * 1024 * 1024) throw new Error('The converted MP3 exceeds YouSong’s 60 MB import limit.');
    fs.writeFileSync(tempFilePath, mp3Buffer, { flag: 'wx' });
    const duration = await probeAudioDuration(tempFilePath);
    console.log(`[AudioPipeline] Dedicated converter returned an MP3 (${mp3Buffer.length} bytes, ${duration}s) for request ${safeRequestId}.`);
    return { tempFilePath, duration };
  } catch (error: any) {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
    const message = String(error?.message || error || 'Unknown converter error');
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|aborted/i.test(message)) {
      throw new Error(`Could not reach the dedicated YouTube converter at ${apiBase}. Confirm YT_AUDIO_API_URL is the converter's public HTTPS URL and that its service is running. ${message.slice(0, 500)}`);
    }
    throw error;
  }
}

/**
 * Extracts audio from a permitted YouTube source to a temporary MP3. If the dedicated
 * converter URL is configured, use it; otherwise use local yt-dlp for backwards
 * compatibility. Neither path bypasses YouTube's access controls or verification.
 */
export async function extractAudioFromYouTube(
  youtubeUrl: string,
  requestId: string
): Promise<{ tempFilePath: string; duration: number }> {
  const converterUrl = String(process.env.YT_AUDIO_API_URL || '').trim();
  if (converterUrl) {
    const converterKey = String(process.env.YT_AUDIO_API_KEY || '').trim();
    if (!converterKey) {
      throw new Error('YT_AUDIO_API_URL is configured, but YT_AUDIO_API_KEY is missing. Set the same CONVERTER_API_KEY on the converter service and YT_AUDIO_API_KEY on YouSong.');
    }
    return extractAudioViaConfiguredApi(youtubeUrl, requestId, converterUrl, converterKey);
  }

  const tempDir = '/tmp';
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const safeRequestId = String(requestId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'track';
  const outputStem = `yousong_${safeRequestId}_${Date.now()}`;
  const outputPattern = path.join(tempDir, `${outputStem}.%(ext)s`);
  const finalMp3Path = path.join(tempDir, `${outputStem}.mp3`);

  try { if (fs.existsSync(finalMp3Path)) fs.unlinkSync(finalMp3Path); } catch {}

  try {
    let sourceLabel = 'source';
    try {
      const parsed = new URL(youtubeUrl);
      sourceLabel = parsed.hostname;
      const videoId = parsed.searchParams.get('v');
      if (videoId && /youtube\.com$/i.test(parsed.hostname)) sourceLabel += ` video=${videoId}`;
    } catch {}
    console.log(`[AudioPipeline] Running yt-dlp on ${sourceLabel} for request ${safeRequestId}...`);

    const ytDlpBinary = process.env.YT_DLP_PATH || (fs.existsSync('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : 'yt-dlp');
    // Selectable yt-dlp clients are only a compatibility attempt; they do not
    // override IP blocks, sign-in requirements, or verification challenges.
    const playerClients = String(process.env.YTDLP_PLAYER_CLIENTS || 'default,web_safari')
      .split(',').map((client) => client.trim()).filter(Boolean).join(',');
    await execFileAsync(ytDlpBinary, [
      '--no-playlist',
      '--extractor-args', `youtube:player_client=${playerClients || 'default'}`,
      '--js-runtimes', 'node',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--max-filesize', '60M',
      '--socket-timeout', '30',
      '--retries', '1',
      '--extractor-retries', '1',
      '--no-progress',
      '--output', outputPattern,
      youtubeUrl,
    ], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });

    if (!fs.existsSync(finalMp3Path)) throw new Error('yt-dlp completed but did not create an MP3 file.');
    const stats = fs.statSync(finalMp3Path);
    if (stats.size < 500) throw new Error('The converted audio file is empty or too small to be valid.');
    const duration = await probeAudioDuration(finalMp3Path);
    console.log(`[AudioPipeline] Successfully extracted MP3 (${stats.size} bytes, ${duration}s)`);
    return { tempFilePath: finalMp3Path, duration };
  } catch (error: any) {
    try {
      for (const name of fs.readdirSync(tempDir)) {
        if (name.startsWith(`${outputStem}.`)) {
          try { fs.unlinkSync(path.join(tempDir, name)); } catch {}
        }
      }
    } catch {}
    const detail = [error?.stderr, error?.stdout, error?.message]
      .filter((part) => typeof part === 'string' && part.trim())
      .join('\n');
    console.error('[AudioPipeline] Extraction failed:', detail.slice(-2000));
    if (/HTTP Error 429|Too Many Requests|Sign in to confirm you.?re not a bot|confirm you.?re not a bot|bot challenge/i.test(detail)) {
      throw new Error('YouTube blocked this server request with rate limiting (HTTP 429) or a bot-verification challenge. This is not an FFmpeg problem. Try again later, or use Admin → Requests → the manual audio upload option for an audio file you own or are licensed to re-host.');
    }
    if (/No supported JavaScript runtime|JavaScript runtime.*not found|yt-dlp-ejs|challenge solver/i.test(detail)) {
      throw new Error('The running deployment is missing yt-dlp JavaScript challenge support. Confirm Render rebuilt the Docker image from the updated Dockerfile and that this updated audioPipeline.ts was deployed.');
    }
    if (/ffmpeg.*not found|ffmpeg.*not installed|not found.*ffmpeg/i.test(detail)) {
      throw new Error('FFmpeg is missing from the running image. Redeploy using the updated Dockerfile.');
    }
    const shortDetail = detail.trim().split('\n').filter(Boolean).slice(-6).join(' | ').slice(-900);
    throw new Error(`MP3 conversion failed. Confirm you have permission to access and re-host this source. ${shortDetail || 'Check the Render service logs.'}`);
  }
}

/**
 * Finds or creates the "YouSong Audio Tracks" folder in the user's Google Drive.
 */
async function getOrCreateDriveFolder(accessToken: string, folderName = 'YouSong Audio Tracks'): Promise<string> {

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      )}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // Create folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      return created.id;
    }
  } catch (err) {
    console.warn('[AudioPipeline] Could not resolve/create Google Drive folder, uploading to root:', err);
  }

  return 'root';
}

/**
 * Uploads an MP3 file directly to Google Drive via Drive API multipart upload,
 * sets public permissions for streaming, and deletes the local temporary file.
 */
export async function uploadMp3ToGoogleDrive(
  tempFilePath: string,
  trackTitle: string,
  artist: string,
  accessToken: string
): Promise<ProcessedAudioResult> {
  if (!fs.existsSync(tempFilePath)) {
    throw new Error(`Temporary audio file not found at ${tempFilePath}`);
  }

  const duration = await probeAudioDuration(tempFilePath);
  const fileStats = fs.statSync(tempFilePath);
  const fileBuffer = fs.readFileSync(tempFilePath);
  const sanitizedName = `${artist || 'Unknown'} - ${trackTitle || 'Track'}.mp3`.replace(/[/\\?%*:|"<>]/g, '_');

  try {
    // 1. Get or create designated folder
    const folderId = await getOrCreateDriveFolder(accessToken);

    // 2. Upload via Drive API multipart
    const boundary = '-------YouSongBoundary' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata: any = {
      name: sanitizedName,
      mimeType: 'audio/mpeg',
    };
    if (folderId && folderId !== 'root') {
      metadata.parents = [folderId];
    }

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: audio/mpeg\r\n\r\n'
      ),
      fileBuffer,
      Buffer.from(closeDelimiter),
    ]);

    console.log(`[AudioPipeline] Uploading ${sanitizedName} (${fileStats.size} bytes) to Google Drive...`);
    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webContentLink,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartRequestBody.length),
      },
      body: multipartRequestBody,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
    }

    const driveFile = await uploadRes.json();
    const fileId = driveFile.id;
    console.log(`[AudioPipeline] Google Drive file created: ID ${fileId}`);

    // 3. Make the file directly readable by the app's players. This is required for
    // link-based playback; fail explicitly rather than publishing a broken URL.
    const permissionRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    if (!permissionRes.ok) {
      const detail = await permissionRes.text().catch(() => 'Permission request failed');
      // Avoid leaving a private orphaned upload in Drive if public streaming permissions fail.
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => undefined);
      throw new Error(`Could not enable link access to the uploaded MP3 (${permissionRes.status}): ${detail}`);
    }

    // Direct streaming URL from Google Drive:
    const streamingUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    return {
      fileId,
      streamingUrl,
      webViewLink: driveFile.webViewLink,
      folderId,
      duration,
    };
  } finally {
    // CRITICAL: Immediately delete temporary file from local server to prevent storage caps
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`[AudioPipeline] Temporary file ${tempFilePath} cleanly deleted from server.`);
      } catch (delErr) {
        console.warn(`[AudioPipeline] Failed to delete temp file ${tempFilePath}:`, delErr);
      }
    }
  }
}


export interface UploadedDriveImageResult {
  fileId: string;
  imageUrl: string;
  webViewLink?: string;
  folderId?: string;
}

/** Upload a thumbnail image directly to the site's Google Drive. */
export async function uploadImageToGoogleDrive(
  tempFilePath: string,
  originalName: string,
  mimeType: string,
  accessToken: string
): Promise<UploadedDriveImageResult> {
  if (!fs.existsSync(tempFilePath)) throw new Error('Temporary cover image not found.');
  const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  if (!supportedTypes.has(mimeType.toLowerCase())) throw new Error('Cover image must be JPG, PNG, WEBP, or GIF.');
  const buffer = fs.readFileSync(tempFilePath);
  if (!buffer.length) throw new Error('The cover image is empty.');
  const extension = path.extname(originalName || '').toLowerCase() || ({
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  } as Record<string, string>)[mimeType.toLowerCase()] || '.jpg';
  const safeName = path.basename(originalName || 'cover', extension).replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80) || 'Cover';
  let uploadedId: string | null = null;

  try {
    const folderId = await getOrCreateDriveFolder(accessToken, 'YouSong Artwork');
    const boundary = '-------YouSongImageBoundary' + Date.now();
    const delimiter = `\\r\\n--${boundary}\\r\\n`;
    const closeDelimiter = `\\r\\n--${boundary}--`;
    const metadata: any = { name: `${safeName}${extension}`, mimeType: mimeType.toLowerCase() };
    if (folderId && folderId !== 'root') metadata.parents = [folderId];
    const requestBody = Buffer.concat([
      Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\\r\\n\\r\\n' + JSON.stringify(metadata) + delimiter + `Content-Type: ${mimeType.toLowerCase()}\\r\\n\\r\\n`),
      buffer,
      Buffer.from(closeDelimiter),
    ]);
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(requestBody.length),
      },
      body: requestBody,
    });
    if (!response.ok) throw new Error(`Google Drive cover upload failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const driveFile = await response.json();
    uploadedId = String(driveFile.id || '');
    if (!uploadedId) throw new Error('Google Drive did not return a cover file ID.');

    const permissionRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadedId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    if (!permissionRes.ok) throw new Error(`Could not enable thumbnail access in Google Drive (${permissionRes.status}).`);

    return {
      fileId: uploadedId,
      imageUrl: `https://lh3.googleusercontent.com/d/${uploadedId}`,
      webViewLink: driveFile.webViewLink,
      folderId,
    };
  } catch (error) {
    if (uploadedId) await deleteGoogleDriveFile(uploadedId, accessToken).catch(() => undefined);
    throw error;
  } finally {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (error) { console.warn('[AudioPipeline] Could not remove temporary cover image:', error); }
    }
  }
}

/** Best-effort cleanup for a Drive object uploaded as part of a failed two-file transaction. */
export async function deleteGoogleDriveFile(fileId: string, accessToken: string): Promise<void> {
  if (!fileId) return;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not remove temporary Google Drive file (${response.status}).`);
  }
}
