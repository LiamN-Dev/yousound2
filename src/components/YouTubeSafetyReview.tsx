import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Ban, Check, CheckCircle2, Clock3, RefreshCw, ShieldAlert, ShieldCheck, Unlock } from 'lucide-react';

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
  blocked?: boolean;
  autoBlocked?: boolean;
  autoBlockReason?: string;
};

type SearchSafetyActivity = {
  uid: string; username: string; query: string; decision: SafetyDecision;
  category: string; reason: string; confidence: number; createdAt: string; autoLocked: boolean;
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
  const [searchActivities, setSearchActivities] = useState<SearchSafetyActivity[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'review'>('review');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');

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
      setSearchActivities(Array.isArray(data.searchActivities) ? data.searchActivities : []);
      setSelectedVideoIds(new Set());
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load YouTube viewing activity.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  const moderateVideo = async (videoId: string, action: 'block' | 'unblock' | 'mark-safe' | 'mark-review') => {
    setActionBusy(videoId + ':' + action);
    setError('');
    setActionFeedback('');
    try {
      const response = await fetch('/api/admin/youtube-mode/video-moderation', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not update this video.');
      const now = new Date().toISOString();
      setActivities(current => current.map(item => item.videoId !== videoId ? item : {
        ...item,
        blocked: action === 'block' ? true : action === 'unblock' ? false : item.blocked,
        ...(action === 'mark-safe' ? { safetyDecision: 'safe' as SafetyDecision, safetyCategory: 'administrator-review', safetyReason: 'Administrator marked this video as safe.', safetyReviewedAt: now } : {}),
        ...(action === 'mark-review' ? { safetyDecision: 'review' as SafetyDecision, safetyCategory: 'administrator-review', safetyReason: 'Administrator requested human review.', safetyReviewedAt: now } : {}),
      }));
      setActionFeedback(action === 'block' ? 'Video blocked for everyone in YouSound.' : action === 'unblock' ? 'Video unblocked.' : action === 'mark-safe' ? 'Video marked safe.' : 'Video returned to human review.');
    } catch (actionError: any) {
      setError(actionError?.message || 'The video moderation action failed.');
    } finally {
      setActionBusy('');
    }
  };

  const visible = filter === 'review'
    ? activities.filter(item => item.blocked || item.safetyDecision === 'review' || item.safetyDecision === 'high-risk' || item.safetyDecision === 'unavailable' || item.safetyDecision === 'pending')
    : activities;
  const selectableVideoIds = [...new Set(visible.filter(item => !item.blocked).map(item => item.videoId))];
  const allVisibleSelected = selectableVideoIds.length > 0 && selectableVideoIds.every(id => selectedVideoIds.has(id));
  const bulkBlockSelected = async () => {
    const videoIds = [...selectedVideoIds].filter(id => selectableVideoIds.includes(id));
    if (!videoIds.length || bulkBusy) return;
    setBulkBusy(true); setError(''); setActionFeedback('');
    try {
      const response = await fetch('/api/admin/youtube-mode/video-moderation/bulk', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoIds, action: 'block' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not block selected videos.');
      setActivities(current => current.map(item => videoIds.includes(item.videoId) ? { ...item, blocked: true, autoBlocked: false } : item));
      setSelectedVideoIds(new Set());
      setActionFeedback(`${Number(data.updatedCount) || videoIds.length} selected video(s) blocked for everyone.`);
    } catch (bulkError: any) { setError(bulkError?.message || 'Bulk moderation failed.'); }
    finally { setBulkBusy(false); }
  };

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
        AI screening checks public metadata and search text—not the actual video/audio. High-confidence violations are automatically blocked and may lock the account; ambiguous results stay in this review queue. Administrators can inspect, unblock, or mark items safe.
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setFilter('review')} className={'rounded-lg px-3 py-2 text-[10px] font-bold ' + (filter === 'review' ? 'bg-amber-300 text-slate-950' : 'border border-white/10 text-slate-300')}>Needs attention</button>
          <button type="button" onClick={() => setFilter('all')} className={'rounded-lg px-3 py-2 text-[10px] font-bold ' + (filter === 'all' ? 'bg-cyan-200 text-slate-950' : 'border border-white/10 text-slate-300')}>All activity</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[10px] text-slate-400"><input type="checkbox" checked={allVisibleSelected} onChange={e => setSelectedVideoIds(e.target.checked ? new Set([...selectedVideoIds, ...selectableVideoIds]) : new Set([...selectedVideoIds].filter(id => !selectableVideoIds.includes(id))))} className="h-3.5 w-3.5 accent-cyan-300" />Select all visible</label>
          <button type="button" disabled={!selectedVideoIds.size || bulkBusy} onClick={() => void bulkBlockSelected()} className="rounded-lg bg-rose-400/15 px-3 py-2 text-[10px] font-bold text-rose-100 disabled:opacity-40">{bulkBusy ? 'Blocking…' : `Block selected (${selectedVideoIds.size})`}</button>
          <span className="text-[10px] tabular-nums text-slate-500">{visible.length} videos · {searchActivities.length} flagged searches</span>
        </div>
      </div>
      {error && <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {actionFeedback && <div role="status" className="mx-5 mb-4 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-xs text-emerald-100">{actionFeedback}</div>}
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
                    <input type="checkbox" aria-label={`Select video ${item.videoTitle}`} checked={selectedVideoIds.has(item.videoId)} disabled={!!item.blocked} onChange={e => setSelectedVideoIds(current => { const next = new Set(current); if (e.target.checked) next.add(item.videoId); else next.delete(item.videoId); return next; })} className="h-3.5 w-3.5 accent-cyan-300 disabled:opacity-30" />
                    <span className={'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-wider ' + (high ? 'bg-rose-500/15 text-rose-200' : attention ? 'bg-amber-400/15 text-amber-100' : decision === 'safe' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-slate-700/70 text-slate-300')}>
                      {high || attention ? <ShieldAlert className="h-3 w-3" /> : decision === 'safe' ? <ShieldCheck className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                      {decisionLabel[decision]}
                    </span>
                    {item.safetyCategory && <span className="text-[9px] uppercase tracking-wider text-slate-500">{item.safetyCategory}</span>}
                    {item.blocked && <span className="rounded-md bg-rose-500/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-rose-200">Blocked for everyone</span>}
                    {item.autoBlocked && <span className="rounded-md bg-violet-500/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-violet-200">AI auto-blocked · review</span>}
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-white">{item.videoTitle || 'Untitled video'}</h3>
                  <p className="mt-1 truncate text-xs text-slate-400">{item.channelTitle || 'Unknown channel'}</p>
                  {item.safetyReason && <p className="mt-2 text-xs leading-5 text-slate-300">{item.safetyReason}</p>}
                  <p className="mt-2 break-all font-mono text-[9px] text-slate-600">Video ID: {item.videoId}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={!!actionBusy} onClick={() => void moderateVideo(item.videoId, item.blocked ? 'unblock' : 'block')} className={'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-bold disabled:opacity-50 ' + (item.blocked ? 'bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/25' : 'bg-rose-400/15 text-rose-100 hover:bg-rose-400/25')}>
                      {item.blocked ? <Unlock className="h-3 w-3" /> : <Ban className="h-3 w-3" />}{item.blocked ? 'Unblock video' : 'Block for everyone'}
                    </button>
                    <button type="button" disabled={!!actionBusy} onClick={() => void moderateVideo(item.videoId, 'mark-safe')} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/20 px-3 py-2 text-[10px] font-bold text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-50"><Check className="h-3 w-3" />Mark safe</button>
                    <button type="button" disabled={!!actionBusy} onClick={() => void moderateVideo(item.videoId, 'mark-review')} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/20 px-3 py-2 text-[10px] font-bold text-amber-100 hover:bg-amber-300/10 disabled:opacity-50"><ShieldAlert className="h-3 w-3" />Needs review</button>
                  </div>
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
      {searchActivities.length > 0 && <div className="border-t border-white/10">
        <div className="flex items-center justify-between gap-3 px-5 py-4"><div><h3 className="text-sm font-black text-white">Flagged search queries</h3><p className="mt-1 text-[10px] text-slate-500">Queries flagged by AI triage. High-confidence violations automatically lock the account; ambiguous cases stay review-only.</p></div><span className="text-[10px] text-slate-500">{searchActivities.length} records</span></div>
        <div className="divide-y divide-white/[.06]">{searchActivities.map((item, index) => <article key={item.uid + ':' + item.createdAt + ':' + index} className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_180px]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={'rounded-md px-2 py-1 text-[9px] font-black uppercase ' + (item.decision === 'high-risk' ? 'bg-rose-500/15 text-rose-200' : 'bg-amber-400/15 text-amber-100')}>{item.decision}</span>{item.autoLocked && <span className="rounded-md bg-rose-500/15 px-2 py-1 text-[9px] font-black uppercase text-rose-200">Account auto-locked</span>}<span className="text-[9px] uppercase text-slate-500">{item.category}</span></div><p className="mt-2 break-words text-sm font-semibold text-white">“{item.query}”</p><p className="mt-1 text-xs text-slate-400">{item.reason}</p></div><div className="text-[10px] text-slate-400"><div className="font-semibold text-cyan-100">{item.username}</div><div className="mt-1">Confidence {Math.round(item.confidence * 100)}%</div><div className="mt-1">{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown time'}</div></div></article>)}</div>
      </div>}
    </section>
  );
};
