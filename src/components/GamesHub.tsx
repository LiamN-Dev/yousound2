import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { VoxelHopperGame } from './VoxelHopperGame';
import { InfiniteCraftGame } from './InfiniteCraftGame';
import { ArrowLeft, ArrowUpRight, ExternalLink, Gamepad2, Globe2, Loader2, Play, RefreshCw, ShieldCheck, Star, Users } from 'lucide-react';

type LaunchMode = 'new-tab' | 'embedded' | 'native';
type ArcadeGame = {
  id: 'crossy-road' | 'infinite-craft' | 'orbitalvision';
  title: string;
  description: string;
  enabled: boolean;
  featured: boolean;
  launchUrl: string;
  launchMode: LaunchMode;
  playerMode: 'solo' | 'multiplayer' | 'solo & multiplayer';
  providerLabel: string;
};
type LaunchEvent = {
  id: string;
  gameId: string;
  username: string;
  userId: string;
  launchedAt: string;
};

type Props = { isAdmin: boolean };
type CrossyRank = { username: string; wins: number; bestCheckpoint: number; races: number };
type CraftRank = { rank: number; username: string; score: number; discoveries: number; combinations: number; raceWins: number };
type CrossyHighScoreRank = { rank: number; username: string; highScore: number; totalGames: number };

const gameArtwork: Record<string, string> = {
  'crossy-road': 'from-emerald-950 via-green-900 to-slate-950',
  'infinite-craft': 'from-indigo-950 via-violet-900 to-slate-950',
  orbitalvision: 'from-slate-950 via-sky-950 to-indigo-950',
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'The Arcade request failed.');
  return data;
}

export const GamesHub: React.FC<Props> = ({ isAdmin }) => {
  const [tab, setTab] = useState<'arcade' | 'leaderboards' | 'control'>('arcade');
  const [games, setGames] = useState<ArcadeGame[]>([]);
  const [recentLaunches, setRecentLaunches] = useState<LaunchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [embeddedGame, setEmbeddedGame] = useState<ArcadeGame | null>(null);
  const [crossyRoadOpen, setCrossyRoadOpen] = useState(false);
  const [infiniteCraftOpen, setInfiniteCraftOpen] = useState(false);
  const [crossyLeaderboard, setCrossyLeaderboard] = useState<CrossyRank[]>([]);
  const [craftLeaderboard, setCraftLeaderboard] = useState<CraftRank[]>([]);
  const [crossyHighScoreLeaderboard, setCrossyHighScoreLeaderboard] = useState<CrossyHighScoreRank[]>([]);
  const [crossyLeaderboardError, setCrossyLeaderboardError] = useState('');
  const [craftLeaderboardError, setCraftLeaderboardError] = useState('');
  const [crossyHighScoreError, setCrossyHighScoreError] = useState('');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string }>({ enabled: false, message: '' });
  const [stopAllMultiplayer, setStopAllMultiplayer] = useState(false);
  const [maintenanceDraft, setMaintenanceDraft] = useState('The YouSound Arcade is temporarily under maintenance. Please check back soon.');
  const [operationsSaving, setOperationsSaving] = useState(false);
  const [leaderboardClearBusy, setLeaderboardClearBusy] = useState('');

  const loadCatalog = async () => {
    setLoading(true);
    setError('');
    try {
      const catalog = await readJson(await fetch('/api/games/catalog', { credentials: 'same-origin', cache: 'no-store' }));
      setGames(Array.isArray(catalog.games) ? catalog.games : []);
      setMaintenance(catalog.maintenance || { enabled: false, message: '' });
      if (isAdmin) {
        const overview = await readJson(await fetch('/api/admin/games/overview', { credentials: 'same-origin', cache: 'no-store' }));
        setGames(Array.isArray(overview.games) ? overview.games : []);
        setRecentLaunches(Array.isArray(overview.recentLaunches) ? overview.recentLaunches : []);
        const operations = await readJson(await fetch('/api/admin/games/operations', { credentials: 'same-origin', cache: 'no-store' }));
        setStopAllMultiplayer(operations.stopAllMultiplayer === true);
        setMaintenance(operations.maintenance || { enabled: false, message: '' });
        setMaintenanceDraft(operations.maintenance?.message || 'The YouSound Arcade is temporarily under maintenance. Please check back soon.');
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'The Arcade could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCatalog(); }, [isAdmin]);

  const activeGames = useMemo(() => games.filter((game) => game.enabled), [games]);

  const loadLeaderboards = useCallback(async () => {
    setLeaderboardLoading(true);
    const [crossyResult, crossyHighScoreResult, craftResult] = await Promise.allSettled([
      fetch('/api/games/crossy-road/leaderboard', { credentials: 'same-origin', cache: 'no-store' }).then(readJson),
      fetch('/api/games/crossy-road/high-score-leaderboard', { credentials: 'same-origin', cache: 'no-store' }).then(readJson),
      fetch('/api/games/infinite-craft/leaderboard', { credentials: 'same-origin', cache: 'no-store' }).then(readJson),
    ]);
    if (crossyResult.status === 'fulfilled') {
      setCrossyLeaderboard(Array.isArray(crossyResult.value.leaderboard) ? crossyResult.value.leaderboard : []);
      setCrossyLeaderboardError('');
    } else {
      setCrossyLeaderboard([]);
      setCrossyLeaderboardError(crossyResult.reason?.message || 'Crossy Road race leaderboard is unavailable.');
    }
    if (crossyHighScoreResult.status === 'fulfilled') {
      setCrossyHighScoreLeaderboard(Array.isArray(crossyHighScoreResult.value.leaderboard) ? crossyHighScoreResult.value.leaderboard : []);
      setCrossyHighScoreError('');
    } else {
      setCrossyHighScoreLeaderboard([]);
      setCrossyHighScoreError(crossyHighScoreResult.reason?.message || 'Crossy Road high-score leaderboard is unavailable.');
    }
    if (craftResult.status === 'fulfilled') {
      setCraftLeaderboard(Array.isArray(craftResult.value.leaderboard) ? craftResult.value.leaderboard : []);
      setCraftLeaderboardError('');
    } else {
      setCraftLeaderboard([]);
      setCraftLeaderboardError(craftResult.reason?.message || 'Infinite Craft leaderboard is unavailable.');
    }
    setLeaderboardLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'leaderboards') void loadLeaderboards();
  }, [tab, loadLeaderboards]);

  const recordLaunch = (gameId: string) => {
    void fetch('/api/games/launch', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
      keepalive: true,
    }).catch(() => undefined);
  };

  const playGame = (game: ArcadeGame) => {
    if (!game.enabled || embeddedGame || maintenance.enabled) return;
    recordLaunch(game.id);
    if (game.id === 'crossy-road') {
      setCrossyRoadOpen(true);
      return;
    }
    if (game.id === 'infinite-craft') {
      setInfiniteCraftOpen(true);
      return;
    }
    if (game.id === 'orbitalvision') {
      setEmbeddedGame(game);
      return;
    }
    if (game.launchMode === 'embedded') {
      setEmbeddedGame(game);
      return;
    }
    window.open(game.launchUrl, '_blank', 'noopener,noreferrer');
    setNotice('Requested a new tab for ' + game.title + '. If it did not open, allow pop-ups for YouSound. The game is hosted by its original provider.');
  };

  const saveOperations = async (patch: Record<string, unknown>) => {
    setOperationsSaving(true);
    setError('');
    try {
      const data = await readJson(await fetch('/api/admin/games/operations', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      }));
      setStopAllMultiplayer(data.stopAllMultiplayer === true);
      setMaintenance(data.maintenance || { enabled: false, message: '' });
      setMaintenanceDraft(data.maintenance?.message || maintenanceDraft);
      setNotice(patch.stopAllMultiplayer === true ? 'All active Arcade multiplayer rooms have been ended.' : patch.maintenanceEnabled === true ? 'Arcade maintenance is now enabled.' : 'Arcade operations settings saved.');
    } catch (saveError: any) {
      setError(saveError?.message || 'Arcade operations could not be saved.');
    } finally { setOperationsSaving(false); }
  };

  const clearLeaderboard = async (target: string) => {
    const labels: Record<string, string> = { 'crossy-races': 'Crossy Road race', 'crossy-solo': 'Crossy Road solo high-score', 'infinite-craft': 'Infinite Craft', all: 'all Arcade' };
    const label = labels[target] || 'selected';
    if (!window.confirm('Clear the ' + label + ' leaderboard? This cannot be undone. Account discovery collections will be retained.')) return;
    setLeaderboardClearBusy(target); setError('');
    try {
      await readJson(await fetch('/api/admin/games/leaderboards/clear', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }),
      }));
      setNotice('Cleared ' + label + ' leaderboard.');
      await loadLeaderboards();
    } catch (clearError: any) { setError(clearError?.message || 'Could not clear that leaderboard.'); }
    finally { setLeaderboardClearBusy(''); }
  };

  const updateGame = (id: ArcadeGame['id'], patch: Partial<ArcadeGame>) => {
    setGames((current) => current.map((game) => game.id === id ? { ...game, ...patch } : game));
  };

  const saveCatalog = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const data = await readJson(await fetch('/api/admin/games/catalog', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games }),
      }));
      setGames(Array.isArray(data.games) ? data.games : games);
      setNotice('Arcade activation settings saved. Inactive games are hidden from members.');
      await loadCatalog();
      setTab('control');
    } catch (saveError: any) {
      setError(saveError?.message || 'The Arcade settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (crossyRoadOpen) return <VoxelHopperGame onBack={() => setCrossyRoadOpen(false)} />;

  if (infiniteCraftOpen) return <InfiniteCraftGame onBack={() => setInfiniteCraftOpen(false)} />;


  if (embeddedGame) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 pb-24">
        <button type="button" onClick={() => setEmbeddedGame(null)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back to Arcade
        </button>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
            <div className="font-bold">{embeddedGame.title}</div>
            <a href={embeddedGame.launchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-cyan-300 hover:text-white">Open separately <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
          <iframe
            title={embeddedGame.title}
            src={embeddedGame.launchUrl}
            className="h-[78vh] min-h-[520px] w-full bg-black"
            allow="fullscreen; autoplay"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <p className="text-xs text-slate-500">Embedded games must be hosted by a provider that permits YouSound in its frame policy. Third-party games are opened only at their configured provider or self-hosted game address.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-28 animate-in fade-in">
      <section className="relative overflow-hidden rounded-[30px] border border-cyan-300/20 bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.2em] text-cyan-100">
            <Gamepad2 className="h-4 w-4" /> YouSound Arcade
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Play together. <span className="text-cyan-200">Discover more.</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Play Crossy Road solo or with friends, discover combinations with AI in Infinite Craft, or explore live Earth and orbital data in OrbitalVision 3D.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-200">{activeGames.length} ACTIVATED GAME{activeGames.length === 1 ? '' : 'S'}</span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-200">CHROME BROWSER</span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTab('arcade')} className={'rounded-xl px-4 py-2 text-xs font-bold transition ' + (tab === 'arcade' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}>Arcade</button>
        <button type="button" onClick={() => setTab('leaderboards')} className={'rounded-xl px-4 py-2 text-xs font-bold transition ' + (tab === 'leaderboards' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}>Leaderboards</button>
        {isAdmin && <button type="button" onClick={() => setTab('control')} className={'rounded-xl px-4 py-2 text-xs font-bold transition ' + (tab === 'control' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}>Game Control & Activity</button>}
      </div>

      {error && <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {notice && <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-100">{notice}</div>}
      {maintenance.enabled && <div role="status" className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100"><strong>Arcade maintenance</strong>{maintenance.message ? ' — ' + maintenance.message : ' — games are temporarily unavailable.'}</div>}

      {tab === 'arcade' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-12 text-sm text-slate-300"><Loader2 className="h-5 w-5 animate-spin" /> Loading activated games…</div>
          ) : activeGames.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-10 text-center">
              <Gamepad2 className="mx-auto h-10 w-10 text-slate-500" />
              <h2 className="mt-4 text-xl font-bold text-white">No games are active right now</h2>
              <p className="mt-2 text-sm text-slate-400">The administrator has not published any games yet.</p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {activeGames.map((game) => (
                <article key={game.id} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-xl">
                  <div className={'relative flex min-h-44 items-end bg-gradient-to-br p-5 ' + (gameArtwork[game.id] || 'from-slate-800 to-slate-950')}>
                    <div className="absolute right-5 top-5 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">{game.featured ? 'Featured' : 'Activated'}</div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[.2em] text-white/70">{game.providerLabel}</div>
                      <h2 className="mt-2 text-3xl font-black text-white">{game.title}</h2>
                    </div>
                  </div>
                  <div className="space-y-4 p-5">
                    <p className="text-sm leading-6 text-slate-300">{game.description}</p>
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-slate-200">
                        {game.playerMode === 'multiplayer' ? <Users className="h-3.5 w-3.5" /> : <Gamepad2 className="h-3.5 w-3.5" />}
                        {game.playerMode === 'multiplayer' ? 'Multiplayer' : 'Solo'}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-slate-200"><Globe2 className="h-3.5 w-3.5" /> Browser game</span>
                    </div>
                    <button type="button" onClick={() => playGame(game)} disabled={maintenance.enabled} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">
                      <Play className="h-4 w-4 fill-current" /> Play {game.title}
                      {game.launchMode === 'new-tab' && <ArrowUpRight className="h-4 w-4" />}
                    </button>
                    {game.launchMode === 'new-tab' && <p className="text-[11px] text-slate-500">Opens the real game at its provider. School network filters may still restrict the provider's domain.</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'leaderboards' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-white">Arcade Leaderboards</h2>
              <p className="mt-1 text-sm text-slate-400">Account-based results saved by YouSound across games.</p>
            </div>
            <button type="button" onClick={() => void loadLeaderboards()} disabled={leaderboardLoading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={'h-4 w-4 ' + (leaderboardLoading ? 'animate-spin' : '')} /> Refresh
            </button>
          </div>
          <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            <section className="rounded-3xl border border-emerald-300/20 bg-slate-950 p-5 text-white shadow-xl">
              <h3 className="text-lg font-black text-emerald-300">Crossy Road Race</h3>
              <p className="mt-1 text-xs text-slate-400">Ranked by wins, then best checkpoint reached.</p>
              {crossyLeaderboardError && <p className="mt-3 text-xs text-amber-300">{crossyLeaderboardError}</p>}
              <div className="mt-4 space-y-2">
                {crossyLeaderboard.length ? crossyLeaderboard.map((entry, index) => (
                  <div key={entry.username + index} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[.03] px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3"><span className="w-6 text-xs font-black text-slate-500">{index + 1}</span><span className="truncate text-sm font-bold">{entry.username}</span></div>
                    <div className="shrink-0 text-right text-xs"><span className="font-black text-amber-300">{entry.wins} wins</span><div className="text-slate-400">{entry.races} races · CP {entry.bestCheckpoint}/5</div></div>
                  </div>
                )) : <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No Crossy Road race results yet.</p>}
              </div>
            </section>
            <section className="rounded-3xl border border-emerald-200/20 bg-slate-950 p-5 text-white shadow-xl">
              <h3 className="text-lg font-black text-emerald-200">Crossy Road · High Scores</h3>
              <p className="mt-1 text-xs text-slate-400">Best solo runs saved to YouSound accounts.</p>
              {crossyHighScoreError && <p className="mt-3 text-xs text-amber-300">{crossyHighScoreError}</p>}
              <div className="mt-4 space-y-2">
                {crossyHighScoreLeaderboard.length ? crossyHighScoreLeaderboard.map((entry, index) => (
                  <div key={entry.username + index} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[.03] px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3"><span className="w-6 text-xs font-black text-slate-500">{index + 1}</span><span className="truncate text-sm font-bold">{entry.username}</span></div>
                    <div className="shrink-0 text-right text-xs"><span className="font-black text-emerald-200">{entry.highScore.toLocaleString()} rows</span><div className="text-slate-400">{entry.totalGames} runs</div></div>
                  </div>
                )) : <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No Crossy Road high scores yet.</p>}
              </div>
            </section>
            <section className="rounded-3xl border border-violet-300/20 bg-slate-950 p-5 text-white shadow-xl">
              <h3 className="text-lg font-black text-violet-300">Infinite Craft</h3>
              <p className="mt-1 text-xs text-slate-400">Ranked by discovery score, then discovered items and race wins.</p>
              {craftLeaderboardError && <p className="mt-3 text-xs text-amber-300">{craftLeaderboardError}</p>}
              <div className="mt-4 space-y-2">
                {craftLeaderboard.length ? craftLeaderboard.map((entry, index) => (
                  <div key={entry.username + index} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[.03] px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3"><span className="w-6 text-xs font-black text-slate-500">{index + 1}</span><span className="truncate text-sm font-bold">{entry.username}</span></div>
                    <div className="shrink-0 text-right text-xs"><span className="font-black text-amber-300">{entry.score.toLocaleString()} pts</span><div className="text-slate-400">{entry.discoveries} discoveries · {entry.raceWins} race wins</div></div>
                  </div>
                )) : <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No Infinite Craft discoveries yet.</p>}
              </div>
            </section>
          </div>
        </section>
      )}

      {tab === 'control' && isAdmin && (
        <section className="space-y-5 rounded-3xl border border-cyan-200/20 bg-slate-950/80 p-5 shadow-xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">Game Control Room</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">Publish or unpublish each game. Unpublished games are hidden from members and rejected by the game-launch API.</p>
            </div>
            <button type="button" onClick={() => void loadCatalog()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
          <div className="space-y-4">
            {games.map((game) => (
              <div key={game.id} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-white">{game.title}</h3>
                      <span className="rounded-md border border-white/10 px-2 py-1 text-[9px] font-bold uppercase text-slate-400">{game.playerMode}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{game.description}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white">
                    <input type="checkbox" checked={game.enabled} onChange={(event) => updateGame(game.id, { enabled: event.target.checked, featured: event.target.checked && game.featured })} className="h-4 w-4 accent-cyan-300" />
                    {game.enabled ? 'Activated' : 'Inactive'}
                  </label>
                </div>
                <label className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <input type="checkbox" checked={game.featured} disabled={!game.enabled} onChange={(event) => updateGame(game.id, { featured: event.target.checked })} className="h-4 w-4 accent-cyan-300" />
                  Feature this game in the Arcade
                  <Star className="h-3.5 w-3.5 text-amber-300" />
                </label>
                {game.id === 'crossy-road' ? (
                  <div className="mt-4 rounded-xl border border-emerald-200/15 bg-emerald-300/5 p-3 text-xs leading-5 text-emerald-100">
                    Native 3D Crossy Road. Multiplayer races use six-character room codes, five checkpoints, and three lives per checkpoint.
                  </div>
                ) : game.id === 'infinite-craft' ? (
                  <div className="mt-4 rounded-xl border border-violet-200/15 bg-violet-300/5 p-3 text-xs leading-5 text-violet-100">
                    Infinite Craft uses AI to judge each new ingredient pair, returning a recognizable noun and emoji or rejecting the combination. Account discoveries and one-point combines are saved on the YouSound backend.
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-sky-200/15 bg-sky-300/5 p-3 text-xs leading-5 text-sky-100">
                    OrbitalVision 3D is served directly from YouSound. It includes the uploaded live 3D Earth, satellite catalogs, orbit propagation, observer controls and telemetry interface.
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-[11px] text-slate-500">Only activated games can be launched, including by administrators.</p>
            <button type="button" onClick={() => void saveCatalog()} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-xs font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save game settings
            </button>
          </div>
          <div className="border-t border-white/10 pt-5 space-y-4">
            <div>
              <h3 className="text-base font-black text-white">Multiplayer & Maintenance</h3>
              <p className="mt-1 text-[11px] text-slate-500">These controls affect everyone using the Arcade. Ending multiplayer rooms does not delete players’ saved accounts or discoveries.</p>
            </div>
            <label className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm text-white">
              <span><span className="block font-bold">Stop all multiplayer games</span><span className="block text-[11px] text-slate-400">Ends all active Crossy Road and Infinite Craft rooms and blocks new rooms.</span></span>
              <input type="checkbox" checked={stopAllMultiplayer} onChange={(event) => {
                const enabled = event.target.checked;
                if (enabled && !window.confirm('End every active multiplayer room and block new multiplayer games?')) return;
                void saveOperations({ stopAllMultiplayer: enabled });
              }} className="h-5 w-5 accent-rose-400" />
            </label>
            <label className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm text-white">
              <span><span className="block font-bold">Arcade maintenance mode</span><span className="block text-[11px] text-slate-400">Stops game launches and multiplayer APIs for all members until switched off.</span></span>
              <input type="checkbox" checked={maintenance.enabled} onChange={(event) => {
                const enabled = event.target.checked;
                if (enabled && !window.confirm('Put the entire Arcade under maintenance for everyone?')) return;
                void saveOperations({ maintenanceEnabled: enabled, maintenanceMessage: maintenanceDraft });
              }} className="h-5 w-5 accent-amber-300" />
            </label>
            <label className="block space-y-1 text-xs font-semibold text-slate-300">
              Maintenance message
              <input value={maintenanceDraft} onChange={(event) => setMaintenanceDraft(event.target.value)} maxLength={240} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50" />
            </label>
            <button type="button" onClick={() => void saveOperations({ maintenanceEnabled: maintenance.enabled, maintenanceMessage: maintenanceDraft })} disabled={operationsSaving} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50">
              {operationsSaving ? 'Saving…' : 'Save maintenance message'}
            </button>
          </div>
          <div className="border-t border-white/10 pt-5 space-y-3">
            <div>
              <h3 className="text-base font-black text-white">Leaderboard management</h3>
              <p className="mt-1 text-[11px] text-slate-500">Clearing Infinite Craft resets leaderboard points and combination counts but keeps each user’s saved discovery collection. Crossy Road account coins are not removed.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void clearLeaderboard('crossy-races')} disabled={Boolean(leaderboardClearBusy)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50">{leaderboardClearBusy === 'crossy-races' ? 'Clearing…' : 'Clear Crossy Road races'}</button>
              <button type="button" onClick={() => void clearLeaderboard('crossy-solo')} disabled={Boolean(leaderboardClearBusy)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50">{leaderboardClearBusy === 'crossy-solo' ? 'Clearing…' : 'Clear Crossy Road solo'}</button>
              <button type="button" onClick={() => void clearLeaderboard('infinite-craft')} disabled={Boolean(leaderboardClearBusy)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50">{leaderboardClearBusy === 'infinite-craft' ? 'Clearing…' : 'Clear Infinite Craft'}</button>
              <button type="button" onClick={() => void clearLeaderboard('all')} disabled={Boolean(leaderboardClearBusy)} className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-200 hover:bg-rose-500/20 disabled:opacity-50">{leaderboardClearBusy === 'all' ? 'Clearing…' : 'Clear All Leaderboards'}</button>
            </div>
          </div>
          <div className="border-t border-white/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">Recent community launches</h3>
                <p className="mt-1 text-[11px] text-slate-500">Latest 50 launch events recorded by YouSound. These are launch records, not proof that the external game finished loading or that a player remains online.</p>
              </div>
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-300">{recentLaunches.length} RECENT</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
              {recentLaunches.length === 0 ? <p className="p-5 text-center text-xs text-slate-500">No game launches have been recorded yet.</p> : recentLaunches.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 py-3 last:border-0">
                  <div className="flex items-center gap-2 text-xs text-white"><ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />{event.username}<span className="text-slate-500">played launch request for</span><strong>{games.find((game) => game.id === event.gameId)?.title || event.gameId}</strong></div>
                  <time className="text-[10px] tabular-nums text-slate-500">{new Date(event.launchedAt).toLocaleString()}</time>
                </div>
              ))}
            </div>
          </div>
iv>
        </section>
      )}
    </div>
  );
};

      {tab === 'control' && isAdmin && (
        <section className="space-y-5 rounded-3xl border border-cyan-200/20 bg-slate-950/80 p-5 shadow-xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">Game Control Room</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">Publish or unpublish each game. Unpublished games are hidden from members and rejected by the game-launch API.</p>
            </div>
            <button type="button" onClick={() => void loadCatalog()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
          <div className="space-y-4">
            {games.map((game) => (
              <div key={game.id} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-white">{game.title}</h3>
                      <span className="rounded-md border border-white/10 px-2 py-1 text-[9px] font-bold uppercase text-slate-400">{game.playerMode}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{game.description}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white">
                    <input type="checkbox" checked={game.enabled} onChange={(event) => updateGame(game.id, { enabled: event.target.checked, featured: event.target.checked && game.featured })} className="h-4 w-4 accent-cyan-300" />
                    {game.enabled ? 'Activated' : 'Inactive'}
                  </label>
                </div>
                <label className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <input type="checkbox" checked={game.featured} disabled={!game.enabled} onChange={(event) => updateGame(game.id, { featured: event.target.checked })} className="h-4 w-4 accent-cyan-300" />
                  Feature this game in the Arcade
                  <Star className="h-3.5 w-3.5 text-amber-300" />
                </label>
                {game.id === 'crossy-road' ? (
                  <div className="mt-4 rounded-xl border border-emerald-200/15 bg-emerald-300/5 p-3 text-xs leading-5 text-emerald-100">
                    Native 3D Crossy Road with account-backed solo high scores and live multiplayer races. The room host can end a race.
                  </div>
                ) : game.id === 'infinite-craft' ? (
                  <div className="mt-4 rounded-xl border border-violet-200/15 bg-violet-300/5 p-3 text-xs leading-5 text-violet-100">
                    AI evaluates ingredient pairs and either returns a validated noun with an emoji or rejects the pair. Accepted discoveries and one-point combinations are saved to accounts.
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-sky-200/15 bg-sky-300/5 p-3 text-xs leading-5 text-sky-100">
                    OrbitalVision 3D is served directly from YouSound. It includes the uploaded live 3D Earth, satellite catalogs, orbit propagation, observer controls and telemetry interface.
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-[11px] text-slate-500">Only activated games can be launched, including by administrators.</p>
            <button type="button" onClick={() => void saveCatalog()} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-xs font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save game settings
            </button>
          </div>
          <div className="border-t border-white/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">Recent community launches</h3>
                <p className="mt-1 text-[11px] text-slate-500">Latest 50 launch events recorded by YouSound. These are launch records, not proof that the external game finished loading or that a player remains online.</p>
              </div>
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-300">{recentLaunches.length} RECENT</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
              {recentLaunches.length === 0 ? <p className="p-5 text-center text-xs text-slate-500">No game launches have been recorded yet.</p> : recentLaunches.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 py-3 last:border-0">
                  <div className="flex items-center gap-2 text-xs text-white"><ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />{event.username}<span className="text-slate-500">played launch request for</span><strong>{games.find((game) => game.id === event.gameId)?.title || event.gameId}</strong></div>
                  <time className="text-[10px] tabular-nums text-slate-500">{new Date(event.launchedAt).toLocaleString()}</time>
                </div>
              ))}
            </div>
          </div>
iv>
        </section>
      )}
    </div>
  );
};
