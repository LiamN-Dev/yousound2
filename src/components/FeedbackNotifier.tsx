import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getFeedbackState,
  markToasted,
  startFeedbackPolling,
  stopFeedbackPolling,
  subscribeFeedback,
} from '../services/feedbackNotifications';

const STATUS_TEXT: Record<string, string> = {
  new: 'was received',
  in_progress: 'is now being worked on',
  done: 'is done',
  declined: 'was declined',
};

/** Small pop-up (bottom-left) when an admin updates one of the person's reports */
export const FeedbackNotifier: React.FC = () => {
  const { currentUser } = useAuth();
  const state = useSyncExternalStore(subscribeFeedback, getFeedbackState);
  const [hiddenId, setHiddenId] = useState<string | null>(null);

  useEffect(() => {
    const canUse = !!currentUser && (currentUser.isApproved || currentUser.role === 'admin') && !currentUser.isSuspended;
    if (canUse) startFeedbackPolling();
    else stopFeedbackPolling();
    return () => stopFeedbackPolling();
  }, [currentUser?.id, currentUser?.isApproved, currentUser?.isSuspended, currentUser?.role]);

  const item = state.pendingToast;
  if (!item || hiddenId === `${item.id}|${item.updatedAt}`) return null;

  const dismiss = () => {
    setHiddenId(`${item.id}|${item.updatedAt}`);
    markToasted(item);
  };

  const view = () => {
    markToasted(item);
    window.dispatchEvent(new CustomEvent('yousong:open-requests', { detail: { mode: 'mine' } }));
  };

  return (
    <div className="fixed left-4 bottom-28 z-[70] max-w-sm w-[calc(100vw-2rem)] sm:w-auto p-4 rounded-2xl bg-slate-900/95 border border-cyan-500/30 shadow-2xl backdrop-blur text-slate-100">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4" />
        </div>
        <div className="min-w-0 text-xs">
          <p className="font-bold text-white">
            Update on your {item.type === 'bug' ? 'bug report' : 'feature idea'}
          </p>
          <p className="text-slate-300 mt-0.5 break-words">
            &ldquo;{item.title}&rdquo; {STATUS_TEXT[item.status] || 'was updated'}.
          </p>
          {item.adminNote && <p className="text-slate-400 mt-1 break-words">Admin note: {item.adminNote}</p>}
          <div className="flex gap-2 mt-2.5">
            <button
              type="button"
              onClick={view}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400"
            >
              View progress
            </button>
            <button type="button" onClick={dismiss} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">
              Dismiss
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="text-slate-400 hover:text-white shrink-0" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
