import { useState } from 'react';
import { Check, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PyqQuestion } from '@/lib/pyq';

/**
 * After a miss: offer one unseen PYQ on the same topic as the next question, so the
 * corrected method is used on a fresh problem while the solution is still in mind.
 */
export default function SimilarQuestionOffer({
  missed,
  similar,
  added,
  onAdd
}: {
  missed: Pick<PyqQuestion, 'topic'>;
  /** undefined while searching; null when no unseen question remains on this topic. */
  similar: PyqQuestion | null | undefined;
  added: boolean;
  onAdd: (question: PyqQuestion) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (similar === undefined) return null;
  if (similar === null)
    return (
      <p className="text-[12px] text-text-muted">
        Every unseen question on {missed.topic} is already used, so there is no fresh one to follow
        this miss.
      </p>
    );
  const marks = similar.marks === 1 ? '1 mark' : `${similar.marks ?? '?'} marks`;
  return (
    <section
      aria-label="Similar question"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-accent/25 bg-accent-faint px-3 py-2.5"
    >
      <Crosshair size={16} className="shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed">
        <p className="font-semibold text-text">Lock in the fix</p>
        <p className="text-text-muted">
          {added
            ? `Added. ${similar.paperLabel} Q${similar.number} on ${similar.topic} is your next question.`
            : `Solve an unseen ${similar.topic} question now (${similar.paperLabel} Q${similar.number}, ${marks}). Using the method on a new problem fixes it better than re-reading the solution.`}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-danger">
            {error}
          </p>
        )}
      </div>
      {added ? (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
          <Check size={14} aria-hidden /> Next up
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            onAdd(similar)
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error ? cause.message : 'The question could not be added.'
                )
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Adding…' : 'Add it next'}
        </Button>
      )}
    </section>
  );
}
