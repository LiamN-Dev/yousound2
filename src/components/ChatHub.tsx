import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Users,
  Clock,
  Ban,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Search,
  Eye,
  Trash2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../services/storage';
import { User, ChatRequest, ChatThread, ChatMessage, ChatPairingBlock } from '../types';

export const ChatHub: React.FC = () => {
  const { currentUser, isAdmin, allUsers, adminUpdateUser } = useAuth();

  // Mode for Admin: 'oversight' | 'messages'
  const [adminViewMode, setAdminViewMode] = useState<'oversight' | 'messages'>('oversight');
  const [adminSubTab, setAdminSubTab] = useState<'approvals' | 'live-feed' | 'threads' | 'force-start' | 'restrictions'>('approvals');

  // Chat Data State
  const [requests, setRequests] = useState<ChatRequest[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allModerationMessages, setAllModerationMessages] = useState<ChatMessage[]>([]);
  const [pairingBlocks, setPairingBlocks] = useState<ChatPairingBlock[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Send Message State
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // New Request Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedTargetUser, setSelectedTargetUser] = useState<User | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Admin Force-Start State
  const [forceUser1Id, setForceUser1Id] = useState('');
  const [forceUser2Id, setForceUser2Id] = useState('');
  const [forceFeedback, setForceFeedback] = useState<string | null>(null);

  // Admin Pairing Block State
  const [blockUser1Id, setBlockUser1Id] = useState('');
  const [blockUser2Id, setBlockUser2Id] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockFeedback, setBlockFeedback] = useState<string | null>(null);

  // Terminate Thread Modal State
  const [terminatingThread, setTerminatingThread] = useState<ChatThread | null>(null);
  const [terminateReason, setTerminateReason] = useState('Messaging disabled by Administrator');

  // Transcript Inspector Modal for Admin
  const [inspectingThread, setInspectingThread] = useState<ChatThread | null>(null);
  const [inspectMessages, setInspectMessages] = useState<ChatMessage[]>([]);

  // Denial Note Modal State for Chat Request
  const [decliningChatReq, setDecliningChatReq] = useState<ChatRequest | null>(null);
  const [declineReasonText, setDeclineReasonText] = useState('');

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const prevMessagesLengthRef = useRef(0);

  // Check if a thread has unread incoming messages
  const isThreadUnread = (th: ChatThread) => {
    if (!currentUser || !th.lastMessageAt) return false;
    if (th.lastMessageSender === currentUser.username) return false;
    if (th.id === activeThreadId) return false;
    const lastRead = Number(localStorage.getItem(`yousong_thread_read_${currentUser.id}_${th.id}`) || '0');
    return new Date(th.lastMessageAt).getTime() > lastRead;
  };

  // Load chat data
  const loadChatData = useCallback(async () => {
    if (!currentUser) return;

    try {
      if (isAdmin && adminViewMode === 'oversight') {
        // Admin gets all requests, threads, live feed, blocks
        const [reqs, thrs, allMsgs, blocks] = await Promise.all([
          storage.getChatRequests(),
          storage.getChatThreads(),
          storage.getAllChatMessages(),
          storage.getChatPairingBlocks(),
        ]);
        setRequests(reqs);
        setThreads(thrs);
        setAllModerationMessages(allMsgs);
        setPairingBlocks(blocks);
      } else {
        // Standard user or Admin in Personal mode gets their own requests and threads
        const [reqs, thrs] = await Promise.all([
          storage.getChatRequests(currentUser.id),
          storage.getChatThreads(currentUser.id),
        ]);
        setRequests(reqs);
        setThreads(thrs);

        // Auto select first thread if none selected
        if (!activeThreadId && thrs.length > 0) {
          setActiveThreadId(thrs[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load chat data:', e);
    }
  }, [currentUser, isAdmin, adminViewMode, activeThreadId]);

  // Load active thread messages
  const loadActiveMessages = useCallback(async () => {
    if (!activeThreadId) return;
    try {
      const msgs = await storage.getChatMessages(activeThreadId);
      setMessages(msgs);
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  }, [activeThreadId]);

  // Initial & periodic sync polling (every 3.5s for real-time feel)
  useEffect(() => {
    loadChatData();
    const interval = setInterval(() => {
      loadChatData();
      if (activeThreadId) {
        loadActiveMessages();
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [loadChatData, loadActiveMessages, activeThreadId]);

  // Load messages when activeThreadId changes
  useEffect(() => {
    if (activeThreadId) {
      loadActiveMessages();
      if (currentUser) {
        localStorage.setItem(`yousong_thread_read_${currentUser.id}_${activeThreadId}`, Date.now().toString());
      }
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [activeThreadId, loadActiveMessages, currentUser]);

  // Only scroll message container directly, NEVER scroll window or viewport
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > prevMessagesLengthRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // Inspect thread transcript
  const handleInspectTranscript = async (th: ChatThread) => {
    setInspectingThread(th);
    const msgs = await storage.getChatMessages(th.id);
    setInspectMessages(msgs);
  };

  // Send message in active thread
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeThreadId || !messageInput.trim()) return;

    const currentThread = threads.find((t) => t.id === activeThreadId);
    if (!currentThread) return;

    if (currentThread.isTerminated) {
      setSendError(currentThread.terminatedReason || 'Messaging disabled by Administrator');
      return;
    }

    if (currentUser.chatBlocked) {
      setSendError('Your chat privileges have been disabled by Administrator');
      return;
    }

    const otherUserId = currentThread.user1Id === currentUser.id ? currentThread.user2Id : currentThread.user1Id;

    setIsSending(true);
    setSendError(null);

    const res = await storage.sendChatMessage(
      activeThreadId,
      currentUser.id,
      currentUser.username,
      otherUserId,
      messageInput.trim()
    );

    setIsSending(false);

    if (res.success && res.message) {
      setMessageInput('');
      setMessages((prev) => [...prev, res.message!]);
      // Update thread last message locally
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? { ...t, lastMessage: res.message!.content, lastMessageAt: new Date().toISOString() }
            : t
        )
      );
    } else {
      setSendError(res.error || 'Failed to send message');
    }
  };

  // Submit new Chat Request
  const handleSubmitChatRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedTargetUser) return;

    setIsSubmittingRequest(true);
    setRequestFeedback(null);

    const res = await storage.createChatRequest(
      currentUser.id,
      currentUser.username,
      selectedTargetUser.id,
      selectedTargetUser.username,
      requestReason.trim() || undefined
    );

    setIsSubmittingRequest(false);

    if (res.success) {
      setRequestFeedback('✓ Chat request submitted! Awaiting Administrator approval.');
      setTimeout(() => {
        setIsRequestModalOpen(false);
        setSelectedTargetUser(null);
        setRequestReason('');
        setRequestFeedback(null);
        loadChatData();
      }, 1800);
    } else {
      setRequestFeedback(`❌ ${res.error || 'Request could not be submitted'}`);
    }
  };

  // Admin Approve / Reject Request
  const handleReviewRequest = async (id: string, status: 'approved' | 'declined', note?: string) => {
    const res = await storage.updateChatRequestStatus(id, status, note);
    if (res.success) {
      await loadChatData();
    }
  };

  // Delete Request from Queue
  const handleDeleteRequest = async (id: string) => {
    const res = await storage.deleteChatRequest(id);
    if (res.success) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
  };

  // Delete Active or Terminated Thread (Admin permanent delete)
  const handleDeleteThread = async (threadId: string) => {
    const res = await storage.deleteChatThread(threadId);
    if (res.success) {
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      setAllModerationMessages((prev) => prev.filter((m) => m.threadId !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    await storage.deleteChatMessage(msgId);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setAllModerationMessages((prev) => prev.filter((m) => m.id !== msgId));
  };

  // User delete/hide approved conversation from their view (pops back up on new message)
  const handleUserHideThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    if (!currentUser) return;
    await storage.hideChatThread(threadId, currentUser.id);
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
      setMessages([]);
    }
  };

  // Admin Force-Start Chat
  const handleForceStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forceUser1Id || !forceUser2Id) return;
    const u1 = allUsers.find((u) => u.id === forceUser1Id);
    const u2 = allUsers.find((u) => u.id === forceUser2Id);
    if (!u1 || !u2) return;

    const res = await storage.forceStartChatThread(u1.id, u1.username, u2.id, u2.username);
    if (res.success) {
      setForceFeedback(`✓ Conversation between "${u1.username}" and "${u2.username}" initiated & approved!`);
      setForceUser1Id('');
      setForceUser2Id('');
      await loadChatData();
      setTimeout(() => setForceFeedback(null), 3000);
    } else {
      setForceFeedback(`❌ ${res.error || 'Failed to initiate thread'}`);
    }
  };

  // Admin Terminate Thread
  const handleConfirmTerminate = async () => {
    if (!terminatingThread) return;
    const res = await storage.terminateChatThread(terminatingThread.id, terminateReason);
    if (res.success) {
      setTerminatingThread(null);
      await loadChatData();
    }
  };

  // Admin Reopen Thread
  const handleReopenThread = async (threadId: string) => {
    const res = await storage.reopenChatThread(threadId);
    if (res.success) {
      await loadChatData();
    }
  };

  // Admin Create Pairing Block
  const handleCreatePairingBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockUser1Id || !blockUser2Id || !currentUser) return;

    const res = await storage.createChatPairingBlock(
      blockUser1Id,
      blockUser2Id,
      currentUser.username,
      blockReason.trim() || undefined
    );

    if (res.success) {
      setBlockFeedback('✓ Pairing block successfully enforced! Direct requests between them are blocked.');
      setBlockUser1Id('');
      setBlockUser2Id('');
      setBlockReason('');
      await loadChatData();
      setTimeout(() => setBlockFeedback(null), 3000);
    } else {
      setBlockFeedback(`❌ ${res.error || 'Failed to apply pairing block'}`);
    }
  };

  // Admin Delete Pairing Block
  const handleDeletePairingBlock = async (id: number) => {
    await storage.deleteChatPairingBlock(id);
    await loadChatData();
  };

  const safeUsers = allUsers || [];

  // Admin Toggle Global Chat Block for a user
  const handleToggleUserGlobalChat = async (user: User) => {
    const newBlockedState = !user.chatBlocked;
    await storage.adminUpdateUser(user.id, {
      chatBlocked: newBlockedState,
    });
    await loadChatData();
  };

  const activeThread = (threads || []).find((t) => t.id === activeThreadId);
  const otherUserName = activeThread
    ? (activeThread.user1Id === currentUser?.id
      ? activeThread.user2Username
      : activeThread.user1Username) || 'User'
    : 'User';

  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;

  // Restricted / Locked Out Screen for standard users
  if (currentUser?.chatBlocked && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-in fade-in">
        <div className="liquid-glass-surface rounded-3xl p-8 sm:p-12 border border-rose-500/30 shadow-2xl space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-display">
              Chat Messaging Disabled
            </h2>
            <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">
              Your chat messaging has been disabled by Administrator.
            </p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Your messaging privileges across YouSong have been locked out by an administrator. You cannot initiate chat requests or participate in messaging threads. If you believe this is in error, please consult your administrator.
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              User: {currentUser.username} · Chat Access Revoked
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-28 sm:pb-36">
      {/* Top Header Banner */}
      <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-white/10 shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-display">
                  YouSong Chat & Messaging
                </h1>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Connect and collaborate with approved classmates and listeners.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Manual Refresh */}
            <button
              onClick={async () => {
                setIsRefreshing(true);
                await loadChatData();
                if (activeThreadId) await loadActiveMessages();
                setIsRefreshing(false);
              }}
              className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-xs transition-colors"
              title="Refresh Chat Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Standard User: Request New Chat Button */}
            {(!isAdmin || adminViewMode === 'messages') && (
              <button
                onClick={() => setIsRequestModalOpen(true)}
                disabled={currentUser?.chatBlocked}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-blue-600/20 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Request a Chat</span>
              </button>
            )}

            {/* Admin Switcher: Command Center vs My Direct Messages */}
            {isAdmin && (
              <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10">
                <button
                  onClick={() => setAdminViewMode('oversight')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    adminViewMode === 'oversight'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin Command Center</span>
                  {pendingRequestsCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold">
                      {pendingRequestsCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setAdminViewMode('messages')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    adminViewMode === 'messages'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>My Chats</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Global Block Notice if current user is blocked */}
        {currentUser?.chatBlocked && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <Ban className="w-4 h-4 shrink-0" />
            <span>
              <strong>Messaging Disabled:</strong> Your chat privileges have been globally restricted by an Administrator. You cannot send messages or request new chats.
            </span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ADMIN COMMAND CENTER VIEW */}
      {/* ========================================================================= */}
      {isAdmin && adminViewMode === 'oversight' ? (
        <div className="space-y-6">
          {/* Sub Navigation Bar for Command Center */}
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 overflow-x-auto">
            <button
              onClick={() => setAdminSubTab('approvals')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                adminSubTab === 'approvals'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Approval Queue</span>
              {pendingRequestsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-white text-[10px]">
                  {pendingRequestsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setAdminSubTab('live-feed')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                adminSubTab === 'live-feed'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Live Master Feed</span>
            </button>

            <button
              onClick={() => setAdminSubTab('threads')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                adminSubTab === 'threads'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Active Threads ({threads.length})</span>
            </button>

            <button
              onClick={() => setAdminSubTab('force-start')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                adminSubTab === 'force-start'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Force-Start Chat</span>
            </button>

            <button
              onClick={() => setAdminSubTab('restrictions')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                adminSubTab === 'restrictions'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>User Restrictions & Lockouts</span>
            </button>
          </div>

          {/* 1. APPROVAL QUEUE */}
          {adminSubTab === 'approvals' && (
            <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Chat Request Approval Queue
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No message can be sent between regular users without explicit Admin approval.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {requests.filter((r) => r.status === 'pending').length} Pending
                </span>
              </div>

              {requests.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No chat requests submitted yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {req.senderUsername}
                          </span>
                          <span className="text-slate-400 text-xs">wants to chat with</span>
                          <span className="font-bold text-xs text-blue-600 dark:text-blue-400">
                            {req.receiverUsername}
                          </span>

                          {/* Status Badge */}
                          {req.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <Clock className="w-2.5 h-2.5" />
                              Pending Approval
                            </span>
                          )}
                          {req.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Approved
                            </span>
                          )}
                          {req.status === 'declined' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              <XCircle className="w-2.5 h-2.5" />
                              Declined
                            </span>
                          )}
                        </div>

                        {req.reason && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.03] p-2 rounded-xl border border-slate-200 dark:border-white/5 max-w-xl">
                            <strong>Reason:</strong> "{req.reason}"
                          </p>
                        )}
                        {req.adminNote && (
                          <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 p-2 rounded-xl border border-rose-200 dark:border-rose-900/30 max-w-xl">
                            <strong>Admin Feedback:</strong> "{req.adminNote}"
                          </p>
                        )}
                        <span className="text-[10px] text-slate-400 block">
                          Submitted {new Date(req.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {req.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleReviewRequest(req.id, 'approved')}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => {
                                setDecliningChatReq(req);
                                setDeclineReasonText('');
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-600 dark:text-rose-300 font-semibold text-xs border border-rose-500/30 transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}

                        {/* Little trash can on the side for approved or denied requests to remove clutter */}
                        <button
                          onClick={() => handleDeleteRequest(req.id)}
                          className="p-2 rounded-xl hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors border border-transparent hover:border-rose-500/20"
                          title="Remove from queue"
                          aria-label="Remove request from queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. LIVE MASTER FEED */}
          {adminSubTab === 'live-feed' && (
            <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Live Oversight Master Feed
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time master stream of all user-to-user messages sent across YouSong.
                </p>
              </div>

              {allModerationMessages.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Eye className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No chat messages have been recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                  {allModerationMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3.5 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 flex items-start justify-between gap-4 hover:border-blue-500/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-blue-600 dark:text-blue-400">
                            {msg.senderUsername}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {new Date(msg.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 dark:text-slate-200 font-sans break-words">
                          {msg.content}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          const th = threads.find((t) => t.id === msg.threadId);
                          if (th) handleInspectTranscript(th);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-[11px] font-medium shrink-0 flex items-center gap-1 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect Thread</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. ACTIVE THREADS & MODERATION */}
          {adminSubTab === 'threads' && (
            <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Active Conversation Threads ({threads.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total oversight: View transcripts, terminate active threads immediately, or restore communication.
                </p>
              </div>

              {threads.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No conversation threads exist currently.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {threads.map((th) => (
                    <div
                      key={th.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {th.user1Username}
                          </span>
                          <span className="text-slate-400 text-xs">&</span>
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {th.user2Username}
                          </span>

                          {th.isAppealThread && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30">
                              🚨 SUSPENSION APPEAL
                            </span>
                          )}
                          {th.isTerminated ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              Terminated by Admin
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Active & Approved
                            </span>
                          )}
                        </div>

                        {th.lastMessage && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                            Last: "{th.lastMessage}"
                          </p>
                        )}
                        {th.isTerminated && th.terminatedReason && (
                          <p className="text-[11px] text-rose-500 font-medium">
                            Reason: {th.terminatedReason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Open in direct chat so admin can reply */}
                        <button
                          onClick={() => {
                            setAdminViewMode('messages');
                            setActiveThreadId(th.id);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-sm active:scale-95"
                          title="Open in Chat to reply"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{th.isAppealThread ? 'Reply to Appeal' : 'Chat'}</span>
                        </button>

                        <button
                          onClick={() => handleInspectTranscript(th)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Transcript</span>
                        </button>

                        {th.isTerminated ? (
                          <button
                            onClick={() => handleReopenThread(th.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-600 dark:text-emerald-300 font-semibold text-xs border border-emerald-500/30 transition-colors"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Re-open Thread</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setTerminatingThread(th)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors shadow-sm"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Terminate Thread</span>
                          </button>
                        )}

                        {/* Admin Delete Thread button */}
                        <button
                          onClick={() => {
                            handleDeleteThread(th.id);
                          }}
                          className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors"
                          title="Permanently Delete Thread"
                          aria-label="Delete thread"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. FORCE-START CHAT */}
          {adminSubTab === 'force-start' && (
            <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-white/10 shadow-sm space-y-4 max-w-xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Initiate / Force-Start Chat
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Force-start and pre-approve a direct conversation between any two users without requiring an initial request.
                </p>
              </div>

              {forceFeedback && (
                <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 text-xs font-semibold">
                  {forceFeedback}
                </div>
              )}

              <form onSubmit={handleForceStart} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select User 1
                  </label>
                  <select
                    value={forceUser1Id}
                    onChange={(e) => setForceUser1Id(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    required
                  >
                    <option value="">-- Choose User 1 --</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select User 2
                  </label>
                  <select
                    value={forceUser2Id}
                    onChange={(e) => setForceUser2Id(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    required
                  >
                    <option value="">-- Choose User 2 --</option>
                    {allUsers
                      .filter((u) => u.id !== forceUser1Id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.role})
                        </option>
                      ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!forceUser1Id || !forceUser2Id}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Initiate & Pre-Approve Conversation</span>
                </button>
              </form>
            </div>
          )}

          {/* 5. USER RESTRICTIONS & LOCKOUTS */}
          {adminSubTab === 'restrictions' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Global Chat Block Table */}
              <div className="liquid-glass-surface rounded-3xl p-6 border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Global Chat Permission
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Toggle off a user's ability to request or use chat entirely.
                  </p>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[400px] overflow-y-auto">
                  {allUsers.map((u) => (
                    <div key={u.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {u.username}
                        </span>
                        <span className="text-[10px] text-slate-400 block">{u.role}</span>
                      </div>

                      <button
                        onClick={() => handleToggleUserGlobalChat(u)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          u.chatBlocked
                            ? 'bg-rose-500 text-white shadow-sm'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {u.chatBlocked ? <Ban className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        <span>{u.chatBlocked ? 'Chat Blocked' : 'Chat Enabled'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pairing Blocks */}
              <div className="liquid-glass-surface rounded-3xl p-6 border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Pairing Block Enforcement
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Block two specific users from ever requesting a chat with each other.
                  </p>
                </div>

                {blockFeedback && (
                  <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs font-semibold">
                    {blockFeedback}
                  </div>
                )}

                <form onSubmit={handleCreatePairingBlock} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={blockUser1Id}
                      onChange={(e) => setBlockUser1Id(e.target.value)}
                      className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      required
                    >
                      <option value="">User 1</option>
                      {allUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username}
                        </option>
                      ))}
                    </select>

                    <select
                      value={blockUser2Id}
                      onChange={(e) => setBlockUser2Id(e.target.value)}
                      className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      required
                    >
                      <option value="">User 2</option>
                      {allUsers
                        .filter((u) => u.id !== blockUser1Id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.username}
                          </option>
                        ))}
                    </select>
                  </div>

                  <input
                    type="text"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Reason for pairing block (optional)"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  />

                  <button
                    type="submit"
                    disabled={!blockUser1Id || !blockUser2Id}
                    className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Enforce Pairing Block</span>
                  </button>
                </form>

                {/* Existing Pairing Blocks List */}
                <div className="pt-2 border-t border-slate-100 dark:divide-white/5 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Existing Pairing Blocks ({pairingBlocks.length})
                  </h4>
                  {pairingBlocks.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No active pairing blocks.</p>
                  ) : (
                    pairingBlocks.map((b) => {
                      const u1 = allUsers.find((u) => u.id === b.user1Id)?.username || b.user1Id;
                      const u2 = allUsers.find((u) => u.id === b.user2Id)?.username || b.user2Id;
                      return (
                        <div
                          key={b.id}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {u1} ⇹ {u2}
                            </span>
                            {b.reason && <p className="text-[10px] text-slate-400">"{b.reason}"</p>}
                          </div>
                          <button
                            onClick={() => handleDeletePairingBlock(b.id)}
                            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-rose-500 transition-colors"
                            title="Remove block"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* STANDARD USER MESSAGING INTERFACE (AND ADMIN PERSONAL CHATS) */
        /* ========================================================================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT SIDEBAR: Threads & Request Status (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* My Requests Accordion / Card */}
            <div className="liquid-glass-surface rounded-3xl p-5 border border-slate-200 dark:border-white/10 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white font-display">
                    My Chat Requests
                  </h3>
                </div>
                <button
                  onClick={() => setIsRequestModalOpen(true)}
                  disabled={currentUser?.chatBlocked}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Request</span>
                </button>
              </div>

              {requests.length === 0 ? (
                <p className="text-[11px] text-slate-400">No pending or previous requests.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {requests.map((r) => {
                    const isOutgoing = r.senderId === currentUser?.id;
                    const partnerName = isOutgoing ? r.receiverUsername : r.senderUsername;
                    return (
                      <div
                        key={r.id}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {isOutgoing ? `To: ${partnerName}` : `From: ${partnerName}`}
                          </span>
                          {r.status === 'pending' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Pending Admin
                            </span>
                          )}
                          {r.status === 'approved' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Approved
                            </span>
                          )}
                          {r.status === 'declined' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              Declined
                            </span>
                          )}
                        </div>
                        {r.adminNote && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            <strong>Admin note:</strong> {r.adminNote}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Approved Threads List */}
            <div className="liquid-glass-surface rounded-3xl p-5 border border-slate-200 dark:border-white/10 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white font-display">
                    Approved Conversations ({threads.length})
                  </h3>
                </div>
              </div>

              {threads.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No active conversations.</p>
                  <button
                    onClick={() => setIsRequestModalOpen(true)}
                    className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Request a chat with someone
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  {threads.map((th) => {
                    const partnerName = (th.user1Id === currentUser?.id ? th.user2Username : th.user1Username) || 'User';
                    const isSelected = th.id === activeThreadId;
                    const hasUnread = isThreadUnread(th);

                    return (
                      <div
                        key={th.id}
                        onClick={() => setActiveThreadId(th.id)}
                        className={`w-full text-left p-3 rounded-2xl transition-all flex items-start gap-3 group cursor-pointer relative ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                            : 'hover:bg-slate-100 dark:hover:bg-white/[0.04] text-slate-800 dark:text-slate-200 border border-transparent hover:border-slate-200 dark:hover:border-white/5'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 relative ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-blue-600/10 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {partnerName.charAt(0).toUpperCase()}
                          {hasUnread && (
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 pr-12">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-xs truncate flex items-center gap-1.5">
                              {partnerName}
                              {hasUnread && (
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 animate-pulse" />
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              {th.isAppealThread && (
                                <span
                                  className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                    isSelected ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                  }`}
                                >
                                  APPEAL
                                </span>
                              )}
                              {th.isTerminated && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                    isSelected ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-500'
                                  }`}
                                >
                                  Terminated
                                </span>
                              )}
                            </div>
                          </div>
                          <p
                            className={`text-[11px] truncate mt-0.5 ${
                              isSelected ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {th.lastMessage || 'No messages yet'}
                          </p>
                        </div>

                        {/* Action buttons on thread */}
                        <div className="absolute top-2.5 right-2 flex items-center gap-1">
                          {/* Admin: Remove terminated thread from sidebar */}
                          {isAdmin && th.isTerminated && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Permanently remove terminated thread between ${th.user1Username} and ${th.user2Username}?`)) {
                                  handleDeleteThread(th.id);
                                }
                              }}
                              className="p-1 rounded-lg bg-rose-500/20 text-rose-500 hover:bg-rose-600 hover:text-white transition-colors"
                              title="Admin: Remove terminated thread from sidebar"
                              aria-label="Remove terminated thread"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Conversation from user view (reappears on new message) */}
                          <button
                            onClick={(e) => handleUserHideThread(e, th.id)}
                            className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                              isSelected
                                ? 'hover:bg-white/20 text-white/80 hover:text-white'
                                : 'hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 hover:text-rose-500'
                            }`}
                            title="Delete conversation (reappears if they send a new message)"
                            aria-label="Delete conversation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE: Active Conversation Window (8 Cols) */}
          <div className="lg:col-span-8">
            <div className="liquid-glass-surface rounded-3xl border border-slate-200 dark:border-white/10 shadow-lg flex flex-col h-[650px] overflow-hidden">
              {activeThread ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 sm:px-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 bg-white/50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                        {otherUserName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                          {otherUserName}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {activeThread.isAppealThread && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                              Suspension Appeal Line
                            </span>
                          )}
                          {activeThread.isTerminated ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-500 font-semibold">
                              <Lock className="w-2.5 h-2.5" />
                              Messaging Disabled by Administrator
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Approved Chat
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {activeThread.isAppealThread && isAdmin && (
                      <button
                        onClick={async () => {
                          const appealUserId = activeThread.user1Id === currentUser?.id ? activeThread.user2Id : activeThread.user1Id;
                          if (appealUserId) {
                            await adminUpdateUser(appealUserId, { isSuspended: false });
                            await handleDeleteThread(activeThread.id);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Unsuspend User & Resolve Appeal</span>
                      </button>
                    )}
                  </div>

                  {/* Appeal Resolved Banner */}
                  {activeThread.isAppealThread && (() => {
                    const appealUserId = activeThread.user1Id === currentUser?.id ? activeThread.user2Id : activeThread.user1Id;
                    const targetAppealUser = allUsers.find((u) => u.id === appealUserId);
                    const isAppealResolved = targetAppealUser && !targetAppealUser.isSuspended;
                    if (!isAppealResolved) return null;
                    return (
                      <div className="p-3 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between gap-2">
                        <span className="font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span>Appeal Resolved: Account for @{targetAppealUser.username} is active and unsuspended.</span>
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteThread(activeThread.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shrink-0"
                          >
                            Clear Appeal
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Terminated Notice Banner */}
                  {activeThread.isTerminated && (
                    <div className="p-3 bg-rose-500/10 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-center gap-2">
                      <Ban className="w-4 h-4 shrink-0" />
                      <span>
                        <strong>Messaging disabled by Administrator:</strong>{' '}
                        {activeThread.terminatedReason || 'This thread has been stopped.'}
                      </span>
                    </div>
                  )}

                  {/* Messages Area */}
                  <div ref={messagesContainerRef} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-3.5 bg-slate-50/50 dark:bg-black/20">
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
                        <MessageSquare className="w-10 h-10 opacity-30" />
                        <p className="text-xs">No messages yet. Send a school-safe hello to start!</p>
                      </div>
                    ) : (
                      messages.map((m) => {
                        const isMe = m.senderId === currentUser?.id;
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col group/msg ${isMe ? 'items-end' : 'items-start'}`}
                          >
                            <span className="text-[10px] text-slate-400 mb-1 px-1 flex items-center gap-1.5">
                              <span>{isMe ? 'You' : m.senderUsername}</span>
                              <span>·</span>
                              <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {(isMe || isAdmin) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(m.id)}
                                  className="opacity-0 group-hover/msg:opacity-100 hover:text-rose-500 transition-opacity p-0.5 rounded text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                                  title="Delete message"
                                  aria-label="Delete message"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                            <div
                              className={`max-w-[78%] sm:max-w-[65%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed break-words shadow-xs ${
                                isMe
                                  ? 'bg-blue-600 text-white rounded-br-xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-white/10 rounded-bl-xs'
                              }`}
                            >
                              {m.content}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Send Message Input */}
                  <form
                    onSubmit={handleSendMessage}
                    className="p-3 sm:p-4 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/80"
                  >
                    {sendError && (
                      <div className="mb-2 text-rose-500 text-[11px] font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{sendError}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        disabled={
                          activeThread.isTerminated ||
                          currentUser?.chatBlocked ||
                          isSending ||
                          Boolean(
                            activeThread.isAppealThread &&
                              allUsers.find((u) => u.id === (activeThread.user1Id === currentUser?.id ? activeThread.user2Id : activeThread.user1Id)) &&
                              !allUsers.find((u) => u.id === (activeThread.user1Id === currentUser?.id ? activeThread.user2Id : activeThread.user1Id))?.isSuspended
                          )
                        }
                        placeholder={
                          activeThread.isTerminated
                            ? 'Messaging disabled by Administrator'
                            : activeThread.isAppealThread &&
                              !allUsers.find((u) => u.id === (activeThread.user1Id === currentUser?.id ? activeThread.user2Id : activeThread.user1Id))?.isSuspended
                            ? 'Appeal is resolved (Account is active)'
                            : currentUser?.chatBlocked
                            ? 'Your chat privileges are disabled'
                            : `Message ${otherUserName}...`
                        }
                        className="flex-1 px-4 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={
                          !messageInput.trim() ||
                          activeThread.isTerminated ||
                          currentUser?.chatBlocked ||
                          isSending
                        }
                        className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-all active:scale-95 shadow-md shadow-blue-600/20 shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                  <MessageSquare className="w-12 h-12 opacity-30" />
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    No Conversation Selected
                  </h4>
                  <p className="text-xs max-w-sm">
                    Select an approved conversation on the left, or submit a request to chat with a classmate or administrator.
                  </p>
                  <button
                    onClick={() => setIsRequestModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-sm"
                  >
                    Request a Chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: REQUEST A CHAT (FOR STANDARD USERS) */}
      {/* ========================================================================= */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Request a Chat
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    All new chat requests are reviewed by an Administrator.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {requestFeedback && (
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300 text-xs font-semibold">
                {requestFeedback}
              </div>
            )}

            <form onSubmit={handleSubmitChatRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  1. Select User to Chat With
                </label>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search directory..."
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 border border-slate-200 dark:border-white/5 rounded-2xl p-2 bg-slate-50/50 dark:bg-black/20">
                  {safeUsers
                    .filter((u) => u.id !== currentUser?.id)
                    .filter((u) => (u.username || '').toLowerCase().includes(userSearchQuery.toLowerCase()))
                    .map((u) => {
                      const isSelected = selectedTargetUser?.id === u.id;
                      const uName = u.username || 'User';
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSelectedTargetUser(u)}
                          className={`w-full p-2 rounded-xl text-left text-xs flex items-center justify-between transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white font-bold'
                              : 'hover:bg-slate-200/60 dark:hover:bg-white/[0.05] text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center text-[10px] font-bold">
                              {uName.charAt(0).toUpperCase()}
                            </div>
                            <span>{uName}</span>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : u.role === 'admin'
                                ? 'bg-amber-400/20 text-amber-500'
                                : 'bg-slate-200 dark:bg-white/10 text-slate-500'
                            }`}
                          >
                            {u.role.toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  2. Purpose / Reason for Chat (Optional)
                </label>
                <textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="e.g. Study group discussion for chemistry, sharing playlists, school project..."
                  rows={2}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedTargetUser || isSubmittingRequest}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md transition-all"
                >
                  {isSubmittingRequest ? 'Submitting...' : 'Send Request for Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: TERMINATE THREAD CONFIRMATION (ADMIN) */}
      {/* ========================================================================= */}
      {terminatingThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md liquid-glass-surface rounded-3xl p-6 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Terminate Conversation
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Between {terminatingThread.user1Username} and {terminatingThread.user2Username}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reason for Termination (Displayed to users)
              </label>
              <input
                type="text"
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setTerminatingThread(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTerminate}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-md transition-all"
              >
                Confirm Termination
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: INSPECT FULL TRANSCRIPT (ADMIN) */}
      {/* ========================================================================= */}
      {inspectingThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Transcript: {inspectingThread.user1Username} & {inspectingThread.user2Username}
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Thread ID: {inspectingThread.id}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setInspectingThread(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-slate-50 dark:bg-black/30 rounded-2xl border border-slate-200 dark:border-white/5 pr-2">
              {inspectMessages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No messages in this thread.</p>
              ) : (
                inspectMessages.map((m) => (
                  <div key={m.id} className="p-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {m.senderUsername}
                      </span>
                      <span className="text-slate-400">
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 dark:text-slate-200">{m.content}</p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 flex justify-between items-center">
              <div>
                {inspectingThread.isTerminated ? (
                  <button
                    onClick={() => {
                      handleReopenThread(inspectingThread.id);
                      setInspectingThread(null);
                    }}
                    className="text-xs font-semibold text-emerald-500 hover:underline"
                  >
                    Restore Thread Communication
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setTerminatingThread(inspectingThread);
                      setInspectingThread(null);
                    }}
                    className="text-xs font-semibold text-rose-500 hover:underline"
                  >
                    Terminate Thread
                  </button>
                )}
              </div>
              <button
                onClick={() => setInspectingThread(null)}
                className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white font-semibold text-xs"
              >
                Close Transcript
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DENY CHAT REQUEST WITH EXPLANATORY FEEDBACK (ADMIN) */}
      {decliningChatReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md liquid-glass-surface rounded-3xl p-6 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Deny Chat Request
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {decliningChatReq.senderUsername} with {decliningChatReq.receiverUsername}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Denial Feedback & Explanatory Message (Displayed to User)
              </label>
              <textarea
                rows={3}
                value={declineReasonText}
                onChange={(e) => setDeclineReasonText(e.target.value)}
                placeholder="Explain why this request is denied (e.g., messaging restricted, inappropriate request, etc.)..."
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setDecliningChatReq(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleReviewRequest(decliningChatReq.id, 'declined', declineReasonText || 'Declined by Administrator');
                  setDecliningChatReq(null);
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
              >
                Confirm Denial & Send Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
