/**
 * Procedural Web Audio Synth & Tone Generator
 * Provides school-safe, zero-external-dependency audio synthesis for ambient,
 * lo-fi chords, synthwave bass, and chill beats.
 */

// Helper to create a WAV Data URI from generated audio buffer
export function generateToneWavUrl(frequency: number = 440, durationSeconds: number = 8, type: 'lofi' | 'synthwave' | 'ambient' | 'chill' = 'lofi'): string {
  const sampleRate = 22050;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new Float32Array(numSamples);

  // Generate musical progression depending on type
  if (type === 'lofi') {
    // Jazzy 7th chord progression arpeggiated with soft vinyl flutter
    const chords = [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00], // Am7
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [196.00, 246.94, 293.66, 349.23], // G7
    ];
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const chordIdx = Math.floor((t / (durationSeconds / 4))) % 4;
      const currentChord = chords[chordIdx];
      let sample = 0;
      currentChord.forEach((noteFreq, idx) => {
        // Soft sine wave with slight detuning and warmth
        const detune = 1 + (idx * 0.002) * Math.sin(t * 2);
        const env = Math.sin((t % 2) / 2 * Math.PI);
        sample += 0.15 * Math.sin(2 * Math.PI * noteFreq * detune * t) * env;
      });
      // Soft vinyl crackle simulation
      const noise = (Math.random() - 0.5) * 0.012;
      buffer[i] = Math.max(-1, Math.min(1, sample + noise));
    }
  } else if (type === 'synthwave') {
    // Driving retro bassline + arpeggio
    const bassNotes = [110, 110, 130.81, 146.83]; // A, C, D
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const beat = Math.floor(t * 4) % 4;
      const bassFreq = bassNotes[beat];
      // Sawtooth-like bass
      const saw = 2 * ((t * bassFreq) % 1) - 1;
      const lead = Math.sin(2 * Math.PI * bassFreq * 4 * t);
      buffer[i] = (saw * 0.2 + lead * 0.1) * Math.min(1, Math.sin(t * Math.PI / durationSeconds));
    }
  } else if (type === 'ambient') {
    // Dreamy ambient crystal pad
    const freqs = [174.61, 220.0, 261.63, 329.63, 392.0, 523.25];
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      freqs.forEach((f, idx) => {
        const lfo = Math.sin(t * (0.2 + idx * 0.05));
        sample += Math.sin(2 * Math.PI * f * t) * (0.08 + 0.04 * lfo);
      });
      buffer[i] = sample;
    }
  } else {
    // Chill guitar / chime chords
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const note = [440, 493.88, 554.37, 659.25][Math.floor(t * 2) % 4];
      buffer[i] = 0.25 * Math.sin(2 * Math.PI * note * t) * Math.exp(-((t % 0.5) * 3));
    }
  }

  return float32ToWavDataUri(buffer, sampleRate);
}

function float32ToWavDataUri(samples: Float32Array, sampleRate: number): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF identifier
  writeString(0, 'RIFF');
  // file length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(8, 'WAVE');
  // format chunk identifier
  writeString(12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count (1 = mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(36, 'data');
  // data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}
