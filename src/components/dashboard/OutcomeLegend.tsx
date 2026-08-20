// Tiny "?" chip that opens a popover explaining what R / RBS / RBG / W-*
// mean. Lives next to the OutcomeBar on the Dashboard's Last session card
// so a first-time reader can decode the colours without hunting through docs.
import { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { OUTCOMES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const TONE_DOT: Record<'ok' | 'slow' | 'guess' | 'wrong', string> = {
  ok: 'bg-success',
  slow: 'bg-warn',
  guess: 'bg-guess',
  wrong: 'bg-danger'
};

export default function OutcomeLegend() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
          open ? 'bg-bg-overlay text-text' : 'text-text-faint hover:text-text-muted'
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="What do the codes mean?"
      >
        <HelpCircle size={11} strokeWidth={1.75} />
        legend
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Outcome code legend"
          className="native-outcome-legend latency-popover-enter absolute right-0 top-full z-30 mt-1 w-[260px] rounded border border-border bg-bg-raised p-3 shadow-lift"
        >
          <p className="u-label mb-2 text-text-muted">outcome codes</p>
          <ul className="flex flex-col gap-1.5">
            {OUTCOMES.map((o) => (
              <li key={o.code} className="flex items-start gap-2 text-[12px]">
                <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[o.tone])} />
                <div className="min-w-0">
                  <p>
                    <span className="u-num text-text">{o.code}</span>
                    <span className="text-text-muted"> · {o.label}</span>
                  </p>
                  <p className="text-[11px] text-text-faint">{o.hint}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border/60 pt-2 text-[11px] text-text-faint">
            Anything not R schedules a re-attempt at D3.
          </p>
        </div>
      )}
    </div>
  );
}
