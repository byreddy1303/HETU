import { Lightbulb } from 'lucide-react';
import type { LearningTip } from '@/lib/learning-tips';
import { cn } from '@/lib/utils';

const TONE: Record<LearningTip['tone'], { line: string; icon: string; wash: string }> = {
  accent: { line: 'bg-accent', icon: 'text-accent', wash: 'bg-accent-faint/30' },
  rose: { line: 'bg-ink-rose', icon: 'text-ink-rose', wash: 'bg-ink-rose/5' },
  teal: { line: 'bg-ink-teal', icon: 'text-ink-teal', wash: 'bg-ink-teal/5' },
  marigold: { line: 'bg-ink-marigold', icon: 'text-ink-marigold', wash: 'bg-ink-marigold/5' }
};

export default function LearningTips({ tips }: { tips: LearningTip[] }) {
  const tip = tips[0];
  if (!tip) return null;
  const tone = TONE[tip.tone];

  return (
    <section
      className={cn(
        'native-learning-tips immersive-learning-signal relative overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card',
        tone.wash
      )}
      aria-labelledby="learning-tip-title"
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', tone.line)} aria-hidden />
      <div className="native-learning-tips-content flex gap-3 px-5 py-4 sm:items-center sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-raised shadow-sm">
          <Lightbulb size={17} strokeWidth={1.75} className={tone.icon} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-4">
          <div className="shrink-0">
            <p className="u-label text-text-muted">GATE prep tip · Your evidence</p>
            <h2
              id="learning-tip-title"
              className="mt-1 font-display text-[15px] font-semibold text-text"
            >
              {tip.title}
            </h2>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-text-muted sm:mt-0">{tip.body}</p>
        </div>
      </div>
    </section>
  );
}
