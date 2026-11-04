-- ==========================================================
-- YouSong Supabase Database Schema
-- Run this script in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- ==========================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  email TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  temporary_password_assigned BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,
  last_song_listened TEXT,
  last_song_listened_at TIMESTAMPTZ,
  chat_blocked BOOLEAN DEFAULT false,
  is_suspended BOOLEAN DEFAULT false,
  suspended_reason TEXT,
  admin_note TEXT,
  color_accent TEXT,
  daily_listen_limit INTEGER, -- NULL = unlimited, 0 = no listens allowed
  games_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Upgrade existing installations safely.
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS daily_listen_limit INTEGER;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS games_enabled BOOLEAN NOT NULL DEFAULT false;

-- One atomic listen counter per user per UTC calendar day.
CREATE TABLE IF NOT EXISTS user_daily_listen_usage (
  uid TEXT NOT NULL,
  usage_date DATE NOT NULL,
  listens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, usage_date)
);

-- 2. Songs Table
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  media_code TEXT,
  album TEXT,
  genre TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  type_mood TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  duration_exact DOUBLE PRECISION,
  audio_url TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  added_at TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  is_limited_edition BOOLEAN DEFAULT false,
  limited_until TEXT,
  auto_remove_on_expire BOOLEAN DEFAULT false,
  badge_type TEXT,
  badge_message TEXT,
  is_pinned BOOLEAN DEFAULT false,
  is_dropping_soon BOOLEAN DEFAULT false,
  drop_date TEXT,
  drop_message TEXT,
  auto_release_on_drop BOOLEAN DEFAULT false,
  is_christmas_edition BOOLEAN DEFAULT false,
  game_approved BOOLEAN NOT NULL DEFAULT false,
  game_bpm INTEGER NOT NULL DEFAULT 120,
  game_bpm_detected BOOLEAN NOT NULL DEFAULT false,
  game_beat_offset_ms INTEGER NOT NULL DEFAULT 0,
  hidden_from JSONB DEFAULT '[]'::jsonb,
  is_spotlight BOOLEAN DEFAULT false,
  spotlight_order INTEGER DEFAULT 0,
  spotlight_note TEXT,
  daily_plays INTEGER DEFAULT 0,
  daily_plays_reset_date TEXT,
  weekly_plays INTEGER DEFAULT 0,
  weekly_plays_reset_date TEXT,
  is_scheduled_for_deletion BOOLEAN DEFAULT false,
  scheduled_deletion_at TEXT,
  last_played_at TEXT
);

-- Persistent rounds and scores for the first YouSong game.
CREATE TABLE IF NOT EXISTS song_guess_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  rounds JSONB NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0,
  round_attempts INTEGER NOT NULL DEFAULT 0,
  round_solved BOOLEAN NOT NULL DEFAULT false,
  score INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_song_guess_sessions_leaderboard
  ON song_guess_sessions(completed, score DESC);

-- Admin-only Media ID registry. Codes are unique and never silently recycled.
CREATE TABLE IF NOT EXISTS media_ids (
  code TEXT PRIMARY KEY CHECK (length(code) = 3 AND code ~ '^[0-9]{3}'),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'assigned', 'retired')),
  song_id TEXT UNIQUE,
  request_id TEXT UNIQUE,
  title TEXT,
  artist TEXT,
  audio_file_id TEXT,
  artwork_file_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_ids_status ON media_ids(status);

-- Existing song rows default to not approved; admins must opt tracks into games.
ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS game_approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS game_bpm INTEGER NOT NULL DEFAULT 120;

-- Persistent rhythm-game sessions and leaderboard records.
CREATE TABLE IF NOT EXISTS rhythm_game_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  song_id TEXT NOT NULL,
  song_title TEXT NOT NULL,
  artist TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  note_chart JSONB NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  accuracy DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_combo INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rhythm_game_sessions_leaderboard
  ON rhythm_game_sessions(completed, score DESC);

-- 3. Playlists Table
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  song_ids JSONB DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL
);

-- 4. Favorites Table
CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, song_id)
);

-- 5. Song Requests & Moderation Pipeline
CREATE TABLE IF NOT EXISTS song_requests (
  id TEXT PRIMARY KEY,
  song_title TEXT NOT NULL,
  artist TEXT,
  media_code TEXT,
  web_link TEXT,
  cover_url TEXT,
  notes TEXT,
  requested_by_user_id TEXT,
  requested_by_username TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  request_type TEXT DEFAULT 'song',
  reviewed_at TEXT,
  approved_at TEXT,
  estimated_upload_at TEXT,
  audio_url TEXT,
  drive_file_id TEXT,
  drive_folder_id TEXT,
  duration INTEGER DEFAULT 0,
  genre TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  is_dropping_soon BOOLEAN DEFAULT false,
  drop_date TEXT,
  drop_message TEXT,
  auto_release_on_drop BOOLEAN DEFAULT false,
  hidden_from JSONB DEFAULT '[]'::jsonb,
  is_christmas_edition BOOLEAN DEFAULT false,
  staging_audio_url TEXT,
  published_song_id TEXT,
  published_at TEXT,
  processing_progress TEXT,
  processing_error TEXT
);

-- 6. Popups & Announcements Table
CREATE TABLE IF NOT EXISTS popups (
  id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL DEFAULT 'all',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'announcement',
  created_at TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  is_dismissible BOOLEAN DEFAULT true
);

-- 7. System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Media Files Table
CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
  size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Chat Requests Table
CREATE TABLE IF NOT EXISTS chat_requests (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  receiver_username TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- 10. Chat Threads Table
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  user1_id TEXT NOT NULL,
  user1_username TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  user2_username TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_terminated BOOLEAN NOT NULL DEFAULT false,
  terminated_reason TEXT,
  last_message TEXT,
  last_message_sender TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  hidden_by_user_ids JSONB DEFAULT '[]'::jsonb,
  is_appeal_thread BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Radio Chat Bans (separate from account-wide chat restrictions)
CREATE TABLE IF NOT EXISTS radio_chat_bans (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  reason TEXT,
  banned_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Chat Pairing Blocks Table
CREATE TABLE IF NOT EXISTS chat_pairing_blocks (
  id SERIAL PRIMARY KEY,
  user1_id TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  blocked_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Additive migrations for databases created before Media IDs were introduced.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS media_code TEXT;
ALTER TABLE song_requests ADD COLUMN IF NOT EXISTS media_code TEXT;

-- Helpful performance indexes
CREATE INDEX IF NOT EXISTS idx_songs_added_at ON songs(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
CREATE INDEX IF NOT EXISTS idx_requests_status ON song_requests(status);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_user_daily_listen_usage_date ON user_daily_listen_usage(usage_date);
