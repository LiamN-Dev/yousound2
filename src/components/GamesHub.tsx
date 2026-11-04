import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, AudioLines, Gamepad2, Headphones, Music2, Search, Trophy, Zap } from 'lucide-react';
import { Song } from '../types';
import { GuessTrackGame } from './GuessTrackGame';
import { RhythmGame } from './RhythmGame';

type SelectedGame = 'menu' | 'guess' | 'rhythm';
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

/** Estimates BPM from transient energy in the first 30 seconds of a song. */
async function detectBpm(audioUrl: string): Promise<number> {
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
    return Math.max(60, Math.min(200, Math.round(framesPerSecond * 60 / bestLag)));
  } finally {
    await context.close().catch(() => undefined);
  }
}

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
    } catch (error: any) {
      setMessage(error?.message || 'Bulk update failed.');
    } finally { setBusy(false); }
  };

  // Analyze missing tracks automatically for admins, sequentially, so the library is never downloaded all at once.
  useEffect(() => {
    if (!isAdmin || analysisStarted.current) return;
    const pending = songsSnapshot.current.filter(song => song.gameBpmDetected !== true && !!song.audioUrl && !song.audioUrl.startsWith('data:'));
    if (!pending.length) return;
    analysisStarted.current = true;
    let cancelled = false;
    setAnalysis({ done: 0, total: pending.length, active: true, failed: 0 });
    void (async () => {
      let done = 0;
      let failed = 0;
      for (const song of pending) {
        if (cancelled) break;
        try {
          const bpm = await detectBpm(song.audioUrl);
          if (cancelled) break;
          await updateSong(song.id, { gameBpm: bpm, gameBpmDetected: true });
        } catch (error) {
          failed += 1;
          console.warn('[Games] Automatic BPM analysis failed for ' + song.title, error);
        }
        done += 1;
        setAnalysis({ done, total: pending.length, active: !cancelled && done < pending.length, failed });
      }
      if (!cancelled) {
        refreshSongLibrary();
        setAnalysis({ done, total: pending.length, active: false, failed });
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, songs.length > 0]);

  if (selectedGame === 'guess') return <div className="space-y-4"><button type="button" onClick={() => setSelectedGame('menu')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"><ArrowLeft className="h-3.5 w-3.5" /> All Games</button><GuessTrackGame /></div>;
  if (selectedGame === 'rhythm') return <RhythmGame onBack={() => setSelectedGame('menu')} />;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28 animate-in fade-in">
      <section className="relative overflow-hidden rounded-3xl border border-violet-400/25 bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="relative"><div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200"><Gamepad2 className="h-3.5 w-3.5" /> YouSong Arcade</div><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Choose a game</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">Play with tracks from the YouSong library. Only Game Approved songs appear in games.</p></div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" onClick={() => setSelectedGame('guess')} className="group rounded-3xl border border-violet-300/30 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-violet-400/20 dark:bg-slate-900 sm:p-6">
          <div className="flex items-start justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Headphones className="h-6 w-6" /></span><span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[9px] font-bold uppercase text-violet-600 dark:text-violet-300">Music trivia</span></div><h2 className="mt-5 text-xl font-black text-slate-900 dark:text-white">Guess the Track</h2><p className="mt-2 min-h-12 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Listen to short clips, identify the song from four choices, and climb the scoreboard.</p><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-[10px] font-semibold text-violet-600 dark:border-white/10 dark:text-violet-300"><span>10 rounds · Fast guesses score more</span><span className="inline-flex items-center gap-1">Play <ArrowRight className="h-3.5 w-3.5" /></span></div>
        </button>
        <button type="button" onClick={() => setSelectedGame('rhythm')} className="group rounded-3xl border border-cyan-300/30 bg-slate-950 p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:p-6">
          <div className="flex items-start justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200"><AudioLines className="h-6 w-6" /></span><span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[9px] font-bold uppercase text-cyan-200">Rhythm action</span></div><h2 className="mt-5 text-xl font-black text-white">Rhythm Battle</h2><p className="mt-2 min-h-12 text-xs leading-relaxed text-slate-300">Hit four falling arrow lanes in time with the detected tempo. Choose Easy, Normal, or Hard.</p><div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-[10px] font-semibold text-cyan-200"><span>Four lanes · Auto BPM</span><span className="inline-flex items-center gap-1">Play <ArrowRight className="h-3.5 w-3.5" /></span></div>
        </button>
      </div>

      {isAdmin && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-5 dark:border-white/10"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900 dark:text-white">Song Game Management</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Bulk-approve games and manage Christmas editions here, without crowding the Admin tab.</p></div><span className="rounded-xl bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-700 dark:text-violet-200">{songs.filter(song => song.gameApproved).length} game approved</span></div>
          {analysis.total > 0 && <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-500/20 dark:bg-cyan-500/10"><div className="flex justify-between gap-3 text-xs"><span className="font-bold text-cyan-900 dark:text-cyan-100">{analysis.active ? 'Automatically detecting song beats…' : 'Beat analysis finished'}</span><span className="tabular-nums text-cyan-800 dark:text-cyan-200">{analysis.done}/{analysis.total}{analysis.failed ? ' · ' + analysis.failed + ' not detected' : ''}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cyan-200 dark:bg-cyan-950"><div className="h-full rounded-full bg-cyan-600 transition-all" style={{ width: (analysis.done / analysis.total * 100) + '%' }} /></div></div>}
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search songs or artists…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-violet-400 dark:border-white/10 dark:bg-slate-950 dark:text-white" /></div><button type="button" onClick={() => setSelectedIds(current => { const visible = filteredSongs.map(song => song.id); return visible.every(id => current.includes(id)) ? current.filter(id => !visible.includes(id)) : Array.from(new Set([...current, ...visible])); })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:text-slate-200">Select visible</button><span className="text-xs text-slate-500">{selectedIds.length} selected</span></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={!selectedIds.length || busy} onClick={() => void applyBulk({ gameApproved: true }, 'Game Approved enabled')} className="rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40">Approve for Games</button><button type="button" disabled={!selectedIds.length || busy} onClick={() => void applyBulk({ gameApproved: false }, 'Game approval removed')} className="rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-white/15 dark:text-slate-200">Unapprove</button><span className="mx-1 hidden h-8 w-px bg-slate-200 sm:block dark:bg-white/10" /><button type="button" disabled={!selectedIds.length || busy} onClick={() => void applyBulk({ isChristmasEdition: true }, 'Christmas mode enabled')} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40">Enable Christmas mode</button><button type="button" disabled={!selectedIds.length || busy} onClick={() => void applyBulk({ isChristmasEdition: false }, 'Christmas mode disabled')} className="rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-white/15 dark:text-slate-200">Disable Christmas mode</button></div>
          {message && <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{message}</p>}
          <div className="max-h-[430px] overflow-y-auto rounded-2xl border border-slate-200 dark:border-white/10">{filteredSongs.map(song => <label key={song.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 p-3 last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.03]"><input type="checkbox" checked={selectedIds.includes(song.id)} onChange={() => setSelectedIds(current => current.includes(song.id) ? current.filter(id => id !== song.id) : [...current, song.id])} className="h-4 w-4 accent-violet-600" /><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-900 dark:text-white">{song.title}</div><div className="truncate text-[10px] text-slate-500 dark:text-slate-400">{song.artist}</div></div><div className="flex shrink-0 flex-wrap justify-end gap-1.5">{song.gameApproved && <span className="rounded-md bg-violet-500/10 px-2 py-1 text-[9px] font-bold text-violet-700 dark:text-violet-200">Game Approved</span>}{song.isChristmasEdition && <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-700 dark:text-emerald-200">Christmas</span>}<span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] text-slate-500 dark:bg-white/5 dark:text-slate-400">{song.gameBpmDetected ? song.gameBpm + ' BPM' : 'Beat pending'}</span></div></label>)}{!filteredSongs.length && <p className="p-6 text-center text-xs text-slate-500">No matching songs.</p>}</div>
          <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">Beat analysis runs automatically in your browser, one track at a time. Tracks with unusual timing may still need a manual BPM correction in the song editor.</p>
        </div>
      </section>}

      <div className="grid gap-3 sm:grid-cols-3"><div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><Music2 className="h-5 w-5 text-violet-500" /><div><div className="text-xs font-bold text-slate-800 dark:text-white">YouSong library</div><div className="text-[10px] text-slate-500 dark:text-slate-400">Actual library audio</div></div></div><div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><Trophy className="h-5 w-5 text-amber-500" /><div><div className="text-xs font-bold text-slate-800 dark:text-white">Saved leaderboards</div><div className="text-[10px] text-slate-500 dark:text-slate-400">Scores persist across sessions</div></div></div><div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><Zap className="h-5 w-5 text-cyan-500" /><div><div className="text-xs font-bold text-slate-800 dark:text-white">Automatic beat analysis</div><div className="text-[10px] text-slate-500 dark:text-slate-400">Tempo estimated from audio</div></div></div></div>
    </div>
  );
};
