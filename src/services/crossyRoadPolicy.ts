export type CrossyRoadAccountAccess = {
  role?: unknown;
  isApproved?: unknown;
  isSuspended?: unknown;
  isLocked?: unknown;
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
