import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, CircleHelp, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';

type KnowledgeEntry = { id: string; question: string; answer: string; updatedAt?: string };
type KnowledgeRequest = {
  id: string; uid: string; username: string; question: string;
  status: 'pending' | 'resolved' | 'dismissed'; createdAt: string; answer?: string;
};

export const AdminAIKnowledge: React.FC = () => {
  const [siteStatus, setSiteStatus] = useState('');
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [requests, setRequests] = useState<KnowledgeRequest[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/ai/knowledge', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load AI knowledge.');
      setSiteStatus(String(data.knowledge?.siteStatus || ''));
      setEntries(Array.isArray(data.knowledge?.entries) ? data.knowledge.entries : []);
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err: any) {
      setError(err?.message || 'Could not load AI knowledge.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (nextEntries = entries, nextStatus = siteStatus) => {
    if (saving) return;
    setSaving(true);
    setFeedback('');
    setError('');
    try {
      const response = await fetch('/api/admin/ai/knowledge', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteStatus: nextStatus, entries: nextEntries }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The knowledge base was not saved.');
      setEntries(Array.isArray(data.knowledge?.entries) ? data.knowledge.entries : nextEntries);
      setFeedback('AI knowledge saved. New answers will use this information.');
    } catch (err: any) {
      setError(err?.message || 'The knowledge base was not saved.');
    } finally {
      setSaving(false);
    }
  };

  const addEntry = () => {
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) { setError('Enter both a question and a confirmed answer.'); return; }
    if (entries.length >= 60) { setError('The knowledge base is full. Edit or remove an entry first.'); return; }
    const next = [...entries, { id: 'local_' + Date.now(), question: q, answer: a }];
    setEntries(next);
    setQuestion('');
    setAnswer('');
    setError('');
    void save(next);
  };

  const removeEntry = (id: string) => {
    const next = entries.filter(item => item.id !== id);
    setEntries(next);
    void save(next);
  };

  const reviewRequest = async (item: KnowledgeRequest, action: 'resolve' | 'dismiss') => {
    const responseText = String(answerDrafts[item.id] || '').trim();
    if (action === 'resolve' && !responseText) {
      setError('Add a confirmed answer before resolving this request.');
      return;
    }
    setSaving(true);
    setFeedback('');
    setError('');
    try {
      const response = await fetch('/api/admin/ai/knowledge-requests/' + encodeURIComponent(item.id), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, answer: responseText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not update the request.');
      setFeedback(action === 'resolve' ? 'Question answered and added to AI knowledge.' : 'Knowledge request dismissed.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not update the request.');
    } finally {
      setSaving(false);
    }
  };

  const pending = requests.filter(item => item.status === 'pending');

  return (
    <div className="space-y-5 pb-12">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-[#07151c] via-[#111827] to-[#1a1740] p-6 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-cyan-200"><Sparkles className="h-4 w-4" /> AI operations</div>
            <h2 className="mt-2 text-2xl font-black">AI Knowledge & Site Status</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">Give YouSound AI confirmed information about maintenance, outages, features, and site policies. Only admins can edit this information.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.06] px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-cyan-100">{entries.length} knowledge entries</span>
          <span className="rounded-lg border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-amber-100">{pending.length} unanswered questions</span>
        </div>
      </section>

      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {feedback && <div className="flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200"><Check className="mt-0.5 h-4 w-4 shrink-0" />{feedback}</div>}

      <section className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-white">
        <div className="mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-cyan-300" /><h3 className="text-sm font-black">Current site status</h3></div>
        <p className="mb-3 text-[11px] leading-5 text-slate-400">This is what the AI should tell users right now about maintenance, incidents, or important site changes. Replace outdated messages instead of stacking old updates.</p>
        <textarea value={siteStatus} onChange={event => setSiteStatus(event.target.value)} maxLength={2400} rows={4} placeholder="Example: The music library is available. Radio is undergoing maintenance. We do not have a confirmed restoration time yet." className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-xs leading-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/40" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><span className="text-[9px] text-slate-500">{siteStatus.length}/2400 characters · factual updates only</span><button type="button" onClick={() => void save()} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-40">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save status</button></div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-white">
        <div className="mb-1 flex items-center gap-2"><CircleHelp className="h-4 w-4 text-violet-300" /><h3 className="text-sm font-black">Confirmed answers</h3></div>
        <p className="mb-4 text-[11px] leading-5 text-slate-400">Add short answers the AI is allowed to rely on. Do not put passwords, private user details, or secret keys here.</p>
        <div className="grid gap-3">
          <input value={question} onChange={event => setQuestion(event.target.value)} maxLength={240} placeholder="Question, e.g. Why is the radio unavailable?" className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-violet-300/40" />
          <textarea value={answer} onChange={event => setAnswer(event.target.value)} maxLength={1400} rows={3} placeholder="Confirmed answer for the AI to use…" className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-xs leading-5 text-white outline-none placeholder:text-slate-500 focus:border-violet-300/40" />
          <div className="flex justify-end"><button type="button" onClick={addEntry} disabled={saving || loading || !question.trim() || !answer.trim()} className="inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-400/15 px-4 py-2.5 text-xs font-bold text-violet-100 hover:bg-violet-400/20 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add confirmed answer</button></div>
        </div>
        <div className="mt-5 space-y-2">
          {loading ? <div className="flex items-center gap-2 py-4 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading knowledge…</div> : entries.length ? entries.map(item => (
            <div key={item.id} className="flex items-start gap-3 rounded-xl border border-white/[.07] bg-black/20 p-3">
              <div className="min-w-0 flex-1"><div className="text-xs font-bold text-white">{item.question}</div><p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-300">{item.answer}</p></div>
              <button type="button" onClick={() => removeEntry(item.id)} disabled={saving} title="Remove knowledge entry" className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )) : <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-slate-500">No confirmed answers have been added yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-white">
        <div className="mb-1 flex items-center justify-between gap-3"><h3 className="text-sm font-black">Questions from users</h3><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[9px] font-bold text-amber-200">{pending.length} pending</span></div>
        <p className="mb-4 text-[11px] leading-5 text-slate-400">Resolve a request only when you know the answer. Resolving automatically saves it as a confirmed answer for future AI conversations.</p>
        {loading ? <div className="flex items-center gap-2 py-4 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading requests…</div> : requests.length ? <div className="space-y-3">
          {requests.map(item => (
            <div key={item.id} className="rounded-xl border border-white/[.08] bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-white">@{item.username}</span><span className={'rounded-full px-2 py-1 text-[9px] font-bold uppercase ' + (item.status === 'pending' ? 'bg-amber-400/10 text-amber-200' : item.status === 'resolved' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-slate-500/10 text-slate-400')}>{item.status}</span></div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-200">{item.question}</p>
              <p className="mt-1 text-[9px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
              {item.status === 'pending' && <><textarea value={answerDrafts[item.id] || ''} onChange={event => setAnswerDrafts(current => ({ ...current, [item.id]: event.target.value }))} rows={2} maxLength={1400} placeholder="Enter a confirmed answer…" className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/40" /><div className="mt-2 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void reviewRequest(item, 'dismiss')} disabled={saving} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-slate-300 disabled:opacity-40">Dismiss</button><button type="button" onClick={() => void reviewRequest(item, 'resolve')} disabled={saving || !(answerDrafts[item.id] || '').trim()} className="rounded-lg bg-emerald-400 px-3 py-2 text-[10px] font-black text-slate-950 disabled:opacity-40"><Check className="mr-1 inline h-3 w-3" /> Resolve & add answer</button></div></>}
              {item.status === 'resolved' && item.answer && <p className="mt-2 text-[11px] leading-5 text-emerald-200">Answer: {item.answer}</p>}
            </div>
          ))}
        </div> : <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-slate-500">No questions have been submitted.</p>}
      </section>
    </div>
  );
};
