import type { MockTestRow, PyqAttemptRow, PyqSessionRow } from '@/types';
import { normalizeMockEvidence, normalizeMockSubjectScores } from '@/lib/mocks';
import { validatedPyqAttemptScore } from '@/lib/pyq-session';
import { calendarDateInTimeZone, uuidFromString } from '@/lib/utils';

const PYQ_REASONS_REPRESENTED_BY_MOCK_FIELDS = new Set([
  'not-full-paper',
  'prior-exposure',
  'paused',
  'closed-book-unconfirmed',
  'incomplete-scoring'
]);

/**
 * Convert a finalized authentic PYQ paper into the mock ledger's evidence
 * model. Timed sets stay in PYQ history; only 65-question full-paper runs
 * belong in mock outcomes.
 */
export function mockTestFromFinalizedPyqExam(args: {
  session: PyqSessionRow;
  attempts: readonly PyqAttemptRow[];
  timeZone?: string;
}): MockTestRow | null {
  const { session } = args;
  const examState = session.config.mode === 'exam' ? session.config.examState : undefined;
  if (
    session.status !== 'completed' ||
    session.config.examKind !== 'full-paper' ||
    !session.config.benchmarkPaperId ||
    !examState?.validity_metrics
  ) {
    return null;
  }

  const attempts = args.attempts.filter((attempt) => attempt.pyq_session_id === session.id);
  const scoreResults = attempts.flatMap((attempt) => {
    const score = validatedPyqAttemptScore(attempt);
    return score ? [{ attempt, score }] : [];
  });
  const scoreThirds = scoreResults.reduce((sum, item) => sum + item.score.scoreThirds, 0);
  const correct = attempts.filter(
    (attempt) => attempt.mark_correct === true || attempt.scoring_status === 'bonus'
  ).length;
  const wrong = attempts.filter((attempt) => attempt.mark_correct === false).length;
  const skipped = Math.max(0, session.question_uids.length - correct - wrong);
  const subjectScoreThirds = new Map<string, number>();
  for (const { attempt, score } of scoreResults) {
    subjectScoreThirds.set(
      attempt.subject,
      (subjectScoreThirds.get(attempt.subject) ?? 0) + score.scoreThirds
    );
  }
  const metrics = examState.validity_metrics;
  const priorExposureCount = metrics.prior_exposure_count;
  const freshness =
    priorExposureCount == null
      ? 'unknown'
      : priorExposureCount === 0
        ? 'unseen'
        : priorExposureCount >= session.question_uids.length
          ? 'repeated'
          : 'partially_seen';
  const questionCoverage =
    session.question_uids.length > 0
      ? (metrics.scorable_question_count / session.question_uids.length) * 100
      : 0;
  const markCoverage =
    metrics.total_marks > 0 ? (metrics.scorable_marks / metrics.total_marks) * 100 : 0;
  const completedAt = session.completed_at ?? session.updated_at;
  const firstPaperLabel = attempts.find((attempt) => attempt.question_snapshot?.paper_label)
    ?.question_snapshot?.paper_label;

  return normalizeMockEvidence<MockTestRow>({
    id: uuidFromString(`pyq-exam-mock:${session.id}`),
    user_id: session.user_id,
    name: firstPaperLabel ?? session.config.benchmarkPaperId,
    test_date: calendarDateInTimeZone(completedAt, args.timeZone),
    total_marks: scoreThirds / 3,
    max_marks: metrics.total_marks,
    total_questions: session.question_uids.length,
    correct,
    wrong,
    skipped,
    duration_min: Math.max(1, Math.ceil(metrics.active_time_sec / 60)),
    subject_scores: normalizeMockSubjectScores(
      [...subjectScoreThirds].map(([subject, thirds]) => ({ subject, marks: thirds / 3 }))
    ),
    mistakes: [],
    planner_date: null,
    planner_block_id: null,
    created_at: completedAt,
    updated_at: completedAt,
    source_kind: 'pyq_exam',
    source_pyq_session_id: session.id,
    paper_scope: 'full_length',
    freshness,
    timed: true,
    closed_book: metrics.closed_book_confirmed,
    single_sitting: metrics.pause_count == null ? null : metrics.pause_count === 0,
    evidence_status: examState.validity_status ?? 'supporting',
    // Preserve every blocker that is not already represented by a normalized
    // mock criterion. This is deliberately deny-by-default so a future PYQ
    // validity reason cannot be dropped and accidentally upgrade a run.
    evidence_reasons: (examState.validity_reasons ?? []).filter(
      (reason) => !PYQ_REASONS_REPRESENTED_BY_MOCK_FIELDS.has(reason)
    ),
    scoring_coverage_pct: Math.round(Math.min(questionCoverage, markCoverage) * 100) / 100
  });
}
