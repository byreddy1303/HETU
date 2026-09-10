import type { PyqAttemptRow, PyqExamConfidence } from '@/types';
import { targetTimeSecForMarks } from '@/lib/constants';

export interface PyqConfidenceLedgerRow {
  confidence: PyqExamConfidence;
  attempted: number;
  correct: number;
  wrong: number;
  accuracyPct: number | null;
}

export interface PyqCalibrationScopeRow {
  subject: string;
  topic: string;
  attempted: number;
  correct: number;
  wrong: number;
  highConfidenceWrong: number;
  accuracyPct: number | null;
  highConfidenceAccuracyPct: number | null;
  exactQuestionUids: string[];
}

export interface PyqPaceBaselineRow {
  subject: string;
  marks: 1 | 2 | null;
  sampleSize: number;
  personalMedianSec: number;
  gateTargetSec: number;
  ratioToTarget: number;
}

export interface PyqActionableCohorts {
  highConfidenceWrong: string[];
  guessedCorrect: string[];
  slowCorrect: string[];
  wrongUnanalyzed: string[];
  repair: string[];
}

export interface PyqEvidenceInsights {
  confidence: PyqConfidenceLedgerRow[];
  calibrationBySubjectTopic: PyqCalibrationScopeRow[];
  paceBaselines: PyqPaceBaselineRow[];
  cohorts: PyqActionableCohorts;
}

function confidenceForAttempt(attempt: PyqAttemptRow): PyqExamConfidence | null {
  if (attempt.confidence) return attempt.confidence;
  if (attempt.mark_decision === 'MARK') return 'high';
  if (attempt.mark_decision === 'FIFTY_FIFTY') return 'medium';
  return null;
}

function attemptTopic(attempt: PyqAttemptRow): string {
  return (
    attempt.question_snapshot?.topic || attempt.question_snapshot?.topic_slug || 'Unclassified'
  );
}

function attemptMarks(attempt: PyqAttemptRow): 1 | 2 | null {
  const marks = attempt.question_marks ?? attempt.question_snapshot?.marks;
  return marks === 1 || marks === 2 ? marks : null;
}

function latestAttemptsByQuestion(attempts: readonly PyqAttemptRow[]): PyqAttemptRow[] {
  const latest = new Map<string, PyqAttemptRow>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.question_uid);
    if (
      !current ||
      attempt.attempted_at > current.attempted_at ||
      (attempt.attempted_at === current.attempted_at &&
        attempt.attempt_number > current.attempt_number)
    ) {
      latest.set(attempt.question_uid, attempt);
    }
  }
  return [...latest.values()];
}

function accuracy(correct: number, wrong: number): number | null {
  return correct + wrong === 0 ? null : Math.round((correct / (correct + wrong)) * 100);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Build longitudinal, inspectable PYQ evidence. Every actionable cohort is an
 * exact UID list derived from the latest immutable receipt for each question;
 * calibration and pace baselines retain all receipts so improvement is not
 * silently erased by a later retry.
 */
export function buildPyqEvidenceInsights(args: {
  attempts: readonly PyqAttemptRow[];
  analyzedAttemptIds?: ReadonlySet<string>;
  rollingPaceWindow?: number;
}): PyqEvidenceInsights {
  const attempts = args.attempts.filter(
    (attempt) => attempt.mark_decision !== 'SKIP' && attempt.mark_correct != null
  );
  const latest = latestAttemptsByQuestion(args.attempts);
  const confidence = (['high', 'medium', 'low'] as const).map((band) => {
    const rows = attempts.filter((attempt) => confidenceForAttempt(attempt) === band);
    const correct = rows.filter((attempt) => attempt.mark_correct === true).length;
    const wrong = rows.filter((attempt) => attempt.mark_correct === false).length;
    return {
      confidence: band,
      attempted: rows.length,
      correct,
      wrong,
      accuracyPct: accuracy(correct, wrong)
    };
  });

  const scopeGroups = new Map<string, PyqAttemptRow[]>();
  for (const attempt of attempts) {
    const topic = attemptTopic(attempt);
    const key = `${attempt.subject}\u0000${topic}`;
    const rows = scopeGroups.get(key) ?? [];
    rows.push(attempt);
    scopeGroups.set(key, rows);
  }
  const calibrationBySubjectTopic = [...scopeGroups.entries()]
    .map(([key, rows]): PyqCalibrationScopeRow => {
      const [subject, topic] = key.split('\u0000');
      const correct = rows.filter((attempt) => attempt.mark_correct === true).length;
      const wrong = rows.filter((attempt) => attempt.mark_correct === false).length;
      const high = rows.filter((attempt) => confidenceForAttempt(attempt) === 'high');
      const highCorrect = high.filter((attempt) => attempt.mark_correct === true).length;
      const highWrong = high.filter((attempt) => attempt.mark_correct === false);
      return {
        subject,
        topic,
        attempted: rows.length,
        correct,
        wrong,
        highConfidenceWrong: highWrong.length,
        accuracyPct: accuracy(correct, wrong),
        highConfidenceAccuracyPct: accuracy(highCorrect, highWrong.length),
        exactQuestionUids: unique(highWrong.map((attempt) => attempt.question_uid))
      };
    })
    .sort(
      (left, right) =>
        right.highConfidenceWrong - left.highConfidenceWrong ||
        (left.highConfidenceAccuracyPct ?? 101) - (right.highConfidenceAccuracyPct ?? 101) ||
        right.attempted - left.attempted ||
        left.subject.localeCompare(right.subject) ||
        left.topic.localeCompare(right.topic)
    );

  const paceWindow = Math.max(3, Math.min(100, Math.floor(args.rollingPaceWindow ?? 20)));
  const paceGroups = new Map<string, PyqAttemptRow[]>();
  for (const attempt of attempts) {
    if (attempt.mark_correct !== true || attempt.time_spent_sec <= 0) continue;
    const marks = attemptMarks(attempt);
    const key = `${attempt.subject}\u0000${marks ?? 'unknown'}`;
    const rows = paceGroups.get(key) ?? [];
    rows.push(attempt);
    paceGroups.set(key, rows);
  }
  const paceBaselines = [...paceGroups.entries()]
    .map(([key, rows]): PyqPaceBaselineRow => {
      const [subject, rawMarks] = key.split('\u0000');
      const marks = rawMarks === '1' ? 1 : rawMarks === '2' ? 2 : null;
      const recent = [...rows]
        .sort((left, right) => right.attempted_at.localeCompare(left.attempted_at))
        .slice(0, paceWindow);
      const personalMedianSec = median(recent.map((attempt) => attempt.time_spent_sec));
      const gateTargetSec = targetTimeSecForMarks(marks);
      return {
        subject,
        marks,
        sampleSize: recent.length,
        personalMedianSec,
        gateTargetSec,
        ratioToTarget: Math.round((personalMedianSec / gateTargetSec) * 100) / 100
      };
    })
    .sort(
      (left, right) =>
        right.ratioToTarget - left.ratioToTarget ||
        right.sampleSize - left.sampleSize ||
        left.subject.localeCompare(right.subject)
    );

  const highConfidenceWrong = latest.filter(
    (attempt) => attempt.mark_correct === false && confidenceForAttempt(attempt) === 'high'
  );
  const guessedCorrect = latest.filter(
    (attempt) =>
      attempt.mark_correct === true &&
      (attempt.mark_decision === 'FIFTY_FIFTY' ||
        confidenceForAttempt(attempt) === 'low' ||
        confidenceForAttempt(attempt) === 'medium')
  );
  const slowCorrect = latest.filter(
    (attempt) =>
      attempt.mark_correct === true &&
      attempt.time_spent_sec > targetTimeSecForMarks(attemptMarks(attempt))
  );
  const wrongUnanalyzed = latest.filter(
    (attempt) => attempt.mark_correct === false && !args.analyzedAttemptIds?.has(attempt.id)
  );
  const repair = unique(
    [...highConfidenceWrong, ...guessedCorrect, ...slowCorrect, ...wrongUnanalyzed].map(
      (attempt) => attempt.question_uid
    )
  );

  return {
    confidence,
    calibrationBySubjectTopic,
    paceBaselines,
    cohorts: {
      highConfidenceWrong: unique(highConfidenceWrong.map((attempt) => attempt.question_uid)),
      guessedCorrect: unique(guessedCorrect.map((attempt) => attempt.question_uid)),
      slowCorrect: unique(slowCorrect.map((attempt) => attempt.question_uid)),
      wrongUnanalyzed: unique(wrongUnanalyzed.map((attempt) => attempt.question_uid)),
      repair
    }
  };
}
