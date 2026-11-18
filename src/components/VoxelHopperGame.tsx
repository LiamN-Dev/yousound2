import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Crown, Gamepad2, Maximize2, Play, RefreshCw, Users } from 'lucide-react';

type RacePlayer = { id: string; username: string; checkpoint: number; lives: number; row: number; status: 'playing' | 'eliminated' | 'finished'; finishedAt?: string | null; isMe: boolean; isWinner: boolean };
type RaceRoom = { id: string; code: string; isHost: boolean; status: 'waiting' | 'active' | 'finished'; winnerName: string | null; players: RacePlayer[]; checkpoints: number; livesPerCheckpoint: number; checkpointRows: number[] };
type RaceRank = { username: string; wins: number; bestCheckpoint: number; races: number };

async function raceRequest(path: string, options: RequestInit = {}) {
  const response = await fetch('/api/games/crossy-road' + path, {
    credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'The Crossy Road race request failed.');
  return data;
}

export const VoxelHopperGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [room, setRoom] = useState<RaceRoom | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leaderboard, setLeaderboard] = useState<RaceRank[]>([]);
  const [copied, setCopied] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    try {
      const data = await raceRequest('/leaderboard');
      setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);
    } catch { /* Keep the lobby usable if the leaderboard is temporarily unavailable. */ }
  }, []);

  const refreshRoom = useCallback(async () => {
    if (!room?.id) return;
    try {
      const data = await raceRequest('/rooms/' + room.id);
      setRoom(data.room);
      if (data.room.status === 'finished') frameRef.current?.contentWindow?.postMessage({ type: 'crossy-race-finished' }, window.location.origin);
    } catch (e: any) { setError(e.message || 'Could not refresh race status.'); }
  }, [room?.id]);

  useEffect(() => { void loadLeaderboard(); }, [loadLeaderboard]);
  useEffect(() => {
    if (!room?.id) return;
    const timer = window.setInterval(() => { void refreshRoom(); void loadLeaderboard(); }, 1100);
    return () => window.clearInterval(timer);
  }, [room?.id, refreshRoom, loadLeaderboard]);

  const createRoom = async () => {
    setBusy(true); setError('');
    try { const data = await raceRequest('/rooms', { method: 'POST', body: '{}' }); setRoom(data.room); }
    catch (e: any) { setError(e.message || 'Could not create a race.'); }
    finally { setBusy(false); }
  };
  const joinRoom = async () => {
    setBusy(true); setError('');
    try { const data = await raceRequest('/rooms/join', { method: 'POST', body: JSON.stringify({ code: code.trim().toUpperCase() }) }); setRoom(data.room); setJoining(false); }
    catch (e: any) { setError(e.message || 'Could not join that race.'); }
    finally { setBusy(false); }
  };
  const startRace = async () => {
    if (!room) return;
    setBusy(true); setError('');
    try { const data = await raceRequest('/rooms/' + room.id + '/start', { method: 'POST', body: '{}' }); setRoom(data.room); }
    catch (e: any) { setError(e.message || 'Could not start the race.'); }
    finally { setBusy(false); }
  };

  const handleGameMessage = useCallback(async (event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow || !room) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    try {
      if (message.type === 'crossy-progress' && Number.isSafeInteger(message.row)) {
        const data = await raceRequest('/rooms/' + room.id + '/progress', { method: 'POST', body: JSON.stringify({ row: message.row }) });
        setRoom(data.room);
        if (data.room.status === 'finished') frameRef.current?.contentWindow?.postMessage({ type: 'crossy-race-finished' }, window.location.origin);
      }
      if (message.type === 'crossy-death') {
        const data = await raceRequest('/rooms/' + room.id + '/death', { method: 'POST', body: JSON.stringify({ row: Number(message.score || 0) }) });
        setRoom(data.room);
        if (data.room.status === 'finished') frameRef.current?.contentWindow?.postMessage({ type: 'crossy-race-finished' }, window.location.origin);
        frameRef.current?.contentWindow?.postMessage({
          type: 'crossy-death-result', respawn: data.respawn, eliminated: data.eliminated,
          lives: data.lives, checkpointRow: data.checkpointRow,
        }, window.location.origin);
      }
    } catch (e: any) { setError(e.message || 'Race progress could not be synchronized.'); }
  }, [room]);

  useEffect(() => {
    window.addEventListener('message', handleGameMessage);
    return () => window.removeEventListener('message', handleGameMessage);
  }, [handleGameMessage]);

  const startGameFrame = () => {
    frameRef.current?.contentWindow?.postMessage({ type: 'crossy-race-init', roomId: room?.id, code: room?.code }, window.location.origin);
  };

  const copyCode = async () => {
    if (!room) return;
    try { await navigator.clipboard.writeText(room.code); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setError('Copy failed. Select the game code and copy it manually.'); }
  };

  const isHost = Boolean(room?.isHost);
  const winnerName = room?.winnerName;
  const raceActive = room?.status === 'active' || room?.status === 'finished';

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back to Arcade
        </button>
        <div className="flex items-center gap-2 text-sm font-bold text-white"><Gamepad2 className="h-4 w-4 text-emerald-300" /> Crossy Road Race</div>
      </div>

      {!room ? (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-3xl border border-emerald-300/20 bg-slate-950 p-6 text-white shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">Multiplayer mode</div>
            <h1 className="mt-3 text-3xl font-black">Race to the finish.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Create a private room and share its six-character code, or join a friend's room. Everyone plays the same five-checkpoint race.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="text-2xl font-black text-emerald-300">5</div><div className="mt-1 text-xs text-slate-300">Checkpoints to finish</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="text-2xl font-black text-amber-300">3</div><div className="mt-1 text-xs text-slate-300">Lives at each checkpoint</div></div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => void createRoom()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-emerald-200 disabled:opacity-50"><Users className="h-4 w-4" /> Create race</button>
              <button type="button" onClick={() => setJoining(value => !value)} className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">Join with code</button>
            </div>
            {joining && <div className="mt-4 flex flex-wrap gap-2"><input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 6))} placeholder="6-CHARACTER CODE" maxLength={6} className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center font-mono text-lg font-black tracking-[.25em] text-white outline-none focus:border-emerald-300" /><button type="button" onClick={() => void joinRoom()} disabled={busy || code.length !== 6} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50">Join race</button></div>}
            {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950 p-6 text-white">
            <div className="flex items-center justify-between"><h2 className="text-lg font-black">Race leaderboard</h2><button type="button" onClick={() => void loadLeaderboard()} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><RefreshCw className="h-4 w-4" /></button></div>
            <p className="mt-1 text-xs text-slate-400">Wins, best checkpoint, and races played.</p>
            <div className="mt-4 space-y-2">
              {leaderboard.length ? leaderboard.map((entry, index) => <div key={entry.username + index} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[.03] px-3 py-3"><div className="flex min-w-0 items-center gap-3"><span className="w-6 text-xs font-black text-slate-500">{index + 1}</span><span className="truncate text-sm font-bold text-white">{entry.username}</span></div><div className="shrink-0 text-right text-xs text-slate-300"><span className="font-black text-amber-300">{entry.wins} wins</span><div>{entry.races} races · CP {entry.bestCheckpoint}/5</div></div></div>) : <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No race results yet. Be the first to win.</p>}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-emerald-300/20 bg-slate-950 p-4 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-300">{room.status === 'waiting' ? 'Waiting room' : room.status === 'finished' ? 'Race finished' : 'Race in progress'}</div><div className="mt-1 flex items-center gap-2 text-xl font-black">Room {room.code}<button type="button" onClick={() => void copyCode()} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Copy game code"><Copy className="h-4 w-4" /></button>{copied && <span className="text-xs font-semibold text-emerald-300">Copied</span>}</div></div>
              {room.status === 'waiting' && isHost && <button type="button" onClick={() => void startRace()} disabled={busy || room.players.length < 2} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40"><Play className="h-4 w-4" /> Start race</button>}
              {room.status === 'waiting' && <span className="text-xs text-slate-400">At least 2 players required</span>}
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
            {room.status === 'waiting' && <p className="mt-2 text-xs text-slate-400">Share this code with friends. This room accepts up to 8 players.</p>}
            {room.status === 'finished' && <p className="mt-3 rounded-xl bg-amber-300/10 p-3 text-sm font-bold text-amber-200">{winnerName ? winnerName + ' won the race!' : 'Race complete.'}</p>}
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{room.players.map(player => <div key={player.id} className="rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{player.username}</span>{player.isMe && <Crown className="h-3.5 w-3.5 text-amber-300" />}</div><div className="mt-2 text-xs text-slate-400">Checkpoint {player.checkpoint}/5 · Row {player.row} · {player.lives} lives</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{player.status}</div></div>)}</div>
          </div>
          {raceActive && <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white"><span className="text-sm font-bold">Your race</span><button type="button" onClick={() => void frameRef.current?.requestFullscreen?.()} className="inline-flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white"><Maximize2 className="h-4 w-4" /> Fullscreen</button></div><iframe ref={frameRef} title="Voxel Hopper 3D Crossy Road Multiplayer" src="/games/voxel-hopper.html?multiplayer=1" onLoad={startGameFrame} className="block h-[calc(100vh-250px)] min-h-[600px] w-full bg-sky-300" allow="autoplay; fullscreen" allowFullScreen /></div>}
        </>
      )}
    </section>
  );
};
