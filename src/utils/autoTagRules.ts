import { Song, AutoTagRule, SongBadgeType } from '../types';

export const DEFAULT_AUTO_TAG_RULES: AutoTagRule[] = [
  {
    id: 'rule-new-1d',
    name: 'New Release (1 Day)',
    description: 'Auto-labels songs as New for 24 hours after being added to the library.',
    enabled: true,
    tagToApply: 'new',
    badgeType: 'new',
    badgeCustomText: 'NEW RELEASE',
    color: 'emerald',
    conditionType: 'added_within_hours',
    conditionValue: 24,
    durationHours: 24,
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'rule-hot-1d',
    name: 'Hot Track of the Day',
    description: 'Auto-labels songs as Hot if played 5+ times during the current day.',
    enabled: true,
    tagToApply: 'hot',
    badgeType: 'hot',
    badgeCustomText: 'HOT TODAY',
    color: 'orange',
    conditionType: 'daily_plays_threshold',
    conditionValue: 5,
    durationHours: 24,
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'rule-top-hit',
    name: 'Top Hit (25+ Listens)',
    description: 'Auto-labels songs as Top Hit if total listens reach 25 or more.',
    enabled: true,
    tagToApply: 'top hit',
    badgeType: 'top',
    badgeCustomText: 'TOP HIT',
    color: 'amber',
    conditionType: 'total_plays_threshold',
    conditionValue: 25,
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'rule-leaving-soon',
    name: 'Leaving Soon (48 Hours)',
    description: 'Auto-labels limited edition songs when expiration is within 48 hours.',
    enabled: true,
    tagToApply: 'leaving soon',
    badgeType: 'limited',
    badgeCustomText: 'LEAVING SOON',
    color: 'rose',
    conditionType: 'leaving_within_hours',
    conditionValue: 48,
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'rule-lofi-study',
    name: 'Lo-Fi Study Essential',
    description: 'Auto-applies #study-vibe tag to all songs in the Lo-Fi genre.',
    enabled: true,
    tagToApply: 'study-vibe',
    badgeType: 'custom',
    badgeCustomText: 'STUDY VIBE',
    color: 'cyan',
    conditionType: 'genre_equals',
    conditionValue: 'Lo-Fi',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'rule-extended-session',
    name: 'Extended Deep Focus',
    description: 'Auto-labels tracks longer than 4 minutes (240s) for marathon study.',
    enabled: true,
    tagToApply: 'extended',
    badgeType: 'custom',
    badgeCustomText: 'LONG PLAY',
    color: 'violet',
    conditionType: 'duration_greater_than',
    conditionValue: 240,
    createdAt: '2026-10-01T00:00:00.000Z',
  },
];

export interface AutoTagMatchResult {
  rule: AutoTagRule;
  matched: boolean;
  reason?: string;
}

/**
 * Checks whether a single rule applies to a song at the current moment
 */
export function testRuleMatch(song: Song, rule: AutoTagRule, nowMs: number = Date.now()): boolean {
  if (!rule.enabled) return false;

  switch (rule.conditionType) {
    case 'added_within_hours': {
      if (!song.addedAt) return false;
      const addedTime = new Date(song.addedAt).getTime();
      if (isNaN(addedTime)) return false;
      const hoursAgo = (nowMs - addedTime) / (1000 * 60 * 60);
      const thresholdHours = Number(rule.conditionValue) || 24;
      return hoursAgo >= 0 && hoursAgo <= thresholdHours;
    }

    case 'daily_plays_threshold': {
      const todayStr = new Date(nowMs).toISOString().slice(0, 10);
      const isToday = song.dailyPlaysResetDate === todayStr;
      const dailyCount = isToday ? (song.dailyPlays || 0) : 0;
      const threshold = Number(rule.conditionValue) || 5;
      return dailyCount >= threshold;
    }

    case 'weekly_plays_threshold': {
      const d = new Date(nowMs);
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      const weekKey = `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      const isThisWeek = song.weeklyPlaysResetDate === weekKey;
      const weeklyCount = isThisWeek ? (song.weeklyPlays || 0) : (song.weeklyPlays || 0);
      const threshold = Number(rule.conditionValue) || 10;
      return weeklyCount >= threshold;
    }

    case 'total_plays_threshold': {
      const plays = Number(song.plays) || 0;
      const threshold = Number(rule.conditionValue) || 25;
      return plays >= threshold;
    }

    case 'leaving_within_hours': {
      if (!song.isLimitedEdition || !song.limitedUntil) return false;
      const expireTime = new Date(song.limitedUntil).getTime();
      if (isNaN(expireTime)) return false;
      const hoursUntilExpire = (expireTime - nowMs) / (1000 * 60 * 60);
      const thresholdHours = Number(rule.conditionValue) || 48;
      return hoursUntilExpire > 0 && hoursUntilExpire <= thresholdHours;
    }

    case 'genre_equals': {
      if (!song.genre) return false;
      const targetGenre = String(rule.conditionValue).trim().toLowerCase();
      return song.genre.trim().toLowerCase() === targetGenre;
    }

    case 'duration_greater_than': {
      const duration = Number(song.duration) || 0;
      const thresholdSeconds = Number(rule.conditionValue) || 300;
      return duration >= thresholdSeconds;
    }

    case 'duration_less_than': {
      const duration = Number(song.duration) || 0;
      const thresholdSeconds = Number(rule.conditionValue) || 120;
      return duration > 0 && duration <= thresholdSeconds;
    }

    case 'tag_contains': {
      const keyword = String(rule.conditionValue).trim().toLowerCase();
      if (!keyword) return false;
      const inTitle = song.title.toLowerCase().includes(keyword);
      const inArtist = song.artist.toLowerCase().includes(keyword);
      const inTags = song.tags?.some((t) => t.toLowerCase().includes(keyword));
      return inTitle || inArtist || !!inTags;
    }

    default:
      return false;
  }
}

/**
 * Decorates a song with dynamic auto-tags and badges computed from active rules
 */
export function getDecoratedSong(song: Song, rules: AutoTagRule[] = DEFAULT_AUTO_TAG_RULES, nowMs: number = Date.now()): Song {
  const matchedRules = rules.filter((r) => testRuleMatch(song, r, nowMs));
  if (matchedRules.length === 0) {
    return song;
  }

  const existingTags = new Set((song.tags || []).map((t) => t.toLowerCase()));
  const newAutoTags: string[] = [];

  matchedRules.forEach((r) => {
    const cleanTag = r.tagToApply.trim().toLowerCase();
    if (cleanTag && !existingTags.has(cleanTag)) {
      newAutoTags.push(r.tagToApply.trim());
      existingTags.add(cleanTag);
    }
  });

  const mergedTags = [...(song.tags || []), ...newAutoTags];

  // If song does not already have an explicit manual badge, choose top matched rule badge
  let effectiveBadgeType = song.badgeType;
  let effectiveBadgeCustomText = song.badgeCustomText;

  if (!effectiveBadgeType || effectiveBadgeType === 'none') {
    const badgeRule = matchedRules.find((r) => r.badgeType && r.badgeType !== 'none');
    if (badgeRule) {
      effectiveBadgeType = badgeRule.badgeType;
      effectiveBadgeCustomText = badgeRule.badgeCustomText || badgeRule.name;
    }
  }

  return {
    ...song,
    tags: mergedTags,
    badgeType: effectiveBadgeType,
    badgeCustomText: effectiveBadgeCustomText,
    appliedAutoTags: matchedRules.map((r) => r.tagToApply),
  };
}

/**
 * Computes how many songs match each rule for admin preview / dry run
 */
export function getRuleMatchCounts(songs: Song[], rules: AutoTagRule[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const now = Date.now();
  rules.forEach((rule) => {
    counts[rule.id] = songs.filter((s) => testRuleMatch(s, rule, now)).length;
  });
  return counts;
}
