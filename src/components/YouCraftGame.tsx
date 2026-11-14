import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Atom, BookOpen, Castle, Check, Copy, Crown, Loader2, Plus, Swords, Users, WandSparkles, Zap } from 'lucide-react';

type Item = { id: string; name: string; emoji: string; category: string; description: string; attack: number; defense: number; energyCost: number; abilityName: string; abilityDescription: string };
type Profile = { uid: string; discoveries: Item[]; combinations: number; updatedAt: string };
type Player = { uid: string; username: string; hp: number; energy: number; guard: number; items: Item[] };
type BattleState = { players: Player[]; currentTurnUid: string; turnNumber: number; usedItemIds: Record<string,string[]>; log: Array<{id:string;text:string;at:string}>; winnerUid: string | null };
type Match = { id: string; code: string; status: 'waiting'|'active'|'finished'; state: BattleState };
type PlannerStatus = { configured: boolean; running: boolean; pending: number; planned: number; lastError: string | null; updatedAt: string };

async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch('/api/youcraft' + path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'YouCraft request failed.');
  return data;
}

const itemTone = (item: Item) => item.attack >= 7 ? 'border-rose-300/25 bg-rose-300/5' : item.defense >= 7 ? 'border-emerald-300/25 bg-emerald-300/5' : 'border-cyan-300/20 bg-cyan-300/5';

export const YouCraftGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedA, setSelectedA] = useState('');
  const [selectedB, setSelectedB] = useState('');
  const [combining, setCombining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [discovery, setDiscovery] = useState<Item | null>(null);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [battleItemId, setBattleItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [planner, setPlanner] = useState<PlannerStatus | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggedItemId, setDraggedItemId] = useState('');
  const boardRef = useRef<HTMLDivElement>(null);

  const refreshProfile = useCallback(async () => {
    const data = await api('/profile');
    setProfile(data.profile);
    setPlanner(data.planner || null);
  }, []);

  useEffect(() => {
    void refreshProfile().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [refreshProfile]);

  useEffect(() => {
    if (!profile?.uid || !planner?.configured) return;
    const timer = window.setInterval(() => {
      api('/planning').then((data) => setPlanner(data.planner)).catch(() => undefined);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [profile?.uid, planner?.configured]);

  useEffect(() => {
    if (!profile) return;
    setPositions((current) => {
      const next = { ...current };
      profile.discoveries.forEach((item, index) => {
        if (!next[item.id]) next[item.id] = { x: 20 + (index % 4) * 164, y: 48 + Math.floor(index / 4) * 112 };
      });
      return next;
    });
  }, [profile?.discoveries]);

  useEffect(() => {
    if (!activeMatch?.id || activeMatch.status === 'finished') return;
    const timer = window.setInterval(() => {
      api('/matches/' + activeMatch.id)
        .then((data) => setActiveMatch(data.match))
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeMatch?.id, activeMatch?.status]);

  const discoveries = profile?.discoveries || [];
  const ownPlayer = activeMatch?.state.players.find((player) => player.uid === profile?.uid);
  const rival = activeMatch?.state.players.find((player) => player.uid !== profile?.uid);
  const isMyTurn = Boolean(activeMatch && activeMatch.state.currentTurnUid === profile?.uid && !activeMatch.state.winnerUid);
  const used = activeMatch?.state.usedItemIds[profile?.uid || ''] || [];

  const combineItems = async (itemAId: string, itemBId: string) => {
    if (!itemAId || !itemBId || combining) return;
    setCombining(true); setError(''); setDiscovery(null);
    const requestBody = JSON.stringify({ itemA: itemAId, itemB: itemBId });
    try {
      // Known recipes return immediately. New combinations wait for one direct
      // response from the dedicated YouCraft recipe model.
      const data = await api('/combine', { method: 'POST', body: requestBody });
      setProfile(data.profile);
      setPlanner(data.planner || planner);
      setDiscovery(data.item);
      setSelectedA(''); setSelectedB('');
    } catch (e: any) { setError(e.message || 'That combination could not be created.'); }
    finally { setCombining(false); }
  };

  const handleTileClick = (itemId: string) => {
    if (combining) return;
    if (!selectedA) {
      setSelectedA(itemId);
      setSelectedB('');
      return;
    }
    if (selectedA === itemId) {
      setSelectedA('');
      setSelectedB('');
      return;
    }
    setSelectedB(itemId);
    void combineItems(selectedA, itemId);
  };

  const handleTileDrop = (event: React.DragEvent<HTMLButtonElement>, targetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData('text/plain') || draggedItemId;
    if (sourceId && sourceId !== targetId) void combineItems(sourceId, targetId);
    setDraggedItemId('');
  };

  const handleBoardDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('text/plain') || draggedItemId;
    const board = boardRef.current;
    if (!itemId || !board) return;
    const bounds = board.getBoundingClientRect();
    const x = Math.max(10, Math.min(event.clientX - bounds.left - 64, 610));
    const y = Math.max(42, event.clientY - bounds.top - 36);
    setPositions((current) => ({ ...current, [itemId]: { x, y } }));
    setDraggedItemId('');
  };

  const resetBoard = () => {
    setPositions(Object.fromEntries(discoveries.map((item, index) => [
      item.id, { x: 20 + (index % 4) * 164, y: 48 + Math.floor(index / 4) * 112 },
    ])));
  };

  const createMatch = async () => {
    setBusy(true); setError('');
    try { const data = await api('/matches', { method: 'POST', body: '{}' }); setActiveMatch(data.match); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const joinMatch = async () => {
    setBusy(true); setError('');
    try { const data = await api('/matches/join', { method: 'POST', body: JSON.stringify({ code: joinCode }) }); setActiveMatch(data.match); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const playAction = async (action: 'strike'|'guard'|'charge') => {
    if (!activeMatch || busy || !isMyTurn) return;
    if (action !== 'charge' && !battleItemId) { setError('Select one of your items first.'); return; }
    setBusy(true); setError('');
    try {
      const data = await api('/matches/' + activeMatch.id + '/action', { method: 'POST', body: JSON.stringify({ action, itemId: battleItemId }) });
      setActiveMatch(data.match);
      setBattleItemId('');
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const copyCode = async () => {
    if (!activeMatch) return;
    try { await navigator.clipboard.writeText(activeMatch.code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setError('Copy was blocked by the browser. Share the code manually: ' + activeMatch.code); }
  };

  const battleDeck = useMemo(() => ownPlayer?.items || [], [ownPlayer?.uid, ownPlayer?.items]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center gap-3 text-sm text-slate-300"><Loader2 className="h-5 w-5 animate-spin"/> Loading your discoveries…</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-28 animate-in fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"><ArrowLeft className="h-4 w-4"/> Arcade</button>
        <div className="flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[.18em] text-violet-100"><Atom className="h-4 w-4"/> YouCraft · AI-Planned Discovery</div>
      </div>

      <section className="relative overflow-hidden rounded-[28px] border border-violet-300/20 bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl"/>
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl"/>
        <div className="relative">
          <div className="text-[10px] font-black uppercase tracking-[.22em] text-violet-200">A world made from your ideas</div>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Drag, combine. <span className="text-violet-200">Discover more.</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Drag one element onto another to combine them instantly. No external game link and no AI waiting. Build your collection, then challenge a friend in Craft Wars.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">{discoveries.length} DISCOVERIES</span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">{profile?.combinations || 0} COMBINATIONS</span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">SAVED TO YOUR ACCOUNT</span>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>}
      {!activeMatch && planner && (
        <div role="status" className={'rounded-xl border px-4 py-3 text-xs ' + (!planner.configured ? 'border-amber-300/20 bg-amber-300/5 text-amber-100' : planner.lastError ? 'border-rose-300/20 bg-rose-300/5 text-rose-100' : 'border-cyan-300/20 bg-cyan-300/5 text-cyan-100')}>
          {!planner.configured
            ? 'AI recipe planning is not connected yet. Known recipes still work, but new combinations need the separate YOUCRAFT_GEMINI_API_KEY configured by the administrator.'
            : planner.running
              ? 'AI is pre-planning your next combinations in the background…'
              : planner.lastError
                ? 'Recipe planning paused: ' + planner.lastError
                : planner.pending > 0
                  ? planner.pending + ' more combinations are waiting to be planned.'
                  : 'Your available combinations are planned and ready.'}
          {planner.configured && <span className="ml-2 text-slate-400">{planner.planned} recipes planned this session.</span>}
        </div>
      )}

      {activeMatch ? (
        <section className="space-y-5 rounded-3xl border border-cyan-300/20 bg-slate-950/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200">Craft Wars Arena</div><h2 className="mt-1 text-2xl font-black text-white">{activeMatch.status === 'waiting' ? 'Waiting for challenger' : activeMatch.status === 'finished' ? 'Battle complete' : 'Your turn to shape the world'}</h2></div>
            <button onClick={() => setActiveMatch(null)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">Leave arena view</button>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4">
            <div className="flex-1"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Match code · share with a friend</div><div className="mt-1 font-mono text-2xl font-black tracking-[.2em] text-white">{activeMatch.code}</div></div>
            <button onClick={() => void copyCode()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2.5 text-xs font-black text-slate-950"><Copy className="h-4 w-4"/>{copied ? 'Copied' : 'Copy code'}</button>
          </div>
          {activeMatch.status === 'waiting' && <div className="rounded-xl border border-amber-200/20 bg-amber-200/5 p-4 text-sm text-amber-100">Send this code to your friend. The arena refreshes automatically when they join.</div>}
          {activeMatch.state.players.length === 2 && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {[ownPlayer, rival].filter(Boolean).map((player) => <div key={player!.uid} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
                  <div className="flex items-center justify-between gap-2"><div className="font-bold text-white">{player!.username} {player!.uid === profile?.uid && <span className="text-[10px] text-cyan-200">(YOU)</span>}</div>{activeMatch.state.winnerUid === player!.uid && <Crown className="h-4 w-4 text-amber-300"/>}</div>
                  <div className="mt-3 flex justify-between text-xs text-slate-300"><span>Health</span><span>{player!.hp}/30</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-rose-400" style={{width:(player!.hp/30*100)+'%'}}/></div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300"><span><Zap className="mr-1 inline h-3.5 w-3.5 text-amber-300"/>{player!.energy} energy</span><span><Castle className="mr-1 inline h-3.5 w-3.5 text-cyan-200"/>{player!.guard} guard</span><span>{player!.items.length} items</span></div>
                </div>)}
              </div>
              {activeMatch.status !== 'finished' && <div className="rounded-2xl border border-cyan-200/15 bg-cyan-300/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-white">Battle actions</h3><span className={'rounded-lg px-3 py-1.5 text-[10px] font-black '+(isMyTurn?'bg-cyan-300 text-slate-950':'bg-white/10 text-slate-300')}>{isMyTurn ? 'YOUR TURN' : 'OPPONENT’S TURN'}</span></div>
                <p className="mt-1 text-xs text-slate-400">{isMyTurn ? 'Select an item, then strike or use its defensive power. Charge restores energy.' : 'Waiting for your opponent to make a move. This panel updates automatically.'}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{battleDeck.map((item) => <button key={item.id} disabled={!isMyTurn || busy || used.includes(item.id)} onClick={() => setBattleItemId(item.id)} className={'rounded-xl border p-3 text-left transition '+(battleItemId===item.id?'border-cyan-200 bg-cyan-300/10':itemTone(item))+' disabled:cursor-not-allowed disabled:opacity-40'}>
                  <div className="flex items-center justify-between"><span className="text-sm font-bold text-white">{item.emoji} {item.name}</span>{used.includes(item.id)&&<Check className="h-3.5 w-3.5 text-slate-500"/>}</div><div className="mt-1 text-[10px] text-slate-400">ATK {item.attack} · DEF {item.defense} · {item.energyCost} energy</div><div className="mt-1 text-[10px] text-cyan-100">{item.abilityName}</div>
                </button>)}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button disabled={!isMyTurn||busy||!battleItemId} onClick={() => void playAction('strike')} className="inline-flex items-center gap-2 rounded-xl bg-rose-400 px-4 py-3 text-xs font-black text-slate-950 disabled:opacity-40"><Swords className="h-4 w-4"/> Strike</button>
                  <button disabled={!isMyTurn||busy||!battleItemId} onClick={() => void playAction('guard')} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-3 text-xs font-black text-cyan-100 disabled:opacity-40"><Castle className="h-4 w-4"/> Defend</button>
                  <button disabled={!isMyTurn||busy} onClick={() => void playAction('charge')} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/10 px-4 py-3 text-xs font-black text-amber-100 disabled:opacity-40"><Zap className="h-4 w-4"/> Charge +2</button>
                  {busy && <Loader2 className="h-5 w-5 animate-spin text-cyan-200"/>}
                </div>
              </div>}
            </>
          )}
          <div className="rounded-2xl border border-white/10 p-4"><h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">Battle log</h3><div className="space-y-2">{activeMatch.state.log.slice().reverse().map((entry) => <div key={entry.id} className="text-xs text-slate-300">{entry.text}</div>)}</div></div>
          {activeMatch.status === 'finished' && <button onClick={() => setActiveMatch(null)} className="rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950">Back to discovery</button>}
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <section className="space-y-4 rounded-3xl border border-violet-300/15 bg-slate-950/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-violet-200"/><div><h2 className="text-xl font-black text-white">Crafting board</h2><p className="text-xs text-slate-400">Drag a tile onto another tile. On touchscreens, tap two tiles.</p></div></div>
              <button type="button" onClick={resetBoard} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/5">Reset layout</button>
            </div>

            {discovery && <div className="animate-in zoom-in rounded-2xl border border-emerald-200/25 bg-emerald-200/5 p-4">
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">Discovery unlocked</div>
              <div className="mt-1 text-xl font-black text-white">{discovery.emoji} {discovery.name}</div>
              <p className="mt-1 text-xs text-slate-300">{discovery.description}</p>
            </div>}

            <div className="overflow-x-auto rounded-2xl border border-violet-200/15 bg-[#080d1c]">
              <div
                ref={boardRef}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleBoardDrop}
                className="relative min-h-[540px] min-w-[760px] overflow-hidden"
                style={{
                  minHeight: Math.max(540, Math.ceil(discoveries.length / 4) * 112 + 80),
                  backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,.18) 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              >
                <div className="pointer-events-none absolute left-4 top-3 text-[9px] font-black uppercase tracking-[.2em] text-slate-600">YouCraft workspace · drag to move · drop on a tile to combine</div>
                {discoveries.map((item, index) => {
                  const position = positions[item.id] || { x: 20 + (index % 4) * 164, y: 48 + Math.floor(index / 4) * 112 };
                  const isSelected = selectedA === item.id || selectedB === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', item.id);
                        setDraggedItemId(item.id);
                      }}
                      onDragEnd={() => setDraggedItemId('')}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleTileDrop(event, item.id)}
                      onClick={() => handleTileClick(item.id)}
                      aria-pressed={isSelected}
                      title="Drag onto another tile to combine"
                      className={'absolute flex min-h-[82px] w-[138px] flex-col items-start justify-center rounded-2xl border p-3 text-left shadow-lg transition hover:-translate-y-0.5 hover:border-violet-200/60 ' + (isSelected ? 'border-violet-200 bg-violet-300/15 ring-2 ring-violet-300/30' : itemTone(item)) + (combining ? ' cursor-wait opacity-70' : ' cursor-grab active:cursor-grabbing')}
                      style={{ left: position.x, top: position.y }}
                    >
                      <span className="text-xl">{item.emoji}</span>
                      <span className="mt-1 max-w-full truncate text-xs font-black text-white">{item.name}</span>
                      <span className="mt-0.5 text-[9px] text-slate-400">{item.category}</span>
                    </button>
                  );
                })}
                {discoveries.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">Loading your starter elements…</div>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{discoveries.length} elements discovered · saved automatically</span>
              <span>{combining ? 'AI is thinking through this recipe…' : selectedA ? 'Choose or drop a second element' : 'Drag tiles freely around the board'}</span>
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-cyan-200/15 bg-slate-950/80 p-5 sm:p-6">
            <div className="flex items-center gap-2"><Swords className="h-5 w-5 text-cyan-200"/><div><h2 className="text-xl font-black text-white">Craft Wars</h2><p className="text-xs text-slate-400">Use your discoveries in a multiplayer strategy battle.</p></div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
              <div className="text-sm font-black text-white">Create an arena</div>
              <p className="mt-1 text-xs leading-5 text-slate-400">Start a match and share its six-character code with a friend.</p>
              <button disabled={busy} onClick={() => void createMatch()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950 disabled:opacity-40"><Plus className="h-4 w-4"/> Create match</button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
              <div className="text-sm font-black text-white">Join a friend</div>
              <p className="mt-1 text-xs text-slate-400">Enter the code they shared with you.</p>
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0,6))} placeholder="6-CHAR CODE" className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-center font-mono text-lg font-black tracking-[.3em] text-white outline-none focus:border-cyan-200/50"/>
              <button disabled={busy || joinCode.length !== 6} onClick={() => void joinMatch()} className="mt-3 w-full rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-3 text-xs font-black text-cyan-100 disabled:opacity-40"><Users className="mr-2 inline h-4 w-4"/> Join match</button>
            </div>
            <div className="rounded-2xl border border-white/10 p-4">
              <div className="flex items-center gap-2 text-xs font-black text-white"><BookOpen className="h-4 w-4 text-violet-200"/> How the battle works</div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                <li>• Both players start with 30 health and 3 energy.</li>
                <li>• Strike spends energy to attack using an item's power.</li>
                <li>• Defend spends energy to build a shield using its defense stat.</li>
                <li>• Charge restores 2 energy, up to 5.</li>
                <li>• Each item can be used once per round. Reduce your opponent to zero health to win.</li>
              </ul>
            </div>
          </section>
        </div>
      )}
      <p className="text-center text-[10px] text-slate-500">YouCraft is hosted in YouSound. Known recipes are instant; new pairs are generated by the dedicated game AI and cached for next time. Your discoveries and matches are saved to your account.</p>
    </div>
  );
};
