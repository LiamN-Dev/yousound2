import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  LogOut,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const TemporaryPasswordModal: React.FC = () => {
  const { currentUser, changeOwnPassword, logout } = useAuth();

  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!currentUser?.temporaryPasswordAssigned) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanNew = newPass.trim();
    const cleanConfirm = confirmPass.trim();

    if (!cleanNew) {
      setErrorMsg('Please enter a new password.');
      return;
    }

    if (cleanNew.length < 4) {
      setErrorMsg('New password must be at least 4 characters long.');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setErrorMsg('The new password and confirmation password do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await changeOwnPassword(currentPass.trim(), cleanNew);
      if (res.success) {
        setSuccessMsg('Password updated successfully! Unlocking your account...');
        // State updates will naturally unmount the modal, but clear fields for cleanliness
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
      } else {
        setErrorMsg(res.error || 'Failed to update password. Please check your inputs and try again.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred while updating your password.');
    } finally {
      setLoading(false);
    }
  };

  const isMatching = newPass.length > 0 && confirmPass.length > 0 && newPass === confirmPass;
  const isLengthValid = newPass.length >= 4;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 text-slate-900 dark:text-white">
        {/* Top Header Badge */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 mx-auto shadow-lg shadow-amber-500/10">
            <KeyRound className="w-7 h-7" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px] font-semibold mb-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Action Required
            </div>
            <h3 className="text-lg font-bold font-display text-slate-900 dark:text-white">
              Temporary Passcode Active
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Signed in as <span className="font-semibold text-slate-900 dark:text-white">@{currentUser.username}</span>
            </p>
          </div>
        </div>

        {/* Notice Info Box */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
          An administrator has assigned you a temporary passcode. Please set your new permanent password below to secure your account and access all features.
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Optional Current Temporary Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Current Temporary Password <span className="text-[10px] text-slate-400 font-normal">(Optional if already logged in)</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPass ? 'text' : 'password'}
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="Enter temporary password if known"
                className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 transition-colors"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                aria-label="Toggle password visibility"
              >
                {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                New Password <span className="text-amber-500">*</span>
              </label>
              {newPass.length > 0 && (
                <span
                  className={`text-[10px] font-medium ${
                    isLengthValid ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {isLengthValid ? '✓ Minimum length met' : 'Min. 4 characters'}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showNewPass ? 'text' : 'password'}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="Choose a secure permanent password"
                required
                className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                aria-label="Toggle password visibility"
              >
                {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Confirm New Password <span className="text-amber-500">*</span>
              </label>
              {confirmPass.length > 0 && (
                <span
                  className={`text-[10px] font-medium ${
                    isMatching ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {isMatching ? '✓ Passwords match' : 'Passwords do not match'}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showConfirmPass ? 'text' : 'password'}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Re-enter your new permanent password"
                required
                className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowConfirmPass(!showConfirmPass)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                aria-label="Toggle password visibility"
              >
                {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={loading || !newPass || !confirmPass || !isLengthValid || !isMatching}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Saving Password...</span>
              ) : (
                <>
                  <span>Change Password & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Logout alternative button */}
            <button
              type="button"
              onClick={logout}
              className="w-full py-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out Instead</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
