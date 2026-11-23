import { useId, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import {
  isPracticeMiss,
  QUICK_DIAGNOSIS_CAUSES as CAUSES,
  quickDiagnosisOutcome,
  type QuickDiagnosisResult
} from '@/lib/quick-diagnosis';
import type { PyqAttemptRow, RootCause } from '@/types';

export default function QuickDiagnosis({
  attempt,
  onSave,
  onLater,
  saveLabel = 'Save',
  title
}: {
  attempt: Pick<PyqAttemptRow, 'id' | 'mark_correct' | 'mark_decision' | 'confidence'>;
  onSave: (result: QuickDiagnosisResult) => Promise<void>;
  onLater?: () => void;
  saveLabel?: string;
  title?: string;
}) {
  const id = useId();
  const [cause, setCause] = useState<RootCause | null>(null);
  const [fix, setFix] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const miss = isPracticeMiss(attempt);
  const selected = CAUSES.find((option) => option.value === cause) ?? null;
  const fixRequired = miss && (cause === 'concept' || cause === 'formula');
  const fixReady = !fixRequired || fix.trim().length >= 4;
  const canSave = !!cause && fixReady && !busy;

  async function save() {
    if (!cause || !canSave) return;
    setBusy(true);
    setError('');
    try {
      await onSave({
        outcome: quickDiagnosisOutcome(attempt, cause),
        rootCause: cause,
        fix: fix.trim() || null
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The reason could not be saved. Try again.'
      );
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || event.metaKey || event.ctrlKey || event.altKey) return;
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < CAUSES.length) {
      event.preventDefault();
      setCause(CAUSES[index].value);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      onKeyDown={onKeyDown}
      className="rounded-lg border border-accent/30 bg-accent-faint/40 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={`${id}-title`} className="text-sm font-semibold text-text">
          {title ?? (miss ? 'Why did you miss it?' : 'What made it shaky?')}
        </p>
        <p className="text-[11.5px] text-text-muted">About 15 seconds · keys 1–5</p>
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-title`} className="mt-2 flex flex-wrap gap-2">
        {CAUSES.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={cause === option.value}
            disabled={busy}
            onClick={() => setCause(option.value)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs transition-colors',
              cause === option.value
                ? 'border-accent bg-accent text-accent-contrast'
                : 'border-border bg-bg-raised text-text hover:border-border-hover'
            )}
          >
            <span className="mr-1 font-mono text-[10.5px] opacity-70">{index + 1}</span>
            {option.label}
          </button>
        ))}
      </div>
      <label htmlFor={`${id}-fix`} className="mt-3 block text-[12px] font-medium text-text">
        Fix line{' '}
        <span className="font-normal text-text-muted">
          {fixRequired ? '· required for this reason' : '· optional'}
        </span>
      </label>
      <Input
        id={`${id}-fix`}
        value={fix}
        maxLength={240}
        disabled={busy}
        onChange={(event) => setFix(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void save();
          }
        }}
        placeholder={
          selected ? `e.g. ${selected.example}` : 'The rule or cue that gets it right next time'
        }
        className="mt-1"
      />
      <p className="mt-1 text-[11px] text-text-faint">
        Shown as the opening cue when this question comes back for re-attempt.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={!canSave} onClick={() => void save()}>
          {busy ? 'Saving…' : saveLabel}
        </Button>
        {onLater ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onLater}>
            Later
          </Button>
        ) : null}
      </div>
    </section>
  );
}
