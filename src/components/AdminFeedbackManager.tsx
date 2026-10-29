import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../services/storage';
import { FeedbackItem, FeedbackStatus } from '../types';
import { Bug, Lightbulb, RefreshCw, Trash2, Save } from 'lucide-react';

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  done: 'Done',
  declined: 'Declined',
};

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  new: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  done: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  declined: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export const AdminFeedbackManager: React.FC = () => {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'feature' | 'bug'>('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | FeedbackStatus>('open');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    const list = await storage.getFeedback(currentUser.id);
    setItems(list);
    setLoading(false);
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (item: FeedbackItem, status: FeedbackStatus) => {
    if (!currentUser) return;
    const ok = await storage.updateFeedback(item.id, currentUser.id, { status });
    if (ok) setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
    else setMessage('Could not update that item.');
  };

  const saveNote = async (item: FeedbackItem) => {
    if (!currentUser) return;
    const note = noteDrafts[item.id] ?? item.adminNote ?? '';
    const ok = await storage.updateFeedback(item.id, currentUser.id, { adminNote: note });
    if (ok) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, adminNote: note } : i)));
      setMessage('Note saved.');
    } else {
      setMessage('Could not save the note.');
    }
  };

  const clearClosed = async () => {
    const closed = items.filter((i) => i.status === 'done' || i.status === 'declined').length;
    if (closed === 0) {
      setMessage('There are no completed or declined items to clear.');
      return;
    }
    if (!window.confirm(`Remove ${closed} completed / declined item${closed === 1 ? '' : 's'} now?`)) return;
    const removed = await storage.clearClosedFeedback();
    setMessage(`Removed ${removed} item${removed === 1 ? '' : 's'}.`);
    load();
  };

  const hoursLeft = (item: FeedbackItem) => {
    const closedAt = new Date(item.statusChangedAt || item.updatedAt || item.createdAt).getTime();
    return Math.max(0, Math.ceil((closedAt + 24 * 3600_000 - Date.now()) / 3600_000));
  };

  const remove = async (item: FeedbackItem) => {
    if (!currentUser) return;
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    const ok = await storage.deleteFeedback(item.id, currentUser.id);
    if (ok) setItems((prev) => prev.filter((i) => i.id !== item.id));
    else setMessage('Could not delete that item.');
  };

  const visible = items.filter((i) => {
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    if (statusFilter === 'open') return i.status === 'new' || i.status === 'in_progress';
    if (statusFilter !== 'all') return i.status === statusFilter;
    return true;
  });

  const newCount = items.filter((i) => i.status === 'new').length;

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
      active
        ? 'bg-pink-500 text-white border-pink-400'
        : 'bg-slate-900/60 text-slate-300 border-white/10 hover:text-white'
    }`;

  return (
    <div className="space-y-5 animate-in fade-in">
      <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-bold text-white font-display mb-1">Feature Requests & Bug Reports</h2>
            <p className="text-xs text-slate-400">
              Everything users send from the Request popup lands here. {newCount} new. Users see the status you set and get a
              notification when it changes. Done and declined items remove themselves after 24 hours.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearClosed}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear finished now
            </button>
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <button type="button" className={chip(typeFilter === 'all')} onClick={() => setTypeFilter('all')}>All</button>
          <button type="button" className={chip(typeFilter === 'feature')} onClick={() => setTypeFilter('feature')}>Features</button>
          <button type="button" className={chip(typeFilter === 'bug')} onClick={() => setTypeFilter('bug')}>Bugs</button>
          <span className="w-px bg-white/10 mx-1" />
          <button type="button" className={chip(statusFilter === 'open')} onClick={() => setStatusFilter('open')}>Open</button>
          <button type="button" className={chip(statusFilter === 'done')} onClick={() => setStatusFilter('done')}>Done</button>
          <button type="button" className={chip(statusFilter === 'declined')} onClick={() => setStatusFilter('declined')}>Declined</button>
          <button type="button" className={chip(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>Everything</button>
        </div>

        {message && (
          <div className="mb-4 p-3 rounded-2xl bg-slate-900/70 border border-white/10 text-xs text-slate-200 flex justify-between">
            <span>{message}</span>
            <button type="button" className="underline text-slate-400" onClick={() => setMessage(null)}>Dismiss</button>
          </div>
        )}

        {loading && items.length === 0 ? (
          <p className="text-xs text-slate-400">Loading...</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing here yet.</p>
        ) : (
          <div className="space-y-4">
            {visible.map((item) => (
              <div key={item.id} className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        item.type === 'bug' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {item.type === 'bug' ? <Bug className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white break-words">{item.title}</h3>
                      <p className="text-[11px] text-slate-400">
                        {item.username} &middot; {new Date(item.createdAt).toLocaleString()}
                        {item.area ? ` · ${item.area}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${STATUS_STYLES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>

                <p className="text-xs text-slate-200 whitespace-pre-wrap break-words leading-relaxed">{item.details}</p>

                {(item.status === 'done' || item.status === 'declined') && (
                  <p className="text-[11px] text-amber-300/90">
                    Removes itself in about {hoursLeft(item)} hour{hoursLeft(item) === 1 ? '' : 's'}.
                  </p>
                )}

                {item.userAgent && (
                  <p className="text-[10px] text-slate-500 break-all">Browser: {item.userAgent}</p>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Admin note (optional)"
                    value={noteDrafts[item.id] ?? item.adminNote ?? ''}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
                  />
                  <button
                    type="button"
                    onClick={() => saveNote(item)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                  >
                    <Save className="w-3.5 h-3.5" /> Save note
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(['new', 'in_progress', 'done', 'declined'] as FeedbackStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(item, st)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${
                        item.status === st
                          ? STATUS_STYLES[st]
                          : 'bg-slate-900/60 text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {STATUS_LABELS[st]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
