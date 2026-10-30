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
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const metadata: any = { name: `${safeName}${extension}`, mimeType: mimeType.toLowerCase() };
    if (folderId && folderId !== 'root') metadata.parents = [folderId];
    const requestBody = Buffer.concat([
      Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + delimiter + `Content-Type: ${mimeType.toLowerCase()}\r\n\r\n`),
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
