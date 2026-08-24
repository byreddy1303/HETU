import type {
  PyqExamState,
  PyqExamSubmissionReason,
  PyqSelectedAnswer,
  PyqSessionConfig,
  PyqSessionRow
} from '@/types';
import type { PyqQuestion } from '@/lib/pyq';
import { completePyqSession, createPyqAttemptRow } from '@/lib/pyq-session';

export const PYQ_EXAM_SECONDS_PER_QUESTION = 3 * 60;

export type PyqExamQuestionStatus =
  'answered' | 'not-answered' | 'not-visited' | 'marked-for-review' | 'answered-and-marked';

export interface PyqExamPaletteCounts {
  answered: number;
  notAnswered: number;
  notVisited: number;
  markedForReview: number;
  answeredAndMarked: number;
}

function uniqueSessionQuestionUids(session: PyqSessionRow, values: readonly string[]): string[] {
  const allowed = new Set(session.question_uids);
  return [...new Set(values.filter((value) => allowed.has(value)))];
}

function responseRecordForSession(
  session: PyqSessionRow,
  responses: Record<string, PyqSelectedAnswer>
): Record<string, PyqSelectedAnswer> {
  const allowed = new Set(session.question_uids);
  return Object.fromEntries(
    Object.entries(responses).filter(([questionUid]) => allowed.has(questionUid))
  );
}

function requireExamState(session: PyqSessionRow): PyqExamState {
  if (session.config.mode !== 'exam' || !session.config.examState) {
    throw new Error('This PYQ set is not a timed exam.');
  }
  return session.config.examState;
}

export function pyqExamDurationSeconds(questionCount: number): number {
  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new Error('A timed exam needs at least one question.');
  }
  return questionCount * PYQ_EXAM_SECONDS_PER_QUESTION;
}

export function createPyqExamConfig(
  config: PyqSessionConfig,
  questionUids: readonly string[],
  nowMs = Date.now()
): PyqSessionConfig {
  const durationSec = pyqExamDurationSeconds(questionUids.length);
  const firstQuestionUid = questionUids[0];
  return {
    ...config,
    mode: 'exam',
    examState: {
      duration_sec: durationSec,
      deadline_at: new Date(nowMs + durationSec * 1000).toISOString(),
      paused_remaining_sec: null,
      responses: {},
      visited_question_uids: firstQuestionUid ? [firstQuestionUid] : [],
      marked_for_review_question_uids: [],
      time_by_question_ms: {},
      submission_reason: null
    }
  };
}

export function isPyqExamAnswerPresent(
  question: Pick<PyqQuestion, 'type'>,
  answer: PyqSelectedAnswer | undefined
): boolean {
  if (answer == null) return false;
  if (question.type === 'MSQ') return Array.isArray(answer) && answer.length > 0;
  if (question.type === 'NAT') {
    if (Array.isArray(answer)) return false;
    if (typeof answer === 'string' && answer.trim() === '') return false;
    return Number.isFinite(Number(answer));
  }
  return !Array.isArray(answer) && typeof answer === 'string' && answer.trim().length > 0;
}

export function pyqExamRemainingSeconds(session: PyqSessionRow, nowMs = Date.now()): number {
  const state = requireExamState(session);
  if (session.status === 'paused') {
    return Math.max(0, Math.min(state.duration_sec, state.paused_remaining_sec ?? 0));
  }
  const deadlineMs = Date.parse(state.deadline_at ?? '');
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, Math.min(state.duration_sec, Math.ceil((deadlineMs - nowMs) / 1000)));
}

export function setPyqExamResponse(
  session: PyqSessionRow,
  question: Pick<PyqQuestion, 'id' | 'type'>,
  answer: PyqSelectedAnswer | undefined,
  nowMs = Date.now()
): PyqSessionRow {
  const state = requireExamState(session);
  if (session.status !== 'active') throw new Error('A closed exam cannot be edited.');
  if (!session.question_uids.includes(question.id)) {
    throw new Error('Question is not part of this exam.');
  }
  const responses = responseRecordForSession(session, state.responses);
  if (isPyqExamAnswerPresent(question as Pick<PyqQuestion, 'type'>, answer)) {
    responses[question.id] = Array.isArray(answer) ? [...answer] : (answer ?? null);
  } else {
    delete responses[question.id];
  }
  const visited = uniqueSessionQuestionUids(session, [...state.visited_question_uids, question.id]);
  return {
    ...session,
    config: {
      ...session.config,
      examState: {
        ...state,
        responses,
        visited_question_uids: visited
      }
    },
    completed_count: Object.keys(responses).length,
    updated_at: new Date(nowMs).toISOString()
  };
}

export function setPyqExamReviewMark(
  session: PyqSessionRow,
  questionUid: string,
  marked: boolean,
  nowMs = Date.now()
): PyqSessionRow {
  const state = requireExamState(session);
  if (session.status !== 'active') throw new Error('A closed exam cannot be edited.');
  if (!session.question_uids.includes(questionUid)) {
    throw new Error('Question is not part of this exam.');
  }
  const marks = new Set(uniqueSessionQuestionUids(session, state.marked_for_review_question_uids));
  if (marked) marks.add(questionUid);
  else marks.delete(questionUid);
  return {
    ...session,
    config: {
      ...session.config,
      examState: {
        ...state,
        marked_for_review_question_uids: [...marks]
      }
    },
    updated_at: new Date(nowMs).toISOString()
  };
}

/**
 * Close the current timing segment and optionally open another question.
 * The countdown is deadline-based; the per-question ledger uses exact ms.
 */
export function checkpointPyqExamSession(
  session: PyqSessionRow,
  nextQuestionUid: string | null,
  nowMs = Date.now()
): PyqSessionRow {
  const state = requireExamState(session);
  if (session.status !== 'active') throw new Error('A closed exam cannot be navigated.');
  if (nextQuestionUid !== null && !session.question_uids.includes(nextQuestionUid)) {
    throw new Error('Question is not part of this exam.');
  }
  const timeByQuestionMs = { ...state.time_by_question_ms };
  const currentQuestionUid = session.current_question_uid;
  const segmentStartedMs = Date.parse(session.current_question_started_at ?? '');
  if (currentQuestionUid && Number.isFinite(segmentStartedMs)) {
    const recordedMs = Object.values(timeByQuestionMs).reduce(
      (sum, value) => sum + Math.max(0, Number.isFinite(value) ? value : 0),
      0
    );
    const remainingBudgetMs = Math.max(0, state.duration_sec * 1000 - recordedMs);
    const segmentMs = Math.min(remainingBudgetMs, Math.max(0, nowMs - segmentStartedMs));
    timeByQuestionMs[currentQuestionUid] =
      Math.max(0, timeByQuestionMs[currentQuestionUid] ?? 0) + segmentMs;
  }
  const visited = nextQuestionUid
    ? uniqueSessionQuestionUids(session, [...state.visited_question_uids, nextQuestionUid])
    : uniqueSessionQuestionUids(session, state.visited_question_uids);
  const responses = responseRecordForSession(session, state.responses);
  const remainingSec = pyqExamRemainingSeconds(session, nowMs);
  const nextIndex =
    nextQuestionUid === null
      ? session.current_index
      : session.question_uids.indexOf(nextQuestionUid);
  const now = new Date(nowMs).toISOString();
  return {
    ...session,
    config: {
      ...session.config,
      examState: {
        ...state,
        responses,
        visited_question_uids: visited,
        marked_for_review_question_uids: uniqueSessionQuestionUids(
          session,
          state.marked_for_review_question_uids
        ),
        time_by_question_ms: timeByQuestionMs
      }
    },
    current_index: nextIndex,
    current_question_uid: nextQuestionUid,
    current_question_started_at: nextQuestionUid ? now : null,
    completed_count: Object.keys(responses).length,
    elapsed_sec: Math.min(state.duration_sec, state.duration_sec - remainingSec),
    updated_at: now
  };
}

export function pausePyqExamSession(session: PyqSessionRow, nowMs = Date.now()): PyqSessionRow {
  const remainingSec = pyqExamRemainingSeconds(session, nowMs);
  const checkpointed = checkpointPyqExamSession(session, null, nowMs);
  const state = requireExamState(checkpointed);
  return {
    ...checkpointed,
    status: 'paused',
    config: {
      ...checkpointed.config,
      examState: {
        ...state,
        deadline_at: null,
        paused_remaining_sec: remainingSec
      }
    }
  };
}

export function resumePyqExamSession(session: PyqSessionRow, nowMs = Date.now()): PyqSessionRow {
  const state = requireExamState(session);
  if (session.status !== 'paused') throw new Error('Only a paused exam can be resumed.');
  const remainingSec = Math.max(
    0,
    Math.min(state.duration_sec, state.paused_remaining_sec ?? state.duration_sec)
  );
  const currentIndex = Math.min(
    session.current_index,
    Math.max(0, session.question_uids.length - 1)
  );
  const currentQuestionUid = session.question_uids[currentIndex] ?? null;
  const now = new Date(nowMs).toISOString();
  return {
    ...session,
    status: 'active',
    current_index: currentIndex,
    current_question_uid: currentQuestionUid,
    current_question_started_at: currentQuestionUid ? now : null,
    config: {
      ...session.config,
      examState: {
        ...state,
        deadline_at: new Date(nowMs + remainingSec * 1000).toISOString(),
        paused_remaining_sec: null,
        visited_question_uids: currentQuestionUid
          ? uniqueSessionQuestionUids(session, [...state.visited_question_uids, currentQuestionUid])
          : state.visited_question_uids
      }
    },
    updated_at: now
  };
}

export function pyqExamQuestionStatus(
  session: PyqSessionRow,
  question: Pick<PyqQuestion, 'id' | 'type'>
): PyqExamQuestionStatus {
  const state = requireExamState(session);
  const visited = state.visited_question_uids.includes(question.id);
  if (!visited) return 'not-visited';
  const answered = isPyqExamAnswerPresent(question, state.responses[question.id]);
  const marked = state.marked_for_review_question_uids.includes(question.id);
  if (answered && marked) return 'answered-and-marked';
  if (marked) return 'marked-for-review';
  return answered ? 'answered' : 'not-answered';
}

export function pyqExamPaletteCounts(
  session: PyqSessionRow,
  questions: readonly Pick<PyqQuestion, 'id' | 'type'>[]
): PyqExamPaletteCounts {
  const counts: PyqExamPaletteCounts = {
    answered: 0,
    notAnswered: 0,
    notVisited: 0,
    markedForReview: 0,
    answeredAndMarked: 0
  };
  for (const question of questions) {
    const status = pyqExamQuestionStatus(session, question);
    if (status === 'answered') counts.answered += 1;
    else if (status === 'not-answered') counts.notAnswered += 1;
    else if (status === 'not-visited') counts.notVisited += 1;
    else if (status === 'marked-for-review') counts.markedForReview += 1;
    else counts.answeredAndMarked += 1;
  }
  return counts;
}

export function finalizePyqExam(args: {
  userId: string;
  session: PyqSessionRow;
  questions: readonly PyqQuestion[];
  bankVersion: string;
  reason: PyqExamSubmissionReason;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  if (args.questions.length !== args.session.question_uids.length) {
    throw new Error('The exam question bank changed before submission.');
  }
  const checkpointed = checkpointPyqExamSession(args.session, null, nowMs);
  const state = requireExamState(checkpointed);
  const attempts = args.questions.map((question, index) => {
    if (args.session.question_uids[index] !== question.id) {
      throw new Error('The exam question order changed before submission.');
    }
    const response = state.responses[question.id];
    const answered = isPyqExamAnswerPresent(question, response);
    const timeSpentMs = Math.max(1, Math.round(state.time_by_question_ms[question.id] ?? 0));
    const syntheticCurrentSession: PyqSessionRow = {
      ...checkpointed,
      current_index: index,
      current_question_uid: question.id,
      current_question_started_at: new Date(nowMs - timeSpentMs).toISOString()
    };
    return createPyqAttemptRow({
      userId: args.userId,
      session: syntheticCurrentSession,
      question,
      selectedAnswer: answered ? (response ?? null) : null,
      decision: answered ? 'MARK' : 'SKIP',
      bankVersion: args.bankVersion,
      questionStartedAtMs: nowMs - timeSpentMs,
      committedAtMs: nowMs,
      screenshotUrl: null
    });
  });
  const completedBase: PyqSessionRow = {
    ...checkpointed,
    config: {
      ...checkpointed.config,
      examState: {
        ...state,
        deadline_at: null,
        paused_remaining_sec: 0,
        submission_reason: args.reason
      }
    },
    completed_question_uids: [...checkpointed.question_uids],
    completed_count: checkpointed.question_uids.length,
    elapsed_sec: Math.min(state.duration_sec, checkpointed.elapsed_sec)
  };
  return {
    session: completePyqSession(completedBase, new Date(nowMs).toISOString()),
    attempts
  };
}
