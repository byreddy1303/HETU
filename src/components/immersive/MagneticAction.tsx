import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';

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
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <div
      ref={ref}
      className={cn('immersive-magnetic', className)}
      onPointerEnter={(event) => {
        if (reduceMotion || event.pointerType === 'touch') return;
        boundsRef.current = event.currentTarget.getBoundingClientRect();
      }}
      onPointerMove={(event) => {
        if (reduceMotion || event.pointerType === 'touch') return;
        const bounds = boundsRef.current ?? event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left - bounds.width / 2) * strength;
        const y = (event.clientY - bounds.top - bounds.height / 2) * strength;
        event.currentTarget.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }}
      onPointerLeave={(event) => {
        boundsRef.current = null;
        event.currentTarget.style.removeProperty('transform');
      }}
    >
      {children}
    </div>
  );
}
