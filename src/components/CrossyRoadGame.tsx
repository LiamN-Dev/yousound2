import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crown, RotateCcw, Trophy, X } from 'lucide-react';
import { CrossyRoad3DView } from './CrossyRoad3DView';

type Direction = 'up' | 'down' | 'left' | 'right';
type LaneKind = 'grass' | 'road' | 'river';
type MovingObject = { id: string; x: number; length: number };
type Lane = { row: number; kind: LaneKind; direction: 1 | -1; speed: number; objects: MovingObject[]; spawnIn: number; trees?: number[] };
type GameState = { x: number; row: number; lanes: Lane[]; score: number; running: boolean; gameOver: boolean };
type Stats = { coins: number; highScore: number; totalGames: number };
type LeaderboardEntry = { rank: number; username: string; highScore: number; totalGames: number };

const COLS = 9;
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
    return { row, kind: 'grass', direction: 1, speed: 0, objects: [], spawnIn: 0, trees: [] };
  }
  const roll = Math.random();
  const kind: LaneKind = roll < 0.58 ? 'road' : roll < 0.82 ? 'river' : 'grass';
  if (kind === 'grass') {
    const treeCount = 1 + Math.floor(Math.random() * 2);
    const trees = [...new Set(Array.from({ length: treeCount }, () => Math.floor(Math.random() * COLS)))];
    return { row, kind, direction: 1, speed: 0, objects: [], spawnIn: 0, trees };
  }
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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
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
    const destinationLane = next.lanes.find(lane => lane.row === next.row);
    if (destinationLane?.kind === 'grass' && destinationLane.trees?.includes(next.x)) {
      return;
    }
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



  return (
    <div className="fixed inset-0 z-[130] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f5f2e9] text-[#141a12]">
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
          <button type="button" onClick={() => setShowLeaderboard(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#263b2b] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#17281c]">
            <Trophy className="h-4 w-4" /><span className="hidden sm:inline">Leaderboard</span>
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 px-3 pb-3 sm:px-5 lg:flex-row lg:items-center lg:gap-9 lg:px-8 lg:py-5">
        <aside className="flex shrink-0 flex-row items-center justify-between gap-3 rounded-2xl border border-black/[.07] bg-white/75 p-3 shadow-sm lg:w-[245px] lg:flex-col lg:items-stretch lg:justify-start lg:gap-5 lg:rounded-[26px] lg:p-5">
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
            <p className="mt-2 text-[11px] leading-5 text-black/55">Use arrow keys or WASD on your keyboard. On touch screens, use the directional pad over the game.</p>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold text-[#526b4c]"><Crown className="h-4 w-4" /> Scores save to your YouSound account</div>
          </div>
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[26px] border border-black/10 bg-[#cfe9f6] shadow-[0_40px_80px_-45px_rgba(25,40,20,0.7)] lg:aspect-[4/5] lg:max-h-[82vh] lg:w-[500px] lg:flex-none">
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
              <div className="h-[94%] max-h-[640px] max-w-full overflow-hidden rounded-[18px] border-4 border-white/65 bg-[#245438] shadow-[0_12px_35px_rgba(12,35,27,.25)]" style={{ aspectRatio: '9 / 11' }}>
                <CrossyRoad3DView game={game} />
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
                <p className="mt-2 text-[10px] leading-5 text-black/55">{message || 'Your run has ended. Your score is saved to your account.'}</p>
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

      {(error || message) && (
        <div className="shrink-0 px-4 pb-2 text-center text-[10px]">
          <span className={error ? 'text-rose-700' : 'text-[#4d7041]'}>{error || message}</span>
        </div>
      )}
    </div>
  );
};
