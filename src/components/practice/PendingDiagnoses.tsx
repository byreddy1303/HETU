import { Card, CardBody } from '@/components/ui/Card';
import { db } from '@/lib/db';
import { useLiveQuery } from '@/lib/db-hooks';
import { needsRecoveryCapture } from '@/lib/learning-recovery';
import type { PyqQuestion } from '@/lib/pyq';
import { pyqJournalQuestionId } from '@/lib/pyq-session';
import type { PyqAttemptRow } from '@/types';
import {
  isPracticeMiss,
  needsQuickDiagnosis,
  type QuickDiagnosisResult
} from '@/lib/quick-diagnosis';
import QuickDiagnosis from './QuickDiagnosis';

function answerLabel(attempt: PyqAttemptRow): string {
  if (attempt.mark_decision === 'SKIP') return 'Skipped';
  if (attempt.mark_correct === false) return 'Wrong';
  if (attempt.mark_decision === 'FIFTY_FIFTY' || attempt.confidence === 'low') return 'Guessed';
  return 'Slow';
}

/** Lists this set's weak answers that still lack a reason, so none is left unexplained. */
export default function PendingDiagnoses({
  attempts,
  questions,
  onSave
}: {
  attempts: PyqAttemptRow[];
  questions: PyqQuestion[];
  onSave: (
    attempt: PyqAttemptRow,
    question: PyqQuestion,
    result: QuickDiagnosisResult
  ) => Promise<void>;
}) {
  const weak = attempts.filter((attempt) =>
    needsQuickDiagnosis(attempt, needsRecoveryCapture(attempt))
  );
  const journalIds = weak.map((attempt) => pyqJournalQuestionId(attempt.id));
  const journal = useLiveQuery(
    () => (journalIds.length ? db.questions.bulkGet(journalIds) : []),
    [journalIds.join('|')],
    []
  );
  const explained = new Set(
    journal.flatMap((row) =>
      row?.root_cause && row.source_pyq_attempt_id ? [row.source_pyq_attempt_id] : []
    )
  );
  const pending = weak.filter((attempt) => !explained.has(attempt.id));
  if (pending.length === 0) return null;
  const misses = pending.filter(isPracticeMiss).length;
  return (
    <Card>
      <CardBody className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <p className="font-display text-[19px] font-bold text-text">
            {pending.length === 1
              ? '1 answer still needs a reason'
              : `${pending.length} answers still need a reason`}
          </p>
          <p className="mt-1 text-[13px] text-text-muted">
            {misses > 0
              ? 'Each miss is already scheduled for re-attempt. A reason and fix line make that re-attempt count.'
              : 'Guessed and slow answers are scheduled too. Say what made them shaky.'}
          </p>
        </div>
        {pending.map((attempt) => {
          const question = questions.find((candidate) => candidate.id === attempt.question_uid);
          if (!question) return null;
          return (
            <div key={attempt.id} className="flex flex-col gap-2">
              <p className="text-[13px] font-medium text-text">
                {question.paperLabel} · Q{question.number}
                <span className="ml-2 text-text-muted">
                  {answerLabel(attempt)} · {question.topic}
                </span>
              </p>
              <QuickDiagnosis
                attempt={attempt}
                saveLabel="Save reason"
                onSave={(result) => onSave(attempt, question, result)}
              />
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
