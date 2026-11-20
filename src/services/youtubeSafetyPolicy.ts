export type WeeklyViolationLike = { uid: string; weekKey: string; videoId: string; offenseNumber?: number };

export function getUtcWeekKey(value: string | Date = new Date()): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid violation timestamp.');
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function getWeeklyViolationNumber(records: WeeklyViolationLike[], uid: string, weekKey: string, videoId: string): number {
  const existing = records.find(record => record.uid === uid && record.weekKey === weekKey && record.videoId === videoId);
  if (existing) return Math.max(1, Number(existing.offenseNumber) || 1);
  return new Set(records.filter(record => record.uid === uid && record.weekKey === weekKey).map(record => record.videoId)).size + 1;
}

export function hasExplicitUnsafeYouTubeMetadataSignal(video: { title: string; channelTitle: string; description: string; tags: string[] }): boolean {
  const text = [video.title, video.channelTitle, video.description, ...video.tags].join(' ').toLowerCase();
  // Educational, documentary, historical, and safety discussions need contextual AI review rather than a keyword-only block.
  if (/\\b(?:explained|education(?:al)?|health class|documentary|awareness|history|news report|prevention|safety lesson|classroom|school lesson|academic)\\b/i.test(text)) return false;
  return [
    /\b(?:porn(?:ography)?|hentai|xxx|sex tape|nude(?:s|ity)?|explicit sexual|uncensored sex|adult video)\b/i,
    /\b(?:graphic gore|real gore|beheading|decapitation|torture footage|graphic dismemberment)\b/i,
    /\b(?:how to commit suicide|suicide instructions|self harm challenge)\b/i,
    /\b(?:inappropriate\s+(?:tv|television|cartoon|anime|movie|movies|show|shows|clips?|scenes?))\b/i,
    /\b(?:not safe for kids|not suitable for children|18\+ only|adults only|explicit scenes|uncensored adult)\b/i,
  ].some(pattern => pattern.test(text));
}
