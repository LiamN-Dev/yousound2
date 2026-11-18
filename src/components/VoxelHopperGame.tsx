import React, { useRef } from 'react';
import { ArrowLeft, Maximize2 } from 'lucide-react';

export const VoxelHopperGame: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back to Arcade
        </button>
        <button type="button" onClick={() => { void frameRef.current?.requestFullscreen?.(); }} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          <Maximize2 className="h-4 w-4" /> Fullscreen
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <iframe
          ref={frameRef}
          title="Voxel Hopper 3D Crossy Road"
          src="/games/voxel-hopper.html"
          className="block h-[calc(100vh-150px)] min-h-[650px] w-full bg-sky-300"
          allow="autoplay; fullscreen"
          allowFullScreen
          loading="eager"
          referrerPolicy="same-origin"
        />
      </div>
    </section>
  );
};
