import React, { useState } from 'react';
import { AutoTagRule, AutoTagConditionType, AutoTagColor, SongBadgeType, Song } from '../types';
import { useAudio } from '../context/AudioContext';
import { testRuleMatch, DEFAULT_AUTO_TAG_RULES } from '../utils/autoTagRules';
import {
  Sparkles,
  Flame,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  Clock,
  Tag,
  Zap,
  RotateCcw,
  Play,
  Layers,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';

interface AdminAutoTagRulesProps {
  songs: Song[];
}

export const AdminAutoTagRules: React.FC<AdminAutoTagRulesProps> = ({ songs }) => {
  const {
    autoTagRules,
    updateAutoTagRules,
    createAutoTagRule,
    updateAutoTagRule,
    deleteAutoTagRule,
    resetAutoTagRulesToDefault,
  } = useAudio();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoTagRule | null>(null);

  // Form State
  const [ruleName, setRuleName] = useState('');
  const [ruleDesc, setRuleDesc] = useState('');
  const [conditionType, setConditionType] = useState<AutoTagConditionType>('added_within_hours');
  const [conditionValue, setConditionValue] = useState<string | number>(24);
  const [tagToApply, setTagToApply] = useState('');
  const [badgeType, setBadgeType] = useState<SongBadgeType>('new');
  const [badgeCustomText, setBadgeCustomText] = useState('');
  const [badgeColor, setBadgeColor] = useState<AutoTagColor>('emerald');
  const [durationHours, setDurationHours] = useState<number>(24);
  const [feedback, setFeedback] = useState<string | null>(null);

  const resetForm = () => {
    setRuleName('');
    setRuleDesc('');
    setConditionType('added_within_hours');
    setConditionValue(24);
    setTagToApply('new');
    setBadgeType('new');
    setBadgeCustomText('NEW RELEASE');
    setBadgeColor('emerald');
    setDurationHours(24);
  };

  const openCreateModal = () => {
    resetForm();
    setEditingRule(null);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (rule: AutoTagRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRuleDesc(rule.description || '');
    setConditionType(rule.conditionType);
    setConditionValue(rule.conditionValue);
    setTagToApply(rule.tagToApply);
    setBadgeType(rule.badgeType || 'custom');
    setBadgeCustomText(rule.badgeCustomText || '');
    setBadgeColor(rule.color || 'emerald');
    setDurationHours(rule.durationHours || 24);
    setIsCreateModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !tagToApply.trim()) {
      setFeedback('Rule name and tag are required.');
      return;
    }

    if (editingRule) {
      await updateAutoTagRule(editingRule.id, {
        name: ruleName.trim(),
        description: ruleDesc.trim(),
        conditionType,
        conditionValue,
        tagToApply: tagToApply.trim().toLowerCase(),
        badgeType,
        badgeCustomText: badgeCustomText.trim() || undefined,
        color: badgeColor,
        durationHours: Number(durationHours) || undefined,
      });
      setFeedback(`Rule "${ruleName}" updated successfully!`);
    } else {
      await createAutoTagRule({
        name: ruleName.trim(),
        description: ruleDesc.trim(),
        enabled: true,
        conditionType,
        conditionValue,
        tagToApply: tagToApply.trim().toLowerCase(),
        badgeType,
        badgeCustomText: badgeCustomText.trim() || undefined,
        color: badgeColor,
        durationHours: Number(durationHours) || undefined,
      });
      setFeedback(`New auto-tag rule "${ruleName}" created!`);
    }

    setIsCreateModalOpen(false);
    resetForm();
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleToggleRule = async (rule: AutoTagRule) => {
    await updateAutoTagRule(rule.id, { enabled: !rule.enabled });
  };

  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (confirm(`Delete auto-tag rule "${ruleName}"?`)) {
      await deleteAutoTagRule(ruleId);
      setFeedback(`Rule "${ruleName}" deleted.`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleResetDefaults = async () => {
    if (confirm('Reset all rules back to default presets (1-day New, 1-day Hot, Top Hit, Leaving Soon, Study Vibe)?')) {
      await resetAutoTagRulesToDefault();
      setFeedback('All auto-tagging rules restored to defaults!');
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Color styles
  const colorBadges: Record<AutoTagColor, { bg: string; text: string; border: string }> = {
    emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
    amber: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
    rose: { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30' },
    cyan: { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30' },
    violet: { bg: 'bg-violet-500/15', text: 'text-violet-300', border: 'border-violet-500/30' },
    orange: { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30' },
  };

  const formatConditionSummary = (rule: AutoTagRule) => {
    switch (rule.conditionType) {
      case 'added_within_hours':
        return `Added within ${rule.conditionValue} hour(s) (1 day = 24h)`;
      case 'daily_plays_threshold':
        return `Played ${rule.conditionValue}+ times today (resets at midnight)`;
      case 'weekly_plays_threshold':
        return `Played ${rule.conditionValue}+ times this week (Weekly Top Hit)`;
      case 'total_plays_threshold':
        return `Accumulated ${rule.conditionValue}+ total plays`;
      case 'leaving_within_hours':
        return `Limited edition expires within ${rule.conditionValue} hours`;
      case 'genre_equals':
        return `Genre equals "${rule.conditionValue}"`;
      case 'duration_greater_than':
        return `Duration > ${rule.conditionValue} seconds (${Math.floor(Number(rule.conditionValue) / 60)}m)`;
      case 'duration_less_than':
        return `Duration ≤ ${rule.conditionValue} seconds`;
      case 'tag_contains':
        return `Title, artist, or tags contain "${rule.conditionValue}"`;
      default:
        return 'Custom logic rule';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Header Card */}
      <div className="liquid-glass-surface rounded-3xl p-6 sm:p-7 border border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white font-display flex items-center gap-2">
                  Auto-Tagging Rules Engine
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Live Automation
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure dynamic rules that automatically tag songs (e.g. &quot;New&quot; for 1 day, &quot;Hot&quot; based on daily listens, &quot;Top Hit&quot;).
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-slate-300 font-semibold border border-white/10 transition-colors"
              title="Reset rules to factory defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Rule</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-4 p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {/* Rules List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {autoTagRules.map((rule) => {
          const matchCount = songs.filter((s) => testRuleMatch(s, rule)).length;
          const style = colorBadges[rule.color] || colorBadges.emerald;

          return (
            <div
              key={rule.id}
              className={`relative rounded-3xl p-5 border transition-all ${
                rule.enabled
                  ? 'bg-white/[0.03] border-white/10 hover:border-cyan-400/30'
                  : 'bg-white/[0.01] border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${rule.enabled ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      {rule.name}
                      {!rule.enabled && (
                        <span className="text-[10px] uppercase font-semibold text-slate-500">(Disabled)</span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{rule.description}</p>
                  </div>
                </div>

                {/* On / Off Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleRule(rule)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    rule.enabled ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                  title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      rule.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Condition & Tag Preview */}
              <div className="space-y-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Trigger Condition:</span>
                  </span>
                  <span className="font-semibold text-right max-w-[240px] truncate text-slate-200">
                    {formatConditionSummary(rule)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>Auto-Applied Tag:</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${style.bg} ${style.text} ${style.border}`}>
                      #{rule.tagToApply}
                    </span>
                    {rule.badgeType && rule.badgeType !== 'none' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white font-mono uppercase">
                        Badge: {rule.badgeCustomText || rule.badgeType}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer status & Actions */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5 text-xs">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Currently applies to <strong className="text-white">{matchCount}</strong> song(s)
                  </span>
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(rule)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs"
                    title="Edit Rule"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id, rule.name)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete Rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Rule Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-xl liquid-glass-surface rounded-3xl border border-white/20 p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">
                    {editingRule ? 'Edit Auto-Tag Rule' : 'Create Auto-Tag Rule'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Define an automated condition that applies tags and visual badges to matching songs.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. New Release (24h) or Hot Track"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Brief description of what this rule does"
                  value={ruleDesc}
                  onChange={(e) => setRuleDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Condition Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Condition Type *
                  </label>
                  <select
                    value={conditionType}
                    onChange={(e) => {
                      const ct = e.target.value as AutoTagConditionType;
                      setConditionType(ct);
                      if (ct === 'added_within_hours') setConditionValue(24);
                      else if (ct === 'daily_plays_threshold') setConditionValue(5);
                      else if (ct === 'weekly_plays_threshold') setConditionValue(10);
                      else if (ct === 'total_plays_threshold') setConditionValue(25);
                      else if (ct === 'leaving_within_hours') setConditionValue(48);
                      else if (ct === 'genre_equals') setConditionValue('Lo-Fi');
                      else if (ct === 'duration_greater_than') setConditionValue(300);
                      else if (ct === 'duration_less_than') setConditionValue(120);
                      else if (ct === 'tag_contains') setConditionValue('chill');
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="added_within_hours">Added within X hours (New label)</option>
                    <option value="daily_plays_threshold">Listened X+ times today (Hot label)</option>
                    <option value="weekly_plays_threshold">Listened X+ times this week (Weekly Top Hit)</option>
                    <option value="total_plays_threshold">Total plays reach X (Top Hit)</option>
                    <option value="leaving_within_hours">Limited drop expires within X hours</option>
                    <option value="genre_equals">Genre matches</option>
                    <option value="duration_greater_than">Duration longer than X seconds</option>
                    <option value="duration_less_than">Duration shorter than X seconds</option>
                    <option value="tag_contains">Title / artist / tags contain keyword</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Condition Value *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 24 (hours), 5 (plays), Lo-Fi"
                    value={conditionValue}
                    onChange={(e) => setConditionValue(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400 font-mono"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {conditionType === 'added_within_hours' && 'Number of hours after added (e.g. 24 = 1 day).'}
                    {conditionType === 'daily_plays_threshold' && 'Number of plays required today to trigger Hot label.'}
                    {conditionType === 'total_plays_threshold' && 'Total all-time play count required.'}
                    {conditionType === 'genre_equals' && 'Case-insensitive genre name to match.'}
                  </p>
                </div>
              </div>

              {/* Tag and Badge Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tag to Apply (e.g. &quot;new&quot;, &quot;hot&quot;, &quot;top hit&quot;) *
                  </label>
                  <input
                    type="text"
                    placeholder="Tag slug without #"
                    value={tagToApply}
                    onChange={(e) => setTagToApply(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Badge Color Accent
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    {(['emerald', 'amber', 'rose', 'cyan', 'violet', 'orange'] as AutoTagColor[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBadgeColor(c)}
                        className={`w-7 h-7 rounded-xl border-2 transition-transform ${badgeColor === c ? 'scale-110 ring-2 ring-white/40' : 'opacity-70'} ${
                          c === 'emerald'
                            ? 'bg-emerald-500 border-emerald-300'
                            : c === 'amber'
                            ? 'bg-amber-500 border-amber-300'
                            : c === 'rose'
                            ? 'bg-rose-500 border-rose-300'
                            : c === 'cyan'
                            ? 'bg-cyan-500 border-cyan-300'
                            : c === 'violet'
                            ? 'bg-violet-500 border-violet-300'
                            : 'bg-orange-500 border-orange-300'
                        }`}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Badge Visual Label */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Badge Preset Type
                  </label>
                  <select
                    value={badgeType}
                    onChange={(e) => setBadgeType(e.target.value as SongBadgeType)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="new">NEW (Green badge)</option>
                    <option value="hot">HOT TRACK (Orange flame badge)</option>
                    <option value="top">TOP HIT (Gold badge)</option>
                    <option value="limited">LEAVING SOON (Rose badge)</option>
                    <option value="admin-pick">ADMIN PICK (Purple badge)</option>
                    <option value="custom">Custom Text Badge</option>
                    <option value="none">No Badge (Tag only)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Badge Text Label
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HOT TODAY or NEW RELEASE"
                    value={badgeCustomText}
                    onChange={(e) => setBadgeCustomText(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:border-cyan-400 uppercase font-semibold"
                  />
                </div>
              </div>

              {/* Live Preview Pill */}
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Preview Applied Badge:</span>
                <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider border ${colorBadges[badgeColor]?.bg} ${colorBadges[badgeColor]?.text} ${colorBadges[badgeColor]?.border}`}>
                  #{tagToApply || 'tag'} · {badgeCustomText || badgeType}
                </span>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
                >
                  {editingRule ? 'Save Rule Changes' : 'Create & Activate Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
