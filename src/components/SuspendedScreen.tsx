import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { storage } from '../services/storage';
import { ChatThread, ChatMessage } from '../types';
import { ShieldAlert, Send, LogOut, Sun, Moon, MessageSquare, AlertCircle, Trash2, RotateCcw } from 'lucide-react';

export const SuspendedScreen: React.FC = () => {
  const { currentUser, logout, checkUserApproval, refreshState } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [appealThread, setAppealThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(0);

  const userId = currentUser?.id;
  const username = currentUser?.username;

  // Foolproof logout that clears all auth state and returns immediately to LoginGate
  const handleFailsafeLogout = useCallback(() => {
    try {
      localStorage.removeItem('yousong_session_user');
      sessionStorage.clear();
      storage.setCurrentSessionUser(null);
    } catch (e) {
      console.error('Storage clear error:', e);
    }
    // AuthContext logout() resets currentUser to null, instantaneously returning App to LoginGate
    logout();
  }, [logout]);

  useEffect(() => {
    if (!userId || !username) return;

    let isMounted = true;

    const fetchAppealData = async () => {
      try {
        // 1. Check if administrator lifted suspension
        const userCheck = await checkUserApproval(userId);
        if (userCheck && !userCheck.isSuspended) {
          refreshState();
          return;
        }

        // 2. Fetch or create direct appeal thread
        const th = await storage.getOrCreateAppealThread(userId, username);
        if (isMounted && th) {
          setAppealThread(th);
          const msgs = await storage.getChatMessages(th.id);
          if (isMounted) setMessages(msgs);
        }
      } catch (e) {
        console.error('Error fetching appeal data:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAppealData();
    const interval = setInterval(fetchAppealData, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [userId, username, checkUserApproval, refreshState]);

  useEffect(() => {
    if (containerRef.current && messages.length > prevCountRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  const handleSendAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !appealThread || !messageInput.trim() || isSending) return;

    setIsSending(true);
    setSendError(null);
    const content = messageInput.trim();
    setMessageInput('');

    try {
      const targetReceiver =
        appealThread.user2Id === currentUser.id ? appealThread.user1Id : appealThread.user2Id;
      const res = await storage.sendChatMessage(
        appealThread.id,
        currentUser.id,
        currentUser.username,
        targetReceiver,
        content
      );

      if (res.success && res.message) {
        setMessages((prev) => [...prev, res.message!]);
      } else {
        setSendError(res.error || 'Failed to send appeal message. Please try again.');
      }
    } catch (e: any) {
      console.error('Failed to send appeal message:', e);
      setSendError(e.message || 'Network error sending appeal message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteOwnMessage = async (msgId: string) => {
    try {
      await storage.deleteChatMessage(msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (e) {
      console.error('Failed to delete message:', e);
    }
  };

  const handleClearChatHistory = async () => {
    if (!appealThread) return;
    try {
      await storage.clearChatThreadMessages(appealThread.id);
      setMessages([]);
    } catch (e) {
      console.error('Failed to clear messages:', e);
    }
  };

  const formatMessageTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Floating Controls */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 z-30">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 shadow-sm transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          onClick={handleFailsafeLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all active:scale-95"
          title="Sign out of your account"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      <div className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-900 border border-rose-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header Alert */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            Your Account Has Been Suspended
          </h1>
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            Access to YouSong audio streaming and library features is currently disabled.
          </p>
          {currentUser?.suspendedReason && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-xs text-rose-700 dark:text-rose-300 text-left max-w-md mx-auto">
              <strong>Administrator Reason:</strong> "{currentUser.suspendedReason}"
            </div>
          )}
        </div>

        {/* Appeal Chat Section */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950/50 flex flex-col h-[360px]">
          <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Administrator Appeal Dispatch
              </span>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChatHistory}
                  className="text-[10px] text-slate-400 hover:text-rose-500 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                  title="Clear chat history"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear History</span>
                </button>
              )}
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Direct Desk
              </span>
            </div>
          </div>

          <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-2.5">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>Appeal Anytime:</span>
              </p>
              <p className="leading-relaxed">
                Send your appeal messages below. The administrator will review your case and reply directly here. You can sign out anytime using the button below.
              </p>
            </div>

            {loading && messages.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Loading appeal dispatch...</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No messages yet. Send a message below to explain your situation and request account restoration.
              </p>
            ) : (
              messages.map((m) => {
                const isMe = m.senderId === currentUser?.id;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col group/msg ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-xs relative ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-br-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700/60 rounded-bl-xs'
                      }`}
                    >
                      <div className="text-[10px] font-bold opacity-75 mb-0.5 flex items-center justify-between gap-3">
                        <span>{isMe ? 'You' : 'Administrator'}</span>
                        {isMe && (
                          <button
                            type="button"
                            onClick={() => handleDeleteOwnMessage(m.id)}
                            className="opacity-0 group-hover/msg:opacity-100 hover:text-rose-300 transition-opacity"
                            title="Delete this message"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="break-words">{m.content}</p>
                    </div>
                    <span className="text-[9px] text-slate-400 mt-0.5 px-1">
                      {formatMessageTime(m.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {sendError && (
            <div className="px-3 py-1.5 bg-rose-500/10 border-t border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{sendError}</span>
            </div>
          )}

          {/* Appeal Input Form */}
          <form onSubmit={handleSendAppeal} className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Send message to admin..."
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!messageInput.trim() || isSending}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-all shrink-0 flex items-center gap-1.5 text-xs font-semibold shadow-sm"
              title="Send Message"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* Clear Sign Out Section */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Logged in as <strong className="text-slate-900 dark:text-slate-200">@{currentUser?.username}</strong>
          </p>

          <button
            onClick={handleFailsafeLogout}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-bold transition-all active:scale-95 shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out of Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};
