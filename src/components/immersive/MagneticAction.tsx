import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';

export default function MagneticAction({
  children,
  className,
  strength = 0.16
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const boundsRef = useRef<DOMRect | null>(null);
  const reduceMotion = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 320, damping: 24, mass: 0.32 });
  const y = useSpring(rawY, { stiffness: 320, damping: 24, mass: 0.32 });

  return (
    <motion.div
      ref={ref}
      className={cn('immersive-magnetic', className)}
      style={reduceMotion ? undefined : { x, y }}
      onPointerEnter={(event) => {
        if (reduceMotion || event.pointerType === 'touch') return;
        boundsRef.current = event.currentTarget.getBoundingClientRect();
      }}
      onPointerMove={(event) => {
        if (reduceMotion || event.pointerType === 'touch') return;
        const bounds = boundsRef.current ?? event.currentTarget.getBoundingClientRect();
        rawX.set((event.clientX - bounds.left - bounds.width / 2) * strength);
        rawY.set((event.clientY - bounds.top - bounds.height / 2) * strength);
      }}
      onPointerLeave={() => {
        boundsRef.current = null;
        rawX.set(0);
        rawY.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
