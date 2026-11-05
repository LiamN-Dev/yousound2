import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crown, Trophy, Coins, RefreshCw } from 'lucide-react';

type Stats = { coins: number; highScore: number; totalGames: number };
type LeaderboardEntry = { rank: number; username: string; highScore: number; totalGames: number };
type Props = { url: string; onBack: () => void };

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

export const CrossyRoadGame: React.FC<Props> = ({ url, onBack }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef<string | null>(null);
  const startPendingRef = useRef(false);
  const [stats, setStats] = useState<Stats>({ coins: 0, highScore: 0, totalGames: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const sendAccountUpdate = useCallback((next: Stats) => {
    window.postMessage({ type: 'yousound-crossy-road:account-update', ...next }, window.location.origin);
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
      setStats(account);
      setLeaderboard(board.leaderboard || []);
      setError('');
      sendAccountUpdate(account);
    }).catch((err: any) => { if (active) setError(err?.message || 'Could not load Crossy Road account data.'); });
    return () => { active = false; };
  }, [sendAccountUpdate]);

  const startRun = useCallback(async () => {
    if (runIdRef.current || startPendingRef.current) return;
    startPendingRef.current = true;
    try {
      const started = await api<{ runId: string }>('/start', { method: 'POST', body: '{}' });
      runIdRef.current = started.runId;
      sendAccountUpdate(stats);
      setError('');
    } catch (err: any) {
      runIdRef.current = null;
      setError(err?.message || 'Could not start a saved game session.');
    } finally { startPendingRef.current = false; }
  }, [sendAccountUpdate, stats]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== window || event.data?.type === undefined) return;
      if (event.data?.type === 'yousound-crossy-road:run-started') {
        if (!runIdRef.current && !busy) void startRun();
        return;
      }
      if (event.data?.type !== 'yousound-crossy-road:run-finished') return;
      const runId = runIdRef.current;
      if (!runId || busy) return;
      runIdRef.current = null;
      setBusy(true);
      setMessage('Saving your run…');
      try {
        const result = await api<Stats & { coinsAwarded: number; score: number }>('/finish', {
          method: 'POST',
          body: JSON.stringify({ runId, score: Number(event.data.score) }),
        });
        const next = { coins: result.coins, highScore: result.highScore, totalGames: result.totalGames };
        setStats(next);
        sendAccountUpdate(next);
        setMessage('Run saved · +' + result.coinsAwarded + ' coins');
        await refreshLeaderboard();
        setError('');
      } catch (err: any) {
        setMessage('');
        setError(err?.message || 'Your run could not be saved.');
      } finally { setBusy(false); }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [busy, refreshLeaderboard, sendAccountUpdate, startRun]);

  useEffect(() => {
    let cancelled = false;
    const addedLinks: HTMLLinkElement[] = [];
    const addedScripts: HTMLScriptElement[] = [];
    let gameRoot: HTMLElement | null = null;

    const loadGame = async () => {
      try {
        const response = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
        if (!response.ok) throw new Error('Could not load the self-hosted Crossy Road game (' + response.status + ').');
        const sourceHtml = await response.text();
        const parsed = new DOMParser().parseFromString(sourceHtml, 'text/html');
        const rootTemplate = parsed.getElementById('yousound-crossy-road-root');
        if (!rootTemplate) throw new Error('The Crossy Road build is missing its in-page game root. Redeploy the Cloudflare asset worker.');
        for (const link of Array.from(parsed.querySelectorAll('link[rel="stylesheet"][href]'))) {
          const added = document.createElement('link');
          added.rel = 'stylesheet';
          added.href = new URL(link.getAttribute('href')!, url).href;
          document.head.appendChild(added);
          addedLinks.push(added);
        }
        gameRoot = document.createElement('div');
        gameRoot.id = 'yousound-crossy-road-root';
        gameRoot.className = rootTemplate.className;
        gameRoot.style.position = 'relative';
        gameRoot.style.display = 'flex';
        gameRoot.style.alignItems = 'center';
        gameRoot.style.justifyContent = 'center';
        gameRoot.style.width = '100%';
        gameRoot.style.height = '100%';
        gameRoot.style.minWidth = '0';
        gameRoot.style.minHeight = '0';
        gameRoot.style.margin = '0';
        gameRoot.style.padding = '0';
        gameRoot.style.overflow = 'hidden';
        gameRoot.style.inset = '0';
        if (cancelled || !mountRef.current) return;
        mountRef.current.appendChild(gameRoot);

        const scripts = Array.from(parsed.querySelectorAll('script')).filter((script) => script.src || script.textContent?.trim());
        for (const original of scripts) {
          if (cancelled) return;
          const script = document.createElement('script');
          if (original.type) script.type = original.type;
          if (original.crossOrigin) script.crossOrigin = original.crossOrigin;
          if (original.src) {
            const scriptUrl = new URL(original.getAttribute('src')!, url);
            scriptUrl.searchParams.set('ys_mount', String(Date.now()));
            script.src = scriptUrl.href;
            await new Promise<void>((resolve, reject) => {
              script.onload = () => resolve();
              script.onerror = () => reject(new Error('A Crossy Road game script failed to load.'));
              document.body.appendChild(script);
              addedScripts.push(script);
            });
          } else {
            script.textContent = original.textContent;
            document.body.appendChild(script);
            addedScripts.push(script);
          }
        }
        if (!cancelled) sendAccountUpdate(statsRef.current);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not mount Crossy Road inside YouSound.');
      }
    };

    void loadGame();
    return () => {
      cancelled = true;
      window.dispatchEvent(new Event('yousound-crossy-road:unmount'));
      addedScripts.forEach((script) => script.remove());
      addedLinks.forEach((link) => link.remove());
      gameRoot?.remove();
    };
  }, [sendAccountUpdate, url]);

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
        <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">YOUSOUND ARCADE</div><h2 className="mt-1 text-2xl font-black">Crossy Road</h2><p className="mt-1 text-xs text-slate-400">Original 3D gameplay, saved coins, and account-linked scores.</p></div>
        <div className="text-right text-[10px] text-slate-400">{stats.totalGames.toLocaleString()} saved runs</div>
      </div>
      <div className="bg-black p-1 sm:p-2"><div ref={mountRef} className="relative h-[min(76vh,860px)] min-h-[560px] w-full overflow-hidden rounded-xl bg-[#080d17]" /></div>
      {(message || error) && <div className={'border-t border-white/10 px-4 py-3 text-xs ' + (error ? 'text-rose-300' : 'text-emerald-200')}>{error || message}</div>}
    </section>
    <section className="overflow-hidden rounded-3xl border border-amber-200/20 bg-[#111925] text-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5"><div><div className="flex items-center gap-2 text-amber-200"><Crown className="h-4 w-4"/><h3 className="text-lg font-black">Crossy Road Leaderboard</h3></div><p className="mt-1 text-xs text-slate-400">Top YouSound players by their highest saved run.</p></div><button type="button" onClick={() => void refreshLeaderboard().catch((err:any)=>setError(err.message))} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200"><RefreshCw className="h-3.5 w-3.5"/> Refresh</button></div>
      {leaderboard.length ? <div className="divide-y divide-white/5">{leaderboard.map((entry) => <div key={entry.rank} className="flex items-center gap-3 px-5 py-3"><div className="w-8 text-sm font-black text-amber-200">#{entry.rank}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{entry.username}</div><div className="text-[10px] text-slate-500">{entry.totalGames} runs</div></div><div className="text-right text-sm font-black tabular-nums text-white">{entry.highScore.toLocaleString()}<div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">hops</div></div></div>)}</div> : <div className="p-6 text-center text-xs text-slate-500">No scores yet. Be the first on the leaderboard.</div>}
    </section>
  </div>;
};
