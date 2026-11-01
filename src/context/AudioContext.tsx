import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Song, Playlist, RepeatMode, SpotlightConfig, AutoTagRule } from '../types';
import { storage } from '../services/storage';
import { useAuth } from './AuthContext';

export interface EqualizerSettings {
  preset: string;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
}

const DEFAULT_EQUALIZER: EqualizerSettings = {
  preset: 'Default', bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0,
};

interface AudioContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  queue: Song[];
  allSongs: Song[];
  adminAllSongs: Song[];
  spotlightConfig: SpotlightConfig;
  autoTagRules: AutoTagRule[];
  userFavorites: string[];
  userPlaylists: Playlist[];
  isExpandedVisualizer: boolean;
  playbackError: string | null;
  clearPlaybackError: () => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  equalizer: EqualizerSettings;
  setEqualizer: (updates: Partial<EqualizerSettings>) => void;
  isRadioMode: boolean;
  playRadioSong: (song: Song, elapsedSeconds: number) => Promise<void>;
  leaveRadio: () => void;
  pauseRadioPlayback: () => void;
  // Controls
  playSong: (song: Song, newQueue?: Song[]) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolumeLevel: (vol: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  playNext: () => void;
  playPrevious: () => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (songId: string) => void;
  clearQueue: () => void;
  toggleFavorite: (songId: string) => void;
  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  addSongToPlaylist: (playlistId: string, songId: string) => void;
  removeSongFromPlaylist: (playlistId: string, songId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  updatePlaylist: (playlistId: string, updates: Partial<Playlist>) => Promise<boolean>;
  setIsExpandedVisualizer: (val: boolean) => void;
  // Admin song management & Enhancements
  addNewSong: (song: Omit<Song, 'id' | 'addedAt' | 'plays'>) => Promise<Song>;
  updateSong: (id: string, updates: Partial<Song>) => void;
  deleteSong: (id: string) => void;
  bulkUpdateSongs: (songIds: string[], updates: Partial<Song>, tagOperation?: { action: 'add' | 'remove' | 'set'; tags: string[] }) => Promise<boolean>;
  bulkDeleteSongs: (songIds: string[]) => Promise<boolean>;
  resetSongPlays: (id: string) => Promise<boolean>;
  bulkResetSongPlays: (ids?: string[]) => Promise<boolean>;
  clearAllSongs: () => void;
  refreshSongLibrary: () => void;
  // Spotlight & Auto-tag rules
  updateSpotlightConfig: (updates: Partial<SpotlightConfig>) => Promise<SpotlightConfig>;
  updateAutoTagRules: (rules: AutoTagRule[]) => Promise<void>;
  createAutoTagRule: (rule: Omit<AutoTagRule, 'id' | 'createdAt'>) => Promise<AutoTagRule>;
  updateAutoTagRule: (ruleId: string, updates: Partial<AutoTagRule>) => Promise<boolean>;
  deleteAutoTagRule: (ruleId: string) => Promise<boolean>;
  resetAutoTagRulesToDefault: () => Promise<void>;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

/** Convert Drive share/download URLs and legacy local proxy URLs to the playable same-origin route. */
function getPlayableAudioUrl(rawUrl: string): string {
  const value = String(rawUrl || '').trim();
  if (!value) return value;

  const localProxy = value.match(/^\/api\/media\/drive-stream\/([a-zA-Z0-9_-]{10,200})(?:[?#].*)?$/);
  if (localProxy) return `/api/drive/stream/${encodeURIComponent(localProxy[1])}`;
  if (/^\/api\/drive\/stream\/[a-zA-Z0-9_-]{10,200}(?:[?#].*)?$/.test(value)) return value;

  try {
    const url = new URL(value);
    if (!['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'www.drive.google.com'].includes(url.hostname.toLowerCase())) return value;
    const segments = url.pathname.split('/').filter(Boolean);
    const dIndex = segments.indexOf('d');
    const fileId = (dIndex >= 0 ? segments[dIndex + 1] : '') || url.searchParams.get('id') || '';
    if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) return value;
    return `/api/drive/stream/${encodeURIComponent(fileId)}`;
  } catch {
    return value;
  }
}

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playAttemptRef = useRef(0);
  const radioModeRef = useRef(false);
  const radioPreviousSpeedRef = useRef<number | null>(null);
  const audioGraphRef = useRef<AudioContext | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const equalizerOwnerRef = useRef<string | null>(null);

  const [allSongs, setAllSongs] = useState<Song[]>(() => storage.getSongs(currentUser));
  const [adminAllSongs, setAdminAllSongs] = useState<Song[]>(() => storage.getAllAdminSongs());
  const [spotlightConfig, setSpotlightConfig] = useState<SpotlightConfig>(() => storage.getSpotlightConfig());
  const [autoTagRules, setAutoTagRules] = useState<AutoTagRule[]>(() => storage.getAutoTagRules());
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isShuffled, setIsShuffled] = useState<boolean>(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [isExpandedVisualizer, setIsExpandedVisualizer] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeedState] = useState<number>(1.0);
  const [equalizer, setEqualizerState] = useState<EqualizerSettings>(DEFAULT_EQUALIZER);
  const [isRadioMode, setIsRadioMode] = useState(false);

  const setPlaybackSpeed = useCallback((speed: number) => {
    if (radioModeRef.current) return;
    const clamped = Math.max(1.0, Math.min(3.0, Number(speed) || 1.0));
    setPlaybackSpeedState(clamped);
    if (audioRef.current) {
      audioRef.current.playbackRate = clamped;
    }
  }, []);

  const clearPlaybackError = useCallback(() => {
    setPlaybackError(null);
  }, []);

  const setEqualizer = useCallback((updates: Partial<EqualizerSettings>) => {
    setEqualizerState((current) => ({ ...current, ...updates }));
  }, []);

  useEffect(() => {
    const owner = currentUser?.id || 'guest';
    equalizerOwnerRef.current = null;
    try {
      const saved = JSON.parse(localStorage.getItem('yousong_equalizer_' + owner) || 'null');
      setEqualizerState(saved && typeof saved === 'object'
        ? { ...DEFAULT_EQUALIZER, ...saved, preset: String(saved.preset || 'Custom') }
        : DEFAULT_EQUALIZER);
    } catch {
      setEqualizerState(DEFAULT_EQUALIZER);
    }
    equalizerOwnerRef.current = owner;
  }, [currentUser?.id]);

  useEffect(() => {
    const owner = currentUser?.id || 'guest';
    if (equalizerOwnerRef.current !== owner) return;
    try { localStorage.setItem('yousong_equalizer_' + owner, JSON.stringify(equalizer)); } catch {}
    const filters = eqFiltersRef.current;
    const values = [equalizer.bass, equalizer.lowMid, equalizer.mid, equalizer.highMid, equalizer.treble];
    filters.forEach((filter, index) => { if (filter) filter.gain.setTargetAtTime(values[index], audioGraphRef.current?.currentTime || 0, 0.04); });
  }, [equalizer, currentUser?.id]);

  const handleTrackEndRef = useRef<() => void>(() => {});
  const currentSongRef = useRef<Song | null>(null);
  // The audio listeners below are created once, so they read the latest user role through a ref
  const userRoleRef = useRef<string | undefined>(currentUser?.role);
  userRoleRef.current = currentUser?.role;

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  // A suspension takes effect in an already-open tab too: stop playback and clear
  // the media element. The server also protects subsequent Drive range requests.
  useEffect(() => {
    if (!currentUser?.isSuspended || currentUser.role === 'admin') return;
    playAttemptRef.current += 1;
    radioModeRef.current = false;
    setIsRadioMode(false);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setCurrentSong(null);
    setIsPlaying(false);
    setPlaybackError('Your account has been suspended. Audio playback has been stopped.');
  }, [currentUser?.isSuspended, currentUser?.role]);

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    // One low-cost Web Audio chain gives every song the same user EQ without
    // creating a new graph on each track change.
    const WebAudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (WebAudioContext) {
      try {
        const graph = new WebAudioContext();
        const source = graph.createMediaElementSource(audio);
        const definitions: Array<{ type: BiquadFilterType; frequency: number; q?: number }> = [
          { type: 'lowshelf', frequency: 60 },
          { type: 'peaking', frequency: 250, q: 1 },
          { type: 'peaking', frequency: 1000, q: 1 },
          { type: 'peaking', frequency: 4000, q: 1 },
          { type: 'highshelf', frequency: 12000 },
        ];
        const filters = definitions.map((definition) => {
          const filter = graph.createBiquadFilter();
          filter.type = definition.type;
          filter.frequency.value = definition.frequency;
          filter.Q.value = definition.q || 0.8;
          filter.gain.value = 0;
          return filter;
        });
        source.connect(filters[0]);
        filters.forEach((filter, index) => filter.connect(filters[index + 1] || graph.destination));
        audioGraphRef.current = graph;
        eqFiltersRef.current = filters;
      } catch (error) {
        console.warn('Equalizer audio graph could not be initialized:', error);
      }
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        const measured = Math.round(audio.duration);
        setDuration(audio.duration);

        // Self-heal: If measured duration differs from song's labeled duration by >= 2 seconds, update it permanently!
        if (currentSongRef.current && measured > 0 && Math.abs((currentSongRef.current.duration || 0) - measured) >= 2) {
          console.log(`Self-healing duration for "${currentSongRef.current.title}": ${currentSongRef.current.duration}s -> ${measured}s`);
          const healed = currentSongRef.current;
          if (healed.id.startsWith('staging-')) {
            // Admin test play of a not-yet-published song: the test player saves it on the request
          } else if (userRoleRef.current === 'admin') {
            storage.updateSong(healed.id, { duration: measured });
          } else {
            // Any listener's player can supply the real length when the song only has a placeholder
            storage.reportSongDuration(healed.id, measured);
          }
        }
      }
    };

    const handleEnded = () => {
      handleTrackEndRef.current();
    };

    const handleError = () => {
      console.warn('Audio playback error for URL:', audio.src);
      setIsPlaying(false);
      if (currentSongRef.current) {
        const reason = 'The audio stream or file could not be loaded.';
        setPlaybackError(`Unable to play "${currentSongRef.current.title}". ${reason}`);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      eqFiltersRef.current = [];
      const graph = audioGraphRef.current;
      audioGraphRef.current = null;
      if (graph && graph.state !== 'closed') void graph.close().catch(() => undefined);
    };
  }, []);


  // Sync user data & subscribe to database changes
  useEffect(() => {
    const handleSync = () => {
      setAllSongs(storage.getSongs(currentUser));
      setAdminAllSongs(storage.getAllAdminSongs());
      setSpotlightConfig(storage.getSpotlightConfig());
      setAutoTagRules(storage.getAutoTagRules());
      if (currentUser) {
        setUserFavorites(storage.getUserFavorites(currentUser.id));
        setUserPlaylists(storage.getUserPlaylists(currentUser.id));
      } else {
        setUserFavorites([]);
        setUserPlaylists([]);
      }
    };

    handleSync();
    const unsubscribe = storage.subscribe(handleSync);
    return () => unsubscribe();
  }, [currentUser]);

  const refreshSongLibrary = useCallback(() => {
    setAllSongs(storage.getSongs(currentUser));
    setAdminAllSongs(storage.getAllAdminSongs());
    setSpotlightConfig(storage.getSpotlightConfig());
    setAutoTagRules(storage.getAutoTagRules());
  }, [currentUser]);

  const playSong = useCallback((song: Song, newQueue?: Song[]) => {
    if (radioModeRef.current || !audioRef.current) return;
    const audio = audioRef.current;
    const attemptId = ++playAttemptRef.current;

    // Do not start the audio request until the server has atomically reserved a listen.
    // The role and user identity come from the server-side session cookie, never the browser.
    void (async () => {
      setPlaybackError(null);
      radioModeRef.current = false;
      setIsRadioMode(false);
      if (currentUser) {
        const allowance = await storage.authorizeSongListen(song.id);
        if (attemptId !== playAttemptRef.current) return;
        if (!allowance.allowed) {
          // A denied next-track attempt should not falsely mark an already playing track as paused.
          setIsPlaying(!audio.paused);
          setPlaybackError(allowance.error || 'Your daily listen allowance could not be verified.');
          return;
        }
        if (currentUser.role !== 'admin') {
          // The API already updated canonical play counts and last-listened metadata.
          // This call updates this browser's copy only; it deliberately does not call the API again.
          storage.incrementSongPlay(song.id, currentUser.role, false);
          storage.recordSongListenLocally(currentUser.id, song.title, song.artist);
        }
      } else {
        if (attemptId !== playAttemptRef.current) return;
        setIsPlaying(false);
        setPlaybackError('Please log in to listen to songs.');
        return;
      }
      if (attemptId !== playAttemptRef.current) return;

      // The route is only set after authorization succeeds, so a denied listen never fetches audio.
      setCurrentSong(song);
      audio.src = getPlayableAudioUrl(song.audioUrl);
      audio.currentTime = 0;
      audio.playbackRate = playbackSpeed;
      setDuration(song.duration || 180);
      try {
        if (audioGraphRef.current?.state === 'suspended') await audioGraphRef.current.resume();
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('Playback play request was interrupted or could not play stream:', err);
        if (attemptId === playAttemptRef.current) {
          setIsPlaying(false);
          setPlaybackError(`Unable to play "${song.title}". The audio source may be unavailable or blocked.`);
        }
      }

      if (newQueue && attemptId === playAttemptRef.current) setQueue(newQueue.filter((s) => s.id !== song.id));
    })();
  }, [currentUser, playbackSpeed]);

  const handleTrackEnd = useCallback(() => {
    if (radioModeRef.current) {
      setIsPlaying(false);
      return; // The shared radio clock will supply the next track.
    }
    if (repeatMode === 'one') {
      if (currentSong) playSong(currentSong);
      return;
    }

    // 1. If queue has songs, automatically play the next song in the queue
    if (queue.length > 0) {
      const nextSong = queue[0];
      setQueue((prev) => prev.slice(1));
      playSong(nextSong);
      return;
    }

    // 2. Continuous playback: auto-play next song in the library/album so music never stops
    const playableSongs = allSongs.filter((s) => !s.isDroppingSoon);
    if (playableSongs.length > 0) {
      let nextIndex = 0;
      if (currentSong) {
        const currentIndex = playableSongs.findIndex((s) => s.id === currentSong.id);
        if (currentIndex !== -1) {
          nextIndex = (currentIndex + 1) % playableSongs.length;
        }
      }
      if (isShuffled) {
        nextIndex = Math.floor(Math.random() * playableSongs.length);
      }
      playSong(playableSongs[nextIndex]);
      return;
    }

    setIsPlaying(false);
  }, [repeatMode, queue, allSongs, currentSong, isShuffled, playSong]);

  const playRadioSong = useCallback(async (song: Song, elapsedSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || !song?.audioUrl) return;
    if (!radioModeRef.current) radioPreviousSpeedRef.current = audio.playbackRate || 1;
    radioModeRef.current = true;
    audio.playbackRate = 1;
    setIsRadioMode(true);
    const sourceUrl = getPlayableAudioUrl(song.audioUrl);
    let absoluteUrl = sourceUrl;
    try { absoluteUrl = new URL(sourceUrl, window.location.href).href; } catch {}
    const needsSource = audio.src !== absoluteUrl || currentSongRef.current?.id !== song.id;
    const attemptId = needsSource ? ++playAttemptRef.current : playAttemptRef.current;
    if (needsSource) {
      setPlaybackError(null);
      audio.pause();
      setCurrentSong(song);
      audio.src = sourceUrl;
      audio.load();
      // Start the play request immediately. This is important when the first call
      // comes from the user's Join click; waiting for metadata can lose autoplay permission.
      const graphResume = audioGraphRef.current?.state === 'suspended'
        ? audioGraphRef.current.resume().catch(() => undefined)
        : Promise.resolve();
      const playRequest = audio.play();
      await graphResume;
      await new Promise<void>((resolve) => {
        if (audio.readyState >= 1) return resolve();
        const done = () => resolve();
        audio.addEventListener('loadedmetadata', done, { once: true });
        audio.addEventListener('error', done, { once: true });
      });
      if (attemptId !== playAttemptRef.current || !radioModeRef.current) return;
      try { await playRequest; } catch {
        if (attemptId === playAttemptRef.current) {
          setIsPlaying(false);
          setPlaybackError('Radio audio could not start. Press Join to allow playback.');
        }
        return;
      }
    } else if (currentSongRef.current?.id !== song.id) {
      setCurrentSong(song);
    }

    if (attemptId !== playAttemptRef.current || !radioModeRef.current) return;
    const target = Math.max(0, Number(elapsedSeconds) || 0);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      // Polls are only clock corrections. Never reload/restart an already playing track.
      if (Math.abs(audio.currentTime - target) > 1.75) {
        try { audio.currentTime = Math.min(target, Math.max(0, audio.duration - 0.25)); } catch {}
      }
      setDuration(audio.duration);
    }
    if (audio.paused) {
      try {
        if (audioGraphRef.current?.state === 'suspended') await audioGraphRef.current.resume();
        await audio.play();
      } catch {
        if (attemptId === playAttemptRef.current) {
          setIsPlaying(false);
          setPlaybackError('Radio playback paused by the browser. Press Join to resume.');
        }
        return;
      }
    }
    if (attemptId === playAttemptRef.current) setIsPlaying(true);
  }, []);

  const pauseRadioPlayback = useCallback(() => {
    if (!radioModeRef.current) return;
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const leaveRadio = useCallback(() => {
    if (!radioModeRef.current) return;
    radioModeRef.current = false;
    setIsRadioMode(false);
    if (audioRef.current && radioPreviousSpeedRef.current !== null) {
      audioRef.current.playbackRate = radioPreviousSpeedRef.current;
      setPlaybackSpeedState(radioPreviousSpeedRef.current);
    }
    radioPreviousSpeedRef.current = null;
    playAttemptRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setCurrentSong(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, []);

  // Keep ref up to date on every render
  useEffect(() => {
    handleTrackEndRef.current = handleTrackEnd;
  });

  // Timer-based automations for songs:
  // Auto-remove limited edition songs when countdown timer expires
  // Auto-release unreleased teaser songs when release dropDate timer expires
  useEffect(() => {
    const checkSongAutomations = () => {
      const now = Date.now();
      const currentList = storage.getSongs();

      currentList.forEach((song) => {
        // 1. Auto-remove limited edition songs -> Schedule for deletion (invisible to listeners, admin purges)
        if (song.isLimitedEdition && song.autoRemoveOnExpire && song.limitedUntil) {
          const expireTime = new Date(song.limitedUntil).getTime();
          if (now >= expireTime && !song.isScheduledForDeletion) {
            console.log(`Timer reached: Scheduling limited song for deletion: ${song.title}`);
            storage.updateSong(song.id, {
              isScheduledForDeletion: true,
              scheduledDeletionAt: new Date().toISOString(),
              hiddenFrom: ['all'],
            });
            refreshSongLibrary();
          }
        }

        // 2. Auto-release unreleased teaser songs
        if (song.isDroppingSoon && song.autoReleaseOnDrop && song.dropDate) {
          const dropTime = new Date(song.dropDate).getTime();
          if (now >= dropTime) {
            console.log(`Timer reached: Auto-releasing teaser song: ${song.title}`);
            storage.updateSong(song.id, { isDroppingSoon: false });
            refreshSongLibrary();
          }
        }

        // 3. Expire custom badge timer
        if (song.badgeExpiresAt) {
          const badgeExp = new Date(song.badgeExpiresAt).getTime();
          if (now >= badgeExp) {
            storage.updateSong(song.id, { badgeType: 'none', badgeCustomText: undefined, badgeExpiresAt: undefined });
            refreshSongLibrary();
          }
        }
      });
    };

    const interval = setInterval(checkSongAutomations, 8000);
    return () => clearInterval(interval);
  }, [refreshSongLibrary]);

  const togglePlay = useCallback(() => {
    if (radioModeRef.current || !audioRef.current) return;
    const audio = audioRef.current;

    if (!currentSong && allSongs.length > 0) {
      playSong(allSongs[0]);
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.warn('Could not resume audio:', e));
    }
  }, [isPlaying, currentSong, allSongs, playSong]);

  const seek = useCallback((seconds: number) => {
    if (radioModeRef.current || !audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const setVolumeLevel = useCallback((vol: number) => {
    if (!audioRef.current) return;
    const clamped = Math.max(0, Math.min(1, vol));
    audioRef.current.volume = clamped;
    setVolume(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
      audioRef.current.muted = false;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    const newMuted = !isMuted;
    audioRef.current.muted = newMuted;
    setIsMuted(newMuted);
  }, [isMuted]);

  const toggleRepeat = useCallback(() => {
    if (radioModeRef.current) return;
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    if (radioModeRef.current) return;
    setIsShuffled((prev) => !prev);
  }, []);

  const playNext = useCallback(() => {
    if (radioModeRef.current) return;
    handleTrackEnd();
  }, [handleTrackEnd]);

  const playPrevious = useCallback(() => {
    if (radioModeRef.current || !audioRef.current || !currentSong) return;
    // If playback > 3s, rewind to start of current song
    if (audioRef.current.currentTime > 3) {
      seek(0);
      return;
    }
    const currentIndex = allSongs.findIndex((s) => s.id === currentSong.id);
    const prevIndex = (currentIndex - 1 + allSongs.length) % allSongs.length;
    playSong(allSongs[prevIndex]);
  }, [currentSong, allSongs, playSong, seek]);

  const addToQueue = useCallback((song: Song) => {
    setQueue((prev) => [...prev, song]);
  }, []);

  const removeFromQueue = useCallback((songId: string) => {
    setQueue((prev) => prev.filter((s) => s.id !== songId));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const toggleFavorite = useCallback((songId: string) => {
    if (!currentUser) return;
    storage.toggleFavorite(currentUser.id, songId);
    setUserFavorites(storage.getUserFavorites(currentUser.id));
  }, [currentUser]);

  const createPlaylist = useCallback((name: string, description?: string) => {
    if (!currentUser) throw new Error('Must be logged in');
    const pl = storage.createPlaylist(currentUser.id, name, description);
    setUserPlaylists(storage.getUserPlaylists(currentUser.id));
    return pl;
  }, [currentUser]);

  const addSongToPlaylist = useCallback((playlistId: string, songId: string) => {
    storage.addSongToPlaylist(playlistId, songId);
    if (currentUser) {
      setUserPlaylists(storage.getUserPlaylists(currentUser.id));
    }
  }, [currentUser]);

  const removeSongFromPlaylist = useCallback((playlistId: string, songId: string) => {
    storage.removeSongFromPlaylist(playlistId, songId);
    if (currentUser) {
      setUserPlaylists(storage.getUserPlaylists(currentUser.id));
    }
  }, [currentUser]);

  const deletePlaylist = useCallback((playlistId: string) => {
    storage.deletePlaylist(playlistId);
    if (currentUser) {
      setUserPlaylists(storage.getUserPlaylists(currentUser.id));
    }
  }, [currentUser]);

  const updatePlaylist = useCallback(async (playlistId: string, updates: Partial<Playlist>) => {
    const success = await storage.updatePlaylist(playlistId, updates);
    if (currentUser) {
      setUserPlaylists(storage.getUserPlaylists(currentUser.id));
    }
    return success;
  }, [currentUser]);

  // Admin controls
  const addNewSong = useCallback(async (songData: Omit<Song, 'id' | 'addedAt' | 'plays'>) => {
    const s = await storage.addSong(songData);
    refreshSongLibrary();
    return s;
  }, [refreshSongLibrary]);

  const updateSong = useCallback((id: string, updates: Partial<Song>) => {
    storage.updateSong(id, updates);
    refreshSongLibrary();
  }, [refreshSongLibrary]);

  const bulkUpdateSongs = useCallback(async (
    songIds: string[],
    updates: Partial<Song>,
    tagOperation?: { action: 'add' | 'remove' | 'set'; tags: string[] }
  ) => {
    const res = await storage.bulkUpdateSongs(songIds, updates, tagOperation);
    refreshSongLibrary();
    return res;
  }, [refreshSongLibrary]);

  const deleteSong = useCallback((id: string) => {
    storage.deleteSong(id);
    refreshSongLibrary();
    if (currentSong?.id === id) {
      playNext();
    }
  }, [refreshSongLibrary, currentSong, playNext]);

  const bulkDeleteSongs = useCallback(async (songIds: string[]) => {
    const res = await storage.bulkDeleteSongs(songIds);
    refreshSongLibrary();
    if (currentSong && songIds.includes(currentSong.id)) {
      playNext();
    }
    return res;
  }, [refreshSongLibrary, currentSong, playNext]);

  const resetSongPlays = useCallback(async (songId: string) => {
    const res = await storage.resetSongPlays(songId);
    refreshSongLibrary();
    return res;
  }, [refreshSongLibrary]);

  const bulkResetSongPlays = useCallback(async (ids?: string[]) => {
    const res = await storage.bulkResetSongPlays(ids);
    refreshSongLibrary();
    return res;
  }, [refreshSongLibrary]);

  const clearAllSongs = useCallback(() => {
    storage.clearAllSongs();
    refreshSongLibrary();
    if (isPlaying) {
      togglePlay();
    }
  }, [refreshSongLibrary, isPlaying, togglePlay]);

  const updateSpotlightConfig = useCallback(async (updates: Partial<SpotlightConfig>) => {
    const updated = await storage.updateSpotlightConfig(updates);
    setSpotlightConfig(updated);
    return updated;
  }, []);

  const updateAutoTagRules = useCallback(async (rules: AutoTagRule[]) => {
    await storage.updateAutoTagRules(rules);
    setAutoTagRules(storage.getAutoTagRules());
    refreshSongLibrary();
  }, [refreshSongLibrary]);

  const createAutoTagRule = useCallback(async (ruleData: Omit<AutoTagRule, 'id' | 'createdAt'>) => {
    const newRule = await storage.createAutoTagRule(ruleData);
    setAutoTagRules(storage.getAutoTagRules());
    refreshSongLibrary();
    return newRule;
  }, [refreshSongLibrary]);

  const updateAutoTagRule = useCallback(async (ruleId: string, updates: Partial<AutoTagRule>) => {
    const ok = await storage.updateAutoTagRule(ruleId, updates);
    setAutoTagRules(storage.getAutoTagRules());
    refreshSongLibrary();
    return ok;
  }, [refreshSongLibrary]);

  const deleteAutoTagRule = useCallback(async (ruleId: string) => {
    const ok = await storage.deleteAutoTagRule(ruleId);
    setAutoTagRules(storage.getAutoTagRules());
    refreshSongLibrary();
    return ok;
  }, [refreshSongLibrary]);

  const resetAutoTagRulesToDefault = useCallback(async () => {
    await storage.resetAutoTagRulesToDefault();
    setAutoTagRules(storage.getAutoTagRules());
    refreshSongLibrary();
  }, [refreshSongLibrary]);

  return (
    <AudioContext.Provider
      value={{
        currentSong,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        repeatMode,
        isShuffled,
        queue,
        allSongs,
        adminAllSongs,
        spotlightConfig,
        autoTagRules,
        userFavorites,
        userPlaylists,
        isExpandedVisualizer,
        playbackError,
        clearPlaybackError,
        playbackSpeed,
        setPlaybackSpeed,
        equalizer,
        setEqualizer,
        isRadioMode,
        playRadioSong,
        leaveRadio,
        pauseRadioPlayback,
        playSong,
        togglePlay,
        seek,
        setVolumeLevel,
        toggleMute,
        toggleRepeat,
        toggleShuffle,
        playNext,
        playPrevious,
        addToQueue,
        removeFromQueue,
        clearQueue,
        toggleFavorite,
        createPlaylist,
        addSongToPlaylist,
        removeSongFromPlaylist,
        deletePlaylist,
        updatePlaylist,
        setIsExpandedVisualizer,
        addNewSong,
        updateSong,
        deleteSong,
        bulkUpdateSongs,
        bulkDeleteSongs,
        resetSongPlays,
        bulkResetSongPlays,
        clearAllSongs,
        refreshSongLibrary,
        updateSpotlightConfig,
        updateAutoTagRules,
        createAutoTagRule,
        updateAutoTagRule,
        deleteAutoTagRule,
        resetAutoTagRulesToDefault,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
