import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warn' | 'guess';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-bg-overlay text-text-muted',
  accent: 'bg-accent-faint text-accent',
  success: 'bg-success-faint text-success',
  danger: 'bg-danger-faint text-danger',
  warn: 'bg-warn-faint text-warn',
  guess: 'bg-guess-faint text-guess'
};

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'u-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'font-mono text-[11px] font-medium uppercase tracking-[0.08em]',
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
