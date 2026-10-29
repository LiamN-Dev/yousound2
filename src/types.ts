export type UserRole = 'admin' | 'user';

export type UserAccentColor = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  isApproved: boolean;
  note?: string; // Why they want to be added
  createdAt: string;
  temporaryPasswordAssigned?: boolean;
  lastLoginAt?: string;
  lastSongListened?: string;
  lastSongListenedAt?: string;
  chatBlocked?: boolean;
  isSuspended?: boolean;
  suspendedReason?: string;
  adminNote?: string;
  colorAccent?: UserAccentColor;
  dailyListenLimit?: number | null; // null/undefined = unlimited; 0 = blocked from listening
  dailyListensToday?: number; // Admin-only usage displayed in the user table
}

export type SongBadgeType = 'none' | 'hot' | 'new' | 'top' | 'pinned' | 'admin-pick' | 'limited' | 'custom' | 'spotlight';

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre: string;
  tags?: string[]; // e.g. ['piano', 'classical', 'study', 'debussy']
  typeMood?: string; // e.g. 'Instrumental', 'Acoustic', 'Chill Beats', 'Focus'
  duration: number; // in seconds
  audioUrl: string;
  coverUrl: string;
  addedAt: string;
  plays?: number;
  featured?: boolean;
  description?: string;
  isLimitedEdition?: boolean;
  limitedUntil?: string; // ISO date string or description e.g. "2026-10-15T18:00:00Z"
  autoRemoveOnExpire?: boolean;
  badgeType?: SongBadgeType;
  badgeCustomText?: string;
  badgeMessage?: string;
  badgeExpiresAt?: string;
  isPinned?: boolean;
  isDroppingSoon?: boolean;
  dropDate?: string;
  autoReleaseOnDrop?: boolean;
  // Admin Management Enhancements
  hiddenFrom?: string[]; // ['all'] to hide from everyone, or list of user IDs/usernames
  isSpotlight?: boolean; // Spotlighted track
  spotlightOrder?: number; // Ordering among spotlight tracks
  spotlightNote?: string; // Custom spotlight message / tagline
  dailyPlays?: number; // Number of listens today
  dailyPlaysResetDate?: string; // Date string for daily count (YYYY-MM-DD)
  weeklyPlays?: number; // Number of listens this week
  weeklyPlaysResetDate?: string; // Date string for weekly count
  isScheduledForDeletion?: boolean; // Scheduled for deletion, hidden from all users, pending admin purge
  scheduledDeletionAt?: string; // ISO date string when scheduled for deletion
  lastPlayedAt?: string; // ISO date string of last listen
  appliedAutoTags?: string[]; // Computed / applied auto-tags
}

export type SpotlightTheme = 'gold' | 'neon-cyan' | 'ruby' | 'cosmic-purple';

export interface SpotlightConfig {
  enabled: boolean;
  title: string; // e.g. "🌟 Exclusive Spotlight Showcase"
  subtitle: string; // e.g. "Only featured spotlight tracks are available right now. Enjoy the premier soundstage."
  bannerBadgeText?: string; // e.g. "SPOTLIGHT ONLY MODE ACTIVE"
  theme?: SpotlightTheme;
  hideAllOtherElements: boolean;
  updatedAt?: string;
}

export type AutoTagConditionType =
  | 'added_within_hours' // e.g. 24 hours (New for 1 day)
  | 'daily_plays_threshold' // e.g. >= 5 plays today (Hot for 1 day)
  | 'weekly_plays_threshold' // e.g. >= 10 plays this week (Weekly Top Hit)
  | 'total_plays_threshold' // e.g. >= 30 total plays (Top Hit)
  | 'leaving_within_hours' // e.g. limitedUntil <= 48 hours
  | 'genre_equals' // e.g. "Lo-Fi"
  | 'duration_greater_than' // e.g. > 300 seconds (Extended)
  | 'duration_less_than' // e.g. < 120 seconds (Short vibe)
  | 'tag_contains'; // contains specific tag keyword

export type AutoTagColor = 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet' | 'orange';

export interface AutoTagRule {
  id: string;
  name: string; // e.g. "New Release (1 Day)"
  description: string;
  enabled: boolean;
  tagToApply: string; // e.g. "new", "hot", "leaving soon", "top hit"
  badgeType?: SongBadgeType;
  badgeCustomText?: string;
  color: AutoTagColor;
  conditionType: AutoTagConditionType;
  conditionValue: string | number; // e.g. 24 (hours), 5 (plays), "Lo-Fi"
  durationHours?: number; // how long it lasts in hours (e.g. 24 for 1 day)
  createdAt: string;
}

export interface Playlist {
  id: string;
  userId: string;
  name: string;
  description?: string;
  coverUrl?: string;
  songIds: string[];
  createdAt: string;
}

export type PopupType = 'announcement' | 'alert' | 'music' | 'message';

export interface PopupMessage {
  id: string;
  targetUserId: string; // 'all' or specific userId
  title: string;
  message: string;
  type: PopupType;
  createdAt: string;
  active: boolean;
  expiresAt?: string;
  isDismissible?: boolean;
}

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  updatedAt: string;
  hasCountdown?: boolean;
  estimatedFinishTime?: string | null; // ISO string e.g. "2026-10-03T18:00:00.000Z"
  autoDisableOnCountdown?: boolean;
}

export type BannerColorTheme =
  | 'cyan-violet'
  | 'emerald-cyber'
  | 'amber-rose'
  | 'sapphire-ice'
  | 'ruby-glow'
  | 'midnight-mono';

export interface BannerConfig {
  enabled: boolean;
  versionName: string; // e.g. "v2.5 Liquid Crystal"
  sloganText: string; // e.g. "School Audio Stream Hub"
  colorTheme: BannerColorTheme;
  customGradientFrom?: string;
  customGradientTo?: string;
  ribbonEnabled: boolean;
  ribbonNotice: string;
}

export type SongRequestStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'staging'
  | 'published'
  | 'declined'
  | 'planned'
  | 'completed';

export interface SongRequest {
  id: string;
  songTitle: string;
  artist?: string;
  webLink?: string; // YouTube link
  coverUrl?: string; // Cover art image address
  notes?: string;
  requestedByUserId?: string;
  requestedByUsername: string;
  createdAt: string;
  status: SongRequestStatus;
  adminNote?: string;
  requestType?: 'song' | 'feature';
  featureCategory?: string;
  reviewedAt?: string;
  audioUrl?: string;
  driveFileId?: string;
  driveFolderId?: string;
  duration?: number;
  genre?: string;
  stagingAudioUrl?: string;
  publishedSongId?: string;
  publishedAt?: string;
  processingProgress?: string;
  processingError?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export type ChatRequestStatus = 'pending' | 'approved' | 'declined';

export interface ChatRequest {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  receiverUsername: string;
  reason?: string;
  status: ChatRequestStatus;
  adminNote?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ChatThread {
  id: string;
  user1Id: string;
  user1Username: string;
  user2Id: string;
  user2Username: string;
  isApproved: boolean;
  isTerminated: boolean;
  terminatedReason?: string;
  lastMessage?: string;
  lastMessageSender?: string;
  lastMessageAt?: string;
  hiddenByUserIds?: string[];
  isAppealThread?: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  content: string;
  createdAt: string;
}

export interface ChatPairingBlock {
  id: number;
  user1Id: string;
  user2Id: string;
  blockedBy: string;
  reason?: string;
  createdAt: string;
}


export type FeedbackType = 'feature' | 'bug';
export type FeedbackStatus = 'new' | 'in_progress' | 'done' | 'declined';

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  details: string;
  area?: string | null;
  userId?: string | null;
  username: string;
  userAgent?: string | null;
  status: FeedbackStatus;
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt?: string | null;
  userSeenAt?: string | null;
  unread?: boolean;
}
