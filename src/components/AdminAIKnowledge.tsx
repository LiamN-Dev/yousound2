import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, CircleHelp, Clock3, ExternalLink, Loader2, Plus, RefreshCw, Save, Search, ShieldCheck, Sparkles, Trash2, Wifi } from 'lucide-react';

type PermanentFact = { id: string; title: string; content: string; updatedAt?: string };
type TemporaryQuestion = {
  id: string; uid: string; username: string; question: string;
  status: 'pending' | 'answered' | 'dismissed'; createdAt: string; answer?: string; reviewedAt?: string;
};
type LegacyEntry = { id: string; question?: string; answer?: string; updatedAt?: string };
type LiveStatus = {
  available: boolean; pageUrl: string; fetchedAt?: string; aggregateState?: string;
  announcement?: string | null;
  resources?: Array<{ name: string; status: string; explanation?: string }>;
  activeReports?: Array<{ title: string; state: string; startedAt?: string | null; endsAt?: string | null; updates: string[] }>;
  upcomingMaintenance?: Array<{ title: string; startsAt?: string | null; endsAt?: string | null }>;
  error?: string;
};
type Diagnostic = { requestId: string; createdAt: string; model: string; statusCode: number | null; errorName: string; message: string };

const statusLabel = (value?: string) => {
  const state = String(value || 'unknown').toLowerCase();
  if (state === 'operational') return 'Operational';
  if (state === 'degraded') return 'Degraded performance';
  if (state === 'downtime') return 'Service outage';
  if (state === 'maintenance') return 'Maintenance';
  return 'Status unavailable';
};

export const AdminAIKnowledge: React.FC = () => {
  const [facts, setFacts] = useState<PermanentFact[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [requests, setRequests] = useState<TemporaryQuestion[]>([]);
  const [legacyEntries, setLegacyEntries] = useState<LegacyEntry[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [diagnosticCode, setDiagnosticCode] = useState('');
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/ai/knowledge', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load AI operations data.');
      setFacts(Array.isArray(data.facts) ? data.facts : []);
      setLiveStatus(data.liveStatus || null);
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setLegacyEntries(Array.isArray(data.legacyEntries) ? data.legacyEntries : []);
    } catch (err: any) {
      setError(err?.message || 'Could not load AI operations data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveFacts = async (next: PermanentFact[]) => {
    if (saving) return;
    setSaving(true);
    setFeedback('');
    setError('');
    try {
      const response = await fetch('/api/admin/ai/knowledge', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Permanent facts were not saved.');
      setFacts(Array.isArray(data.facts) ? data.facts : next);
      setFeedback('Permanent site facts saved.');
    } catch (err: any) {
      setError(err?.message || 'Permanent facts were not saved.');
    } finally {
      setSaving(false);
    }
  };

  const addFact = () => {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent) { setError('Enter a title and a permanent fact.'); return; }
    const next = [...facts, { id: 'local_' + Date.now(), title: cleanTitle, content: cleanContent }].slice(-80);
    setTitle('');
    setContent('');
    void saveFacts(next);
  };

  const removeFact = (id: string) => {
    void saveFacts(facts.filter(item => item.id !== id));
  };

  const answerTemporaryQuestion = async (item: TemporaryQuestion, action: 'answer' | 'dismiss') => {
    const reply = String(answers[item.id] || '').trim();
    if (action === 'answer' && !reply) { setError('Write the temporary reply first.'); return; }
    setSaving(true);
    setFeedback('');
    setError('');
    try {
      const response = await fetch('/api/admin/ai/knowledge-requests/' + encodeURIComponent(item.id), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, answer: reply }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not update the question.');
      setFeedback(action === 'answer' ? 'Temporary answer sent to @' + item.username + '. It was not added to permanent facts.' : 'Question dismissed.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not update the question.');
    } finally {
      setSaving(false);
    }
  };

  const promoteLegacy = async (item: LegacyEntry) => {
    const titleText = String(item.question || '').trim();
    const contentText = String(item.answer || '').trim();
    if (!contentText) return;
    if (!confirm('Promote this old answer into permanent site facts? Only do this if it is always true.')) return;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch('/api/admin/ai/legacy-facts/' + encodeURIComponent(item.id) + '/promote', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleText, content: contentText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not promote this item.');
      setFeedback('Legacy item promoted to permanent facts. Review whether it is truly stable.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not promote this item.');
    } finally {
      setSaving(false);
    }
  };

  const inspectDiagnostic = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = diagnosticCode.trim();
    if (!code) return;
    setDiagnostic(null);
    setDiagnosticError('');
    try {
      const response = await fetch('/api/admin/ai/diagnostics/' + encodeURIComponent(code), { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Diagnostic was not found. Check the Render logs for older errors.');
      setDiagnostic(data.diagnostic);
    } catch (err: any) {
      setDiagnosticError(err?.message || 'Could not look up diagnostic.');
    }
  };

  const pendingCount = requests.filter(item => item.status === 'pending').length;
  const activeReports = liveStatus?.activeReports || [];
  const upcoming = liveStatus?.upcomingMaintenance || [];

  return (
    <div className="space-y-5 pb-12">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-[#07151c] via-[#111827] to-[#1a1740] p-6 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-cyan-200"><Sparkles className="h-4 w-4" /> AI operations</div>
            <h2 className="mt-2 text-2xl font-black">AI Knowledge & Monitoring</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">Live incidents come from Better Stack. Permanent facts are stable information about YouSound. Temporary questions are answered privately by an administrator.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.06] px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-cyan-100">{facts.length} permanent facts</span>
          <span className="rounded-lg border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-amber-100">{pendingCount} temporary questions</span>
          <span className="rounded-lg border border-violet-200/20 bg-violet-200/10 px-3 py-2 text-violet-100">{legacyEntries.length} old items to review</span>
        </div>
      </section>

      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {feedback && <div className="flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200"><Check className="mt-0.5 h-4 w-4 shrink-0" />{feedback}</div>}

      <section className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Wifi className="h-4 w-4 text-cyan-300" /><h3 className="text-sm font-black">Live Better Stack status</h3></div>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">Fetched from the public status-page JSON feed. This is automatically refreshed and is not manually edited here.</p>
          </div>
          {liveStatus?.pageUrl && <a href={liveStatus.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-200 hover:text-cyan-100">Open status page <ExternalLink className="h-3 w-3" /></a>}
        </div>
        {loading ? <div className="flex items-center gap-2 py-5 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading live status…</div> : liveStatus?.available ? <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className={'rounded-full px-3 py-1.5 text-xs font-black ' + (liveStatus.aggregateState === 'operational' ? 'bg-emerald-400/15 text-emerald-200' : liveStatus.aggregateState === 'degraded' ? 'bg-amber-400/15 text-amber-200' : 'bg-rose-400/15 text-rose-200')}>{statusLabel(liveStatus.aggregateState)}</span>
            <span className="text-[10px] text-slate-500">Updated {liveStatus.fetchedAt ? new Date(liveStatus.fetchedAt).toLocaleString() : 'just now'}</span>
          </div>
          {liveStatus.announcement && <p className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] p-3 text-xs leading-5 text-cyan-100">{liveStatus.announcement}</p>}
          {activeReports.length > 0 ? <div className="mt-4 space-y-2">{activeReports.map((item,index) => <div key={index} className="rounded-xl border border-amber-300/20 bg-amber-300/[.05] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-amber-100">{item.title}</span><span className="text-[9px] font-black uppercase text-amber-200">{statusLabel(item.state)}</span></div>{item.updates.map((update,i)=><p key={i} className="mt-2 text-[11px] leading-5 text-slate-300">{update}</p>)}</div>)}</div> : <p className="mt-3 text-xs text-slate-400">No active incidents are listed.</p>}
          {upcoming.length > 0 && <div className="mt-4"><div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-indigo-200"><Clock3 className="h-3.5 w-3.5" /> Upcoming maintenance</div>{upcoming.map((item,index)=><div key={index} className="rounded-lg border border-indigo-300/15 bg-indigo-300/[.04] p-2.5 text-xs text-indigo-100">{item.title} · {item.startsAt ? new Date(item.startsAt).toLocaleString() : 'time not listed'}</div>)}</div>}
          {liveStatus.resources && liveStatus.resources.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-[10px] font-bold text-slate-400">Monitored services ({liveStatus.resources.length})</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{liveStatus.resources.map((r,index)=><div key={index} className="flex items-center justify-between gap-2 rounded-lg border border-white/[.06] bg-black/20 p-2"><span className="text-[11px] text-slate-300">{r.name}</span><span className="text-[9px] font-bold text-slate-400">{statusLabel(r.status)}</span></div>)}</div></details>}
        </> : <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/[.06] p-3 text-xs text-rose-200">Better Stack's live feed is unavailable: {liveStatus?.error || 'No status response.'}. The AI will say it cannot verify live status instead of guessing.</div>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-white">
        <div className="mb-1 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-violet-300" /><h3 className="text-sm font-black">Permanent site facts</h3></div>
        <p className="mb-4 text-[11px] leading-5 text-slate-400">Only stable truths belong here: what YouSound is, how features work, policies, and permanent instructions. Do not add outages, maintenance windows, or one-time user answers.</p>
        <div className="grid gap-3">
          <input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="Fact title, e.g. How VIP Games access works" className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-violet-300/40" />
          <textarea value={content} onChange={event => setContent(event.target.value)} maxLength={1200} rows={3} placeholder="Permanent explanation…" className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-xs leading-5 text-white outline-none placeholder:text-slate-500 focus:border-violet-300/40" />
          <div className="flex justify-end"><button type="button" onClick={addFact} disabled={saving || loading || !title.trim() || !content.trim()} className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-violet-300 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add permanent fact</button></div>
        </div>
        <div className="mt-5 space-y-2">{facts.length ? facts.map(item=><div key={item.id} className="flex items-start gap-3 rounded-xl border border-white/[.07] bg-black/20 p-3"><div className="min-w-0 flex-1"><div className="text-xs font-bold text-white">{item.title}</div><p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-300">{item.content}</p></div><button type="button" onClick={()=>removeFact(item.id)} disabled={saving} title="Delete permanent fact" className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></div>) : <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-slate-500">No permanent facts yet.</p>}</div>
      </section>

      {legacyEntries.length > 0 && <section className="rounded-2xl border border-amber-300/20 bg-[#101827] p-5 text-white">
        <h3 className="text-sm font-black text-amber-100">Old knowledge entries · review before promotion</h3>
        <p className="mt-1 text-[11px] text-slate-400">These came from the old mixed knowledge system and are no longer sent to the AI. Promote only answers that are genuinely permanent.</p>
        <div className="mt-3 space-y-2">{legacyEntries.map((item,index)=><div key={item.id || index} className="rounded-xl border border-white/[.07] bg-black/20 p-3"><div className="text-xs font-bold">{item.question || 'Legacy entry'}</div><p className="mt-1 text-[11px] leading-5 text-slate-300">{item.answer}</p><div className="mt-2 flex justify-end"><button type="button" disabled={saving} onClick={()=>void promoteLegacy(item)} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[10px] font-bold text-amber-100 disabled:opacity-40">Promote as permanent fact</button></div></div>)}</div>
      </section>}

      <section className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-white">
        <div className="mb-1 flex items-center justify-between gap-3"><h3 className="text-sm font-black">Temporary admin questions</h3><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[9px] font-bold text-amber-200">{pendingCount} pending</span></div>
        <p className="mb-4 text-[11px] leading-5 text-slate-400">These answers are sent privately to the person who asked. They do not become permanent AI knowledge.</p>
        {requests.length ? <div className="space-y-3">{requests.map(item=><div key={item.id} className="rounded-xl border border-white/[.08] bg-black/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-white">@{item.username}</span><span className={'rounded-full px-2 py-1 text-[9px] font-bold uppercase '+(item.status==='pending'?'bg-amber-400/10 text-amber-200':item.status==='answered'?'bg-emerald-400/10 text-emerald-200':'bg-slate-500/10 text-slate-400')}>{item.status}</span></div>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-200">{item.question}</p><p className="mt-1 text-[9px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
          {item.status==='pending' && <><textarea value={answers[item.id]||''} onChange={event=>setAnswers(current=>({...current,[item.id]:event.target.value}))} rows={2} maxLength={1400} placeholder="Temporary answer for this user…" className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500"/><div className="mt-2 flex justify-end gap-2"><button type="button" disabled={saving} onClick={()=>void answerTemporaryQuestion(item,'dismiss')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-slate-300 disabled:opacity-40">Dismiss</button><button type="button" disabled={saving||!(answers[item.id]||'').trim()} onClick={()=>void answerTemporaryQuestion(item,'answer')} className="rounded-lg bg-emerald-400 px-3 py-2 text-[10px] font-black text-slate-950 disabled:opacity-40">Send temporary answer</button></div></>}
          {item.status==='answered'&&item.answer&&<p className="mt-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[.05] p-2 text-[11px] leading-5 text-emerald-100">{item.answer}</p>}
        </div>)}</div> : <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-slate-500">No questions have been submitted.</p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101827] p-5 text-white">
        <h3 className="text-sm font-black">AI provider diagnostics</h3>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">Look up a future diagnostic code to see the saved error name, provider status, and sanitized message. Older codes may only exist in Render logs.</p>
        <form onSubmit={inspectDiagnostic} className="mt-3 flex flex-wrap gap-2"><input value={diagnosticCode} onChange={event=>setDiagnosticCode(event.target.value)} placeholder="Diagnostic code, e.g. abc123def0" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500"/><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950"><Search className="h-3.5 w-3.5"/> Look up</button></form>
        {diagnosticError&&<p className="mt-2 text-xs text-rose-300">{diagnosticError}</p>}
        {diagnostic&&<div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[.05] p-3 text-xs"><div className="font-mono text-rose-100">{diagnostic.requestId}</div><div className="mt-1 text-slate-300">{diagnostic.errorName} · HTTP {diagnostic.statusCode||'unknown'} · {new Date(diagnostic.createdAt).toLocaleString()}</div><p className="mt-2 whitespace-pre-wrap text-slate-400">{diagnostic.message}</p></div>}
      </section>
    </div>
  );
};
