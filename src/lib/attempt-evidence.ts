import type { MarkDecision, PyqAttemptRow, QuestionRow } from '@/types';
import {
  legacyPyqJournalQuestionId,
  pyqJournalSourceMap,
  pyqJournalQuestionId,
} from '@/lib/pyq-session';

export type AttemptEvidenceOutcome = 'correct' | 'wrong' | 'skipped' | 'ungraded';
export type AttemptEvidenceSource = 'pyq-attempt' | 'legacy-journal';

/** One and only one readiness/calibration event. Uncertainty is orthogonal. */
export interface AttemptEvidenceEvent {
  id: string;
  source: AttemptEvidenceSource;
  userId: string;
  attemptId: string | null;
  questionId: string | null;
  questionUid: string | null;
  subject: string;
  topic: string | null;
  occurredAt: string;
  decision: MarkDecision;
  outcome: AttemptEvidenceOutcome;
  uncertain: boolean;
  correct: boolean | null;
  timeSpentSec: number;
}

export interface AttemptEvidenceCounts {
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  ungraded: number;
  uncertain: number;
  pyqAttempts: number;
  legacyJournal: number;
}

export interface AttemptEvidenceLedger {
  events: AttemptEvidenceEvent[];
  counts: AttemptEvidenceCounts;
  /** Journal rows intentionally omitted because they annotate a PYQ receipt. */
  suppressedJournalQuestionIds: string[];
  /** Duplicate input receipts collapsed by immutable primary key. */
  duplicateAttemptIds: string[];
}

function outcomeFor(decision: MarkDecision, correct: boolean | null): AttemptEvidenceOutcome {
  if (decision === 'SKIP') return 'skipped';
  if (correct === true) return 'correct';
  if (correct === false) return 'wrong';
  return 'ungraded';
}

function eventFromAttempt(attempt: PyqAttemptRow): AttemptEvidenceEvent {
  return {
    id: `pyq-attempt:${attempt.id}`,
    source: 'pyq-attempt',
    userId: attempt.user_id,
    attemptId: attempt.id,
    questionId: null,
    questionUid: attempt.question_uid,
    subject: attempt.subject,
    topic: attempt.question_snapshot?.topic ?? null,
    occurredAt: attempt.attempted_at,
    decision: attempt.mark_decision,
    outcome: outcomeFor(attempt.mark_decision, attempt.mark_correct),
    uncertain: attempt.mark_decision === 'FIFTY_FIFTY',
    correct: attempt.mark_correct,
    timeSpentSec: Math.max(0, attempt.time_spent_sec)
  };
}

function eventFromJournal(question: QuestionRow): AttemptEvidenceEvent | null {
  if (question.mark_decision == null) return null;
  return {
    id: `legacy-journal:${question.id}`,
    source: 'legacy-journal',
    userId: question.user_id,
    attemptId: null,
    questionId: question.id,
    questionUid: null,
    subject: question.subject,
    topic: question.subtopic,
    occurredAt: question.created_at,
    decision: question.mark_decision,
    outcome: outcomeFor(question.mark_decision, question.mark_correct),
    uncertain: question.mark_decision === 'FIFTY_FIFTY',
    correct: question.mark_correct,
    timeSpentSec: Math.max(0, question.time_spent_sec)
  };
}

function countsFor(events: AttemptEvidenceEvent[]): AttemptEvidenceCounts {
  const counts: AttemptEvidenceCounts = {
    total: events.length,
    correct: 0,
    wrong: 0,
    skipped: 0,
    ungraded: 0,
    uncertain: 0,
    pyqAttempts: 0,
    legacyJournal: 0
  };
  for (const event of events) {
    counts[event.outcome] += 1;
    if (event.uncertain) counts.uncertain += 1;
    if (event.source === 'pyq-attempt') counts.pyqAttempts += 1;
    else counts.legacyJournal += 1;
  }
  if (
    counts.total !== counts.correct + counts.wrong + counts.skipped + counts.ungraded ||
    counts.uncertain > counts.total
  ) {
    throw new Error('Attempt evidence invariant failed.');
  }
  return counts;
}

/**
 * Build the canonical learner-event ledger.
 *
 * PYQ receipts are authoritative. Their current deterministic Journal rows,
 * the legacy deterministic seed, explicit source links, and the narrow legacy
 * timestamp match are analysis annotations and never become a second event.
 * Truly independent legacy/manual Journal decisions remain compatibility
 * evidence so existing learners do not lose history.
 */
export function normalizeAttemptEvidence(args: {
  attempts: PyqAttemptRow[];
  questions: QuestionRow[];
}): AttemptEvidenceLedger {
  const attemptsById = new Map<string, PyqAttemptRow>();
  const duplicateAttemptIds = new Set<string>();
  for (const attempt of args.attempts) {
    if (attemptsById.has(attempt.id)) duplicateAttemptIds.add(attempt.id);
    else attemptsById.set(attempt.id, attempt);
  }
  const attempts = [...attemptsById.values()];
  const deterministicJournalIds = new Set(
    attempts.flatMap((attempt) => [
      pyqJournalQuestionId(attempt.id),
      legacyPyqJournalQuestionId(attempt.id)
    ])
  );
  const safeLegacyLinks = pyqJournalSourceMap(args.questions, attempts);
  const suppressedJournalQuestionIds: string[] = [];
  const events = attempts.map(eventFromAttempt);

  for (const question of args.questions) {
    if (
      question.source_pyq_attempt_id ||
      deterministicJournalIds.has(question.id) ||
      safeLegacyLinks.has(question.id)
    ) {
      suppressedJournalQuestionIds.push(question.id);
      continue;
    }
    const event = eventFromJournal(question);
    if (event) events.push(event);
  }

  events.sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)
  );
  suppressedJournalQuestionIds.sort();
  return {
    events,
    counts: countsFor(events),
    suppressedJournalQuestionIds,
    duplicateAttemptIds: [...duplicateAttemptIds].sort()
  };
}
