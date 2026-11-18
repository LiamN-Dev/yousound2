import React from 'react';
import { ArrowLeft, Maximize2 } from 'lucide-react';

export const VoxelHopperGame: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 pb-24">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to Arcade
      </button>
      <div className="flex items-center gap-2 text-xs text-slate-400"><Maximize2 className="h-3.5 w-3.5" /> Use the game’s own controls to select worlds and characters</div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
      <iframe
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