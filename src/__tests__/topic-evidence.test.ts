import { describe, expect, it } from 'vitest';
import type { PyqAttemptRow, QuestionRow, ReattemptRow } from '@/types';
import { buildTopicEvidence } from '@/lib/topic-evidence';

function build(overrides: Partial<Parameters<typeof buildTopicEvidence>[0]> = {}) {
  return buildTopicEvidence({
    subject: 'Databases',
    topic: 'Transactions',
    studiedAt: null,
    questions: [],
    attempts: [],
    reattempts: [],
    today: '2026-08-10',
    ...overrides
  });
}

function attempt(id: string, correct: boolean): PyqAttemptRow {
  return {
    id,
    subject: 'Databases',
    question_uid: id,
    mark_correct: correct,
    attempted_at: `2026-08-0${Number(id.slice(-1)) + 1}T10:00:00Z`,
    question_snapshot: { topic: 'Transactions' }
  } as PyqAttemptRow;
}

describe('topic evidence', () => {
  it('distinguishes untouched and manually studied topics', () => {
    expect(build().status).toBe('not-started');
    expect(build({ studiedAt: '2026-08-01T10:00:00Z' }).status).toBe('studied');
  });

  it('marks well-supported recent performance strong', () => {
    const attempts = [0, 1, 2, 3, 4].map((index) => attempt(`a${index}`, index !== 4));
    expect(build({ attempts })).toMatchObject({
      status: 'strong',
      judged: 5,
      correct: 4,
      accuracy: 0.8
    });
  });

  it('marks open reattempt evidence as needing revision', () => {
    const question = {
      id: 'journal-1',
      subject: 'Databases',
      subtopic: 'Transactions',
      outcome: 'W-C',
      created_at: '2026-08-09T10:00:00Z'
    } as QuestionRow;
    const reattempt = { question_id: question.id, stage: 'D3' } as ReattemptRow;
    expect(build({ questions: [question], reattempts: [reattempt] })).toMatchObject({
      status: 'needs-revision',
      openMistakes: 1
    });
  });

  it('combines PYQ and independently logged evidence without double-counting analysis rows', () => {
    const manual = {
      id: 'manual-1',
      subject: 'Databases',
      subtopic: 'Transactions',
      outcome: 'R',
      created_at: '2026-08-09T10:00:00Z'
    } as QuestionRow;
    expect(build({ questions: [manual], attempts: [attempt('a0', false)] })).toMatchObject({
      practiced: 2,
      judged: 2,
      correct: 1,
      accuracy: 0.5
    });
  });
});
