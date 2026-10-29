import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Clock, RefreshCw, LogOut, Sun, Moon, Shield, CheckCircle2 } from 'lucide-react';

export const PendingApprovalScreen: React.FC = () => {
  const { currentUser, logout, checkUserApproval } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isApprovedSuccess, setIsApprovedSuccess] = useState(false);

  // Auto-poll approval status every 2 seconds so user transitions automatically with zero manual refresh
  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const updated = await checkUserApproval(currentUser.id);
        if (updated?.isApproved && isMounted) {
          setIsApprovedSuccess(true);
          setStatusMessage('Account approved! Entering YouSong...');
        }
      } catch {}
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser, checkUserApproval]);

  const handleCheckStatus = async () => {
    if (!currentUser) return;
    setChecking(true);
    setStatusMessage(null);
    try {
      const updated = await checkUserApproval(currentUser.id);
      if (updated?.isApproved) {
        setIsApprovedSuccess(true);
        setStatusMessage('Account approved! Loading your music hub...');
      } else {
        setStatusMessage('Your account is still awaiting administrator approval. We are checking automatically.');
      }
    } catch {
      setStatusMessage('Unable to check status right now. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 z-20">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 shadow-sm transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-10 shadow-xl dark:shadow-2xl text-center">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm transition-colors ${
          isApprovedSuccess
            ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            : 'bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 dark:border-amber-500/30 text-amber-600 dark:text-amber-400'
        }`}>
          {isApprovedSuccess ? <CheckCircle2 className="w-8 h-8 animate-bounce" /> : <Clock className="w-8 h-8" />}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display mb-1">
          {isApprovedSuccess ? 'Account Approved!' : 'Account Pending Approval'}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
          Hello <strong className="text-slate-800 dark:text-slate-200 font-semibold">{currentUser?.username}</strong>, your account has been registered.
        </p>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 text-left space-y-2 mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Shield className="w-4 h-4 text-amber-500" />
            <span>Manual Admin Approval Required</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            All member accounts must be approved by an administrator before accessing audio streams and playlists. No need to reload this page — when approved, YouSong opens automatically!
          </p>
          {currentUser?.note && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Your Submitted Note:</span> "{currentUser.note}"
            </div>
          )}
          {currentUser?.adminNote && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-rose-600 dark:text-rose-400">
              <span className="font-bold">Message from Administrator:</span> "{currentUser.adminNote}"
            </div>
          )}
        </div>

        {statusMessage && (
          <div className={`mb-6 p-3 rounded-xl border text-xs flex items-center justify-center gap-2 ${
            isApprovedSuccess
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300 font-semibold'
              : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25 text-blue-700 dark:text-blue-300'
          }`}>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleCheckStatus}
            disabled={checking || isApprovedSuccess}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Checking...' : 'Check Approval Status'}</span>
          </button>

          <button
            onClick={logout}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs border border-slate-200 dark:border-slate-700 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
