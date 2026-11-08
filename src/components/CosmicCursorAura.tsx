import React, { useEffect } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

export const CosmicCursorAura: React.FC = () => {
  const reduced = useReducedMotion();
  const pointerX = useMotionValue(-500);
  const pointerY = useMotionValue(-500);
  const x = useSpring(pointerX, { stiffness: 90, damping: 24, mass: .7 });
  const y = useSpring(pointerY, { stiffness: 90, damping: 24, mass: .7 });

  useEffect(() => {
    if (reduced) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerX.set(event.clientX - 180);
      pointerY.set(event.clientY - 180);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [pointerX, pointerY, reduced]);

  if (reduced) return null;
  return <motion.div className="ys-cosmic-cursor-aura" style={{ x, y }} aria-hidden="true" />;
};
