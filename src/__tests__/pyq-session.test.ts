import { describe, expect, it } from 'vitest';
import {
  createPyqAttemptRow,
  createPyqReattemptAttemptRow,
  createPyqSessionRow,
  pyqAttemptId,
  pyqJournalQuestionId,
  pyqQuestionFromAttempt,
  pyqReattemptAttemptId,
  pyqSourceAttemptForJournalQuestion,
  pyqPracticeSessionRow,
  pyqPracticeSubject,
  advancePyqSessionProgress,
  completePyqSession,
  abandonPyqSession,
  startPyqSessionQuestion
} from '@/lib/pyq-session';
import type { PyqSessionConfig } from '@/types';
import type { PyqQuestion } from '@/lib/pyq';

const mockConfig: PyqSessionConfig = {
  subjectSlug: 'algorithms',
  topicSlug: 'shortest-path',
  fromYear: 2020,
  toYear: 2026,
  type: 'all',
  order: 'unseen',
  count: '10'
};

const question: PyqQuestion = {
  id: 'gate-2026-set1-q1',
  year: 2026,
  set: 1,
  number: '1',
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
  html: '<p>Choose the shortest path.</p>',
  sourceUrl: 'https://gateoverflow.in/test',
  answerSource: null
};

describe('PYQ session logic and determinism', () => {
  it('creates an active session row with initial progress', () => {
    const session = createPyqSessionRow('user-1', '1.0.0', mockConfig, [
      { id: 'q1' },
      { id: 'q2' }
    ]);
    expect(session.user_id).toBe('user-1');
    expect(session.bank_version).toBe('1.0.0');
    expect(session.status).toBe('active');
    expect(session.question_uids).toEqual(['q1', 'q2']);
    expect(session.completed_question_uids).toEqual([]);
    expect(session.current_index).toBe(0);
    expect(session.completed_count).toBe(0);
    expect(session.current_question_uid).toBe('q1');
    expect(session.current_question_started_at).not.toBeNull();
  });

  it('generates deterministic attempt and journal question IDs', () => {
    const attemptId1 = pyqAttemptId('session-1', 'q1', 1);
    const attemptId2 = pyqAttemptId('session-1', 'q1', 1);
    const journalId1 = pyqJournalQuestionId(attemptId1);
    const journalId2 = pyqJournalQuestionId(attemptId1);

    expect(attemptId1).toBe(attemptId2);
    expect(journalId1).toBe(journalId2);
    expect(attemptId1).not.toBe(journalId1);
  });

  it('advances session progress correctly', () => {
    const session = createPyqSessionRow('user-1', '1.0.0', mockConfig, [
      { id: 'q1' },
      { id: 'q2' },
      { id: 'q3' }
    ]);
    const advanced = advancePyqSessionProgress(session, 'q1', 1, 17);
    expect(advanced.completed_question_uids).toEqual(['q1']);
    expect(advanced.current_index).toBe(1);
    expect(advanced.completed_count).toBe(1);
    expect(advanced.elapsed_sec).toBe(17);
    expect(advanced.current_question_uid).toBeNull();
    expect(advanced.current_question_started_at).toBeNull();

    const duplicate = advancePyqSessionProgress(advanced, 'q1', 1, 17);
    expect(duplicate.elapsed_sec).toBe(17);
  });

  it('restores a persisted question start without resetting its timer', () => {
    const session = createPyqSessionRow(
      'user-1',
      '1.0.0',
      mockConfig,
      [{ id: 'q1' }],
      '2026-08-08T08:00:00.000Z'
    );
    expect(startPyqSessionQuestion(session, 'q1', '2026-08-08T08:01:00.000Z')).toBe(session);
  });

  it('completes and abandons sessions properly', () => {
    const session = createPyqSessionRow('user-1', '1.0.0', mockConfig, [
      { id: 'q1' },
      { id: 'q2' }
    ]);
    const completed = completePyqSession(session);
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).not.toBeNull();
    expect(completed.current_index).toBe(2);

    const abandoned = abandonPyqSession(session);
    expect(abandoned.status).toBe('abandoned');
  });

  it('projects a PYQ set into the canonical session stream', () => {
    const active = createPyqSessionRow(
      'user-1',
      '1.0.0',
      mockConfig,
      [question],
      '2026-08-08T08:00:00.000Z'
    );
    const completed = completePyqSession(
      advancePyqSessionProgress(active, question.id, 1, 61),
      '2026-08-08T08:02:00.000Z'
    );
    const canonical = pyqPracticeSessionRow(completed, pyqPracticeSubject([question]), 'UTC');

    expect(canonical).toMatchObject({
      id: completed.id,
      user_id: 'user-1',
      kind: 'pyq',
      date: '2026-08-08',
      subject: 'Algorithms',
      target_duration_min: 0,
      actual_duration_min: 2
    });
  });

  it('captures the learner answer separately from the official key with exact timing', () => {
    const session = createPyqSessionRow(
      'user-1',
      '2.0.0',
      mockConfig,
      [question],
      '2026-08-08T08:00:00.000Z'
    );
    const attempt = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question,
      selectedAnswer: 'A',
      decision: 'MARK',
      bankVersion: '2.0.0',
      questionStartedAtMs: Date.parse('2026-08-08T08:00:00.000Z'),
      committedAtMs: Date.parse('2026-08-08T08:00:12.345Z'),
      screenshotUrl: 'data:image/png;base64,test'
    });

    expect(attempt.selected_answer).toBe('A');
    expect(attempt.correct_answer).toBe('B');
    expect(attempt.mark_correct).toBe(false);
    expect(attempt.capture_version).toBe(2);
    expect(attempt.question_started_at).toBe('2026-08-08T08:00:00.000Z');
    expect(attempt.attempted_at).toBe('2026-08-08T08:00:12.345Z');
    expect(attempt.time_spent_ms).toBe(12_345);
    expect(attempt.time_spent_sec).toBe(13);
    expect(attempt.question_snapshot).toMatchObject({
      question_uid: question.id,
      number: '1',
      topic: 'Shortest Path',
      topic_slug: 'shortest-path',
      type: 'MCQ',
      html: question.html
    });
  });

  it('records skips without a phantom learner answer', () => {
    const session = createPyqSessionRow('user-1', '2.0.0', mockConfig, [question]);
    const attempt = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question,
      selectedAnswer: null,
      decision: 'SKIP',
      bankVersion: '2.0.0',
      questionStartedAtMs: 1_000,
      committedAtMs: 1_001,
      screenshotUrl: null
    });

    expect(attempt.selected_answer).toBeNull();
    expect(attempt.correct_answer).toBe('B');
    expect(attempt.mark_correct).toBeNull();
    expect(attempt.time_spent_ms).toBe(1);
    expect(attempt.time_spent_sec).toBe(1);
  });

  it('reconstructs an exact PYQ and creates a durable second-attempt receipt', () => {
    const session = createPyqSessionRow('user-1', '2.0.0', mockConfig, [question]);
    const firstAttempt = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question,
      selectedAnswer: 'A',
      decision: 'MARK',
      bankVersion: '2.0.0',
      questionStartedAtMs: 1_000,
      committedAtMs: 2_000,
      screenshotUrl: 'data:image/png;base64,first'
    });
    const journalQuestionId = pyqJournalQuestionId(firstAttempt.id);

    expect(pyqSourceAttemptForJournalQuestion(journalQuestionId, [firstAttempt])).toBe(
      firstAttempt
    );
    expect(pyqSourceAttemptForJournalQuestion('unrelated-journal-row', [firstAttempt])).toBeNull();

    const legacyAttempt = {
      ...firstAttempt,
      id: 'legacy-attempt',
      capture_version: 1 as const,
      question_snapshot: null,
      pyq_session_id: null
    };
    expect(
      pyqSourceAttemptForJournalQuestion(
        {
          id: 'random-legacy-journal-id',
          session_id: null,
          subject: legacyAttempt.subject,
          source_year: legacyAttempt.year,
          source_ref: 'GATE PYQ · 2026 · Q 1 · MCQ',
          created_at: legacyAttempt.attempted_at
        },
        [legacyAttempt]
      )
    ).toBe(legacyAttempt);

    const restored = pyqQuestionFromAttempt(firstAttempt);
    expect(restored).toMatchObject({
      id: question.id,
      html: question.html,
      answer: 'B',
      type: 'MCQ'
    });

    const secondAttempt = createPyqReattemptAttemptRow({
      userId: 'user-1',
      reattemptId: 'reattempt-1',
      completedRoundCount: 0,
      sourceAttempt: firstAttempt,
      question: restored!,
      selectedAnswer: 'B',
      decision: 'MARK',
      questionStartedAtMs: 3_000,
      committedAtMs: 4_250,
      screenshotUrl: 'data:image/png;base64,second',
      attemptNumber: 2
    });

    expect(secondAttempt).toMatchObject({
      id: pyqReattemptAttemptId('reattempt-1', 0),
      pyq_session_id: null,
      question_uid: question.id,
      attempt_number: 2,
      selected_answer: 'B',
      correct_answer: 'B',
      mark_correct: true,
      capture_version: 2
    });
  });
});
