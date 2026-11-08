import React, { useMemo, useState } from 'react';
import { Gamepad2, Palette, Search, Snowflake, Sparkles } from 'lucide-react';
import type { User } from '../types';

type BetaKey = 'aiBetaEnabled' | 'redesignBetaEnabled' | 'gamesEnabled' | 'christmasMode';
type BetaUpdate = Partial<Record<BetaKey, boolean>>;
type Props = {
  users: User[];
  onUpdateUser: (userId: string, updates: BetaUpdate) => Promise<{ success: boolean; error?: string }>;
};

const features: Array<{ key: BetaKey; title: string; description: string; icon: React.ReactNode }> = [
  { key: 'aiBetaEnabled', title: 'YouSound AI', description: 'AI music discovery assistant', icon: <Sparkles className="h-4 w-4" /> },
  { key: 'redesignBetaEnabled', title: 'Cosmic redesign', description: 'New navigation and page layouts', icon: <Palette className="h-4 w-4" /> },
  { key: 'gamesEnabled', title: 'VIP Games', description: 'Crossy Road and the YouSound game collection', icon: <Gamepad2 className="h-4 w-4" /> },
  { key: 'christmasMode', title: 'Christmas Mode', description: 'Seasonal interface effects for selected accounts', icon: <Snowflake className="h-4 w-4" /> },
];

export const AdminBetaAccess: React.FC<Props> = ({ users, onUpdateUser }) => {
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const members = useMemo(() => users.filter(user => user.role !== 'admin' && (!query.trim() || user.username.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => a.username.localeCompare(b.username)), [users, query]);
  const counts = useMemo(() => ({
    aiBetaEnabled: users.filter(user => user.role !== 'admin' && user.aiBetaEnabled).length,
    redesignBetaEnabled: users.filter(user => user.role !== 'admin' && user.redesignBetaEnabled).length,
    gamesEnabled: users.filter(user => user.role !== 'admin' && user.gamesEnabled).length,
    christmasMode: users.filter(user => user.role !== 'admin' && user.christmasMode).length,
  }), [users]);

  const toggle = async (user: User, key: BetaKey) => {
    const actionKey = user.id + ':' + key;
    if (busyKey) return;
    const enabled = user[key] !== true;
    setBusyKey(actionKey);
    setFeedback('');
    try {
      const result = await onUpdateUser(user.id, { [key]: enabled } as BetaUpdate);
      if (!result.success) throw new Error(result.error || 'Access update failed.');
      setFeedback(user.username + ': ' + features.find(feature => feature.key === key)?.title + ' ' + (enabled ? 'enabled' : 'disabled') + '.');
    } catch (error: any) {
      setFeedback(error?.message || 'Could not update beta access.');
    } finally {
      setBusyKey('');
    }
  };

  return (
    <section className="space-y-5 animate-in fade-in">
      <div className="rounded-3xl border border-cyan-200/15 bg-gradient-to-br from-[#0c1d2a] via-[#111827] to-[#17162d] p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-cyan-200"><Sparkles className="h-4 w-4" /> Controlled rollout</div>
            <h2 className="mt-2 text-2xl font-black">Beta access</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">Choose exactly which accounts can preview YouSound AI, the redesigned interface, and VIP Games. These switches update each account immediately. Administrators always retain access.</p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-[10px] font-bold text-slate-200">{members.length} matching accounts</span>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {features.map(feature => (
            <div key={feature.key} className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2 text-xs font-black text-white">{feature.icon}{feature.title}</div>
              <p className="mt-1 text-[10px] text-slate-400">{feature.description}</p>
              <p className="mt-3 text-lg font-black tabular-nums text-cyan-100">{counts[feature.key]}</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">enabled accounts</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111827] px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-slate-500" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search accounts…" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500" />
      </div>
      {feedback && <div className="rounded-xl border border-cyan-200/15 bg-cyan-200/[.06] px-4 py-3 text-xs text-cyan-100">{feedback}</div>}
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d1521]">
        <div className="grid grid-cols-[minmax(120px,1fr)_repeat(4,minmax(88px,108px))] gap-2 border-b border-white/10 bg-white/[.025] px-4 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 sm:px-5">
          <span>Account</span><span>AI Beta</span><span>New Design</span><span>Games</span><span>Christmas</span>
        </div>
        {members.map(user => (
          <div key={user.id} className="grid grid-cols-[minmax(120px,1fr)_repeat(4,minmax(88px,108px))] items-center gap-2 border-b border-white/5 px-4 py-3 last:border-0 sm:px-5">
            <div className="min-w-0"><div className="truncate text-xs font-bold text-white">@{user.username}</div><div className="mt-0.5 text-[9px] text-slate-500">{user.isApproved ? 'Approved account' : 'Awaiting approval'}</div></div>
            {features.map(feature => {
              const active = user[feature.key] === true;
              const actionKey = user.id + ':' + feature.key;
              return <button key={feature.key} type="button" role="switch" aria-checked={active} disabled={!!busyKey} onClick={() => void toggle(user, feature.key)} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.025] px-2 py-2.5 text-[9px] font-bold text-slate-300 transition hover:bg-white/[.06] disabled:opacity-40" title={(active ? 'Disable ' : 'Enable ') + feature.title + ' for @' + user.username}>
                <span className={'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ' + (active ? 'bg-emerald-400' : 'bg-slate-700')}><span className={'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ' + (active ? 'translate-x-[18px]' : 'translate-x-1')} /></span>
                <span>{busyKey === actionKey ? 'Saving' : active ? 'On' : 'Off'}</span>
              </button>;
            })}
          </div>
        ))}
        {!members.length && <div className="p-8 text-center text-xs text-slate-500">No matching member accounts.</div>}
      </div>
      <p className="text-[10px] leading-5 text-slate-500">Turning a feature off removes access on the next account refresh. This does not publish or launch beta features to everyone.</p>
    </section>
  );
};
