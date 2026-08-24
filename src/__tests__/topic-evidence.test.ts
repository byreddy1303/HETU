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

  it('resolves immutable PYQ evidence through an audited bank topic key', () => {
    const bankAttempt = attempt('a0', true);
    bankAttempt.subject = 'Database Management System';
    bankAttempt.question_snapshot = {
      subject_slug: 'databases',
      topic_slug: 'relational-algebra',
      topic: 'Relational Algebra'
    } as PyqAttemptRow['question_snapshot'];

    expect(
      build({
        subject: 'Databases',
        topic: 'Relational model: relational algebra, tuple calculus and SQL',
        bankTopicKeys: ['databases/relational-algebra'],
        attempts: [bankAttempt]
      })
    ).toMatchObject({ practiced: 1, judged: 1, correct: 1 });
  });

  it('does not let a disallowed bank key fall through to a matching display label', () => {
    const broadAttempt = attempt('a0', false);
    broadAttempt.subject = 'General Aptitude';
    broadAttempt.question_snapshot = {
      subject_slug: 'general-aptitude',
      topic_slug: 'general-aptitude',
      topic: 'Reading comprehension and narrative sequencing'
    } as PyqAttemptRow['question_snapshot'];
    const linkedAnalysis = {
      id: 'linked-broad-analysis',
      subject: 'General Aptitude',
      subtopic: 'Reading comprehension and narrative sequencing',
      outcome: 'W-C',
      source_pyq_attempt_id: broadAttempt.id,
      created_at: broadAttempt.attempted_at
    } as QuestionRow;

    expect(
      build({
        subject: 'General Aptitude',
        topic: 'Reading comprehension and narrative sequencing',
        bankTopicKeys: [],
        attempts: [broadAttempt],
        questions: [linkedAnalysis],
        reattempts: [{ question_id: linkedAnalysis.id, stage: 'D3' } as ReattemptRow]
      })
    ).toMatchObject({
      status: 'not-started',
      practiced: 0,
      judged: 0,
      openMistakes: 0
    });
  });

  it('resolves a safe legacy detailed tag without accepting an unrelated topic', () => {
    const legacy = {
      id: 'legacy-sql',
      subject: 'DBMS',
      subtopic: 'SQL — Joins & Subqueries',
      outcome: 'R',
      mark_decision: 'MARK',
      mark_correct: true,
      time_spent_sec: 90,
      created_at: '2026-08-09T10:00:00Z'
    } as QuestionRow;
    const supporting = {
      ...legacy,
      id: 'legacy-recovery',
      subtopic: 'Recovery — Logging & Checkpoints'
    } as QuestionRow;

    expect(
      build({
        subject: 'Databases',
        topic: 'Relational model: relational algebra, tuple calculus and SQL',
        topicAliases: [{ subject: 'Databases', topic: 'SQL — Joins & Subqueries' }],
        questions: [legacy, supporting]
      })
    ).toMatchObject({ practiced: 1, judged: 1, correct: 1 });
  });

  it('does not claim strong mastery from a broad topic mapping', () => {
    const attempts = [0, 1, 2, 3, 4].map((index) => attempt(`a${index}`, index !== 4));
    expect(build({ attempts, allowStrong: false })).toMatchObject({
      status: 'active',
      practiced: 5,
      accuracy: 0.8
    });
  });
});
