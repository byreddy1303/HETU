import type { CSSProperties } from 'react';
import { cn, secondsToClock, clamp } from '@/lib/utils';

/** Big count-up clock with a hairline progress bar against the target time. */
export default function Timer({
  seconds,
  targetSec,
  className
}: {
  seconds: number;
  targetSec?: number;
  className?: string;
}) {
  const over = targetSec !== undefined && seconds > targetSec;
  const farOver = targetSec !== undefined && seconds > targetSec * 2;
  const pct = targetSec ? clamp((seconds / targetSec) * 100, 0, 100) : 0;
  return (
    <div className={cn('workspace-timer flex flex-col items-center gap-4', className)} style={{ '--timer-progress': `${pct}%` } as CSSProperties}>
      <span
        className={cn(
          'timer-digits u-num text-[56px] leading-none tracking-tight transition-colors duration-700 md:text-[72px]',
          farOver ? 'text-danger' : over ? 'text-warn' : 'text-text'
        )}
      >
        {secondsToClock(seconds)}
      </span>
      {targetSec !== undefined && (
        <div className="flex flex-col items-center gap-1.5">
          <div className="timer-track h-1 w-56 overflow-hidden rounded-full bg-bg-overlay">
            <div
              className={cn(
                'h-full rounded-full transition-[width,background-color] duration-500',
                farOver ? 'bg-danger' : over ? 'bg-warn' : 'bg-success'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="u-label text-text-faint">target {secondsToClock(targetSec)}</span>
        </div>
      )}
    </div>
  );
}
