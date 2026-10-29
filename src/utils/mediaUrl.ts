/**
 * Utilities for parsing, detecting, and streaming song artwork, GIFs,
 * and short playable video covers, including direct Google Drive integration.
 */

// Helper to extract Google Drive file ID from any link format
export function extractDriveFileId(inputUrl?: string | null): string | null {
  if (!inputUrl) return null;
  const trimmed = inputUrl.trim();
  const match = trimmed.match(
    /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|uc\?export=download&id=|thumbnail\?id=)|[?&]id=)([a-zA-Z0-9_-]{20,})/
  );
  if (match && match[1]) return match[1];
  // If user pasted raw Drive ID (typically 25-45 chars)
  if (/^[a-zA-Z0-9_-]{25,45}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Checks if a given media URL is a playable video (MP4, WebM, MOV, etc.)
 */
export function isVideoMedia(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase().split('?')[0];
  if (
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.mov') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.m4v')
  ) {
    return true;
  }
  if (url.startsWith('data:video/')) return true;
  if (url.includes('format=video') || url.includes('type=video') || url.includes('/video/')) return true;
  return false;
}

/**
 * Checks if a given media URL is an animated GIF
 */
export function isGifMedia(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase().split('?')[0];
  return clean.endsWith('.gif') || url.startsWith('data:image/gif') || url.includes('giphy.com') || url.includes('tenor.com');
}

/**
 * Transforms any Google Drive URL into a direct, high-performance CDN media URL.
 * Google's lh3.googleusercontent.com serves drive images and previews with zero
 * rate-limiting or authentication prompts for public drive files.
 */
export function formatCoverMediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();

  // If already a local uploaded file or data URI, keep as is
  if (trimmed.startsWith('/api/media/') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // Check for Google Drive links
  const driveId = extractDriveFileId(trimmed);
  if (driveId) {
    // If it's a known video on drive or requested as drive stream:
    if (trimmed.toLowerCase().includes('.mp4') || trimmed.toLowerCase().includes('.webm')) {
      return `/api/media/drive-stream/${driveId}`;
    }
    // High-speed Google direct CDN for images/GIFs
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  return trimmed;
}

/**
 * Calculates current ISO week (YYYY-Www) e.g. "2026-W42"
 */
export function getIsoWeekString(d: Date = new Date()): string {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
