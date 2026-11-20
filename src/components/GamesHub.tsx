import React, { useCallback, useEffect, useState } from 'react';
import { VoxelHopperGame } from './VoxelHopperGame';
import { InfiniteCraftGame } from './InfiniteCraftGame';
import { OrbitalVisionGame } from './OrbitalVisionGame';
import { YouTubeSafetyReview } from './YouTubeSafetyReview';
import { Gamepad2, Loader2, Play, RefreshCw, ShieldCheck, Star, Trophy, Users, Wrench, Power, Trash2, Orbit } from 'lucide-react';

type GameId = 'crossy-road' | 'infinite-craft' | 'orbitalvision-3d';
type ArcadeGame = {
  id: GameId; title: string; description: string; enabled: boolean; featured: boolean;
  launchUrl: string; launchMode: 'native' | 'embedded'; playerMode: 'solo' | 'multiplayer'; providerLabel: string;
};
type LaunchEvent = { id: string; gameId: string; username: string; userId: string; launchedAt: string };
type CrossyRank = { username: string; wins: number; bestCheckpoint: number; races: number };
type SoloRank = { rank: number; username: string; highScore: number; totalGames: number };
type CraftRank = { rank: number; username: string; score: number; discoveries: number; combinations: number; raceWins: number };
type Controls = { arcadeMaintenance: boolean; multiplayerStopped: boolean };

const art: Record<GameId, string> = {
  'crossy-road': 'from-emerald-950 via-green-900 to-slate-950',
  'infinite-craft': 'from-indigo-950 via-violet-900 to-slate-950',
  'orbitalvision-3d': 'from-sky-950 via-blue-950 to-slate-950',
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'The Arcade request failed.');
  return data;
}

export const GamesHub: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [tab, setTab] = useState<'arcade' | 'leaderboards' | 'control'>('arcade');
  const [games, setGames] = useState<ArcadeGame[]>([]);
  const [recentLaunches, setRecentLaunches] = useState<LaunchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [controls, setControls] = useState<Controls>({ arcadeMaintenance: false, multiplayerStopped: false });
  const [crossyOpen, setCrossyOpen] = useState(false);
  const [craftOpen, setCraftOpen] = useState(false);
  const [orbitalOpen, setOrbitalOpen] = useState(false);

  const [raceBoard, setRaceBoard] = useState<CrossyRank[]>([]);
  const [soloBoard, setSoloBoard] = useState<SoloRank[]>([]);
  const [craftBoard, setCraftBoard] = useState<CraftRank[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const catalog = await readJson(await fetch('/api/games/catalog', { credentials: 'same-origin', cache: 'no-store' }));
      setGames(Array.isArray(catalog.games) ? catalog.games : []);
      setMaintenanceMessage(catalog.arcadeMaintenance ? (catalog.maintenanceMessage || 'The Arcade is under maintenance.') : '');
      if (typeof catalog.multiplayerStopped === 'boolean') setControls((current) => ({ ...current, multiplayerStopped: catalog.multiplayerStopped }));
      if (isAdmin) {
        const [overview, control] = await Promise.all([
          readJson(await fetch('/api/admin/games/overview', { credentials: 'same-origin', cache: 'no-store' })),
          readJson(await fetch('/api/admin/arcade/control', { credentials: 'same-origin', cache: 'no-store' })),
        ]);
        setGames(Array.isArray(overview.games) ? overview.games : []);
        setRecentLaunches(Array.isArray(overview.recentLaunches) ? overview.recentLaunches : []);
        setControls({ arcadeMaintenance: control.arcadeMaintenance === true, multiplayerStopped: control.multiplayerStopped === true });
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'The Arcade could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const loadLeaderboards = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError('');
    const [race, solo, craft] = await Promise.allSettled([
      fetch('/api/games/crossy-road/leaderboard', { credentials: 'same-origin', cache: 'no-store' }).then(readJson),
      fetch('/api/games/crossy-road/high-score-leaderboard', { credentials: 'same-origin', cache: 'no-store' }).then(readJson),
      fetch('/api/games/infinite-craft/leaderboard', { credentials: 'same-origin', cache: 'no-store' }).then(readJson),
    ]);
    const failures: string[] = [];
    if (race.status === 'fulfilled') setRaceBoard(Array.isArray(race.value.leaderboard) ? race.value.leaderboard : []);
    else { setRaceBoard([]); failures.push('Crossy Road races'); }
    if (solo.status === 'fulfilled') setSoloBoard(Array.isArray(solo.value.leaderboard) ? solo.value.leaderboard : []);
    else { setSoloBoard([]); failures.push('Crossy Road solo'); }
    if (craft.status === 'fulfilled') setCraftBoard(Array.isArray(craft.value.leaderboard) ? craft.value.leaderboard : []);
    else { setCraftBoard([]); failures.push('Infinite Craft'); }
    setLeaderboardError(failures.length ? 'Some leaderboards could not load: ' + failures.join(', ') + '.' : '');
    setLeaderboardLoading(false);
  }, []);

  useEffect(() => { if (tab === 'leaderboards') void loadLeaderboards(); }, [tab, loadLeaderboards]);

  const updateGame = (id: GameId, patch: Partial<ArcadeGame>) => {
    setGames((current) => current.map((game) => game.id === id ? { ...game, ...patch } : game));
  };

  const saveCatalog = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const data = await readJson(await fetch('/api/admin/games/catalog', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games }),
      }));
      setGames(Array.isArray(data.games) ? data.games : games);
      setNotice('Game visibility settings saved.');
    } catch (saveError: any) { setError(saveError?.message || 'Game settings could not be saved.'); }
    finally { setSaving(false); }
  };

  const updateControls = async (patch: Partial<Controls>) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await readJson(await fetch('/api/admin/arcade/control', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }));
      setControls({ arcadeMaintenance: data.arcadeMaintenance === true, multiplayerStopped: data.multiplayerStopped === true });
      setNotice('Arcade control settings saved.');
      await loadCatalog();
    } catch (controlError: any) { setError(controlError?.message || 'The Arcade controls could not be updated.'); }
    finally { setBusy(false); }
  };

  const clearLeaderboard = async (gameId: 'crossy-race' | 'crossy-solo' | 'infinite-craft' | 'all') => {
    const name = gameId === 'all' ? 'all Arcade leaderboards' : gameId === 'crossy-race' ? 'Crossy Road race leaderboard' : gameId === 'crossy-solo' ? 'Crossy Road solo leaderboard' : 'Infinite Craft leaderboard';
    if (!window.confirm('Clear ' + name + '? This cannot be undone. Infinite Craft collections remain saved.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await readJson(await fetch('/api/admin/arcade/leaderboards/clear', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      }));
      setNotice('Cleared ' + name + '.');
      await loadLeaderboards();
    } catch (clearError: any) { setError(clearError?.message || 'The selected leaderboard could not be cleared.'); }
    finally { setBusy(false); }
  };

  const launchGame = async (game: ArcadeGame) => {
    setError(''); setNotice('');
    try {
      await readJson(await fetch('/api/games/launch', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id }),
      }));
      if (game.id === 'crossy-road') setCrossyOpen(true);
      else if (game.id === 'infinite-craft') setCraftOpen(true);
      else setOrbitalOpen(true);
    } catch (launchError: any) { setError(launchError?.message || 'This game could not be launched.'); }
  };

  if (crossyOpen) return <VoxelHopperGame onBack={() => { setCrossyOpen(false); void loadCatalog(); }} />;
  if (craftOpen) return <InfiniteCraftGame onBack={() => { setCraftOpen(false); void loadCatalog(); }} />;
  if (orbitalOpen) return <OrbitalVisionGame onBack={() => { setOrbitalOpen(false); void loadCatalog(); }} />;

  const activeGames = games.filter((game) => game.enabled);
  const iconFor = (id: GameId) => id === 'crossy-road' ? '🐔' : id === 'infinite-craft' ? '🧪' : '🛰️';
  const titleFor = (id: string) => id === 'crossy-road' ? 'Crossy Road' : id === 'infinite-craft' ? 'Infinite Craft' : id === 'orbitalvision-3d' ? 'OrbitalVision 3D' : 'Arcade game';

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-cyan-300"><Gamepad2 className="h-4 w-4" /> YouSound Arcade</div>
          <h1 className="mt-2 text-3xl font-black text-white">Pick your next game.</h1>
          <p className="mt-1 text-sm text-slate-400">Play, discover, race, and explore.</p>
        </div>
        <button type="button" onClick={() => void loadCatalog()} disabled={loading || saving || busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Refresh Arcade</button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">{notice}</p>}

      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <button type="button" onClick={() => setTab('arcade')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'arcade' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-slate-900 text-slate-300'}`}>Arcade</button>
        <button type="button" onClick={() => setTab('leaderboards')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'leaderboards' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-slate-900 text-slate-300'}`}>Leaderboards</button>
        {isAdmin && <button type="button" onClick={() => setTab('control')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'control' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-slate-900 text-slate-300'}`}>Game Control Room</button>}
      </nav>

      {loading ? <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading Arcade…</div> : tab === 'arcade' ? (
        maintenanceMessage && !isAdmin ? <section className="rounded-3xl border border-amber-300/20 bg-slate-950 p-8 text-center"><Wrench className="mx-auto h-8 w-8 text-amber-200" /><h2 className="mt-4 text-xl font-black text-white">Arcade maintenance</h2><p className="mt-2 text-sm text-slate-300">{maintenanceMessage}</p></section> :
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-white">Available games</h2><p className="mt-1 text-xs text-slate-500">{activeGames.length} games currently activated</p></div>{controls.multiplayerStopped && <span className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-100">Multiplayer paused by admin</span>}</div>
          {activeGames.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No games are currently published.</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeGames.map((game) => <article key={game.id} className={`overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${art[game.id]} shadow-xl`}>
              <div className="flex min-h-[175px] flex-col justify-between p-5">
                <div className="flex items-start justify-between"><span className="text-4xl">{iconFor(game.id)}</span><span className="rounded-lg border border-white/15 bg-black/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-200">{game.playerMode}</span></div>
                <div><h3 className="text-xl font-black text-white">{game.title}</h3><p className="mt-2 max-w-md text-xs leading-5 text-slate-300">{game.description}</p></div>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 bg-black/20 p-4"><span className="text-[10px] text-slate-400">{game.providerLabel}</span><button type="button" onClick={() => void launchGame(game)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-100"><Play className="h-3.5 w-3.5" /> Play</button></div>
            </article>)}
          </div>}
        </section>
      ) : tab === 'leaderboards' ? (
        <section className="space-y-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black text-white">Arcade leaderboards</h2><p className="mt-1 text-xs text-slate-500">Scores and wins saved to YouSound accounts.</p></div><button type="button" onClick={() => void loadLeaderboards()} disabled={leaderboardLoading} className="rounded-xl border border-white/10 p-2.5 text-slate-300 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button></div>
          {leaderboardError && <p className="text-xs text-amber-200">{leaderboardError}</p>}
          <div className="grid gap-4 xl:grid-cols-3">
            <section className="rounded-2xl border border-white/10 bg-slate-950 p-4"><h3 className="flex items-center gap-2 text-base font-black text-white"><Trophy className="h-4 w-4 text-amber-300" /> Crossy Road races</h3><p className="mt-1 text-[10px] text-slate-500">Wins · best checkpoint · races</p><div className="mt-4 space-y-2">{raceBoard.length ? raceBoard.map((entry,index)=><div key={entry.username+index} className="flex items-center justify-between gap-2 rounded-lg bg-white/[.03] px-3 py-2 text-xs"><span className="truncate text-slate-200">#{index+1} {entry.username}</span><span className="shrink-0 font-bold text-amber-200">{entry.wins} wins · CP {entry.bestCheckpoint}/5</span></div>) : <p className="py-5 text-center text-xs text-slate-500">No race results yet.</p>}</div></section>
            <section className="rounded-2xl border border-white/10 bg-slate-950 p-4"><h3 className="flex items-center gap-2 text-base font-black text-white"><Trophy className="h-4 w-4 text-emerald-300" /> Crossy Road solo</h3><p className="mt-1 text-[10px] text-slate-500">Best solo score · games played</p><div className="mt-4 space-y-2">{soloBoard.length ? soloBoard.map((entry,index)=><div key={entry.username+index} className="flex items-center justify-between gap-2 rounded-lg bg-white/[.03] px-3 py-2 text-xs"><span className="truncate text-slate-200">#{entry.rank || index+1} {entry.username}</span><span className="shrink-0 font-bold text-emerald-200">{entry.highScore} · {entry.totalGames} runs</span></div>) : <p className="py-5 text-center text-xs text-slate-500">No solo scores yet.</p>}</div></section>
            <section className="rounded-2xl border border-white/10 bg-slate-950 p-4"><h3 className="flex items-center gap-2 text-base font-black text-white"><Trophy className="h-4 w-4 text-violet-300" /> Infinite Craft</h3><p className="mt-1 text-[10px] text-slate-500">One point per combination</p><div className="mt-4 space-y-2">{craftBoard.length ? craftBoard.map((entry,index)=><div key={entry.username+index} className="flex items-center justify-between gap-2 rounded-lg bg-white/[.03] px-3 py-2 text-xs"><span className="truncate text-slate-200">#{entry.rank || index+1} {entry.username}</span><span className="shrink-0 font-bold text-violet-200">{entry.score} pts · {entry.discoveries} discoveries</span></div>) : <p className="py-5 text-center text-xs text-slate-500">No discoveries scored yet.</p>}</div></section>
          </div>
          {isAdmin && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-300/15 bg-rose-300/[.03] p-4"><span className="mr-2 text-xs font-bold text-slate-300">Leaderboard maintenance</span><button disabled={busy} onClick={() => void clearLeaderboard('crossy-race')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-white/5">Clear race</button><button disabled={busy} onClick={() => void clearLeaderboard('crossy-solo')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-white/5">Clear solo</button><button disabled={busy} onClick={() => void clearLeaderboard('infinite-craft')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-white/5">Clear Infinite Craft</button><button disabled={busy} onClick={() => void clearLeaderboard('all')} className="rounded-lg bg-rose-300 px-3 py-2 text-[10px] font-black text-slate-950 hover:bg-rose-200">Clear all</button></div>}
        </section>
      ) : (
        <section className="space-y-5">
          <YouTubeSafetyReview />
          <div className="rounded-3xl border border-cyan-200/20 bg-slate-950 p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-300" /><h2 className="text-xl font-black text-white">Game Control Room</h2></div>
            <p className="mt-1 text-xs text-slate-400">Publish games, pause every multiplayer room, or take the Arcade offline.</p>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/15 bg-amber-300/[.04] p-4">
                <div><div className="flex items-center gap-2 text-sm font-black text-white"><Wrench className="h-4 w-4 text-amber-200" /> Arcade maintenance</div><p className="mt-1 text-[10px] leading-4 text-slate-400">Blocks access to the Arcade and game APIs for members. Admins can still manage settings.</p></div>
                <button type="button" disabled={busy} onClick={() => void updateControls({ arcadeMaintenance: !controls.arcadeMaintenance })} className={`rounded-xl px-4 py-2 text-xs font-black ${controls.arcadeMaintenance ? 'bg-amber-200 text-slate-950' : 'border border-white/15 text-white'}`}>{controls.arcadeMaintenance ? 'ON' : 'OFF'}</button>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200/15 bg-rose-300/[.04] p-4">
                <div><div className="flex items-center gap-2 text-sm font-black text-white"><Power className="h-4 w-4 text-rose-200" /> Stop all multiplayer games</div><p className="mt-1 text-[10px] leading-4 text-slate-400">Ends active Crossy Road and Infinite Craft rooms and blocks new rooms until re-enabled.</p></div>
                <button type="button" disabled={busy} onClick={() => void updateControls({ multiplayerStopped: !controls.multiplayerStopped })} className={`rounded-xl px-4 py-2 text-xs font-black ${controls.multiplayerStopped ? 'bg-rose-200 text-slate-950' : 'border border-white/15 text-white'}`}>{controls.multiplayerStopped ? 'STOPPED' : 'RUNNING'}</button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950 p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-black text-white">Game visibility</h3><p className="mt-1 text-xs text-slate-500">Only these three games can appear in the Arcade.</p></div><button type="button" onClick={() => void saveCatalog()} disabled={saving || loading} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{saving ? 'Saving…' : 'Save game settings'}</button></div>
            <div className="mt-4 space-y-3">
              {games.map((game) => <div key={game.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4">
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-xl">{iconFor(game.id)}</span><h4 className="font-black text-white">{game.title}</h4><span className="rounded border border-white/10 px-2 py-0.5 text-[9px] uppercase text-slate-400">{game.playerMode}</span></div><p className="mt-1 text-xs text-slate-400">{game.description}</p></div>
                <div className="flex items-center gap-4"><label className="flex items-center gap-2 text-[10px] font-bold text-slate-300"><input type="checkbox" checked={game.enabled} onChange={(event) => updateGame(game.id, { enabled: event.target.checked, featured: event.target.checked && game.featured })} className="h-4 w-4 accent-cyan-300" /> Active</label><label className="flex items-center gap-2 text-[10px] font-bold text-slate-300"><input type="checkbox" checked={game.featured} disabled={!game.enabled} onChange={(event) => updateGame(game.id, { featured: event.target.checked })} className="h-4 w-4 accent-cyan-300" /> Featured <Star className="h-3 w-3 text-amber-300" /></label></div>
              </div>)}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950 p-5">
            <div className="flex items-center justify-between"><div><h3 className="text-base font-black text-white">Leaderboard controls</h3><p className="mt-1 text-xs text-slate-500">Reset one board or all boards. Infinite Craft collections stay saved.</p></div><Trash2 className="h-5 w-5 text-rose-300" /></div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => void clearLeaderboard('crossy-race')} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5">Clear Crossy race</button>
              <button disabled={busy} onClick={() => void clearLeaderboard('crossy-solo')} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5">Clear Crossy solo</button>
              <button disabled={busy} onClick={() => void clearLeaderboard('infinite-craft')} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5">Clear Infinite Craft</button>
              <button disabled={busy} onClick={() => void clearLeaderboard('all')} className="rounded-xl bg-rose-300 px-3 py-2.5 text-xs font-black text-slate-950 hover:bg-rose-200">Clear all leaderboards</button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950 p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-black text-white">Recent Arcade activity</h3><p className="mt-1 text-xs text-slate-500">Latest 50 launches of active Arcade games.</p></div><span className="text-[10px] text-slate-500">{recentLaunches.length} events</span></div>
            <div className="mt-3 divide-y divide-white/5">{recentLaunches.length ? recentLaunches.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="flex items-center gap-2 text-xs text-white"><Users className="h-3.5 w-3.5 text-cyan-300" />{event.username}<span className="text-slate-500">launched</span><strong>{titleFor(event.gameId)}</strong></div><time className="text-[10px] text-slate-500">{new Date(event.launchedAt).toLocaleString()}</time></div>) : <p className="py-5 text-center text-xs text-slate-500">No recent launches.</p>}</div>
          </div>
        </section>
      )}
    </div>
  );
};
