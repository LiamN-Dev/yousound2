import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Megaphone, AlertTriangle, Music, X, Check, ShieldAlert, Clock } from 'lucide-react';

export const PopupDisplay: React.FC = () => {
  const { activePopups, dismissPopup, deletePopup } = useAuth();
  const [acknowledged, setAcknowledged] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string | null>(null);

  // Show top active popup
  const currentPopup = activePopups[0];

  useEffect(() => {
    setAcknowledged(false);
  }, [currentPopup?.id]);

  useEffect(() => {
    if (!currentPopup?.expiresAt) {
      setRemainingTime(null);
      return;
    }

    const checkExpiration = () => {
      const exp = new Date(currentPopup.expiresAt!).getTime();
      const diff = exp - Date.now();
      if (diff <= 0) {
        deletePopup(currentPopup.id);
        dismissPopup(currentPopup.id, true);
        setRemainingTime(null);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setRemainingTime(`${mins}:${String(secs).padStart(2, '0')}`);
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 1000);
    return () => clearInterval(interval);
  }, [currentPopup?.id, currentPopup?.expiresAt, dismissPopup]);

  const handleDismissCurrent = useCallback((permanent: boolean = false) => {
    if (activePopups.length > 0) {
      dismissPopup(activePopups[0].id, permanent);
    }
  }, [activePopups, dismissPopup]);

  const handleDismissAll = useCallback(() => {
    activePopups.forEach((p) => dismissPopup(p.id, false));
  }, [activePopups, dismissPopup]);

  // Handle ESC key to dismiss (temporary)
  useEffect(() => {
    if (activePopups.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismissCurrent(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePopups.length, handleDismissCurrent]);

  if (!currentPopup) return null;

  const getIcon = () => {
    switch (currentPopup.type) {
      case 'alert':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'music':
        return <Music className="w-5 h-5 text-blue-500" />;
      default:
        return <Megaphone className="w-5 h-5 text-indigo-500" />;
    }
  };

  return (
    <div
      onClick={() => handleDismissCurrent(false)}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-md animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
      >
        {/* Accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400" />

        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center">
              {getIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-blue-600 dark:text-blue-400 font-mono">
                  Admin Broadcast
                </span>
                {remainingTime && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded-md">
                    <Clock className="w-2.5 h-2.5" />
                    <span>Auto-delete: {remainingTime}</span>
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                {currentPopup.title}
              </h3>
            </div>
          </div>

          <button
            onClick={() => handleDismissCurrent(false)}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            title="Dismiss popup (ESC)"
            aria-label="Dismiss popup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message body */}
        <div className="my-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed max-h-60 overflow-y-auto">
          {(() => {
            const lines = (currentPopup.message || '').split('\n');
            const hasList = lines.some((l) => /^[-*•]\s+/.test(l.trim()));

            if (!hasList) {
              return (
                <div className="whitespace-pre-line text-slate-800 dark:text-slate-200">
                  {currentPopup.message}
                </div>
              );
            }

            return (
              <div className="space-y-1.5">
                {lines.map((line, idx) => {
                  const trimmed = line.trim();
                  if (/^[-*•]\s+/.test(trimmed)) {
                    const cleanText = trimmed.replace(/^[-*•]\s+/, '');
                    return (
                      <div key={idx} className="flex items-start gap-2.5 pl-1 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 mt-1.5 shrink-0 shadow-xs" />
                        <span className="flex-1 font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                          {cleanText}
                        </span>
                      </div>
                    );
                  }
                  if (/^\d+\.\s+/.test(trimmed)) {
                    const match = trimmed.match(/^(\d+)\.\s+(.*)/);
                    return (
                      <div key={idx} className="flex items-start gap-2 pl-1 py-0.5">
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                          {match ? `${match[1]}.` : '•'}
                        </span>
                        <span className="flex-1 font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                          {match ? match[2] : trimmed}
                        </span>
                      </div>
                    );
                  }
                  if (!trimmed) {
                    return <div key={idx} className="h-1.5" />;
                  }
                  return (
                    <p key={idx} className="text-slate-800 dark:text-slate-200 font-normal">
                      {trimmed}
                    </p>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Acknowledgment Option if dismissible by admin */}
        {currentPopup.isDismissible ? (
          <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 my-3">
            <input
              type="checkbox"
              id="ackCheckbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
            />
            <label
              htmlFor="ackCheckbox"
              className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none"
            >
              I acknowledge (Don't show this popup again)
            </label>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 my-3 flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>Mandatory Broadcast · Reappears on refresh until expired or removed.</span>
          </div>
        )}

        {/* Action Button Row */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {activePopups.length > 1 ? (
            <button
              onClick={handleDismissAll}
              className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Close all ({activePopups.length})
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {currentPopup.isDismissible ? 'Acknowledge to permanently dismiss' : 'Press ESC to close'}
            </span>
          )}

          {currentPopup.isDismissible ? (
            <button
              onClick={() => handleDismissCurrent(acknowledged)}
              disabled={!acknowledged}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>OK</span>
            </button>
          ) : (
            <button
              onClick={() => handleDismissCurrent(false)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
