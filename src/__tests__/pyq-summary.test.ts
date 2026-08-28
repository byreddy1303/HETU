import { describe, expect, it } from 'vitest';
import {
  checkpointPyqExamSession,
  createPyqExamConfig,
  finalizePyqExam,
  setPyqExamConfidence,
  setPyqExamResponse,
  setPyqExamReviewMark
} from '@/lib/pyq-exam';
import type { PyqQuestion } from '@/lib/pyq';
import { createPyqAttemptRow, createPyqSessionRow } from '@/lib/pyq-session';
import { buildPyqSessionSummary, latestPyqSessionAttempts } from '@/lib/pyq-summary';
import type { PyqSessionConfig, PyqSessionRow } from '@/types';

const START_MS = Date.parse('2026-08-24T04:30:00.000Z');

const baseConfig: PyqSessionConfig = {
  subjectSlug: 'algorithms',
  topicSlug: 'shortest-path',
  fromYear: 2020,
  toYear: 2026,
  type: 'all',
  order: 'unseen',
  count: '5'
};

function question(id: string, overrides: Partial<PyqQuestion> = {}): PyqQuestion {
  return {
    year: 2026,
    set: 1,
    number: id,
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    topic: 'Shortest Path',
    topicSlug: 'shortest-path',
    subtopics: ['Shortest paths'],
    marks: 1,
    type: 'MCQ',
    answer: 'B',
    tolerance: null,
    answerStatus: 'available',
    html: `<p>${id}</p>`,
    sourceUrl: `https://gateoverflow.in/${id}`,
    answerSource: null,
    ...overrides,
    id
  };
}

function examSession(questions: readonly PyqQuestion[], nowMs = START_MS): PyqSessionRow {
  const config = createPyqExamConfig(
    baseConfig,
    questions.map((candidate) => candidate.id),
    nowMs
  );
  return createPyqSessionRow(
    'user-1',
    'bank-3',
    config,
    [...questions],
    new Date(nowMs).toISOString()
  );
}

describe('PYQ session summary aggregation', () => {
  it('keeps the latest practice outcome while summing time across skip-and-retry receipts', () => {
    const candidate = question('practice-retry');
    const session = createPyqSessionRow(
      'user-1',
      'bank-3',
      baseConfig,
      [candidate],
      new Date(START_MS).toISOString()
    );
    const skipped = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: candidate,
      selectedAnswer: null,
      decision: 'SKIP',
      bankVersion: 'bank-3',
      questionStartedAtMs: START_MS,
      committedAtMs: START_MS + 2_000,
      screenshotUrl: null,
      attemptNumber: 1
    });
    const answered = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: candidate,
      selectedAnswer: 'B',
      decision: 'MARK',
      bankVersion: 'bank-3',
      questionStartedAtMs: START_MS + 2_000,
      committedAtMs: START_MS + 7_000,
      screenshotUrl: null,
      attemptNumber: 2,
      retryingSkippedAttempt: true
    });

    const summary = buildPyqSessionSummary(session, [skipped, answered]);

    expect(summary.questions[0]).toMatchObject({
      attempt: answered,
      outcome: 'correct',
      timeSpentMs: 7_000,
      timeSpentSec: 7
    });
  });

  it('rounds cumulative retry timing once instead of summing per-receipt rounding', () => {
    const candidate = question('practice-subsecond-retry');
    const session = createPyqSessionRow(
      'user-1',
      'bank-3',
      baseConfig,
      [candidate],
      new Date(START_MS).toISOString()
    );
    const skipped = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: candidate,
      selectedAnswer: null,
      decision: 'SKIP',
      bankVersion: 'bank-3',
      questionStartedAtMs: START_MS,
      committedAtMs: START_MS + 500,
      timeSpentMs: 500,
      screenshotUrl: null,
      attemptNumber: 1
    });
    const answered = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: candidate,
      selectedAnswer: 'B',
      decision: 'MARK',
      bankVersion: 'bank-3',
      questionStartedAtMs: START_MS + 500,
      committedAtMs: START_MS + 1_000,
      timeSpentMs: 500,
      screenshotUrl: null,
      attemptNumber: 2,
      retryingSkippedAttempt: true
    });

    const summary = buildPyqSessionSummary(session, [skipped, answered]);

    expect(summary.questions[0]).toMatchObject({
      attempt: answered,
      timeSpentMs: 1_000,
      timeSpentSec: 1
    });
  });

  it('uses only the latest receipt per question while retaining the raw receipt audit count', () => {
    const candidate = question('q1');
    const session = examSession([candidate]);
    const first = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: candidate,
      selectedAnswer: 'B',
      decision: 'MARK',
      bankVersion: 'bank-3',
      questionStartedAtMs: START_MS,
      committedAtMs: START_MS + 2_000,
      screenshotUrl: null,
      attemptNumber: 1
    });
    const second = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: candidate,
      selectedAnswer: 'A',
      decision: 'MARK',
      bankVersion: 'bank-3',
      questionStartedAtMs: START_MS,
      committedAtMs: START_MS + 1_000,
      screenshotUrl: null,
      attemptNumber: 2
    });
    const unrelated = {
      ...first,
      id: 'other-session-receipt',
      pyq_session_id: 'other-session'
    };

    const latest = latestPyqSessionAttempts([first, second]);
    expect(latest.size).toBe(1);
    expect(latest.get('q1')).toBe(second);

    const summary = buildPyqSessionSummary(session, [first, second, unrelated]);
    expect(summary.rawReceiptCount).toBe(2);
    expect(summary.totalQuestions).toBe(1);
    expect(summary.questions).toHaveLength(1);
    expect(summary.questions[0]).toMatchObject({
      questionUid: 'q1',
      attempt: second,
      outcome: 'wrong',
      attemptOrder: 0
    });
    expect(summary).toMatchObject({
      answered: 1,
      correct: 0,
      wrong: 1,
      skipped: 0,
      scoringCoverageCount: 1
    });
    expect(summary.penaltyMarks).toBeCloseTo(1 / 3);
    expect(summary.resultantMarks).toBeCloseTo(-1 / 3);
  });

  it('reports totals, exact marks, status flags, and per-question time for a submitted exam', () => {
    const questions = [
      question('q1', { marks: 2, type: 'MCQ', answer: 'B' }),
      question('q2', { marks: 1, type: 'MCQ', answer: 'B' }),
      question('q3', { marks: 2, type: 'MSQ', answer: ['B', 'D'] }),
      question('q4', { marks: 2, type: 'NAT', answer: 42, tolerance: { abs: 0.01 } })
    ];
    let session = examSession(questions);

    session = setPyqExamResponse(session, questions[0], 'B', START_MS + 100);
    session = setPyqExamConfidence(session, 'q1', 'high', START_MS + 200);
    session = checkpointPyqExamSession(session, 'q2', START_MS + 1_000);
    session = setPyqExamResponse(session, questions[1], 'A', START_MS + 1_200);
    session = setPyqExamReviewMark(session, 'q2', true, START_MS + 1_300);
    session = setPyqExamConfidence(session, 'q2', 'medium', START_MS + 1_500);
    session = checkpointPyqExamSession(session, 'q3', START_MS + 3_500);
    session = setPyqExamResponse(session, questions[2], ['B'], START_MS + 4_000);
    session = checkpointPyqExamSession(session, 'q4', START_MS + 7_000);
    session = setPyqExamReviewMark(session, 'q4', true, START_MS + 7_500);
    session = setPyqExamConfidence(session, 'q4', 'low', START_MS + 7_600);

    const finalized = finalizePyqExam({
      userId: 'user-1',
      session,
      questions,
      bankVersion: 'bank-3',
      reason: 'manual',
      nowMs: START_MS + 11_000
    });
    const summary = buildPyqSessionSummary(finalized.session, finalized.attempts);

    expect(summary).toMatchObject({
      totalQuestions: 4,
      rawReceiptCount: 4,
      answered: 3,
      correct: 1,
      wrong: 2,
      skipped: 1,
      bonus: 0,
      unscorable: 0,
      notVisited: 0,
      markedForReview: 2,
      confidence: { high: 1, medium: 1, low: 1, unset: 1 },
      oneMarkQuestions: 1,
      twoMarkQuestions: 3,
      knownMaxMarks: 7,
      coveredMaxMarks: 7,
      scoringCoverageCount: 4,
      gradedAccuracyPercent: 33,
      scorePercent: 24,
      elapsedSec: 11,
      durationSec: 720
    });
    expect(summary.correctMarks).toBe(2);
    expect(summary.penaltyMarks).toBeCloseTo(1 / 3);
    expect(summary.resultantMarks).toBeCloseTo(5 / 3);
    expect(
      summary.questions.map((entry) => ({
        id: entry.questionUid,
        outcome: entry.outcome,
        visited: entry.visited,
        review: entry.markedForReview,
        confidence: entry.confidence,
        time: entry.timeSpentSec,
        scoreThirds: entry.scoreThirds
      }))
    ).toEqual([
      {
        id: 'q1',
        outcome: 'correct',
        visited: true,
        review: false,
        confidence: 'high',
        time: 1,
        scoreThirds: 6
      },
      {
        id: 'q2',
        outcome: 'wrong',
        visited: true,
        review: true,
        confidence: 'medium',
        time: 3,
        scoreThirds: -1
      },
      {
        id: 'q3',
        outcome: 'wrong',
        visited: true,
        review: false,
        confidence: null,
        time: 4,
        scoreThirds: 0
      },
      {
        id: 'q4',
        outcome: 'skipped',
        visited: true,
        review: true,
        confidence: 'low',
        time: 4,
        scoreThirds: 0
      }
    ]);
  });
});
