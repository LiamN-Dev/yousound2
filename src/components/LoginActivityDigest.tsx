import React, { useEffect, useState } from 'react';
import { Bell, Check, MessageCircle, Music2, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type DigestItem = {
  id: string;
  kind: 'song' | 'feedback' | 'chat';
  title: string;
  detail: string;
  createdAt: string;
};

type DigestResponse = {
  total: number;
  counts: { songs: number; feedback: number; chats: number };
  items: DigestItem[];
};

const iconFor = (kind: DigestItem['kind']) => {
  if (kind === 'song') return <Music2 className="h-4 w-4" />;
  if (kind === 'chat') return <MessageCircle className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
};

/** One bundled catch-up alert after login; never emits a separate toast per event. */
export const LoginActivityDigest: React.FC = () => {
  const { currentUser } = useAuth();
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDigest(null);
    if (!currentUser || !currentUser.isApproved || currentUser.isSuspended) return;
    fetch('/api/notifications/login-digest', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not load account updates.');
        return data as DigestResponse & { success: boolean };
      })
      .then((data) => {
        if (!cancelled && data.total > 0) setDigest(data);
      })
      .catch(() => {
        // A temporary notification-service outage must not block sign-in or the library.
      });
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.isApproved, currentUser?.isSuspended]);

  const dismiss = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/notifications/login-digest/seen', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Could not save the update status.');
      setDigest(null);
    } catch {
      setDigest(null);
    } finally {
      setSaving(false);
    }
  };

  if (!digest || !currentUser) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="login-digest-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-300/25 bg-slate-950 text-slate-100 shadow-2xl">
        <div className="flex items-start gap-3 border-b border-white/10 bg-cyan-500/[0.07] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-200"><Bell className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="login-digest-title" className="text-sm font-bold text-white">While you were away</h2>
            <p className="mt-1 text-[11px] text-slate-300">
              {digest.total} update{digest.total === 1 ? '' : 's'} since you last checked.
              {digest.counts.songs > 0 ? ' ' + digest.counts.songs + ' song update' + (digest.counts.songs === 1 ? '' : 's') + '.' : ''}
              {digest.counts.feedback > 0 ? ' ' + digest.counts.feedback + ' feature/bug update' + (digest.counts.feedback === 1 ? '' : 's') + '.' : ''}
              {digest.counts.chats > 0 ? ' ' + digest.counts.chats + ' chat message' + (digest.counts.chats === 1 ? '' : 's') + '.' : ''}
            </p>
          </div>
          <button type="button" onClick={dismiss} disabled={saving} aria-label="Close updates" className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto p-4">
          {digest.items.map((item) => (
            <div key={item.id} className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-cyan-200">{iconFor(item.kind)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white">{item.title}</div>
                <p className="mt-1 break-words text-[11px] leading-4 text-slate-300">{item.detail}</p>
                <time className="mt-1 block text-[9px] text-slate-500" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
              </div>
            </div>
          ))}
          {digest.total > digest.items.length && <p className="px-1 text-[10px] text-slate-400">Showing the latest {digest.items.length}; the summary includes all {digest.total} updates.</p>}
        </div>
        <div className="flex justify-end border-t border-white/10 p-3">
          <button type="button" onClick={dismiss} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> Got it
          </button>
        </div>
      </section>
    </div>
  );
};
