import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, BrainCircuit, Loader2, RefreshCw, Send, Sparkles, UserRound } from 'lucide-react';

type ChatMessage = { role: 'user' | 'model'; text: string };
type MyQuestion = { id: string; question: string; status: 'pending' | 'answered' | 'dismissed'; answer?: string; createdAt: string };
type SavedConversation = { id: string; title: string; updatedAt: string; messages: ChatMessage[] };

const starters = [
  'Recommend tracks for a focused study session.',
  'Help me discover something with a calm electronic sound.',
  'What is the current YouSound site status?',
];

export const AIStudio: React.FC = () => {
  const welcome: ChatMessage = { role: 'model', text: 'Welcome to YouSound AI. I can help you discover music from the library, build listening ideas, and explain how YouSound works. What are you looking for?' };
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [serviceStatus, setServiceStatus] = useState('Checking AI service configuration…');
  const [serviceStatusError, setServiceStatusError] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [knowledgeFeedback, setKnowledgeFeedback] = useState('');
  const [myQuestions, setMyQuestions] = useState<MyQuestion[]>([]);
  const [myQuestionsError, setMyQuestionsError] = useState('');
  const [shutdownChallengeToken, setShutdownChallengeToken] = useState('');
  const [shutdownConfirmText, setShutdownConfirmText] = useState('');
  const [shutdownDataAcknowledged, setShutdownDataAcknowledged] = useState(false);
  const [shutdownConfirmBusy, setShutdownConfirmBusy] = useState(false);
  const [shutdownConfirmFeedback, setShutdownConfirmFeedback] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshServiceStatus = async () => {
    try {
      const response = await fetch('/api/ai/health', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not check AI service configuration.');
      setServiceStatus(data.message || 'AI service configuration checked.');
      setServiceStatusError(!data.enabled || !data.apiKeyConfigured);
    } catch (err: any) {
      setServiceStatus(err?.message || 'Could not check AI service configuration.');
      setServiceStatusError(true);
    }
  };

  const refreshMyQuestions = async () => {
    try {
      const response = await fetch('/api/ai/knowledge-requests/mine', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load your admin questions.');
      setMyQuestions(Array.isArray(data.requests) ? data.requests : []);
      setMyQuestionsError('');
    } catch (err: any) {
      setMyQuestionsError(err?.message || 'Could not load your admin questions.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadConversations = async () => {
      try {
        const response = await fetch('/api/ai/conversations', { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not restore your AI conversations.');
        let list = Array.isArray(data.conversations) ? data.conversations as SavedConversation[] : [];
        if (!list.length) {
          const createdResponse = await fetch('/api/ai/conversations', { method: 'POST', credentials: 'same-origin' });
          const created = await createdResponse.json().catch(() => ({}));
          if (!createdResponse.ok || !created.success) throw new Error(created.error || 'Could not start an AI conversation.');
          list = [created.conversation];
        }
        if (!cancelled) {
          setConversations(list);
          setConversationId(list[0].id);
          setMessages(list[0].messages?.length ? list[0].messages : [welcome]);
        }
      } catch (err: any) { if (!cancelled) setError(err?.message || 'Could not restore AI conversations.'); }
      finally { if (!cancelled) setConversationsLoading(false); }
    };
    void loadConversations();
    return () => { cancelled = true; };
  }, []);

  const saveConversation = async (id: string, next: ChatMessage[]) => {
    if (!id) return;
    const response = await fetch('/api/ai/conversations/' + encodeURIComponent(id), {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: next }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not save your conversation.');
    setConversations(current => [data.conversation, ...current.filter(item => item.id !== id)].slice(0, 30));
  };

  const startNewConversation = async () => {
    const response = await fetch('/api/ai/conversations', { method: 'POST', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not start a new conversation.');
    setConversations(current => [data.conversation, ...current].slice(0, 30));
    setConversationId(data.conversation.id);
    setMessages([welcome]);
    setLastQuestion('');
    setError('');
  };

  useEffect(() => {
    void refreshMyQuestions();
    void refreshServiceStatus();
    const timer = window.setInterval(() => void refreshMyQuestions(), 20000);
    const statusTimer = window.setInterval(() => void refreshServiceStatus(), 30000);
    return () => { window.clearInterval(timer); window.clearInterval(statusTimer); };
  }, []);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy || conversationsLoading || !conversationId) return;
    const alreadyDisplayed = messages.length > 0 && messages[messages.length - 1].role === 'user' && messages[messages.length - 1].text === message;
    const history = (alreadyDisplayed ? messages.slice(0, -1) : messages)
      .filter(item => !(item.role === 'model' && /welcome to yousound ai/i.test(item.text)))
      .slice(-8);
    if (!alreadyDisplayed) setMessages(current => [...current, { role: 'user', text: message }]);
    try { await saveConversation(conversationId, [...(alreadyDisplayed ? messages.slice(0, -1) : messages), { role: 'user', text: message }]); } catch (saveError: any) { setError(saveError?.message || 'Your conversation could not be saved.'); }
    setLastQuestion(message);
    setKnowledgeFeedback('');
    setDraft('');
    setError('');
    setBusy(true);
    try {
      const isAIHelpCommand = /^\/?help$/i.test(message);
      const isAIShutdownCommand = /^\/?shutdown$/i.test(message)
        || /^(?:please\s+)?shut\s+down\s+(?:the\s+)?(?:yousound|site|website)[.!]?$/i.test(message)
        || /^take\s+(?:the\s+)?(?:yousound|site|website)\s+offline[.!]?$/i.test(message);
      if (isAIHelpCommand || isAIShutdownCommand) {
        const botResponse = await fetch('/api/chat/yousound-ai/command', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message }),
        });
        const botData = await botResponse.json().catch(() => ({}));
        if (!botResponse.ok || !botData.success) throw new Error(botData.error || 'YouSound AI could not process that command.');
        const botReply = Array.isArray(botData.messages)
          ? String(botData.messages[botData.messages.length - 1]?.content || 'YouSound AI replied.')
          : 'YouSound AI replied.';
        const completed = [...(alreadyDisplayed ? messages.slice(0, -1) : messages), { role: 'user' as const, text: message }, { role: 'model' as const, text: botReply }];
        setMessages(completed);
        await saveConversation(conversationId, completed);
        if (typeof botData.shutdownChallengeToken === 'string' && botData.shutdownChallengeToken) {
          setShutdownChallengeToken(botData.shutdownChallengeToken);
          setShutdownConfirmText('');
          setShutdownDataAcknowledged(false);
          setShutdownConfirmFeedback('');
        }
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
        return;
      }
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || typeof data.reply !== 'string') {
        const diagnostic = data.requestId ? ' (Diagnostic code: ' + data.requestId + ')' : '';
        throw new Error((data.error || 'YouSound AI could not answer right now.') + diagnostic);
      }
      const completed = [...(alreadyDisplayed ? messages.slice(0, -1) : messages), { role: 'user' as const, text: message }, { role: 'model' as const, text: data.reply }];
      setMessages(completed);
      await saveConversation(conversationId, completed);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    } catch (err: any) {
      setError(err?.message || 'The AI service is unavailable.');
    } finally {
      setBusy(false);
    }
  };

  const confirmTrustedShutdown = async () => {
    if (!shutdownChallengeToken || shutdownConfirmText.trim() !== 'SHUT DOWN YOU SONG' || !shutdownDataAcknowledged || shutdownConfirmBusy) return;
    setShutdownConfirmBusy(true);
    setShutdownConfirmFeedback('');
    try {
      const response = await fetch('/api/emergency-shutdown/trusted-confirm', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: shutdownChallengeToken,
          confirmationText: shutdownConfirmText.trim(),
          confirmDataRetained: shutdownDataAcknowledged,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Shutdown was not activated.');
      setShutdownChallengeToken('');
      const completed = [...messages, { role: 'model' as const, text: data.message || 'Emergency shutdown activated. YouSound is now offline.' }];
      setMessages(completed);
      await saveConversation(conversationId, completed);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    } catch (error: any) {
      setShutdownConfirmFeedback(error?.message || 'Shutdown was not activated.');
    } finally {
      setShutdownConfirmBusy(false);
    }
  };

  const requestKnowledgeHelp = async () => {
    if (!lastQuestion || requestBusy) return;
    setRequestBusy(true);
    setKnowledgeFeedback('');
    try {
      const response = await fetch('/api/ai/knowledge-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: lastQuestion }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not contact the administrators.');
      setKnowledgeFeedback(data.duplicate
        ? 'Your question is already in the administrators’ queue.'
        : 'Your question has been sent to the administrators for a confirmed answer.');
      await refreshMyQuestions();
    } catch (err: any) {
      setKnowledgeFeedback(err?.message || 'Could not contact the administrators.');
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-28">
      <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#07151c] p-6 text-white shadow-2xl sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/10 text-cyan-100"><BrainCircuit className="h-6 w-6" /></div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200">Private beta · AI studio</div>
            <h1 className="mt-1 text-3xl font-black tracking-tight">YouSound AI</h1>
          </div>
          <span className="ml-auto rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-[9px] font-black tracking-wider text-cyan-100">TEST BUILD</span>
        </div>
        <p className="relative mt-4 max-w-2xl text-sm leading-6 text-slate-300">A music and site assistant connected to the visible catalogue and the administrator-maintained status and knowledge base. When it does not know a site-specific answer, you can send the question to the admin team.</p>
        <p className={'relative mt-3 rounded-xl border px-3 py-2 text-[10px] ' + (serviceStatusError ? 'border-amber-300/20 bg-amber-300/[.06] text-amber-100' : 'border-emerald-300/15 bg-emerald-300/[.05] text-emerald-100')}>{serviceStatus}</p>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-white/10 bg-[#0a111e] text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-black"><Sparkles className="h-4 w-4 text-cyan-200" /> Conversation</div>
          <div className="flex items-center gap-2"><select value={conversationId} onChange={event => { const found = conversations.find(item => item.id === event.target.value); if (found) { setConversationId(found.id); setMessages(found.messages?.length ? found.messages : [welcome]); setLastQuestion(''); setError(''); } }} className="max-w-[180px] rounded-lg border border-white/10 bg-[#101b2a] px-2 py-2 text-[10px] text-slate-200"><option value="">Loading conversations…</option>{conversations.map(item => <option key={item.id} value={item.id}>{item.title || 'Conversation'}</option>)}</select><button type="button" onClick={() => void startNewConversation().catch(err => setError(err.message))} disabled={conversationsLoading || conversations.length >= 30} className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-[10px] font-bold text-cyan-100 disabled:opacity-40">New chat</button></div>
        </div>
        <div className="max-h-[55vh] min-h-[280px] space-y-4 overflow-y-auto p-4 sm:p-5">
          {messages.map((item, index) => (
            <div key={index} className={'flex gap-3 ' + (item.role === 'user' ? 'justify-end' : 'justify-start')}>
              {item.role === 'model' && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-100"><Bot className="h-4 w-4" /></div>}
              <div className={'max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ' + (item.role === 'user' ? 'border border-violet-300/20 bg-violet-500/15 text-violet-50' : 'border border-white/10 bg-white/[.045] text-slate-200')}>
                {item.text}
              </div>
              {item.role === 'user' && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-200/20 bg-violet-400/10 text-violet-100"><UserRound className="h-4 w-4" /></div>}
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-xs text-cyan-100"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
          <div ref={bottomRef} />
        </div>
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 border-t border-white/5 px-4 py-3">
            {starters.map(item => <button key={item} type="button" onClick={() => void send(item)} disabled={busy} className="rounded-xl border border-cyan-200/15 bg-cyan-200/[.06] px-3 py-2 text-left text-[10px] font-semibold text-cyan-100 transition hover:bg-cyan-200/10 disabled:opacity-40">{item}</button>)}
          </div>
        )}
        {error && <div className="border-t border-rose-300/15 bg-rose-400/[.06] px-5 py-3 text-xs text-rose-200">
          <div>{error}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => void send(lastQuestion)} disabled={busy || !lastQuestion} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200/20 bg-rose-200/10 px-3 py-2 text-[10px] font-bold text-rose-100 disabled:opacity-40"><RefreshCw className="h-3 w-3" /> Retry</button>
            <button type="button" onClick={() => void requestKnowledgeHelp()} disabled={requestBusy || !lastQuestion} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.05] px-3 py-2 text-[10px] font-bold text-slate-200 disabled:opacity-40">{requestBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Ask an admin to answer this</button>
          </div>
        </div>}
        {lastQuestion && !error && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-5 py-3">
          <span className="text-[10px] text-slate-500">Need an administrator to confirm something?</span>
          <button type="button" onClick={() => void requestKnowledgeHelp()} disabled={requestBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200/15 bg-cyan-200/[.06] px-3 py-2 text-[10px] font-bold text-cyan-100 hover:bg-cyan-200/10 disabled:opacity-40">{requestBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send question to admin</button>
        </div>}
        {knowledgeFeedback && <div className="border-t border-cyan-300/15 bg-cyan-300/[.06] px-5 py-3 text-xs text-cyan-100">{knowledgeFeedback}</div>}
        <form onSubmit={event => { event.preventDefault(); void send(draft); }} className="flex items-end gap-2 border-t border-white/10 p-3 sm:p-4">
          <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} rows={2} maxLength={1200} placeholder="Ask YouSound AI…" className="min-h-[48px] flex-1 resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-200/40" />
          <button type="submit" disabled={busy || conversationsLoading || !conversationId || !draft.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-200 text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}</button>
        </form>
        <div className="px-5 pb-4 text-[9px] leading-4 text-slate-500">AI responses can be wrong. Do not share passwords or private account information in the chat.</div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a111e] text-white shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div><h2 className="text-xs font-black">My questions to the admins</h2><p className="mt-1 text-[10px] text-slate-500">One-time answers are private to your account and do not become permanent AI knowledge.</p></div>
          <button type="button" onClick={() => void refreshMyQuestions()} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5" title="Refresh your questions"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
        {myQuestionsError && <p className="border-b border-rose-300/10 px-4 py-2 text-[10px] text-rose-200">{myQuestionsError}</p>}
        {myQuestions.length ? <div className="divide-y divide-white/5">{myQuestions.map(item => <div key={item.id} className="p-4">
          <div className="flex items-start justify-between gap-3"><p className="min-w-0 whitespace-pre-wrap text-xs leading-5 text-slate-200">{item.question}</p><span className={'shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase '+(item.status==='answered'?'bg-emerald-400/10 text-emerald-200':item.status==='pending'?'bg-amber-400/10 text-amber-200':'bg-slate-500/10 text-slate-400')}>{item.status}</span></div>
          {item.answer && <p className="mt-2 whitespace-pre-wrap rounded-xl border border-emerald-300/15 bg-emerald-300/[.05] p-3 text-xs leading-5 text-emerald-100">{item.answer}</p>}
        </div>)}</div> : <p className="p-5 text-center text-[11px] text-slate-500">You have not sent any questions to the admin team.</p>}
      </section>

      {shutdownChallengeToken && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="ai-trusted-shutdown-title" className="w-full max-w-lg space-y-4 rounded-3xl border border-rose-400/30 bg-[#15111a] p-6 text-white shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/15 text-rose-200"><Bot className="h-5 w-5"/></div>
              <div><h2 id="ai-trusted-shutdown-title" className="text-lg font-bold">Emergency shutdown confirmation</h2><p className="text-[10px] font-bold uppercase tracking-wider text-rose-200/70">Trusted Operator · expires in 2 minutes</p></div>
            </div>
            <p className="text-xs leading-5 text-slate-300">This takes the entire YouSound site offline for everyone. Your music, accounts, and database data remain stored, but the site will remain offline until an administrator changes EMERGENCY_RECOVERY.txt in GitHub and deploys a new commit.</p>
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-slate-200">Type the exact confirmation phrase</span>
              <input value={shutdownConfirmText} onChange={event => setShutdownConfirmText(event.target.value)} placeholder="SHUT DOWN YOU SONG" className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-rose-300/60"/>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-300">
              <input type="checkbox" checked={shutdownDataAcknowledged} onChange={event => setShutdownDataAcknowledged(event.target.checked)} className="mt-1 accent-rose-500"/>
              <span>I understand the whole site will go offline, data remains stored, and recovery requires an administrator deployment.</span>
            </label>
            {shutdownConfirmFeedback && <p role="status" className="rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-xs text-rose-100">{shutdownConfirmFeedback}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={shutdownConfirmBusy} onClick={() => { setShutdownChallengeToken(''); setShutdownConfirmFeedback(''); }} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">Cancel</button>
              <button type="button" disabled={shutdownConfirmBusy || shutdownConfirmText.trim() !== 'SHUT DOWN YOU SONG' || !shutdownDataAcknowledged} onClick={() => void confirmTrustedShutdown()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-40">{shutdownConfirmBusy ? 'Confirming…' : 'Shut Down YouSound'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
