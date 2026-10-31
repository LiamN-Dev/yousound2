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
const MAX_AUDIO_UPLOAD_BYTES = 150 * 1024 * 1024;
const MAX_COVER_UPLOAD_BYTES = 25 * 1024 * 1024;
const DRIVE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024; // Multiple of Google's 256 KB chunk requirement.

type DriveUploadStatus =
  | { complete: true; file: any }
  | { complete: false; nextOffset: number };

function getNextOffset(rangeHeader: string | null, totalBytes: number): number {
  if (!rangeHeader) return 0;
  const match = /^bytes=0-(\d+)$/i.exec(rangeHeader.trim());
  if (!match) return 0;
  const nextOffset = Number(match[1]) + 1;
  return Number.isSafeInteger(nextOffset) && nextOffset >= 0 && nextOffset <= totalBytes
    ? nextOffset
    : 0;
}

async function readDriveUploadStatus(sessionUrl: string, totalBytes: number): Promise<DriveUploadStatus> {
  const response = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': 'bytes */' + totalBytes },
    signal: AbortSignal.timeout(90_000),
  });

  if (response.status === 308) {
    return { complete: false, nextOffset: getNextOffset(response.headers.get('range'), totalBytes) };
  }
  if (response.ok) {
    return { complete: true, file: await response.json() };
  }
  if (response.status === 404 || response.status === 410) {
    throw new Error('The Google Drive upload session expired. Start the upload again.');
  }

  const detail = (await response.text().catch(() => '')).slice(0, 700);
  throw new Error('Could not resume the Google Drive upload (' + response.status + ')' + (detail ? ': ' + detail : '.'));
}

/**
 * Uploads a file to Drive with a resumable session and bounded 8 MB chunks.
 * Files are read from disk a chunk at a time, rather than loading a 150 MB MP3
 * into application memory or sending a multipart request intended for small files.
 */
async function uploadDriveFileResumable(
  tempFilePath: string,
  metadata: Record<string, unknown>,
  mimeType: string,
  accessToken: string,
): Promise<any> {
  if (!fs.existsSync(tempFilePath)) throw new Error('Temporary upload file not found: ' + path.basename(tempFilePath));
  const stats = fs.statSync(tempFilePath);
  if (!stats.isFile() || stats.size <= 0) throw new Error('The selected file is empty or invalid.');

  const sessionResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webContentLink,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(stats.size),
      },
      body: JSON.stringify({ ...metadata, mimeType }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!sessionResponse.ok) {
    const detail = (await sessionResponse.text().catch(() => '')).slice(0, 900);
    throw new Error('Google Drive could not start the upload (' + sessionResponse.status + ')' + (detail ? ': ' + detail : '.'));
  }

  const sessionUrl = sessionResponse.headers.get('location');
  if (!sessionUrl) throw new Error('Google Drive did not return a resumable upload session URL.');

  const fd = fs.openSync(tempFilePath, 'r');
  let offset = 0;
  let retriesAtOffset = 0;
  let uploadedFile: any = null;

  try {
    while (offset < stats.size) {
      const chunkLength = Math.min(DRIVE_UPLOAD_CHUNK_BYTES, stats.size - offset);
      const chunk = Buffer.allocUnsafe(chunkLength);
      const bytesRead = fs.readSync(fd, chunk, 0, chunkLength, offset);
      if (bytesRead !== chunkLength) throw new Error('The temporary upload file changed while it was being read.');

      const chunkEnd = offset + bytesRead - 1;
      let response: Response;

      try {
        response = await fetch(sessionUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(bytesRead),
            'Content-Range': 'bytes ' + offset + '-' + chunkEnd + '/' + stats.size,
          },
          body: chunk,
          signal: AbortSignal.timeout(120_000),
        });
      } catch (error: any) {
        // The connection may have dropped after Drive accepted the chunk. Ask
        // Drive where it got to before deciding whether to resend any bytes.
        const status = await readDriveUploadStatus(sessionUrl, stats.size);
        if (status.complete) {
          uploadedFile = status.file;
          break;
        }
        if (status.nextOffset > offset) {
          offset = status.nextOffset;
          retriesAtOffset = 0;
          continue;
        }
        retriesAtOffset += 1;
        if (retriesAtOffset > 3) {
          throw new Error('Google Drive upload was interrupted at ' + Math.round(offset / (1024 * 1024)) + ' MB: ' + (error?.message || 'network error'));
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * retriesAtOffset));
        continue;
      }

      if (response.status === 308) {
        const nextOffset = getNextOffset(response.headers.get('range'), stats.size);
        if (nextOffset <= offset) {
          retriesAtOffset += 1;
          if (retriesAtOffset > 3) throw new Error('Google Drive did not acknowledge the uploaded data. Please retry the upload.');
          continue;
        }
        offset = nextOffset;
        retriesAtOffset = 0;
        continue;
      }

      if (response.ok) {
        uploadedFile = await response.json();
        break;
      }

      const detail = (await response.text().catch(() => '')).slice(0, 900);
      if (response.status >= 500 || response.status === 429) {
        const status = await readDriveUploadStatus(sessionUrl, stats.size);
        if (status.complete) {
          uploadedFile = status.file;
          break;
        }
        if (status.nextOffset > offset) {
          offset = status.nextOffset;
          retriesAtOffset = 0;
          continue;
        }
        retriesAtOffset += 1;
        if (retriesAtOffset <= 3) {
          await new Promise((resolve) => setTimeout(resolve, 300 * retriesAtOffset));
          continue;
        }
      }
      throw new Error('Google Drive upload failed (' + response.status + ')' + (detail ? ': ' + detail : '.'));
    }
  } finally {
    fs.closeSync(fd);
  }

  if (!uploadedFile?.id) throw new Error('Google Drive finished the upload without returning a file ID.');
  return uploadedFile;
}

/**
 * Uploads an MP3 to Google Drive, enables link playback, and deletes the local
 * temporary file. The 150 MB limit is also checked here as a second safeguard.
 */
export async function uploadMp3ToGoogleDrive(
  tempFilePath: string,
  trackTitle: string,
  artist: string,
  accessToken: string
): Promise<ProcessedAudioResult> {
  if (!fs.existsSync(tempFilePath)) throw new Error('Temporary MP3 file not found.');
  const fileStats = fs.statSync(tempFilePath);
  if (fileStats.size > MAX_AUDIO_UPLOAD_BYTES) {
    throw new Error('MP3 files may not exceed 150 MB.');
  }

  try {
    const duration = await probeAudioDuration(tempFilePath);
    const folderId = await getOrCreateDriveFolder(accessToken);
    const sanitizedName = (artist || 'Unknown') + ' - ' + (trackTitle || 'Track') + '.mp3';
    const safeName = sanitizedName.replace(/[/\\\\?%*:|"<>]/g, '_');
    const metadata: Record<string, unknown> = { name: safeName };
    if (folderId && folderId !== 'root') metadata.parents = [folderId];

    console.log('[AudioPipeline] Starting resumable Drive upload for ' + safeName + ' (' + fileStats.size + ' bytes).');
    const driveFile = await uploadDriveFileResumable(tempFilePath, metadata, 'audio/mpeg', accessToken);
    const fileId = String(driveFile.id);

    const permissionRes = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/permissions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!permissionRes.ok) {
      const detail = (await permissionRes.text().catch(() => '')).slice(0, 700);
      await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + accessToken },
      }).catch(() => undefined);
      throw new Error('Google Drive uploaded the MP3 but could not enable link access (' + permissionRes.status + ')' + (detail ? ': ' + detail : '.'));
    }

    return {
      fileId,
      streamingUrl: 'https://drive.google.com/uc?export=download&id=' + fileId,
      webViewLink: driveFile.webViewLink,
      folderId,
      duration,
    };
  } finally {
    // The original MP3 is only a temporary staging file; Drive is the durable copy.
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); }
      catch (error) { console.warn('[AudioPipeline] Could not remove temporary MP3:', error); }
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
  const normalizedMimeType = mimeType.toLowerCase();
  if (!supportedTypes.has(normalizedMimeType)) throw new Error('Cover image must be JPG, PNG, WEBP, or GIF.');
  const fileStats = fs.statSync(tempFilePath);
  if (!fileStats.size) throw new Error('The cover image is empty.');
  if (fileStats.size > MAX_COVER_UPLOAD_BYTES) throw new Error('Cover images may not exceed 25 MB.');

  const extension = path.extname(originalName || '').toLowerCase() || ({
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  } as Record<string, string>)[normalizedMimeType] || '.jpg';
  const safeName = path.basename(originalName || 'cover', extension).replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 80) || 'Cover';
  let uploadedId: string | null = null;

  try {
    const folderId = await getOrCreateDriveFolder(accessToken, 'YouSong Artwork');
    const metadata: Record<string, unknown> = { name: safeName + extension };
    if (folderId && folderId !== 'root') metadata.parents = [folderId];

    const driveFile = await uploadDriveFileResumable(tempFilePath, metadata, normalizedMimeType, accessToken);
    uploadedId = String(driveFile.id);

    const permissionRes = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(uploadedId) + '/permissions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!permissionRes.ok) {
      const detail = (await permissionRes.text().catch(() => '')).slice(0, 700);
      throw new Error('Could not enable cover access in Google Drive (' + permissionRes.status + ')' + (detail ? ': ' + detail : '.'));
    }

    return {
      fileId: uploadedId,
      imageUrl: 'https://lh3.googleusercontent.com/d/' + uploadedId,
      webViewLink: driveFile.webViewLink,
      folderId,
    };
  } catch (error) {
    if (uploadedId) await deleteGoogleDriveFile(uploadedId, accessToken).catch(() => undefined);
    throw error;
  } finally {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); }
      catch (error) { console.warn('[AudioPipeline] Could not remove temporary cover image:', error); }
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
