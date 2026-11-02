import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CalendarClock, Clock3, Headphones, Loader2, Music2, Radio, Send, ShieldCheck, Users } from 'lucide-react';
import type { Song } from '../types';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { MediaCover } from './MediaCover';

type Program = { name: string; description?: string; songIds: string[]; startsAt?: string | null };
type Station = {
  enabled: boolean; stationName: string; stationDescription: string;
  currentProgram: Program | null; currentSong: Song | null; playlist?: Song[];
  currentIndex: number; elapsedSeconds: number; nextProgram: Program | null;
  nextStartsInMs: number | null; serverNow: string; autoStartScheduled?: boolean; paused?: boolean; loopPlaylist?: boolean; playbackRate?: number; syncRevision?: number;
};
type Message = { id: string; userId: string; username: string; message: string; createdAt: string };

const asLocalTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
};
const timeLeft = (raw: number) => {
  const total = Math.max(0, Math.floor(raw / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? h + 'h ' + m + 'm ' + s + 's' : m + 'm ' + s + 's';
};
const formatTrackTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

export const RadioView: React.FC<{ active: boolean }> = ({ active }) => {
  const { currentUser, isAdmin, allUsers } = useAuth();
  const { adminAllSongs, allSongs, joinRadioPlayback, playRadioSong, leaveRadio, playbackError, clearPlaybackError, getRadioAudioDiagnostics } = useAudio();
  const [joined, setJoined] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const previousStationClockRef = useRef<{ songId: string | null; paused: boolean | null; syncRevision: number | null }>({ songId: null, paused: null, syncRevision: null });
  const chatFetchInFlight = useRef(false);
  const stationFetchInFlight = useRef(false);
  const [station, setStation] = useState<Station | null>(null);
  const latestStationServerTimeRef = useRef(0);
  // NTP-style samples map the server epoch clock to this tab's monotonic performance clock.
  const serverClockOffsetRef = useRef<number | null>(null);
  const clockSamplesRef = useRef<Array<{ rtt: number; offset: number }>>([]);
  const [bestClockRttMs, setBestClockRttMs] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState<number | null>(null);
  const [seekDraft, setSeekDraft] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [messages, setMessages] = useState<Message[]>([]);
  const [canChat, setCanChat] = useState(true);
  const [message, setMessage] = useState('');
  const [chatError, setChatError] = useState('');
  const [sending, setSending] = useState(false);

  const [stationName, setStationName] = useState('YouSong Radio');
  const [stationDescription, setStationDescription] = useState('');
  const [programName, setProgramName] = useState('Now Playing');
  const [programDescription, setProgramDescription] = useState('');
  const [currentIds, setCurrentIds] = useState<string[]>([]);
  const [nextName, setNextName] = useState('');
  const [nextDescription, setNextDescription] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [nextIds, setNextIds] = useState<string[]>([]);
  const [autoStartScheduled, setAutoStartScheduled] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [bannedIds, setBannedIds] = useState<string[]>([]);
  const [banTarget, setBanTarget] = useState('');
  const [banSaving, setBanSaving] = useState(false);
  const [banError, setBanError] = useState('');
  const [banReason, setBanReason] = useState('');
  const loadedProgramKey = useRef('');

  useEffect(() => {
    if (joined && playbackError) {
      setError(playbackError);
      setSyncing(false);
    }
  }, [joined, playbackError]);

  // A reload must not silently re-join: browsers require a fresh user gesture
  // before starting audio, otherwise listeners appear joined but hear nothing.
  useEffect(() => {
    setJoined(false);
    setSyncing(false);
    previousStationClockRef.current = { songId: null, paused: null, syncRevision: null };
    leaveRadio();
  }, [currentUser?.id, leaveRadio]);

  const refreshStation = useCallback(async () => {
    if (stationFetchInFlight.current) return;
    stationFetchInFlight.current = true;
    try {
      const requestStartedAt = performance.now();
      const response = await fetch('/api/radio/state', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      const receivedAt = performance.now();
      if (!response.ok || !data.success) throw new Error(data.error || 'Radio is unavailable.');
      const state = data.state as Station;
      const serverTime = Date.parse(state.serverNow || '');
      // Reject stale responses, but never compare the server clock to the device clock.
      if (Number.isFinite(serverTime) && serverTime < latestStationServerTimeRef.current) return;
      if (Number.isFinite(serverTime)) {
        latestStationServerTimeRef.current = serverTime;
        const rtt = Math.max(0, receivedAt - requestStartedAt);
        const midpoint = (requestStartedAt + receivedAt) / 2;
        const measuredOffset = serverTime - midpoint;
        clockSamplesRef.current = [...clockSamplesRef.current, { rtt, offset: measuredOffset }]
          .sort((a, b) => a.rtt - b.rtt)
          .slice(0, 8);
        // Keep the lowest-latency samples; their midpoint error bound is the smallest.
        const best = clockSamplesRef.current[0];
        const previousOffset = serverClockOffsetRef.current;
        const nextOffset = previousOffset === null
          ? best.offset
          : Math.abs(best.offset - previousOffset) > 750
            ? best.offset
            : previousOffset * 0.8 + best.offset * 0.2;
        serverClockOffsetRef.current = nextOffset;
        setBestClockRttMs(best.rtt);
        setClockOffsetMs(nextOffset);
      }
      setStation(state);
      setError('');
      const nextSongId = state.currentSong?.id || null;
      const previousClock = previousStationClockRef.current;
      const trackChanged = Boolean(nextSongId && previousClock.songId !== nextSongId);
      const broadcastResumed = previousClock.paused === true && state.paused === false;
      const currentRevision = Number(state.syncRevision) || 0;
      const timelineChanged = previousClock.syncRevision !== null && previousClock.syncRevision !== currentRevision;
      previousStationClockRef.current = { songId: nextSongId, paused: Boolean(state.paused), syncRevision: currentRevision };

      if (joined && state.enabled && state.currentSong) {
        const rate = Math.min(2, Math.max(0.5, Number(state.playbackRate) || 1));
        const offset = serverClockOffsetRef.current || 0;
        const ageSinceSnapshot = state.paused || !Number.isFinite(serverTime)
          ? 0
          : Math.max(0, (performance.now() + offset - serverTime) / 1000) * rate;

        if (state.paused) {
          if (trackChanged || previousClock.paused !== true || timelineChanged) {
            void joinRadioPlayback(state.currentSong, state.elapsedSeconds, true, rate);
          }
        } else if (trackChanged || broadcastResumed || timelineChanged) {
          // Every listener chooses the same future server-clock boundary. This avoids
          // each browser starting a newly loaded song at a different network-arrival time.
          const estimatedServerNow = performance.now() + offset;
          const syncAtServerMs = Math.ceil((estimatedServerNow + 5500) / 5000) * 5000;
          const snapshotTime = Number.isFinite(serverTime) ? serverTime : estimatedServerNow;
          const targetAtSync = state.elapsedSeconds + Math.max(0, (syncAtServerMs - snapshotTime) / 1000) * rate;
          setSyncing(true);
          void playRadioSong(state.currentSong, targetAtSync, rate, syncAtServerMs - offset)
            .finally(() => setSyncing(false));
        } else {
          void playRadioSong(state.currentSong, state.elapsedSeconds + ageSinceSnapshot, rate);
        }
      } else if (joined) {
        setJoined(false);
        setSyncing(false);
        setMessages([]);
        leaveRadio();
      } else if (!state.enabled) {
        setMessages([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not connect to the station.');
    } finally {
      stationFetchInFlight.current = false;
    }
  }, [joined, playRadioSong, joinRadioPlayback, leaveRadio]);

  useEffect(() => {
    if (!active && !joined) return;
    void refreshStation();
    // Polling supplies fresh authoritative state; actual starts are aligned to a shared server-clock barrier.
    const timer = window.setInterval(() => void refreshStation(), 1000);
    return () => window.clearInterval(timer);
  }, [active, refreshStation, joined]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const refreshChat = useCallback(async () => {
    if (!joined || chatFetchInFlight.current) return;
    chatFetchInFlight.current = true;
    try {
      const response = await fetch('/api/radio/chat', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Chat could not load.');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setCanChat(data.canChat !== false || isAdmin);
      setChatError(data.canChat === false && !isAdmin
        ? data.banReason === 'radio-chat-ban'
          ? (data.banNote ? 'Radio chat access was removed: ' + data.banNote : 'An administrator has banned this account from radio chat.')
          : 'An administrator has disabled chat access for this account.'
        : '');
    } catch (e: any) {
      setChatError(e?.message || 'Radio chat is unavailable.');
    } finally {
      chatFetchInFlight.current = false;
    }
  }, [joined, isAdmin]);

  useEffect(() => {
    if (!active || !joined) return;
    void refreshChat();
    const timer = window.setInterval(() => void refreshChat(), 2000);
    return () => window.clearInterval(timer);
  }, [active, joined, refreshChat]);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const configRes = await fetch('/api/admin/radio/config', { credentials: 'same-origin' });
        const configData = await configRes.json().catch(() => ({}));
        const config = configData.config;
        if (config) {
          setStationName(config.stationName || 'YouSong Radio');
          setStationDescription(config.stationDescription || '');
          setProgramName(config.currentProgram?.name || 'Now Playing');
          setProgramDescription(config.currentProgram?.description || '');
          setCurrentIds(Array.isArray(config.currentProgram?.songIds) ? config.currentProgram.songIds : []);
          setNextName(config.nextProgram?.name || '');
          setNextDescription(config.nextProgram?.description || '');
          setNextAt(asLocalTime(config.nextProgram?.startsAt));
          setNextIds(Array.isArray(config.nextProgram?.songIds) ? config.nextProgram.songIds : []);
          setAutoStartScheduled(config.autoStartScheduled !== false);
        }
      } catch { /* Retryable when the admin opens the control room again. */ }
    })();
  }, [isAdmin]);

  const refreshBanList = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const response = await fetch('/api/admin/radio/chat-bans', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load the radio ban list.');
      setBannedIds(Array.isArray(data.bannedUserIds) ? data.bannedUserIds.map(String) : []);
      setBanError('');
    } catch (e: any) {
      setBanError(e?.message || 'Could not load the radio ban list.');
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void refreshBanList();
    const timer = window.setInterval(() => void refreshBanList(), 8000);
    return () => window.clearInterval(timer);
  }, [isAdmin, refreshBanList]);

  useEffect(() => {
    if (!isAdmin || !station?.currentProgram) return;
    const key = station.currentProgram.name + ':' + (station.currentProgram.songIds || []).join(',');
    if (loadedProgramKey.current && loadedProgramKey.current !== key) {
      setProgramName(station.currentProgram.name || 'Now Playing');
      setProgramDescription(station.currentProgram.description || '');
      setCurrentIds(Array.isArray(station.currentProgram.songIds) ? station.currentProgram.songIds : []);
      if (!station.nextProgram) {
        setNextName('');
        setNextDescription('');
        setNextAt('');
        setNextIds([]);
      }
    }
    loadedProgramKey.current = key;
  }, [isAdmin, station?.currentProgram?.name, station?.currentProgram?.songIds?.join(',')]);

  const pool = isAdmin ? adminAllSongs : allSongs;
  const filteredSongs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pool.filter((song) => !term || [song.title, song.artist, song.genre, song.mediaCode].join(' ').toLowerCase().includes(term));
  }, [pool, search]);

  const setSelected = (ids: string[], setter: (value: string[]) => void, id: string) => {
    setter(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  };

  const join = () => {
    if (!station?.enabled || !station.currentSong || !currentUser?.id) return;
    setJoined(true);
    setError('');
    clearPlaybackError();
    const rate = Math.min(2, Math.max(0.5, Number(station.playbackRate) || 1));
    const snapshotServerTime = Date.parse(station.serverNow || '');
    const offset = serverClockOffsetRef.current || 0;
    if (station.paused) {
      setSyncing(false);
      void joinRadioPlayback(station.currentSong, station.elapsedSeconds, true, rate);
      previousStationClockRef.current = { songId: station.currentSong.id, paused: true, syncRevision: Number(station.syncRevision) || 0 };
      return;
    }

    // Buffer first, then start on a shared five-second server-clock boundary.
    // The audio engine seeks to the position the station will be at when that
    // boundary arrives, so network and decode time are hidden before listeners hear it.
    const estimatedServerNow = performance.now() + offset;
    const syncAtServerMs = Math.ceil((estimatedServerNow + 5500) / 5000) * 5000;
    const snapshotTime = Number.isFinite(snapshotServerTime) ? snapshotServerTime : estimatedServerNow;
    const currentAge = Math.max(0, (estimatedServerNow - snapshotTime) / 1000) * rate;
    const elapsedAtSync = station.elapsedSeconds + currentAge + Math.max(0, (syncAtServerMs - estimatedServerNow) / 1000) * rate;
    const syncAtLocalEpochMs = syncAtServerMs - offset;

    setSyncing(true);
    previousStationClockRef.current = { songId: station.currentSong.id, paused: false, syncRevision: Number(station.syncRevision) || 0 };
    void joinRadioPlayback(station.currentSong, elapsedAtSync, false, rate, syncAtLocalEpochMs)
      .catch((error: any) => setError(error?.message || 'Radio could not synchronize.'))
      .finally(() => setSyncing(false));
  };
  const leave = () => {
    setJoined(false);
    setSyncing(false);
    leaveRadio();
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = message.trim();
    if (!clean || !canChat || sending) return;
    setSending(true);
    setChatError('');
    try {
      const response = await fetch('/api/radio/chat', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: clean }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        if (response.status === 403) setCanChat(false);
        throw new Error(data.error || 'Message was not sent.');
      }
      setMessage('');
      if (data.message) setMessages((current) => [...current, data.message as Message].slice(-60));
    } catch (e: any) { setChatError(e?.message || 'Could not send message.'); }
    finally { setSending(false); }
  };

  const saveConfig = async (enabled: boolean, startNow: boolean) => {
    if (enabled && !currentIds.length) { setAdminNote('Choose at least one song for the current program.'); return; }
    let scheduled: Program | null = null;
    if (nextName.trim() || nextIds.length || nextAt) {
      const date = nextAt ? new Date(nextAt) : null;
      if (!nextName.trim() || !nextIds.length || !date || !Number.isFinite(date.getTime())) {
        setAdminNote('To schedule the next program, enter its name, choose its songs, and set a start time.'); return;
      }
      if (date.getTime() <= Date.now()) { setAdminNote('The next program must start in the future.'); return; }
      scheduled = { name: nextName.trim(), description: nextDescription.trim(), songIds: nextIds, startsAt: date.toISOString() };
    }
    setSaving(true);
    setAdminNote('');
    try {
      const response = await fetch('/api/admin/radio/config', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled, startNow, stationName, stationDescription,
          currentProgram: { name: programName, description: programDescription, songIds: currentIds },
          nextProgram: scheduled,
          autoStartScheduled,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save radio configuration.');
      setAdminNote(enabled ? 'Broadcast started. Listeners share the same playback clock.' : 'Broadcast stopped. Radio chat has been cleared.');
      void refreshStation();
    } catch (e: any) { setAdminNote(e?.message || 'Could not save the station.'); }
    finally { setSaving(false); }
  };

  const controlRadio = async (
    action: 'toggle-pause' | 'next' | 'toggle-loop' | 'seek' | 'set-speed',
    extra: Record<string, number> = {}
  ) => {
    setSaving(true);
    setAdminNote('');
    try {
      const requestStartedAt = performance.now();
      const response = await fetch('/api/admin/radio/control', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Radio control failed.');
      const confirmedState = data.state as Station;
      if (confirmedState) {
        const receivedAt = performance.now();
        const confirmedServerTime = Date.parse(confirmedState.serverNow || '');
        if (Number.isFinite(confirmedServerTime)) {
          latestStationServerTimeRef.current = Math.max(latestStationServerTimeRef.current, confirmedServerTime);
          const rtt = Math.max(0, receivedAt - requestStartedAt);
          const measuredOffset = confirmedServerTime - (requestStartedAt + receivedAt) / 2;
          clockSamplesRef.current = [...clockSamplesRef.current, { rtt, offset: measuredOffset }]
            .sort((a, b) => a.rtt - b.rtt)
            .slice(0, 8);
          const best = clockSamplesRef.current[0];
          const previousOffset = serverClockOffsetRef.current;
          const nextOffset = previousOffset === null
            ? best.offset
            : Math.abs(best.offset - previousOffset) > 750
              ? best.offset
              : previousOffset * 0.8 + best.offset * 0.2;
          serverClockOffsetRef.current = nextOffset;
          setBestClockRttMs(best.rtt);
          setClockOffsetMs(nextOffset);
        }
        setStation(confirmedState);
        previousStationClockRef.current = {
          songId: confirmedState.currentSong?.id || null,
          paused: Boolean(confirmedState.paused),
          syncRevision: Number(confirmedState.syncRevision) || 0,
        };
        if (joined && confirmedState.enabled && confirmedState.currentSong) {
          const rate = Math.min(2, Math.max(0.5, Number(confirmedState.playbackRate) || 1));
          if (confirmedState.paused) {
            void joinRadioPlayback(confirmedState.currentSong, confirmedState.elapsedSeconds, true, rate);
          } else if (['next', 'seek', 'set-speed'].includes(action) || (action === 'toggle-pause' && !confirmedState.paused)) {
            const offset = serverClockOffsetRef.current || 0;
            const serverTime = Date.parse(confirmedState.serverNow || '');
            const estimatedServerNow = Date.now() + offset;
            const syncAtServerMs = Math.ceil((estimatedServerNow + 5500) / 5000) * 5000;
            const snapshotTime = Number.isFinite(serverTime) ? serverTime : estimatedServerNow;
            const targetAtSync = confirmedState.elapsedSeconds + Math.max(0, (syncAtServerMs - snapshotTime) / 1000) * rate;
            setSyncing(true);
            void playRadioSong(confirmedState.currentSong, targetAtSync, rate, syncAtServerMs - offset)
              .finally(() => setSyncing(false));
          } else {
            void playRadioSong(confirmedState.currentSong, confirmedState.elapsedSeconds, rate);
          }
        }
      }
      if (action === 'next') setAdminNote('Skipped to the next song.');
      else if (action === 'toggle-loop') setAdminNote(confirmedState?.loopPlaylist ? 'Playlist looping enabled.' : 'Playlist looping disabled.');
      else if (action === 'seek') setAdminNote('Broadcast position updated for every listener.');
      else if (action === 'set-speed') setAdminNote(`Broadcast speed set to ${Number(confirmedState?.playbackRate || 1).toFixed(2)}x for everyone.`);
      else setAdminNote(confirmedState?.paused ? 'Broadcast paused for everyone.' : 'Broadcast resumed for everyone.');
    } catch (e: any) { setAdminNote(e?.message || 'Could not control the broadcast.'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (!isSeeking) setSeekDraft(Math.max(0, Number(station?.elapsedSeconds) || 0));
  }, [station?.currentSong?.id, station?.elapsedSeconds, isSeeking]);

  const commitRadioSeek = () => {
    if (!station?.enabled || !station.currentSong) return;
    setIsSeeking(false);
    void controlRadio('seek', { positionSeconds: seekDraft });
  };

  const updateBan = async (userId: string, banned: boolean) => {
    if (!userId || banSaving) return;
    setBanSaving(true);
    setBanError('');
    try {
      const response = await fetch('/api/admin/radio/chat-ban', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, banned, reason: banned ? banReason.trim() : '' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not change radio chat access.');
      setBannedIds(Array.isArray(data.bannedUserIds) ? data.bannedUserIds.map(String) : []);
      setBanTarget('');
      setBanReason('');
      setBanError('Saved. Radio chat permissions have been updated in the persistent database.');
      void refreshChat();
    } catch (e: any) { setBanError(e?.message || 'Could not update radio chat ban.'); }
    finally { setBanSaving(false); }
  };

  if (!active) return <div className="hidden" aria-hidden="true" />;
  const scheduledStart = station?.nextProgram?.startsAt && station.nextStartsInMs !== null
    ? new Date(station.serverNow).getTime() + (station.nextStartsInMs || 0) : null;
  const countdown = scheduledStart === null ? null : Math.max(0, scheduledStart - clock);

  const picker = (ids: string[], setter: (value: string[]) => void) => (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {filteredSongs.map((song) => (
          <label key={song.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-slate-200 hover:bg-white/[0.06]">
            <input type="checkbox" checked={ids.includes(song.id)} onChange={() => setSelected(ids, setter, song.id)} className="accent-cyan-500" />
            <span className="min-w-0 flex-1 truncate">{song.title} <span className="text-slate-500">— {song.artist}</span></span>
          </label>
        ))}
        {!filteredSongs.length && <p className="p-3 text-center text-[10px] text-slate-500">No matching songs.</p>}
      </div>
      <p className="mt-2 text-[9px] text-slate-500">{ids.length} selected. The admin picker includes unpublished songs.</p>
    </div>
  );

  return (
    <section className="ys-radio-view space-y-4 pb-28">
      <div className="ys-radio-hero rounded-2xl border border-cyan-400/20 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-cyan-300"><Radio className="h-4 w-4" /> Live station</div>
            <h1 className="mt-1 text-xl font-bold text-white">{station?.stationName || 'YouSong Radio'}</h1>
            <p className="mt-1 text-xs text-slate-300">{station?.stationDescription || 'A shared radio station curated by the admin.'}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${station?.enabled ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/10 text-slate-300'}`}>{station?.enabled ? (station.paused ? 'Ⅱ PAUSED' : '● ON AIR') : '○ OFF AIR'}</span>
            {joined
              ? <button type="button" onClick={leave} className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-200">Leave radio</button>
              : <button type="button" onClick={join} disabled={!station?.enabled || !station.currentSong} className="rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-[10px] font-bold text-cyan-100 disabled:opacity-40"><Headphones className="mr-1 inline h-3.5 w-3.5" /> Join radio</button>}
          </div>
        </div>
        {error && <p className="mt-3 text-[11px] text-rose-300">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
          {station?.currentSong?.coverUrl ? <div className="h-14 w-14 overflow-hidden rounded-lg"><MediaCover src={station.currentSong.coverUrl} alt={station.currentSong.title} fallbackTitle={station.currentSong.title} fallbackGenre={station.currentSong.genre} /></div> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/10 text-cyan-200"><Music2 className="h-6 w-6" /></div>}
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Now playing · {station?.currentProgram?.name || 'No program'}</div>
            <div className="truncate text-sm font-bold text-white">{station?.currentSong?.title || 'No broadcast running'}</div>
            <div className="truncate text-[11px] text-slate-300">{station?.currentSong?.artist || 'Waiting for the admin to start the station.'}</div>
          </div>
          {countdown !== null && <div className="rounded-lg bg-indigo-400/10 px-3 py-2 text-[10px] text-indigo-200"><Clock3 className="mr-1 inline h-3.5 w-3.5" /> Next program in {timeLeft(countdown)}</div>}
        </div>
        {joined && <div className="mt-2 text-[10px] text-emerald-200">{syncing ? '◌ Buffering and synchronizing to the station clock…' : '● Tuned in — the broadcast continues when you change tabs.'}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {isAdmin && <details className="rounded-2xl border border-amber-400/25 bg-slate-950 p-4 text-white" open>
            <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-sm font-bold"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-300" /> Radio control room</span><span className="text-[9px] font-normal text-slate-400">Admin only</span></summary>
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[10px] text-slate-300">Station name<input value={stationName} onChange={(e) => setStationName(e.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white" /></label>
                <label className="text-[10px] text-slate-300">Station description<input value={stationDescription} onChange={(e) => setStationDescription(e.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white" /></label>
                <label className="text-[10px] text-slate-300">Current program<input value={programName} onChange={(e) => setProgramName(e.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white" /></label>
                <label className="text-[10px] text-slate-300">Program description<input value={programDescription} onChange={(e) => setProgramDescription(e.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white" /></label>
              </div>
              <div><div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase text-slate-300"><span>Current playlist · {currentIds.length} chosen</span><button type="button" onClick={() => setCurrentIds([])} className="font-normal normal-case text-slate-400">Clear</button></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all songs, including unpublished…" className="mb-2 w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white" />{picker(currentIds, setCurrentIds)}</div>
              <div className="space-y-2 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-100"><CalendarClock className="h-4 w-4" /> Schedule next list</div>
                <label className="flex items-center gap-2 text-[10px] text-indigo-100"><input type="checkbox" checked={autoStartScheduled} onChange={(e) => setAutoStartScheduled(e.target.checked)} className="accent-cyan-500" /> Automatically start the broadcast when the scheduled time arrives</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[10px] text-slate-300">Next program name<input value={nextName} onChange={(e) => setNextName(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white" /></label>
                  <label className="text-[10px] text-slate-300">Start time<input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white" /></label>
                </div>
                <label className="block text-[10px] text-slate-300">Description<input value={nextDescription} onChange={(e) => setNextDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white" /></label>
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-indigo-100"><span>Next playlist · {nextIds.length} chosen</span><button type="button" onClick={() => { setNextIds([]); setNextName(''); setNextAt(''); setNextDescription(''); }} className="font-normal text-slate-400">Clear schedule</button></div>
                {picker(nextIds, setNextIds)}
              </div>
              {station?.enabled && <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={() => void controlRadio('toggle-pause')} className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold text-amber-100">{station.paused ? 'Resume broadcast' : 'Pause broadcast'}</button>
                  <button type="button" disabled={saving} onClick={() => void controlRadio('next')} className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-semibold text-cyan-100">Next song</button>
                  <button type="button" disabled={saving} onClick={() => void controlRadio('toggle-loop')} className={`rounded-lg border px-3 py-2 text-[10px] font-semibold ${station.loopPlaylist ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}>Loop playlist: {station.loopPlaylist ? 'On' : 'Off'}</button>
                </div>
                {station.currentSong && <div className="space-y-2 border-t border-white/10 pt-3">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-slate-300">
                    <span className="font-semibold text-white">Broadcast position</span>
                    <span className="font-mono tabular-nums">{formatTrackTime(isSeeking ? seekDraft : station.elapsedSeconds)} / {formatTrackTime(station.currentSong.durationExact || station.currentSong.duration || 0)}</span>
                  </div>
                  <input
                    type="range" min={0} max={Math.max(1, station.currentSong.durationExact || station.currentSong.duration || 180)} step={0.05}
                    value={Math.min(Math.max(0, isSeeking ? seekDraft : station.elapsedSeconds), Math.max(1, station.currentSong.durationExact || station.currentSong.duration || 180))}
                    onChange={(event) => { setSeekDraft(Number(event.target.value)); setIsSeeking(true); }}
                    onPointerUp={commitRadioSeek} onKeyUp={commitRadioSeek}
                    disabled={saving}
                    className="w-full accent-cyan-400 cursor-pointer disabled:opacity-40"
                    aria-label="Set broadcast song position for all listeners"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[10px] font-semibold text-slate-300" htmlFor="radio-master-speed">Master playback speed</label>
                    <select id="radio-master-speed" value={String(station.playbackRate || 1)} disabled={saving}
                      onChange={(event) => void controlRadio('set-speed', { playbackRate: Number(event.target.value) })}
                      className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-[11px] text-white disabled:opacity-40">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate.toFixed(rate % 1 ? 2 : 1)}x</option>)}
                    </select>
                  </div>
                </div>}
              </div>}
              {adminNote && <p className="text-[10px] text-cyan-200">{adminNote}</p>}
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Radio clock diagnostics</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-slate-300">
                  <span>Best RTT: {bestClockRttMs === null ? '—' : bestClockRttMs.toFixed(1) + ' ms'}</span>
                  <span>Server offset: {clockOffsetMs === null ? '—' : (clockOffsetMs >= 0 ? '+' : '') + clockOffsetMs.toFixed(1) + ' ms'}</span>
                  <span>Output queue: {getRadioAudioDiagnostics().outputQueueMs} ms</span>
                  <span>Base latency: {getRadioAudioDiagnostics().outputLatencyMs} ms</span>
                  <span>Audio engine: {getRadioAudioDiagnostics().graphState}</span>
                  <span>Output timestamp: {getRadioAudioDiagnostics().outputTimestampAvailable ? 'available' : 'fallback'}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={saving} onClick={() => void saveConfig(true, true)} className="rounded-lg bg-cyan-500 px-3 py-2 text-[10px] font-bold text-slate-950 disabled:opacity-50">{saving ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <Radio className="mr-1 inline h-3 w-3" />} Start / restart broadcast</button>
                <button type="button" disabled={saving || !nextAt || !nextIds.length} onClick={() => void saveConfig(Boolean(station?.enabled), false)} className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold text-indigo-200 disabled:opacity-40"><CalendarClock className="mr-1 inline h-3 w-3" /> Save schedule only</button>
                <button type="button" disabled={saving} onClick={() => void saveConfig(false, false)} className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[10px] font-semibold text-rose-200">Stop broadcast</button>
              </div>
            </div>
          </details>}
          {isAdmin && <section className="rounded-2xl border border-rose-400/20 bg-slate-950 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2 text-xs font-bold"><Ban className="h-4 w-4 text-rose-300" /> Radio chat bans</div><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Manage radio-specific chat bans here. This remains available even when you have not joined the broadcast. Account-wide Chat Access restrictions are also enforced.</p></div>
              <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[9px] text-rose-200">{bannedIds.length} banned</span>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select value={banTarget} onChange={(event) => setBanTarget(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white">
                <option value="">Select a member account…</option>
                {allUsers.filter((user) => user.role !== 'admin').map((user) => <option key={user.id} value={user.id}>@{user.username}{bannedIds.includes(user.id) ? ' · BANNED' : ''}</option>)}
              </select>
              <input value={banReason} onChange={(event) => setBanReason(event.target.value)} maxLength={300} placeholder="Optional reason shown to the banned member" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
              <button type="button" disabled={!banTarget || banSaving} onClick={() => void updateBan(banTarget, !bannedIds.includes(banTarget))}
                className={`rounded-lg px-3 py-2 text-[10px] font-bold text-white disabled:opacity-40 ${bannedIds.includes(banTarget) ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
                {banSaving ? 'Saving…' : bannedIds.includes(banTarget) ? 'Unban selected user' : 'Ban selected user'}
              </button>
            </div>
            {banError && <p className="mt-2 text-[10px] text-rose-300">{banError}</p>}
            {bannedIds.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{bannedIds.map((id) => {
              const user = allUsers.find((item) => item.id === id);
              return <button key={id} type="button" disabled={banSaving} onClick={() => void updateBan(id, false)} className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[10px] text-rose-100 hover:bg-emerald-500/15 disabled:opacity-40" title="Click to remove this radio-chat ban">{user ? '@' + user.username : id.slice(0, 12)} ×</button>;
            })}</div>}
          </section>}
        </div>

        {joined ? <aside className="ys-radio-chat flex min-h-[440px] max-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3 dark:border-white/10"><div><div className="text-xs font-bold text-slate-900 dark:text-white">Radio chat</div><div className="text-[10px] text-slate-500">Live listener conversation</div></div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] text-emerald-600 dark:text-emerald-300">LIVE</span></div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">{messages.length ? messages.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/[0.035]"><div className="text-[10px] font-bold text-cyan-700 dark:text-cyan-300">@{item.username}</div><div className="mt-0.5 break-words text-[11px] text-slate-700 dark:text-slate-200">{item.message}</div></div>) : <p className="py-8 text-center text-[11px] text-slate-500">No messages yet. Start the conversation.</p>}</div>
          {chatError && <p className="px-3 pb-2 text-[10px] text-rose-500">{chatError}</p>}
          {canChat ? <form onSubmit={sendMessage} className="border-t border-slate-200 p-2.5 dark:border-white/10"><div className="flex gap-2"><input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Say something…" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" /><button type="submit" disabled={!message.trim() || sending} className="rounded-lg bg-cyan-600 px-3 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button></div></form> : <p className="border-t border-rose-400/20 bg-rose-500/[0.06] p-3 text-[10px] text-rose-600 dark:text-rose-300">An administrator has disabled your radio chat access. You can still listen.</p>}

        </aside> : <aside className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/80 p-5 text-center dark:border-white/10 dark:bg-slate-950/50"><Headphones className="h-8 w-8 text-cyan-500" /><h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">Tune in to join the conversation</h3><p className="mt-1 max-w-xs text-[11px] text-slate-500">Join the live station to hear the shared broadcast and unlock listener chat.</p></aside>}
      </div>
    </section>
  );
};
