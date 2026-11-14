import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';

type SafetyDecision = 'pending' | 'safe' | 'review' | 'high-risk' | 'unavailable';
type WatchActivity = {
  uid: string;
  username: string;
  videoId: string;
  videoTitle: string;
  channelId: string;
  channelTitle: string;
  watchSeconds: number;
  openCount: number;
  playCount: number;
  firstWatchedAt: string;
  lastWatchedAt: string;
  lastEvent: string;
  safetyDecision: SafetyDecision;
  safetyCategory: string;
  safetyReason: string;
  safetyConfidence: number;
  safetyReviewedAt?: string;
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  if (safe < 60) return safe + 's';
  return Math.floor(safe / 60) + 'm ' + (safe % 60) + 's';
};

const decisionLabel: Record<SafetyDecision, string> = {
  pending: 'Screening pending',
  safe: 'No metadata concerns detected',
  review: 'Needs human review',
  'high-risk': 'High-risk metadata',
  unavailable: 'AI screening unavailable',
};

export const YouTubeSafetyReview: React.FC = () => {
  const [activities, setActivities] = useState<WatchActivity[]>([]);
  const [filter, setFilter] = useState<'all' | 'review'>('review');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadActivity = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/youtube-mode/watch-activity', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load YouTube viewing activity.');
      setActivities(Array.isArray(data.activities) ? data.activities : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load YouTube viewing activity.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  const visible = filter === 'review'
    ? activities.filter(item => item.safetyDecision === 'review' || item.safetyDecision === 'high-risk' || item.safetyDecision === 'unavailable' || item.safetyDecision === 'pending')
    : activities;

  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-200/15 bg-slate-950/90 text-white shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-5">
        <div>
          <div className="flex items-center gap-2 text-cyan-100"><ShieldCheck className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-[.2em]">Administrator review</span></div>
          <h2 className="mt-1 text-xl font-black">YouTube viewing safety</h2>
          <p className="mt-1 text-xs text-slate-400">Recent YouSound embedded-player activity and metadata screening results.</p>
        </div>
        <button type="button" onClick={() => void loadActivity(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[.08] disabled:opacity-50">
          <RefreshCw className={'h-3.5 w-3.5 ' + (refreshing ? 'animate-spin' : '')} /> Refresh
        </button>
      </div>
      <div className="border-b border-white/10 bg-cyan-950/20 px-5 py-3 text-[11px] leading-5 text-cyan-100/80">
        The monitor only sees videos opened in YouSound. AI screening checks public video metadata, not audio or visuals. A flag is a reason for an administrator to review—not proof of a violation and not an automatic punishment.
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setFilter('review')} className={'rounded-lg px-3 py-2 text-[10px] font-bold ' + (filter === 'review' ? 'bg-amber-300 text-slate-950' : 'border border-white/10 text-slate-300')}>Needs attention</button>
          <button type="button" onClick={() => setFilter('all')} className={'rounded-lg px-3 py-2 text-[10px] font-bold ' + (filter === 'all' ? 'bg-cyan-200 text-slate-950' : 'border border-white/10 text-slate-300')}>All activity</button>
        </div>
        <span className="text-[10px] tabular-nums text-slate-500">{visible.length} records shown · latest 250 stored records</span>
      </div>
      {error && <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {loading ? (
        <div className="p-10 text-center text-xs text-slate-400">Loading viewing activity…</div>
      ) : visible.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300" />
          <p className="mt-3 text-sm font-semibold text-slate-200">Nothing in this view</p>
          <p className="mt-1 text-xs text-slate-500">{filter === 'review' ? 'No pending or flagged metadata records are currently recorded.' : 'No YouSound embedded-player activity has been recorded yet.'}</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[.06]">
          {visible.map(item => {
            const decision = item.safetyDecision || 'pending';
            const high = decision === 'high-risk';
            const attention = decision === 'review' || high;
            return (
              <article key={item.uid + ':' + item.videoId} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_200px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-wider ' + (high ? 'bg-rose-500/15 text-rose-200' : attention ? 'bg-amber-400/15 text-amber-100' : decision === 'safe' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-slate-700/70 text-slate-300')}>
                      {high || attention ? <ShieldAlert className="h-3 w-3" /> : decision === 'safe' ? <ShieldCheck className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                      {decisionLabel[decision]}
                    </span>
                    {item.safetyCategory && <span className="text-[9px] uppercase tracking-wider text-slate-500">{item.safetyCategory}</span>}
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-white">{item.videoTitle || 'Untitled video'}</h3>
                  <p className="mt-1 truncate text-xs text-slate-400">{item.channelTitle || 'Unknown channel'}</p>
                  {item.safetyReason && <p className="mt-2 text-xs leading-5 text-slate-300">{item.safetyReason}</p>}
                  <p className="mt-2 break-all font-mono text-[9px] text-slate-600">Video ID: {item.videoId}</p>
                </div>
                <div className="rounded-xl border border-white/[.06] bg-white/[.025] p-3">
                  <div className="text-xs font-semibold text-cyan-100">{item.username || 'Unknown account'}</div>
                  <div className="mt-1 break-all font-mono text-[9px] text-slate-600">UID {item.uid}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <div><div className="text-slate-500">Watch time</div><div className="mt-0.5 font-bold tabular-nums text-white">{formatDuration(item.watchSeconds)}</div></div>
                    <div><div className="text-slate-500">Play sessions</div><div className="mt-0.5 font-bold tabular-nums text-white">{item.playCount || 0}</div></div>
                  </div>
                  <div className="mt-3 text-[9px] leading-4 text-slate-500">Last seen {item.lastWatchedAt ? new Date(item.lastWatchedAt).toLocaleString() : 'Unknown'}</div>
                  {item.safetyReviewedAt && <div className="mt-1 text-[9px] text-slate-600">Metadata screened {new Date(item.safetyReviewedAt).toLocaleString()}</div>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
