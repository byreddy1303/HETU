// 5-step tag pipeline (F2.2, extended): Source → Outcome → Pattern → Trigger → Root Cause.
// Keyboard-first; root cause is skipped when the outcome is R.
// Source records subject/kind/year/set/image/marks so questions can be looked up
// and time targets can be pegged to 1-mark (~90s) vs 2-mark (~180s).
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import type { Outcome, PatternRow, RootCause } from '@/types';
import { OUTCOME_BY_CODE } from '@/lib/constants';
import { cn, secondsToClock } from '@/lib/utils';

import SourceStep from '@/components/tags/SourceStep';
import { makeInitialSource, type SourceDraft } from '@/components/tags/sourceDraft';
import OutcomeStep from '@/components/tags/OutcomeStep';
import PatternStep from '@/components/tags/PatternStep';
import TriggerStep from '@/components/tags/TriggerStep';
import RootCauseStep from '@/components/tags/RootCauseStep';
import { haptic, isNativeApp } from '@/lib/native';
import { Button } from '@/components/ui/Button';
import MissingTagsConfirm from '@/components/shared/MissingTagsConfirm';
import { needsMissingTagsConfirmation } from '@/lib/questionTags';

export interface TagDraft {
  source: SourceDraft;
  outcome: Outcome;
  pattern_name: string | null;
  trigger_sentence: string | null;
  root_cause: RootCause | null;
}

type Step = 'source' | 'outcome' | 'pattern' | 'trigger' | 'cause';

const STEP_LABELS: { id: Step; label: string }[] = [
  { id: 'source', label: 'source' },
  { id: 'outcome', label: 'outcome' },
  { id: 'pattern', label: 'pattern' },
  { id: 'trigger', label: 'trigger' },
  { id: 'cause', label: 'cause' }
];

const ADVANCE_FLASH_MS = 110;

const TONE_TEXT: Record<'ok' | 'slow' | 'guess' | 'wrong', string> = {
  ok: 'text-success',
  slow: 'text-warn',
  guess: 'text-guess',
  wrong: 'text-danger'
};

const stepVariants = {
  enter: (d: number) => ({ opacity: 0, x: 28 * d }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: -22 * d, transition: { duration: 0.12 } })
};

export default function TagFlow({
  subject,
  patterns,
  questionLabel,
  timeSpentSec,
  initialSource,
  sourceLocked = false,
  onSave,
  onCancel
}: {
  subject: string;
  patterns: PatternRow[];
  questionLabel: string;
  timeSpentSec: number;
  initialSource?: SourceDraft;
  /** Bank questions already have authoritative source metadata. */
  sourceLocked?: boolean;
  onSave: (draft: TagDraft) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>(sourceLocked ? 'outcome' : 'source');
  const [source, setSource] = useState<SourceDraft>(
    () => initialSource ?? makeInitialSource(subject)
  );
  const [outcome, setOutcome] = useState<Outcome>();
  const [pattern, setPattern] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<string | null>(null);
  const [cause, setCause] = useState<RootCause>();
  const [saving, setSaving] = useState(false);
  const [pendingUntagged, setPendingUntagged] = useState<Omit<TagDraft, 'source'> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>();
  const dir = useRef(1);

  const steps = STEP_LABELS.filter(
    (s) => (!sourceLocked || s.id !== 'source') && (s.id !== 'cause' || outcome !== 'R')
  );

  function go(next: Step, d: 1 | -1) {
    clearTimeout(advanceTimer.current);
    dir.current = d;
    setStep(next);
  }

  async function persist(draft: Omit<TagDraft, 'source'>) {
    setSaving(true);
    try {
      await onSave({ source, ...draft });
    } finally {
      setSaving(false);
    }
  }

  function finalize(draft: Omit<TagDraft, 'source'>) {
    if (needsMissingTagsConfirmation(draft.pattern_name, draft.trigger_sentence)) {
      setPendingUntagged(draft);
      return;
    }
    void persist(draft);
  }

  function submitSource(next: SourceDraft) {
    setSource(next);
    go('outcome', 1);
  }

  function pickOutcome(o: Outcome) {
    if (saving) return;
    setOutcome(o);
    clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => go('pattern', 1), ADVANCE_FLASH_MS);
  }

  function submitPattern(name: string | null) {
    setPattern(name);
    go('trigger', 1);
  }

  function submitTrigger(text: string | null) {
    setTrigger(text);
    if (outcome === 'R') {
      finalize({
        outcome,
        pattern_name: pattern,
        trigger_sentence: text,
        root_cause: null
      });
    } else {
      go('cause', 1);
    }
  }

  function pickCause(rc: RootCause) {
    if (saving || !outcome) return;
    setCause(rc);
    finalize({
      outcome,
      pattern_name: pattern,
      trigger_sentence: trigger,
      root_cause: rc
    });
  }

  const activeIdx = steps.findIndex((s) => s.id === step);
  const activeLabel = steps[activeIdx]?.label ?? '';
  const previousStep = activeIdx > 0 ? steps[activeIdx - 1] : null;

  function goBack() {
    if (pendingUntagged) {
      setPendingUntagged(null);
      return;
    }
    if (previousStep) {
      haptic('selection');
      go(previousStep.id, -1);
    } else {
      onCancel();
    }
  }

  useEffect(() => {
    if (!isNativeApp) return;
    const onNativeBack = (event: Event) => {
      event.preventDefault();
      goBack();
    };
    window.addEventListener('air:native-back', onNativeBack);
    return () => window.removeEventListener('air:native-back', onNativeBack);
  });

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  return (
    <div className="native-tag-flow flex flex-col gap-5" data-testid="tag-flow">
      {isNativeApp ? (
        <div className="native-tag-header border-b border-border pb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="u-label">
                Step {activeIdx + 1} of {steps.length}
              </p>
              <p className="mt-1 font-display text-[20px] font-semibold capitalize text-text">
                {activeLabel}
              </p>
            </div>
            <span className="u-num text-right text-[12px] leading-relaxed text-text-muted">
              {questionLabel}
              <br />
              {secondsToClock(timeSpentSec)}
            </span>
          </div>
          <ol className="mt-4 flex gap-1.5" aria-label="Tagging progress">
            {steps.map((item, index) => (
              <li key={item.id} className="flex-1">
                <button
                  type="button"
                  disabled={index >= activeIdx}
                  onClick={() => {
                    haptic('selection');
                    go(item.id, -1);
                  }}
                  className={cn(
                    'block h-5 w-full rounded-full p-0 transition-colors',
                    index < activeIdx ? 'cursor-pointer' : 'cursor-default'
                  )}
                  aria-label={`${item.label}${index === activeIdx ? ', current step' : index < activeIdx ? ', edit step' : ''}`}
                >
                  <span
                    className={cn(
                      'mx-auto block h-1.5 w-full rounded-full transition-colors',
                      index <= activeIdx ? 'bg-accent' : 'bg-border'
                    )}
                  />
                </button>
              </li>
            ))}
          </ol>
          <div className="native-tag-step-nav mt-3 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft size={15} strokeWidth={1.8} className="mr-1.5" />
              {previousStep ? `Back to ${previousStep.label}` : 'Back to question'}
            </Button>
            {activeIdx > 1 && (
              <span className="text-right text-[11px] leading-relaxed text-text-faint">
                Tap an earlier bar to edit
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <ol className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn('h-px w-3', i <= activeIdx ? 'bg-accent/40' : 'bg-border')}
                  />
                )}
                <span
                  className={cn(
                    'flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-150',
                    i === activeIdx
                      ? 'bg-accent text-white'
                      : i < activeIdx
                        ? 'bg-accent-faint text-accent'
                        : 'bg-bg-overlay text-text-faint'
                  )}
                >
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
          <span className="u-num text-[12px] text-text-muted">
            {questionLabel} · {secondsToClock(timeSpentSec)}
            {outcome && (
              <span className={cn('ml-2 font-semibold', TONE_TEXT[OUTCOME_BY_CODE[outcome].tone])}>
                {OUTCOME_BY_CODE[outcome].code}
              </span>
            )}
          </span>
        </div>
      )}

      <div className="overflow-x-clip">
        <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
          <motion.div
            key={step}
            custom={dir.current}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 480, damping: 38 }}
          >
            {step === 'source' && (
              <SourceStep initial={source} onSubmit={submitSource} onCancel={onCancel} />
            )}
            {step === 'outcome' && (
              <OutcomeStep
                selected={outcome}
                onSelect={pickOutcome}
                onCancel={() => (sourceLocked ? onCancel() : go('source', -1))}
              />
            )}
            {step === 'pattern' && (
              <PatternStep
                subject={source.subject}
                patterns={patterns}
                initial={pattern}
                onSubmit={submitPattern}
                onBack={() => go('outcome', -1)}
              />
            )}
            {step === 'trigger' && (
              <TriggerStep
                initial={trigger}
                onSubmit={submitTrigger}
                onBack={() => go('pattern', -1)}
              />
            )}
            {step === 'cause' && (
              <RootCauseStep
                selected={cause}
                onSelect={pickCause}
                onBack={() => go('trigger', -1)}
                enabled={!pendingUntagged}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="u-label text-text-faint">
        {saving
          ? 'saving…'
          : isNativeApp
            ? 'saves locally first'
            : 'esc goes back · this should take under 30 seconds'}
      </p>

      <MissingTagsConfirm
        open={!!pendingUntagged}
        saving={saving}
        onGoBack={() => {
          setPendingUntagged(null);
          go('pattern', -1);
        }}
        onConfirm={() => {
          const draft = pendingUntagged;
          if (!draft) return;
          setPendingUntagged(null);
          void persist(draft);
        }}
      />
    </div>
  );
}
