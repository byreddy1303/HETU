import { describe, expect, it } from 'vitest';
import {
  checkpointPyqExamSession,
  createPyqExamConfig,
  finalizePyqExam,
  setPyqExamClosedBookConfirmed,
  setPyqExamResponse
} from '@/lib/pyq-exam';
import { mockTestFromFinalizedPyqExam } from '@/lib/pyq-mock-evidence';
import type { PyqQuestion } from '@/lib/pyq';
import { createPyqSessionRow } from '@/lib/pyq-session';
import type { PyqSessionConfig, PyqSessionRow } from '@/types';

const START_MS = Date.parse('2026-08-24T04:30:00.000Z');

const baseConfig: PyqSessionConfig = {
  subjectSlug: 'all',
  topicSlug: 'all',
  fromYear: 2026,
  toYear: 2026,
  type: 'all',
  order: 'unseen',
  count: 'all'
};

function fullPaperQuestions(): PyqQuestion[] {
  return Array.from({ length: 65 }, (_, index) => ({
    id: `mock-evidence-${index + 1}`,
    year: 2026,
    set: 1,
    number: String(index + 1),
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    topic: 'Shortest Path',
    topicSlug: 'shortest-path',
    subtopics: ['Shortest paths'],
    marks: index < 30 ? 1 : 2,
    type: 'MCQ',
    answer: 'B',
    tolerance: null,
    answerStatus: 'available',
    html: `<p>Question ${index + 1}</p>`,
    sourceUrl: `https://gateoverflow.in/mock-evidence/${index + 1}`,
    answerSource: null
  }));
}

function fullPaperSession(
  questions: readonly PyqQuestion[],
  priorExposureQuestionUids: readonly string[] = []
): PyqSessionRow {
  const config = createPyqExamConfig(
    {
      ...baseConfig,
      examKind: 'full-paper',
      benchmarkPaperId: 'gate-cse-2026-set-1'
    },
    questions.map((question) => question.id),
    {
      paperMetadata: { questionCount: 65, maxMarks: 100 },
      priorExposureQuestionUids
    },
    START_MS
  );
  return createPyqSessionRow(
    '11111111-1111-4111-8111-111111111111',
    'mock-evidence-bank',
    config,
    [...questions],
    new Date(START_MS).toISOString()
  );
}

describe('PYQ full-paper mock evidence bridge', () => {
  it('creates one deterministic qualified mock row from a valid finalized paper', () => {
    const questions = fullPaperQuestions();
    let session = fullPaperSession(questions);
    session = setPyqExamClosedBookConfirmed(session, true, START_MS + 100);
    session = setPyqExamResponse(session, questions[0], 'B', START_MS + 500);
    for (let index = 1; index < questions.length; index += 1) {
      session = checkpointPyqExamSession(session, questions[index].id, START_MS + index * 1_000);
    }
    const finalized = finalizePyqExam({
      userId: session.user_id,
      session,
      questions,
      bankVersion: 'mock-evidence-bank',
      reason: 'manual',
      nowMs: START_MS + 60 * 60_000
    });

    const row = mockTestFromFinalizedPyqExam({
      session: finalized.session,
      attempts: finalized.attempts,
      timeZone: 'UTC'
    });
    const repeatedConversion = mockTestFromFinalizedPyqExam({
      session: finalized.session,
      attempts: finalized.attempts,
      timeZone: 'UTC'
    });

    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      user_id: session.user_id,
      name: 'GATE CSE 2026 Set 1',
      test_date: '2026-08-24',
      total_marks: 1,
      max_marks: 100,
      total_questions: 65,
      correct: 1,
      wrong: 0,
      skipped: 64,
      duration_min: 60,
      source_kind: 'pyq_exam',
      source_pyq_session_id: session.id,
      paper_scope: 'full_length',
      freshness: 'unseen',
      timed: true,
      closed_book: true,
      single_sitting: true,
      evidence_status: 'qualified',
      evidence_reasons: [],
      scoring_coverage_pct: 100
    });
    expect(repeatedConversion?.id).toBe(row?.id);
  });

  it('retains concrete compromise reasons when a repeated short run is only supporting', () => {
    const questions = fullPaperQuestions();
    const session = fullPaperSession(questions, [questions[0].id]);
    const finalized = finalizePyqExam({
      userId: session.user_id,
      session,
      questions,
      bankVersion: 'mock-evidence-bank',
      reason: 'manual',
      nowMs: START_MS + 10 * 60_000
    });

    const row = mockTestFromFinalizedPyqExam({
      session: finalized.session,
      attempts: finalized.attempts,
      timeZone: 'UTC'
    });

    expect(row).toMatchObject({
      freshness: 'partially_seen',
      closed_book: false,
      single_sitting: true,
      evidence_status: 'supporting'
    });
    expect(row?.evidence_reasons).toEqual(
      expect.arrayContaining([
        'incomplete-visit-coverage',
        'low-active-time',
        'freshness-not-unseen',
        'not-closed-book'
      ])
    );
  });

  it('does not copy a short timed set into the mock ledger', () => {
    const [question] = fullPaperQuestions();
    const config = createPyqExamConfig(baseConfig, [question.id], START_MS);
    const session = createPyqSessionRow(
      '11111111-1111-4111-8111-111111111111',
      'mock-evidence-bank',
      config,
      [question],
      new Date(START_MS).toISOString()
    );
    const finalized = finalizePyqExam({
      userId: session.user_id,
      session,
      questions: [question],
      bankVersion: 'mock-evidence-bank',
      reason: 'manual',
      nowMs: START_MS + 30_000
    });

    expect(
      mockTestFromFinalizedPyqExam({
        session: finalized.session,
        attempts: finalized.attempts
      })
    ).toBeNull();
  });
});
