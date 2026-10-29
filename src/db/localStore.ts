import fs from 'fs';
import path from 'path';
import {
  INITIAL_USERS,
  INITIAL_POPUPS,
  INITIAL_MAINTENANCE,
  INITIAL_BANNER,
  INITIAL_REQUESTS,
} from '../data/initialData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'local_db.json');

function hashPassword(pass: string): string {
  let hash = 0;
  for (let i = 0; i < pass.length; i++) {
    const char = pass.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_v2_${Math.abs(hash).toString(16)}_${btoa(pass).slice(0, 8)}`;
}

interface LocalDatabaseState {
  users: any[];
  songs: any[];
  playlists: any[];
  favorites: Record<string, string[]>;
  songRequests: any[];
  popups: any[];
  systemSettings: Record<string, any>;
  mediaFiles: Record<string, { id: string; data: string; mimeType: string; size: number; createdAt: string }>;
  chatRequests: any[];
  chatThreads: any[];
  chatMessages: any[];
  chatPairingBlocks: any[];
  userDailyListenUsage: Record<string, { usageDate: string; listens: number }>;
}

class LocalStore {
  private data: LocalDatabaseState;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.loadInitial();
    // Backfill properties for local_db.json files created by older app versions.
    this.data.userDailyListenUsage ||= {};
    for (const user of this.data.users) {
      if (user.dailyListenLimit === undefined) user.dailyListenLimit = null;
    }
  }

  private loadInitial(): LocalDatabaseState {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.songs)) {
          parsed.userDailyListenUsage ||= {};
          parsed.playlists ||= [];
          parsed.favorites ||= {};
          parsed.songRequests ||= [];
          parsed.popups ||= [];
          parsed.systemSettings ||= {};
          parsed.mediaFiles ||= {};
          parsed.chatRequests ||= [];
          parsed.chatThreads ||= [];
          parsed.chatMessages ||= [];
          parsed.chatPairingBlocks ||= [];
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[LocalStore] Error reading local_db.json, recreating defaults:', e);
    }

    // Default seeded data
    const initialUsers = INITIAL_USERS.map((u, idx) => ({
      id: idx + 1,
      uid: u.id,
      username: u.username,
      email: `${u.username}@yousong.app`,
      passwordHash: hashPassword(u.username === 'admin' ? 'admin123' : 'password123'),
      role: u.role,
      isApproved: u.isApproved,
      note: u.note || null,
      temporaryPasswordAssigned: false,
      lastLoginAt: null,
      lastSongListened: null,
      lastSongListenedAt: null,
      chatBlocked: false,
      isSuspended: false,
      suspendedReason: null,
      adminNote: null,
      colorAccent: null,
      createdAt: u.createdAt || new Date().toISOString(),
    }));

    const starterTracks = [
      {
        id: 'song-seed-lofi-1',
        title: 'Late Night Study Desk',
        artist: 'Lofi Records',
        album: 'Midnight Study Sessions',
        genre: 'Lo-Fi',
        tags: ['lo-fi', 'study', 'focus'],
        typeMood: 'Instrumental',
        duration: 180,
        audioUrl: '/api/media/audio/seed_lofi.wav',
        coverUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=500&auto=format&fit=crop&q=80',
        addedAt: new Date().toISOString(),
        plays: 12,
        featured: true,
        description: 'Chill mellow lofi piano chords for study sessions.',
      },
      {
        id: 'song-seed-ambient-2',
        title: 'Crystal Waters Relaxation',
        artist: 'Ambient Academy',
        album: 'Quiet Prep',
        genre: 'Ambient',
        tags: ['ambient', 'peaceful', 'calm'],
        typeMood: 'Atmospheric',
        duration: 210,
        audioUrl: '/api/media/audio/seed_ambient.wav',
        coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
        addedAt: new Date().toISOString(),
        plays: 8,
        featured: true,
        description: 'Gentle atmospheric resonance for deep reading and calm.',
      },
      {
        id: 'song-seed-synth-3',
        title: 'Synthwave Prism Flow',
        artist: 'Cyber Study Club',
        album: 'Neon Focus',
        genre: 'Synthwave',
        tags: ['synthwave', 'coding', 'energy'],
        typeMood: 'Electronic',
        duration: 195,
        audioUrl: '/api/media/audio/seed_synthwave.wav',
        coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
        addedAt: new Date().toISOString(),
        plays: 15,
        featured: true,
        description: 'Uplifting synth pulses for programming and creative flow.',
      },
      {
        id: 'song-seed-acoustic-4',
        title: 'Acoustic Classroom Calm',
        artist: 'Gentle Notes',
        album: 'Library Chimes',
        genre: 'Acoustic',
        tags: ['acoustic', 'guitar', 'reading'],
        typeMood: 'Calm',
        duration: 165,
        audioUrl: '/api/media/audio/seed_acoustic.wav',
        coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&auto=format&fit=crop&q=80',
        addedAt: new Date().toISOString(),
        plays: 6,
        featured: true,
        description: 'Soft fingerpicked guitar notes for library and study periods.',
      },
    ];

    const initialRequests = INITIAL_REQUESTS.map((r) => ({
      id: r.id,
      songTitle: r.songTitle,
      artist: r.artist || null,
      webLink: r.webLink || null,
      coverUrl: r.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      notes: r.notes || null,
      requestedByUserId: r.requestedByUserId || null,
      requestedByUsername: r.requestedByUsername,
      createdAt: r.createdAt,
      status: r.status || 'pending',
      adminNote: r.adminNote || null,
      requestType: r.requestType || 'song',
      reviewedAt: r.reviewedAt || null,
      audioUrl: r.audioUrl || null,
      driveFileId: r.driveFileId || null,
      driveFolderId: r.driveFolderId || null,
      duration: r.duration || 180,
      genre: r.genre || 'Vibe / Chill',
      stagingAudioUrl: r.stagingAudioUrl || null,
      publishedSongId: r.publishedSongId || null,
      publishedAt: r.publishedAt || null,
      processingProgress: null,
      processingError: null,
    }));

    const fresh: LocalDatabaseState = {
      users: initialUsers,
      songs: starterTracks,
      playlists: [],
      favorites: {},
      songRequests: initialRequests,
      popups: INITIAL_POPUPS,
      systemSettings: {
        maintenance: JSON.stringify(INITIAL_MAINTENANCE),
        banner: JSON.stringify(INITIAL_BANNER),
        auto_tag_rules: JSON.stringify([]),
        spotlight_config: JSON.stringify({ enabled: false }),
      },
      mediaFiles: {},
      chatRequests: [],
      chatThreads: [],
      chatMessages: [],
      chatPairingBlocks: [],
      userDailyListenUsage: {},
    };

    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    } catch (_) {}

    return fresh;
  }

  private persist() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
      } catch (err) {
        console.error('[LocalStore] Persist error:', err);
      }
    }, 150);
  }

  // --- USERS ---
  getUsers() {
    return [...this.data.users].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getUserByUid(uid: string) {
    return this.data.users.find((u) => u.uid === uid || String(u.id) === uid) || null;
  }

  getUserByUsername(username: string) {
    const clean = username.trim().toLowerCase();
    return this.data.users.find((u) => u.username.toLowerCase() === clean) || null;
  }

  createUser(data: any) {
    const nextId = this.data.users.length > 0 ? Math.max(...this.data.users.map((u) => u.id || 0)) + 1 : 1;
    const user = {
      id: nextId,
      uid: data.uid,
      username: data.username,
      email: data.email || null,
      passwordHash: data.passwordHash || null,
      role: data.role || 'user',
      isApproved: data.isApproved ?? false,
      note: data.note || null,
      temporaryPasswordAssigned: data.temporaryPasswordAssigned ?? false,
      lastLoginAt: null,
      lastSongListened: null,
      lastSongListenedAt: null,
      chatBlocked: false,
      isSuspended: false,
      suspendedReason: null,
      adminNote: null,
      colorAccent: null,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(user);
    this.persist();
    return user;
  }

  updateUser(userIdOrUid: string | number, updates: any) {
    const user = this.data.users.find(
      (u) => String(u.id) === String(userIdOrUid) || u.uid === String(userIdOrUid)
    );
    if (!user) return null;
    Object.assign(user, updates);
    this.persist();
    return user;
  }

  recordUserLogin(uid: string) {
    const user = this.getUserByUid(uid);
    if (user) {
      user.lastLoginAt = new Date().toISOString();
      this.persist();
    }
  }

  recordUserSongListened(uid: string, songSummary: string) {
    const user = this.getUserByUid(uid);
    if (user) {
      user.lastSongListened = songSummary;
      user.lastSongListenedAt = new Date().toISOString();
      this.persist();
    }
  }

  consumeDailyListen(uid: string, usageDate: string) {
    const user = this.getUserByUid(uid);
    if (!user) return { allowed: false, listensToday: 0, limit: null as number | null };

    const limit = user.dailyListenLimit === null || user.dailyListenLimit === undefined
      ? null
      : Math.max(0, Number(user.dailyListenLimit) || 0);
    const previous = this.data.userDailyListenUsage[uid];
    const used = previous?.usageDate === usageDate ? Math.max(0, Number(previous.listens) || 0) : 0;

    if (limit !== null && used >= limit) {
      return { allowed: false, listensToday: used, limit };
    }

    const listensToday = used + 1;
    this.data.userDailyListenUsage[uid] = { usageDate, listens: listensToday };
    this.persist();
    return { allowed: true, listensToday, limit };
  }

  getDailyListenCounts(usageDate: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [uid, usage] of Object.entries(this.data.userDailyListenUsage || {})) {
      if (usage?.usageDate === usageDate) counts[uid] = Math.max(0, Number(usage.listens) || 0);
    }
    return counts;
  }

  deleteUser(userIdOrUid: string | number) {
    this.data.users = this.data.users.filter(
      (u) => String(u.id) !== String(userIdOrUid) && u.uid !== String(userIdOrUid)
    );
    this.persist();
    return true;
  }

  // --- SONGS ---
  getSongs() {
    return [...this.data.songs].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }

  insertSong(song: any) {
    const existingIdx = this.data.songs.findIndex((s) => s.id === song.id);
    const item = {
      ...song,
      plays: song.plays ?? 0,
      featured: song.featured ?? false,
      addedAt: song.addedAt || new Date().toISOString(),
    };
    if (existingIdx !== -1) {
      this.data.songs[existingIdx] = item;
    } else {
      this.data.songs.unshift(item);
    }
    this.persist();
    return item;
  }

  updateSong(id: string, updates: any) {
    const song = this.data.songs.find((s) => s.id === id);
    if (!song) return null;
    Object.assign(song, updates);
    this.persist();
    return song;
  }

  bulkUpdateSongs(songIds: string[], updates: any) {
    const idSet = new Set(songIds);
    const updated: any[] = [];
    for (const song of this.data.songs) {
      if (idSet.has(song.id)) {
        Object.assign(song, updates);
        updated.push(song);
      }
    }
    this.persist();
    return updated;
  }

  deleteSong(id: string) {
    this.data.songs = this.data.songs.filter((s) => s.id !== id);
    this.persist();
    return true;
  }

  bulkDeleteSongs(songIds: string[]) {
    const idSet = new Set(songIds);
    this.data.songs = this.data.songs.filter((s) => !idSet.has(s.id));
    this.persist();
    return true;
  }

  incrementSongPlay(id: string, isAdmin: boolean = false) {
    const song = this.data.songs.find((s) => s.id === id);
    if (!song) return null;
    if (!isAdmin) {
      song.plays = (song.plays || 0) + 1;
      song.dailyPlays = (song.dailyPlays || 0) + 1;
      song.weeklyPlays = (song.weeklyPlays || 0) + 1;
      song.lastPlayedAt = new Date().toISOString();
      this.persist();
    }
    return song;
  }

  resetSongPlays(id: string) {
    const song = this.data.songs.find((s) => s.id === id);
    if (!song) return null;
    song.plays = 0;
    song.dailyPlays = 0;
    song.weeklyPlays = 0;
    this.persist();
    return song;
  }

  bulkResetSongPlays(ids?: string[]) {
    if (!ids || ids.length === 0) {
      for (const s of this.data.songs) {
        s.plays = 0;
        s.dailyPlays = 0;
        s.weeklyPlays = 0;
      }
    } else {
      const set = new Set(ids);
      for (const s of this.data.songs) {
        if (set.has(s.id)) {
          s.plays = 0;
          s.dailyPlays = 0;
          s.weeklyPlays = 0;
        }
      }
    }
    this.persist();
    return true;
  }

  // --- PLAYLISTS ---
  getPlaylists(userId?: string) {
    if (userId) {
      return this.data.playlists.filter((p) => p.userId === userId);
    }
    return [...this.data.playlists];
  }

  createPlaylist(data: any) {
    const item = {
      id: data.id || `pl-${Date.now()}`,
      userId: data.userId,
      name: data.name,
      description: data.description || null,
      coverUrl: data.coverUrl || null,
      songIds: data.songIds || [],
      createdAt: data.createdAt || new Date().toISOString(),
    };
    this.data.playlists.push(item);
    this.persist();
    return item;
  }

  updatePlaylist(id: string, updates: any) {
    const pl = this.data.playlists.find((p) => p.id === id);
    if (!pl) return null;
    Object.assign(pl, updates);
    this.persist();
    return pl;
  }

  deletePlaylist(id: string) {
    this.data.playlists = this.data.playlists.filter((p) => p.id !== id);
    this.persist();
    return true;
  }

  // --- FAVORITES ---
  getFavorites(userId: string): string[] {
    return this.data.favorites[userId] || [];
  }

  toggleFavorite(userId: string, songId: string): boolean {
    if (!this.data.favorites[userId]) {
      this.data.favorites[userId] = [];
    }
    const list = this.data.favorites[userId];
    const idx = list.indexOf(songId);
    let isFav = false;
    if (idx !== -1) {
      list.splice(idx, 1);
      isFav = false;
    } else {
      list.push(songId);
      isFav = true;
    }
    this.persist();
    return isFav;
  }

  // --- SONG REQUESTS ---
  getRequests() {
    this.cleanupExpiredSongRequests();
    return [...this.data.songRequests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getRequestById(id: string) {
    return this.data.songRequests.find((r) => r.id === id) || null;
  }

  createRequest(data: any) {
    const item = {
      id: data.id || `req-${Date.now()}`,
      songTitle: data.songTitle,
      artist: data.artist || null,
      webLink: data.webLink || null,
      coverUrl: data.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      notes: data.notes || null,
      requestedByUserId: data.requestedByUserId || null,
      requestedByUsername: data.requestedByUsername,
      createdAt: data.createdAt || new Date().toISOString(),
      status: data.status || 'pending',
      adminNote: data.adminNote || null,
      requestType: data.requestType || 'song',
      genre: data.genre || 'Vibe / Chill',
      reviewedAt: null,
      audioUrl: null,
      driveFileId: null,
      driveFolderId: null,
      duration: data.duration || 0,
      stagingAudioUrl: null,
      publishedSongId: null,
      publishedAt: null,
      processingProgress: null,
      processingError: null,
    };
    this.data.songRequests.unshift(item);
    this.persist();
    return item;
  }

  updateRequest(id: string, status: string, adminNote?: string) {
    const r = this.data.songRequests.find((item) => item.id === id);
    if (!r) return null;
    r.status = status;
    if (adminNote !== undefined) r.adminNote = adminNote;
    if (['approved', 'declined', 'staging', 'published'].includes(status)) {
      r.reviewedAt = new Date().toISOString();
    }
    this.persist();
    return r;
  }

  updateRequestFull(id: string, updates: any) {
    const r = this.data.songRequests.find((item) => item.id === id);
    if (!r) return null;
    Object.assign(r, updates);
    this.persist();
    return r;
  }

  deleteRequest(id: string) {
    this.data.songRequests = this.data.songRequests.filter((r) => r.id !== id);
    this.persist();
    return true;
  }

  cleanupExpiredSongRequests(): number {
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const initialLen = this.data.songRequests.length;
    this.data.songRequests = this.data.songRequests.filter((r) => {
      if (r.status === 'declined') {
        const revTime = r.reviewedAt ? new Date(r.reviewedAt).getTime() : new Date(r.createdAt).getTime();
        if (!isNaN(revTime) && now - revTime >= SEVEN_DAYS_MS) {
          return false;
        }
      }
      return true;
    });
    if (this.data.songRequests.length !== initialLen) {
      this.persist();
    }
    return initialLen - this.data.songRequests.length;
  }

  // --- POPUPS ---
  getPopups() {
    this.cleanupExpiredPopups();
    return [...this.data.popups].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  createPopup(data: any) {
    const item = {
      id: data.id || `popup-${Date.now()}`,
      targetUserId: data.targetUserId || 'all',
      title: data.title,
      message: data.message,
      type: data.type || 'announcement',
      createdAt: data.createdAt || new Date().toISOString(),
      active: data.active ?? true,
      expiresAt: data.expiresAt || null,
      isDismissible: data.isDismissible ?? true,
    };
    this.data.popups.unshift(item);
    this.persist();
    return item;
  }

  updatePopup(id: string, active: boolean) {
    const p = this.data.popups.find((item) => item.id === id);
    if (!p) return null;
    p.active = active;
    this.persist();
    return p;
  }

  deletePopup(id: string) {
    this.data.popups = this.data.popups.filter((p) => p.id !== id);
    this.persist();
    return true;
  }

  cleanupExpiredPopups(): number {
    const now = new Date();
    const initialLen = this.data.popups.length;
    this.data.popups = this.data.popups.filter((p) => {
      if (p.expiresAt) {
        const exp = new Date(p.expiresAt);
        if (!isNaN(exp.getTime()) && now >= exp) {
          return false;
        }
      }
      return true;
    });
    if (this.data.popups.length !== initialLen) {
      this.persist();
    }
    return initialLen - this.data.popups.length;
  }

  purgeWelcomePopups() {
    this.data.popups = this.data.popups.filter((p) => {
      const titleLower = (p.title || '').toLowerCase();
      const msgLower = (p.message || '').toLowerCase();
      const isWelcome =
        titleLower.includes('welcome') ||
        titleLower.includes('getting started') ||
        msgLower.includes('welcome to yousong') ||
        msgLower.includes('explore school-friendly');
      return !isWelcome;
    });
    this.persist();
  }

  // --- SETTINGS ---
  getSetting(key: string) {
    const val = this.data.systemSettings[key];
    if (val === undefined) return null;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  setSetting(key: string, value: any) {
    this.data.systemSettings[key] = typeof value === 'string' ? value : JSON.stringify(value);
    this.persist();
    return value;
  }

  // --- MEDIA FILES ---
  saveMediaFile(id: string, data: string, mimeType: string = 'audio/mpeg', size: number = 0) {
    this.data.mediaFiles[id] = {
      id,
      data,
      mimeType,
      size,
      createdAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.mediaFiles[id];
  }

  getMediaFile(id: string) {
    return this.data.mediaFiles[id] || null;
  }

  // --- CHAT SYSTEM ---
  getChatRequests() {
    return [...this.data.chatRequests];
  }

  getChatRequestsForUser(userId: string) {
    return this.data.chatRequests.filter((r) => r.senderId === userId || r.receiverId === userId);
  }

  createChatRequest(data: any) {
    const item = {
      id: data.id || `chat-req-${Date.now()}`,
      senderId: data.senderId,
      senderUsername: data.senderUsername,
      receiverId: data.receiverId,
      receiverUsername: data.receiverUsername,
      reason: data.reason || null,
      status: 'pending',
      adminNote: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    };
    this.data.chatRequests.push(item);
    this.persist();
    return item;
  }

  updateChatRequestStatus(id: string, status: string, adminNote?: string) {
    const r = this.data.chatRequests.find((req) => req.id === id);
    if (!r) return null;
    r.status = status;
    if (adminNote !== undefined) r.adminNote = adminNote;
    r.reviewedAt = new Date().toISOString();
    this.persist();
    return r;
  }

  deleteChatRequest(id: string) {
    this.data.chatRequests = this.data.chatRequests.filter((r) => r.id !== id);
    this.persist();
    return true;
  }

  getChatThreads() {
    return [...this.data.chatThreads];
  }

  getChatThreadsForUser(userId: string) {
    return this.data.chatThreads.filter(
      (t) => (t.user1Id === userId || t.user2Id === userId) && !(t.hiddenByUserIds || []).includes(userId)
    );
  }

  getChatThreadById(threadId: string) {
    return this.data.chatThreads.find((t) => t.id === threadId) || null;
  }

  createOrForceChatThread(u1Id: string, u1Name: string, u2Id: string, u2Name: string, isAppeal: boolean = false) {
    const threadId = isAppeal
      ? `appeal-${u1Id}-${u2Id}`
      : `thread-${[u1Id, u2Id].sort().join('-')}`;
    let thread = this.data.chatThreads.find((t) => t.id === threadId);
    if (!thread) {
      thread = {
        id: threadId,
        user1Id: u1Id,
        user1Username: u1Name,
        user2Id: u2Id,
        user2Username: u2Name,
        isApproved: true,
        isTerminated: false,
        terminatedReason: null,
        lastMessage: null,
        lastMessageSender: null,
        lastMessageAt: new Date().toISOString(),
        hiddenByUserIds: [],
        isAppealThread: isAppeal,
        createdAt: new Date().toISOString(),
      };
      this.data.chatThreads.push(thread);
      this.persist();
    }
    return thread;
  }

  setChatThreadTerminated(threadId: string, isTerminated: boolean, reason?: string) {
    const thread = this.data.chatThreads.find((t) => t.id === threadId);
    if (!thread) return null;
    thread.isTerminated = isTerminated;
    if (reason !== undefined) thread.terminatedReason = reason;
    this.persist();
    return thread;
  }

  deleteChatThread(threadId: string) {
    this.data.chatThreads = this.data.chatThreads.filter((t) => t.id !== threadId);
    this.data.chatMessages = this.data.chatMessages.filter((m) => m.threadId !== threadId);
    this.persist();
    return true;
  }

  hideChatThreadForUser(threadId: string, userId: string) {
    const thread = this.data.chatThreads.find((t) => t.id === threadId);
    if (!thread) return null;
    thread.hiddenByUserIds = thread.hiddenByUserIds || [];
    if (!thread.hiddenByUserIds.includes(userId)) {
      thread.hiddenByUserIds.push(userId);
      this.persist();
    }
    return thread;
  }

  getChatMessages(threadId: string) {
    return this.data.chatMessages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  getAllChatMessages(limitCount: number = 200) {
    return [...this.data.chatMessages]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limitCount);
  }

  createChatMessage(data: any) {
    const msg = {
      id: data.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      threadId: data.threadId,
      senderId: data.senderId,
      senderUsername: data.senderUsername,
      receiverId: data.receiverId,
      content: data.content,
      createdAt: new Date().toISOString(),
    };
    this.data.chatMessages.push(msg);

    // Update thread lastMessage
    const thread = this.data.chatThreads.find((t) => t.id === data.threadId);
    if (thread) {
      thread.lastMessage = data.content;
      thread.lastMessageSender = data.senderUsername;
      thread.lastMessageAt = msg.createdAt;
      thread.hiddenByUserIds = [];
    }

    this.persist();
    return msg;
  }

  deleteChatMessage(messageId: string) {
    this.data.chatMessages = this.data.chatMessages.filter((m) => m.id !== messageId);
    this.persist();
    return true;
  }

  getChatPairingBlocks() {
    return [...this.data.chatPairingBlocks];
  }

  createChatPairingBlock(u1Id: string, u2Id: string, blockedBy: string, reason?: string) {
    const item = {
      id: this.data.chatPairingBlocks.length + 1,
      user1Id: u1Id,
      user2Id: u2Id,
      blockedBy,
      reason: reason || null,
      createdAt: new Date().toISOString(),
    };
    this.data.chatPairingBlocks.push(item);
    this.persist();
    return item;
  }

  deleteChatPairingBlock(id: number) {
    this.data.chatPairingBlocks = this.data.chatPairingBlocks.filter((b) => b.id !== id);
    this.persist();
    return true;
  }

  isChatPairingBlocked(u1Id: string, u2Id: string) {
    return this.data.chatPairingBlocks.some(
      (b) =>
        (b.user1Id === u1Id && b.user2Id === u2Id) ||
        (b.user1Id === u2Id && b.user2Id === u1Id)
    );
  }
}

export const localStore = new LocalStore();
