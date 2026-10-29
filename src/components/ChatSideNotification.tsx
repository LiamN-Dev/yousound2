import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../services/storage';
import { MessageSquare, X, ArrowRight } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatSideNotificationProps {
  onOpenChat: () => void;
  isChatActive: boolean;
}

interface ToastMessage {
  id: string;
  senderName: string;
  content: string;
  threadId: string;
  timestamp: number;
}

export const ChatSideNotification: React.FC<ChatSideNotificationProps> = ({
  onOpenChat,
  isChatActive,
}) => {
  const { currentUser } = useAuth();
  const [activeToast, setActiveToast] = useState<ToastMessage | null>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const toastTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!currentUser) return;

    const pollIncoming = async () => {
      try {
        const threads = await storage.getChatThreads(currentUser.id);
        if (!threads || threads.length === 0) return;

        // Collect latest messages across active threads
        for (const th of threads) {
          // If thread has messages and last sender is NOT current user
          if (th.lastMessage && th.lastMessageSender && th.lastMessageSender !== currentUser.username) {
            const threadMsgs = await storage.getChatMessages(th.id);
            if (threadMsgs.length > 0) {
              const latest = threadMsgs[threadMsgs.length - 1];

              // On initial load, record existing IDs so we only notify on brand new ones
              if (isInitialLoadRef.current) {
                knownMessageIdsRef.current.add(latest.id);
              } else {
                if (
                  !knownMessageIdsRef.current.has(latest.id) &&
                  latest.senderId !== currentUser.id &&
                  !isChatActive
                ) {
                  knownMessageIdsRef.current.add(latest.id);

                  // Show side toast for 5 seconds
                  if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);

                  setActiveToast({
                    id: latest.id,
                    senderName: latest.senderUsername || 'Someone',
                    content: latest.content,
                    threadId: th.id,
                    timestamp: Date.now(),
                  });

                  toastTimeoutRef.current = setTimeout(() => {
                    setActiveToast(null);
                  }, 5000);
                }
              }
            }
          }
        }

        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
        }
      } catch (err) {
        // Silent catch for polling
      }
    };

    pollIncoming();
    const interval = setInterval(pollIncoming, 3500);

    return () => {
      clearInterval(interval);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [currentUser, isChatActive]);

  if (!activeToast) return null;

  return (
    <div
      className="fixed top-20 right-4 sm:right-6 z-50 max-w-sm w-full animate-in slide-in-from-right-8 duration-300"
      role="alert"
    >
      <div className="relative overflow-hidden liquid-glass-surface rounded-2xl p-4 border border-blue-500/40 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
        {/* Top 5-second progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-white/10">
          <div
            className="h-full bg-blue-600 dark:bg-blue-400 animate-[progress_5s_linear]"
            style={{
              animation: 'shrinkWidth 5s linear forwards',
            }}
          />
        </div>

        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-500/20">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate font-display">
                  {activeToast.senderName}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
                  New Chat
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 break-words leading-snug">
                "{activeToast.content}"
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveToast(null)}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
            aria-label="Dismiss chat notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">
            Auto-closing in 5s · red dot kept in menu
          </span>
          <button
            onClick={() => {
              setActiveToast(null);
              onOpenChat();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow-sm active:scale-95"
          >
            <span>Open & Reply</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
