export type CrossyRoadAccountAccess = {
  role?: unknown;
  isApproved?: unknown;
  isSuspended?: unknown;
  isLocked?: unknown;
  gamesEnabled?: unknown;
} | null | undefined;

/**
 * The Community Arcade is open to approved, active members.
 * The global API policy also enforces these account gates; this helper keeps
 * the Crossy-specific router explicit and independently testable.
 */
export function canAccessCrossyRoad(user: CrossyRoadAccountAccess): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.isApproved === true && user.isSuspended !== true && user.isLocked !== true;
}

/** Bound saved scores to a plausible rate so edited iframe messages cannot mint unlimited coins. */
export function isPlausibleCrossyRoadScore(score: number, elapsedSeconds: number): boolean {
  if (!Number.isSafeInteger(score) || score < 0 || score > 10000) return false;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return false;
  return score <= Math.floor(elapsedSeconds * 8) + 4;
}

export type CrossyRoadHostResolution = { url: string | null; error: string | null };

/** Accept only HTTPS Google Apps Script hosts; never silently fall back to a blocked third-party host. */
export function resolveCrossyRoadHost(raw: unknown): CrossyRoadHostResolution {
  const configured = typeof raw === 'string' ? raw.trim() : '';
  if (!configured) {
    return { url: null, error: 'The Google Apps Script Crossy Road deployment has not been configured on the server.' };
  }
  try {
    const url = new URL(configured);
    const allowedOrigins = new Set(['https://script.google.com', 'https://script.googleusercontent.com']);
    if (url.protocol !== 'https:' || !allowedOrigins.has(url.origin)) {
      throw new Error('unsupported origin');
    }
    url.hash = '';
    return { url: url.toString(), error: null };
  } catch {
    return { url: null, error: 'The Crossy Road host must be a valid HTTPS Google Apps Script deployment URL.' };
  }
}
