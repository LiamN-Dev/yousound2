import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import {
  X,
  User as UserIcon,
  KeyRound,
  Shield,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Lock,
  ListMusic,
  Heart,
  Palette,
  Type,
  Contrast,
  Sun,
  Moon,
  Check,
} from 'lucide-react';
import { UserAccentColor } from '../types';
import { useTheme, FontFamily, FontSize } from '../context/ThemeContext';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, changeOwnPassword, logout, isAdmin, setUserAccent } = useAuth();
  const { userPlaylists, userFavorites } = useAudio();
  const {
    theme,
    toggleTheme,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    highContrast,
    toggleHighContrast,
  } = useTheme();

  const [activeTab, setActiveTab] = useState<'profile' | 'appearance'>('profile');

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [accentMsg, setAccentMsg] = useState<string | null>(null);

  if (!isOpen || !currentUser) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentUser?.temporaryPasswordAssigned && !currentPass) {
      setErrorMsg('Please enter your current password.');
      return;
    }

    if (!newPass) {
      setErrorMsg('Please enter your new password.');
      return;
    }

    if (newPass !== confirmPass) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }

    if (newPass.length < 4) {
      setErrorMsg('New password must be at least 4 characters long.');
      return;
    }

    setLoading(true);
    const res = await changeOwnPassword(currentPass, newPass);
    setLoading(false);

    if (res.success) {
      setSuccessMsg('Your password has been updated successfully!');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } else {
      setErrorMsg(res.error || 'Failed to update password.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Modal Top Header (Fixed shrink-0) */}
        <div className="p-5 sm:p-6 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Account Settings
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  @{currentUser.username} · {currentUser.role === 'admin' ? 'Administrator' : 'Student'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              aria-label="Close settings"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sub-Tabs: Clean separation so menus are never too big */}
          <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 mt-4">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'profile'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Profile & Security</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('appearance')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'appearance'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Appearance & Fonts</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body (Always keeps buttons on-screen) */}
        <div className="p-5 sm:p-6 flex-1 overflow-y-auto space-y-4">
          {/* TAB 1: Profile & Password */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Account Stats Strip */}
              <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <ListMusic className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {userPlaylists.length} Playlists
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Created by you</div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {userFavorites.length} Favorites
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Saved tracks</div>
                  </div>
                </div>
              </div>

              {/* Change Password Form (Compact & accessible) */}
              <form id="account-password-form" onSubmit={handleChangePassword} className="space-y-3 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-display">
                  <KeyRound className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Update Password</span>
                </div>

                {errorMsg && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder="At least 4 chars"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Confirm New
                    </label>
                    <input
                      type="password"
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Appearance & Accessibility */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              {/* Theme Mode Card */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Color Theme
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {theme === 'dark' ? 'Dark Studio Mode' : 'Light Clean Mode'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 transition-colors shadow-xs"
                >
                  Switch to {theme === 'dark' ? 'Light' : 'Dark'}
                </button>
              </div>

              {/* Font Family Selection (Compact list) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Type className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Reading Font</span>
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                    Applies Instantly
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: 'lexend' as const, name: 'Lexend', desc: 'Fluency & Clear' },
                    { id: 'jakarta' as const, name: 'Jakarta', desc: 'Modern' },
                    { id: 'inter' as const, name: 'Inter', desc: 'Crisp Neutral' },
                    { id: 'outfit' as const, name: 'Outfit', desc: 'Display' },
                    { id: 'mono' as const, name: 'Mono', desc: 'Monospace' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFontFamily(f.id)}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        fontFamily === f.id
                          ? 'border-blue-500 bg-white dark:bg-blue-600/20 text-blue-700 dark:text-blue-200 shadow-xs ring-1 ring-blue-500/50'
                          : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{f.name}</span>
                        {fontFamily === f.id && <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
                      </div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate">{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Contrast & Scale Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* High Contrast Mode */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Contrast className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        High Contrast
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        WCAG AAA compliance
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleHighContrast}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      highContrast ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        highContrast ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Font Size Scale */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                  <div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Text Size
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {fontSize === 'large' ? 'Large (+8%)' : 'Standard (100%)'}
                    </div>
                  </div>
                  <div className="flex p-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setFontSize('normal')}
                      className={`px-2 py-0.5 text-[10px] rounded font-bold transition-colors ${
                        fontSize === 'normal'
                          ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontSize('large')}
                      className={`px-2 py-0.5 text-[10px] rounded font-bold transition-colors ${
                        fontSize === 'large'
                          ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      108%
                    </button>
                  </div>
                </div>
              </div>

              {/* Personal Color Accent (Compact row) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Palette className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Color Accent</span>
                  </div>
                  {accentMsg && (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                      {accentMsg}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {[
                    { id: 'blue' as const, name: 'Blue', color: 'bg-blue-500' },
                    { id: 'emerald' as const, name: 'Emerald', color: 'bg-emerald-500' },
                    { id: 'violet' as const, name: 'Violet', color: 'bg-violet-500' },
                    { id: 'amber' as const, name: 'Amber', color: 'bg-amber-500' },
                    { id: 'rose' as const, name: 'Rose', color: 'bg-rose-500' },
                    { id: 'cyan' as const, name: 'Cyan', color: 'bg-cyan-500' },
                  ].map((acc) => {
                    const isSelected = (currentUser.colorAccent || 'blue') === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={async () => {
                          await setUserAccent(acc.id);
                          setAccentMsg('✓ Saved');
                          setTimeout(() => setAccentMsg(null), 2000);
                        }}
                        className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-white dark:bg-white/10 ring-2 ring-blue-500 shadow-xs'
                            : 'border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 hover:border-slate-300'
                        }`}
                        title={acc.name}
                      >
                        <span className={`w-4 h-4 rounded-full ${acc.color} shadow-xs`} />
                        <span className="text-[9px] font-semibold text-slate-700 dark:text-slate-300">
                          {acc.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Sticky Bottom Action Bar - Permanently anchored on-screen */}
        <div className="shrink-0 p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 z-10">
          {activeTab === 'profile' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-semibold transition-colors shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="account-password-form"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{loading ? 'Saving Password...' : 'Save Password'}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Appearance preferences are auto-saved</span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98]"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Done & Close</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
