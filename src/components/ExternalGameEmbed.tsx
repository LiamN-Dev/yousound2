import React from 'react';
import { ArrowLeft, ExternalLink, Gamepad2 } from 'lucide-react';

type Props = {
  title: string;
  url: string;
  controls: string;
  onBack: () => void;
};

export const ExternalGameEmbed: React.FC<Props> = ({ title, url, controls, onBack }) => (
  <div className="mx-auto max-w-6xl space-y-4 pb-24">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#10162a] px-3 py-2 text-xs font-bold text-slate-200">
        <ArrowLeft className="h-4 w-4" /> VIP Arcade
      </button>
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-emerald-100">
        <Gamepad2 className="h-3.5 w-3.5" /> Embedded browser game
      </span>
    </div>
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#090f1c] text-white shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">PLAYING INSIDE YOUSONG</div>
          <h2 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h2>
          <p className="mt-1 text-xs text-slate-400">{controls}</p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-slate-950 transition hover:bg-emerald-200">
          Open game separately <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <div className="bg-black p-1 sm:p-2">
        <div className="relative h-[min(76vh,860px)] min-h-[560px] w-full overflow-hidden rounded-xl bg-[#080d17]">
          <iframe
            src={url}
            title={title + ' embedded browser game'}
            className="absolute inset-0 h-full w-full border-0"
            loading="eager"
            allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
      <div className="border-t border-white/10 bg-white/[.025] px-4 py-3 text-[10px] leading-5 text-slate-400">
        The game runs in an embedded player from its game host. YouSong does not control the host’s availability, ads, save data, or embed policy. If the host changes its embedding rules, the separate launch link remains available.
      </div>
    </section>
  </div>
);
