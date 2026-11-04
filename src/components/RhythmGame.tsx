import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Gamepad2, Loader2, Medal, Music2, Play, RotateCcw, Trophy, Zap } from 'lucide-react';

type Difficulty = 'easy' | 'normal' | 'hard';
type GameSong = { id: string; title: string; artist: string; audioUrl: string; coverUrl: string; duration: number; gameBpm: number };
type RhythmNote = { id: string; lane: number; timeMs: number };
type RhythmChart = { notes: RhythmNote[]; durationMs: number; bpm: number; difficulty: Difficulty };
type HitRecord = { noteId: string; offsetMs: number };
type RhythmResult = { score: number; accuracy: number; maxCombo: number; totalNotes: number; hits: number };
type LeaderboardEntry = { rank: number; userId: string; username: string; bestScore: number; bestAccuracy: number; bestCombo: number; gamesPlayed: number };

const LANE_LABELS = ['←', '↓', '↑', '→'];
const LEAD_MS = 1800;
const PIXELS_PER_SECOND = 205;
const HIT_LINE_BOTTOM = 44;
const JUDGE_WINDOW_MS = 180;

async function rhythmRequest(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'The rhythm game request failed.');
  return data;
}

function playableAudioUrl(rawUrl: string): string {
  const value = String(rawUrl || '').trim();
  if (!value) return value;
  const streamPrefix = '/api/drive/stream/';
  if (value.startsWith(streamPrefix)) return value;
  const legacyPrefix = '/api/media/drive-stream/';
  if (value.startsWith(legacyPrefix)) {
    const fileId = value.slice(legacyPrefix.length).split(/[?#]/, 1)[0];
    if (/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return streamPrefix + encodeURIComponent(fileId);
  }
  try {
    const url = new URL(value);
    if (!['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'www.drive.google.com'].includes(url.hostname.toLowerCase())) return value;
    const segments = url.pathname.split('/').filter(Boolean);
    const dIndex = segments.indexOf('d');
    const fileId = (dIndex >= 0 ? segments[dIndex + 1] : '') || url.searchParams.get('id') || '';
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return value;
    return streamPrefix + encodeURIComponent(fileId);
  } catch {
    return value;
  }
}

function scoreGrade(offsetMs: number) {
  const absolute = Math.abs(offsetMs);
  if (absolute <= 45) return { name: 'SICK', points: 350 };
  if (absolute <= 90) return { name: 'GOOD', points: 200 };
  if (absolute <= 140) return { name: 'OK', points: 100 };
  return { name: 'BARELY', points: 50 };
}

export const RhythmGame: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const chartRef = useRef<RhythmChart | null>(null);
  const statusRef = useRef<Record<string, 'hit' | 'miss'>>({});
  const hitsRef = useRef<HitRecord[]>([]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const startedRef = useRef(false);
  const finishLockRef = useRef(false);
  const lastFrameRef = useRef(0);

  const [songs, setSongs] = useState<GameSong[]>([]);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [sessionId, setSessionId] = useState('');
  const [song, setSong] = useState<GameSong | null>(null);
  const [chart, setChart] = useState<RhythmChart | null>(null);
  const [status, setStatus] = useState<Record<string, 'hit' | 'miss'>>({});
  const [playheadMs, setPlayheadMs] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [misses, setMisses] = useState(0);
  const [judgement, setJudgement] = useState('');
  const [result, setResult] = useState<RhythmResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [catalogueError, setCatalogueError] = useState('');

  const selectedSong = useMemo(() => songs.find((item) => item.id === selectedSongId) || null, [songs, selectedSongId]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const data = await rhythmRequest('/api/games/rhythm/leaderboard');
      setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);
    } catch (err: any) {
      setError(err?.message || 'Could not load the rhythm leaderboard.');
    }
  }, []);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    setCatalogueError('');
    try {
      const data = await rhythmRequest('/api/games/rhythm/songs');
      const eligible = Array.isArray(data.songs) ? data.songs as GameSong[] : [];
      setSongs(eligible);
      setSelectedSongId((current) => eligible.some((item) => item.id === current) ? current : (eligible[0]?.id || ''));
    } catch (err: any) {
      setCatalogueError(err?.message || 'Could not load approved songs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSongs();
    void loadLeaderboard();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
    };
  }, [loadSongs, loadLeaderboard]);

  const stopAnimation = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startedRef.current = false;
    setPlaying(false);
  };

  const finishGame = useCallback(async () => {
    if (finishLockRef.current || !sessionId) return;
    finishLockRef.current = true;
    stopAnimation();
    audioRef.current?.pause();
    setPreparing(true);
    try {
      const data = await rhythmRequest('/api/games/rhythm/finish', {
        sessionId,
        hits: hitsRef.current,
      });
      setResult({
        score: Number(data.score) || 0,
        accuracy: Number(data.accuracy) || 0,
        maxCombo: Number(data.maxCombo) || 0,
        totalNotes: Number(data.totalNotes) || 0,
        hits: Number(data.hits) || 0,
      });
      setScore(Number(data.score) || 0);
      await loadLeaderboard();
    } catch (err: any) {
      setError(err?.message || 'Could not submit the game result.');
      finishLockRef.current = false;
    } finally {
      setPreparing(false);
    }
  }, [sessionId, loadLeaderboard]);

  const markLaneHit = useCallback((lane: number) => {
    const audio = audioRef.current;
    const activeChart = chartRef.current;
    if (!startedRef.current || !audio || !activeChart || finishLockRef.current) return;
    const nowMs = audio.currentTime * 1000;
    let closest: RhythmNote | null = null;
    let smallestOffset = Number.POSITIVE_INFINITY;

    for (const note of activeChart.notes) {
      if (note.lane !== lane || statusRef.current[note.id]) continue;
      const offset = nowMs - note.timeMs;
      const absolute = Math.abs(offset);
      if (absolute <= JUDGE_WINDOW_MS && absolute < smallestOffset) {
        closest = note;
        smallestOffset = absolute;
      }
    }

    if (!closest) {
      setJudgement('MISS');
      comboRef.current = 0;
      setCombo(0);
      setMisses((value) => value + 1);
      return;
    }

    const offsetMs = nowMs - closest.timeMs;
    const grade = scoreGrade(offsetMs);
    statusRef.current = { ...statusRef.current, [closest.id]: 'hit' };
    setStatus(statusRef.current);
    hitsRef.current.push({ noteId: closest.id, offsetMs: Math.round(offsetMs) });
    scoreRef.current += grade.points;
    comboRef.current += 1;
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
    setScore(scoreRef.current);
    setCombo(comboRef.current);
    setMaxCombo(maxComboRef.current);
    setJudgement(grade.name + '  +' + grade.points);
  }, []);

  const startPlaying = async () => {
    const audio = audioRef.current;
    if (!audio || !chart || !sessionId || preparing || result) return;
    setError('');
    try {
      audio.currentTime = 0;
      await audio.play();
      statusRef.current = {};
      hitsRef.current = [];
      scoreRef.current = 0;
      comboRef.current = 0;
      maxComboRef.current = 0;
      finishLockRef.current = false;
      startedRef.current = true;
      setStatus({});
      setPlayheadMs(0);
      setScore(0);
      setCombo(0);
      setMaxCombo(0);
      setMisses(0);
      setJudgement('GET READY!');
      setResult(null);
      setPlaying(true);
      lastFrameRef.current = 0;

      const frame = (timestamp: number) => {
        if (!startedRef.current) return;
        const currentAudio = audioRef.current;
        const activeChart = chartRef.current;
        if (!currentAudio || !activeChart) return;
        const currentMs = currentAudio.currentTime * 1000;
        let changed = false;
        for (const note of activeChart.notes) {
          if (!statusRef.current[note.id] && currentMs > note.timeMs + JUDGE_WINDOW_MS) {
            statusRef.current[note.id] = 'miss';
            comboRef.current = 0;
            setCombo(0);
            setMisses((value) => value + 1);
            changed = true;
          }
        }
        if (changed) setStatus({ ...statusRef.current });
        if (timestamp - lastFrameRef.current >= 33) {
          setPlayheadMs(currentMs);
          lastFrameRef.current = timestamp;
        }
        if (currentAudio.ended || currentMs >= activeChart.durationMs - 120) {
          void finishGame();
          return;
        }
        rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    } catch {
      setError('The audio could not start. Check that the selected song still has playable audio.');
      startedRef.current = false;
      setPlaying(false);
    }
  };

  useEffect(() => {
    chartRef.current = chart;
  }, [chart]);

  useEffect(() => {
    if (!playing) return;
    const keyHandler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const lane = key === 'arrowleft' || key === 'a' ? 0
        : key === 'arrowdown' || key === 's' ? 1
        : key === 'arrowup' || key === 'w' ? 2
        : key === 'arrowright' || key === 'd' ? 3
        : -1;
      if (lane < 0) return;
      event.preventDefault();
      if (!event.repeat) markLaneHit(lane);
    };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [playing, markLaneHit]);

  const prepareGame = async () => {
    if (!selectedSong || preparing) return;
    setPreparing(true);
    setError('');
    setResult(null);
    try {
      const data = await rhythmRequest('/api/games/rhythm/start', {
        songId: selectedSong.id,
        difficulty,
      });
      setSessionId(data.sessionId);
      setSong({ ...selectedSong, ...data.song });
      setChart(data.chart);
      chartRef.current = data.chart;
      setPlayheadMs(0);
      setScore(0);
      setCombo(0);
      setMaxCombo(0);
      setMisses(0);
      setJudgement('');
      statusRef.current = {};
      setStatus({});
      hitsRef.current = [];
      scoreRef.current = 0;
      comboRef.current = 0;
      maxComboRef.current = 0;
      finishLockRef.current = false;
    } catch (err: any) {
      setError(err?.message || 'Could not prepare the rhythm game.');
    } finally {
      setPreparing(false);
    }
  };

  const resetGame = () => {
    stopAnimation();
    audioRef.current?.pause();
    setSessionId('');
    setSong(null);
    setChart(null);
    setResult(null);
    setStatus({});
    statusRef.current = {};
    hitsRef.current = [];
    setPlayheadMs(0);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setMisses(0);
    setJudgement('');
    setError('');
    finishLockRef.current = false;
  };

  const visibleNotes = chart ? chart.notes.filter((note) => {
    if (status[note.id]) return false;
    const bottom = HIT_LINE_BOTTOM + ((note.timeMs - playheadMs) / 1000) * PIXELS_PER_SECOND;
    return bottom >= -22 && bottom <= 450;
  }) : [];

  const laneClasses = [
    'border-sky-400/25 bg-sky-500/10',
    'border-rose-400/25 bg-rose-500/10',
    'border-violet-400/25 bg-violet-500/10',
    'border-emerald-400/25 bg-emerald-500/10',
  ];
  const noteClasses = [
    'border-sky-300 bg-sky-400 text-slate-950 shadow-sky-500/40',
    'border-rose-300 bg-rose-400 text-slate-950 shadow-rose-500/40',
    'border-violet-300 bg-violet-400 text-slate-950 shadow-violet-500/40',
    'border-emerald-300 bg-emerald-400 text-slate-950 shadow-emerald-500/40',
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28 animate-in fade-in">
      <audio
        ref={audioRef}
        src={song?.audioUrl ? playableAudioUrl(song.audioUrl) : undefined}
        preload="auto"
        onEnded={() => { if (startedRef.current) void finishGame(); }}
        onError={() => { if (startedRef.current) setError('The track audio stream failed.'); }}
      />

      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-slate-950 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4 p-5 sm:p-7">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">
              <Zap className="h-3.5 w-3.5" /> YouSong Rhythm
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Rhythm Battle</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Hit the four lanes on the beat. Every track is hand-approved by an admin and uses its saved BPM.
            </p>
          </div>
          {onBack && !playing && (
            <button type="button" onClick={onBack} className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10">Back to Games</button>
          )}
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{error}</div>}
      {catalogueError && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{catalogueError}</div>}

      {!chart && !result && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Music2 className="h-5 w-5 text-cyan-500" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Choose your track</h2>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading Game Approved songs…</div>
            ) : songs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50 p-6 text-center dark:border-violet-400/20 dark:bg-violet-500/5">
                <Gamepad2 className="mx-auto h-8 w-8 text-violet-500" />
                <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">No songs approved yet</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">An admin must open a song in Admin → Song Management and turn on Game Approved. Unapproved tracks cannot be played here.</p>
                <button type="button" onClick={loadSongs} className="mt-4 rounded-xl border border-violet-300 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-400/30 dark:text-violet-200">Refresh songs</button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {songs.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedSongId(item.id)}
                      className={'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ' + (selectedSongId === item.id ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-500/10' : 'border-slate-200 bg-slate-50 hover:border-cyan-300 dark:border-white/10 dark:bg-white/[0.03]')}
                    >
                      {item.coverUrl ? <img src={item.coverUrl} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-200 text-slate-500 dark:bg-white/10"><Music2 className="h-5 w-5" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{item.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{item.artist}</span>
                      </span>
                      <span className="shrink-0 text-right text-[10px] font-semibold text-slate-500 dark:text-slate-400">{item.gameBpm} BPM</span>
                      {selectedSongId === item.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-500" />}
                    </button>
                  ))}
                </div>
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Difficulty</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(['easy', 'normal', 'hard'] as Difficulty[]).map((value) => (
                      <button key={value} type="button" onClick={() => setDifficulty(value)} className={'rounded-xl border px-3 py-2.5 text-xs font-extrabold capitalize transition ' + (difficulty === value ? 'border-cyan-400 bg-cyan-500 text-slate-950' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300')}>
                        {value}
                        <span className="mt-0.5 block text-[9px] font-medium opacity-75">{value === 'easy' ? 'Every 2 beats' : value === 'normal' ? 'Every beat' : 'Double-time notes'}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={prepareGame} disabled={!selectedSong || preparing} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
                    {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                    Prepare Rhythm Battle
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/80">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">How to play</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Notes fall toward the matching arrow at the bottom. Press the matching keyboard arrow or A / S / W / D when the note reaches the target.</p>
              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {LANE_LABELS.map((label, index) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-100 py-2 text-center text-lg font-black text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white">{label}<span className="mt-1 block text-[9px] font-semibold text-slate-400">{['A','S','W','D'][index]}</span></div>)}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/80">
              <div className="mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /><h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Rhythm leaderboard</h3></div>
              {leaderboard.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">No completed rhythm scores yet.</p> : leaderboard.slice(0, 5).map((entry) => <div key={entry.userId} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0 dark:border-white/[0.06]"><span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-300">{entry.rank}. {entry.username}</span><span className="ml-2 text-xs font-black tabular-nums text-cyan-600 dark:text-cyan-300">{entry.bestScore.toLocaleString()}</span></div>)}
              <button type="button" onClick={loadLeaderboard} className="mt-3 text-[10px] font-bold text-cyan-600 hover:underline dark:text-cyan-300">Refresh leaderboard</button>
            </div>
          </aside>
        </section>
      )}

      {chart && song && !result && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/80">
            <div className="flex min-w-0 items-center gap-3">
              {song.coverUrl ? <img src={song.coverUrl} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10"><Music2 className="h-5 w-5" /></div>}
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-slate-900 dark:text-white">{song.title}</div>
                <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{song.artist} · {chart.bpm} BPM · {chart.difficulty.toUpperCase()}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-center">
              <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/5"><div className="text-[9px] uppercase text-slate-400">Score</div><div className="text-sm font-black tabular-nums text-cyan-600 dark:text-cyan-300">{score.toLocaleString()}</div></div>
              <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/5"><div className="text-[9px] uppercase text-slate-400">Combo</div><div className="text-sm font-black tabular-nums text-violet-600 dark:text-violet-300">{combo}x</div></div>
              <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/5"><div className="text-[9px] uppercase text-slate-400">Misses</div><div className="text-sm font-black tabular-nums text-rose-600 dark:text-rose-300">{misses}</div></div>
            </div>
          </div>

          {!playing && !result && (
            <div className="rounded-2xl border border-cyan-300/30 bg-cyan-50 p-5 text-center dark:border-cyan-400/20 dark:bg-cyan-500/5">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Ready?</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The chart is ready. Start the track when you are ready to play.</p>
              <button type="button" onClick={startPlaying} disabled={preparing} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-extrabold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"><Play className="h-4 w-4 fill-current" /> Start the music</button>
            </div>
          )}

          {playing && (
            <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-3 shadow-2xl sm:p-5">
              <div className="mx-auto max-w-3xl">
                <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <span>Hit the arrows on the beat</span>
                  <span>{Math.min(100, Math.round((playheadMs / chart.durationMs) * 100))}%</span>
                </div>
                <div className="relative grid h-[440px] grid-cols-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
                  {LANE_LABELS.map((label, lane) => (
                    <div key={label} className={'relative border-r border-white/10 last:border-r-0 ' + laneClasses[lane]}>
                      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,.15) 50%, transparent 100%)' }} />
                    </div>
                  ))}
                  {visibleNotes.map((note) => {
                    const bottom = HIT_LINE_BOTTOM + ((note.timeMs - playheadMs) / 1000) * PIXELS_PER_SECOND;
                    return (
                      <div
                        key={note.id}
                        className={'pointer-events-none absolute z-10 flex h-9 w-[19%] items-center justify-center rounded-lg border-2 text-xl font-black shadow-lg ' + noteClasses[note.lane]}
                        style={{ left: (note.lane * 25 + 3) + '%', bottom: String(Math.round(bottom)) + 'px' }}
                      >
                        {LANE_LABELS[note.lane]}
                      </div>
                    );
                  })}
                  {LANE_LABELS.map((label, lane) => (
                    <div key={'target-' + lane} className={'absolute bottom-0 top-0 flex w-1/4 flex-col items-center justify-end border-r border-white/10 last:border-r-0 ' + (lane === 0 ? 'left-0' : lane === 1 ? 'left-1/4' : lane === 2 ? 'left-2/4' : 'left-3/4')}>
                      <div className={'mb-[42px] flex h-10 w-[76%] items-center justify-center rounded-xl border-2 text-2xl font-black ' + noteClasses[lane]}>{label}</div>
                    </div>
                  ))}
                  <div className="pointer-events-none absolute bottom-[62px] left-0 right-0 border-t border-dashed border-white/40" />
                  {judgement && <div className="pointer-events-none absolute left-0 right-0 top-5 z-20 text-center text-xl font-black tracking-widest text-white drop-shadow-lg">{judgement}</div>}
                  {combo >= 5 && <div className="pointer-events-none absolute bottom-28 left-0 right-0 z-20 text-center text-2xl font-black text-white/70">{combo} COMBO</div>}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {LANE_LABELS.map((label, lane) => (
                    <button key={'pad-' + lane} type="button" onPointerDown={(event) => { event.preventDefault(); markLaneHit(lane); }} className={'rounded-xl border py-3 text-xl font-black text-white transition active:scale-95 sm:hidden ' + laneClasses[lane]}>{label}</button>
                  ))}
                </div>
                <div className="mt-2 text-center text-[10px] text-slate-500">Keyboard: ← ↓ ↑ → or A S W D · Notes missed after they pass the target</div>
              </div>
            </div>
          )}

          {preparing && <div className="flex items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Saving your score…</div>}
        </section>
      )}

      {result && (
        <section className="rounded-3xl border border-cyan-400/25 bg-slate-950 p-6 text-center text-white shadow-xl sm:p-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950"><Trophy className="h-8 w-8" /></div>
          <h2 className="mt-4 text-2xl font-black">Track cleared!</h2>
          <p className="mt-1 text-xs text-slate-400">{song?.title || 'Rhythm Battle'} · {chart?.difficulty.toUpperCase()}</p>
          <div className="mt-4 text-5xl font-black tabular-nums text-cyan-300">{result.score.toLocaleString()}</div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3"><div className="text-[9px] uppercase text-slate-400">Accuracy</div><div className="mt-1 text-lg font-black">{result.accuracy.toFixed(1)}%</div></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3"><div className="text-[9px] uppercase text-slate-400">Max combo</div><div className="mt-1 text-lg font-black">{result.maxCombo}x</div></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3"><div className="text-[9px] uppercase text-slate-400">Hit notes</div><div className="mt-1 text-lg font-black">{result.hits}/{result.totalNotes}</div></div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={resetGame} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-xs font-extrabold text-slate-950 hover:bg-cyan-400"><RotateCcw className="h-4 w-4" /> Play another track</button>
            {onBack && <button type="button" onClick={onBack} className="rounded-xl border border-white/15 px-4 py-3 text-xs font-bold text-slate-200 hover:bg-white/5">Back to Games</button>}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /><div><h2 className="text-base font-extrabold text-slate-900 dark:text-white">Rhythm leaderboard</h2><p className="text-[11px] text-slate-500 dark:text-slate-400">Best saved score per player</p></div></div>
        {leaderboard.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">No completed rhythm games yet. Be the first!</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[470px] text-left text-xs">
              <thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 dark:border-white/10"><th className="px-2 py-2">Rank</th><th className="px-2 py-2">Player</th><th className="px-2 py-2 text-right">Best score</th><th className="px-2 py-2 text-right">Accuracy</th><th className="px-2 py-2 text-right">Games</th></tr></thead>
              <tbody>{leaderboard.map((entry) => <tr key={entry.userId} className="border-b border-slate-100 last:border-0 dark:border-white/[0.06]"><td className="px-2 py-3"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 font-black text-slate-600 dark:bg-white/5 dark:text-slate-300">{entry.rank === 1 ? <Medal className="h-4 w-4 text-amber-500" /> : entry.rank}</span></td><td className="px-2 py-3 font-bold text-slate-800 dark:text-slate-200">{entry.username}</td><td className="px-2 py-3 text-right font-black tabular-nums text-cyan-600 dark:text-cyan-300">{entry.bestScore.toLocaleString()}</td><td className="px-2 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{entry.bestAccuracy.toFixed(1)}%</td><td className="px-2 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{entry.gamesPlayed}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[10px] text-slate-400">Use the closest accurate hit timing to earn higher points. Scores are calculated and saved on YouSong&apos;s server.</p>
      </section>
    </div>
  );
};
