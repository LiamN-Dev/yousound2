import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, AudioLines, Gamepad2, Headphones, Music2, Trophy, Zap } from 'lucide-react';
import { GuessTrackGame } from './GuessTrackGame';
import { RhythmGame } from './RhythmGame';

type SelectedGame = 'menu' | 'guess' | 'rhythm';

export const GamesHub: React.FC = () => {
  const [selectedGame, setSelectedGame] = useState<SelectedGame>('menu');

  if (selectedGame === 'guess') {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSelectedGame('menu')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5">
          <ArrowLeft className="h-3.5 w-3.5" /> All Games
        </button>
        <GuessTrackGame />
      </div>
    );
  }

  if (selectedGame === 'rhythm') {
    return <RhythmGame onBack={() => setSelectedGame('menu')} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28 animate-in fade-in">
      <section className="relative overflow-hidden rounded-3xl border border-violet-400/25 bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200">
            <Gamepad2 className="h-3.5 w-3.5" /> YouSong Arcade
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Choose a game</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">Two ways to play with the songs in YouSong. The rhythm game only uses tracks an administrator has marked Game Approved.</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" onClick={() => setSelectedGame('guess')} className="group relative overflow-hidden rounded-3xl border border-violet-300/30 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-violet-400 hover:shadow-xl dark:border-violet-400/20 dark:bg-slate-900 sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl transition group-hover:bg-violet-500/20" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-500/10 text-violet-600 dark:text-violet-300"><Headphones className="h-6 w-6" /></span>
              <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">Music trivia</span>
            </div>
            <h2 className="mt-5 text-xl font-black text-slate-900 dark:text-white">Guess the Track</h2>
            <p className="mt-2 min-h-12 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Listen to short clips, identify the song from four choices, and climb the scoreboard.</p>
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-[10px] font-semibold text-slate-400 dark:border-white/10">
              <span>10 rounds · Fast guesses score more</span><span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-300">Play <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span>
            </div>
          </div>
        </button>

        <button type="button" onClick={() => setSelectedGame('rhythm')} className="group relative overflow-hidden rounded-3xl border border-cyan-300/30 bg-slate-950 p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-cyan-500/15 blur-2xl transition group-hover:bg-cyan-500/25" />
          <div className="pointer-events-none absolute -bottom-16 left-8 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-200"><AudioLines className="h-6 w-6" /></span>
              <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan-200">Rhythm action</span>
            </div>
            <h2 className="mt-5 text-xl font-black text-white">Rhythm Battle</h2>
            <p className="mt-2 min-h-12 text-xs leading-relaxed text-slate-300">Hit four falling arrow lanes in time with the beat. Choose Easy, Normal, or Hard and chase your high score.</p>
            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-[10px] font-semibold text-slate-400">
              <span>Four lanes · BPM-synced charts</span><span className="inline-flex items-center gap-1 text-cyan-200">Play <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span>
            </div>
          </div>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><Music2 className="h-5 w-5 text-violet-500" /><div><div className="text-xs font-bold text-slate-800 dark:text-white">YouSong library</div><div className="text-[10px] text-slate-500 dark:text-slate-400">Plays actual library audio</div></div></div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><Trophy className="h-5 w-5 text-amber-500" /><div><div className="text-xs font-bold text-slate-800 dark:text-white">Saved leaderboards</div><div className="text-[10px] text-slate-500 dark:text-slate-400">Scores persist across sessions</div></div></div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"><Zap className="h-5 w-5 text-cyan-500" /><div><div className="text-xs font-bold text-slate-800 dark:text-white">Admin approved tracks</div><div className="text-[10px] text-slate-500 dark:text-slate-400">Only approved songs enter games</div></div></div>
      </div>
    </div>
  );
};
