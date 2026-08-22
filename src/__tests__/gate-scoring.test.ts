import { describe, expect, it } from 'vitest';
import {
  GATE_SCORING_VERSION,
  aggregateGateScores,
  evaluateGateAnswer,
  scoreGateAnswer,
  scoreGateOutcome,
  type GateOutcomeScoreInput
} from '@/lib/gate-scoring';

function outcome(overrides: Partial<GateOutcomeScoreInput> = {}): GateOutcomeScoreInput {
  return {
    questionType: 'MCQ',
    marks: 1,
    answerStatus: 'available',
    decision: 'MARK',
    correctness: true,
    ...overrides
  };
}

describe('official GATE scoring', () => {
  it('awards full positive marks for correct 1-mark and 2-mark questions', () => {
    expect(scoreGateOutcome(outcome({ marks: 1 }))).toMatchObject({
      status: 'scored',
      outcome: 'correct',
      scoreThirds: 3,
      maxThirds: 3,
      scoringVersion: GATE_SCORING_VERSION
    });
    expect(scoreGateOutcome(outcome({ questionType: 'NAT', marks: 2 }))).toMatchObject({
      status: 'scored',
      scoreThirds: 6,
      maxThirds: 6
    });
  });

  it('applies negatives only to wrong MCQs', () => {
    expect(scoreGateOutcome(outcome({ marks: 1, correctness: false }))).toMatchObject({
      scoreThirds: -1,
      negativeApplied: true
    });
    expect(scoreGateOutcome(outcome({ marks: 2, correctness: false }))).toMatchObject({
      scoreThirds: -2,
      negativeApplied: true
    });
    for (const questionType of ['MSQ', 'NAT'] as const) {
      expect(
        scoreGateOutcome(outcome({ questionType, marks: 2, correctness: false }))
      ).toMatchObject({ scoreThirds: 0, negativeApplied: false });
    }
  });

  it('requires an exact set for MSQ and gives no partial credit', () => {
    const base = {
      questionType: 'MSQ' as const,
      marks: 2,
      answerStatus: 'available' as const,
      decision: 'MARK' as const,
      correctAnswer: ['B', 'D']
    };
    expect(scoreGateAnswer({ ...base, selectedAnswer: ['D', 'B'] })).toMatchObject({
      outcome: 'correct',
      scoreThirds: 6
    });
    expect(scoreGateAnswer({ ...base, selectedAnswer: ['B'] })).toMatchObject({
      outcome: 'wrong',
      scoreThirds: 0
    });
    expect(scoreGateAnswer({ ...base, selectedAnswer: ['A', 'B', 'D'] })).toMatchObject({
      outcome: 'wrong',
      scoreThirds: 0
    });
  });

  it('evaluates NAT alternatives with the audited absolute tolerance', () => {
    const base = {
      questionType: 'NAT' as const,
      marks: 1,
      answerStatus: 'available' as const,
      decision: 'MARK' as const,
      correctAnswer: [0.5, 0.75],
      tolerance: { abs: 0.01 }
    };
    expect(evaluateGateAnswer({ ...base, selectedAnswer: 0.509 })).toBe(true);
    expect(evaluateGateAnswer({ ...base, selectedAnswer: '0.742' })).toBe(true);
    expect(evaluateGateAnswer({ ...base, selectedAnswer: 0.52 })).toBe(false);
  });

  it('scores a skip as zero without pretending it is wrong', () => {
    expect(
      scoreGateOutcome(outcome({ decision: 'SKIP', correctness: null, marks: 2 }))
    ).toMatchObject({
      status: 'scored',
      outcome: 'skipped',
      scoreThirds: 0,
      maxThirds: 6,
      correctness: null
    });
  });

  it('keeps FIFTY_FIFTY confidence orthogonal to marks', () => {
    const committed = scoreGateOutcome(outcome({ decision: 'MARK', correctness: false }));
    const uncertain = scoreGateOutcome(outcome({ decision: 'FIFTY_FIFTY', correctness: false }));
    expect(uncertain).toMatchObject({
      scoreThirds: committed.scoreThirds,
      confidence: 'fifty-fifty'
    });
    expect(committed.confidence).toBe('committed');
  });

  it('awards a verified marks-to-all bonus, including for a skipped response', () => {
    expect(
      scoreGateOutcome(
        outcome({
          questionType: 'MARKS_TO_ALL',
          answerStatus: 'marks-to-all',
          decision: 'SKIP',
          correctness: null,
          marks: 2
        })
      )
    ).toMatchObject({ status: 'bonus', scoreThirds: 6, maxThirds: 6 });
  });

  it('never invents a score from defective or incomplete metadata', () => {
    expect(scoreGateOutcome(outcome({ marks: null }))).toMatchObject({
      status: 'unscorable',
      reason: 'missing-marks'
    });
    expect(
      scoreGateOutcome(
        outcome({ questionType: 'AMBIGUOUS', answerStatus: 'ambiguous', correctness: null })
      )
    ).toMatchObject({ status: 'unscorable', reason: 'ambiguous-answer' });
    expect(
      scoreGateOutcome(
        outcome({ questionType: 'UNSUPPORTED', answerStatus: 'unsupported', correctness: null })
      )
    ).toMatchObject({ status: 'unscorable', reason: 'unsupported-answer' });
    expect(scoreGateOutcome(outcome({ correctness: null }))).toMatchObject({
      status: 'unscorable',
      reason: 'missing-correctness'
    });
    expect(
      scoreGateOutcome(
        outcome({ questionType: 'MARKS_TO_ALL', answerStatus: 'available', correctness: null })
      )
    ).toMatchObject({ status: 'unscorable', reason: 'conflicting-bonus-metadata' });
  });

  it('rejects multiple MCQ selections rather than grading only the first', () => {
    expect(
      scoreGateAnswer({
        questionType: 'MCQ',
        marks: 1,
        answerStatus: 'available',
        decision: 'MARK',
        selectedAnswer: ['B', 'C'],
        correctAnswer: 'B'
      })
    ).toMatchObject({ outcome: 'wrong', scoreThirds: -1 });
  });

  it('leaves missing responses and malformed answer keys unscorable', () => {
    expect(
      scoreGateAnswer({
        questionType: 'NAT',
        marks: 1,
        answerStatus: 'available',
        decision: 'MARK',
        selectedAnswer: '',
        correctAnswer: 0
      })
    ).toMatchObject({ status: 'unscorable', reason: 'missing-correctness' });
    expect(
      scoreGateAnswer({
        questionType: 'NAT',
        marks: 1,
        answerStatus: 'available',
        decision: 'MARK',
        selectedAnswer: 42,
        correctAnswer: [42, 'not-a-number']
      })
    ).toMatchObject({ status: 'unscorable', reason: 'missing-correctness' });
  });

  it('aggregates penalties exactly in thirds', () => {
    const oneMarkWrong = scoreGateOutcome(outcome({ correctness: false }));
    const aggregate = aggregateGateScores([oneMarkWrong, oneMarkWrong, oneMarkWrong]);
    expect(aggregate).toEqual({
      scoreThirds: -3,
      maxThirds: 9,
      scoreMarks: -1,
      maxMarks: 3,
      scoredCount: 3,
      bonusCount: 0,
      unscorableCount: 0
    });
  });
});
