import { pgTable, text, serial, integer, boolean, timestamp, jsonb, date, primaryKey } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or generated unique account ID
  username: text('username').notNull(),
  email: text('email'),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  isApproved: boolean('is_approved').notNull().default(false),
  note: text('note'),
  temporaryPasswordAssigned: boolean('temporary_password_assigned').default(false),
  lastLoginAt: timestamp('last_login_at'),
  lastSongListened: text('last_song_listened'),
  lastSongListenedAt: timestamp('last_song_listened_at'),
  chatBlocked: boolean('chat_blocked').default(false),
  isSuspended: boolean('is_suspended').default(false),
  suspendedReason: text('suspended_reason'),
  adminNote: text('admin_note'),
  colorAccent: text('color_accent'),
  dailyListenLimit: integer('daily_listen_limit'), // null = unlimited; 0 = no listens allowed
  isLocked: boolean('is_locked').notNull().default(false),
  sessionVersion: integer('session_version').notNull().default(0),
  christmasMode: boolean('christmas_mode').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

/** One atomic counter per user per UTC calendar day. */
export const userDailyListenUsage = pgTable('user_daily_listen_usage', {
  uid: text('uid').notNull(),
  usageDate: date('usage_date', { mode: 'string' }).notNull(),
  listens: integer('listens').notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.uid, table.usageDate] }),
}));

export const songs = pgTable('songs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  mediaCode: text('media_code'),
  album: text('album'),
  genre: text('genre').notNull(),
  tags: jsonb('tags').$type<string[]>(),
  typeMood: text('type_mood'),
  duration: integer('duration').notNull().default(0),
  audioUrl: text('audio_url').notNull(),
  coverUrl: text('cover_url').notNull(),
  addedAt: text('added_at').notNull(),
  plays: integer('plays').notNull().default(0),
  featured: boolean('featured').notNull().default(false),
  description: text('description'),
  isLimitedEdition: boolean('is_limited_edition').default(false),
  limitedUntil: text('limited_until'),
  autoRemoveOnExpire: boolean('auto_remove_on_expire').default(false),
  badgeType: text('badge_type'),
  badgeMessage: text('badge_message'),
  isPinned: boolean('is_pinned').default(false),
  isDroppingSoon: boolean('is_dropping_soon').default(false),
  dropDate: text('drop_date'),
  autoReleaseOnDrop: boolean('auto_release_on_drop').default(false),
  hiddenFrom: jsonb('hidden_from').$type<string[]>(),
  isSpotlight: boolean('is_spotlight').default(false),
  spotlightOrder: integer('spotlight_order').default(0),
  spotlightNote: text('spotlight_note'),
  dailyPlays: integer('daily_plays').default(0),
  dailyPlaysResetDate: text('daily_plays_reset_date'),
  weeklyPlays: integer('weekly_plays').default(0),
  weeklyPlaysResetDate: text('weekly_plays_reset_date'),
  isScheduledForDeletion: boolean('is_scheduled_for_deletion').default(false),
  scheduledDeletionAt: text('scheduled_deletion_at'),
  lastPlayedAt: text('last_played_at'),
});

export const playlists = pgTable('playlists', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  coverUrl: text('cover_url'),
  songIds: jsonb('song_ids').$type<string[]>(),
  createdAt: text('created_at').notNull(),
});

export const favorites = pgTable('favorites', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  songId: text('song_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const songRequests = pgTable('song_requests', {
  id: text('id').primaryKey(),
  songTitle: text('song_title').notNull(),
  artist: text('artist'),
  mediaCode: text('media_code'),
  webLink: text('web_link'),
  coverUrl: text('cover_url'),
  notes: text('notes'),
  requestedByUserId: text('requested_by_user_id'),
  requestedByUsername: text('requested_by_username').notNull(),
  createdAt: text('created_at').notNull(),
  status: text('status').notNull().default('pending'),
  adminNote: text('admin_note'),
  requestType: text('request_type').default('song'),
  reviewedAt: text('reviewed_at'),
  approvedAt: text('approved_at'),
  estimatedUploadAt: text('estimated_upload_at'),
  audioUrl: text('audio_url'),
  driveFileId: text('drive_file_id'),
  driveFolderId: text('drive_folder_id'),
  duration: integer('duration').default(0),
  genre: text('genre').default('Vibe / Chill'),
  stagingAudioUrl: text('staging_audio_url'),
  publishedSongId: text('published_song_id'),
  publishedAt: text('published_at'),
  processingProgress: text('processing_progress'),
  processingError: text('processing_error'),
});

export const popups = pgTable('popups', {
  id: text('id').primaryKey(),
  targetUserId: text('target_user_id').notNull().default('all'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull().default('announcement'),
  createdAt: text('created_at').notNull(),
  active: boolean('active').notNull().default(true),
  expiresAt: timestamp('expires_at'),
  isDismissible: boolean('is_dismissible').default(true),
});

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/** Admin-only registry for the three-digit identifiers shared by each song's audio and artwork. */
export const mediaIds = pgTable('media_ids', {
  code: text('code').primaryKey(),
  status: text('status').notNull().default('reserved'), // reserved | assigned | retired
  songId: text('song_id').unique(),
  requestId: text('request_id').unique(),
  title: text('title'),
  artist: text('artist'),
  audioFileId: text('audio_file_id'),
  artworkFileId: text('artwork_file_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const mediaFiles = pgTable('media_files', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
  mimeType: text('mime_type').notNull().default('audio/mpeg'),
  size: integer('size').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// ----------------- CHAT SYSTEM TABLES -----------------
export const chatRequests = pgTable('chat_requests', {
  id: text('id').primaryKey(),
  senderId: text('sender_id').notNull(),
  senderUsername: text('sender_username').notNull(),
  receiverId: text('receiver_id').notNull(),
  receiverUsername: text('receiver_username').notNull(),
  reason: text('reason'),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'declined'
  adminNote: text('admin_note'),
  createdAt: timestamp('created_at').defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
});

export const chatThreads = pgTable('chat_threads', {
  id: text('id').primaryKey(), // e.g. "thread-usr1-usr2"
  user1Id: text('user1_id').notNull(),
  user1Username: text('user1_username').notNull(),
  user2Id: text('user2_id').notNull(),
  user2Username: text('user2_username').notNull(),
  isApproved: boolean('is_approved').notNull().default(false),
  isTerminated: boolean('is_terminated').notNull().default(false),
  terminatedReason: text('terminated_reason'),
  lastMessage: text('last_message'),
  lastMessageSender: text('last_message_sender'),
  lastMessageAt: timestamp('last_message_at').defaultNow(),
  hiddenByUserIds: jsonb('hidden_by_user_ids').$type<string[]>(),
  isAppealThread: boolean('is_appeal_thread').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  senderId: text('sender_id').notNull(),
  senderUsername: text('sender_username').notNull(),
  receiverId: text('receiver_id').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Separate live radio chat; independent of private messaging. */
export const radioChatMessages = pgTable('radio_chat_messages', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** Persistent, radio-only moderation records. These must never fall back to process-local storage. */
export const radioChatBans = pgTable('radio_chat_bans', {
  userId: text('user_id').primaryKey(),
  username: text('username').notNull(),
  reason: text('reason'),
  bannedBy: text('banned_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const chatPairingBlocks = pgTable('chat_pairing_blocks', {
  id: serial('id').primaryKey(),
  user1Id: text('user1_id').notNull(),
  user2Id: text('user2_id').notNull(),
  blockedBy: text('blocked_by').notNull(), // admin user id
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow(),
});

