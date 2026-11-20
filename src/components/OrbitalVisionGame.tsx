import React, { useRef } from 'react';
import { ArrowLeft, Maximize2, Orbit } from 'lucide-react';

export const OrbitalVisionGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-300/15 bg-slate-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /> Arcade</button>
          <div><div className="flex items-center gap-2 text-sm font-black text-white"><Orbit className="h-4 w-4 text-sky-300" /> OrbitalVision 3D</div><p className="mt-0.5 text-[10px] text-slate-500">Live Earth and space-object mission control</p></div>
        </div>
        <button type="button" onClick={() => void frameRef.current?.requestFullscreen?.()} className="inline-flex items-center gap-2 rounded-xl bg-sky-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-sky-200"><Maximize2 className="h-4 w-4" /> Fullscreen</button>
      </header>
      <iframe ref={frameRef} title="OrbitalVision 3D Live Earth and Space Objects Visualizer" src="/games/orbitalvision-3d.html" className="h-[calc(100vh-150px)] min-h-[640px] w-full rounded-2xl border border-sky-300/15 bg-[#02040a]" allow="fullscreen" allowFullScreen />
    </section>
  );
};
