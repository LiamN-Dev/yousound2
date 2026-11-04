import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gamepad2, Headphones, Loader2, Medal, Play, RotateCcw, SkipForward, Trophy, Volume2 } from 'lucide-react';

type GameOption = { id: string; title: string; artist: string };
type GameRound = { roundNumber: number; totalRounds: number; audioUrl: string; clipSeconds: number; options: GameOption[] };
type RevealedSong = { id: string; title: string; artist: string; coverUrl?: string };
type LeaderboardEntry = { rank: number; userId: string; username: string; bestScore: number; gamesPlayed: number };

async function requestJson(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'The game request failed.');
  return data;
}

export const GuessTrackGame: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [round, setRound] = useState<GameRound | null>(null);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState('');
  const [revealedSong, setRevealedSong] = useState<RevealedSong | null>(null);
  const [clipSeconds, setClipSeconds] = useState(1);
  const [roundSolved, setRoundSolved] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadLeaderboard = useCallback(async () => {
    try {
      const data = await requestJson('/api/games/guess-track/leaderboard');
      setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);
    } catch (err: any) {
      setError(err?.message || 'Could not load the leaderboard.');
    }
  }, []);

  useEffect(() => {
    void loadLeaderboard();
    return () => {
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      audioRef.current?.pause();
    };
  }, [loadLeaderboard]);

  const stopClip = () => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    audioRef.current?.pause();
    setPlaying(false);
  };

  const playClip = async () => {
    const audio = audioRef.current;
    if (!audio || !round || loading || roundSolved) return;
    try {
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
      setPlaying(true);
      stopTimerRef.current = window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
        setPlaying(false);
        stopTimerRef.current = null;
      }, Math.max(1, clipSeconds) * 1000);
    } catch {
      setError('The preview could not play. Try again.');
      setPlaying(false);
    }
  };

  const startGame = async () => {
    setError('');
    setFeedback('');
    setLoading(true);
    stopClip();
    try {
      const data = await requestJson('/api/games/guess-track/start', {});
      setSessionId(data.sessionId);
      setScore(0);
      setRound(data.round);
      setClipSeconds(data.round.clipSeconds || 1);
      setSelectedOption('');
      setRevealedSong(null);
      setRoundSolved(false);
      setCompleted(false);
    } catch (err: any) {
      setError(err?.message || 'Could not start the game.');
    } finally {
      setLoading(false);
    }
  };

  const submitGuess = async (songId?: string, skip = false) => {
    if (!sessionId || !round || loading || roundSolved) return;
    setError('');
    setFeedback('');
    setLoading(true);
    stopClip();
    if (songId) setSelectedOption(songId);
    try {
      const data = await requestJson('/api/games/guess-track/guess', {
        sessionId,
        ...(songId ? { songId } : {}),
        ...(skip ? { skip: true } : {}),
      });
      setScore(data.score || 0);
      setClipSeconds(data.clipSeconds || clipSeconds);
      if (data.solved) {
        setRoundSolved(true);
        setRevealedSong(data.revealSong || null);
        setFeedback(data.correct
          ? 'Correct! +' + Number(data.points || 0).toLocaleString() + ' points.'
          : 'The answer is revealed. No points this round.');
      } else {
        setSelectedOption('');
        setFeedback(skip
          ? 'More of the song unlocked: ' + data.clipSeconds + ' seconds.'
          : 'Not quite. Listen to ' + data.clipSeconds + ' seconds and try again.');
      }
    } catch (err: any) {
      setSelectedOption('');
      setError(err?.message || 'Your guess could not be submitted.');
    } finally {
      setLoading(false);
    }
  };

  const nextRound = async () => {
    if (!sessionId || loading || !roundSolved) return;
    setError('');
    setLoading(true);
    stopClip();
    try {
      const data = await requestJson('/api/games/guess-track/next', { sessionId });
      if (data.completed) {
        setCompleted(true);
        setRound(null);
        setFeedback('');
        await loadLeaderboard();
      } else {
        setRound(data.round);
        setClipSeconds(data.round.clipSeconds || 1);
        setSelectedOption('');
        setRevealedSong(null);
        setRoundSolved(false);
        setFeedback('');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not move to the next round.');
    } finally {
      setLoading(false);
    }
  };

  const resetView = () => {
    stopClip();
    setSessionId('');
    setRound(null);
    setScore(0);
    setSelectedOption('');
    setRevealedSong(null);
    setClipSeconds(1);
    setRoundSolved(false);
    setCompleted(false);
    setError('');
    setFeedback('');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28 animate-in fade-in">
      <audio ref={audioRef} src={round?.audioUrl || undefined} preload="auto" onEnded={() => setPlaying(false)} className="hidden" />

      <section className="relative overflow-hidden rounded-3xl border border-violet-400/25 bg-slate-950 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="relative grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200">
              <Gamepad2 className="h-3.5 w-3.5" /> YouSong Games
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Guess the Track</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
                Hear a tiny clip, pick the right song, and build your score. Every miss unlocks more audio.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">Up to 10 rounds per game</span>
              <span className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">4 YouSong choices</span>
              <span className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">Up to 1,000 points per round</span>
            </div>
            {!round && !completed && (
              <button type="button" onClick={startGame} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 transition hover:bg-violet-400 disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                Start a game
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 lg:p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your score</div>
              <div className="mt-1 text-2xl font-black tabular-nums">{score.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 lg:p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current round</div>
              <div className="mt-1 text-2xl font-black tabular-nums">{round ? round.roundNumber + '/' + round.totalRounds : '—'}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 lg:p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Clip unlocked</div>
              <div className="mt-1 text-2xl font-black tabular-nums">{round ? clipSeconds + 's' : '—'}</div>
            </div>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{error}</div>}

      {round && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">Round {round.roundNumber}</div>
                <h2 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">What are you listening to?</h2>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Headphones className="h-3.5 w-3.5" /> {clipSeconds} second{clipSeconds === 1 ? '' : 's'} unlocked
              </div>
            </div>

            <div className="rounded-2xl border border-violet-300/30 bg-gradient-to-br from-violet-600 to-indigo-800 p-5 text-white shadow-inner">
              <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-lg">
                  {playing ? <Volume2 className="h-7 w-7 animate-pulse" /> : <Headphones className="h-7 w-7" />}
                </div>
                <div className="text-sm font-bold">Mystery track</div>
                <div className="mt-1 text-xs text-white/70">Listen closely. You can replay the unlocked clip.</div>
                <button type="button" onClick={playClip} disabled={loading || roundSolved} className="mt-4 inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-violet-800 transition hover:bg-violet-50 disabled:opacity-50">
                  {playing ? <Volume2 className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                  {playing ? 'Playing clip…' : 'Play ' + clipSeconds + '-second clip'}
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {round.options.map((option, index) => {
                const isAnswer = revealedSong?.id === option.id;
                const choiceClass = isAnswer
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                  : selectedOption === option.id
                    ? 'border-violet-400 bg-violet-50 dark:bg-violet-500/10'
                    : 'border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-violet-500/10';
                return (
                  <button key={option.id} type="button" onClick={() => submitGuess(option.id)} disabled={loading || roundSolved} className={'group flex min-h-[68px] items-center gap-3 rounded-xl border px-3 py-3 text-left transition ' + choiceClass + (roundSolved ? ' cursor-default' : '') + (loading ? ' opacity-60' : '')}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">{String.fromCharCode(65 + index)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{option.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{option.artist}</span>
                    </span>
                    {isAnswer && <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-300">ANSWER</span>}
                  </button>
                );
              })}
            </div>

            {feedback && (
              <div className={'rounded-xl border px-4 py-3 text-xs font-semibold ' + (roundSolved ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-200')}>
                {feedback}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
              {!roundSolved ? (
                <button type="button" onClick={() => submitGuess(undefined, true)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
                  <SkipForward className="h-3.5 w-3.5" /> Reveal more audio
                </button>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {revealedSong ? 'Answer: ' + revealedSong.title + ' — ' + revealedSong.artist : 'Round completed'}
                </div>
              )}
              {roundSolved && (
                <button type="button" onClick={nextRound} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-violet-500 disabled:opacity-50">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                  {round.roundNumber === round.totalRounds ? 'Finish game' : 'Next round'}
                </button>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/80">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Scoring</h3>
              <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between"><span>First guess</span><span className="font-bold text-emerald-600 dark:text-emerald-300">1,000 pts</span></div>
                <div className="flex justify-between"><span>After 1 miss</span><span className="font-bold">800 pts</span></div>
                <div className="flex justify-between"><span>After 2 misses</span><span className="font-bold">600 pts</span></div>
                <div className="flex justify-between"><span>After 3 misses</span><span className="font-bold">400 pts</span></div>
                <div className="flex justify-between"><span>After 4 misses</span><span className="font-bold">250 pts</span></div>
                <div className="flex justify-between"><span>After 5 misses</span><span className="font-bold">100 pts</span></div>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/80">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Round progress</h3>
                <span className="text-[11px] font-bold tabular-nums text-violet-600 dark:text-violet-300">{round.roundNumber}/{round.totalRounds}</span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: round.totalRounds }, (_, i) => <span key={i} className={'h-2 flex-1 rounded-full ' + (i < round.roundNumber ? 'bg-violet-500' : 'bg-slate-200 dark:bg-white/10')} />)}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Each wrong answer unlocks a longer clip. The earlier you identify the track, the more points you bank.</p>
            </div>
          </aside>
        </section>
      )}

      {completed && (
        <section className="rounded-3xl border border-emerald-400/30 bg-emerald-50 p-6 text-center dark:bg-emerald-500/10 sm:p-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg"><Trophy className="h-8 w-8" /></div>
          <h2 className="mt-4 text-2xl font-black text-slate-900 dark:text-white">Game complete!</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Your score has been saved to the leaderboard.</p>
          <div className="mt-3 text-4xl font-black tabular-nums text-emerald-600 dark:text-emerald-300">{score.toLocaleString()}</div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={startGame} disabled={loading} className="rounded-xl bg-violet-600 px-5 py-3 text-xs font-extrabold text-white hover:bg-violet-500 disabled:opacity-50">Play again</button>
            <button type="button" onClick={resetView} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-white dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"><RotateCcw className="h-3.5 w-3.5" /> Back to Games</button>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Leaderboard</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Best completed game score per player</p>
            </div>
          </div>
          <button type="button" onClick={loadLeaderboard} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Refresh</button>
        </div>
        {leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">No completed games yet. Play the first round and set the first score.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 dark:border-white/10">
                  <th className="px-2 py-2">Rank</th><th className="px-2 py-2">Player</th><th className="px-2 py-2 text-right">Best score</th><th className="px-2 py-2 text-right">Games</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => {
                  const rankClass = entry.rank === 1 ? 'bg-amber-400/20 text-amber-600 dark:text-amber-300' : entry.rank === 2 ? 'bg-slate-300/40 text-slate-600 dark:text-slate-300' : entry.rank === 3 ? 'bg-orange-500/15 text-orange-600 dark:text-orange-300' : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400';
                  return (
                    <tr key={entry.userId} className="border-b border-slate-100 last:border-0 dark:border-white/[0.06]">
                      <td className="px-2 py-3"><span className={'inline-flex h-7 w-7 items-center justify-center rounded-lg font-black ' + rankClass}>{entry.rank === 1 ? <Medal className="h-4 w-4" /> : entry.rank}</span></td>
                      <td className="px-2 py-3 font-bold text-slate-800 dark:text-slate-200">{entry.username}</td>
                      <td className="px-2 py-3 text-right font-black tabular-nums text-violet-600 dark:text-violet-300">{entry.bestScore.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{entry.gamesPlayed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
