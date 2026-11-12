import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, X } from 'lucide-react';

type AnsweredQuestion = { id: string; question: string; answer?: string; status: string; reviewedAt?: string; createdAt: string };

export const AIAnswerNotifier: React.FC<{ enabled: boolean; onOpenAI: () => void }> = ({ enabled, onOpenAI }) => {
  const [item, setItem] = useState<AnsweredQuestion | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled) { setItem(null); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch('/api/ai/knowledge-requests/mine', { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !Array.isArray(data.requests) || cancelled) return;
        const answered = (data.requests as AnsweredQuestion[])
          .filter(entry => entry.status === 'answered' && entry.answer)
          .sort((a,b) => new Date(b.reviewedAt || b.createdAt).getTime() - new Date(a.reviewedAt || a.createdAt).getTime());
        if (!answered.length) return;
        const seenKey = 'yousound_ai_answer_seen_' + answered[0].id.split('_')[0];
        const seen = JSON.parse(localStorage.getItem(seenKey) || '[]') as string[];
        const fresh = answered.find(entry => !seen.includes(entry.id));
        if (fresh) { setItem(fresh); setChecked(true); }
      } catch { /* A notification outage must not disrupt the rest of the site. */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 20000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [enabled]);

  const markSeen = () => {
    if (!item) return;
    try {
      const seenKey = 'yousound_ai_answer_seen_' + item.id.split('_')[0];
      const seen = JSON.parse(localStorage.getItem(seenKey) || '[]') as string[];
      localStorage.setItem(seenKey, JSON.stringify(Array.from(new Set([...seen, item.id])).slice(-100)));
    } catch { /* Ignore local notification-state failures. */ }
    setItem(null);
  };

  if (!enabled || !item || !checked) return null;
  return (
    <div className="fixed bottom-24 right-4 z-[90] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-emerald-300/25 bg-[#091521] text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-black text-emerald-100"><Bell className="h-4 w-4" /> An administrator replied</div>
        <button type="button" onClick={markSeen} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
      </div>
      <div className="p-4">
        <p className="line-clamp-2 text-[10px] text-slate-400">Your question: {item.question}</p>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-emerald-50">{item.answer}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Private reply</span>
          <button type="button" onClick={() => { markSeen(); onOpenAI(); }} className="rounded-lg bg-emerald-200 px-3 py-2 text-[10px] font-black text-slate-950 hover:bg-emerald-100">Open YouSound AI</button>
        </div>
      </div>
    </div>
  );
};
