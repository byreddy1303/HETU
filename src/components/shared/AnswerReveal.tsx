import { useId, useState } from 'react';
import { Eye, EyeOff, KeyRound, Plus } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/motion';
import { Button } from '@/components/ui/Button';

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
  const reduceMotion = useReducedMotion();
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
    <motion.section
      layout={!reduceMotion}
      transition={{
        layout: {
          duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.content,
          ease: MOTION_EASE
        }
      }}
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
          <motion.span
            animate={
              reduceMotion ? undefined : { rotate: revealed ? -7 : 0, scale: revealed ? 1.04 : 1 }
            }
            transition={{ duration: MOTION_DURATION.control, ease: MOTION_EASE }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              compact && 'h-6 w-6',
              revealed ? 'bg-ink-teal/10 text-ink-teal' : 'bg-bg-overlay text-text-faint'
            )}
          >
            <KeyRound size={14} strokeWidth={1.75} />
          </motion.span>
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
          <span className="relative mr-1.5 inline-grid h-3.5 w-3.5" aria-hidden>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={revealed ? 'hide' : 'show'}
                className="col-start-1 row-start-1 inline-flex"
                initial={reduceMotion ? false : { opacity: 0, rotate: -35, scale: 0.72 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 35, scale: 0.72 }}
                transition={{
                  duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.control,
                  ease: MOTION_EASE
                }}
              >
                {revealed ? (
                  <EyeOff size={14} strokeWidth={1.8} />
                ) : (
                  <Eye size={14} strokeWidth={1.8} />
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          {revealed ? 'Hide answer' : 'Show answer'}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {revealed ? (
          <motion.div
            id={panelId}
            role="region"
            aria-label="Saved answer"
            className="overflow-hidden border-t border-ink-teal/20"
            initial={reduceMotion ? false : { height: 0, opacity: 0, filter: 'blur(3px)' }}
            animate={{ height: 'auto', opacity: 1, filter: 'blur(0px)' }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { height: 0, opacity: 0, filter: 'blur(2px)', transition: { duration: 0.16 } }
            }
            transition={{
              duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.content,
              ease: MOTION_EASE
            }}
          >
            <div className={cn('px-4 py-3', compact && 'px-3 py-2')}>
              <p
                className={cn(
                  'whitespace-pre-wrap text-[13.5px] leading-[1.75] text-text',
                  compact && 'text-[12.5px]'
                )}
              >
                {savedAnswer}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}
