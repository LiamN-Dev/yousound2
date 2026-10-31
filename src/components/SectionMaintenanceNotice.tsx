import React from 'react';
import { Wrench, Sparkles } from 'lucide-react';

interface SectionMaintenanceNoticeProps {
  title: string;
  message: string;
  compact?: boolean;
}

export const SectionMaintenanceNotice: React.FC<SectionMaintenanceNoticeProps> = ({
  title,
  message,
  compact = false,
}) => (
  <div
    role="status"
    className={compact
      ? 'ys-dark-surface rounded-2xl border border-amber-400/20 bg-slate-950/85 p-5 text-center'
      : 'ys-dark-surface relative mx-auto my-8 max-w-2xl overflow-hidden rounded-3xl border border-amber-400/20 bg-slate-950/85 px-6 py-12 text-center shadow-2xl sm:px-10'}
  >
    {!compact && (
      <>
        <div className="pointer-events-none absolute -left-12 -top-20 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-12 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
      </>
    )}
    <div className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
      <Wrench className="h-5 w-5" />
    </div>
    <div className="relative flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
      <Sparkles className="h-3.5 w-3.5" />
      <span>Section maintenance</span>
    </div>
    <h2 className={`relative mt-2 font-display font-bold text-white ${compact ? 'text-base' : 'text-xl sm:text-2xl'}`}>
      {title} is temporarily paused
    </h2>
    <p className={`relative mx-auto mt-2 max-w-lg leading-relaxed text-slate-300 ${compact ? 'text-xs' : 'text-sm'}`}>
      {message || 'We are making a few improvements. Please check back soon.'}
    </p>
    {!compact && (
      <p className="relative mt-5 inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-medium text-emerald-200">
        The rest of YouSong is still available.
      </p>
    )}
  </div>
);
