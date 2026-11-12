import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Atom, BookOpen, Castle, Check, Copy, Crown, Flame, Loader2, Plus, RefreshCw, Swords, Users, WandSparkles, Zap } from 'lucide-react';

type Item = { id: string; name: string; emoji: string; category: string; description: string; attack: number; defense: number; energyCost: number; abilityName: string; abilityDescription: string };
type Profile = { uid: string; discoveries: Item[]; combinations: number; updatedAt: string };
type Player = { uid: string; username: string; hp: number; energy: number; guard: number; items: Item[] };
type BattleState = { players: Player[]; currentTurnUid: string; turnNumber: number; usedItemIds: Record<string,string[]>; log: Array<{id:string;text:string;at:string}>; winnerUid: string | null };
type Match = { id: string; code: string; status: 'waiting'|'active'|'finished'; state: BattleState };

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

  const refreshProfile = useCallback(async () => {
    const data = await api('/profile');
    setProfile(data.profile);
  }, []);

  useEffect(() => {
    void refreshProfile().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [refreshProfile]);

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
  const first = discoveries.find((item) => item.id === selectedA);
  const second = discoveries.find((item) => item.id === selectedB);
  const ownPlayer = activeMatch?.state.players.find((player) => player.uid === profile?.uid);
  const rival = activeMatch?.state.players.find((player) => player.uid !== profile?.uid);
  const isMyTurn = Boolean(activeMatch && activeMatch.state.currentTurnUid === profile?.uid && !activeMatch.state.winnerUid);
  const used = activeMatch?.state.usedItemIds[profile?.uid || ''] || [];

  const combine = async () => {
    if (!first || !second || combining) return;
    setCombining(true); setError(''); setDiscovery(null);
    try {
      const data = await api('/combine', { method: 'POST', body: JSON.stringify({ itemA: first.id, itemB: second.id }) });
      setProfile(data.profile);
      setDiscovery(data.item);
      setSelectedA(''); setSelectedB('');
    } catch (e: any) { setError(e.message); }
    finally { setCombining(false); }
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
        <div className="flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[.18em] text-violet-100"><Atom className="h-4 w-4"/> YouCraft · AI Discovery</div>
      </div>

      <section className="relative overflow-hidden rounded-[28px] border border-violet-300/20 bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl"/>
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl"/>
        <div className="relative">
          <div className="text-[10px] font-black uppercase tracking-[.22em] text-violet-200">A world made from your ideas</div>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Combine anything. <span className="text-violet-200">Discover everything.</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Mix two discoveries to create a brand-new item. Every discovery has its own powers. Build your collection, then challenge a friend in Craft Wars.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">{discoveries.length} DISCOVERIES</span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">{profile?.combinations || 0} COMBINATIONS</span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">SAVED TO YOUR ACCOUNT</span>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

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
        <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <section className="space-y-4 rounded-3xl border border-violet-300/15 bg-slate-950/80 p-5 sm:p-6">
            <div className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-violet-200"/><div><h2 className="text-xl font-black text-white">Discovery Lab</h2><p className="text-xs text-slate-400">Choose any two different items from your collection.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[{label:'First ingredient',value:selectedA,set:setSelectedA,other:selectedB},{label:'Second ingredient',value:selectedB,set:setSelectedB,other:selectedA}].map((slot) => <label key={slot.label} className="space-y-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{slot.label}<select value={slot.value} onChange={(e)=>slot.set(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-violet-300/50"><option value="">Select an item…</option>{discoveries.filter((item)=>item.id!==slot.other).map((item)=><option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}</select></label>)}
            </div>
            <button onClick={()=>void combine()} disabled={!first||!second||combining} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-300 to-cyan-200 px-4 py-3.5 text-sm font-black text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{combining?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}{combining?'Thinking of a new discovery…':'Combine items'}</button>
            {discovery && <div className="animate-in zoom-in rounded-2xl border border-emerald-200/25 bg-emerald-200/5 p-4"><div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">New discovery unlocked</div><div className="mt-2 text-2xl font-black text-white">{discovery.emoji} {discovery.name}</div><p className="mt-1 text-sm text-slate-300">{discovery.description}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-200"><span className="rounded-lg bg-white/5 px-2.5 py-2">ATK {discovery.attack}</span><span className="rounded-lg bg-white/5 px-2.5 py-2">DEF {discovery.defense}</span><span className="rounded-lg bg-white/5 px-2.5 py-2">{discovery.energyCost} ENERGY</span></div><div className="mt-3 text-xs font-bold text-emerald-100">{discovery.abilityName}: <span className="font-normal text-slate-300">{discovery.abilityDescription}</span></div></div>}
            <div className="border-t border-white/10 pt-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Your discoveries</h3><span className="text-[10px] text-slate-500">Saved automatically</span></div><div className="grid max-h-[470px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">{discoveries.map((item)=><button key={item.id} onClick={()=>setSelectedA((v)=>v===item.id?'':item.id)} className={'rounded-xl border p-3 text-left transition hover:border-violet-200/40 '+(selectedA===item.id?'border-violet-200 bg-violet-300/10':itemTone(item))}><div className="text-lg">{item.emoji}</div><div className="mt-1 truncate text-xs font-bold text-white">{item.name}</div><div className="mt-1 text-[9px] text-slate-400">{item.category} · {item.attack}/{item.defense}</div></button>)}</div></div>
          </section>
          <section className="space-y-4 rounded-3xl border border-cyan-200/15 bg-slate-950/80 p-5 sm:p-6">
            <div className="flex items-center gap-2"><Swords className="h-5 w-5 text-cyan-200"/><div><h2 className="text-xl font-black text-white">Craft Wars</h2><p className="text-xs text-slate-400">Turn your discoveries into a strategy battle.</p></div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4"><div className="text-sm font-black text-white">Create an arena</div><p className="mt-1 text-xs leading-5 text-slate-400">Start a match and share its six-character code with a friend. Your 12 first discoveries form your battle deck.</p><button disabled={busy} onClick={()=>void createMatch()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950 disabled:opacity-40"><Plus className="h-4 w-4"/> Create match</button></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4"><div className="text-sm font-black text-white">Join a friend</div><p className="mt-1 text-xs text-slate-400">Enter the code they shared with you.</p><input value={joinCode} onChange={(e)=>setJoinCode(e.target.value.toUpperCase().slice(0,6))} placeholder="6-CHAR CODE" className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-center font-mono text-lg font-black tracking-[.3em] text-white outline-none focus:border-cyan-200/50"/><button disabled={busy||joinCode.length!==6} onClick={()=>void joinMatch()} className="mt-3 w-full rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-3 text-xs font-black text-cyan-100 disabled:opacity-40"><Users className="mr-2 inline h-4 w-4"/> Join match</button></div>
            <div className="rounded-2xl border border-white/10 p-4"><div className="flex items-center gap-2 text-xs font-black text-white"><BookOpen className="h-4 w-4 text-violet-200"/> How the battle works</div><ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400"><li>• Both players start with 30 health and 3 energy.</li><li>• Strike spends energy to attack using an item's power.</li><li>• Defend spends energy to build a shield using its defense stat.</li><li>• Charge restores 2 energy, up to 5.</li><li>• Each item can be used once per round. Reduce your opponent to zero health to win.</li></ul></div>
          </section>
        </div>
      )}
      <p className="text-center text-[10px] text-slate-500">YouCraft is an original YouSound game. Your discoveries and matches are saved to your YouSound account.</p>
    </div>
  );
};
