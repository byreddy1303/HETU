import { CalendarClock, RotateCcw, TrendingUp } from 'lucide-react';
import type { PracticeCredit } from '@/lib/learning-recovery';
import { formatDate } from '@/lib/utils';

/** One line under the result: what this answer did to the question's re-attempt ladder. */
export default function RecoveryCreditNote({ credit }: { credit: PracticeCredit }) {
  const due = credit.next_due_date ? formatDate(credit.next_due_date) : null;
  if (credit.outcome === 'again') {
    return (
      <p className="flex items-start gap-2 rounded border border-warn/25 bg-warn-faint px-3 py-2 text-[12.5px] text-text">
        <RotateCcw size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <span>
          {credit.remediation
            ? 'Missed again. This one now needs a short focused repair in Re-attempts.'
            : `Missed again. Re-attempt reset to ${credit.next_stage ?? 'D3'}${due ? `, due ${due}` : ''}.`}
        </span>
      </p>
    );
  }
  if (credit.grade === 'hard') {
    const why = [
      credit.grade_reasons?.includes('low confidence') ? 'marked 50/50 or guessed' : null,
      credit.grade_reasons?.includes('over 125% of target time') ? 'slower than target' : null
    ].filter(Boolean);
    return (
      <p className="flex items-start gap-2 rounded border border-border px-3 py-2 text-[12.5px] text-text">
        <CalendarClock size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
        <span>
          Correct, but not solid yet{why.length ? ` (${why.join(', ')})` : ''}. It stays at{' '}
          {credit.next_stage ?? 'D3'}
          {due ? ` and comes back ${due}` : ''}.
        </span>
      </p>
    );
  }
  if (credit.credited) {
    return (
      <p className="flex items-start gap-2 rounded border border-success/25 bg-success-faint px-3 py-2 text-[12.5px] text-text">
        <TrendingUp size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
        <span>
          {credit.mastered
            ? 'Re-attempt passed. This question is now mastered.'
            : `Re-attempt passed: ${credit.previous_stage ?? 'D3'} → ${credit.next_stage ?? ''}${due ? `, next check ${due}` : ''}.`}
        </span>
      </p>
    );
  }
  if (credit.outcome === 'rehearsal') {
    return (
      <p className="flex items-start gap-2 rounded border border-border px-3 py-2 text-[12.5px] text-text-muted">
        <CalendarClock size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>{credit.explanation}</span>
      </p>
    );
  }
  return null;
}
