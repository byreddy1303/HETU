import { useId, useState } from 'react';
import { Eye, EyeOff, KeyRound, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import MathText from '@/components/shared/MathText';

export default function AnswerReveal({
  answer,
  onAdd,
  compact = false,
  className
}: {
  answer: string | null | undefined;
  onAdd?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
  const panelId = useId();
  const savedAnswer = answer?.trim() ?? '';
  const revealed = savedAnswer !== '' && revealedAnswer === savedAnswer;

  if (!savedAnswer) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-bg-raised px-3 py-2.5',
          compact && 'rounded-lg px-2 py-1.5',
          className
        )}
      >
        <span className="flex items-center gap-2 text-[12px] text-text-faint">
          <KeyRound size={14} strokeWidth={1.75} />
          No answer saved
        </span>
        {onAdd ? (
          <Button variant="ghost" size="sm" onClick={onAdd}>
            <Plus size={13} strokeWidth={2} className="mr-1" />
            Add answer
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border transition-colors',
        revealed ? 'border-ink-teal/30 bg-ink-teal/5' : 'border-dashed border-border bg-bg-raised',
        className
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 px-3 py-2.5',
          compact && 'px-2 py-1.5'
        )}
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              compact && 'h-6 w-6',
              revealed ? 'bg-ink-teal/10 text-ink-teal' : 'bg-bg-overlay text-text-faint'
            )}
          >
            <KeyRound size={14} strokeWidth={1.75} />
          </span>
          <span>
            <span className="block font-display text-[13px] font-semibold text-text">
              Saved answer
            </span>
            {!compact && !revealed ? (
              <span className="block text-[10.5px] text-text-faint">Concealed for recall</span>
            ) : null}
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRevealedAnswer(revealed ? null : savedAnswer)}
          aria-expanded={revealed}
          aria-controls={panelId}
        >
          {revealed ? (
            <EyeOff size={14} strokeWidth={1.8} className="mr-1.5" />
          ) : (
            <Eye size={14} strokeWidth={1.8} className="mr-1.5" />
          )}
          {revealed ? 'Hide answer' : 'Show answer'}
        </Button>
      </div>
      {revealed ? (
        <div
          id={panelId}
          role="region"
          aria-label="Saved answer"
          className={cn('border-t border-ink-teal/20 px-4 py-3', compact && 'px-3 py-2')}
        >
          <MathText
            display
            className={cn(
              'whitespace-pre-wrap text-[13.5px] leading-[1.75] text-text',
              compact && 'text-[12.5px]'
            )}
          >
            {savedAnswer}
          </MathText>
        </div>
      ) : null}
    </section>
  );
}
