/**
 * Exact GATE scoring, represented in integer thirds of a mark.
 *
 * GATE's only fractional penalties are one third of an MCQ's marks. Keeping
 * the ledger in thirds avoids floating-point drift (for example, three
 * one-mark MCQ penalties are exactly -1 mark, not -0.999999...). Confidence
 * is deliberately orthogonal: MARK and FIFTY_FIFTY receive identical marks.
 */

export const GATE_SCORING_VERSION = 1 as const;
export const GATE_THIRDS_PER_MARK = 3 as const;

export type GateQuestionType =
  | 'MCQ'
  | 'MSQ'
  | 'NAT'
  | 'AMBIGUOUS'
  | 'MARKS_TO_ALL'
  | 'SUBJECTIVE'
  | 'UNSUPPORTED';

export type GateScorableQuestionType = Extract<GateQuestionType, 'MCQ' | 'MSQ' | 'NAT'>;
export type GateAnswerStatus = 'available' | 'ambiguous' | 'marks-to-all' | 'unsupported';
export type GateMarkDecision = 'MARK' | 'SKIP' | 'FIFTY_FIFTY';
export type GateConfidence = 'committed' | 'fifty-fifty' | 'skipped';
export type GateAnswer = string | number | readonly (string | number)[] | null;

export interface GateOutcomeScoreInput {
  questionType: GateQuestionType | string | null | undefined;
  marks: number | null | undefined;
  answerStatus: GateAnswerStatus | string | null | undefined;
  decision: GateMarkDecision;
  /**
   * The result of exact answer evaluation. It is intentionally nullable so
   * legacy or defective questions are never silently counted as wrong.
   */
  correctness: boolean | null;
}

export interface GateAnswerScoreInput extends Omit<GateOutcomeScoreInput, 'correctness'> {
  selectedAnswer: GateAnswer;
  correctAnswer: GateAnswer;
  tolerance?: { abs?: number } | null;
}

interface GateScoreBase {
  scoringVersion: typeof GATE_SCORING_VERSION;
  confidence: GateConfidence;
  questionType: GateQuestionType | string | null;
  marks: 1 | 2 | null;
}

export interface GateScoredResult extends GateScoreBase {
  status: 'scored';
  outcome: 'correct' | 'wrong' | 'skipped';
  scoreThirds: number;
  maxThirds: 3 | 6;
  correctness: boolean | null;
  negativeApplied: boolean;
}

export interface GateBonusResult extends GateScoreBase {
  status: 'bonus';
  outcome: 'bonus';
  scoreThirds: 3 | 6;
  maxThirds: 3 | 6;
  correctness: null;
  negativeApplied: false;
}

export type GateUnscorableReason =
  | 'missing-marks'
  | 'invalid-marks'
  | 'ambiguous-answer'
  | 'unsupported-answer'
  | 'unavailable-answer'
  | 'unsupported-question-type'
  | 'conflicting-bonus-metadata'
  | 'missing-correctness';

export interface GateUnscorableResult extends GateScoreBase {
  status: 'unscorable';
  outcome: 'unscorable';
  scoreThirds: null;
  /** Known potential marks are retained for diagnostics but never aggregated. */
  maxThirds: 3 | 6 | null;
  correctness: null;
  negativeApplied: false;
  reason: GateUnscorableReason;
}

export type GateScoreResult = GateScoredResult | GateBonusResult | GateUnscorableResult;

function confidenceFor(decision: GateMarkDecision): GateConfidence {
  if (decision === 'SKIP') return 'skipped';
  if (decision === 'FIFTY_FIFTY') return 'fifty-fifty';
  return 'committed';
}

function normalizedMarks(marks: number | null | undefined): 1 | 2 | null {
  return marks === 1 || marks === 2 ? marks : null;
}

function normalizedQuestionType(
  value: GateQuestionType | string | null | undefined
): GateQuestionType | string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function unscorable(
  input: GateOutcomeScoreInput,
  reason: GateUnscorableReason,
  marks = normalizedMarks(input.marks)
): GateUnscorableResult {
  return {
    status: 'unscorable',
    outcome: 'unscorable',
    scoreThirds: null,
    maxThirds: marks == null ? null : ((marks * GATE_THIRDS_PER_MARK) as 3 | 6),
    correctness: null,
    negativeApplied: false,
    reason,
    scoringVersion: GATE_SCORING_VERSION,
    confidence: confidenceFor(input.decision),
    questionType: normalizedQuestionType(input.questionType),
    marks
  };
}

/**
 * Score a verified correctness outcome using the official GATE rules.
 *
 * - MCQ: full positive marks; a wrong answer loses one third of its marks.
 * - MSQ/NAT: full positive marks; a wrong answer receives zero.
 * - MSQ has no partial credit because correctness must already represent an
 *   exact-set match (use {@link scoreGateAnswer} for built-in evaluation).
 * - Skips receive zero.
 * - Defective, ambiguous, or incomplete metadata remains unscorable.
 */
export function scoreGateOutcome(input: GateOutcomeScoreInput): GateScoreResult {
  const type = normalizedQuestionType(input.questionType);
  const marks = normalizedMarks(input.marks);
  const base = {
    scoringVersion: GATE_SCORING_VERSION,
    confidence: confidenceFor(input.decision),
    questionType: type,
    marks
  } as const;

  if (input.marks == null) return unscorable(input, 'missing-marks');
  if (marks == null) return unscorable(input, 'invalid-marks');
  const maxThirds = (marks * GATE_THIRDS_PER_MARK) as 3 | 6;

  const bonusByType = type === 'MARKS_TO_ALL';
  const bonusByStatus = input.answerStatus === 'marks-to-all';
  if (bonusByType || bonusByStatus) {
    if (!bonusByType || !bonusByStatus) {
      return unscorable(input, 'conflicting-bonus-metadata', marks);
    }
    return {
      ...base,
      status: 'bonus',
      outcome: 'bonus',
      scoreThirds: maxThirds,
      maxThirds,
      correctness: null,
      negativeApplied: false
    };
  }

  if (input.answerStatus === 'ambiguous' || type === 'AMBIGUOUS') {
    return unscorable(input, 'ambiguous-answer', marks);
  }
  if (input.answerStatus === 'unsupported' || type === 'UNSUPPORTED') {
    return unscorable(input, 'unsupported-answer', marks);
  }
  if (input.answerStatus !== 'available') {
    return unscorable(input, 'unavailable-answer', marks);
  }
  if (type !== 'MCQ' && type !== 'MSQ' && type !== 'NAT') {
    return unscorable(input, 'unsupported-question-type', marks);
  }

  if (input.decision === 'SKIP') {
    return {
      ...base,
      status: 'scored',
      outcome: 'skipped',
      scoreThirds: 0,
      maxThirds,
      correctness: null,
      negativeApplied: false
    };
  }

  if (input.correctness == null) return unscorable(input, 'missing-correctness', marks);

  if (input.correctness) {
    return {
      ...base,
      status: 'scored',
      outcome: 'correct',
      scoreThirds: maxThirds,
      maxThirds,
      correctness: true,
      negativeApplied: false
    };
  }

  const negativeThirds = type === 'MCQ' ? -marks : 0;
  return {
    ...base,
    status: 'scored',
    outcome: 'wrong',
    scoreThirds: negativeThirds,
    maxThirds,
    correctness: false,
    negativeApplied: negativeThirds < 0
  };
}

function normalizedChoices(answer: GateAnswer): string[] {
  const values = Array.isArray(answer) ? answer : answer == null ? [] : [answer];
  return [
    ...new Set(
      values
        .map(String)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    )
  ].sort();
}

/** Exact-set MSQ, single-choice MCQ, and tolerance-aware NAT evaluation. */
export function evaluateGateAnswer(input: GateAnswerScoreInput): boolean | null {
  if (input.answerStatus !== 'available' || input.decision === 'SKIP') return null;
  const type = normalizedQuestionType(input.questionType);
  if (
    input.selectedAnswer == null ||
    (typeof input.selectedAnswer === 'string' && !input.selectedAnswer.trim()) ||
    (Array.isArray(input.selectedAnswer) && input.selectedAnswer.length === 0)
  ) {
    return null;
  }

  if (type === 'MCQ') {
    const selected = normalizedChoices(input.selectedAnswer);
    const expected = normalizedChoices(input.correctAnswer);
    if (expected.length !== 1) return null;
    return selected.length === 1 && selected[0] === expected[0];
  }

  if (type === 'MSQ') {
    const selected = normalizedChoices(input.selectedAnswer);
    const expected = normalizedChoices(input.correctAnswer);
    if (expected.length === 0) return null;
    return (
      selected.length === expected.length &&
      selected.every((value, index) => value === expected[index])
    );
  }

  if (type === 'NAT') {
    if (Array.isArray(input.selectedAnswer)) return null;
    const selected = Number(input.selectedAnswer);
    if (!Number.isFinite(selected)) return false;
    const expectedValues = Array.isArray(input.correctAnswer)
      ? input.correctAnswer
      : input.correctAnswer == null
        ? []
        : [input.correctAnswer];
    if (
      expectedValues.length === 0 ||
      expectedValues.some((value) => typeof value === 'string' && !value.trim())
    ) {
      return null;
    }
    const expected = expectedValues.map(Number);
    if (expected.some((value) => !Number.isFinite(value))) return null;
    const tolerance = input.tolerance?.abs ?? 0;
    if (!Number.isFinite(tolerance) || tolerance < 0) return null;
    return expected.some((value) => Math.abs(selected - value) <= tolerance + Number.EPSILON);
  }

  return null;
}

/** Evaluate an answer and then apply the exact official scoring rule. */
export function scoreGateAnswer(input: GateAnswerScoreInput): GateScoreResult {
  return scoreGateOutcome({
    questionType: input.questionType,
    marks: input.marks,
    answerStatus: input.answerStatus,
    decision: input.decision,
    correctness: evaluateGateAnswer(input)
  });
}

export interface GateScoreAggregate {
  scoreThirds: number;
  maxThirds: number;
  scoreMarks: number;
  maxMarks: number;
  scoredCount: number;
  bonusCount: number;
  unscorableCount: number;
}

/** Aggregate only fully scored/bonus records; unscorable rows never alter totals. */
export function aggregateGateScores(results: readonly GateScoreResult[]): GateScoreAggregate {
  let scoreThirds = 0;
  let maxThirds = 0;
  let scoredCount = 0;
  let bonusCount = 0;
  let unscorableCount = 0;

  for (const result of results) {
    if (result.status === 'unscorable') {
      unscorableCount += 1;
      continue;
    }
    scoreThirds += result.scoreThirds;
    maxThirds += result.maxThirds;
    if (result.status === 'bonus') bonusCount += 1;
    else scoredCount += 1;
  }

  return {
    scoreThirds,
    maxThirds,
    scoreMarks: scoreThirds / GATE_THIRDS_PER_MARK,
    maxMarks: maxThirds / GATE_THIRDS_PER_MARK,
    scoredCount,
    bonusCount,
    unscorableCount
  };
}
