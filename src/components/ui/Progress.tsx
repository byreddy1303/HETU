import { cn, clamp } from '@/lib/utils';

export function Progress({
  value,
  max = 100,
  tone = 'accent',
  className
}: {
  value: number;
  max?: number;
  tone?: 'accent' | 'success' | 'danger' | 'warn' | 'guess' | 'neutral';
  className?: string;
}) {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  const fill = {
    accent: 'bg-accent',
    success: 'bg-success',
    danger: 'bg-danger',
    warn: 'bg-warn',
    guess: 'bg-guess',
    neutral: 'bg-text-faint'
  }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('u-progress h-1 w-full overflow-hidden rounded-full bg-bg-overlay', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
