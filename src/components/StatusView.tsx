import React from 'react';
import { Activity, ExternalLink, ShieldCheck, Signal } from 'lucide-react';

const STATUS_PAGE_URL = 'https://yousound.betteruptime.com/';
const STATUS_BADGE_URL = 'https://yousound.betteruptime.com/badge?theme=dark';

export const StatusView: React.FC = () => (
  <section className="ys-status-page mx-auto max-w-6xl animate-in fade-in">
    <div className="ys-status-heading">
      <div className="flex items-start gap-3">
        <span className="ys-status-icon"><Activity className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">YouSong Status</h1>
            <span className="ys-status-live"><span /> Live service monitor</span>
          </div>
          <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Live availability, active incidents, and maintenance updates for YouSong.
          </p>
        </div>
      </div>
      <div className="ys-status-badge-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Current status</span>
        <iframe
          src={STATUS_BADGE_URL}
          title="Live YouSong status badge"
          width="250"
          height="30"
          frameBorder={0}
          scrolling="no"
          style={{ colorScheme: 'normal' }}
          loading="lazy"
        />
      </div>
    </div>

    <div className="ys-status-frame-card">
      <div className="ys-status-frame-topline">
        <div className="flex items-center gap-2">
          <Signal className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">Service dashboard</span>
        </div>
        <a href={STATUS_PAGE_URL} target="_blank" rel="noopener noreferrer" className="ys-status-open-link">
          Open separately <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <iframe
        src={STATUS_PAGE_URL}
        title="YouSong live service status page"
        className="ys-status-frame"
        width="100%"
        height="820"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <div className="ys-status-frame-fallback">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
        <span className="text-[11px] text-slate-600 dark:text-slate-300">
          If the embedded dashboard is blocked by the status provider or browser, use “Open separately”.
        </span>
      </div>
    </div>
  </section>
);
