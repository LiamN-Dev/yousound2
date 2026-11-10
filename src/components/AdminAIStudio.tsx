import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Check, ChevronDown, CircleHelp, Clock3, Loader2, Lock, MessageSquare, RefreshCw, Send, ShieldCheck, Sparkles, Unlock, UserRound } from 'lucide-react';

type ChatMessage = { role: 'user' | 'model'; text: string };
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[] };
type Question = { id: string; uid: string; username: string; question: string; status: 'pending' | 'answered' | 'dismissed'; createdAt: string; answer?: string };
type SafetyFlag = { id: string; threadId: string; senderUsername: string; category: string; severity: 'high' | 'medium' | 'unverified'; reason: string; excerpt: string; createdAt: string; status: string; lockedByAi?: boolean };
type AppealThread = { id: string; username: string; userId: string; reason: string; isTerminated: boolean; lastMessage?: string; lastMessageAt?: string };
type AdminActionProposal = { type: 'lock_conversation' | 'unlock_conversation' | 'answer_question' | 'set_games_access' | 'ban_user'; targetId: string; value?: boolean; reason?: string; answer?: string };

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'The administrator AI request failed.');
  return data;
}

export const AdminAIStudio: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Administrator AI is ready. I can summarize flagged conversations, review suspension appeals, answer operational questions, and help you decide what needs attention. I will not apply moderation actions without an explicit administrator action.' }
  ]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overviewError, setOverviewError] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [flags, setFlags] = useState<SafetyFlag[]>([]);
  const [appeals, setAppeals] = useState<AppealThread[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewingThread, setReviewingThread] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [actionProposal, setActionProposal] = useState<AdminActionProposal | null>(null);
  const [queueOpen, setQueueOpen] = useState(true);
  const [flagsOpen, setFlagsOpen] = useState(true);
  const [appealsOpen, setAppealsOpen] = useState(true);

  const pendingQuestions = useMemo(() => questions.filter(item => item.status === 'pending'), [questions]);
  const openFlags = useMemo(() => flags.filter(item => item.status === 'open'), [flags]);

  const loadOverview = async () => {
    try {
      const data = await requestJson('/api/admin/ai/operations');
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setFlags(Array.isArray(data.flags) ? data.flags : []);
      setAppeals(Array.isArray(data.appeals) ? data.appeals : []);
      setOverviewError('');
    } catch (err: any) {
      setOverviewError(err?.message || 'Could not load administrator operations.');
    }
  };

  const loadConversations = async () => {
    const data = await requestJson('/api/admin/ai/conversations');
    const list = Array.isArray(data.conversations) ? data.conversations as Conversation[] : [];
    setConversations(list);
    if (list.length) {
      const current = list.find(item => item.id === activeConversationId) || list[0];
      setActiveConversationId(current.id);
      setMessages(current.messages || []);
    } else {
      const created = await requestJson('/api/admin/ai/conversations', { method: 'POST' });
      setConversations([created.conversation]);
      setActiveConversationId(created.conversation.id);
      setMessages(created.conversation.messages || []);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setLoading(true);
      try {
        await Promise.all([loadOverview(), loadConversations()]);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not open administrator AI.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void start();
    const timer = window.setInterval(() => { void loadOverview(); }, 20000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const persist = async (id: string, nextMessages: ChatMessage[]) => {
    const data = await requestJson('/api/admin/ai/conversations/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: nextMessages }),
    });
    const saved = data.conversation as Conversation;
    setConversations(current => [saved, ...current.filter(item => item.id !== saved.id)].slice(0, 25));
  };

  const createConversation = async () => {
    if (busy) return;
    try {
      const data = await requestJson('/api/admin/ai/conversations', { method: 'POST' });
      const created = data.conversation as Conversation;
      setConversations(current => [created, ...current].slice(0, 25));
      setActiveConversationId(created.id);
      setMessages(created.messages || []);
      setActionProposal(null);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not create a new administrator conversation.');
    }
  };

  const selectConversation = (id: string) => {
    const conversation = conversations.find(item => item.id === id);
    if (!conversation) return;
    setActiveConversationId(id);
    setMessages(conversation.messages || []);
    setActionProposal(null);
    setError('');
  };

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy || !activeConversationId) return;
    const userMessage: ChatMessage = { role: 'user', text: message };
    const before = messages.filter(item => !(item.role === 'model' && /administrator ai is ready/i.test(item.text))).slice(-58);
    const next = [...before, userMessage];
    setMessages(next);
    setDraft('');
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await persist(activeConversationId, next);
      const response = await requestJson('/api/admin/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: before.slice(-10) }),
      });
      const completed = [...next, { role: 'model' as const, text: response.reply }];
      setMessages(completed);
      setActionProposal(response.actionProposal && typeof response.actionProposal === 'object' ? response.actionProposal as AdminActionProposal : null);
      await persist(activeConversationId, completed);
    } catch (err: any) {
      setError(err?.message || 'Administrator AI could not complete that request. Your question was saved.');
    } finally {
      setBusy(false);
    }
  };

  const executeProposal = async () => {
    if (!actionProposal || actionBusy) return;
    const labels: Record<AdminActionProposal['type'], string> = {
      lock_conversation: 'lock this conversation',
      unlock_conversation: 'unlock this conversation',
      answer_question: 'send the proposed answer to the member',
      set_games_access: actionProposal.value ? 'enable Games access for this member' : 'disable Games access for this member',
      ban_user: actionProposal.value ? 'suspend this member from YouSound' : 'remove this member’s suspension',
    };
    const label = labels[actionProposal.type];
    if (!window.confirm('Admin AI wants to ' + label + '.\n\nTarget ID: ' + actionProposal.targetId + '\n\nThis action will be recorded. Continue?')) return;
    setActionBusy('ai-proposal');
    setError('');
    try {
      const data = await requestJson('/api/admin/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionProposal, confirmed: true }),
      });
      const summary = 'Action completed: ' + label + '. The server confirmed the change and recorded it in the Admin AI audit log.';
      const next = [...messages, { role: 'model' as const, text: summary }];
      setMessages(next);
      await persist(activeConversationId, next);
      setActionProposal(null);
      setFeedback(summary);
      await loadOverview();
    } catch (err: any) {
      setError(err?.message || 'Admin AI could not execute this action.');
    } finally {
      setActionBusy('');
    }
  };

  const reviewThread = async (threadId: string, kind: 'flag' | 'appeal') => {
    if (reviewingThread) return;
    setReviewingThread(threadId);
    setError('');
    try {
      const data = await requestJson('/api/admin/ai/review-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, kind }),
      });
      const heading = kind === 'appeal' ? 'Suspension appeal review' : 'Conversation safety review';
      const next = [...messages, { role: 'model' as const, text: heading + '\n\n' + data.review }];
      setMessages(next);
      await persist(activeConversationId, next);
      setFeedback('Review added to the administrator AI conversation. No account or conversation action was changed.');
    } catch (err: any) {
      setError(err?.message || 'Could not review this conversation.');
    } finally {
      setReviewingThread('');
    }
  };

  const moderateThread = async (threadId: string, action: 'lock' | 'unlock', username: string) => {
    const label = action === 'lock' ? 'lock' : 'unlock';
    if (!window.confirm('Are you sure you want to ' + label + ' the conversation with @' + username + '? The action will be recorded.')) return;
    setActionBusy(threadId);
    setError('');
    try {
      await requestJson('/api/admin/ai/threads/' + encodeURIComponent(threadId) + '/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: 'Administrator action from Admin AI.' }),
      });
      setFeedback('Conversation ' + (action === 'lock' ? 'locked' : 'unlocked') + '.');
      await loadOverview();
    } catch (err: any) {
      setError(err?.message || 'The conversation action failed.');
    } finally {
      setActionBusy('');
    }
  };

  const answerQuestion = async (item: Question, action: 'answer' | 'dismiss') => {
    const answer = String(answers[item.id] || '').trim();
    if (action === 'answer' && !answer) { setError('Write an answer before sending it.'); return; }
    setActionBusy(item.id);
    setError('');
    try {
      await requestJson('/api/admin/ai/knowledge-requests/' + encodeURIComponent(item.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, answer }),
      });
      setFeedback(action === 'answer' ? 'Answer sent privately to @' + item.username + '.' : 'Question dismissed.');
      setAnswers(current => ({ ...current, [item.id]: '' }));
      await loadOverview();
    } catch (err: any) {
      setError(err?.message || 'Could not update the question.');
    } finally {
      setActionBusy('');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <section className="relative overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-[#080f1c] via-[#15172c] to-[#21163c] p-6 text-white shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-violet-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-violet-200"><ShieldCheck className="h-4 w-4" /> Administrator-only workspace</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Admin AI</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">An AI operations administrator that can inspect live queues and propose real site actions. Confirmed actions run through administrator-only server permissions and are written to an audit log.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-[10px] font-bold text-amber-100">{pendingQuestions.length} questions</span>
            <span className="rounded-xl border border-rose-200/20 bg-rose-200/10 px-3 py-2 text-[10px] font-bold text-rose-100">{openFlags.length} open flags</span>
            <span className="rounded-xl border border-violet-200/20 bg-violet-200/10 px-3 py-2 text-[10px] font-bold text-violet-100">{appeals.length} appeals</span>
          </div>
        </div>
      </section>

      {(error || overviewError || feedback) && <div className="space-y-2">
        {error && <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{error}</div>}
        {overviewError && <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">{overviewError}</div>}
        {feedback && <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">{feedback}</div>}
      </div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1220] text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-200" /><div className="text-sm font-black">Admin AI conversation</div></div>
            <div className="flex items-center gap-2">
              <select value={activeConversationId} onChange={event => selectConversation(event.target.value)} className="max-w-[190px] rounded-lg border border-white/10 bg-[#151d2c] px-2 py-2 text-[10px] text-slate-200">
                {conversations.map(item => <option key={item.id} value={item.id}>{item.title || 'Admin conversation'}</option>)}
              </select>
              <button type="button" onClick={() => void createConversation()} className="rounded-lg border border-violet-200/20 bg-violet-200/10 px-3 py-2 text-[10px] font-bold text-violet-100">New chat</button>
            </div>
          </div>
          <div className="max-h-[620px] min-h-[360px] space-y-4 overflow-y-auto p-4 sm:p-5">
            {loading ? <div className="flex items-center gap-2 py-12 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Opening secure admin workspace…</div> : messages.map((item, index) => (
              <div key={index} className={'flex gap-3 ' + (item.role === 'user' ? 'justify-end' : 'justify-start')}>
                {item.role === 'model' && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-200/20 bg-violet-300/10 text-violet-100"><Bot className="h-4 w-4" /></div>}
                <div className={'max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-xs leading-6 ' + (item.role === 'user' ? 'border border-cyan-200/20 bg-cyan-500/15 text-cyan-50' : 'border border-white/10 bg-white/[.045] text-slate-200')}>{item.text}</div>
                {item.role === 'user' && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100"><UserRound className="h-4 w-4" /></div>}
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-xs text-violet-100"><Loader2 className="h-4 w-4 animate-spin" /> Reviewing operations…</div>}
            {actionProposal && <div className="rounded-2xl border border-amber-200/30 bg-amber-200/[.08] p-4">
              <div className="flex items-center gap-2 text-xs font-black text-amber-100"><ShieldCheck className="h-4 w-4" /> Proposed admin action</div>
              <div className="mt-2 text-xs leading-5 text-slate-200">{actionProposal.type.replace(/_/g, ' ')} · Target: <span className="font-mono text-amber-100">{actionProposal.targetId}</span></div>
              {actionProposal.reason && <p className="mt-1 text-[11px] text-slate-400">Reason: {actionProposal.reason}</p>}
              {actionProposal.answer && <p className="mt-2 rounded-lg bg-black/20 p-3 text-xs text-slate-200">{actionProposal.answer}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void executeProposal()} disabled={!!actionBusy} className="rounded-lg bg-amber-200 px-3 py-2 text-[10px] font-black text-slate-950 disabled:opacity-50">{actionBusy === 'ai-proposal' ? 'Executing…' : 'Confirm and execute'}</button>
                <button type="button" onClick={() => setActionProposal(null)} disabled={!!actionBusy} className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold text-slate-300">Dismiss</button>
              </div>
              <p className="mt-2 text-[9px] text-slate-500">No change occurs until you confirm. Execution is permission-checked and audited on the server.</p>
            </div>}
          </div>
          <div className="border-t border-white/10 p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void send('Review the current safety flags and suspension appeals. Prioritize cases needing human review, summarize evidence, and identify missing information. Do not change any account or conversation.')} disabled={busy || loading} className="rounded-lg border border-rose-200/15 bg-rose-200/[.06] px-3 py-2 text-[9px] font-bold text-rose-100 disabled:opacity-40">Review open safety & appeals</button>
              <button type="button" onClick={() => void send('Summarize the unanswered user questions and identify which ones need an administrator response. Do not invent answers.')} disabled={busy || loading} className="rounded-lg border border-amber-200/15 bg-amber-200/[.06] px-3 py-2 text-[9px] font-bold text-amber-100 disabled:opacity-40">Triage user questions</button>
            </div>
            <form onSubmit={event => { event.preventDefault(); void send(draft); }} className="flex items-end gap-2">
              <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} rows={2} maxLength={1600} placeholder="Ask Admin AI about moderation, appeals, users, or site operations…" className="min-h-[48px] flex-1 resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-xs text-white outline-none placeholder:text-slate-500 focus:border-violet-200/40" />
              <button type="submit" disabled={busy || !draft.trim() || !activeConversationId} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-300 text-slate-950 hover:bg-violet-200 disabled:opacity-40" aria-label="Send message"><Send className="h-4 w-4" /></button>
            </form>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-amber-200/15 bg-[#111a29] text-white">
            <button type="button" onClick={() => setQueueOpen(value => !value)} className="flex w-full items-center justify-between p-4 text-left"><span className="flex items-center gap-2 text-xs font-black"><CircleHelp className="h-4 w-4 text-amber-200" /> User questions ({pendingQuestions.length})</span><ChevronDown className={'h-4 w-4 transition ' + (queueOpen ? 'rotate-180' : '')} /></button>
            {queueOpen && <div className="max-h-[380px] space-y-3 overflow-y-auto border-t border-white/5 p-3">
              {pendingQuestions.length ? pendingQuestions.map(item => <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-amber-100">@{item.username}</span><span className="text-[9px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</span></div>
                <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-200">{item.question}</p>
                <textarea value={answers[item.id] || ''} onChange={event => setAnswers(current => ({ ...current, [item.id]: event.target.value }))} rows={2} maxLength={1400} placeholder="Write a private answer…" className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 p-2 text-[11px] text-white outline-none focus:border-amber-200/30" />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => void answerQuestion(item, 'dismiss')} disabled={!!actionBusy} className="rounded-lg border border-white/10 px-2.5 py-2 text-[9px] font-bold text-slate-400">Dismiss</button>
                  <button type="button" onClick={() => void answerQuestion(item, 'answer')} disabled={!!actionBusy || !(answers[item.id] || '').trim()} className="rounded-lg bg-amber-200 px-2.5 py-2 text-[9px] font-black text-slate-950 disabled:opacity-40"><Check className="mr-1 inline h-3 w-3" /> Send answer</button>
                </div>
              </div>) : <p className="py-6 text-center text-[10px] text-slate-500">No unanswered questions.</p>}
            </div>}
          </section>

          <section className="overflow-hidden rounded-2xl border border-rose-200/15 bg-[#111a29] text-white">
            <button type="button" onClick={() => setFlagsOpen(value => !value)} className="flex w-full items-center justify-between p-4 text-left"><span className="flex items-center gap-2 text-xs font-black"><AlertTriangle className="h-4 w-4 text-rose-200" /> Safety review ({openFlags.length})</span><ChevronDown className={'h-4 w-4 transition ' + (flagsOpen ? 'rotate-180' : '')} /></button>
            {flagsOpen && <div className="max-h-[400px] space-y-3 overflow-y-auto border-t border-white/5 p-3">
              {openFlags.length ? openFlags.map(flag => <div key={flag.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-white">@{flag.senderUsername}</span><span className="rounded-md bg-rose-300/10 px-2 py-1 text-[8px] font-black uppercase text-rose-100">{flag.severity}</span></div>
                <p className="mt-2 text-[10px] leading-5 text-slate-300">{flag.reason}</p>
                {flag.excerpt && <p className="mt-2 rounded-lg border-l-2 border-rose-300/40 bg-white/[.03] p-2 text-[10px] text-slate-400">{flag.excerpt}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void reviewThread(flag.threadId, 'flag')} disabled={!!reviewingThread} className="rounded-lg border border-violet-200/20 bg-violet-200/10 px-2.5 py-2 text-[9px] font-bold text-violet-100 disabled:opacity-40">{reviewingThread === flag.threadId ? 'Reviewing…' : 'AI review'}</button>
                  <button type="button" onClick={() => void moderateThread(flag.threadId, 'lock', flag.senderUsername)} disabled={!!actionBusy} className="rounded-lg border border-rose-200/20 px-2.5 py-2 text-[9px] font-bold text-rose-100 disabled:opacity-40"><Lock className="mr-1 inline h-3 w-3" /> Lock</button>
                  {flag.lockedByAi && <button type="button" onClick={() => void moderateThread(flag.threadId, 'unlock', flag.senderUsername)} disabled={!!actionBusy} className="rounded-lg border border-emerald-200/20 px-2.5 py-2 text-[9px] font-bold text-emerald-100 disabled:opacity-40"><Unlock className="mr-1 inline h-3 w-3" /> Unlock</button>}
                </div>
              </div>) : <p className="py-6 text-center text-[10px] text-slate-500">No open safety flags.</p>}
            </div>}
          </section>

          <section className="overflow-hidden rounded-2xl border border-violet-200/15 bg-[#111a29] text-white">
            <button type="button" onClick={() => setAppealsOpen(value => !value)} className="flex w-full items-center justify-between p-4 text-left"><span className="flex items-center gap-2 text-xs font-black"><ShieldCheck className="h-4 w-4 text-violet-200" /> Suspension appeals ({appeals.length})</span><ChevronDown className={'h-4 w-4 transition ' + (appealsOpen ? 'rotate-180' : '')} /></button>
            {appealsOpen && <div className="max-h-[360px] space-y-3 overflow-y-auto border-t border-white/5 p-3">
              {appeals.length ? appeals.map(item => <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] font-black text-violet-100">@{item.username}</div>
                <p className="mt-1 text-[10px] leading-5 text-slate-400">{item.reason || 'No suspension reason is recorded.'}</p>
                {item.lastMessage && <p className="mt-2 line-clamp-3 text-[10px] leading-5 text-slate-300">Latest: {item.lastMessage}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void reviewThread(item.id, 'appeal')} disabled={!!reviewingThread} className="rounded-lg border border-violet-200/20 bg-violet-200/10 px-2.5 py-2 text-[9px] font-bold text-violet-100">{reviewingThread === item.id ? 'Reviewing…' : 'AI review appeal'}</button>
                  <button type="button" onClick={() => void moderateThread(item.id, item.isTerminated ? 'unlock' : 'lock', item.username)} disabled={!!actionBusy} className="rounded-lg border border-white/10 px-2.5 py-2 text-[9px] font-bold text-slate-200">{item.isTerminated ? <><Unlock className="mr-1 inline h-3 w-3" /> Unlock chat</> : <><Lock className="mr-1 inline h-3 w-3" /> Lock chat</>}</button>
                </div>
              </div>) : <p className="py-6 text-center text-[10px] text-slate-500">No open suspension appeals.</p>}
            </div>}
          </section>
          <button type="button" onClick={() => { void loadOverview(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-[10px] font-bold text-slate-300 hover:bg-white/[.07]"><RefreshCw className="h-3.5 w-3.5" /> Refresh admin queues</button>
          <p className="flex items-start gap-2 px-1 text-[9px] leading-4 text-slate-500"><Clock3 className="mt-0.5 h-3 w-3 shrink-0" /> Admin queues refresh about every 20 seconds. Moderation and account decisions remain with an administrator.</p>
        </aside>
      </div>
    </div>
  );
};
