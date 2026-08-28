import { describe, expect, it } from 'vitest';
import type { PyqQuestionSummary } from '@/lib/pyq-summary';
import { buildPyqImprovementInsights } from '@/lib/pyq-improvement-insights';

function summaryQuestion(
  questionNumber: number,
  overrides: Partial<PyqQuestionSummary> = {}
): PyqQuestionSummary {
  return {
    questionUid: `q${questionNumber}`,
    questionNumber,
    attemptOrder: questionNumber - 1,
    attempt: null,
    outcome: 'correct',
    visited: true,
    markedForReview: false,
    confidence: null,
    timeSpentSec: 60,
    scoreThirds: 3,
    maxThirds: 3,
    scoringCovered: true,
    ...overrides
  };
}

describe('PYQ improvement insights', () => {
  it('derives pace, time sink, accuracy, rushed misses, slow low returns, and review priority', () => {
    const insights = buildPyqImprovementInsights([
      summaryQuestion(1, { timeSpentSec: 60 }),
      summaryQuestion(2, {
        outcome: 'wrong',
        timeSpentSec: 30,
        scoreThirds: -1
      }),
      summaryQuestion(3, {
        outcome: 'wrong',
        timeSpentSec: 180,
        scoreThirds: -2,
        maxThirds: 6
      }),
      summaryQuestion(4, {
        outcome: 'skipped',
        timeSpentSec: 150,
        scoreThirds: 0
      }),
      summaryQuestion(5, {
        timeSpentSec: 120,
        scoreThirds: 6,
        maxThirds: 6
      })
    ]);

    expect(insights).toMatchObject({
      timedQuestionCount: 5,
      medianPaceSec: 120,
      incorrectTimeSec: 210,
      incorrectTimedCount: 2,
      correctCount: 2,
      incorrectCount: 2,
      gradedAttemptCount: 4
    });
    expect(insights.fastIncorrectQuestions.map((question) => question.questionNumber)).toEqual([2]);
    expect(insights.slowLowReturnQuestions.map((question) => question.questionNumber)).toEqual([
      3, 4
    ]);
    expect(insights.reviewFirstQuestion?.questionNumber).toBe(3);
  });

  it('averages the middle timings for an even-sized session without rounding the boundary', () => {
    const insights = buildPyqImprovementInsights([
      summaryQuestion(1, { timeSpentSec: 60 }),
      summaryQuestion(2, { timeSpentSec: 121 })
    ]);

    expect(insights.medianPaceSec).toBe(90.5);
  });

  it('keeps half-median and median ties neutral and excludes unscorable rows from mark-return claims', () => {
    const insights = buildPyqImprovementInsights([
      summaryQuestion(1, {
        outcome: 'wrong',
        timeSpentSec: 60,
        scoreThirds: -1
      }),
      summaryQuestion(2, {
        outcome: 'wrong',
        timeSpentSec: 120,
        scoreThirds: 0
      }),
      summaryQuestion(3, {
        outcome: 'wrong',
        timeSpentSec: 180,
        scoreThirds: null,
        maxThirds: null,
        scoringCovered: false
      })
    ]);

    expect(insights.medianPaceSec).toBe(120);
    expect(insights.fastIncorrectQuestions).toEqual([]);
    expect(insights.slowLowReturnQuestions).toEqual([]);
    expect(insights.reviewFirstQuestion).toBeNull();
  });

  it('does not fabricate pace or effort classifications from zero-time unvisited rows', () => {
    const insights = buildPyqImprovementInsights([
      summaryQuestion(1, {
        outcome: 'wrong',
        visited: false,
        timeSpentMs: 0,
        timeSpentSec: 0,
        scoreThirds: -1
      }),
      summaryQuestion(2, {
        outcome: 'skipped',
        visited: false,
        timeSpentMs: 0,
        timeSpentSec: 0,
        scoreThirds: 0
      })
    ]);

    expect(insights).toMatchObject({
      timedQuestionCount: 0,
      medianPaceSec: null,
      incorrectTimeSec: 0,
      incorrectTimedCount: 0,
      correctCount: 0,
      incorrectCount: 1,
      gradedAttemptCount: 1,
      fastIncorrectQuestions: [],
      slowLowReturnQuestions: [],
      reviewFirstQuestion: null
    });
  });

  it('uses exact milliseconds for classification when they are available', () => {
    const insights = buildPyqImprovementInsights([
      summaryQuestion(1, {
        outcome: 'wrong',
        timeSpentMs: 59_900,
        timeSpentSec: 60,
        scoreThirds: -1
      }),
      summaryQuestion(2, { timeSpentMs: 120_000, timeSpentSec: 120 }),
      summaryQuestion(3, { timeSpentMs: 180_000, timeSpentSec: 180 })
    ]);

    expect(insights.medianPaceSec).toBe(120);
    expect(insights.fastIncorrectQuestions.map((question) => question.questionNumber)).toEqual([1]);
    expect(insights.incorrectTimeSec).toBe(59.9);
  });

  it('breaks equal-effort review ties by marks lost and then question order', () => {
    const insights = buildPyqImprovementInsights([
      summaryQuestion(3, {
        outcome: 'wrong',
        timeSpentSec: 200,
        scoreThirds: -2,
        maxThirds: 6
      }),
      summaryQuestion(2, {
        outcome: 'wrong',
        timeSpentSec: 200,
        scoreThirds: -2,
        maxThirds: 6
      }),
      summaryQuestion(1, {
        outcome: 'wrong',
        timeSpentSec: 200,
        scoreThirds: -1
      }),
      summaryQuestion(4, { timeSpentSec: 60 }),
      summaryQuestion(5, { timeSpentSec: 80 }),
      summaryQuestion(6, { timeSpentSec: 100 }),
      summaryQuestion(7, { timeSpentSec: 120 })
    ]);

    expect(insights.medianPaceSec).toBe(120);
    expect(insights.reviewFirstQuestion?.questionNumber).toBe(2);
  });
});
