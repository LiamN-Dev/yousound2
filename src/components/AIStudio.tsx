import React, { useRef, useState } from 'react';
import { ArrowUp, Bot, BrainCircuit, Loader2, Sparkles, UserRound } from 'lucide-react';

type ChatMessage = { role: 'user' | 'model'; text: string };

const starters = [
  'Recommend tracks for a focused study session.',
  'Help me discover something with a calm electronic sound.',
  'What can I do in the YouSound arcade?',
];

export const AIStudio: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Welcome to YouSound AI. I can help you discover music from the library, build listening ideas, and explain how YouSound works. What are you looking for?' },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    const history = messages.slice(-8);
    setMessages(current => [...current, { role: 'user', text: message }]);
    setDraft('');
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || typeof data.reply !== 'string') {
        throw new Error(data.error || 'YouSound AI could not answer right now.');
      }
      setMessages(current => [...current, { role: 'model', text: data.reply }]);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    } catch (err: any) {
      setError(err?.message || 'The AI service is unavailable.');
    } finally {
      setBusy(false);
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
        <p className="relative mt-4 max-w-2xl text-sm leading-6 text-slate-300">A music-discovery assistant connected to the visible YouSound catalogue. It can suggest listening directions and explain app features. It cannot change your account or perform admin actions.</p>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-white/10 bg-[#0a111e] text-white shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-black"><Sparkles className="h-4 w-4 text-cyan-200" /> Conversation</div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Gemini powered</span>
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
        {error && <div className="border-t border-rose-300/15 bg-rose-400/[.06] px-5 py-3 text-xs text-rose-200">{error}</div>}
        <form onSubmit={event => { event.preventDefault(); void send(draft); }} className="flex items-end gap-2 border-t border-white/10 p-3 sm:p-4">
          <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} rows={2} maxLength={1200} placeholder="Ask YouSound AI…" className="min-h-[48px] flex-1 resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-200/40" />
          <button type="submit" disabled={busy || !draft.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-200 text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}</button>
        </form>
        <div className="px-5 pb-4 text-[9px] leading-4 text-slate-500">AI responses can be wrong. Do not share passwords or private account information in the chat.</div>
      </section>
    </div>
  );
};
