import { describe, expect, it } from 'vitest';
import {
  createPyqAttemptRow,
  createPyqReattemptAttemptRow,
  createPyqSessionRow,
  legacyPyqJournalQuestionId,
  nextPyqAttemptNumber,
  nextReattemptRoundAttemptNumber,
  pyqAttemptId,
  pyqJournalQuestionId,
  pyqAttemptScorePresentation,
  pyqQuestionFromAttempt,
  pyqReattemptAttemptId,
  pyqSourceAttemptForJournalQuestion,
  pyqPracticeSessionRow,
  pyqPracticeSubject,
  advancePyqSessionProgress,
  completePyqSession,
  abandonPyqSession,
  getPyqPracticeDraft,
  navigatePyqPracticeQuestion,
  pausePyqPracticeSession,
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

    const retry = advancePyqSessionProgress(advanced, 'q1', 1, 17);
    expect(retry.completed_question_uids).toEqual(['q1']);
    expect(retry.completed_count).toBe(1);
    expect(retry.elapsed_sec).toBe(34);
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

  it('preserves the response, confidence, and active timing when practice is paused', () => {
    const session = createPyqSessionRow(
      'user-1',
      '1.0.0',
      { ...mockConfig, mode: 'practice' },
      [{ id: 'q1' }],
      '2026-08-08T08:00:00.000Z'
    );
    const paused = pausePyqPracticeSession(
      session,
      { questionUid: 'q1', selectedAnswer: ['A', 'C'], markDecision: 'FIFTY_FIFTY' },
      Date.parse('2026-08-08T08:00:12.345Z')
    );

    expect(paused.status).toBe('paused');
    expect(paused.current_question_uid).toBeNull();
    expect(paused.current_question_started_at).toBeNull();
    expect(paused.config.practiceDraft).toEqual({
      question_uid: 'q1',
      selected_answer: ['A', 'C'],
      mark_decision: 'FIFTY_FIFTY',
      elapsed_ms: 12_345,
      first_started_at: '2026-08-08T08:00:00.000Z'
    });
  });

  it('accumulates repeated active segments without counting the paused gap', () => {
    const original = createPyqSessionRow(
      'user-1',
      '1.0.0',
      { ...mockConfig, mode: 'practice' },
      [{ id: 'q1' }],
      '2026-08-08T08:00:00.000Z'
    );
    const firstPause = pausePyqPracticeSession(
      original,
      { questionUid: 'q1', selectedAnswer: 'A', markDecision: 'MARK' },
      Date.parse('2026-08-08T08:00:10.000Z')
    );
    const resumed = startPyqSessionQuestion(
      { ...firstPause, status: 'active' },
      'q1',
      '2026-08-08T08:10:00.000Z'
    );
    const secondPause = pausePyqPracticeSession(
      resumed,
      { questionUid: 'q1', selectedAnswer: 'B', markDecision: 'MARK' },
      Date.parse('2026-08-08T08:10:05.500Z')
    );

    expect(secondPause.config.practiceDraft).toMatchObject({
      selected_answer: 'B',
      elapsed_ms: 15_500,
      first_started_at: '2026-08-08T08:00:00.000Z'
    });
  });

  it('clears a matching practice draft after its question is committed', () => {
    const active = createPyqSessionRow(
      'user-1',
      '1.0.0',
      { ...mockConfig, mode: 'practice' },
      [{ id: 'q1' }],
      '2026-08-08T08:00:00.000Z'
    );
    const paused = pausePyqPracticeSession(
      active,
      { questionUid: 'q1', selectedAnswer: 'B', markDecision: 'MARK' },
      Date.parse('2026-08-08T08:00:03.000Z')
    );
    const resumed = startPyqSessionQuestion(
      { ...paused, status: 'active' },
      'q1',
      '2026-08-08T08:05:00.000Z'
    );

    const advanced = advancePyqSessionProgress(resumed, 'q1', 1, 4);
    expect(advanced.config.practiceDraft).toBeUndefined();
    expect(advanced.config.practiceDrafts).toBeUndefined();
  });

  it('retains MCQ, MSQ and NAT drafts with independent active time across navigation', () => {
    const startedAt = Date.parse('2026-08-08T08:00:00.000Z');
    const original = createPyqSessionRow(
      'user-1',
      '1.0.0',
      { ...mockConfig, mode: 'practice', practiceView: 'multiple' },
      [{ id: 'mcq' }, { id: 'msq' }, { id: 'nat' }],
      new Date(startedAt).toISOString()
    );
    const atMsq = navigatePyqPracticeQuestion(
      original,
      'msq',
      { questionUid: 'mcq', selectedAnswer: 'B', markDecision: 'MARK', confidence: 'high' },
      startedAt + 5_000
    );
    const msqAnswer = ['A', 'C'];
    const atNat = navigatePyqPracticeQuestion(
      atMsq,
      'nat',
      { questionUid: 'msq', selectedAnswer: msqAnswer, markDecision: 'FIFTY_FIFTY' },
      startedAt + 12_000
    );
    msqAnswer.push('D');
    const backAtMcq = navigatePyqPracticeQuestion(
      atNat,
      'mcq',
      { questionUid: 'nat', selectedAnswer: '0.', markDecision: null, confidence: 'low' },
      startedAt + 23_000
    );
    const paused = pausePyqPracticeSession(
      backAtMcq,
      { questionUid: 'mcq', selectedAnswer: 'B', markDecision: 'MARK', confidence: 'high' },
      startedAt + 26_000
    );

    expect(getPyqPracticeDraft(paused, 'mcq')).toMatchObject({
      selected_answer: 'B',
      confidence: 'high',
      elapsed_ms: 8_000,
      first_started_at: original.started_at
    });
    expect(getPyqPracticeDraft(paused, 'msq')).toMatchObject({
      selected_answer: ['A', 'C'],
      elapsed_ms: 7_000,
      first_started_at: new Date(startedAt + 5_000).toISOString()
    });
    expect(getPyqPracticeDraft(paused, 'nat')).toMatchObject({
      selected_answer: '0.',
      confidence: 'low',
      elapsed_ms: 11_000
    });
    expect(backAtMcq.current_question_uid).toBe('mcq');
    expect(backAtMcq.config.practiceDraft?.selected_answer).toBe('B');
    expect(paused.current_index).toBe(0);
    expect(paused.completed_question_uids).toEqual([]);
    expect(paused.elapsed_sec).toBe(0);
  });

  it('preserves every draft over pause/resume and excludes the paused gap', () => {
    const original = createPyqSessionRow(
      'user-1',
      '1.0.0',
      { ...mockConfig, mode: 'practice', practiceView: 'multiple' },
      [{ id: 'q1' }, { id: 'q2' }],
      new Date(0).toISOString()
    );
    const secondQuestion = navigatePyqPracticeQuestion(
      original,
      'q2',
      { questionUid: 'q1', selectedAnswer: 0, markDecision: 'MARK' },
      2_000
    );
    const paused = pausePyqPracticeSession(
      secondQuestion,
      { questionUid: 'q2', selectedAnswer: ['B', 'D'], markDecision: 'FIFTY_FIFTY' },
      5_000
    );
    const resumed = startPyqSessionQuestion(
      { ...paused, status: 'active' },
      'q2',
      new Date(65_000).toISOString()
    );
    const returned = navigatePyqPracticeQuestion(
      resumed,
      'q1',
      { questionUid: 'q2', selectedAnswer: ['B', 'D'], markDecision: 'FIFTY_FIFTY' },
      69_000
    );
    expect(getPyqPracticeDraft(returned, 'q2')).toMatchObject({
      selected_answer: ['B', 'D'],
      elapsed_ms: 7_000,
      first_started_at: new Date(2_000).toISOString()
    });
    expect(returned.config.practiceDraft).toMatchObject({
      question_uid: 'q1',
      selected_answer: 0,
      elapsed_ms: 2_000
    });
  });

  it('migrates the legacy alias with precedence and bounds drafts to selected questions', () => {
    const original = createPyqSessionRow(
      'user-1',
      '1.0.0',
      { ...mockConfig, mode: 'practice' },
      [{ id: 'q1' }, { id: 'q2' }],
      new Date(0).toISOString()
    );
    const legacy = {
      question_uid: 'q2',
      selected_answer: 'B',
      mark_decision: 'MARK' as const,
      elapsed_ms: 4_000,
      first_started_at: new Date(0).toISOString()
    };
    const session = {
      ...original,
      config: {
        ...original.config,
        practiceDraft: legacy,
        practiceDrafts: {
          q2: { ...legacy, selected_answer: 'stale' },
          outside: { ...legacy, question_uid: 'outside' }
        }
      }
    };
    const navigated = navigatePyqPracticeQuestion(
      session,
      'q2',
      { questionUid: 'q1', selectedAnswer: 'A', markDecision: null },
      2_000
    );
    expect(getPyqPracticeDraft(session, 'q2')).toBe(legacy);
    expect(getPyqPracticeDraft(session, 'outside')).toBeUndefined();
    expect(navigated.config.practiceDraft).toBe(legacy);
    expect(Object.keys(navigated.config.practiceDrafts!).sort()).toEqual(['q1', 'q2']);
    expect(getPyqPracticeDraft(navigated, 'q1')?.elapsed_ms).toBe(2_000);
  });

  it('commits arbitrary practice order, preserves remaining drafts, and keeps progress monotonic', () => {
    const firstQuestion = { ...question, id: 'q1' };
    const lastQuestion = { ...question, id: 'q2' };
    const original = createPyqSessionRow(
      'user-1',
      '1.0.0',
      { ...mockConfig, mode: 'practice', practiceView: 'multiple' },
      [firstQuestion, lastQuestion],
      new Date(0).toISOString()
    );
    const atLastQuestion = navigatePyqPracticeQuestion(
      original,
      'q2',
      { questionUid: 'q1', selectedAnswer: 'A', markDecision: 'MARK' },
      2_000
    );
    const commit = (session: typeof original, candidate: PyqQuestion, committedAtMs: number) =>
      createPyqAttemptRow({
        userId: 'user-1',
        session,
        question: candidate,
        selectedAnswer: 'B',
        decision: 'MARK',
        bankVersion: '1.0.0',
        questionStartedAtMs: 2_000,
        committedAtMs,
        screenshotUrl: null
      });
    expect(commit(atLastQuestion, lastQuestion, 5_000).question_uid).toBe('q2');
    const lastCommitted = advancePyqSessionProgress(atLastQuestion, 'q2', 2, 3);
    expect(lastCommitted.current_index).toBe(2);
    expect(lastCommitted.completed_count).toBe(1);
    expect(lastCommitted.config.practiceDrafts?.q1.selected_answer).toBe('A');
    const returned = navigatePyqPracticeQuestion(lastCommitted, 'q1', null, 50_000);
    expect(returned.current_index).toBe(2);
    expect(returned.elapsed_sec).toBe(3);
    expect(returned.config.practiceDraft?.elapsed_ms).toBe(2_000);
    const singleView = {
      ...returned,
      config: { ...returned.config, practiceView: 'single' as const }
    };
    expect(commit(singleView, firstQuestion, 52_000).question_uid).toBe('q1');
    expect(() => commit(singleView, lastQuestion, 52_000)).toThrow(
      'Only the current PYQ can be committed.'
    );
    const allCommitted = advancePyqSessionProgress(singleView, 'q1', 1, 4);
    expect(allCommitted.current_index).toBe(2);
    expect(allCommitted.completed_count).toBe(2);
    expect(allCommitted.elapsed_sec).toBe(7);
    expect(allCommitted.config.practiceDraft).toBeUndefined();
    expect(allCommitted.config.practiceDrafts).toBeUndefined();
    expect(completePyqSession(allCommitted).status).toBe('completed');
  });

  it('clears only the committed draft while retaining a different resumable alias', () => {
    const original = createPyqSessionRow(
      'user-1',
      '1.0.0',
      mockConfig,
      [{ id: 'q1' }, { id: 'q2' }],
      new Date(0).toISOString()
    );
    const atSecond = navigatePyqPracticeQuestion(
      original,
      'q2',
      { questionUid: 'q1', selectedAnswer: 'A', markDecision: 'MARK' },
      1_000
    );
    const atFirst = navigatePyqPracticeQuestion(
      atSecond,
      'q1',
      { questionUid: 'q2', selectedAnswer: 'B', markDecision: 'MARK' },
      2_000
    );
    const committed = advancePyqSessionProgress(atFirst, 'q2', 2, 1);
    expect(committed.config.practiceDraft?.question_uid).toBe('q1');
    expect(Object.keys(committed.config.practiceDrafts!)).toEqual(['q1']);
    expect(atFirst.config.practiceDrafts?.q2).toBeDefined();
  });

  it('rejects invalid navigation without creating unowned or untimed checkpoints', () => {
    const original = createPyqSessionRow(
      'user-1',
      '1.0.0',
      mockConfig,
      [{ id: 'q1' }, { id: 'q2' }],
      new Date(0).toISOString()
    );
    expect(() => navigatePyqPracticeQuestion(original, 'outside', null, 2_000)).toThrow(
      'Question is not part of this PYQ set.'
    );
    expect(() => navigatePyqPracticeQuestion(original, 'q2', null, Number.NaN)).toThrow(
      'Practice navigation time must be valid.'
    );
    expect(() =>
      navigatePyqPracticeQuestion(
        original,
        'q2',
        { questionUid: 'q2', selectedAnswer: 'B', markDecision: null },
        2_000
      )
    ).toThrow('Only the current practice question can be checkpointed.');
    expect(() =>
      navigatePyqPracticeQuestion({ ...original, status: 'paused' }, 'q2', null, 2_000)
    ).toThrow('Only an active PYQ practice set can be navigated.');
    expect(() =>
      navigatePyqPracticeQuestion(
        { ...original, config: { ...original.config, mode: 'exam' } },
        'q2',
        null,
        2_000
      )
    ).toThrow('Timed exams must use the exam navigation flow.');
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
    expect(attempt.capture_version).toBe(3);
    expect(attempt).toMatchObject({
      question_type: 'MCQ',
      question_marks: 1,
      score_thirds: -1,
      scoring_status: 'scored',
      scoring_version: 1
    });
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
    expect(attempt.question_snapshot?.book_slug).toBe('gate-cse');
    expect(attempt.question_snapshot).not.toHaveProperty('choices');
    expect(pyqAttemptScorePresentation(attempt)).toEqual({
      label: 'GATE -⅓',
      covered: true,
      detail: 'Exact GATE-rule score using the stored question type and marks.'
    });
    expect(
      pyqAttemptScorePresentation({
        ...attempt,
        score_thirds: null,
        scoring_status: 'unscorable'
      })
    ).toEqual({
      label: 'Marks unavailable',
      covered: false,
      detail: 'Excluded because versioned scoring metadata is incomplete or inconsistent.'
    });
  });

  it('preserves a legacy allocation without forcing it through modern GATE scoring', () => {
    const legacyQuestion = { ...question, id: 'gate-1995-q7b', year: 1995, marks: 5 };
    const session = createPyqSessionRow('user-1', '2.0.0', mockConfig, [legacyQuestion]);
    const attempt = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: legacyQuestion,
      selectedAnswer: 'B',
      decision: 'MARK',
      bankVersion: '2.0.0',
      questionStartedAtMs: Date.parse('2026-08-08T08:00:00.000Z'),
      committedAtMs: Date.parse('2026-08-08T08:00:12.000Z'),
      screenshotUrl: null
    });

    expect(attempt.question_snapshot?.marks).toBe(5);
    expect(attempt.question_marks).toBeNull();
    expect(attempt.mark_correct).toBe(true);
    expect(attempt).toMatchObject({
      score_thirds: null,
      scoring_status: 'unscorable',
      scoring_version: 1
    });
  });

  it('uses explicit active-work timing while retaining the true first start', () => {
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
      selectedAnswer: 'B',
      decision: 'MARK',
      bankVersion: '2.0.0',
      questionStartedAtMs: Date.parse('2026-08-08T08:00:00.000Z'),
      committedAtMs: Date.parse('2026-08-08T08:30:00.000Z'),
      timeSpentMs: 15_500,
      screenshotUrl: null
    });

    expect(attempt.question_started_at).toBe('2026-08-08T08:00:00.000Z');
    expect(attempt.time_spent_ms).toBe(15_500);
    expect(attempt.time_spent_sec).toBe(16);
    expect(() =>
      createPyqAttemptRow({
        userId: 'user-1',
        session,
        question,
        selectedAnswer: 'B',
        decision: 'MARK',
        bankVersion: '2.0.0',
        questionStartedAtMs: 1_000,
        committedAtMs: 2_000,
        timeSpentMs: -1,
        screenshotUrl: null
      })
    ).toThrow('PYQ attempt time must be a non-negative number.');
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

  it('uses the pure scorer evaluator for MCQ, exact-set MSQ, and tolerance-aware NAT', () => {
    const capture = (candidate: PyqQuestion, selectedAnswer: string | string[] | number) => {
      const session = createPyqSessionRow('user-1', '2.0.0', mockConfig, [candidate]);
      return createPyqAttemptRow({
        userId: 'user-1',
        session,
        question: candidate,
        selectedAnswer,
        decision: 'MARK',
        bankVersion: '2.0.0',
        questionStartedAtMs: 1_000,
        committedAtMs: 2_000,
        screenshotUrl: null
      });
    };

    expect(capture({ ...question, id: 'mcq', answer: 'B' }, 'b')).toMatchObject({
      mark_correct: true,
      score_thirds: 3,
      scoring_status: 'scored'
    });
    expect(
      capture({ ...question, id: 'msq', type: 'MSQ', marks: 2, answer: ['B', 'D'] }, ['D', 'B'])
    ).toMatchObject({ mark_correct: true, score_thirds: 6, scoring_status: 'scored' });
    expect(
      capture({ ...question, id: 'msq-subset', type: 'MSQ', marks: 2, answer: ['B', 'D'] }, ['B'])
    ).toMatchObject({ mark_correct: false, score_thirds: 0, scoring_status: 'scored' });
    expect(
      capture(
        {
          ...question,
          id: 'nat-tolerance',
          type: 'NAT',
          answer: 0.5,
          tolerance: { abs: 0.01 }
        },
        0.509
      )
    ).toMatchObject({ mark_correct: true, score_thirds: 3, scoring_status: 'scored' });
    expect(
      capture(
        {
          ...question,
          id: 'nat-invalid-tolerance',
          type: 'NAT',
          answer: 0.5,
          tolerance: { abs: -0.01 }
        },
        0.5
      )
    ).toMatchObject({
      mark_correct: null,
      score_thirds: null,
      scoring_status: 'unscorable'
    });
  });

  it('retains evaluated correctness when marks metadata is missing', () => {
    const missingMarks = { ...question, id: 'missing-marks', marks: null };
    const session = createPyqSessionRow('user-1', '2.0.0', mockConfig, [missingMarks]);
    const attempt = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: missingMarks,
      selectedAnswer: 'B',
      decision: 'MARK',
      bankVersion: '2.0.0',
      questionStartedAtMs: 1_000,
      committedAtMs: 2_000,
      screenshotUrl: null
    });

    expect(attempt).toMatchObject({
      mark_correct: true,
      question_marks: null,
      score_thirds: null,
      scoring_status: 'unscorable'
    });
  });

  it('round-trips source books and variable choices through immutable v3 re-attempts', () => {
    const choices = ['A', 'B', 'C', 'D', 'E'];
    const sourcedQuestion: PyqQuestion = {
      ...question,
      id: 'tifr-gs-2026-q1',
      bookSlug: 'tifr-gs-cs',
      paperLabel: 'TIFR GS 2026',
      choices,
      answer: 'E'
    };
    const session = createPyqSessionRow(
      'user-1',
      'multi-book-v1',
      { ...mockConfig, bookSlug: 'tifr-gs-cs' },
      [sourcedQuestion],
      '2026-08-08T08:00:00.000Z'
    );
    const firstAttempt = createPyqAttemptRow({
      userId: 'user-1',
      session,
      question: sourcedQuestion,
      selectedAnswer: 'D',
      decision: 'MARK',
      bankVersion: 'multi-book-v1',
      questionStartedAtMs: 1_000,
      committedAtMs: 2_000,
      screenshotUrl: null
    });

    expect(session.config.bookSlug).toBe('tifr-gs-cs');
    expect(firstAttempt.question_snapshot).toMatchObject({
      book_slug: 'tifr-gs-cs',
      choices: ['A', 'B', 'C', 'D', 'E']
    });
    expect(firstAttempt.question_snapshot?.choices).not.toBe(choices);
    choices[0] = 'mutated after capture';
    expect(firstAttempt.question_snapshot?.choices).toEqual(['A', 'B', 'C', 'D', 'E']);

    const restored = pyqQuestionFromAttempt(firstAttempt);
    expect(restored).toMatchObject({
      id: sourcedQuestion.id,
      bookSlug: 'tifr-gs-cs',
      choices: ['A', 'B', 'C', 'D', 'E'],
      answer: 'E'
    });
    expect(restored?.choices).not.toBe(firstAttempt.question_snapshot?.choices);
    restored!.choices![1] = 'mutated after restore';
    expect(firstAttempt.question_snapshot?.choices).toEqual(['A', 'B', 'C', 'D', 'E']);

    const legacySnapshot = { ...firstAttempt.question_snapshot! };
    delete legacySnapshot.book_slug;
    expect(
      pyqQuestionFromAttempt({
        ...firstAttempt,
        capture_version: 2,
        question_snapshot: legacySnapshot
      })
    ).toMatchObject({ bookSlug: 'tifr-gs-cs' });

    const reattempt = createPyqReattemptAttemptRow({
      userId: 'user-1',
      reattemptId: 'tifr-reattempt-1',
      reattemptRound: 1,
      roundAttemptNumber: 1,
      sourceAttempt: firstAttempt,
      question: { ...restored!, choices: ['A', 'B', 'C', 'D', 'E'] },
      selectedAnswer: 'E',
      decision: 'MARK',
      questionStartedAtMs: 3_000,
      committedAtMs: 4_000,
      screenshotUrl: null,
      attemptNumber: 2
    });

    expect(reattempt).toMatchObject({
      capture_version: 3,
      correct_answer: 'E',
      selected_answer: 'E',
      mark_correct: true,
      score_thirds: 3,
      scoring_status: 'scored',
      reattempt_id: 'tifr-reattempt-1',
      reattempt_round: 1,
      round_attempt_number: 1,
      question_snapshot: {
        book_slug: 'tifr-gs-cs',
        choices: ['A', 'B', 'C', 'D', 'E']
      }
    });
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
          user_id: legacyAttempt.user_id,
          session_id: null,
          subject: legacyAttempt.subject,
          source_year: legacyAttempt.year,
          source_ref: 'Official GATE-PYQ · 2026 · Q 1 · MCQ',
          source_pyq_attempt_id: null,
          created_at: '1970-01-01T00:00:02.000+00:00'
        },
        [legacyAttempt]
      )
    ).toBe(legacyAttempt);
    expect(
      pyqSourceAttemptForJournalQuestion(
        {
          id: 'not-a-gate-source',
          user_id: legacyAttempt.user_id,
          session_id: null,
          subject: legacyAttempt.subject,
          source_year: legacyAttempt.year,
          source_ref: 'Aggregate exercises',
          source_pyq_attempt_id: null,
          created_at: legacyAttempt.attempted_at
        },
        [legacyAttempt]
      )
    ).toBeNull();
    const customSubjectAttempt = {
      ...legacyAttempt,
      id: 'unknown-subject-attempt',
      subject: 'Custom Legacy Subject',
      subject_id: null
    };
    expect(
      pyqSourceAttemptForJournalQuestion(
        {
          id: 'unknown-subject-analysis',
          user_id: customSubjectAttempt.user_id,
          session_id: null,
          subject: customSubjectAttempt.subject,
          subject_id: null,
          source_year: customSubjectAttempt.year,
          source_ref: 'GATE PYQ',
          source_pyq_attempt_id: null,
          created_at: customSubjectAttempt.attempted_at
        },
        [customSubjectAttempt]
      )
    ).toBeNull();

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
      reattemptRound: 0,
      roundAttemptNumber: 1,
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
      capture_version: 3,
      reattempt_id: 'reattempt-1',
      reattempt_round: 0,
      round_attempt_number: 1
    });

    const skippedRoundAttempt = { ...secondAttempt, mark_decision: 'SKIP' as const };
    expect(nextReattemptRoundAttemptNumber([skippedRoundAttempt], 'reattempt-1', 0)).toBe(2);
    expect(pyqReattemptAttemptId('reattempt-1', 0, 2)).not.toBe(secondAttempt.id);
    expect(nextPyqAttemptNumber([firstAttempt, secondAttempt], session.id, question.id)).toBe(2);
    expect(legacyPyqJournalQuestionId(firstAttempt.id)).not.toBe(journalQuestionId);
  });
});
