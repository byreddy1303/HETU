import { Lightbulb } from 'lucide-react';
import { contextualGateTipForPath, type GateTipTone } from '@/lib/contextual-gate-tips';
import { cn } from '@/lib/utils';

const TONE: Record<GateTipTone, { line: string; icon: string; wash: string }> = {
  cobalt: { line: 'bg-ink-cobalt', icon: 'text-ink-cobalt', wash: 'bg-ink-cobalt/5' },
  teal: { line: 'bg-ink-teal', icon: 'text-ink-teal', wash: 'bg-ink-teal/5' },
  violet: { line: 'bg-ink-violet', icon: 'text-ink-violet', wash: 'bg-ink-violet/5' },
  rose: { line: 'bg-ink-rose', icon: 'text-ink-rose', wash: 'bg-ink-rose/5' },
  marigold: {
    line: 'bg-ink-marigold',
    icon: 'text-ink-marigold',
    wash: 'bg-ink-marigold/5'
  },
  slate: { line: 'bg-ink-slate', icon: 'text-ink-slate', wash: 'bg-ink-slate/5' }
};

export default function ContextualGateTip({
  pathname,
  className
}: {
  pathname: string;
  className?: string;
}) {
  const tip = contextualGateTipForPath(pathname);
  const tone = TONE[tip.tone];

  return (
    <aside
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card',
        tone.wash,
        className
      )}
      aria-label={`${tip.context} GATE preparation tip`}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', tone.line)} aria-hidden />
      <div className="flex gap-3 px-4 py-3.5 sm:items-center sm:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-raised shadow-sm">
          <Lightbulb size={16} strokeWidth={1.75} className={tone.icon} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-4">
          <div className="shrink-0 sm:max-w-[220px]">
            <p className="u-label text-text-muted">GATE prep tip · {tip.context}</p>
            <p className="mt-1 font-display text-[14px] font-semibold leading-snug text-text">
              {tip.title}
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-text-muted sm:mt-0">{tip.body}</p>
        </div>
      </div>
    </aside>
  );
}
