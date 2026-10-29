import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Wrench, Lock, Sparkles, Clock, Activity } from 'lucide-react';

interface MaintenanceScreenProps {
  onOpenAdminAuth: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ onOpenAdminAuth }) => {
  const { maintenanceState, setMaintenance } = useAuth();
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
  }>({ hours: 0, minutes: 0, seconds: 0, isPast: false });

  useEffect(() => {
    if (!maintenanceState.hasCountdown || !maintenanceState.estimatedFinishTime) {
      return;
    }

    const updateCountdown = () => {
      const targetTime = new Date(maintenanceState.estimatedFinishTime!).getTime();
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isPast: true });
        // Auto-disable maintenance mode when timer expires if set by admin
        if (maintenanceState.autoDisableOnCountdown && maintenanceState.enabled) {
          setMaintenance(false, 'Maintenance automatically completed.');
        }
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds, isPast: false });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [
    maintenanceState.hasCountdown,
    maintenanceState.estimatedFinishTime,
    maintenanceState.autoDisableOnCountdown,
    maintenanceState.enabled,
    setMaintenance,
  ]);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-[#090d16] text-slate-100">
      {/* Subtle Studio Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-amber-500/[0.04] rounded-full blur-[140px] pointer-events-none" />

      {/* Main Glass Card */}
      <div className="relative z-10 w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl text-center backdrop-blur-xl">
        {/* Top App Version Name */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-blue-300 mb-6">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>YouSong Studio</span>
        </div>

        {/* Center Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-6 shadow-sm">
          <Wrench className="w-8 h-8" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display tracking-tight mb-2">
          Scheduled Maintenance
        </h1>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Audio System Optimization in Progress
        </div>

        {/* Optional Live Countdown Timer */}
        {maintenanceState.hasCountdown && maintenanceState.estimatedFinishTime && (
          <div className="mb-6 p-5 rounded-2xl bg-slate-950/60 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-center gap-1.5 text-xs text-blue-400 font-semibold mb-3">
              <Clock className="w-4 h-4" />
              <span>Estimated Return In:</span>
            </div>

            {timeLeft.isPast ? (
              <div className="text-emerald-400 font-bold text-sm flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Updates finishing up · Streams restarting shortly!
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <div className="flex flex-col items-center">
                  <div className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-2xl sm:text-3xl font-mono font-bold text-blue-300 shadow-sm">
                    {pad(timeLeft.hours)}
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Hours</span>
                </div>
                <span className="text-2xl font-mono text-slate-600 -mt-4">:</span>
                <div className="flex flex-col items-center">
                  <div className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-2xl sm:text-3xl font-mono font-bold text-blue-300 shadow-sm">
                    {pad(timeLeft.minutes)}
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Minutes</span>
                </div>
                <span className="text-2xl font-mono text-slate-600 -mt-4">:</span>
                <div className="flex flex-col items-center">
                  <div className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-2xl sm:text-3xl font-mono font-bold text-blue-300 shadow-sm">
                    {pad(timeLeft.seconds)}
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Seconds</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Custom Message from Admin */}
        <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-sm text-slate-300 max-w-md mx-auto leading-relaxed mb-8">
          {maintenanceState.message || 'We are currently updating our audio servers. Please check back shortly!'}
        </div>

        <a
          href="https://yousound.betteruptime.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 mb-8 -mt-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors"
        >
          <Activity className="w-4 h-4" />
          <span>Check status page</span>
        </a>

        {/* Footer Admin Unlock */}
        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-slate-500">
            Audio stream will resume automatically when completed.
          </span>

          <button
            onClick={onOpenAdminAuth}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all active:scale-95"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Admin Access
          </button>
        </div>
      </div>
    </div>
  );
};
