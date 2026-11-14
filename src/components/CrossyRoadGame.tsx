import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crown, RotateCcw, Trophy, X } from 'lucide-react';

type Direction = 'up' | 'down' | 'left' | 'right';
type LaneKind = 'grass' | 'road' | 'river';
type MovingObject = { id: string; x: number; length: number };
type Lane = { row: number; kind: LaneKind; direction: 1 | -1; speed: number; objects: MovingObject[]; spawnIn: number };
type GameState = { x: number; row: number; lanes: Lane[]; score: number; running: boolean; gameOver: boolean };
type Stats = { coins: number; highScore: number; totalGames: number };
type LeaderboardEntry = { rank: number; username: string; highScore: number; totalGames: number };

const COLS = 9;
const VISIBLE_ROWS = 11;
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
  if (row <= 2 || row % 13 === 0) {
    return { row, kind: 'grass', direction: 1, speed: 0, objects: [], spawnIn: 0 };
  }
  const roll = Math.random();
  const kind: LaneKind = roll < 0.58 ? 'road' : roll < 0.82 ? 'river' : 'grass';
  if (kind === 'grass') return { row, kind, direction: 1, speed: 0, objects: [], spawnIn: 0 };
  const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const speed = kind === 'road' ? 1.25 + Math.random() * 0.75 : 0.65 + Math.random() * 0.4;
  const length = kind === 'road' ? 1.2 + Math.random() * 0.55 : 2.1 + Math.random() * 0.75;
  return {
    row, kind, direction, speed,
    objects: [
      { id: row + '-a', x: direction === 1 ? 0.1 : 5.7, length },
      { id: row + '-b', x: direction === 1 ? 5.2 : 0.1, length: kind === 'road' ? length : length + 0.25 },
    ],
    spawnIn: 1.3 + Math.random() * 1.2,
  };
}

function initialGame(): GameState {
  return {
    x: 4,
    row: 0,
    lanes: Array.from({ length: 20 }, (_, index) => makeLane(index - 7)),
    score: 0,
    running: false,
    gameOver: false,
  };
}

export const CrossyRoadGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [game, setGame] = useState<GameState>(initialGame);
  const gameRef = useRef(game);
  const [stats, setStats] = useState<Stats>({ coins: 0, highScore: 0, totalGames: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const runIdRef = useRef<string | null>(null);
  const startPendingRef = useRef(false);
  const pendingFinishScoreRef = useRef<number | null>(null);
  const finishBusyRef = useRef(false);
  const finishedRunRef = useRef(false);
  const lastMoveAtRef = useRef(0);

  const updateGame = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  const refreshLeaderboard = useCallback(async () => {
    const data = await api<{ leaderboard: LeaderboardEntry[] }>('/leaderboard');
    setLeaderboard(data.leaderboard || []);
  }, []);

  const finishRun = useCallback(async (score: number) => {
    if (!runIdRef.current) {
      pendingFinishScoreRef.current = score;
      return;
    }
    if (finishedRunRef.current || finishBusyRef.current) return;
    finishedRunRef.current = true;
    finishBusyRef.current = true;
    setMessage('Saving your run…');
    try {
      const result = await api<Stats & { coinsAwarded: number }>('/finish', {
        method: 'POST',
        body: JSON.stringify({ runId: runIdRef.current, score }),
      });
      runIdRef.current = null;
      setStats({ coins: result.coins, highScore: result.highScore, totalGames: result.totalGames });
      setMessage('Score saved · +' + result.coinsAwarded + ' coins');
      setError('');
      await refreshLeaderboard();
    } catch (saveError: any) {
      setMessage('');
      setError(saveError?.message || 'Your score could not be saved.');
    } finally {
      finishBusyRef.current = false;
    }
  }, [refreshLeaderboard]);

  const startRun = useCallback(async () => {
    if (runIdRef.current || startPendingRef.current) return;
    startPendingRef.current = true;
    finishedRunRef.current = false;
    try {
      const started = await api<{ runId: string }>('/start', { method: 'POST', body: '{}' });
      runIdRef.current = started.runId;
      setError('');
      const pendingScore = pendingFinishScoreRef.current;
      if (pendingScore !== null) {
        pendingFinishScoreRef.current = null;
        void finishRun(pendingScore);
      }
    } catch (startError: any) {
      pendingFinishScoreRef.current = null;
      setError(startError?.message || 'Could not create a saved game session.');
    } finally {
      startPendingRef.current = false;
    }
  }, [finishRun]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Stats>('/stats'),
      api<{ leaderboard: LeaderboardEntry[] }>('/leaderboard'),
    ]).then(([account, board]) => {
      if (!active) return;
      setStats(account);
      setLeaderboard(board.leaderboard || []);
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
    if (now - lastMoveAtRef.current < 120) return;
    lastMoveAtRef.current = now;

    if (!current.running) {
      void startRun();
      setMessage('');
    }

    const next = { ...current, x: current.x, row: current.row };
    if (direction === 'up') next.row += 1;
    if (direction === 'down') next.row = Math.max(0, next.row - 1);
    if (direction === 'left') next.x = Math.max(0, next.x - 1);
    if (direction === 'right') next.x = Math.min(COLS - 1, next.x + 1);

    const known = new Set(current.lanes.map(lane => lane.row));
    const lanes = current.lanes.slice();
    for (let row = next.row - 7; row <= next.row + 7; row++) {
      if (!known.has(row)) lanes.push(makeLane(row));
    }
    next.lanes = lanes.filter(lane => lane.row >= next.row - 7 && lane.row <= next.row + 7);
    next.score = Math.max(current.score, next.row);
    next.running = true;
    updateGame(next);
  }, [startRun, updateGame]);

  useEffect(() => {
    const keys: Record<string, Direction> = {
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keys[event.code];
      if (!direction) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
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
        let objects = lane.objects
          .map(object => ({ ...object, x: object.x + lane.direction * lane.speed * dt }))
          .filter(object => object.x > -object.length - 0.5 && object.x < COLS + 0.5);
        if (spawnIn <= 0) {
          const blocked = lane.direction === 1
            ? objects.some(object => object.x < 2.8)
            : objects.some(object => object.x + object.length > COLS - 2.8);
          if (!blocked) {
            const length = lane.kind === 'road' ? 1.2 + Math.random() * 0.55 : 2.1 + Math.random() * 0.7;
            objects.push({ id: lane.row + '-' + Date.now(), x: lane.direction === 1 ? -length : COLS, length });
          }
          spawnIn = 1.3 + Math.random() * 1.2;
        }
        return { ...lane, objects, spawnIn };
      });

      const player = { x: current.x, row: current.row };
      const lane = lanes.find(item => item.row === player.row);
      let dead = !lane || player.x < 0 || player.x > COLS - 1;
      if (lane?.kind === 'road' && lane.objects.some(object => player.x + 0.34 > object.x && player.x - 0.34 < object.x + object.length)) {
        dead = true;
      }
      if (lane?.kind === 'river') {
        const log = lane.objects.find(object => player.x + 0.34 > object.x && player.x - 0.34 < object.x + object.length);
        if (!log) dead = true;
        else {
          player.x += lane.direction * lane.speed * dt;
          if (player.x < 0 || player.x > COLS - 1) dead = true;
        }
      }

      const next: GameState = { ...current, lanes, x: player.x, running: !dead, gameOver: dead };
      updateGame(next);
      if (dead) void finishRun(current.score);
    }, 50);
    return () => window.clearInterval(timer);
  }, [finishRun, updateGame]);

  const restart = () => {
    runIdRef.current = null;
    startPendingRef.current = false;
    pendingFinishScoreRef.current = null;
    finishBusyRef.current = false;
    finishedRunRef.current = false;
    lastMoveAtRef.current = 0;
    setMessage('');
    setError('');
    updateGame(initialGame());
  };

  const topRow = game.row + 5;
  const bottomRow = game.row - 5;
  const visibleLanes = game.lanes.filter(lane => lane.row >= bottomRow && lane.row <= topRow).sort((a, b) => b.row - a.row);

  const renderLane = (lane: Lane) => {
    const background = lane.kind === 'grass' ? 'bg-[#39774a]' : lane.kind === 'road' ? 'bg-[#343c49]' : 'bg-[#176d88]';
    return (
      <div key={lane.row} className={'relative col-span-9 h-[48px] overflow-hidden border-y border-black/10 ' + background}>
        {lane.kind === 'grass' && <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(#c0f1a2 1px, transparent 1.5px)', backgroundSize: '21px 19px' }} />}
        {lane.kind === 'road' && <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-yellow-100/50" />}
        {lane.kind === 'river' && <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(165deg, transparent 0 14px, #b4e7ff 15px 16px, transparent 17px 28px)' }} />}
        {lane.objects.map(object => (
          <div key={object.id} className="absolute top-1/2 -translate-y-1/2" style={{ left: (object.x / COLS * 100) + '%', width: (object.length / COLS * 100) + '%', height: lane.kind === 'road' ? '34px' : '29px' }}>
            {lane.kind === 'road' ? (
              <div className="relative h-full w-full rounded-xl border border-black/30 bg-gradient-to-b from-rose-400 to-rose-700 shadow-lg">
                <div className="absolute left-[20%] right-[20%] top-1 h-3 rounded-md bg-sky-200/80" />
                <div className="absolute -bottom-1 left-[14%] h-2 w-3 rounded bg-slate-950" />
                <div className="absolute -bottom-1 right-[14%] h-2 w-3 rounded bg-slate-950" />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-around rounded-full border-2 border-amber-950/50 bg-gradient-to-b from-amber-500 to-amber-800 shadow-lg">
                <span className="h-4 w-4 rounded-full border-2 border-amber-950/60 bg-amber-300/30" />
                <span className="h-4 w-4 rounded-full border-2 border-amber-950/60 bg-amber-300/30" />
              </div>
            )}
          </div>
        ))}
        {lane.row === game.row && (
          <div className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_3px_3px_rgba(0,0,0,.65)]" style={{ left: ((game.x + 0.5) / COLS * 100) }}>
            <span className="text-[27px] leading-none" role="img" aria-label="Player">🐔</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#10162a] px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"><X className="h-4 w-4" /> Arcade</button>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-100/10 px-3 py-2 text-xs font-black text-amber-100"><Trophy className="h-4 w-4" /> Best: {stats.highScore.toLocaleString()}</span>
          <span className="rounded-xl border border-cyan-200/20 bg-cyan-100/10 px-3 py-2 text-xs font-black text-cyan-100">{stats.totalGames.toLocaleString()} saved runs</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="overflow-hidden rounded-3xl border border-emerald-200/20 bg-[#111b27] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
            <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">YouSound Arcade</div><h2 className="mt-1 text-2xl font-black">Crossy Road</h2><p className="mt-1 text-[11px] text-slate-400">Cross traffic, ride the logs, and see how far you can go.</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-center"><div className="text-[9px] uppercase tracking-wider text-slate-500">Score</div><div className="text-2xl font-black tabular-nums">{game.score}</div></div>
          </div>
          <div className="bg-[#08131d] p-3 sm:p-5">
            <div className="mx-auto max-w-[560px] overflow-hidden rounded-2xl border-4 border-slate-700/70 bg-[#245438] shadow-inner">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(9, minmax(0, 1fr))', gridTemplateRows: 'repeat(' + VISIBLE_ROWS + ', 48px)' }}>
                {visibleLanes.map(renderLane)}
              </div>
              {!game.running && !game.gameOver && <div className="border-t border-white/10 bg-black/35 px-4 py-3 text-center text-xs text-slate-300">Press an arrow key or use the controls to start.</div>}
              {game.gameOver && <div className="border-t border-rose-300/20 bg-rose-950/80 p-4 text-center"><div className="text-lg font-black text-white">Game over</div><p className="mt-1 text-xs text-rose-100">You crossed {game.score} lanes. Your score is being saved to your account.</p><button type="button" onClick={restart} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-200"><RotateCcw className="h-4 w-4" /> Play again</button></div>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
            <p className="text-[10px] leading-4 text-slate-500">Keyboard: arrows or WASD. On mobile, use the directional pad.</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => move('left')} aria-label="Move left" className="rounded-lg border border-white/10 bg-white/[.05] p-2.5 hover:bg-white/10"><ArrowLeft className="h-4 w-4" /></button>
              <div className="flex flex-col gap-1.5"><button type="button" onClick={() => move('up')} aria-label="Move forward" className="rounded-lg border border-white/10 bg-white/[.05] p-2.5 hover:bg-white/10"><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => move('down')} aria-label="Move backward" className="rounded-lg border border-white/10 bg-white/[.05] p-2.5 hover:bg-white/10"><ArrowDown className="h-4 w-4" /></button></div>
              <button type="button" onClick={() => move('right')} aria-label="Move right" className="rounded-lg border border-white/10 bg-white/[.05] p-2.5 hover:bg-white/10"><ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
          {(error || message) && <div className={'border-t border-white/10 px-4 py-3 text-xs ' + (error ? 'text-rose-300' : 'text-emerald-200')}>{error || message}</div>}
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-[#101925] p-4">
            <div className="flex items-center gap-2 text-amber-200"><Crown className="h-4 w-4" /><h3 className="text-sm font-black">Your account stats</h3></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/[.04] p-3"><div className="text-[9px] uppercase text-slate-500">Coins</div><div className="mt-1 text-xl font-black">{stats.coins.toLocaleString()}</div></div>
              <div className="rounded-xl bg-white/[.04] p-3"><div className="text-[9px] uppercase text-slate-500">High score</div><div className="mt-1 text-xl font-black">{stats.highScore.toLocaleString()}</div></div>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-500">Scores and coins are saved to the signed-in YouSound account.</p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-amber-200/15 bg-[#101925]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-2 text-amber-200"><Trophy className="h-4 w-4" /><h3 className="text-sm font-black">Leaderboard</h3></div><span className="text-[9px] text-slate-500">Top 25</span></div>
            {leaderboard.length ? <div className="divide-y divide-white/5">{leaderboard.slice(0, 15).map(entry => <div key={entry.rank} className="flex items-center gap-2 px-4 py-2.5"><span className="w-6 text-xs font-black text-amber-200">#{entry.rank}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{entry.username}</span><span className="text-xs font-black tabular-nums text-white">{entry.highScore.toLocaleString()}</span></div>)}</div> : <div className="p-5 text-center text-xs text-slate-500">No scores yet. Be the first.</div>}
            <button type="button" onClick={() => void refreshLeaderboard().catch((refreshError: any) => setError(refreshError.message))} className="flex w-full items-center justify-center gap-2 border-t border-white/10 py-2.5 text-[10px] font-bold text-slate-400 hover:bg-white/[.04]"><RotateCcw className="h-3 w-3" /> Refresh leaderboard</button>
          </div>
        </aside>
      </div>
    </div>
  );
};
