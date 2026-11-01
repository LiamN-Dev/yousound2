import React from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { EqualizerSettings } from '../context/AudioContext';

interface Props {
  settings: EqualizerSettings;
  onChange: (updates: Partial<EqualizerSettings>) => void;
  onClose: () => void;
}

const PRESETS: Array<{ name: string; values: Omit<EqualizerSettings, 'preset'> }> = [
  { name: 'Default', values: { bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0 } },
  { name: 'Bass Boost', values: { bass: 8, lowMid: 3, mid: 0, highMid: 1, treble: 2 } },
  { name: 'Vocal', values: { bass: -2, lowMid: -1, mid: 3, highMid: 4, treble: 2 } },
  { name: 'Treble Boost', values: { bass: -2, lowMid: 0, mid: 1, highMid: 4, treble: 7 } },
  { name: 'Night', values: { bass: -4, lowMid: 1, mid: 2, highMid: 1, treble: -3 } },
];

const BANDS: Array<{ key: keyof Omit<EqualizerSettings, 'preset'>; label: string }> = [
  { key: 'bass', label: 'Bass' },
  { key: 'lowMid', label: 'Low mid' },
  { key: 'mid', label: 'Mid' },
  { key: 'highMid', label: 'High mid' },
  { key: 'treble', label: 'Treble' },
];

export const EqualizerPanel: React.FC<Props> = ({ settings, onChange, onClose }) => (
  <div className="absolute bottom-12 right-0 z-[70] w-[min(340px,calc(100vw-24px))] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-2xl p-3.5 space-y-3 ys-eq-panel">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
        <SlidersHorizontal className="h-4 w-4 text-blue-500" /> Equalizer
        <span className="text-[10px] font-medium text-slate-500">{settings.preset}</span>
      </div>
      <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close equalizer"><X className="h-4 w-4" /></button>
    </div>
    <div className="grid grid-cols-5 gap-1">
      {PRESETS.map((preset) => (
        <button
          key={preset.name}
          type="button"
          onClick={() => onChange({ preset: preset.name, ...preset.values })}
          className={`rounded-lg px-1 py-2 text-[9px] leading-tight font-semibold border ${settings.preset === preset.name ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
        >{preset.name}</button>
      ))}
    </div>
    <div className="grid grid-cols-5 gap-2 pt-1">
      {BANDS.map((band) => (
        <label key={band.key} className="min-w-0 flex flex-col items-center gap-1.5">
          <span className="text-[9px] text-slate-500 dark:text-slate-400">{band.label}</span>
          <span className="text-[10px] font-mono font-bold text-slate-800 dark:text-slate-100">{settings[band.key] > 0 ? '+' : ''}{settings[band.key]} dB</span>
          <input
            type="range"
            min={-10}
            max={10}
            step={1}
            value={settings[band.key]}
            onChange={(event) => onChange({ preset: 'Custom', [band.key]: Number(event.target.value) })}
            className="ys-eq-range h-24 w-2 accent-blue-600"
            style={{ writingMode: 'vertical-lr', direction: 'rtl' } as React.CSSProperties}
            aria-label={band.label + ' gain'}
          />
        </label>
      ))}
    </div>
    <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">Changes apply to every track on this device and are saved to this account's local player settings.</p>
  </div>
);
