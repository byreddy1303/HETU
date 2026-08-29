import type { PyqAttemptRow, PyqExamConfidence, PyqSessionRow } from '@/types';
import { scoreGateOutcome, type GateScoreResult } from '@/lib/gate-scoring';

export type PyqSummaryOutcome =
  'correct' | 'wrong' | 'skipped' | 'bonus' | 'unscorable' | 'not-submitted';

export interface PyqQuestionSummary {
  questionUid: string;
  questionNumber: number;
  attemptOrder: number;
  attempt: PyqAttemptRow | null;
  outcome: PyqSummaryOutcome;
  visited: boolean;
  markedForReview: boolean;
  confidence: PyqExamConfidence | null;
  /** Exact cumulative active time when the receipt/session ledger captured it. */
  timeSpentMs?: number;
  timeSpentSec: number;
  scoreThirds: number | null;
  maxThirds: number | null;
  scoringCovered: boolean;
}

export interface PyqSessionSummaryData {
  questions: PyqQuestionSummary[];
  totalQuestions: number;
  rawReceiptCount: number;
  answered: number;
  correct: number;
  wrong: number;
  skipped: number;
  bonus: number;
  unscorable: number;
  notVisited: number;
  markedForReview: number;
  confidence: Record<PyqExamConfidence | 'unset', number>;
  oneMarkQuestions: number;
  twoMarkQuestions: number;
  knownMaxMarks: number;
  correctMarks: number;
  penaltyMarks: number;
  resultantMarks: number;
  coveredMaxMarks: number;
  scoringCoverageCount: number;
  gradedAccuracyPercent: number | null;
  scorePercent: number | null;
  elapsedSec: number;
  durationSec: number | null;
}

function isLaterAttempt(candidate: PyqAttemptRow, current: PyqAttemptRow): boolean {
  if (candidate.attempt_number !== current.attempt_number) {
    return candidate.attempt_number > current.attempt_number;
  }
  if (candidate.attempted_at !== current.attempted_at) {
    return candidate.attempted_at > current.attempted_at;
  }
  return candidate.id > current.id;
}

export function latestPyqSessionAttempts(
  attempts: readonly PyqAttemptRow[]
): Map<string, PyqAttemptRow> {
  const latest = new Map<string, PyqAttemptRow>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.question_uid);
    if (!current || isLaterAttempt(attempt, current)) latest.set(attempt.question_uid, attempt);
  }
  return latest;
}

function exactStoredScore(attempt: PyqAttemptRow): GateScoreResult | null {
  if (
    attempt.capture_version !== 3 ||
    attempt.scoring_version !== 1 ||
    attempt.scoring_status == null
  ) {
    return null;
  }
  const result = scoreGateOutcome({
    questionType: attempt.question_type,
    marks: attempt.question_marks,
    answerStatus: attempt.answer_status,
    decision: attempt.mark_decision,
    correctness: attempt.mark_correct
  });
  if (result.status !== attempt.scoring_status || result.scoreThirds !== attempt.score_thirds) {
    return null;
  }
  return result;
}

function outcomeForAttempt(attempt: PyqAttemptRow | null): PyqSummaryOutcome {
  if (!attempt) return 'not-submitted';
  if (attempt.mark_decision === 'SKIP') return 'skipped';
  if (attempt.scoring_status === 'bonus') return 'bonus';
  if (attempt.mark_correct === true) return 'correct';
  if (attempt.mark_correct === false) return 'wrong';
  return 'unscorable';
}

function knownQuestionMarks(attempt: PyqAttemptRow | null): 1 | 2 | null {
  if (!attempt) return null;
  if (attempt.question_marks === 1 || attempt.question_marks === 2) return attempt.question_marks;
  const snapshotMarks = attempt.question_snapshot?.marks;
  return snapshotMarks === 1 || snapshotMarks === 2 ? snapshotMarks : null;
}

function validAttemptTimeMs(attempt: PyqAttemptRow): number {
  if (attempt.time_spent_ms != null && Number.isFinite(attempt.time_spent_ms)) {
    return Math.max(0, attempt.time_spent_ms);
  }
  return Number.isFinite(attempt.time_spent_sec) ? Math.max(0, attempt.time_spent_sec) * 1000 : 0;
}

export function buildPyqSessionSummary(
  session: PyqSessionRow,
  attempts: readonly PyqAttemptRow[]
): PyqSessionSummaryData {
  const sessionAttempts = attempts.filter((attempt) => attempt.pyq_session_id === session.id);
  const latest = latestPyqSessionAttempts(sessionAttempts);
  const receiptOrder = new Map(
    [...latest.values()]
      .sort(
        (left, right) =>
          left.attempted_at.localeCompare(right.attempted_at) ||
          left.question_uid.localeCompare(right.question_uid)
      )
      .map((attempt, index) => [attempt.question_uid, index] as const)
  );
  const examState = session.config.mode === 'exam' ? session.config.examState : undefined;
  const visitOrder = new Map(
    (examState?.visited_question_uids ?? []).map(
      (questionUid, index) => [questionUid, index] as const
    )
  );
  const visited = new Set(examState?.visited_question_uids ?? []);
  const marked = new Set(examState?.marked_for_review_question_uids ?? []);
  const confidenceByQuestion = examState?.confidence_by_question ?? {};
  const practiceTimeMsByQuestion = new Map<string, number>();
  if (!examState) {
    for (const attempt of sessionAttempts) {
      practiceTimeMsByQuestion.set(
        attempt.question_uid,
        (practiceTimeMsByQuestion.get(attempt.question_uid) ?? 0) + validAttemptTimeMs(attempt)
      );
    }
  }
  const questionUids =
    session.question_uids.length > 0 ? session.question_uids : [...latest.keys()];

  const questions = questionUids.map((questionUid, index): PyqQuestionSummary => {
    const attempt = latest.get(questionUid) ?? null;
    const exactScore = attempt ? exactStoredScore(attempt) : null;
    const examTimeMs = examState?.time_by_question_ms[questionUid];
    const hasExamTime = typeof examTimeMs === 'number' && Number.isFinite(examTimeMs);
    const timeSpentMs = hasExamTime
      ? Math.max(0, examTimeMs)
      : (practiceTimeMsByQuestion.get(questionUid) ?? 0);
    const rawConfidence = examState
      ? confidenceByQuestion[questionUid]
      : (attempt?.confidence ??
        (attempt?.mark_decision === 'MARK'
          ? 'high'
          : attempt?.mark_decision === 'FIFTY_FIFTY'
            ? 'medium'
            : null) ??
        confidenceByQuestion[questionUid]);
    const recordedConfidence =
      rawConfidence === 'high' || rawConfidence === 'medium' || rawConfidence === 'low'
        ? rawConfidence
        : null;
    return {
      questionUid,
      questionNumber: index + 1,
      attemptOrder:
        visitOrder.get(questionUid) ?? receiptOrder.get(questionUid) ?? Number.MAX_SAFE_INTEGER,
      attempt,
      outcome: outcomeForAttempt(attempt),
      visited: examState ? visited.has(questionUid) : attempt !== null,
      markedForReview: marked.has(questionUid),
      confidence: recordedConfidence,
      timeSpentMs,
      timeSpentSec: hasExamTime
        ? Math.max(0, Math.round(examTimeMs / 1000))
        : Math.max(0, Math.ceil(timeSpentMs / 1000)),
      scoreThirds: exactScore && exactScore.status !== 'unscorable' ? exactScore.scoreThirds : null,
      maxThirds: exactScore?.maxThirds ?? null,
      scoringCovered: exactScore !== null && exactScore.status !== 'unscorable'
    };
  });

  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let bonus = 0;
  let unscorable = 0;
  let notVisited = 0;
  let markedForReview = 0;
  const confidence: Record<PyqExamConfidence | 'unset', number> = {
    high: 0,
    medium: 0,
    low: 0,
    unset: 0
  };
  let oneMarkQuestions = 0;
  let twoMarkQuestions = 0;
  let knownMaxMarks = 0;
  let scoreThirds = 0;
  let coveredMaxThirds = 0;
  let scoringCoverageCount = 0;

  for (const question of questions) {
    if (question.outcome === 'correct') correct += 1;
    else if (question.outcome === 'wrong') wrong += 1;
    else if (question.outcome === 'bonus') bonus += 1;
    else if (question.outcome === 'skipped' || question.outcome === 'not-submitted') skipped += 1;
    else unscorable += 1;
    if (!question.visited) notVisited += 1;
    if (question.markedForReview) markedForReview += 1;
    confidence[question.confidence ?? 'unset'] += 1;
    const marks = knownQuestionMarks(question.attempt);
    if (marks === 1) oneMarkQuestions += 1;
    if (marks === 2) twoMarkQuestions += 1;
    if (marks) knownMaxMarks += marks;
    if (question.scoringCovered && question.scoreThirds != null && question.maxThirds != null) {
      scoreThirds += question.scoreThirds;
      coveredMaxThirds += question.maxThirds;
      scoringCoverageCount += 1;
    }
  }

  const correctThirds = questions.reduce(
    (sum, question) => sum + Math.max(0, question.scoreThirds ?? 0),
    0
  );
  const penaltyThirds = questions.reduce(
    (sum, question) => sum + Math.abs(Math.min(0, question.scoreThirds ?? 0)),
    0
  );
  const graded = correct + wrong;
  const durationSec = examState?.duration_sec ?? null;
  return {
    questions,
    totalQuestions: questions.length,
    rawReceiptCount: sessionAttempts.length,
    answered: correct + wrong + bonus + unscorable,
    correct,
    wrong,
    skipped,
    bonus,
    unscorable,
    notVisited,
    markedForReview,
    confidence,
    oneMarkQuestions,
    twoMarkQuestions,
    knownMaxMarks,
    correctMarks: correctThirds / 3,
    penaltyMarks: penaltyThirds / 3,
    resultantMarks: scoreThirds / 3,
    coveredMaxMarks: coveredMaxThirds / 3,
    scoringCoverageCount,
    gradedAccuracyPercent: graded > 0 ? Math.round((correct / graded) * 100) : null,
    scorePercent:
      knownMaxMarks > 0
        ? Math.max(0, Math.min(100, Math.round((scoreThirds / 3 / knownMaxMarks) * 100)))
        : null,
    elapsedSec: session.elapsed_sec,
    durationSec
  };
}
