import { describe, expect, it } from 'vitest';
import {
  PYQ_EXAM_SECONDS_PER_QUESTION,
  checkpointPyqExamSession,
  createPyqExamConfig,
  finalizePyqExam,
  pausePyqExamSession,
  pyqExamDurationSeconds,
  pyqExamPaletteCounts,
  pyqExamQuestionStatus,
  pyqExamRemainingSeconds,
  resumePyqExamSession,
  setPyqExamResponse,
  setPyqExamReviewMark
} from '@/lib/pyq-exam';
import type { PyqQuestion } from '@/lib/pyq';
import { createPyqSessionRow } from '@/lib/pyq-session';
import type { PyqExamSubmissionReason, PyqSessionConfig, PyqSessionRow } from '@/types';

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

describe('PYQ timed exam state', () => {
  it('initializes a deadline-based exam and visits only the opening question', () => {
    const questions = [question('q1'), question('q2'), question('q3')];
    const session = examSession(questions);
    const state = session.config.examState;

    expect(pyqExamDurationSeconds(questions.length)).toBe(
      questions.length * PYQ_EXAM_SECONDS_PER_QUESTION
    );
    expect(() => pyqExamDurationSeconds(0)).toThrow('A timed exam needs at least one question.');
    expect(session.config.mode).toBe('exam');
    expect(state).toEqual({
      duration_sec: 540,
      deadline_at: '2026-08-24T04:39:00.000Z',
      paused_remaining_sec: null,
      responses: {},
      visited_question_uids: ['q1'],
      marked_for_review_question_uids: [],
      time_by_question_ms: {},
      submission_reason: null
    });
    expect(pyqExamRemainingSeconds(session, START_MS)).toBe(540);
    expect(pyqExamRemainingSeconds(session, START_MS + 1_001)).toBe(539);
  });

  it('keeps answers, clearing, review marks, and visit state independent', () => {
    const questions = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => question(id));
    let session = examSession(questions);

    session = setPyqExamResponse(session, questions[0], 'A', START_MS);
    session = setPyqExamReviewMark(session, 'q1', true, START_MS);
    session = checkpointPyqExamSession(session, 'q2', START_MS);
    session = setPyqExamReviewMark(session, 'q2', true, START_MS);
    session = checkpointPyqExamSession(session, 'q3', START_MS);
    session = setPyqExamResponse(session, questions[2], 'A', START_MS);
    session = checkpointPyqExamSession(session, 'q4', START_MS);

    expect(questions.map((candidate) => pyqExamQuestionStatus(session, candidate))).toEqual([
      'answered-and-marked',
      'marked-for-review',
      'answered',
      'not-answered',
      'not-visited'
    ]);
    expect(pyqExamPaletteCounts(session, questions)).toEqual({
      answered: 1,
      notAnswered: 1,
      notVisited: 1,
      markedForReview: 1,
      answeredAndMarked: 1
    });

    const cleared = setPyqExamResponse(session, questions[0], undefined, START_MS + 1);
    expect(pyqExamQuestionStatus(cleared, questions[0])).toBe('marked-for-review');
    expect(cleared.config.examState?.marked_for_review_question_uids).toContain('q1');
    expect(cleared.config.examState?.responses).not.toHaveProperty('q1');

    const restored = setPyqExamResponse(cleared, questions[0], 'A', START_MS + 2);
    const unmarked = setPyqExamReviewMark(restored, 'q1', false, START_MS + 3);
    expect(pyqExamQuestionStatus(unmarked, questions[0])).toBe('answered');
    expect(unmarked.config.examState?.responses.q1).toBe('A');
    expect(unmarked.completed_count).toBe(2);
  });

  it('checkpoints exact millisecond time per question across navigation segments', () => {
    const questions = [question('q1'), question('q2')];
    let session = examSession(questions);

    session = checkpointPyqExamSession(session, 'q2', START_MS + 12_345);
    expect(session.config.examState?.time_by_question_ms).toEqual({ q1: 12_345 });
    expect(session.config.examState?.visited_question_uids).toEqual(['q1', 'q2']);
    expect(session.current_question_uid).toBe('q2');
    expect(session.current_question_started_at).toBe('2026-08-24T04:30:12.345Z');

    session = checkpointPyqExamSession(session, 'q1', START_MS + 19_134);
    session = checkpointPyqExamSession(session, null, START_MS + 22_134);
    expect(session.config.examState?.time_by_question_ms).toEqual({
      q1: 15_345,
      q2: 6_789
    });
    expect(session.current_question_uid).toBeNull();
    expect(session.elapsed_sec).toBe(22);
  });

  it('freezes the countdown while paused and creates a fresh deadline on resume', () => {
    const session = examSession([question('q1'), question('q2')]);
    const paused = pausePyqExamSession(session, START_MS + 35_250);

    expect(paused.status).toBe('paused');
    expect(paused.config.examState?.deadline_at).toBeNull();
    expect(paused.config.examState?.paused_remaining_sec).toBe(325);
    expect(paused.config.examState?.time_by_question_ms.q1).toBe(35_250);
    expect(pyqExamRemainingSeconds(paused, START_MS + 10 * 60_000)).toBe(325);

    const resumedAt = START_MS + 10 * 60_000;
    const resumed = resumePyqExamSession(paused, resumedAt);
    expect(resumed.status).toBe('active');
    expect(resumed.current_question_uid).toBe('q1');
    expect(resumed.current_question_started_at).toBe(new Date(resumedAt).toISOString());
    expect(resumed.config.examState?.paused_remaining_sec).toBeNull();
    expect(resumed.config.examState?.deadline_at).toBe(new Date(resumedAt + 325_000).toISOString());
    expect(pyqExamRemainingSeconds(resumed, resumedAt)).toBe(325);
    expect(pyqExamRemainingSeconds(resumed, resumedAt + 1_250)).toBe(324);
  });
});

describe('PYQ exam submission receipts', () => {
  const reasons: PyqExamSubmissionReason[] = ['manual', 'time-expired'];

  it.each(reasons)('finalizes %s submission into exactly one receipt per question', (reason) => {
    const questions = [question('q1', { answer: 'OFFICIAL-KEY' }), question('q2', { answer: 'D' })];
    let draft = examSession(questions);
    draft = setPyqExamResponse(draft, questions[0], 'A', START_MS + 1_000);

    // Draft session state contains only the learner response. Immutable receipts,
    // including the official key, do not exist until the one finalization boundary.
    expect(draft).not.toHaveProperty('attempts');
    expect(JSON.stringify(draft.config.examState)).not.toContain('OFFICIAL-KEY');

    const nowMs =
      reason === 'time-expired'
        ? START_MS + pyqExamDurationSeconds(questions.length) * 1000
        : START_MS + 6_000;
    const finalized = finalizePyqExam({
      userId: 'user-1',
      session: draft,
      questions,
      bankVersion: 'bank-3',
      reason,
      nowMs
    });

    expect(finalized.session.status).toBe('completed');
    expect(finalized.session.config.examState?.submission_reason).toBe(reason);
    expect(finalized.session.completed_question_uids).toEqual(['q1', 'q2']);
    expect(finalized.attempts).toHaveLength(2);
    expect(new Set(finalized.attempts.map((attempt) => attempt.question_uid))).toEqual(
      new Set(['q1', 'q2'])
    );
    expect(finalized.attempts[0]).toMatchObject({
      selected_answer: 'A',
      correct_answer: 'OFFICIAL-KEY',
      mark_decision: 'MARK',
      attempt_number: 1,
      capture_version: 3
    });
    expect(finalized.attempts[1]).toMatchObject({
      selected_answer: null,
      correct_answer: 'D',
      mark_decision: 'SKIP',
      attempt_number: 1,
      capture_version: 3
    });
  });

  it('freezes exact GATE scoring for MCQ, exact-set MSQ, and tolerance-aware NAT', () => {
    const questions = [
      question('mcq-1', { marks: 1, type: 'MCQ', answer: 'B' }),
      question('mcq-2', { marks: 2, type: 'MCQ', answer: 'C' }),
      question('msq-exact', { marks: 2, type: 'MSQ', answer: ['B', 'D'] }),
      question('msq-partial', { marks: 2, type: 'MSQ', answer: ['A', 'C'] }),
      question('nat-close', {
        marks: 2,
        type: 'NAT',
        answer: 10,
        tolerance: { abs: 0.05 }
      }),
      question('nat-far', {
        marks: 1,
        type: 'NAT',
        answer: 5,
        tolerance: { abs: 0.01 }
      })
    ];
    const responses: Array<string | string[] | number> = ['A', 'D', ['D', 'B'], ['A'], 10.04, 5.02];
    let session = examSession(questions);

    questions.forEach((candidate, index) => {
      session = setPyqExamResponse(session, candidate, responses[index], START_MS + index * 1_000);
      if (index < questions.length - 1) {
        session = checkpointPyqExamSession(
          session,
          questions[index + 1].id,
          START_MS + (index + 1) * 1_000
        );
      }
    });

    const { attempts } = finalizePyqExam({
      userId: 'user-1',
      session,
      questions,
      bankVersion: 'bank-3',
      reason: 'manual',
      nowMs: START_MS + 7_000
    });

    expect(
      attempts.map((attempt) => ({
        question: attempt.question_uid,
        correct: attempt.mark_correct,
        scoreThirds: attempt.score_thirds,
        scoringStatus: attempt.scoring_status
      }))
    ).toEqual([
      { question: 'mcq-1', correct: false, scoreThirds: -1, scoringStatus: 'scored' },
      { question: 'mcq-2', correct: false, scoreThirds: -2, scoringStatus: 'scored' },
      { question: 'msq-exact', correct: true, scoreThirds: 6, scoringStatus: 'scored' },
      { question: 'msq-partial', correct: false, scoreThirds: 0, scoringStatus: 'scored' },
      { question: 'nat-close', correct: true, scoreThirds: 6, scoringStatus: 'scored' },
      { question: 'nat-far', correct: false, scoreThirds: 0, scoringStatus: 'scored' }
    ]);
  });
});
