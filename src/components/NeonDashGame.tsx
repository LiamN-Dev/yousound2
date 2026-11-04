import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, AudioLines, CheckCircle2, Crown, Music2, Pause, Play, RotateCcw, Search, Sparkles, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';

type Difficulty = 'easy' | 'normal' | 'hard';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
type Phase = 'catalogue' | 'loading' | 'playing' | 'paused' | 'dead' | 'complete';
type Song = { id: string; title: string; artist: string; audioUrl: string; coverUrl: string; duration: number; gameBpm: number; gameBeatOffsetMs: number; };
type ObstacleType = 'spike' | 'double' | 'block' | 'gap' | 'orb';
type Obstacle = { id: number; time: number; type: ObstacleType; width: number; height: number; };

const W = 1000;
const H = 520;
const GROUND = 404;
const PLAYER_X = 205;
const CUBE = 38;
const BEST_PREFIX = 'ys-song-dash-best-v2';
const DIFFICULTIES: { id: Difficulty; label: string; multiplier: number; pattern: number }[] = [
  { id: 'easy', label: 'Chill', multiplier: .91, pattern: 0 },
  { id: 'normal', label: 'Standard', multiplier: 1, pattern: 1 },
  { id: 'hard', label: 'Insane', multiplier: 1.13, pattern: 2 },
];

function apiAudioUrl(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return value;
  if (value.startsWith('/api/drive/stream/')) return value;
  const legacy = value.match(/^\/api\/media\/drive-stream\/([A-Za-z0-9_-]{10,200})/);
  if (legacy) return '/api/drive/stream/' + encodeURIComponent(legacy[1]);
  try {
    const url = new URL(value);
    if (!['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'www.drive.google.com'].includes(url.hostname.toLowerCase())) return value;
    const segments = url.pathname.split('/').filter(Boolean);
    const d = segments.indexOf('d');
    const id = (d >= 0 ? segments[d + 1] : '') || url.searchParams.get('id') || '';
    return /^[A-Za-z0-9_-]{10,200}$/.test(id) ? '/api/drive/stream/' + encodeURIComponent(id) : value;
  } catch { return value; }
}
function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
function createSongLevel(song: Song, difficulty: Difficulty, beatEnergy: number[] = []): { obstacles: Obstacle[]; speed: number; bpm: number; beatSeconds: number } {
  const mode = DIFFICULTIES.find(item => item.id === difficulty)!;
  const bpm = Math.max(60, Math.min(240, Number(song.gameBpm) || 120));
  const beatSeconds = 60 / bpm;
  const speed = Math.max(245, Math.min(500, bpm * 2.05)) * mode.multiplier;
  const random = seeded(stableHash(song.id + ':' + difficulty));
  const totalBeats = Math.floor((song.duration - 1) / beatSeconds);
  const startBeat = 2;
  const obstacles: Obstacle[] = [];
  const basePattern: (ObstacleType | 'none')[] = mode.pattern === 0
    ? ['spike', 'none', 'block', 'none', 'spike', 'none', 'orb', 'none']
    : mode.pattern === 1
      ? ['spike', 'none', 'block', 'spike', 'double', 'none', 'orb', 'block']
      : ['spike', 'double', 'none', 'block', 'spike', 'orb', 'gap', 'block'];
  let id = 0;
  for (let beat = startBeat; beat < totalBeats; beat++) {
    const patternIndex = (beat - startBeat) % basePattern.length;
    let type = basePattern[patternIndex];
    const energy = beatEnergy[beat] ?? (0.42 + random() * 0.38);
    const dynamicThreshold = mode.pattern === 0 ? .66 : mode.pattern === 1 ? .48 : .32;
    if (type === 'none' && energy > dynamicThreshold && random() > (mode.pattern === 0 ? .72 : .35)) type = energy > .82 ? 'double' : 'spike';
    if (type !== 'none' && energy < (mode.pattern === 0 ? .18 : .1) && random() > .16) type = 'none';
    if (type === 'none') continue;
    const time = Math.max(0, Number(song.gameBeatOffsetMs) / 1000) + beat * beatSeconds;
    if (time >= song.duration - .25) continue;
    const width = type === 'double' ? 82 : type === 'block' ? 48 : type === 'gap' ? 92 : type === 'orb' ? 34 : 40;
    const height = type === 'block' ? 57 : type === 'orb' ? 34 : 43;
    obstacles.push({ id: id++, time, type, width, height });
    if (mode.pattern === 2 && beat % 8 === 5 && random() > .6) {
      const extraTime = time + beatSeconds * .48;
      if (extraTime < song.duration - .2) obstacles.push({ id: id++, time: extraTime, type: 'spike', width: 38, height: 42 });
    }
  }
  return { obstacles, speed, bpm, beatSeconds };
}
async function analyzeSongRhythm(song: Song): Promise<number[]> {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return [];
  const response = await fetch(apiAudioUrl(song.audioUrl), { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Could not read the track for rhythm mapping (' + response.status + ').');
  const bytes = await response.arrayBuffer();
  const context: AudioContext = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const samples = decoded.getChannelData(0);
    const hop = 512, windowSize = 1024;
    const maxSamples = Math.min(samples.length, decoded.sampleRate * Math.min(180, song.duration));
    const energy: number[] = [];
    for (let start = 0; start + windowSize < maxSamples; start += hop) {
      let sum = 0;
      for (let i = start; i < start + windowSize; i += 4) sum += samples[i] * samples[i];
      energy.push(Math.sqrt(sum / (windowSize / 4)));
    }
    const onset = energy.map((value, index) => index ? Math.max(0, value - energy[index - 1]) : 0);
    const average = onset.reduce((sum, value) => sum + value, 0) / Math.max(1, onset.length);
    for (let i = 0; i < onset.length; i++) onset[i] = Math.max(0, onset[i] - average * .55);
    const framesPerSecond = decoded.sampleRate / hop;
    const beatSeconds = 60 / clamp(Number(song.gameBpm) || 120, 60, 240);
    const offsetSeconds = clamp(Number(song.gameBeatOffsetMs) || 0, 0, 2000) / 1000;
    const beatCount = Math.ceil(Math.min(180, song.duration) / beatSeconds);
    const raw: number[] = [];
    for (let beat = 0; beat < beatCount; beat++) {
      const frame = Math.round((offsetSeconds + beat * beatSeconds) * framesPerSecond);
      let peak = 0;
      for (let sample = Math.max(0, frame - 3); sample <= Math.min(onset.length - 1, frame + 3); sample++) peak = Math.max(peak, onset[sample] || 0);
      // Include a half-beat accent so syncopated tracks generate syncopated hazards.
      const offbeatFrame = Math.round((offsetSeconds + (beat + .5) * beatSeconds) * framesPerSecond);
      for (let sample = Math.max(0, offbeatFrame - 2); sample <= Math.min(onset.length - 1, offbeatFrame + 2); sample++) peak = Math.max(peak, (onset[sample] || 0) * .72);
      raw.push(peak);
    }
    const sorted = [...raw].sort((a, b) => a - b);
    const peak = raw.length ? Math.max(...raw) : 0;
    if (peak < .00001) return [];
    const scale = sorted[Math.floor(sorted.length * .88)] || peak;
    return raw.map(value => clamp(value / Math.max(scale, .00001), 0, 1));
  } finally {
    await context.close().catch(() => undefined);
  }
}
function bestKey(songId: string, difficulty: Difficulty) { return BEST_PREFIX + ':' + songId + ':' + difficulty; }
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, x: number, palette: { main: string; glow: string }, time: number) {
  const floor = GROUND;
  ctx.save();
  ctx.shadowColor = palette.glow; ctx.shadowBlur = 12;
  if (obstacle.type === 'spike' || obstacle.type === 'double') {
    const count = obstacle.type === 'double' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const ox = x + i * 40;
      ctx.fillStyle = '#ff5d87'; ctx.beginPath(); ctx.moveTo(ox, floor); ctx.lineTo(ox + 20, floor - obstacle.height); ctx.lineTo(ox + 40, floor); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffc1d2'; ctx.beginPath(); ctx.moveTo(ox + 11, floor - 19); ctx.lineTo(ox + 20, floor - obstacle.height + 7); ctx.lineTo(ox + 25, floor - 16); ctx.closePath(); ctx.fill();
    }
  } else if (obstacle.type === 'block') {
    ctx.fillStyle = palette.main; ctx.fillRect(x, floor - obstacle.height, obstacle.width, obstacle.height);
    ctx.fillStyle = 'rgba(255,255,255,.24)'; ctx.fillRect(x + 4, floor - obstacle.height + 4, obstacle.width - 8, 6); ctx.fillRect(x + 4, floor - obstacle.height + 4, 5, obstacle.height - 8);
    ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, floor - obstacle.height + 2, obstacle.width - 4, obstacle.height - 4);
  } else if (obstacle.type === 'gap') {
    ctx.shadowBlur = 0; ctx.fillStyle = '#080b22'; ctx.fillRect(x, floor - 2, obstacle.width, 45);
    ctx.fillStyle = palette.main; ctx.fillRect(x, floor - 5, obstacle.width, 4); ctx.fillRect(x, floor + 38, obstacle.width, 3);
  } else {
    const pulse = 1 + Math.sin(time * 7) * .07;
    ctx.translate(x + 17, floor - 51); ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#ffd568'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,212,102,.16)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff1b4'; ctx.fillRect(-3, -3, 6, 6);
  }
  ctx.restore();
}
function drawScene(ctx: CanvasRenderingContext2D, song: Song, playhead: number, progress: number, player: { y: number; rotation: number }, obstacles: Obstacle[], speed: number, palette: { main: string; glow: string }, phase: Phase, now: number) {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#091126'); bg.addColorStop(.52, '#201447'); bg.addColorStop(1, '#3b174d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // Beat-driven skyline and parallax stars.
  const scroll = (playhead * speed * .16) % 160;
  for (let i = 0; i < 13; i++) {
    const x = i * 92 - scroll;
    ctx.fillStyle = i % 2 ? 'rgba(89,93,178,.23)' : 'rgba(66,91,152,.28)';
    ctx.fillRect(x, 190 + (i % 3) * 24, 50, GROUND - 190 - (i % 3) * 24);
    ctx.fillStyle = 'rgba(215,222,255,.28)';
    for (let w = 0; w < 3; w++) for (let h = 0; h < 4; h++) ctx.fillRect(x + 9 + w * 13, 207 + (i % 3) * 24 + h * 16, 4, 5);
  }
  for (let i = 0; i < 90; i++) {
    const x = ((i * 127 - playhead * speed * .06) % W + W) % W;
    const y = (i * 53) % 275;
    ctx.fillStyle = 'rgba(225,235,255,' + (.16 + (i % 5) * .1) + ')'; ctx.fillRect(x, y, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
  }
  const beatPhase = (playhead / (60 / Math.max(60, song.gameBpm))) % 1;
  const pulse = Math.max(0, 1 - beatPhase) * .12;
  ctx.fillStyle = palette.glow; ctx.globalAlpha = pulse; ctx.fillRect(0, 0, W, GROUND); ctx.globalAlpha = 1;
  // Ground tiles are segmented so the level appears to scroll with the song.
  ctx.fillStyle = '#171b40'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = palette.main; ctx.globalAlpha = .9; ctx.fillRect(0, GROUND, W, 5); ctx.globalAlpha = 1;
  const tileScroll = (playhead * speed) % 60;
  for (let x = -tileScroll; x < W; x += 60) {
    ctx.strokeStyle = 'rgba(155,171,255,.13)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, GROUND + 5); ctx.lineTo(x - 22, H); ctx.stroke();
  }
  // Waveform bars pulse on every beat and make the selected song visibly drive the level.
  for (let i = 0; i < 48; i++) {
    const t = i / 48;
    const x = 18 + t * (W - 36);
    const bar = 5 + (Math.abs(Math.sin((i * 2.31) + playhead * Math.PI * song.gameBpm / 30)) * 28);
    ctx.fillStyle = i / 48 < progress ? palette.main : 'rgba(255,255,255,.22)';
    ctx.fillRect(x, H - 22 - bar, 5, bar);
  }
  for (const obstacle of obstacles) {
    const x = PLAYER_X + (obstacle.time - playhead) * speed;
    if (x > -120 && x < W + 120) drawObstacle(ctx, obstacle, x, palette, playhead);
  }
  // Cube has a thick outline, beveled face and rotating core.
  ctx.save(); ctx.translate(PLAYER_X + CUBE / 2, player.y + CUBE / 2); ctx.rotate(player.rotation);
  ctx.shadowColor = palette.glow; ctx.shadowBlur = 24;
  ctx.fillStyle = palette.main; roundedRect(ctx, -CUBE / 2, -CUBE / 2, CUBE, CUBE, 4); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#f5f4ff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-14, -14, 12, 5); ctx.fillRect(-14, -14, 5, 12);
  ctx.fillStyle = '#10112d'; ctx.fillRect(-10, -3, 6, 7); ctx.fillRect(5, -3, 6, 7);
  ctx.fillStyle = '#fff'; ctx.fillRect(-9, -3, 2, 3); ctx.fillRect(6, -3, 2, 3);
  ctx.restore();
  // Track strip / HUD.
  ctx.fillStyle = 'rgba(6,10,27,.72)'; roundedRect(ctx, 18, 17, 440, 62, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.fillText(song.title.toUpperCase().slice(0, 37), 34, 42);
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '11px system-ui'; ctx.fillText(song.artist + '  ·  ' + song.gameBpm + ' BPM', 34, 62);
  ctx.fillStyle = 'rgba(255,255,255,.14)'; roundedRect(ctx, W - 284, 28, 250, 9, 5); ctx.fill();
  ctx.fillStyle = palette.main; roundedRect(ctx, W - 284, 28, 250 * progress, 9, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'right'; ctx.fillText(Math.floor(progress * 100) + '%', W - 36, 55); ctx.textAlign = 'left';
  if (phase === 'paused') { ctx.fillStyle = 'rgba(5,8,24,.55)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.font = '900 42px system-ui'; ctx.textAlign = 'center'; ctx.fillText('PAUSED', W / 2, H / 2); ctx.textAlign = 'left'; }
}
export const NeonDashGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('catalogue');
  const playerRef = useRef({ y: GROUND - CUBE, vy: 0, rotation: 0, grounded: true, lastBeat: -1 });
  const playheadRef = useRef(0);
  const progressRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const speedRef = useRef(300);
  const hitRef = useRef(false);
  const [phase, setPhaseState] = useState<Phase>('catalogue');
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [search, setSearch] = useState('');
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [catalogueError, setCatalogueError] = useState('');
  const [gameError, setGameError] = useState('');
  const [loadingMessage, setLoadingMessage] = useState('Preparing level…');
  const rhythmCache = useRef<Record<string, number[]>>({});
  const [progress, setProgress] = useState(0);
  const [best, setBest] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const selectedSong = songs.find(song => song.id === selectedSongId) || null;
  const soundRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);
  soundOnRef.current = soundOn;
  const palettes = [
    { main: '#42dcff', glow: '#15bfff' },
    { main: '#ef76dc', glow: '#ff4fa9' },
    { main: '#9bff90', glow: '#60f59f' },
    { main: '#ffcf68', glow: '#ff9c48' },
    { main: '#b1a0ff', glow: '#8d6dff' },
  ];
  const palette = palettes[stableHash(selectedSong?.id || 'yousong') % palettes.length];

  const setPhase = (next: Phase) => { phaseRef.current = next; setPhaseState(next); };
  const playSound = (frequency: number) => {
    if (!soundOnRef.current) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!soundRef.current) soundRef.current = new AC();
      const ac = soundRef.current; if (ac.state === 'suspended') void ac.resume();
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = 'square'; osc.frequency.value = frequency; gain.gain.setValueAtTime(.04, ac.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .1);
      osc.connect(gain); gain.connect(ac.destination); osc.start(); osc.stop(ac.currentTime + .11);
    } catch {}
  };

  useEffect(() => () => {
    audioRef.current?.pause();
    if (soundRef.current) void soundRef.current.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingSongs(true);
    void (async () => {
      try {
        const response = await fetch('/api/games/rhythm/songs', { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not load Game Approved songs.');
        const available = (Array.isArray(data.songs) ? data.songs : []) as Song[];
        if (!cancelled) { setSongs(available); setSelectedSongId(available[0]?.id || ''); }
      } catch (error: any) { if (!cancelled) setCatalogueError(error?.message || 'Could not load songs.'); }
      finally { if (!cancelled) setLoadingSongs(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedSongId) return;
    try { setBest(Number(localStorage.getItem(bestKey(selectedSongId, difficulty))) || 0); } catch { setBest(0); }
  }, [selectedSongId, difficulty]);

  function bestKey(songId: string, mode: Difficulty) { return BEST_PREFIX + ':' + songId + ':' + mode; }

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  const jump = useCallback(() => {
    if (phaseRef.current !== 'playing' || hitRef.current) return;
    const player = playerRef.current;
    if (player.grounded) {
      player.vy = -735; player.grounded = false; playSound(710); return;
    }
    const now = playheadRef.current;
    const nearbyOrb = obstaclesRef.current.find(o => o.type === 'orb' && Math.abs(PLAYER_X + (o.time - now) * speedRef.current - (PLAYER_X + CUBE / 2)) < 55 && Math.abs(player.y - (GROUND - 75)) < 95);
    if (nearbyOrb && player.lastBeat !== nearbyOrb.id) { player.vy = -690; player.lastBeat = nearbyOrb.id; playSound(1000); }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === ' ' || key === 'arrowup' || key === 'w') { event.preventDefault(); jump(); }
      if (key === 'p') {
        if (phaseRef.current === 'playing') { audioRef.current?.pause(); setPhase('paused'); }
        else if (phaseRef.current === 'paused') { void audioRef.current?.play().then(() => setPhase('playing')).catch(() => setGameError('Audio could not resume.')); }
      }
      if (key === 'escape' && phaseRef.current !== 'catalogue') { stopAudio(); setPhase('catalogue'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump]);

  const startLevel = async () => {
    if (!selectedSong) return;
    setGameError(''); setLoadingMessage('Analyzing the song rhythm…'); setPhase('loading'); hitRef.current = false; setProgress(0); progressRef.current = 0;
    try {
      let beatEnergy = rhythmCache.current[selectedSong.id];
      if (!beatEnergy) {
        try { beatEnergy = await analyzeSongRhythm(selectedSong); rhythmCache.current[selectedSong.id] = beatEnergy; }
        catch (analysisError) { console.warn('[SongDash] Beat energy analysis fallback:', analysisError); beatEnergy = []; }
      }
      setLoadingMessage('Building a level from the beat map…');
      let level = createSongLevel(selectedSong, difficulty, beatEnergy);
      // Sparse quiet sections should not accidentally produce an unplayable empty chart.
      if (level.obstacles.length < 4 && beatEnergy.length) level = createSongLevel(selectedSong, difficulty, []);
      if (level.obstacles.length < 4) throw new Error('This track is too short to make a complete level. Choose a longer song.');
      stopAudio();
      const audio = new Audio(apiAudioUrl(selectedSong.audioUrl));
      audio.preload = 'auto'; audio.volume = 1; audioRef.current = audio;
      await audio.play();
      obstaclesRef.current = level.obstacles; speedRef.current = level.speed;
      playerRef.current = { y: GROUND - CUBE, vy: 0, rotation: 0, grounded: true, lastBeat: -1 };
      playheadRef.current = 0;
      setPhase('playing');
      audio.onended = () => {
        if (phaseRef.current === 'playing') {
          progressRef.current = 1; setProgress(1); setPhase('complete');
          const next = Math.max(best, 100); setBest(next);
          try { localStorage.setItem(bestKey(selectedSong.id, difficulty), String(next)); } catch {}
        }
      };
    } catch (error: any) {
      setPhase('catalogue'); setGameError(error?.message || 'Could not start the song level.');
    }
  };

  const restartLevel = () => { stopAudio(); void startLevel(); };
  const returnToCatalogue = () => { stopAudio(); setPhase('catalogue'); setGameError(''); };

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !selectedSong) return;
    let alive = true;
    let previous = performance.now();
    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(.035, (now - previous) / 1000); previous = now;
      const audio = audioRef.current;
      const active = phaseRef.current === 'playing';
      if (active && audio) {
        const playhead = audio.currentTime;
        playheadRef.current = playhead;
        const progressNow = Math.max(0, Math.min(1, playhead / Math.max(1, selectedSong.duration)));
        const previousPct = Math.floor(progressRef.current * 100);
        progressRef.current = progressNow;
        if (Math.floor(progressNow * 100) !== previousPct) setProgress(progressNow);
        const player = playerRef.current;
        player.vy += 2050 * dt; player.y += player.vy * dt;
        if (player.y >= GROUND - CUBE) { player.y = GROUND - CUBE; player.vy = 0; player.grounded = true; player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2); }
        else { player.grounded = false; player.rotation += dt * 5.8; }
        for (const obstacle of obstaclesRef.current) {
          const x = PLAYER_X + (obstacle.time - playhead) * speedRef.current;
          if (x < PLAYER_X - 22 || x > PLAYER_X + 35) continue;
          if (obstacle.type === 'orb') continue;
          let collision = false;
          if (obstacle.type === 'gap') collision = player.grounded;
          else collision = player.y + CUBE > GROUND - obstacle.height + 7;
          if (collision) {
            hitRef.current = true; audio.pause(); setPhase('dead');
            const percent = Math.max(0, Math.floor(progressNow * 100)); setProgress(percent);
            const next = Math.max(best, percent); setBest(next);
            try { localStorage.setItem(bestKey(selectedSong.id, difficulty), String(next)); } catch {}
            playSound(135);
            break;
          }
        }
      }
      drawScene(ctx, selectedSong, playheadRef.current, progressRef.current, playerRef.current, obstaclesRef.current, speedRef.current, palette, phaseRef.current, now / 1000);
      // Render the start / result states with a cinematic title band.
      if (phaseRef.current === 'catalogue' || phaseRef.current === 'loading') {
        ctx.fillStyle = 'rgba(5,8,25,.72)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = '900 34px system-ui'; ctx.textAlign = 'center'; ctx.fillText('SONG LEVEL', W / 2, H / 2 - 8); ctx.textAlign = 'left';
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => { alive = false; if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [selectedSongId]);

  const filteredSongs = songs.filter(song => (song.title + ' ' + song.artist).toLowerCase().includes(search.toLowerCase()));
  const onCanvasPointer = () => jump();

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={returnToCatalogue} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#10162a] px-3 py-2 text-xs font-bold text-slate-200"><ArrowLeft className="h-4 w-4"/> VIP Arcade</button>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-cyan-100">SONG-DRIVEN GEOMETRY</span>
      </div>
      <section className="overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#090f24] text-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
          <div><div className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-300">Every approved track gets its own level</div><h2 className="mt-1 text-2xl font-black sm:text-3xl">SONG DASH</h2><p className="mt-1 text-xs text-slate-400">The beat sets the pace. Obstacles are placed on the song's beat grid.</p></div>
          <button onClick={()=>setSoundOn(v=>!v)} className="rounded-xl border border-white/10 p-2 text-slate-300" title="Toggle game sound effects">{soundOn?<Volume2 className="h-4 w-4"/>:<VolumeX className="h-4 w-4"/>}</button>
        </div>
        <div className="p-2 sm:p-4">
          <canvas ref={canvasRef} width={W} height={H} onPointerDown={onCanvasPointer} className="block w-full rounded-2xl border border-white/10" style={{aspectRatio:'25 / 13',touchAction:'manipulation'}}/>
        </div>
        {phase === 'catalogue' || phase === 'loading' ? (
          <div className="border-t border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-black text-white">Choose a YouSong level</div><p className="mt-1 text-[10px] text-slate-400">Only Game Approved tracks appear here. Each song generates a different beat-mapped obstacle course.</p></div><span className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-[10px] font-bold text-cyan-100">{songs.length} approved tracks</span></div>
            <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search approved songs…" className="w-full rounded-xl border border-white/10 bg-[#0b1228] py-2.5 pl-9 pr-3 text-xs text-white outline-none focus:border-cyan-300/50"/></div>
            {phase==='loading' ? <div className="p-7 text-center text-xs text-cyan-200">{loadingMessage}</div> : loadingSongs ? <div className="p-7 text-center text-xs text-slate-400">Loading approved songs…</div> : !filteredSongs.length ? <div className="p-7 text-center text-xs text-slate-400">{catalogueError || 'No Game Approved songs are available yet. Ask an admin to approve songs in Games.'}</div> : <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">{filteredSongs.map(song=><button key={song.id} type="button" onClick={()=>setSelectedSongId(song.id)} className={'flex items-center gap-3 rounded-2xl border p-3 text-left transition '+(selectedSongId===song.id?'border-cyan-300/60 bg-cyan-300/10':'border-white/10 bg-white/[.025] hover:bg-white/[.06]')}><div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-800">{song.coverUrl&&<img src={song.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy"/>}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-white">{song.title}</div><div className="truncate text-[10px] text-slate-400">{song.artist}</div><div className="mt-1 flex gap-2 text-[9px] font-bold text-cyan-200"><span>{song.gameBpm} BPM</span><span>·</span><span>{Math.round(song.duration)} SEC</span></div></div>{selectedSongId===song.id&&<CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300"/>}</button>)}</div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1.5">{DIFFICULTIES.map(mode=><button key={mode.id} onClick={()=>setDifficulty(mode.id)} className={'rounded-lg px-3 py-2 text-[10px] font-black '+(difficulty===mode.id?'bg-cyan-300 text-slate-950':'bg-white/5 text-slate-400')}>{mode.label}</button>)}</div><button onClick={()=>void startLevel()} disabled={!selectedSong||phase==='loading'||loadingSongs} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-xs font-black text-slate-950 disabled:opacity-40"><Play className="h-4 w-4"/> Build & play level</button></div>
            {gameError&&<p className="mt-3 text-xs font-semibold text-rose-300">{gameError}</p>}
          </div>
        ) : (
          <div className="border-t border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-sm font-black text-white">{phase==='dead'?'CRASHED':phase==='complete'?'LEVEL COMPLETE':phase==='paused'?'PAUSED':'LEVEL IN PROGRESS'}</div><p className="mt-1 text-[10px] text-slate-400">{selectedSong?.title} · {selectedSong?.gameBpm} BPM · {difficulty.toUpperCase()} · {Math.floor(progress*100)}% complete</p></div>
              <div className="flex flex-wrap gap-2">
                {phase==='playing'&&<button onClick={()=>{audioRef.current?.pause();setPhase('paused');}} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200"><Pause className="mr-1 inline h-3.5 w-3.5"/> Pause</button>}
                {phase==='paused'&&<button onClick={()=>{void audioRef.current?.play().then(()=>setPhase('playing')).catch(()=>setGameError('Audio could not resume.'));}} className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950"><Play className="mr-1 inline h-3.5 w-3.5"/> Resume</button>}
                {(phase==='dead'||phase==='complete')&&<button onClick={restartLevel} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950"><RotateCcw className="mr-1 inline h-3.5 w-3.5"/> Retry level</button>}
                <button onClick={returnToCatalogue} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200">Song select</button>
              </div>
            </div>
            {phase==='dead'&&<p className="mt-3 text-xs font-bold text-rose-300">You hit an obstacle. The music stopped at the crash. Try the same song again or lower the difficulty.</p>}
            {phase==='complete'&&<p className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-amber-200"><Trophy className="h-4 w-4"/> Track cleared · Best {best}%</p>}
            {gameError&&<p className="mt-3 text-xs text-rose-300">{gameError}</p>}
          </div>
        )}
      </section>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#10162a] p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200"><AudioLines className="h-5 w-5"/></div><div><div className="text-xs font-black text-white">Beat-mapped course generation</div><div className="mt-0.5 text-[10px] text-slate-400">BPM and detected beat offset set obstacle placement. Each approved song has its own generated level.</div></div></div>
    </div>
  );
};