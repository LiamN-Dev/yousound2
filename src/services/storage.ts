import {
  User,
  Song,
  Playlist,
  PopupMessage,
  MaintenanceState,
  BannerConfig,
  SongRequest,
  ChatRequest,
  ChatThread,
  ChatMessage,
  ChatPairingBlock,
  FeedbackItem,
  FeedbackStatus,
  SpotlightConfig,
  AutoTagRule,
} from '../types';
import {
  INITIAL_SONGS,
  INITIAL_USERS,
  INITIAL_POPUPS,
  INITIAL_MAINTENANCE,
  INITIAL_PLAYLISTS,
  INITIAL_BANNER,
  INITIAL_REQUESTS,
} from '../data/initialData';
import { DEFAULT_AUTO_TAG_RULES, getDecoratedSong } from '../utils/autoTagRules';
import { getIsoWeekString } from '../utils/mediaUrl';

const STORAGE_KEYS = {
  USERS: 'yousong_users',
  SONGS: 'yousong_songs',
  PLAYLISTS: 'yousong_playlists',
  FAVORITES: 'yousong_favorites',
  POPUPS: 'yousong_popups',
  MAINTENANCE: 'yousong_maintenance',
  BANNER: 'yousong_banner',
  REQUESTS: 'yousong_requests',
  CURRENT_USER: 'yousong_session_user',
  DISMISSED_POPUPS: 'yousong_dismissed_popups',
  AUTO_TAG_RULES: 'yousong_auto_tag_rules',
  SPOTLIGHT_CONFIG: 'yousong_spotlight_config',
};

class StorageService {
  private users: User[] = [];
  private songs: Song[] = [];
  private playlists: Playlist[] = [];
  private favorites: Record<string, string[]> = {};
  private popups: PopupMessage[] = [];
  private maintenance: MaintenanceState = INITIAL_MAINTENANCE;
  private banner: BannerConfig = INITIAL_BANNER;
  private requests: SongRequest[] = INITIAL_REQUESTS;
  private dismissedPopups: Record<string, string[]> = {};
  private sessionDismissedPopups: Set<string> = new Set();
  private autoTagRules: AutoTagRule[] = DEFAULT_AUTO_TAG_RULES;
  private spotlightConfig: SpotlightConfig = {
    enabled: false,
    title: '🌟 Exclusive Spotlight Showcase',
    subtitle: 'Experience this week’s premier sound selection — all regular channels paused.',
    bannerBadgeText: 'SPOTLIGHT ONLY MODE ACTIVE',
    theme: 'gold',
    hideAllOtherElements: true,
  };
  private syncListeners: (() => void)[] = [];

  constructor() {
    this.init();
    this.syncWithServer();
  }

  private init() {
    try {
      const storedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      this.users = storedUsers ? JSON.parse(storedUsers) : [...INITIAL_USERS];

      const storedSongs = localStorage.getItem(STORAGE_KEYS.SONGS);
      this.songs = storedSongs ? JSON.parse(storedSongs) : [...INITIAL_SONGS];

      const storedPlaylists = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      this.playlists = storedPlaylists ? JSON.parse(storedPlaylists) : [...INITIAL_PLAYLISTS];

      const storedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      this.favorites = storedFavorites ? JSON.parse(storedFavorites) : {};

      const storedPopups = localStorage.getItem(STORAGE_KEYS.POPUPS);
      if (storedPopups) {
        try {
          const parsed = JSON.parse(storedPopups);
          this.popups = Array.isArray(parsed)
            ? parsed.filter(
                (p: any) =>
                  p.id !== 'popup-welcome-school' &&
                  !p.title?.toLowerCase().includes('welcome to your song') &&
                  !p.title?.toLowerCase().includes('welcome to yousong')
              )
            : [];
        } catch {
          this.popups = [];
        }
      } else {
        this.popups = [];
      }

      const storedMaintenance = localStorage.getItem(STORAGE_KEYS.MAINTENANCE);
      this.maintenance = storedMaintenance ? JSON.parse(storedMaintenance) : { ...INITIAL_MAINTENANCE };

      const storedBanner = localStorage.getItem(STORAGE_KEYS.BANNER);
      this.banner = storedBanner ? JSON.parse(storedBanner) : { ...INITIAL_BANNER };

      const storedRequests = localStorage.getItem(STORAGE_KEYS.REQUESTS);
      this.requests = storedRequests ? JSON.parse(storedRequests) : [...INITIAL_REQUESTS];

      const storedDismissed = localStorage.getItem(STORAGE_KEYS.DISMISSED_POPUPS);
      if (storedDismissed) {
        this.dismissedPopups = JSON.parse(storedDismissed);
      }

      const storedRules = localStorage.getItem(STORAGE_KEYS.AUTO_TAG_RULES);
      if (storedRules) {
        try {
          const parsed = JSON.parse(storedRules);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.autoTagRules = parsed;
          }
        } catch {}
      }

      const storedSpotlight = localStorage.getItem(STORAGE_KEYS.SPOTLIGHT_CONFIG);
      if (storedSpotlight) {
        try {
          this.spotlightConfig = JSON.parse(storedSpotlight);
        } catch {}
      }
    } catch (e) {
      console.error('Local cache initialization warning:', e);
    }
  }

  public subscribe(listener: () => void) {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.syncListeners.forEach((l) => l());
  }

  // Fetch persistent state from Cloud SQL backend
  public async syncWithServer() {
    try {
      const [songsRes, plRes, reqRes, popRes, userRes, bannerRes, maintRes, autoTagsRes, spotlightRes] = await Promise.allSettled([
        fetch('/api/songs'),
        fetch('/api/playlists'),
        fetch('/api/requests'),
        fetch('/api/popups'),
        fetch('/api/users'),
        fetch('/api/banner'),
        fetch('/api/maintenance'),
        fetch('/api/settings/auto-tags'),
        fetch('/api/settings/spotlight'),
      ]);

      if (songsRes.status === 'fulfilled' && songsRes.value.ok) {
        const data = await songsRes.value.json();
        if (Array.isArray(data.songs)) {
          // Intelligently merge: keep any recent local additions that the server might not have returned yet
          const serverIds = new Set(data.songs.map((s: Song) => s.id));
          const localOnly = this.songs.filter(
            (s) => !serverIds.has(s.id) && s.addedAt && Date.now() - new Date(s.addedAt).getTime() < 120000
          );
          this.songs = [...data.songs, ...localOnly];
          this.saveSongs();
        }
      }

      if (plRes.status === 'fulfilled' && plRes.value.ok) {
        const data = await plRes.value.json();
        if (Array.isArray(data.playlists)) {
          this.playlists = data.playlists;
          this.savePlaylists();
        }
      }

      if (reqRes.status === 'fulfilled' && reqRes.value.ok) {
        const data = await reqRes.value.json();
        if (Array.isArray(data.requests)) {
          this.requests = data.requests;
          this.saveRequests();
        }
      }

      if (popRes.status === 'fulfilled' && popRes.value.ok) {
        const data = await popRes.value.json();
        if (Array.isArray(data.popups)) {
          const now = Date.now();
          this.popups = data.popups.filter((p: any) => {
            if (
              p.id === 'popup-welcome-school' ||
              p.title?.toLowerCase().includes('welcome to your song') ||
              p.title?.toLowerCase().includes('welcome to yousong')
            ) {
              return false;
            }
            if (p.expiresAt) {
              const exp = new Date(p.expiresAt).getTime();
              if (!isNaN(exp) && now >= exp) return false;
            }
            return true;
          });
          this.savePopups();
        }
      }

      if (userRes.status === 'fulfilled' && userRes.value.ok) {
        const data = await userRes.value.json();
        if (Array.isArray(data.users)) {
          this.users = data.users;
          this.saveUsers();
        }
      }

      if (bannerRes.status === 'fulfilled' && bannerRes.value.ok) {
        const data = await bannerRes.value.json();
        if (data.banner) {
          this.banner = data.banner;
          this.saveBanner();
        }
      }

      if (maintRes.status === 'fulfilled' && maintRes.value.ok) {
        const data = await maintRes.value.json();
        if (data.maintenance) {
          this.maintenance = data.maintenance;
          this.saveMaintenance();
        }
      }

      if (autoTagsRes.status === 'fulfilled' && autoTagsRes.value.ok) {
        const data = await autoTagsRes.value.json();
        if (Array.isArray(data.rules) && data.rules.length > 0) {
          this.autoTagRules = data.rules;
          this.saveAutoTagRules();
        }
      }

      if (spotlightRes.status === 'fulfilled' && spotlightRes.value.ok) {
        const data = await spotlightRes.value.json();
        if (data.config) {
          this.spotlightConfig = data.config;
          this.saveSpotlightConfig();
        }
      }

      // Sync current user's approval status and favorites if logged in
      const current = this.getCurrentSessionUser();
      if (current) {
        try {
          const [favRes, meRes] = await Promise.allSettled([
            fetch(`/api/favorites/${encodeURIComponent(current.id)}`),
            fetch(`/api/auth/me/${encodeURIComponent(current.id)}`),
          ]);
          if (favRes.status === 'fulfilled' && favRes.value.ok) {
            const data = await favRes.value.json();
            if (Array.isArray(data.favorites)) {
              this.favorites[current.id] = data.favorites;
              this.saveFavorites();
            }
          }
          if (meRes.status === 'fulfilled' && meRes.value.status === 401) {
            // The server no longer recognises this login (expired, or from before the security update)
            this.setCurrentSessionUser(null);
            this.notify();
            return;
          }
          if (meRes.status === 'fulfilled' && meRes.value.ok) {
            const meData = await meRes.value.json();
            if (meData.success && meData.user) {
              const updated = meData.user;
              if (
                updated.isApproved !== current.isApproved ||
                updated.role !== current.role ||
                updated.username !== current.username ||
                updated.temporaryPasswordAssigned !== current.temporaryPasswordAssigned ||
                updated.chatBlocked !== current.chatBlocked ||
                updated.isSuspended !== current.isSuspended
              ) {
                this.setCurrentSessionUser({ ...current, ...updated });
              }
            }
          }
        } catch {}
      }

      this.notify();
    } catch (e) {
      console.warn('Sync with PostgreSQL server deferred:', e);
    }
  }

  // --- Savers to LocalStorage Cache ---
  private saveUsers() {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
    } catch {}
  }
  private saveSongs() {
    try {
      localStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(this.songs));
    } catch (quotaError) {
      try {
        // Fallback if localStorage quota is exceeded by large base64 data URIs
        const safeSongs = this.songs.map((s) => ({
          ...s,
          audioUrl: s.audioUrl.length > 500000 ? '' : s.audioUrl,
          coverUrl: s.coverUrl.length > 500000 ? '' : s.coverUrl,
        }));
        localStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(safeSongs));
      } catch (e) {
        console.warn('LocalStorage saveSongs notice:', e);
      }
    }
  }
  private savePlaylists() {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(this.playlists));
    } catch {}
  }
  private saveFavorites() {
    try {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(this.favorites));
    } catch {}
  }
  private savePopups() {
    try {
      localStorage.setItem(STORAGE_KEYS.POPUPS, JSON.stringify(this.popups));
    } catch {}
  }
  private saveMaintenance() {
    try {
      localStorage.setItem(STORAGE_KEYS.MAINTENANCE, JSON.stringify(this.maintenance));
    } catch {}
  }
  private saveBanner() {
    try {
      localStorage.setItem(STORAGE_KEYS.BANNER, JSON.stringify(this.banner));
    } catch {}
  }
  private saveRequests() {
    try {
      localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(this.requests));
    } catch {}
  }
  private saveDismissed() {
    try {
      localStorage.setItem(STORAGE_KEYS.DISMISSED_POPUPS, JSON.stringify(this.dismissedPopups));
    } catch {}
  }
  private saveAutoTagRules() {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_TAG_RULES, JSON.stringify(this.autoTagRules));
    } catch {}
  }
  private saveSpotlightConfig() {
    try {
      localStorage.setItem(STORAGE_KEYS.SPOTLIGHT_CONFIG, JSON.stringify(this.spotlightConfig));
    } catch {}
  }

  // --- Banner & Settings ---
  getBanner(): BannerConfig {
    return { ...this.banner };
  }

  async updateBanner(updates: Partial<BannerConfig>): Promise<BannerConfig> {
    this.banner = { ...this.banner, ...updates };
    this.saveBanner();

    try {
      const res = await fetch('/api/admin/banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.banner),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.banner) this.banner = data.banner;
      }
    } catch (e) {
      console.error('Update banner error:', e);
    }
    this.notify();
    return { ...this.banner };
  }

  getMaintenanceState(): MaintenanceState {
    return { ...this.maintenance };
  }

  async setMaintenanceState(
    enabled: boolean,
    message?: string,
    hasCountdown?: boolean,
    estimatedFinishTime?: string | null,
    autoDisableOnCountdown?: boolean
  ): Promise<MaintenanceState> {
    const updated = {
      enabled,
      message: message || this.maintenance.message,
      updatedAt: new Date().toISOString(),
      hasCountdown: !!hasCountdown,
      estimatedFinishTime: hasCountdown ? estimatedFinishTime || null : null,
      autoDisableOnCountdown: !!autoDisableOnCountdown,
    };
    this.maintenance = updated;
    this.saveMaintenance();

    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.maintenance) this.maintenance = data.maintenance;
      }
    } catch (e) {
      console.error('Update maintenance error:', e);
    }
    this.notify();
    return { ...this.maintenance };
  }

  // --- Song Requests ---
  getRequests(): SongRequest[] {
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    // Auto-clean only declined requests older than 7 days; never remove active or staging requests
    this.requests = this.requests.filter((r) => {
      if (r.status === 'declined') {
        const time = r.reviewedAt ? new Date(r.reviewedAt).getTime() : new Date(r.createdAt).getTime();
        if (!isNaN(time) && now - time >= SEVEN_DAYS_MS) {
          return false;
        }
      }
      return true;
    });
    return [...this.requests];
  }

  async createRequest(data: {
    songTitle: string;
    artist?: string;
    notes?: string;
    requestedByUserId?: string;
    requestedByUsername: string;
    requestType?: 'song' | 'feature';
    genre?: string;
  }): Promise<SongRequest> {
    const tempId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newReq: SongRequest = {
      id: tempId,
      songTitle: data.songTitle.trim(),
      artist: (data.artist || '').trim(),
      coverUrl: '',
      notes: (data.notes || '').trim(),
      requestedByUserId: data.requestedByUserId || 'guest',
      requestedByUsername: data.requestedByUsername.trim() || 'User',
      createdAt: new Date().toISOString(),
      status: 'pending',
      requestType: data.requestType || 'song',
      genre: (data.genre || 'Vibe / Chill').trim(),
    };

    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(newReq),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success || !result.request) {
      throw new Error(result.error || 'The server did not save this song request.');
    }
    const savedRequest = result.request as SongRequest;
    this.requests = [savedRequest, ...this.requests.filter((request) => request.id !== savedRequest.id)];
    this.saveRequests();
    this.notify();
    return savedRequest;
  }

  async adminUpdateRequest(id: string, updates: Partial<SongRequest>): Promise<SongRequest | null> {
    const idx = this.requests.findIndex((item) => item.id === id);
    if (idx !== -1) {
      this.requests[idx] = { ...this.requests[idx], ...updates };
      this.saveRequests();
      this.notify();
    }

    try {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The server rejected the request update.');
      if (data.request) {
        if (idx !== -1) this.requests[idx] = data.request;
        this.saveRequests();
        this.notify();
        return data.request;
      }
      throw new Error('The server did not return the updated request.');
    } catch (e) {
      console.error('Admin update request error:', e);
      if (idx !== -1) {
        await this.syncWithServer();
      }
      throw e;
    }
  }

  async adminPublishRequest(id: string, isPublished: boolean, hideVideo: boolean = false): Promise<{ success: boolean; request?: SongRequest; error?: string }> {
    try {
      const res = await fetch(`/api/admin/requests/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished, hideVideo }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Publish failed');
      }

      const idx = this.requests.findIndex((r) => r.id === id);
      if (idx !== -1 && data.request) {
        this.requests[idx] = data.request;
        this.saveRequests();
        this.notify();
      }

      // Re-read the canonical server library so a newly published Drive-hosted song appears immediately.
      await this.syncWithServer();
      return { success: true, request: data.request };
    } catch (err: any) {
      console.error('Publish request error:', err);
      return { success: false, error: err.message };
    }
  }

  async updateRequestStatus(id: string, status: SongRequest['status'], adminNote?: string): Promise<boolean> {
    const res = await fetch(`/api/admin/requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ status, adminNote }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.request) {
      throw new Error(data.error || 'The server did not save the request status.');
    }

    const idx = this.requests.findIndex((item) => item.id === id);
    if (idx !== -1) this.requests[idx] = data.request as SongRequest;
    else this.requests.unshift(data.request as SongRequest);
    this.saveRequests();
    this.notify();
    return true;
  }

  async deleteRequest(id: string, keepSong: boolean = false): Promise<boolean> {
    const res = await fetch(`/api/admin/requests/${encodeURIComponent(id)}${keepSong ? '?keepSong=1' : ''}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'The server did not delete the request.');
    }

    this.requests = this.requests.filter((request) => request.id !== id);
    this.saveRequests();
    this.notify();
    return true;
  }

  // --- Auth & Accounts ---
  getCurrentSessionUser(): User | null {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setCurrentSessionUser(user: User | null) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  }

  async login(usernameAttempt: string, passwordAttempt: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameAttempt, password: passwordAttempt }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Login failed' };
      }

      this.setCurrentSessionUser(data.user);
      this.notify();
      // Background sync so user transitions instantly without delay or reload
      this.syncWithServer().catch(() => {});
      return { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection error' };
    }
  }

  async checkUserApproval(userId: string): Promise<User | null> {
    try {
      const res = await fetch(`/api/auth/me/${encodeURIComponent(userId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.success && data.user) {
        this.setCurrentSessionUser(data.user);
        this.notify();
        return data.user;
      }
      return null;
    } catch {
      return null;
    }
  }

  // --- File Upload Helpers ---
  async uploadAudioFile(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; audioUrl?: string; error?: string }> {
    // 1. Try standard multipart upload with XMLHttpRequest for real progress
    try {
      const res = await new Promise<{ success: boolean; audioUrl?: string; error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('audio', file);

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && onProgress) {
            const percent = Math.min(95, Math.round((evt.loaded / evt.total) * 90));
            onProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.success && data.audioUrl) {
                if (onProgress) onProgress(100);
                resolve({ success: true, audioUrl: data.audioUrl });
                return;
              }
            } catch {}
          }
          resolve({ success: false, error: 'Multipart upload rejected by server' });
        };

        xhr.onerror = () => resolve({ success: false, error: 'Network error during audio upload' });
        xhr.ontimeout = () => resolve({ success: false, error: 'Upload timed out' });

        xhr.timeout = 180000; // 3 minutes timeout for large MP3s
        xhr.open('POST', '/api/upload/audio');
        xhr.send(formData);
      });

      if (res.success && res.audioUrl) {
        return res;
      }
    } catch (e) {
      console.warn('Multipart audio upload failed, falling back to base64 JSON payload:', e);
    }

    // 2. Resilient Fallback: Base64 JSON upload (works across proxies & network restrictions)
    try {
      if (onProgress) onProgress(40);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (onProgress) onProgress(70);

      const res = await fetch('/api/upload/audio-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, base64 }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.audioUrl) {
        if (onProgress) onProgress(100);
        return { success: true, audioUrl: data.audioUrl };
      }
      return { success: false, error: data.error || 'Server rejected audio file' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error uploading audio' };
    }
  }

  async uploadCoverFile(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; coverUrl?: string; error?: string }> {
    // 1. Try standard multipart upload with progress
    try {
      const res = await new Promise<{ success: boolean; coverUrl?: string; error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('cover', file);

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && onProgress) {
            const percent = Math.min(95, Math.round((evt.loaded / evt.total) * 90));
            onProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.success && data.coverUrl) {
                if (onProgress) onProgress(100);
                resolve({ success: true, coverUrl: data.coverUrl });
                return;
              }
            } catch {}
          }
          resolve({ success: false, error: 'Multipart cover upload failed' });
        };

        xhr.onerror = () => resolve({ success: false, error: 'Network error uploading cover' });
        xhr.ontimeout = () => resolve({ success: false, error: 'Cover upload timed out' });

        xhr.timeout = 60000;
        xhr.open('POST', '/api/upload/cover');
        xhr.send(formData);
      });

      if (res.success && res.coverUrl) {
        return res;
      }
    } catch (e) {
      console.warn('Multipart cover upload fallback triggered:', e);
    }

    // 2. Resilient Fallback: Base64 JSON upload
    try {
      if (onProgress) onProgress(50);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (onProgress) onProgress(80);

      const res = await fetch('/api/upload/cover-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, base64 }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.coverUrl) {
        if (onProgress) onProgress(100);
        return { success: true, coverUrl: data.coverUrl };
      }
      return { success: false, error: data.error || 'Failed to upload cover' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error uploading cover' };
    }
  }

  async probeMediaUrl(url: string): Promise<{ success: boolean; reachable: boolean; contentType?: string; size?: number; warning?: string }> {
    try {
      const res = await fetch('/api/media/probe-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        return await res.json();
      }
      return { success: false, reachable: false, warning: 'Probe request failed' };
    } catch (e: any) {
      return { success: false, reachable: false, warning: e.message };
    }
  }

  // --- Google Drive & 3rd-Party Cloud Audio Helpers ---
  parseCloudAudioUrl(rawUrl: string): {
    service: 'gdrive' | 'dropbox' | 'onedrive' | 'direct';
    streamUrl: string;
    fileId?: string;
    displayName: string;
  } {
    const trimmed = rawUrl.trim();

    // 1. Google Drive
    const gdriveMatch = trimmed.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|uc\?export=download&id=)|[?&]id=)([a-zA-Z0-9_-]{20,})/);
    if (gdriveMatch) {
      const fileId = gdriveMatch[1];
      return {
        service: 'gdrive',
        fileId,
        streamUrl: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
        displayName: 'Google Drive Audio Stream',
      };
    }
    // Check if user entered raw Google Drive ID
    if (/^[a-zA-Z0-9_-]{25,45}$/.test(trimmed)) {
      return {
        service: 'gdrive',
        fileId: trimmed,
        streamUrl: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(trimmed)}`,
        displayName: 'Google Drive Audio Stream',
      };
    }

    // 2. Dropbox
    if (trimmed.includes('dropbox.com')) {
      const direct = trimmed.replace(/\?dl=[01]/, '?raw=1').replace(/&dl=[01]/, '&raw=1');
      const finalUrl = direct.includes('?raw=1') ? direct : direct + (direct.includes('?') ? '&raw=1' : '?raw=1');
      return {
        service: 'dropbox',
        streamUrl: finalUrl,
        displayName: 'Dropbox Direct Stream',
      };
    }

    // 3. OneDrive
    if (trimmed.includes('1drv.ms') || trimmed.includes('onedrive.live.com')) {
      return {
        service: 'onedrive',
        streamUrl: trimmed.replace('/redir?', '/download?'),
        displayName: 'OneDrive Stream',
      };
    }

    // 4. Direct Audio URL
    return {
      service: 'direct',
      streamUrl: trimmed,
      displayName: 'Web Audio Stream',
    };
  }

  async importCloudAudio(
    url: string,
    preferredTitle?: string
  ): Promise<{
    success: boolean;
    audioUrl?: string;
    streamUrl?: string;
    filename?: string;
    size?: number;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/media/import-cloud-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, preferredTitle }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return data;
      }
      return { success: false, error: data.error || 'Cloud import failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error importing cloud file' };
    }
  }

  async requestAccount(username: string, passwordAttempt: string, note?: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: passwordAttempt, note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to request account' };
      }
      await this.syncWithServer();
      return { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  async changeOwnPassword(userId: string, currentPasswordAttempt: string, newPasswordChosen: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          currentPassword: currentPasswordAttempt,
          newPassword: newPasswordChosen,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Password update failed' };
      }

      // Immediately clear temporary password flag on local user session
      const current = this.getCurrentSessionUser();
      if (current && current.id === userId) {
        this.setCurrentSessionUser({
          ...current,
          temporaryPasswordAssigned: false,
        });
      }

      // Also update in users list if present
      this.users = this.users.map((u) =>
        u.id === userId ? { ...u, temporaryPasswordAssigned: false } : u
      );
      this.saveUsers();
      this.notify();

      // Background sync with server
      this.syncWithServer().catch(() => {});
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  // --- Admin User Management ---
  getUsers(): User[] {
    return [...this.users];
  }

  async approveAccount(userId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/approve`, { method: 'POST' });
      if (res.ok) {
        const u = this.users.find((user) => user.id === userId);
        if (u) u.isApproved = true;
        this.saveUsers();
        this.notify();
        return true;
      }
    } catch (e) {
      console.error('Approve account error:', e);
    }
    return false;
  }

  async rejectAccount(userId: string, reason?: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        if (reason) {
          this.users = this.users.map((user) =>
            user.id === userId ? { ...user, isApproved: false, adminNote: reason } : user
          );
        } else {
          this.users = this.users.filter((user) => user.id !== userId);
        }
        this.saveUsers();
        this.notify();
        return true;
      }
    } catch (e) {
      console.error('Reject account error:', e);
    }
    return false;
  }

  async adminUpdateUser(
    userId: string,
    params: {
      newUsername?: string;
      newTemporaryPassword?: string;
      role?: 'admin' | 'user';
      isApproved?: boolean;
      chatBlocked?: boolean;
      isSuspended?: boolean;
      suspendedReason?: string;
      adminNote?: string;
      colorAccent?: string;
      dailyListenLimit?: number | null;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to update user' };
      }
      if (data.user) {
        const updated = data.user;
        this.users = this.users.map((u) => (u.id === userId ? { ...u, ...updated } : u));
        const current = this.getCurrentSessionUser();
        if (current && current.id === userId) {
          this.setCurrentSessionUser({ ...current, ...updated });
        }
      } else {
        this.users = this.users.map((u) => {
          if (u.id !== userId) return u;
          return {
            ...u,
            ...(params.newUsername ? { username: params.newUsername } : {}),
            ...(params.role ? { role: params.role } : {}),
            ...(typeof params.isApproved === 'boolean' ? { isApproved: params.isApproved } : {}),
            ...(typeof params.chatBlocked === 'boolean' ? { chatBlocked: params.chatBlocked } : {}),
            ...(typeof params.isSuspended === 'boolean' ? { isSuspended: params.isSuspended, suspendedReason: params.suspendedReason } : {}),
            ...(params.dailyListenLimit !== undefined ? { dailyListenLimit: params.dailyListenLimit } : {}),
          };
        });
      }
      this.saveUsers();
      this.notify();
      await this.syncWithServer();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Update failed' };
    }
  }

  async updateUserAccent(userId: string, colorAccent: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorAccent }),
      });
      if (res.ok) {
        this.users = this.users.map((u) => (u.id === userId ? { ...u, colorAccent: colorAccent as any } : u));
        const current = this.getCurrentSessionUser();
        if (current && current.id === userId) {
          this.setCurrentSessionUser({ ...current, colorAccent: colorAccent as any });
        }
        try {
          localStorage.setItem('yousong_user_accent', colorAccent);
        } catch {}
        this.saveUsers();
        this.notify();
        return true;
      }
    } catch (e) {
      console.error('Update user accent error:', e);
    }
    return false;
  }

  /** Ask the server to atomically consume one listen before starting playback. */
  async authorizeSongListen(songId: string): Promise<{
    allowed: boolean;
    error?: string;
    listensToday?: number;
    dailyListenLimit?: number | null;
  }> {
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(songId)}/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        return {
          allowed: false,
          error: data.error || 'Your listen could not be verified. Please try again.',
          listensToday: data.listensToday,
          dailyListenLimit: data.dailyListenLimit,
        };
      }
      return {
        allowed: true,
        listensToday: data.listensToday,
        dailyListenLimit: data.dailyListenLimit,
      };
    } catch {
      // Fail closed: never play a restricted account's track if the server cannot verify its limit.
      return { allowed: false, error: 'Unable to verify your daily listen allowance. Check your connection and try again.' };
    }
  }

  recordSongListenLocally(userId: string, songTitle: string, songArtist?: string): void {
    const summary = songArtist ? `${songTitle} · ${songArtist}` : songTitle;
    this.users = this.users.map((u) => u.id === userId ? { ...u, lastSongListened: summary, lastSongListenedAt: new Date().toISOString() } : u);
    const current = this.getCurrentSessionUser();
    if (current && current.id === userId) {
      this.setCurrentSessionUser({ ...current, lastSongListened: summary, lastSongListenedAt: new Date().toISOString() });
    }
    this.saveUsers();
    this.notify();
  }

  async recordSongListen(userId: string, songTitle: string, songArtist?: string): Promise<void> {
    try {
      await fetch('/api/users/activity/listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, songTitle, songArtist }),
      });
    } catch {}
  }

  async deleteUser(userId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      if (res.ok) {
        this.users = this.users.filter((u) => u.id !== userId);
        this.saveUsers();
        this.notify();
        return true;
      }
    } catch (e) {
      console.error('Delete user error:', e);
    }
    return false;
  }

  // --- Songs ---
  /**
   * Retrieves songs decorated with auto-tags, filtering out hidden tracks for non-admin users
   */
  getSongs(filterForUser?: User | null, ignoreVisibilityRules: boolean = false): Song[] {
    const user = filterForUser !== undefined ? filterForUser : this.getCurrentSessionUser();
    const isAdmin = user?.role === 'admin';
    const now = Date.now();

    const decorated = this.songs.map((song) => getDecoratedSong(song, this.autoTagRules, now));

    if (ignoreVisibilityRules || isAdmin) {
      return decorated;
    }

    // Filter hidden songs for normal listeners / guests
    const userId = user?.id || '';
    const username = user?.username?.toLowerCase() || '';

    return decorated.filter((song) => {
      // If scheduled for deletion, always make invisible to regular listeners / students
      if (song.isScheduledForDeletion) return false;
      if (!song.hiddenFrom || song.hiddenFrom.length === 0) return true;
      if (song.hiddenFrom.includes('all')) return false;
      if (userId && song.hiddenFrom.includes(userId)) return false;
      if (username && song.hiddenFrom.some((h) => h.toLowerCase() === username)) return false;
      return true;
    });
  }

  /**
   * Retrieves all songs without visibility filtering (for Admin Catalog & Bulk Manager)
   */
  getAllAdminSongs(): Song[] {
    const now = Date.now();
    return this.songs.map((song) => getDecoratedSong(song, this.autoTagRules, now));
  }

  getActiveGenres(): string[] {
    const set = new Set<string>();
    this.songs.forEach((s) => {
      if (s.genre && s.genre.trim()) {
        set.add(s.genre.trim());
      }
    });
    const sorted = Array.from(set).sort();
    return ['All', ...sorted];
  }

  async addSong(songData: Omit<Song, 'id' | 'addedAt' | 'plays'>): Promise<Song> {
    const tempId = `song-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newSong: Song = {
      ...songData,
      id: tempId,
      addedAt: new Date().toISOString(),
      plays: 0,
      tags: songData.tags || [songData.genre.toLowerCase(), 'focus'],
    };

    this.songs.unshift(newSong);
    this.saveSongs();
    this.notify();

    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSong),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.song) {
          const idx = this.songs.findIndex((s) => s.id === tempId);
          if (idx !== -1) this.songs[idx] = data.song;
          this.saveSongs();
          this.notify();
          return data.song;
        }
      }
    } catch (e) {
      console.error('Add song error:', e);
    }
    return newSong;
  }

  async updateSong(songId: string, updates: Partial<Song>): Promise<boolean> {
    const index = this.songs.findIndex((s) => s.id === songId);
    if (index === -1) return false;
    this.songs[index] = { ...this.songs[index], ...updates };
    this.saveSongs();
    this.notify();

    try {
      await fetch(`/api/songs/${encodeURIComponent(songId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (e) {
      console.error('Update song error:', e);
    }
    return true;
  }

  async bulkUpdateSongs(
    songIds: string[],
    updates: Partial<Song>,
    tagOperation?: { action: 'add' | 'remove' | 'set'; tags: string[] }
  ): Promise<boolean> {
    const ids = Array.from(new Set((songIds || []).filter(Boolean)));
    if (!ids.length) return false;

    try {
      const res = await fetch('/api/songs/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ songIds: ids, updates, tagOperation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.songs)) {
        throw new Error(data.error || 'The server did not confirm the batch update.');
      }

      const updatedById = new Map((data.songs as Song[]).map((song) => [song.id, song]));
      if (updatedById.size !== ids.length) {
        throw new Error('The server updated fewer songs than selected. Refresh the library before trying again.');
      }
      this.songs = this.songs.map((song) => updatedById.get(song.id) || song);
      this.saveSongs();
      this.notify();
      return true;
    } catch (error) {
      console.error('Bulk update songs error:', error);
      return false;
    }
  }

  async deleteSong(songId: string): Promise<boolean> {
    this.songs = this.songs.filter((s) => s.id !== songId);
    this.playlists.forEach((p) => {
      p.songIds = p.songIds.filter((id) => id !== songId);
    });
    Object.keys(this.favorites).forEach((uid) => {
      this.favorites[uid] = this.favorites[uid].filter((id) => id !== songId);
    });
    this.saveSongs();
    this.savePlaylists();
    this.saveFavorites();
    this.notify();

    try {
      await fetch(`/api/songs/${encodeURIComponent(songId)}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Delete song error:', e);
    }
    return true;
  }

  async bulkDeleteSongs(songIds: string[]): Promise<boolean> {
    if (!songIds || songIds.length === 0) return false;
    const toDeleteSet = new Set(songIds);

    this.songs = this.songs.filter((s) => !toDeleteSet.has(s.id));
    this.playlists.forEach((p) => {
      p.songIds = p.songIds.filter((id) => !toDeleteSet.has(id));
    });
    Object.keys(this.favorites).forEach((uid) => {
      this.favorites[uid] = this.favorites[uid].filter((id) => !toDeleteSet.has(id));
    });
    this.saveSongs();
    this.savePlaylists();
    this.saveFavorites();
    this.notify();

    try {
      await fetch('/api/songs/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds }),
      });
    } catch (e) {
      console.error('Bulk delete songs error:', e);
    }

    return true;
  }

  async clearAllSongs() {
    this.songs = [];
    this.saveSongs();
    this.notify();
  }

  recordPlay(songId: string, userRole?: string, syncToServer: boolean = true) {
    // ADMIN LISTENS SHOULD NEVER COUNT TOWARDS ANYTHING
    if (userRole === 'admin') {
      return;
    }

    const s = this.songs.find((item) => item.id === songId);
    if (s) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const isToday = s.dailyPlaysResetDate === todayStr;

      const currentWeek = getIsoWeekString(now);
      const isThisWeek = s.weeklyPlaysResetDate === currentWeek;

      s.plays = (s.plays || 0) + 1;
      s.dailyPlays = isToday ? (s.dailyPlays || 0) + 1 : 1;
      s.dailyPlaysResetDate = todayStr;
      s.weeklyPlays = isThisWeek ? (s.weeklyPlays || 0) + 1 : 1;
      s.weeklyPlaysResetDate = currentWeek;
      s.lastPlayedAt = now.toISOString();

      this.saveSongs();
      this.notify();
      if (syncToServer) {
        fetch(`/api/songs/${encodeURIComponent(songId)}/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => {});
      }
    }
  }

  incrementSongPlay(songId: string, userRole?: string, syncToServer: boolean = true) {
    this.recordPlay(songId, userRole, syncToServer);
  }

  async resetSongPlays(songId: string): Promise<boolean> {
    const s = this.songs.find((item) => item.id === songId);
    if (s) {
      s.plays = 0;
      s.dailyPlays = 0;
      s.weeklyPlays = 0;
      s.dailyPlaysResetDate = undefined;
      s.weeklyPlaysResetDate = undefined;
      s.lastPlayedAt = undefined;
      this.saveSongs();
      this.notify();
    }
    try {
      await fetch(`/api/songs/${encodeURIComponent(songId)}/reset-plays`, { method: 'POST' });
      return true;
    } catch (e) {
      console.error('Reset plays error:', e);
      return false;
    }
  }

  async bulkResetSongPlays(ids?: string[]): Promise<boolean> {
    const targetSet = ids ? new Set(ids) : null;
    this.songs.forEach((s) => {
      if (!targetSet || targetSet.has(s.id)) {
        s.plays = 0;
        s.dailyPlays = 0;
        s.weeklyPlays = 0;
        s.dailyPlaysResetDate = undefined;
        s.weeklyPlaysResetDate = undefined;
        s.lastPlayedAt = undefined;
      }
    });
    this.saveSongs();
    this.notify();

    try {
      await fetch('/api/songs/bulk-reset-plays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      return true;
    } catch (e) {
      console.error('Bulk reset plays error:', e);
      return false;
    }
  }

  async importCloudCover(url: string): Promise<{ success: boolean; coverUrl?: string; error?: string }> {
    try {
      const res = await fetch('/api/media/import-cloud-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to import cover artwork' };
    }
  }

  async detectDuration(url: string): Promise<{ success: boolean; duration?: number; error?: string }> {
    try {
      const res = await fetch('/api/media/detect-duration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to detect duration' };
    }
  }

  // --- Auto-Tag Rules Engine ---
  getAutoTagRules(): AutoTagRule[] {
    return [...this.autoTagRules];
  }

  async updateAutoTagRules(rules: AutoTagRule[]): Promise<void> {
    this.autoTagRules = [...rules];
    this.saveAutoTagRules();
    this.notify();

    try {
      await fetch('/api/settings/auto-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: this.autoTagRules }),
      });
    } catch (e) {
      console.error('Update auto-tag rules error:', e);
    }
  }

  async createAutoTagRule(data: Omit<AutoTagRule, 'id' | 'createdAt'>): Promise<AutoTagRule> {
    const newRule: AutoTagRule = {
      ...data,
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.autoTagRules.unshift(newRule);
    this.saveAutoTagRules();
    this.notify();

    try {
      await fetch('/api/settings/auto-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: this.autoTagRules }),
      });
    } catch (e) {
      console.error('Create auto-tag rule error:', e);
    }
    return newRule;
  }

  async updateAutoTagRule(ruleId: string, updates: Partial<AutoTagRule>): Promise<boolean> {
    const idx = this.autoTagRules.findIndex((r) => r.id === ruleId);
    if (idx === -1) return false;
    this.autoTagRules[idx] = { ...this.autoTagRules[idx], ...updates };
    this.saveAutoTagRules();
    this.notify();

    try {
      await fetch('/api/settings/auto-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: this.autoTagRules }),
      });
    } catch (e) {
      console.error('Update auto-tag rule error:', e);
    }
    return true;
  }

  async deleteAutoTagRule(ruleId: string): Promise<boolean> {
    this.autoTagRules = this.autoTagRules.filter((r) => r.id !== ruleId);
    this.saveAutoTagRules();
    this.notify();

    try {
      await fetch('/api/settings/auto-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: this.autoTagRules }),
      });
    } catch (e) {
      console.error('Delete auto-tag rule error:', e);
    }
    return true;
  }

  async resetAutoTagRulesToDefault(): Promise<void> {
    this.autoTagRules = [...DEFAULT_AUTO_TAG_RULES];
    this.saveAutoTagRules();
    this.notify();

    try {
      await fetch('/api/settings/auto-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: this.autoTagRules }),
      });
    } catch (e) {
      console.error('Reset auto-tag rules error:', e);
    }
  }

  // --- Spotlight Mode Configuration ---
  getSpotlightConfig(): SpotlightConfig {
    return { ...this.spotlightConfig };
  }

  async updateSpotlightConfig(updates: Partial<SpotlightConfig>): Promise<SpotlightConfig> {
    this.spotlightConfig = {
      ...this.spotlightConfig,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.saveSpotlightConfig();
    this.notify();

    try {
      const res = await fetch('/api/settings/spotlight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: this.spotlightConfig }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          this.spotlightConfig = data.config;
          this.saveSpotlightConfig();
        }
      }
    } catch (e) {
      console.error('Update spotlight config error:', e);
    }

    return { ...this.spotlightConfig };
  }

  // --- Playlists ---
  getPlaylists(userId?: string): Playlist[] {
    if (!userId) return [...this.playlists];
    return this.playlists.filter((p) => p.userId === userId);
  }

  getUserPlaylists(userId?: string): Playlist[] {
    return this.getPlaylists(userId);
  }

  async createPlaylist(userId: string, name: string, description?: string, coverUrl?: string): Promise<Playlist> {
    const tempId = `pl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newPlaylist: Playlist = {
      id: tempId,
      userId,
      name: name.trim(),
      description: description?.trim() || '',
      coverUrl: coverUrl || '/src/assets/images/lofi_study_glass_1791054585559.jpg',
      songIds: [],
      createdAt: new Date().toISOString(),
    };

    this.playlists.unshift(newPlaylist);
    this.savePlaylists();
    this.notify();

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlaylist),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.playlist) {
          const idx = this.playlists.findIndex((p) => p.id === tempId);
          if (idx !== -1) this.playlists[idx] = data.playlist;
          this.savePlaylists();
          this.notify();
          return data.playlist;
        }
      }
    } catch (e) {
      console.error('Create playlist error:', e);
    }
    return newPlaylist;
  }

  async addSongToPlaylist(playlistId: string, songId: string): Promise<boolean> {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return false;
    if (!pl.songIds.includes(songId)) {
      pl.songIds.push(songId);
      this.savePlaylists();
      this.notify();

      try {
        await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: pl.songIds }),
        });
      } catch (e) {
        console.error('Add song to playlist error:', e);
      }
    }
    return true;
  }

  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<boolean> {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return false;
    pl.songIds = pl.songIds.filter((id) => id !== songId);
    this.savePlaylists();
    this.notify();

    try {
      await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds: pl.songIds }),
      });
    } catch (e) {
      console.error('Remove song from playlist error:', e);
    }
    return true;
  }

  async deletePlaylist(playlistId: string): Promise<boolean> {
    this.playlists = this.playlists.filter((p) => p.id !== playlistId);
    this.savePlaylists();
    this.notify();

    try {
      await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Delete playlist error:', e);
    }
    return true;
  }

  async updatePlaylist(playlistId: string, updates: Partial<Playlist>): Promise<boolean> {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return false;
    Object.assign(pl, updates);
    this.savePlaylists();
    this.notify();

    try {
      await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (e) {
      console.error('Update playlist error:', e);
    }
    return true;
  }

  // --- Favorites ---
  getFavorites(userId: string): string[] {
    return this.favorites[userId] || [];
  }

  getUserFavorites(userId: string): string[] {
    return this.getFavorites(userId);
  }

  async toggleFavorite(userId: string, songId: string): Promise<boolean> {
    if (!this.favorites[userId]) {
      this.favorites[userId] = [];
    }
    const idx = this.favorites[userId].indexOf(songId);
    let isFav = false;
    if (idx > -1) {
      this.favorites[userId].splice(idx, 1);
      isFav = false;
    } else {
      this.favorites[userId].push(songId);
      isFav = true;
    }
    this.saveFavorites();
    this.notify();

    try {
      await fetch(`/api/favorites/${encodeURIComponent(userId)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
    } catch (e) {
      console.error('Toggle favorite error:', e);
    }
    return isFav;
  }

  // --- Popups ---
  getAllPopups(): PopupMessage[] {
    const now = Date.now();
    // Auto-delete expired popups from memory and server
    const expiredPopups = this.popups.filter((p) => {
      if (p.expiresAt) {
        const exp = new Date(p.expiresAt).getTime();
        return !isNaN(exp) && now >= exp;
      }
      return false;
    });

    if (expiredPopups.length > 0) {
      expiredPopups.forEach((p) => {
        this.deletePopup(p.id);
      });
    }

    return this.popups.filter((p) => {
      if (
        p.id === 'popup-welcome-school' ||
        p.title?.toLowerCase().includes('welcome to your song') ||
        p.title?.toLowerCase().includes('welcome to yousong')
      ) {
        return false;
      }
      if (p.expiresAt) {
        const exp = new Date(p.expiresAt).getTime();
        if (!isNaN(exp) && now >= exp) return false;
      }
      return true;
    });
  }

  getActivePopupsForUser(userId?: string): PopupMessage[] {
    const now = Date.now();
    // Auto-delete expired popups from memory and server
    const expiredPopups = this.popups.filter((p) => {
      if (p.expiresAt) {
        const exp = new Date(p.expiresAt).getTime();
        return !isNaN(exp) && now >= exp;
      }
      return false;
    });

    if (expiredPopups.length > 0) {
      expiredPopups.forEach((p) => {
        this.deletePopup(p.id);
      });
    }

    const deviceDismissed = new Set(this.dismissedPopups['_device'] || []);
    const userDismissed = new Set(userId ? this.dismissedPopups[userId] || [] : []);
    const guestDismissed = new Set(this.dismissedPopups['guest'] || []);
    const allDismissed = new Set([...deviceDismissed, ...userDismissed, ...guestDismissed]);

    return this.popups.filter((p) => {
      if (
        p.id === 'popup-welcome-school' ||
        p.title?.toLowerCase().includes('welcome to your song') ||
        p.title?.toLowerCase().includes('welcome to yousong')
      ) {
        return false;
      }
      if (!p.active) return false;
      if (p.expiresAt) {
        const exp = new Date(p.expiresAt).getTime();
        if (!isNaN(exp) && now >= exp) return false;
      }
      // If dismissible: only dismissed if user checked 'I acknowledge' and permanently dismissed
      if (p.isDismissible && allDismissed.has(p.id)) return false;
      // If session dismissed for current tab/window view
      if (this.sessionDismissedPopups.has(p.id)) return false;

      if (p.targetUserId === 'all') return true;
      if (userId && p.targetUserId === userId) return true;
      return false;
    });
  }

  async createPopup(
    targetUserId: string,
    title: string,
    message: string,
    type: PopupMessage['type'] = 'announcement',
    durationMinutes?: number,
    isDismissible?: boolean
  ): Promise<PopupMessage> {
    const tempId = `popup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const expiresAt = durationMinutes && durationMinutes > 0
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : undefined;

    const newPopup: PopupMessage = {
      id: tempId,
      targetUserId,
      title: title.trim(),
      message: message.trim(),
      type,
      createdAt: new Date().toISOString(),
      active: true,
      expiresAt,
      isDismissible: isDismissible !== false,
    };
    this.popups.unshift(newPopup);
    this.savePopups();
    this.notify();

    try {
      const res = await fetch('/api/popups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPopup,
          durationMinutes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.popup) {
          const idx = this.popups.findIndex((p) => p.id === tempId);
          if (idx !== -1) this.popups[idx] = data.popup;
          this.savePopups();
          this.notify();
          return data.popup;
        }
      }
    } catch (e) {
      console.error('Create popup error:', e);
    }
    return newPopup;
  }

  dismissPopup(popupId: string, userId?: string, permanent: boolean = false) {
    if (permanent) {
      if (!this.dismissedPopups['_device']) {
        this.dismissedPopups['_device'] = [];
      }
      if (!this.dismissedPopups['_device'].includes(popupId)) {
        this.dismissedPopups['_device'].push(popupId);
      }

      const targetKey = userId || 'guest';
      if (!this.dismissedPopups[targetKey]) {
        this.dismissedPopups[targetKey] = [];
      }
      if (!this.dismissedPopups[targetKey].includes(popupId)) {
        this.dismissedPopups[targetKey].push(popupId);
      }

      this.saveDismissed();
    } else {
      this.sessionDismissedPopups.add(popupId);
    }
    this.notify();
  }

  async revokePopup(popupId: string): Promise<boolean> {
    const p = this.popups.find((item) => item.id === popupId);
    if (!p) return false;
    p.active = false;
    this.savePopups();
    this.notify();

    try {
      await fetch(`/api/admin/popups/${encodeURIComponent(popupId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
    } catch (e) {
      console.error('Revoke popup error:', e);
    }
    return true;
  }

  async deletePopup(popupId: string): Promise<boolean> {
    this.popups = this.popups.filter((item) => item.id !== popupId);
    this.savePopups();
    this.notify();

    try {
      await fetch(`/api/popups/${encodeURIComponent(popupId)}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Delete popup error:', e);
    }
    return true;
  }

  // --- Chat System Service Methods ---
  async getChatRequests(userId?: string): Promise<ChatRequest[]> {
    try {
      const url = userId ? `/api/chat/requests?userId=${encodeURIComponent(userId)}` : '/api/chat/requests';
      const res = await fetch(url);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        return data.requests || [];
      }
    } catch (_) {}
    return [];
  }

  async createChatRequest(
    senderId: string,
    senderUsername: string,
    receiverId: string,
    receiverUsername: string,
    reason?: string
  ): Promise<{ success: boolean; request?: ChatRequest; error?: string }> {
    try {
      const res = await fetch('/api/chat/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId, senderUsername, receiverId, receiverUsername, reason }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        return { success: false, error: 'Failed to submit chat request' };
      }
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.error || 'Failed to submit chat request' };
      }
      return { success: true, request: data.request };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async updateChatRequestStatus(
    id: string,
    status: 'approved' | 'declined',
    adminNote?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/chat/requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        return { success: false, error: 'Failed to update request' };
      }
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.error || 'Failed to update request' };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async getChatThreads(userId?: string): Promise<ChatThread[]> {
    try {
      const url = userId ? `/api/chat/threads?userId=${encodeURIComponent(userId)}` : '/api/chat/threads';
      const res = await fetch(url);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        return data.threads || [];
      }
    } catch (_) {}
    return [];
  }

  async forceStartChatThread(
    user1Id: string,
    user1Username: string,
    user2Id: string,
    user2Username: string
  ): Promise<{ success: boolean; thread?: ChatThread; error?: string }> {
    try {
      const res = await fetch('/api/chat/threads/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user1Id, user1Username, user2Id, user2Username }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to force-start chat' };
      }
      return { success: true, thread: data.thread };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async terminateChatThread(threadId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/terminate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to terminate thread' };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async reopenChatThread(threadId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/reopen`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to reopen thread' };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async getChatMessages(threadId: string): Promise<ChatMessage[]> {
    try {
      const res = await fetch(`/api/chat/messages/${encodeURIComponent(threadId)}`);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (_) {}
    return [];
  }

  async getAllChatMessages(): Promise<ChatMessage[]> {
    try {
      const res = await fetch('/api/chat/messages-all');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (_) {}
    return [];
  }

  async sendChatMessage(
    threadId: string,
    senderId: string,
    senderUsername: string,
    receiverId: string,
    content: string
  ): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, senderId, senderUsername, receiverId, content }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Could not send message' };
      }
      return { success: true, message: data.message };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async deleteChatMessage(msgId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/chat/messages/${encodeURIComponent(msgId)}`, { method: 'DELETE' });
      if (res.ok) return { success: true };
      return { success: false, error: 'Failed to delete message' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async clearChatThreadMessages(threadId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const msgs = await this.getChatMessages(threadId);
      await Promise.all(msgs.map((m) => this.deleteChatMessage(m.id)));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async getChatPairingBlocks(): Promise<ChatPairingBlock[]> {
    try {
      const res = await fetch('/api/chat/pairing-blocks');
      if (res.ok) {
        const data = await res.json();
        return data.blocks || [];
      }
    } catch (e) {
      console.error('getChatPairingBlocks error:', e);
    }
    return [];
  }

  async createChatPairingBlock(
    user1Id: string,
    user2Id: string,
    blockedBy: string,
    reason?: string
  ): Promise<{ success: boolean; block?: ChatPairingBlock; error?: string }> {
    try {
      const res = await fetch('/api/chat/pairing-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user1Id, user2Id, blockedBy, reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to create pairing block' };
      }
      return { success: true, block: data.block };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async deleteChatPairingBlock(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/chat/pairing-blocks/${id}`, { method: 'DELETE' });
      if (res.ok) return { success: true };
      return { success: false, error: 'Failed to unblock pair' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async deleteChatRequest(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/chat/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) return { success: true };
      return { success: false, error: 'Failed to delete chat request' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async deleteChatThread(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/chat/threads/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) return { success: true };
      return { success: false, error: 'Failed to delete chat thread' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  async hideChatThread(threadId: string, userId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getOrCreateAppealThread(userId: string, username: string): Promise<ChatThread | null> {
    try {
      const res = await fetch('/api/chat/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.thread || null;
      }
    } catch (e) {
      console.error('getOrCreateAppealThread error:', e);
    }
    return null;
  }

  // --- Feature requests & bug reports ---
  async submitFeedback(payload: {
    type: 'feature' | 'bug';
    title: string;
    details: string;
    area?: string;
    userId?: string;
    username?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userAgent: navigator.userAgent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Could not send. Please try again.' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error' };
    }
  }

  /** The signed-in person's own reports, with progress + unread flags */
  async getMyFeedback(): Promise<FeedbackItem[]> {
    try {
      const res = await fetch('/api/feedback/mine');
      if (res.ok) {
        const data = await res.json();
        return data.items || [];
      }
    } catch (_) {}
    return [];
  }

  async markMyFeedbackSeen(): Promise<void> {
    try {
      await fetch('/api/feedback/mine/seen', { method: 'POST' });
    } catch (_) {}
  }

  async clearClosedFeedback(): Promise<number> {
    try {
      const res = await fetch('/api/admin/feedback/clear-closed', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        return data.removed || 0;
      }
    } catch (_) {}
    return 0;
  }

  /** A player measured the real length of a song that only had a placeholder length */
  async reportSongDuration(songId: string, seconds: number): Promise<void> {
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(songId)}/duration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds }),
      });
      if (res.ok) {
        const data = await res.json();
        const idx = this.songs.findIndex((s) => s.id === songId);
        if (data.duration && idx !== -1) {
          this.songs[idx] = { ...this.songs[idx], duration: data.duration };
          this.saveSongs();
          this.notify();
        }
      }
    } catch (_) {}
  }

  async getFeedback(adminUserId: string): Promise<FeedbackItem[]> {
    try {
      const res = await fetch(`/api/admin/feedback?userId=${encodeURIComponent(adminUserId)}`);
      if (res.ok) {
        const data = await res.json();
        return data.items || [];
      }
    } catch (_) {}
    return [];
  }

  async updateFeedback(
    id: string,
    adminUserId: string,
    patch: { status?: FeedbackStatus; adminNote?: string }
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/feedback/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: adminUserId, ...patch }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async deleteFeedback(id: string, adminUserId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/feedback/${encodeURIComponent(id)}?userId=${encodeURIComponent(adminUserId)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const storage = new StorageService();
