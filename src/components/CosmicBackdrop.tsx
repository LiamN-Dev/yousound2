import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export const CosmicBackdrop: React.FC = () => {
  const reduced = useReducedMotion();

  return (
    <div className="ys-cosmic-background" aria-hidden="true">
      <div className="ys-cosmic-background-grid" />
      <div className="ys-cosmic-background-scan" />
      <motion.div
        className="ys-bg-nebula ys-bg-nebula-a"
        animate={reduced ? undefined : { x: [0, 38, -22, 0], y: [0, -26, 18, 0], scale: [1, 1.16, .94, 1] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="ys-bg-nebula ys-bg-nebula-b"
        animate={reduced ? undefined : { x: [0, -34, 24, 0], y: [0, 22, -28, 0], scale: [1.04, .92, 1.18, 1.04] }}
        transition={{ duration: 34, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="ys-bg-nebula ys-bg-nebula-c"
        animate={reduced ? undefined : { x: [0, 18, -28, 0], y: [0, 30, -16, 0] }}
        transition={{ duration: 39, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="ys-bg-orbit ys-bg-orbit-a"
        animate={reduced ? undefined : { rotate: 360 }}
        transition={{ duration: 150, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="ys-bg-orbit ys-bg-orbit-b"
        animate={reduced ? undefined : { rotate: -360 }}
        transition={{ duration: 190, repeat: Infinity, ease: 'linear' }}
      />
      <div className="ys-bg-crosshair ys-bg-crosshair-a" />
      <div className="ys-bg-crosshair ys-bg-crosshair-b" />
      <div className="ys-bg-starfield" />
    </div>
  );
};
