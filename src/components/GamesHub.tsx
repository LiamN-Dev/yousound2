import React, { useEffect, useMemo, useState } from 'react';
import { YouCraftGame } from './YouCraftGame';
import { CrossyRoadGame } from './CrossyRoadGame';
import { ArrowLeft, ArrowUpRight, ExternalLink, Gamepad2, Globe2, Loader2, Play, RefreshCw, ShieldCheck, Star, Users } from 'lucide-react';

type LaunchMode = 'new-tab' | 'embedded' | 'native';
type ArcadeGame = {
  id: 'openfront' | 'youcraft' | 'crossy-road';
  title: string;
  description: string;
  enabled: boolean;
  featured: boolean;
  launchUrl: string;
  launchMode: LaunchMode;
  playerMode: 'solo' | 'multiplayer';
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

const gameArtwork: Record<string, string> = {
  openfront: 'from-emerald-950 via-teal-900 to-slate-950',
  youcraft: 'from-violet-950 via-fuchsia-950 to-slate-950',
  'crossy-road': 'from-emerald-950 via-green-900 to-slate-950',
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'The Arcade request failed.');
  return data;
}

export const GamesHub: React.FC<Props> = ({ isAdmin }) => {
  const [tab, setTab] = useState<'arcade' | 'control'>('arcade');
  const [games, setGames] = useState<ArcadeGame[]>([]);
  const [recentLaunches, setRecentLaunches] = useState<LaunchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [embeddedGame, setEmbeddedGame] = useState<ArcadeGame | null>(null);
  const [youCraftOpen, setYouCraftOpen] = useState(false);
  const [crossyRoadOpen, setCrossyRoadOpen] = useState(false);
  const [youCraftOverview, setYouCraftOverview] = useState<{ players: any[]; matches: any[] } | null>(null);

  const loadCatalog = async () => {
    setLoading(true);
    setError('');
    try {
      const catalog = await readJson(await fetch('/api/games/catalog', { credentials: 'same-origin', cache: 'no-store' }));
      setGames(Array.isArray(catalog.games) ? catalog.games : []);
      if (isAdmin) {
        const overview = await readJson(await fetch('/api/admin/games/overview', { credentials: 'same-origin', cache: 'no-store' }));
        setGames(Array.isArray(overview.games) ? overview.games : []);
        setRecentLaunches(Array.isArray(overview.recentLaunches) ? overview.recentLaunches : []);
        const youCraft = await readJson(await fetch('/api/youcraft/admin/overview', { credentials: 'same-origin', cache: 'no-store' }));
        setYouCraftOverview({ players: Array.isArray(youCraft.players) ? youCraft.players : [], matches: Array.isArray(youCraft.matches) ? youCraft.matches : [] });
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'The Arcade could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCatalog(); }, [isAdmin]);

  const activeGames = useMemo(() => [
    ...games.filter((game) => game.enabled),
    { id: 'crossy-road' as const, title: 'Crossy Road', description: 'Cross traffic, ride the logs, and see how far you can go. Your high score and coins are saved to your YouSound account.', enabled: true, featured: true, launchUrl: '', launchMode: 'native' as const, playerMode: 'solo' as const, providerLabel: 'YOUSOUND ORIGINAL' },
  ], [games]);

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
    if (!game.enabled || embeddedGame) return;
    if (game.id === 'crossy-road') {
      recordLaunch('crossy-road');
      setCrossyRoadOpen(true);
      return;
    }
    recordLaunch(game.id);
    if (game.id === 'youcraft' || game.launchMode === 'native') {
      setYouCraftOpen(true);
      return;
    }
    if (game.launchMode === 'embedded') {
      setEmbeddedGame(game);
      return;
    }
    window.open(game.launchUrl, '_blank', 'noopener,noreferrer');
    setNotice('Requested a new tab for ' + game.title + '. If it did not open, allow pop-ups for YouSound. The game is hosted by its original provider.');
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

  if (crossyRoadOpen) return <CrossyRoadGame onBack={() => setCrossyRoadOpen(false)} />;

  if (youCraftOpen) return <YouCraftGame onBack={() => setYouCraftOpen(false)} />;

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
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Only games activated by the YouSound administrator appear here. The Arcade launches real games from their official providers or from a separately hosted game service.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-200">{activeGames.length} ACTIVATED GAME{activeGames.length === 1 ? '' : 'S'}</span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-200">CHROME BROWSER</span>
          </div>
        </div>
      </section>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTab('arcade')} className={'rounded-xl px-4 py-2 text-xs font-bold transition ' + (tab === 'arcade' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}>Arcade preview</button>
          <button type="button" onClick={() => setTab('control')} className={'rounded-xl px-4 py-2 text-xs font-bold transition ' + (tab === 'control' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}>Game Control & Activity</button>
        </div>
      )}

      {error && <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {notice && <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-100">{notice}</div>}

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
                    <button type="button" onClick={() => playGame(game)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
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
                {game.id === 'youcraft' ? (
                  <div className="mt-4 rounded-xl border border-violet-200/15 bg-violet-300/5 p-3 text-xs leading-5 text-violet-100">
                    Native YouSound game. Drag elements together to discover combinations instantly. Your collection and Craft Wars matches are saved to your account.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-xs font-semibold text-slate-300">
                      OpenFront game URL
                      <input value={game.launchUrl} onChange={(event) => updateGame(game.id, { launchUrl: event.target.value })} type="url" maxLength={500} placeholder="https://your-openfront-host.example" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50" />
                    </label>
                    <label className="space-y-1 text-xs font-semibold text-slate-300">
                      How it opens
                      <select value={game.launchMode} onChange={(event) => updateGame(game.id, { launchMode: event.target.value as LaunchMode })} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50">
                        <option value="new-tab">Open separately</option>
                        <option value="embedded">Embed self-hosted instance</option>
                      </select>
                    </label>
                    <p className="md:col-span-2 text-[11px] leading-5 text-slate-500">For an in-YouSound embed, use a separately hosted OpenFront instance whose own frame policy permits YouSound. The official OpenFront host cannot be forced into an iframe. A URL change does not deploy or create that server.</p>
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
              {recentLaunches.length === 0 ? <p className="p-5 text-center text-xs text-slate-500">No game launches have been recorded yet.</p> : recentLaunches.filter((event) => event.gameId !== 'infinite-craft').map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 py-3 last:border-0">
                  <div className="flex items-center gap-2 text-xs text-white"><ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />{event.username}<span className="text-slate-500">played launch request for</span><strong>{event.gameId === 'youcraft' ? 'YouCraft' : 'OpenFront'}</strong></div>
                  <time className="text-[10px] tabular-nums text-slate-500">{new Date(event.launchedAt).toLocaleString()}</time>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">YouCraft community overview</h3>
                <p className="mt-1 text-[11px] text-slate-500">Account-level discovery totals and the latest multiplayer arenas. No private chat content is exposed here.</p>
              </div>
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-300">{youCraftOverview?.players.length || 0} PLAYERS · {youCraftOverview?.matches.length || 0} MATCHES</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="border-b border-white/10 bg-white/[.03] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Most recent player activity</div>
                {(youCraftOverview?.players || []).slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,12).map((player) => (
                  <div key={player.uid} className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5 last:border-0">
                    <span className="truncate text-xs text-slate-200">{player.username || player.uid}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-cyan-200">{player.discoveryCount} discoveries</span>
                  </div>
                ))}
                {!youCraftOverview?.players.length && <p className="p-4 text-center text-xs text-slate-500">No YouCraft players yet.</p>}
              </div>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="border-b border-white/10 bg-white/[.03] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Recent strategy matches</div>
                {(youCraftOverview?.matches || []).slice(0,12).map((match) => (
                  <div key={match.id} className="border-b border-white/5 px-3 py-2.5 last:border-0">
                    <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-bold text-white">{match.code}</span><span className="text-[10px] uppercase text-cyan-200">{match.status}</span></div>
                    <div className="mt-1 truncate text-[10px] text-slate-400">{match.players.join(' vs ') || 'Waiting'} · turn {match.turnNumber}</div>
                  </div>
                ))}
                {!youCraftOverview?.matches.length && <p className="p-4 text-center text-xs text-slate-500">No strategy matches yet.</p>}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
