import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, AudioLines, Crown, Gamepad2, Headphones, Music2, Search, Shield, Sparkles, Trophy, Zap } from 'lucide-react';
import { Song } from '../types';
import { GuessTrackGame } from './GuessTrackGame';
import { RhythmGame } from './RhythmGame';
import { ExternalGameEmbed } from './ExternalGameEmbed';
import { CrossyRoadGame } from './CrossyRoadGame';

type SelectedGame = 'menu' | 'guess' | 'rhythm' | 'retro' | 'dash' | 'crossy';
type Props = {
  isAdmin: boolean;
  songs: Song[];
  bulkUpdateSongs: (songIds: string[], updates: Partial<Song>) => Promise<boolean>;
  updateSong: (id: string, updates: Partial<Song>) => Promise<boolean>;
  refreshSongLibrary: () => void;
};

function playableUrl(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return value;
  if (value.startsWith('/api/drive/stream/')) return value;
  const legacy = value.match(/^\/api\/media\/drive-stream\/([A-Za-z0-9_-]{10,200})/);
  if (legacy) return '/api/drive/stream/' + encodeURIComponent(legacy[1]);
  try {
    const url = new URL(value);
    if (!['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'www.drive.google.com'].includes(url.hostname.toLowerCase())) return value;
    const parts = url.pathname.split('/').filter(Boolean);
    const d = parts.indexOf('d');
    const id = (d >= 0 ? parts[d + 1] : '') || url.searchParams.get('id') || '';
    return /^[A-Za-z0-9_-]{10,200}$/.test(id) ? '/api/drive/stream/' + encodeURIComponent(id) : value;
  } catch { return value; }
}

/** Estimates BPM and the opening beat offset from the transient energy in the first 30 seconds. */
async function detectBpm(audioUrl: string): Promise<{ bpm: number; beatOffsetMs: number }> {
  const response = await fetch(playableUrl(audioUrl), { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Audio download failed (' + response.status + ').');
  const bytes = await response.arrayBuffer();
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser does not support audio analysis.');
  const context: AudioContext = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const samples = decoded.getChannelData(0);
    const windowSize = 1024;
    const hop = 512;
    const sampleLimit = Math.min(samples.length, decoded.sampleRate * 30);
    const energy: number[] = [];
    for (let start = 0; start + windowSize < sampleLimit; start += hop) {
      let sum = 0;
      for (let i = start; i < start + windowSize; i += 4) sum += samples[i] * samples[i];
      energy.push(Math.sqrt(sum / (windowSize / 4)));
    }
    const onset = energy.map((value, index) => index ? Math.max(0, value - energy[index - 1]) : 0);
    const average = onset.reduce((sum, value) => sum + value, 0) / Math.max(1, onset.length);
    for (let i = 0; i < onset.length; i++) onset[i] = Math.max(0, onset[i] - average);
    const framesPerSecond = decoded.sampleRate / hop;
    let bestLag = 0;
    let bestScore = 0;
    for (let bpm = 60; bpm <= 200; bpm++) {
      const lag = Math.round(framesPerSecond * 60 / bpm);
      if (lag < 1 || lag >= onset.length / 2) continue;
      let score = 0;
      for (let i = lag; i < onset.length; i++) score += onset[i] * onset[i - lag];
      if (score > bestScore) { bestScore = score; bestLag = lag; }
    }
    if (!bestLag || bestScore <= 0) throw new Error('No reliable beat pattern was found.');
    let bestPhase = 0;
    let phaseScore = -Infinity;
    for (let phase = 0; phase < bestLag; phase++) {
      let score = 0;
      for (let i = phase; i < onset.length; i += bestLag) score += onset[i];
      if (score > phaseScore) { phaseScore = score; bestPhase = phase; }
    }
    return {
      bpm: Math.max(60, Math.min(200, Math.round(framesPerSecond * 60 / bestLag))),
      beatOffsetMs: Math.max(0, Math.min(2000, Math.round(bestPhase * hop / decoded.sampleRate * 1000))),
    };
  } finally { await context.close().catch(() => undefined); }
}

const backButton = (onClick: () => void) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/20 bg-[#111827] px-3 py-2 text-xs font-bold text-amber-100 transition hover:border-amber-200/50 hover:bg-[#1b2637]"><ArrowLeft className="h-3.5 w-3.5"/> VIP Arcade</button>
);

export const GamesHub: React.FC<Props> = ({ isAdmin, songs, bulkUpdateSongs, updateSong, refreshSongLibrary }) => {
  const [selectedGame, setSelectedGame] = useState<SelectedGame>('menu');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [analysis, setAnalysis] = useState({ done: 0, total: 0, active: false, failed: 0 });
  const analysisStarted = useRef(false);
  const songsSnapshot = useRef(songs);
  songsSnapshot.current = songs;

  const filteredSongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return songs.filter(song => !q || song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q));
  }, [songs, search]);

  const applyBulk = async (updates: Partial<Song>, description: string) => {
    if (!selectedIds.length || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const ok = await bulkUpdateSongs(selectedIds, updates);
      if (!ok) throw new Error('The server did not confirm the bulk update.');
      setMessage(description + ' for ' + selectedIds.length + ' songs.');
      setSelectedIds([]);
      refreshSongLibrary();
    } catch (error: any) { setMessage(error?.message || 'Bulk update failed.'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!isAdmin || analysisStarted.current) return;
    const pending = songsSnapshot.current.filter(song => song.gameBpmDetected !== true && !!song.audioUrl && !song.audioUrl.startsWith('data:'));
    if (!pending.length) return;
    analysisStarted.current = true;
    let cancelled = false;
    setAnalysis({ done: 0, total: pending.length, active: true, failed: 0 });
    void (async () => {
      let done = 0, failed = 0;
      for (const song of pending) {
        if (cancelled) break;
        try {
          const detected = await detectBpm(song.audioUrl);
          if (cancelled) break;
          await updateSong(song.id, { gameBpm: detected.bpm, gameBeatOffsetMs: detected.beatOffsetMs, gameBpmDetected: true });
        } catch (error) { failed += 1; console.warn('[Games] BPM analysis failed for ' + song.title, error); }
        done += 1;
        setAnalysis({ done, total: pending.length, active: !cancelled && done < pending.length, failed });
      }
      if (!cancelled) { refreshSongLibrary(); setAnalysis({ done, total: pending.length, active: false, failed }); }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, songs.length > 0]);

  const returnToMenu = () => setSelectedGame('menu');
  if (selectedGame === 'guess') return <div className="space-y-4">{backButton(returnToMenu)}<GuessTrackGame/></div>;
  if (selectedGame === 'rhythm') return <div className="space-y-4">{backButton(returnToMenu)}<RhythmGame/></div>;
  if (selectedGame === 'retro') return <ExternalGameEmbed title="Retro Bowl" url="https://www.miniplay.com/embed/retro-bowl" controls="Use the game’s on-screen or keyboard controls to manage your team and play offense." onBack={returnToMenu}/>;
  if (selectedGame === 'dash') return <ExternalGameEmbed title="Geometry Dash" url="https://www.miniplay.com/embed/geometry-dash-online" controls="Click, tap, or press Space to jump. This is a hosted Geometry Dash browser version." onBack={returnToMenu}/>;
  if (selectedGame === 'crossy') return <CrossyRoadGame url={String(import.meta.env.VITE_CROSSY_ROAD_URL || '')} onBack={returnToMenu}/>

  const cards = [
    { id:'retro' as const, title:'Retro Bowl', subtitle:'EMBEDDED BROWSER GAME', genre:'FOOTBALL · NEW STAR GAMES', desc:'Play Retro Bowl directly inside YouSong using the hosted browser-game player.', color:'amber', keys:'IN-PAGE EMBED', icon:<Trophy className="h-6 w-6"/> },
    { id:'dash' as const, title:'Geometry Dash', subtitle:'EMBEDDED BROWSER GAME', genre:'RHYTHM PLATFORMER', desc:'Play a hosted Geometry Dash browser version directly inside YouSong.', color:'fuchsia', keys:'IN-PAGE EMBED', icon:<Zap className="h-6 w-6"/> },
    { id:'crossy' as const, title:'Crossy Road', subtitle:'EMBEDDED BROWSER GAME', genre:'ARCADE · HIPSTER WHALE', desc:'Play Crossy Road directly inside YouSong using the hosted browser-game player.', color:'lime', keys:'IN-PAGE EMBED', icon:<ArrowRight className="h-6 w-6"/> },
    { id:'guess' as const, title:'Guess the Track', subtitle:'YOUSONG MUSIC QUIZ', genre:'MUSIC TRIVIA', desc:'Hear short clips from approved YouSong tracks, identify the song, and compete for the highest score.', color:'silver', keys:'10 ROUNDS · LEADERBOARD', icon:<Headphones className="h-6 w-6"/> },
    { id:'rhythm' as const, title:'Rhythm Battle', subtitle:'FOUR-LANE RHYTHM', genre:'MUSIC ACTION', desc:'Play falling-note charts synced to the detected beat of Game Approved songs. Choose Easy, Normal, or Hard.', color:'gold', keys:'BPM-SYNCED GAMEPLAY', icon:<AudioLines className="h-6 w-6"/> },
  ];
  const cardTone:Record<string,string> = {
    amber:'border-amber-300/25 bg-gradient-to-br from-[#322816] via-[#171c29] to-[#101725] text-amber-200',
    fuchsia:'border-fuchsia-300/25 bg-gradient-to-br from-[#2a1741] via-[#17182c] to-[#101725] text-fuchsia-200',
    lime:'border-lime-300/25 bg-gradient-to-br from-[#1e3525] via-[#17252a] to-[#101725] text-lime-200',
    silver:'border-slate-200/25 bg-gradient-to-br from-[#303949] via-[#192333] to-[#101725] text-slate-200',
    gold:'border-yellow-200/30 bg-gradient-to-br from-[#3a301b] via-[#202332] to-[#101725] text-yellow-200',
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28 animate-in fade-in">
      <section className="relative overflow-hidden rounded-[30px] border border-amber-200/30 bg-[#0b1220] p-6 text-white shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full bg-amber-400/15 blur-3xl"/>
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-slate-200/10 blur-3xl"/>
        <div className="absolute right-5 top-5 hidden rounded-xl border border-amber-100/20 bg-white/[.04] px-3 py-2 text-right sm:block"><div className="text-[9px] font-black tracking-[.2em] text-amber-200">EXCLUSIVE ACCESS</div><div className="mt-0.5 text-xs font-black text-slate-100">GOLD × SILVER</div></div>
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-gradient-to-r from-amber-300/15 to-slate-100/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.2em] text-amber-100"><Crown className="h-3.5 w-3.5"/> VIP ARCADE <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[8px] text-slate-950">BETA</span></div>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">The VIP <span className="bg-gradient-to-r from-amber-200 via-white to-slate-300 bg-clip-text text-transparent">Arcade.</span></h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">A curated mix of hosted browser games and original YouSong music challenges. Access is reserved for accounts with VIP Games access.</p>
          <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-lg border border-amber-200/20 bg-amber-100/10 px-3 py-2 text-[10px] font-bold text-amber-100">5 PLAYABLE GAMES</span><span className="rounded-lg border border-slate-200/20 bg-slate-100/10 px-3 py-2 text-[10px] font-bold text-slate-200">EXCLUSIVE BUILD</span><span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-300">MORE GAMES IN DEVELOPMENT</span></div>
        </div>
        <div className="pointer-events-none absolute bottom-0 right-0 h-1 w-full bg-gradient-to-r from-transparent via-amber-200/70 to-slate-100/70"/>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card,index)=>(
          <button key={card.id} type="button" onClick={()=>setSelectedGame(card.id)} className={'group relative min-h-[250px] overflow-hidden rounded-3xl border p-5 text-left shadow-lg transition duration-200 hover:-translate-y-1 hover:shadow-2xl '+cardTone[card.color]}>
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/[.06] blur-2xl transition group-hover:bg-white/[.12]"/>
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-current/20 bg-black/20">{card.icon}</span><span className="rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[8px] font-black tracking-[.13em]">{card.genre}</span></div>
              <div className="mt-5 text-[9px] font-black uppercase tracking-[.24em] opacity-75">{card.subtitle}</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-white">{card.title}</h2>
              <p className="mt-2 flex-1 text-xs leading-5 text-slate-300">{card.desc}</p>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-[9px] font-black tracking-wider"><span className="text-white/60">{card.keys}</span><span className="inline-flex items-center gap-1 text-white transition group-hover:gap-2">PLAY <ArrowRight className="h-3.5 w-3.5"/></span></div>
            </div>
            {index<3&&<span className="absolute bottom-3 right-3 h-1 w-12 rounded-full bg-gradient-to-r from-amber-200/80 to-slate-100/70 opacity-50"/>}
          </button>
        ))}
      </div>

      <section className="rounded-3xl border border-amber-100/15 bg-gradient-to-r from-[#171c28] to-[#252b36] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200/20 bg-amber-100/10 text-amber-200"><Shield className="h-5 w-5"/></div><div><div className="text-xs font-black text-white">VIP Arcade Access</div><div className="mt-0.5 text-[10px] text-slate-400">Games are visible only to members who have been granted Games access by an administrator.</div></div></div><div className="inline-flex items-center gap-1.5 rounded-full border border-slate-100/15 bg-white/5 px-3 py-1.5 text-[9px] font-black tracking-wider text-slate-200"><Crown className="h-3.5 w-3.5 text-amber-200"/> GOLD · SILVER</div></div></section>

      {isAdmin && <section className="overflow-hidden rounded-3xl border border-amber-200/20 bg-[#111925] shadow-sm">
        <div className="border-b border-white/10 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-white">Song Game Management</h2><p className="mt-1 text-xs text-slate-400">Bulk approve songs for games and control Christmas Edition directly here.</p></div><span className="rounded-xl border border-amber-200/20 bg-amber-100/10 px-3 py-2 text-xs font-bold text-amber-100">{songs.filter(song=>song.gameApproved).length} Game Approved</span></div>
          {analysis.total>0&&<div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3"><div className="flex justify-between gap-3 text-xs"><span className="font-bold text-cyan-100">{analysis.active?'Automatically detecting song beats…':'Beat analysis finished'}</span><span className="tabular-nums text-cyan-200">{analysis.done}/{analysis.total}{analysis.failed?' · '+analysis.failed+' not detected':''}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{width:(analysis.done/analysis.total*100)+'%'}}/></div></div>}
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search songs or artists…" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-xs text-white outline-none focus:border-amber-200/50"/></div><button type="button" onClick={()=>setSelectedIds(current=>{const visible=filteredSongs.map(song=>song.id);return visible.every(id=>current.includes(id))?current.filter(id=>!visible.includes(id)):Array.from(new Set([...current,...visible]));})} className="rounded-xl border border-white/15 px-3 py-2.5 text-xs font-bold text-slate-200">Select visible</button><span className="text-xs text-slate-400">{selectedIds.length} selected</span></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={!selectedIds.length||busy} onClick={()=>void applyBulk({gameApproved:true},'Game Approved enabled')} className="rounded-xl bg-amber-300 px-3 py-2.5 text-xs font-black text-slate-950 disabled:opacity-40">Approve for Games</button><button type="button" disabled={!selectedIds.length||busy} onClick={()=>void applyBulk({gameApproved:false},'Game approval removed')} className="rounded-xl border border-slate-200/20 px-3 py-2.5 text-xs font-bold text-slate-200 disabled:opacity-40">Unapprove</button><span className="mx-1 hidden h-8 w-px bg-white/10 sm:block"/><button type="button" disabled={!selectedIds.length||busy} onClick={()=>void applyBulk({isChristmasEdition:true},'Christmas Edition enabled')} className="rounded-xl bg-emerald-500 px-3 py-2.5 text-xs font-black text-white disabled:opacity-40">Enable Christmas</button><button type="button" disabled={!selectedIds.length||busy} onClick={()=>void applyBulk({isChristmasEdition:false},'Christmas Edition disabled')} className="rounded-xl border border-white/15 px-3 py-2.5 text-xs font-bold text-slate-200 disabled:opacity-40">Disable Christmas</button></div>
          {message&&<p className="text-xs font-semibold text-amber-100">{message}</p>}
          <div className="max-h-[430px] overflow-y-auto rounded-2xl border border-white/10">{filteredSongs.map(song=><label key={song.id} className="flex cursor-pointer items-center gap-3 border-b border-white/5 p-3 last:border-0 hover:bg-white/[.03]"><input type="checkbox" checked={selectedIds.includes(song.id)} onChange={()=>setSelectedIds(current=>current.includes(song.id)?current.filter(id=>id!==song.id):[...current,song.id])} className="h-4 w-4 accent-amber-300"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-white">{song.title}</div><div className="truncate text-[10px] text-slate-400">{song.artist}</div></div><div className="flex shrink-0 flex-wrap justify-end gap-1.5">{song.gameApproved&&<span className="rounded-md bg-amber-100/10 px-2 py-1 text-[9px] font-bold text-amber-100">Approved</span>}{song.isChristmasEdition&&<span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-200">Christmas</span>}<span className="rounded-md bg-white/5 px-2 py-1 text-[9px] text-slate-400">{song.gameBpmDetected?song.gameBpm+' BPM':'Beat pending'}</span></div></label>)}{!filteredSongs.length&&<p className="p-6 text-center text-xs text-slate-500">No matching songs.</p>}</div>
          <p className="text-[10px] leading-relaxed text-slate-500">Beat analysis runs one track at a time in your browser. Unusual timing may still need a manual BPM correction.</p>
        </div>
      </section>}
      <p className="text-center text-[9px] text-slate-500">YouSong VIP Arcade · Hosted browser games + original music challenges · Beta</p>
    </div>
  );
};