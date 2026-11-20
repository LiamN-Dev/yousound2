import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crown, Maximize2, Minimize2, RotateCcw, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { CrossyRoad3DView } from './CrossyRoad3DView';
import { getCrossyDestination, sanitizeCrossyLaneObjects } from '../services/crossyRoadGameLogic.ts';
import { CROSSY_BIRD_SKINS, CROSSY_MAPS, type CrossyBirdSkin, type CrossyMapTheme } from '../services/crossyRoadCatalog.ts';

type Direction = 'up' | 'down' | 'left' | 'right';
type LaneKind = 'grass' | 'road' | 'river' | 'railRoad';
type MovingObjectKind = 'vehicle' | 'log' | 'lilyPad' | 'train';
type MovingObject = { id: string; x: number; length: number; kind?: MovingObjectKind };
type Lane = { row: number; kind: LaneKind; direction: 1 | -1; speed: number; objects: MovingObject[]; spawnIn: number; trees?: number[]; boulders?: number[] };
type GameState = { x: number; row: number; lanes: Lane[]; score: number; running: boolean; gameOver: boolean; facing: Direction };
type Stats = { coins: number; highScore: number; totalGames: number };
type LeaderboardEntry = { rank: number; username: string; highScore: number; totalGames: number };
type GarageState = {
  coins: number;
  owned: Array<{ category: 'bird' | 'map'; id: string }>;
  equipped: { bird: string; map: string };
};

const COLS = 9;
const MOVE_SOUNDS = Array.from({ length: 12 }, (_, index) => 'move-' + String(index + 1).padStart(2, '0') + '.wav');
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch('/api/games/crossy-road' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Crossy Road account service is unavailable.');
  return data as T;
};

function makeLane(row: number): Lane {
  // The Expo world starts the chicken at z=8. This board stores that starting
  // position as row 0, so translate back to the source world's row number.
  const sourceRow = row + 8;

  if (sourceRow < 10) {
    // The first five world rows are solid; rows 5-9 leave a clear starting path.
    const trees = sourceRow < 5 ? Array.from({ length: COLS }, (_, index) => index) : [];
    return { row, kind: 'grass', direction: 1, speed: 0, objects: [], spawnIn: 0, trees, boulders: [] };
  }

  const roll = Math.random();
  if (roll < 1 / 3) {
    // Match Grass.treeGen: one to three random obstacles in the playable center.
    const possiblePositions = [0, 1, 2, 3, 5, 6, 7, 8];
    const count = Math.round(Math.random() * 2) + 1;
    const trees: number[] = [];
    const boulders: number[] = [];
    while (trees.length + boulders.length < count && possiblePositions.length) {
      const index = Math.floor(Math.random() * possiblePositions.length);
      const position = possiblePositions.splice(index, 1)[0];
      if (Math.random() < 0.4) boulders.push(position);
      else trees.push(position);
    }
    return { row, kind: 'grass', direction: 1, speed: 0, objects: [], spawnIn: 0, trees, boulders };
  }

  const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  if (roll < 2 / 3) {
    // CrossyGameMap chooses railroad for one in four road-type rows.
    if (Math.random() < 0.25) {
      const length = 7.4;
      return {
        row,
        kind: 'railRoad',
        direction,
        speed: 5.2 + Math.random() * 0.8,
        objects: [{ id: row + '-train', x: direction === 1 ? -length - 1 : COLS + 1, length, kind: 'train' }],
        spawnIn: 0,
      };
    }

    const speed = 1.25 + Math.random() * 0.75;
    const length = 1.2 + Math.random() * 0.55;
    return {
      row,
      kind: 'road',
      direction,
      speed,
      objects: [
        { id: row + '-car-a', x: direction === 1 ? 0.1 : 5.7, length, kind: 'vehicle' },
        { id: row + '-car-b', x: direction === 1 ? 5.2 : 0.1, length: length + 0.25, kind: 'vehicle' },
      ],
      spawnIn: 1.3 + Math.random() * 1.2,
    };
  }

  // Water lanes carry the player on moving logs and occasional lily pads.
  const speed = 0.65 + Math.random() * 0.4;
  const logLength = 2.1 + Math.random() * 0.75;
  return {
    row,
    kind: 'river',
    direction,
    speed,
    objects: [
      { id: row + '-log-a', x: direction === 1 ? 0.1 : 5.7, length: logLength, kind: 'log' },
      { id: row + '-lily', x: direction === 1 ? 4.3 : 1.3, length: 0.85, kind: 'lilyPad' },
      { id: row + '-log-b', x: direction === 1 ? 5.2 : 0.1, length: logLength + 0.25, kind: 'log' },
    ],
    spawnIn: 1.3 + Math.random() * 1.2,
  };
}
function initialGame(): GameState {
  return {
    x: 4,
    row: 0,
    // Source world rows 0-19, viewed relative to its starting row z=8.
    lanes: Array.from({ length: 20 }, (_, index) => makeLane(index - 8)),
    score: 0,
    running: false,
    gameOver: false,
    facing: 'up',
  };
}

export const CrossyRoadGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [game, setGame] = useState<GameState>(initialGame);
  const gameRef = useRef(game);
  const [stats, setStats] = useState<Stats>({ coins: 0, highScore: 0, totalGames: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showGarage, setShowGarage] = useState(false);
  const [garage, setGarage] = useState<GarageState>({ coins: 0, owned: [{ category: 'bird', id: 'classic' }, { category: 'map', id: 'classic' }], equipped: { bird: 'classic', map: 'classic' } });
  const [garageBusy, setGarageBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const moveSoundIndexRef = useRef(0);
  const runIdRef = useRef<string | null>(null);
  const pendingFinishScoreRef = useRef<{ score: number; session: number } | null>(null);
  const finishBusyRef = useRef(false);
  const finishedRunRef = useRef(false);
  const lastMoveAtRef = useRef(0);
  const gameSessionRef = useRef(0);
  const startPendingSessionRef = useRef<number | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const playSound = useCallback((file: string, volume = 0.42) => {
    if (!soundEnabledRef.current || typeof Audio === 'undefined') return;
    let source = audioCacheRef.current.get(file);
    if (!source) {
      source = new Audio('/crossy-audio/' + encodeURIComponent(file));
      source.preload = 'auto';
      audioCacheRef.current.set(file, source);
    }
    const voice = source.cloneNode(true) as HTMLAudioElement;
    voice.volume = Math.max(0, Math.min(1, volume));
    void voice.play().catch(() => undefined);
  }, []);

  const toggleSound = () => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    if (next) playSound('button-in.wav', 0.28);
  };

  useEffect(() => () => {
    audioCacheRef.current.forEach((audio) => {
      audio.pause();
      audio.src = '';
    });
    audioCacheRef.current.clear();
  }, []);

  const updateGame = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  const refreshGarage = useCallback(async () => {
    const data = await api<GarageState & { birds: CrossyBirdSkin[]; maps: CrossyMapTheme[] }>('/garage');
    setGarage({ coins: data.coins, owned: data.owned, equipped: data.equipped });
    setStats(current => ({ ...current, coins: data.coins }));
  }, []);

  const garageAction = useCallback(async (category: 'bird' | 'map', itemId: string) => {
    const key = category + ':' + itemId;
    setGarageBusy(key);
    try {
      const owned = garage.owned.some(item => item.category === category && item.id === itemId);
      if (owned) {
        const result = await api<{ equipped: GarageState['equipped'] }>('/equip', { method: 'POST', body: JSON.stringify({ category, itemId }) });
        setGarage(current => ({ ...current, equipped: result.equipped }));
        setMessage('Equipped successfully.');
      } else {
        const result = await api<{ coins: number }>('/purchase', { method: 'POST', body: JSON.stringify({ category, itemId }) });
        setGarage(current => ({ ...current, coins: result.coins, owned: [...current.owned, { category, id: itemId }] }));
        setStats(current => ({ ...current, coins: result.coins }));
        const equipped = await api<{ equipped: GarageState['equipped'] }>('/equip', { method: 'POST', body: JSON.stringify({ category, itemId }) });
        setGarage(current => ({ ...current, equipped: equipped.equipped }));
        setMessage('Unlocked and equipped!');
      }
      setError('');
    } catch (actionError: any) {
      setError(actionError?.message || 'Garage action failed.');
    } finally {
      setGarageBusy(null);
    }
  }, [garage.owned]);

  const refreshLeaderboard = useCallback(async () => {
    const data = await api<{ leaderboard: LeaderboardEntry[] }>('/high-score-leaderboard');
    setLeaderboard(data.leaderboard || []);
  }, []);

  const finishRun = useCallback(async (score: number, session = gameSessionRef.current) => {
    if (session !== gameSessionRef.current) return;
    if (!runIdRef.current) {
      pendingFinishScoreRef.current = { score, session };
      return;
    }
    if (finishedRunRef.current || finishBusyRef.current) return;

    const runId = runIdRef.current;
    finishedRunRef.current = true;
    finishBusyRef.current = true;
    setMessage('Saving your run…');
    try {
      const result = await api<Stats & { coinsAwarded: number }>('/finish', {
        method: 'POST',
        body: JSON.stringify({ runId, score }),
      });
      if (session !== gameSessionRef.current) return;
      runIdRef.current = null;
      setStats({ coins: result.coins, highScore: result.highScore, totalGames: result.totalGames });
      setGarage(current => ({ ...current, coins: result.coins }));
      setMessage('Score saved · +' + result.coinsAwarded + ' coins');
      if (result.coinsAwarded > 0) playSound('coin.mp3', 0.62);
      setError('');
      try {
        await refreshLeaderboard();
      } catch {
        setError('Your score was saved, but the leaderboard could not refresh.');
      }
    } catch (saveError: any) {
      if (session === gameSessionRef.current) {
        finishedRunRef.current = false;
        setMessage('');
        setError(saveError?.message || 'Your score could not be saved. Use Retry saving to try again.');
      }
    } finally {
      if (session === gameSessionRef.current) finishBusyRef.current = false;
    }
  }, [refreshLeaderboard, playSound]);

  const startRun = useCallback(async (session = gameSessionRef.current) => {
    if (session !== gameSessionRef.current || runIdRef.current || startPendingSessionRef.current === session) return;
    startPendingSessionRef.current = session;
    finishedRunRef.current = false;
    try {
      const started = await api<{ runId: string }>('/start', { method: 'POST', body: '{}' });
      if (session !== gameSessionRef.current) return;
      runIdRef.current = started.runId;
      setError('');
      const pending = pendingFinishScoreRef.current;
      if (pending?.session === session) {
        pendingFinishScoreRef.current = null;
        void finishRun(pending.score, session);
      }
    } catch (startError: any) {
      if (session === gameSessionRef.current) {
        pendingFinishScoreRef.current = null;
        setError(startError?.message || 'Could not create a saved game session. Your game is still playable; try a new run to retry saving.');
      }
    } finally {
      if (startPendingSessionRef.current === session) startPendingSessionRef.current = null;
    }
  }, [finishRun]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Stats>('/stats'),
      api<{ leaderboard: LeaderboardEntry[] }>('/leaderboard'),
      api<GarageState>('/garage'),
    ]).then(([account, board, garageData]) => {
      if (!active) return;
      setStats(account);
      setLeaderboard(board.leaderboard || []);
      setGarage({ coins: garageData.coins, owned: garageData.owned, equipped: garageData.equipped });
      setError('');
    }).catch((loadError: any) => {
      if (active) setError(loadError?.message || 'Could not load your Crossy Road account data.');
    });
    return () => { active = false; };
  }, []);

  const move = useCallback((direction: Direction) => {
    const current = gameRef.current;
    if (current.gameOver) return;
    const now = Date.now();
    if (now - lastMoveAtRef.current < 110) return;
    lastMoveAtRef.current = now;

    const destination = getCrossyDestination(current.x, current.row, direction, COLS);
    const next = { ...current, x: destination.x, row: destination.row, facing: direction };

    const known = new Set(current.lanes.map(lane => lane.row));
    const lanes = current.lanes.slice();
    for (let row = next.row - 7; row <= next.row + 7; row++) {
      if (!known.has(row)) lanes.push(makeLane(row));
    }
    next.lanes = lanes.filter(lane => lane.row >= next.row - 7 && lane.row <= next.row + 7);
    const destinationLane = next.lanes.find(lane => lane.row === next.row);
    if (
      destinationLane?.kind === 'grass' &&
      (destinationLane.trees?.includes(next.x) || destinationLane.boulders?.includes(next.x))
    ) {
      return;
    }

    const moved = next.x !== current.x || next.row !== current.row;
    if (!moved) return;
    playSound(MOVE_SOUNDS[moveSoundIndexRef.current], 0.32);
    moveSoundIndexRef.current = (moveSoundIndexRef.current + 1) % MOVE_SOUNDS.length;
    if (next.row > current.row && next.row > current.score) playSound('points.mp3', 0.28);
    if (next.row !== current.row && destinationLane?.kind === 'railRoad') playSound('train-alarm.wav', 0.34);

    const session = gameSessionRef.current;
    if (!runIdRef.current && startPendingSessionRef.current !== session) {
      void startRun(session);
    }
    if (!current.running) setMessage('');
    next.score = Math.max(current.score, next.row);
    next.running = true;
    updateGame(next);
  }, [playSound, startRun, updateGame]);

  useEffect(() => {
    const keys: Record<string, Direction> = {
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keys[event.code];
      if (!direction || event.repeat) return;
      if (event.target instanceof HTMLElement && (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
        event.target.isContentEditable
      )) return;
      event.preventDefault();
      move(direction);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = gameRef.current;
      if (!current.running || current.gameOver) return;
      const dt = 0.05;
      const lanes = current.lanes.map(lane => {
        if (lane.kind === 'grass') return lane;
        let spawnIn = lane.spawnIn - dt;
        let objects = sanitizeCrossyLaneObjects(lane.kind, lane.objects).map(object => ({
          ...object,
          x: object.x + lane.direction * lane.speed * dt,
        }));

        if (lane.kind === 'railRoad') {
          objects = objects.map(object => {
            if (lane.direction === 1 && object.x > COLS + 0.5) {
              playSound('train-pass-01.wav', 0.42);
              return { ...object, x: -object.length - 0.5 };
            }
            if (lane.direction === -1 && object.x + object.length < -0.5) {
              playSound('train-pass-02.wav', 0.42);
              return { ...object, x: COLS + 0.5 };
            }
            return object;
          });
          return { ...lane, objects, spawnIn: 0 };
        }

        objects = objects.filter(object => object.x > -object.length - 0.5 && object.x < COLS + 0.5);
        if (spawnIn <= 0) {
          const blocked = lane.direction === 1
            ? objects.some(object => object.x < 2.8)
            : objects.some(object => object.x + object.length > COLS - 2.8);
          if (!blocked) {
            if (lane.kind === 'road') {
              const length = 1.2 + Math.random() * 0.55;
              objects.push({ id: lane.row + '-car-' + Date.now(), x: lane.direction === 1 ? -length : COLS, length, kind: 'vehicle' });
            } else {
              const length = 2.1 + Math.random() * 0.7;
              objects.push({ id: lane.row + '-log-' + Date.now(), x: lane.direction === 1 ? -length : COLS, length, kind: 'log' });
            }
          }
          spawnIn = 1.3 + Math.random() * 1.2;
        }
        return { ...lane, objects: sanitizeCrossyLaneObjects(lane.kind, objects), spawnIn };
      });

      const player = { x: current.x, row: current.row };
      const lane = lanes.find(item => item.row === player.row);
      let dead = !lane || player.x < 0 || player.x > COLS - 1;
      let impactSound: string | null = null;
      if ((lane?.kind === 'road' || lane?.kind === 'railRoad') && lane.objects.some(object => player.x + 0.34 > object.x && player.x - 0.34 < object.x + object.length)) {
        dead = true;
        impactSound = lane.kind === 'railRoad'
          ? 'train-crash.wav'
          : (Math.random() < 0.5 ? 'car-hit-01.mp3' : 'car-hit-02.wav');
      }
      if (lane?.kind === 'river') {
        const platform = lane.objects.find(object => player.x + 0.34 > object.x && player.x - 0.34 < object.x + object.length);
        if (!platform) {
          dead = true;
          impactSound = 'water-splash.mp3';
        } else {
          // Logs and lily pads both carry the player with the current, like the source engine.
          player.x += lane.direction * lane.speed * dt;
          if (player.x < 0 || player.x > COLS - 1) {
            dead = true;
            impactSound = 'water-splash.mp3';
          }
        }
      }

      const next: GameState = { ...current, lanes, x: player.x, running: !dead, gameOver: dead };
      updateGame(next);
      if (dead) {
        playSound(impactSound || (Math.random() < 0.5 ? 'death-01.wav' : 'death-02.wav'), 0.68);
        void finishRun(current.score);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [finishRun, playSound, updateGame]);

  const restart = () => {
    gameSessionRef.current += 1;
    runIdRef.current = null;
    pendingFinishScoreRef.current = null;
    finishBusyRef.current = false;
    finishedRunRef.current = false;
    lastMoveAtRef.current = 0;
    setMessage('');
    setError('');
    updateGame(initialGame());
  };

  const retrySave = () => {
    if (!runIdRef.current || finishBusyRef.current) return;
    finishedRunRef.current = false;
    void finishRun(game.score);
  };

  const handleBoardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional; swipe handling still works without it.
    }
  };

  const handleBoardPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? 'right' : 'left');
    } else {
      move(dy > 0 ? 'down' : 'up');
    }
  };



  // This screen is a child of the active Arcade tab; it stays inside the YouSound layout.
  return (
    <div className={"relative mx-auto flex " + (expanded ? "min-h-[min(92vh,980px)] " : "min-h-[min(82vh,760px)] ") + "w-full flex-col overflow-hidden rounded-[26px] border border-black/10 bg-[#f5f2e9] text-[#141a12] shadow-xl"}>
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-black/10 bg-white/75 px-3 py-2 text-xs font-semibold text-[#253126] shadow-sm transition hover:bg-white">
            <X className="h-4 w-4" /> Arcade
          </button>
          <div className="min-w-0">
            <div className="font-display text-xl font-semibold leading-none tracking-tight sm:text-2xl">Crossy Road</div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[.18em] text-black/35">YouSound endless arcade</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden rounded-xl border border-black/10 bg-white/75 px-3 py-2 text-right sm:block">
            <div className="text-[8px] font-bold uppercase tracking-wider text-black/35">Personal best</div>
            <div className="text-sm font-black tabular-nums">{stats.highScore.toLocaleString()}</div>
          </div>
          <button type="button" onClick={toggleSound} aria-label={soundEnabled ? 'Mute game sounds' : 'Enable game sounds'} aria-pressed={soundEnabled} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white/75 text-[#263b2b] shadow-sm transition hover:bg-white">
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Shrink game board' : 'Enlarge game board'} aria-pressed={expanded} title={expanded ? 'Shrink game board' : 'Enlarge game board'} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white/75 text-[#263b2b] shadow-sm transition hover:bg-white">
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => setShowLeaderboard(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#263b2b] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#17281c]">
            <Trophy className="h-4 w-4" /><span className="hidden sm:inline">Leaderboard</span>
          </button>
        </div>
      </header>

      <main className={"mx-auto flex min-h-0 w-full " + (expanded ? "max-w-none " : "max-w-6xl ") + "flex-1 flex-col gap-3 px-3 pb-3 sm:px-5 lg:flex-row lg:items-center lg:gap-9 lg:px-8 lg:py-5"}>
        <aside className={expanded ? "hidden" : "flex shrink-0 flex-row items-center justify-between gap-3 rounded-2xl border border-black/[.07] bg-white/75 p-3 shadow-sm lg:w-[245px] lg:flex-col lg:items-stretch lg:justify-start lg:gap-5 lg:rounded-[26px] lg:p-5"}>
          <div className="min-w-0 flex-1 lg:flex-none">
            <div className="text-[9px] font-black uppercase tracking-[.2em] text-[#6d865e]">The endless crossing</div>
            <h1 className="mt-1 font-display text-lg font-semibold leading-tight tracking-tight sm:text-xl">How far can you get?</h1>
            <p className="mt-1 hidden text-[11px] leading-5 text-black/50 lg:block">Dodge the traffic, cross the rivers on logs, and keep moving forward. Every lane counts.</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 lg:grid lg:grid-cols-2">
            <div className="min-w-[66px] rounded-xl bg-[#f3f0e7] px-2.5 py-2 lg:min-w-0 lg:p-3">
              <div className="text-[8px] font-bold uppercase tracking-wider text-black/40">Best</div>
              <div className="mt-0.5 text-lg font-black tabular-nums text-[#1e3023]">{stats.highScore.toLocaleString()}</div>
            </div>
            <div className="min-w-[66px] rounded-xl bg-[#f3f0e7] px-2.5 py-2 lg:min-w-0 lg:p-3">
              <div className="text-[8px] font-bold uppercase tracking-wider text-black/40">Coins</div>
              <div className="mt-0.5 text-lg font-black tabular-nums text-[#1e3023]">{stats.coins.toLocaleString()}</div>
            </div>
            <div className="hidden rounded-xl bg-[#f3f0e7] px-3 py-2 lg:block">
              <div className="text-[8px] font-bold uppercase tracking-wider text-black/40">Total runs</div>
              <div className="mt-0.5 text-lg font-black tabular-nums text-[#1e3023]">{stats.totalGames.toLocaleString()}</div>
            </div>
            <button type="button" onClick={() => setShowLeaderboard(true)} className="inline-flex h-[54px] items-center gap-1.5 rounded-xl border border-[#6d865e]/20 bg-[#e9efdf] px-3 text-[10px] font-bold text-[#324c32] transition hover:bg-[#dce8cf] lg:hidden">
              <Trophy className="h-4 w-4" /> Ranks
            </button>
          </div>

          <div className="hidden border-t border-black/[.07] pt-4 lg:block">
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-black/40">Controls</div>
            <p className="mt-2 text-[11px] leading-5 text-black/55">Use arrow keys or WASD, swipe on the board, or use the directional pad.</p>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold text-[#526b4c]"><Crown className="h-4 w-4" /> Scores save to your YouSound account</div>
          </div>
        </aside>

        <section className={"relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[26px] border border-black/10 bg-[#cfe9f6] shadow-[0_40px_80px_-45px_rgba(25,40,20,0.7)] lg:aspect-[4/5] " + (expanded ? "lg:max-h-[90vh] lg:w-[min(74vw,760px)]" : "lg:max-h-[82vh] lg:w-[500px]") + " lg:flex-none"}>
          <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-4">
            <div className="rounded-xl border border-white/50 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
              <div className="text-[8px] font-black uppercase tracking-[.16em] text-black/40">Score</div>
              <div className="text-2xl font-black leading-none tabular-nums text-[#17281c]">{game.score}</div>
            </div>
            <div className="rounded-xl border border-white/50 bg-white/80 px-3 py-2 text-right shadow-sm backdrop-blur">
              <div className="text-[8px] font-black uppercase tracking-[.16em] text-black/40">Best</div>
              <div className="text-lg font-black leading-none tabular-nums text-[#17281c]">{stats.highScore}</div>
            </div>
          </div>

          <div className="absolute inset-0">
            <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,.35) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.35) 50%, rgba(255,255,255,.35) 75%, transparent 75%, transparent)', backgroundSize: '42px 42px' }} />
            <div className="absolute inset-x-0 bottom-0 top-0 flex items-center justify-center px-2 pb-2 pt-14">
              <div
                className={"relative " + (expanded ? "h-[96%] max-h-none " : "h-[94%] max-h-[640px] ") + "max-w-full touch-none overflow-hidden rounded-[18px] border-4 border-white/65 bg-[#245438] shadow-[0_12px_35px_rgba(12,35,27,.25)]"}
                style={{ aspectRatio: '9 / 11' }}
                onPointerDown={handleBoardPointerDown}
                onPointerUp={handleBoardPointerUp}
                onPointerCancel={() => { swipeStartRef.current = null; }}
              >
                <CrossyRoad3DView game={game} birdSkinId={garage.equipped.bird} mapId={garage.equipped.map} />
              </div>
            </div>
          </div>

          {!game.running && !game.gameOver && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#14281c]/15 p-5 backdrop-blur-[2px]">
              <div className="w-full max-w-[290px] rounded-[24px] border border-white/70 bg-[#fffdf5]/95 p-5 text-center shadow-[0_25px_65px_rgba(15,35,20,.2)]">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e5efd9] text-3xl">🐔</div>
                <div className="mt-3 text-[9px] font-black uppercase tracking-[.2em] text-[#769065]">Ready when you are</div>
                <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#18291c]">Let’s cross.</h2>
                <p className="mt-2 text-[11px] leading-5 text-black/55">Tap Play or press an arrow key. Avoid cars and stay on the logs.</p>
                <button type="button" onClick={() => move('up')} className="mt-4 w-full rounded-xl bg-[#263b2b] px-4 py-3 text-xs font-black text-white shadow-sm transition hover:bg-[#17281c]">Play now</button>
              </div>
            </div>
          )}

          {game.gameOver && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#14281c]/35 p-5 backdrop-blur-[3px]">
              <div className="w-full max-w-[300px] rounded-[24px] border border-white/70 bg-[#fffdf5]/95 p-5 text-center shadow-[0_25px_65px_rgba(15,35,20,.22)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f7e7df] text-2xl">💥</div>
                <div className="mt-3 text-[9px] font-black uppercase tracking-[.2em] text-[#a16b52]">Run complete</div>
                <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#18291c]">Game over</h2>
                <div className="mt-3 rounded-xl bg-[#f3f0e7] px-4 py-3">
                  <div className="text-[8px] font-black uppercase tracking-wider text-black/40">Your score</div>
                  <div className="mt-0.5 text-3xl font-black tabular-nums text-[#1e3023]">{game.score}</div>
                </div>
                <p className="mt-2 text-[10px] leading-5 text-black/55">{error || message || 'Your run has ended.'}</p>
                {error && runIdRef.current && <button type="button" onClick={retrySave} disabled={finishBusyRef.current} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#263b2b]/20 bg-[#e9efdf] px-4 py-3 text-xs font-black text-[#263b2b] transition hover:bg-[#dce8cf] disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Retry saving score</button>}
                <button type="button" onClick={restart} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#263b2b] px-4 py-3 text-xs font-black text-white transition hover:bg-[#17281c]"><RotateCcw className="h-4 w-4" /> Play again</button>
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-3 z-20 flex items-end gap-2 sm:bottom-4 sm:left-4">
            <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/40 bg-white/45 p-1.5 shadow-lg backdrop-blur-md">
              <span />
              <button type="button" onClick={() => move('up')} aria-label="Move forward" className="rounded-xl bg-white/90 p-3 text-[#263b2b] shadow-sm transition active:scale-95 hover:bg-white"><ArrowUp className="h-4 w-4" /></button>
              <span />
              <button type="button" onClick={() => move('left')} aria-label="Move left" className="rounded-xl bg-white/90 p-3 text-[#263b2b] shadow-sm transition active:scale-95 hover:bg-white"><ArrowLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => move('down')} aria-label="Move backward" className="rounded-xl bg-white/90 p-3 text-[#263b2b] shadow-sm transition active:scale-95 hover:bg-white"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => move('right')} aria-label="Move right" className="rounded-xl bg-white/90 p-3 text-[#263b2b] shadow-sm transition active:scale-95 hover:bg-white"><ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>

          <button type="button" onClick={() => setShowLeaderboard(true)} className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-xl border border-white/50 bg-white/85 px-3 py-2.5 text-[10px] font-black text-[#263b2b] shadow-lg backdrop-blur transition hover:bg-white">
            <Trophy className="h-4 w-4" /><span>Leaderboard</span>
          </button>

          {showLeaderboard && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#14281c]/45 p-4 backdrop-blur-sm">
              <section className="flex max-h-[84%] w-full max-w-[360px] flex-col overflow-hidden rounded-[24px] border border-white/80 bg-[#fffdf5] text-[#17281c] shadow-2xl">
                <div className="flex items-center justify-between border-b border-black/[.08] px-4 py-3">
                  <div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-[#718e4f]" /><div><div className="text-sm font-black">Leaderboard</div><div className="text-[9px] uppercase tracking-wider text-black/40">Top Crossy Road players</div></div></div>
                  <button type="button" onClick={() => setShowLeaderboard(false)} aria-label="Close leaderboard" className="rounded-lg p-2 text-black/50 transition hover:bg-black/[.05] hover:text-black"><X className="h-4 w-4" /></button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {leaderboard.length ? leaderboard.slice(0, 25).map((entry, index) => (
                    <div key={entry.rank} className="flex items-center gap-3 border-b border-black/[.05] px-4 py-3 last:border-0">
                      <span className="w-7 text-center text-xs font-black tabular-nums text-[#718e4f]">#{entry.rank || index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{entry.username}</span>
                      <span className="text-xs font-black tabular-nums">{entry.highScore.toLocaleString()}</span>
                    </div>
                  )) : <div className="p-8 text-center text-xs text-black/45">No scores yet. Be the first!</div>}
                </div>
                <div className="border-t border-black/[.08] p-3">
                  <button type="button" onClick={() => void refreshLeaderboard().catch((refreshError: any) => setError(refreshError.message))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e9efdf] px-3 py-2.5 text-[10px] font-black text-[#324c32] transition hover:bg-[#dce8cf]"><RotateCcw className="h-3.5 w-3.5" /> Refresh scores</button>
                </div>
              </section>
            </div>
          )}
        </section>
      </main>


      {showGarage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm">
          <section className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-[#fffdf5] text-[#17281c] shadow-2xl">
            <header className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div><div className="text-[9px] font-black uppercase tracking-[.2em] text-[#718e4f]">Crossy Road</div><h2 className="text-xl font-black">Bird & Map Garage</h2><p className="text-xs text-black/50">Your account balance: 🪙 {garage.coins.toLocaleString()}</p></div>
              <button type="button" onClick={() => setShowGarage(false)} className="rounded-xl p-2 hover:bg-black/5" aria-label="Close garage"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
              <div><h3 className="mb-3 text-sm font-black">Bird skins</h3><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CROSSY_BIRD_SKINS.map(item => {
                  const owned = garage.owned.some(entry => entry.category === 'bird' && entry.id === item.id);
                  const equipped = garage.equipped.bird === item.id;
                  return <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f3f0e7] text-2xl" style={{ color: item.tint }}>🐔</div>
                    <div className="min-w-0 flex-1"><div className="text-sm font-black">{item.name}</div><div className="text-[10px] text-black/50">{item.description}</div><div className="mt-1 text-[10px] font-bold text-[#8b6b20]">{item.price === 0 ? 'Free' : '🪙 ' + item.price}</div></div>
                    <button type="button" disabled={garageBusy !== null || equipped || (!owned && garage.coins < item.price)} onClick={() => void garageAction('bird', item.id)} className="rounded-lg bg-[#263b2b] px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">{garageBusy === 'bird:' + item.id ? '...' : equipped ? 'Equipped' : owned ? 'Equip' : 'Unlock'}</button>
                  </div>;
                })}
              </div></div>
              <div><h3 className="mb-3 text-sm font-black">Maps</h3><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CROSSY_MAPS.map(item => {
                  const owned = garage.owned.some(entry => entry.category === 'map' && entry.id === item.id);
                  const equipped = garage.equipped.map === item.id;
                  return <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
                    <div className="h-12 w-12 shrink-0 rounded-xl border border-black/10" style={{ background: 'linear-gradient(135deg,' + item.grassColor + ' 0 35%, ' + item.roadColor + ' 35% 65%, ' + item.waterColor + ' 65%)' }} />
                    <div className="min-w-0 flex-1"><div className="text-sm font-black">{item.name}</div><div className="text-[10px] text-black/50">{item.description}</div><div className="mt-1 text-[10px] font-bold text-[#8b6b20]">{item.price === 0 ? 'Free' : '🪙 ' + item.price}</div></div>
                    <button type="button" disabled={garageBusy !== null || equipped || (!owned && garage.coins < item.price)} onClick={() => void garageAction('map', item.id)} className="rounded-lg bg-[#263b2b] px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">{garageBusy === 'map:' + item.id ? '...' : equipped ? 'Equipped' : owned ? 'Equip' : 'Unlock'}</button>
                  </div>;
                })}
              </div></div>
            </div>
            <footer className="border-t border-black/10 p-3 text-center text-[10px] text-black/45">Purchases and equipped items are saved to your signed-in YouSound account.</footer>
          </section>
        </div>
      )}

      {(error || message) && (
        <div className="shrink-0 px-4 pb-2 text-center text-[10px]">
          <span className={error ? 'text-rose-700' : 'text-[#4d7041]'}>{error || message}</span>
        </div>
      )}
    </div>
  );
};
