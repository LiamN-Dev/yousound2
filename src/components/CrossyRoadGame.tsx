import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, Trophy, X } from 'lucide-react';

type Stats = { coins: number; highScore: number; totalGames: number };
type LeaderboardEntry = { rank: number; username: string; highScore: number; totalGames: number };

async function api<T,>(path: string): Promise<T> {
  const response = await fetch('/api/games/crossy-road' + path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Crossy Road account data is unavailable.');
  return data as T;
}

export const CrossyRoadGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [stats, setStats] = useState<Stats>({ coins: 0, highScore: 0, totalGames: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshAccount = useCallback(async () => {
    const [account, board] = await Promise.all([
      api<Stats>('/stats'),
      api<{ leaderboard: LeaderboardEntry[] }>('/leaderboard'),
    ]);
    setStats(account);
    setLeaderboard(Array.isArray(board.leaderboard) ? board.leaderboard : []);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refreshAccount().then(() => {
      if (active) setError('');
    }).catch((loadError: any) => {
      if (active) setError(loadError?.message || 'Could not load your Crossy Road account.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshAccount]);

  useEffect(() => {
    const onGameMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== 'crossy-road:score-saved' || typeof data.stats !== 'object') return;
      const next = data.stats as Stats;
      if (!Number.isFinite(next.highScore) || !Number.isFinite(next.coins) || !Number.isFinite(next.totalGames)) return;
      setStats(next);
      setNotice('Score saved to your YouSound account' + (Number.isFinite(data.coinsAwarded) && data.coinsAwarded > 0 ? ' · +' + data.coinsAwarded + ' coins' : ''));
      void api<{ leaderboard: LeaderboardEntry[] }>('/leaderboard')
        .then(board => setLeaderboard(Array.isArray(board.leaderboard) ? board.leaderboard : []))
        .catch(() => undefined);
    };
    window.addEventListener('message', onGameMessage);
    return () => window.removeEventListener('message', onGameMessage);
  }, []);

  const refreshLeaderboard = async () => {
    try {
      const board = await api<{ leaderboard: LeaderboardEntry[] }>('/leaderboard');
      setLeaderboard(Array.isArray(board.leaderboard) ? board.leaderboard : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not refresh the leaderboard.');
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f5f2e9] text-[#17281c]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-[#fffdf5] px-3 py-3 shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-[#253126] shadow-sm transition hover:bg-[#f1f3e9]">
            <ArrowLeft className="h-4 w-4" /> Arcade
          </button>
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold leading-none tracking-tight sm:text-xl">Crossy Road</div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[.18em] text-[#6d865e]">3D YouSound Arcade</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden min-w-20 rounded-xl border border-black/10 bg-white px-3 py-2 text-right sm:block">
            <div className="text-[8px] font-bold uppercase tracking-wider text-black/40">Personal best</div>
            <div className="text-sm font-black tabular-nums">{stats.highScore.toLocaleString()}</div>
          </div>
          <div className="hidden min-w-20 rounded-xl border border-black/10 bg-white px-3 py-2 text-right sm:block">
            <div className="text-[8px] font-bold uppercase tracking-wider text-black/40">Coins</div>
            <div className="text-sm font-black tabular-nums">{stats.coins.toLocaleString()}</div>
          </div>
          <button type="button" onClick={() => { setShowLeaderboard(true); void refreshLeaderboard(); }} className="inline-flex items-center gap-2 rounded-xl bg-[#263b2b] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#17281c]">
            <Trophy className="h-4 w-4" /><span className="hidden sm:inline">Leaderboard</span><span className="sm:hidden">Ranks</span>
          </button>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 bg-[#cfe9f6]">
        <iframe
          ref={iframeRef}
          title="YouSound Crossy Road 3D game"
          src="/games/crossy-road/index.html"
          onLoad={() => setFrameLoaded(true)}
          className="h-full w-full border-0 bg-[#87c6ff]"
          allow="fullscreen; autoplay"
          allowFullScreen
          referrerPolicy="same-origin"
        />
        {!frameLoaded && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#cfe9f6]">
            <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white/85 px-5 py-4 text-xs font-semibold text-[#263b2b] shadow-lg">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading 3D Crossy Road…
            </div>
          </div>
        )}
        {loading && <div className="absolute bottom-3 left-3 rounded-lg bg-white/80 px-3 py-2 text-[10px] text-[#263b2b]"><Loader2 className="mr-1 inline h-3 w-3 animate-spin"/>Syncing account…</div>}
        {!!error && <div role="alert" className="absolute bottom-3 left-3 right-3 rounded-xl border border-rose-300 bg-rose-50/95 p-3 text-xs text-rose-800 shadow-lg">{error}</div>}
        {!!notice && <div role="status" className="absolute bottom-3 right-3 max-w-[70%] rounded-xl border border-emerald-300 bg-emerald-50/95 px-3 py-2 text-[10px] font-semibold text-emerald-800 shadow-lg">{notice}</div>}
      </main>

      {showLeaderboard && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#14281c]/65 p-4 backdrop-blur-sm">
          <section className="flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/70 bg-[#fffdf5] text-[#17281c] shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/[.08] px-5 py-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[#718e4f]" />
                <div><h2 className="text-base font-black">Crossy Road leaderboard</h2><p className="text-[9px] uppercase tracking-wider text-black/40">Top 25 YouSound players</p></div>
              </div>
              <button type="button" onClick={() => setShowLeaderboard(false)} aria-label="Close leaderboard" className="rounded-lg p-2 text-black/50 transition hover:bg-black/[.05] hover:text-black"><X className="h-4 w-4"/></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {leaderboard.length ? leaderboard.slice(0,25).map((entry,index) => (
                <div key={entry.rank || index} className="flex items-center gap-3 border-b border-black/[.05] px-5 py-3 last:border-0">
                  <span className="w-8 text-center text-xs font-black tabular-nums text-[#718e4f]">#{entry.rank || index+1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{entry.username}</span>
                  <span className="text-xs font-black tabular-nums">{entry.highScore.toLocaleString()}</span>
                </div>
              )) : <div className="p-8 text-center text-xs text-black/45">No scores yet. Be the first!</div>}
            </div>
            <div className="border-t border-black/[.08] p-3">
              <button type="button" onClick={() => void refreshLeaderboard()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e9efdf] px-3 py-2.5 text-[10px] font-black text-[#324c32] transition hover:bg-[#dce8cf]"><RefreshCw className="h-3.5 w-3.5" /> Refresh scores</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
