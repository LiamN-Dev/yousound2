import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crown, Trophy, Coins, RefreshCw } from 'lucide-react';

type Stats = { coins: number; highScore: number; totalGames: number };
type LeaderboardEntry = { rank: number; username: string; highScore: number; totalGames: number };

const CROSSY_ROAD_ORIGIN = 'https://yousound-game-assets.liamnystrom9.workers.dev';
const GOOGLE_CROSSY_ROAD_URL = String((import.meta as any).env?.VITE_GOOGLE_CROSSY_ROAD_URL || '').trim();
const YOUSOUND_PARENT_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const CROSSY_ROAD_SRC = GOOGLE_CROSSY_ROAD_URL
  ? (() => {
      try {
        const url = new URL(GOOGLE_CROSSY_ROAD_URL);
        url.searchParams.set('yousoundParentOrigin', YOUSOUND_PARENT_ORIGIN);
        return url.toString();
      } catch { return GOOGLE_CROSSY_ROAD_URL; }
    })()
  : (CROSSY_ROAD_ORIGIN + '/crossy-road/?v=20261108-google-build');
const GOOGLE_SCRIPT_ORIGINS = ['https://script.google.com', 'https://script.googleusercontent.com'];
const GOOGLE_CONFIGURED_ORIGIN = (() => {
  try {
    const url = GOOGLE_CROSSY_ROAD_URL ? new URL(GOOGLE_CROSSY_ROAD_URL) : null;
    return url && GOOGLE_SCRIPT_ORIGINS.includes(url.origin) ? url.origin : '';
  } catch { return ''; }
})();
const CROSSY_ROAD_ALLOWED_ORIGINS = new Set(GOOGLE_CROSSY_ROAD_URL
  ? [...GOOGLE_SCRIPT_ORIGINS, GOOGLE_CONFIGURED_ORIGIN]
  : [CROSSY_ROAD_ORIGIN]);
const CROSSY_ROAD_TARGET_ORIGINS = Array.from(CROSSY_ROAD_ALLOWED_ORIGINS);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/games/crossy-road' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Crossy Road account service is unavailable.');
  return data as T;
}

export const CrossyRoadGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const runIdRef = useRef<string | null>(null);
  const startPendingRef = useRef(false);
  const pendingFinishScoreRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const finishedRunRef = useRef(false);
  const statsRef = useRef<Stats>({ coins: 0, highScore: 0, totalGames: 0 });
  const [stats, setStats] = useState<Stats>(statsRef.current);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  statsRef.current = stats;

  const sendAccountUpdate = useCallback((next: Stats) => {
    CROSSY_ROAD_TARGET_ORIGINS.forEach((origin) => {
      frameRef.current?.contentWindow?.postMessage(
        { type: 'yousound-crossy-road:account-update', ...next },
        origin
      );
    });
  }, []);

  const refreshLeaderboard = useCallback(async () => {
    const data = await api<{ leaderboard: LeaderboardEntry[] }>('/leaderboard');
    setLeaderboard(data.leaderboard || []);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Stats>('/stats'),
      api<{ leaderboard: LeaderboardEntry[] }>('/leaderboard'),
    ]).then(([account, board]) => {
      if (!active) return;
      statsRef.current = account;
      setStats(account);
      setLeaderboard(board.leaderboard || []);
      setError('');
      sendAccountUpdate(account);
    }).catch((err: any) => {
      if (active) setError(err?.message || 'Could not load Crossy Road account data.');
    });
    return () => { active = false; };
  }, [sendAccountUpdate]);

  const finishRun = useCallback(async (score: number) => {
    if (busyRef.current || finishedRunRef.current) return;
    const runId = runIdRef.current;
    if (!runId) {
      if (startPendingRef.current) {
        pendingFinishScoreRef.current = score;
      } else {
        setError('The game result arrived before a saved session was created. Please retry the run.');
      }
      return;
    }

    finishedRunRef.current = true;
    runIdRef.current = null;
    busyRef.current = true;
    setMessage('Saving your run…');

    try {
      const result = await api<Stats & { coinsAwarded: number; score: number }>('/finish', {
        method: 'POST',
        body: JSON.stringify({ runId, score }),
      });
      const next = { coins: result.coins, highScore: result.highScore, totalGames: result.totalGames };
      statsRef.current = next;
      setStats(next);
      sendAccountUpdate(next);
      setMessage('Run saved · +' + result.coinsAwarded + ' coins');
      await refreshLeaderboard();
      setError('');
    } catch (err: any) {
      setMessage('');
      setError(err?.message || 'Your run could not be saved.');
    } finally {
      busyRef.current = false;
    }
  }, [refreshLeaderboard, sendAccountUpdate]);

  const startRun = useCallback(async () => {
    if (runIdRef.current || startPendingRef.current || busyRef.current) return;
    startPendingRef.current = true;
    try {
      const started = await api<{ runId: string }>('/start', { method: 'POST', body: '{}' });
      runIdRef.current = started.runId;
      finishedRunRef.current = false;
      sendAccountUpdate(statsRef.current);
      setError('');
      const pendingScore = pendingFinishScoreRef.current;
      if (pendingScore !== null) {
        pendingFinishScoreRef.current = null;
        void finishRun(pendingScore);
      }
    } catch (err: any) {
      pendingFinishScoreRef.current = null;
      runIdRef.current = null;
      setError(err?.message || 'Could not start a saved game session.');
    } finally {
      startPendingRef.current = false;
    }
  }, [finishRun, sendAccountUpdate]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!CROSSY_ROAD_ALLOWED_ORIGINS.has(event.origin)) return;
      const type = event.data?.type;

      if (type === 'yousound-crossy-road:ready') {
        sendAccountUpdate(statsRef.current);
        return;
      }
      if (type === 'yousound-crossy-road:run-started') {
        void startRun();
        return;
      }
      if (type === 'yousound-crossy-road:run-finished') {
        const score = Number(event.data.score);
        if (Number.isSafeInteger(score) && score >= 0 && score <= 10000) {
          void finishRun(score);
        } else {
          setError('The game returned an invalid score.');
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finishRun, sendAccountUpdate, startRun]);

  return <div className="mx-auto max-w-6xl space-y-4 pb-24">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#10162a] px-3 py-2 text-xs font-bold text-slate-200"><ArrowLeft className="h-4 w-4"/> VIP Arcade</button>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-xl border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-xs font-black text-yellow-100"><Coins className="h-4 w-4"/> {stats.coins.toLocaleString()} coins</span>
        <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-100/10 px-3 py-2 text-xs font-black text-amber-100"><Trophy className="h-4 w-4"/> Best: {stats.highScore.toLocaleString()}</span>
      </div>
    </div>
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#090f1c] text-white shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
        <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">YOUSOUND ARCADE</div><h2 className="mt-1 text-2xl font-black">Crossy Road</h2><p className="mt-1 text-xs text-slate-400">Voxel-style crossing gameplay, with YouSound coins and best runs synced to your account.</p></div>
        <div className="text-right text-[10px] text-slate-400">{stats.totalGames.toLocaleString()} saved runs</div>
      </div>
      <div className="bg-black p-1 sm:p-2">
        <div className="relative h-[min(76vh,860px)] min-h-[560px] w-full overflow-hidden rounded-xl bg-[#87C6FF]">
          <iframe
            ref={frameRef}
            title="Crossy Road"
            src={CROSSY_ROAD_SRC}
            className="block h-full w-full border-0 bg-[#87C6FF]"
            allow="autoplay; fullscreen; gamepad"
            allowFullScreen
          />
        </div>
      </div>
      {!GOOGLE_CROSSY_ROAD_URL && <div className="border-t border-amber-300/15 bg-amber-300/[.04] px-4 py-3 text-[11px] leading-5 text-amber-100/80">
        This build is loading Crossy Road from Cloudflare. Some school networks block that host. To use the Google-hosted build, set the Render build variable <code className="rounded bg-black/30 px-1">VITE_GOOGLE_CROSSY_ROAD_URL</code> to your approved Apps Script web-app <code className="rounded bg-black/30 px-1">/exec</code> URL. Your school may still need to allow the official Apps Script domains.
      </div>}
      {(message || error) && <div className={'border-t border-white/10 px-4 py-3 text-xs ' + (error ? 'text-rose-300' : 'text-emerald-200')}>{error || message}</div>}
    </section>
    <section className="overflow-hidden rounded-3xl border border-amber-200/20 bg-[#111925] text-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5"><div><div className="flex items-center gap-2 text-amber-200"><Crown className="h-4 w-4"/><h3 className="text-lg font-black">Crossy Road Leaderboard</h3></div><p className="mt-1 text-xs text-slate-400">Top YouSound players by their highest saved run.</p></div><button type="button" onClick={() => void refreshLeaderboard().catch((err:any)=>setError(err.message))} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200"><RefreshCw className="h-3.5 w-3.5"/> Refresh</button></div>
      {leaderboard.length ? <div className="divide-y divide-white/5">{leaderboard.map((entry) => <div key={entry.rank} className="flex items-center gap-3 px-5 py-3"><div className="w-8 text-sm font-black text-amber-200">#{entry.rank}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{entry.username}</div><div className="text-[10px] text-slate-500">{entry.totalGames} runs</div></div><div className="text-right text-sm font-black tabular-nums text-white">{entry.highScore.toLocaleString()}<div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">hops</div></div></div>)}</div> : <div className="p-6 text-center text-xs text-slate-500">No scores yet. Be the first on the leaderboard.</div>}
    </section>
  </div>;
};
