import type {
  PyqExamConfidence,
  PyqExamKind,
  PyqExamState,
  PyqExamSubmissionReason,
  PyqExamValidityMetrics,
  PyqExamValidityReason,
  PyqAttemptRow,
  PyqSelectedAnswer,
  PyqSessionConfig,
  PyqSessionRow
} from '@/types';
import type { PyqQuestion } from '@/lib/pyq';
import { completePyqSession, createPyqAttemptRow } from '@/lib/pyq-session';

export const PYQ_EXAM_SECONDS_PER_QUESTION = 3 * 60;
export const PYQ_FULL_PAPER_QUESTION_COUNT = 65;
export const PYQ_FULL_PAPER_MAX_MARKS = 100;
export const PYQ_FULL_PAPER_DURATION_SECONDS = 180 * 60;
export const PYQ_FULL_PAPER_MIN_ACTIVE_SECONDS = 60 * 60;

export interface PyqExamPaperMetadata {
  questionCount: number;
  maxMarks: number;
}

export interface PyqExamCreationOptions {
  /** Required for a full paper; accepts the matching benchmark catalog entry. */
  paperMetadata?: PyqExamPaperMetadata;
  /** Snapshot of questions seen before the timer began. */
  priorExposureQuestionUids?: readonly string[];
  closedBookConfirmed?: boolean;
}

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

function confidenceRecordForSession(
  session: PyqSessionRow,
  confidenceByQuestion: Record<string, PyqExamConfidence> | undefined
): Record<string, PyqExamConfidence> {
  const allowed = new Set(session.question_uids);
  return Object.fromEntries(
    Object.entries(confidenceByQuestion ?? {}).filter(
      ([questionUid, confidence]) =>
        allowed.has(questionUid) &&
        (confidence === 'high' || confidence === 'medium' || confidence === 'low')
    )
  );
}

function requireExamState(session: PyqSessionRow): PyqExamState {
  if (session.config.mode !== 'exam' || !session.config.examState) {
    throw new Error('This PYQ set is not a timed exam.');
  }
  return session.config.examState;
}

export function pyqExamDurationSeconds(
  questionCount: number,
  examKind: PyqExamKind = 'timed-set'
): number {
  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new Error('A timed exam needs at least one question.');
  }
  if (examKind === 'full-paper') {
    if (questionCount !== PYQ_FULL_PAPER_QUESTION_COUNT) {
      throw new Error(
        `A full-paper exam needs exactly ${PYQ_FULL_PAPER_QUESTION_COUNT} questions.`
      );
    }
    return PYQ_FULL_PAPER_DURATION_SECONDS;
  }
  return questionCount * PYQ_EXAM_SECONDS_PER_QUESTION;
}

export function createPyqExamConfig(
  config: PyqSessionConfig,
  questionUids: readonly string[],
  nowMs?: number
): PyqSessionConfig;
export function createPyqExamConfig(
  config: PyqSessionConfig,
  questionUids: readonly string[],
  options: PyqExamCreationOptions,
  nowMs?: number
): PyqSessionConfig;
export function createPyqExamConfig(
  config: PyqSessionConfig,
  questionUids: readonly string[],
  nowMs: number,
  options: PyqExamCreationOptions
): PyqSessionConfig;
export function createPyqExamConfig(
  config: PyqSessionConfig,
  questionUids: readonly string[],
  nowMsOrOptions: number | PyqExamCreationOptions = Date.now(),
  optionsOrNowMs?: PyqExamCreationOptions | number
): PyqSessionConfig {
  const nowMs =
    typeof nowMsOrOptions === 'number'
      ? nowMsOrOptions
      : typeof optionsOrNowMs === 'number'
        ? optionsOrNowMs
        : Date.now();
  const options =
    typeof nowMsOrOptions === 'number'
      ? typeof optionsOrNowMs === 'object'
        ? optionsOrNowMs
        : {}
      : nowMsOrOptions;
  const examKind = config.examKind ?? 'timed-set';
  if (examKind === 'full-paper') {
    if (!config.benchmarkPaperId?.trim()) {
      throw new Error('A full-paper exam needs a benchmark paper id.');
    }
    if (
      options.paperMetadata?.questionCount !== PYQ_FULL_PAPER_QUESTION_COUNT ||
      options.paperMetadata.maxMarks !== PYQ_FULL_PAPER_MAX_MARKS
    ) {
      throw new Error(
        `A full-paper benchmark must declare ${PYQ_FULL_PAPER_QUESTION_COUNT} questions and ${PYQ_FULL_PAPER_MAX_MARKS} marks.`
      );
    }
  }
  const durationSec = pyqExamDurationSeconds(questionUids.length, examKind);
  const firstQuestionUid = questionUids[0];
  const allowedQuestionUids = new Set(questionUids);
  const priorExposureQuestionUids = [
    ...new Set(
      (options.priorExposureQuestionUids ?? []).filter((questionUid) =>
        allowedQuestionUids.has(questionUid)
      )
    )
  ];
  return {
    ...config,
    mode: 'exam',
    examKind,
    ...(config.benchmarkPaperId ? { benchmarkPaperId: config.benchmarkPaperId.trim() } : {}),
    examState: {
      duration_sec: durationSec,
      deadline_at: new Date(nowMs + durationSec * 1000).toISOString(),
      paused_remaining_sec: null,
      responses: {},
      visited_question_uids: firstQuestionUid ? [firstQuestionUid] : [],
      marked_for_review_question_uids: [],
      time_by_question_ms: {},
      submission_reason: null,
      prior_exposure_question_uids: priorExposureQuestionUids,
      confidence_by_question: {},
      pause_count: 0,
      closed_book_confirmed: options.closedBookConfirmed === true
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

export function getPyqExamConfidence(
  session: PyqSessionRow,
  questionUid: string
): PyqExamConfidence | null {
  const state = requireExamState(session);
  if (!session.question_uids.includes(questionUid)) {
    throw new Error('Question is not part of this exam.');
  }
  const confidence = confidenceRecordForSession(session, state.confidence_by_question)[questionUid];
  return confidence ?? null;
}

export function setPyqExamConfidence(
  session: PyqSessionRow,
  questionUid: string,
  confidence: PyqExamConfidence | null,
  nowMs = Date.now()
): PyqSessionRow {
  const state = requireExamState(session);
  if (session.status !== 'active') throw new Error('A closed exam cannot be edited.');
  if (!session.question_uids.includes(questionUid)) {
    throw new Error('Question is not part of this exam.');
  }
  if (
    confidence !== null &&
    confidence !== 'high' &&
    confidence !== 'medium' &&
    confidence !== 'low'
  ) {
    throw new Error('Exam confidence must be high, medium, low, or unset.');
  }
  const confidenceByQuestion = confidenceRecordForSession(session, state.confidence_by_question);
  if (confidence === null) delete confidenceByQuestion[questionUid];
  else confidenceByQuestion[questionUid] = confidence;
  return {
    ...session,
    config: {
      ...session.config,
      examState: {
        ...state,
        confidence_by_question: confidenceByQuestion
      }
    },
    updated_at: new Date(nowMs).toISOString()
  };
}

export function setPyqExamClosedBookConfirmed(
  session: PyqSessionRow,
  confirmed: boolean,
  nowMs = Date.now()
): PyqSessionRow {
  const state = requireExamState(session);
  if (session.status !== 'active') throw new Error('A closed exam cannot be edited.');
  return {
    ...session,
    config: {
      ...session.config,
      examState: {
        ...state,
        closed_book_confirmed: confirmed
      }
    },
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
        paused_remaining_sec: remainingSec,
        pause_count: Math.max(0, Math.floor(state.pause_count ?? 0)) + 1
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

function finalizedPyqExamValidity(args: {
  session: PyqSessionRow;
  state: PyqExamState;
  questions: readonly PyqQuestion[];
  attempts: readonly PyqAttemptRow[];
}): {
  status: 'qualified' | 'supporting';
  reasons: PyqExamValidityReason[];
  metrics: PyqExamValidityMetrics;
} {
  const allowedQuestionUids = new Set(args.session.question_uids);
  const totalMarks = args.questions.reduce(
    (sum, question) => sum + (question.marks === 1 || question.marks === 2 ? question.marks : 0),
    0
  );
  const scorableAttempts = args.attempts.filter(
    (attempt) =>
      (attempt.scoring_status === 'scored' || attempt.scoring_status === 'bonus') &&
      (attempt.question_marks === 1 || attempt.question_marks === 2)
  );
  const scorableMarks = scorableAttempts.reduce(
    (sum, attempt) => sum + (attempt.question_marks ?? 0),
    0
  );
  const visitedQuestionCount = new Set(
    args.state.visited_question_uids.filter((questionUid) => allowedQuestionUids.has(questionUid))
  ).size;
  const activeTimeMs = Object.entries(args.state.time_by_question_ms).reduce(
    (sum, [questionUid, value]) =>
      sum +
      (allowedQuestionUids.has(questionUid) && Number.isFinite(value) ? Math.max(0, value) : 0),
    0
  );
  const hasPriorExposureReceipt = Array.isArray(args.state.prior_exposure_question_uids);
  const priorExposureCount = hasPriorExposureReceipt
    ? new Set(
        args.state.prior_exposure_question_uids?.filter((questionUid) =>
          allowedQuestionUids.has(questionUid)
        )
      ).size
    : null;
  const pauseCount =
    Number.isInteger(args.state.pause_count) && (args.state.pause_count ?? -1) >= 0
      ? (args.state.pause_count ?? null)
      : null;
  const metrics: PyqExamValidityMetrics = {
    question_count: args.questions.length,
    total_marks: totalMarks,
    scorable_question_count: scorableAttempts.length,
    scorable_marks: scorableMarks,
    visited_question_count: visitedQuestionCount,
    active_time_sec: Math.floor(activeTimeMs / 1000),
    prior_exposure_count: priorExposureCount,
    pause_count: pauseCount,
    closed_book_confirmed: args.state.closed_book_confirmed === true
  };
  const reasons: PyqExamValidityReason[] = [];
  if ((args.session.config.examKind ?? 'timed-set') !== 'full-paper') {
    reasons.push('not-full-paper');
  } else {
    if (!hasPriorExposureReceipt || priorExposureCount !== 0) reasons.push('prior-exposure');
    if (pauseCount !== 0) reasons.push('paused');
    if (!metrics.closed_book_confirmed) reasons.push('closed-book-unconfirmed');
    if (visitedQuestionCount !== PYQ_FULL_PAPER_QUESTION_COUNT) {
      reasons.push('incomplete-visit-coverage');
    }
    if (activeTimeMs < PYQ_FULL_PAPER_MIN_ACTIVE_SECONDS * 1000) {
      reasons.push('low-active-time');
    }
    if (
      scorableAttempts.length !== PYQ_FULL_PAPER_QUESTION_COUNT ||
      scorableMarks !== PYQ_FULL_PAPER_MAX_MARKS
    ) {
      reasons.push('incomplete-scoring');
    }
    if (
      !args.session.config.benchmarkPaperId?.trim() ||
      args.questions.length !== PYQ_FULL_PAPER_QUESTION_COUNT ||
      totalMarks !== PYQ_FULL_PAPER_MAX_MARKS
    ) {
      reasons.push('nonstandard-paper');
    }
  }
  return {
    status: reasons.length === 0 ? 'qualified' : 'supporting',
    reasons,
    metrics
  };
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
    const confidence = confidenceRecordForSession(checkpointed, state.confidence_by_question)[
      question.id
    ];
    return createPyqAttemptRow({
      userId: args.userId,
      session: syntheticCurrentSession,
      question,
      selectedAnswer: answered ? (response ?? null) : null,
      decision:
        answered && (confidence === 'medium' || confidence === 'low')
          ? 'FIFTY_FIFTY'
          : answered
            ? 'MARK'
            : 'SKIP',
      bankVersion: args.bankVersion,
      questionStartedAtMs: nowMs - timeSpentMs,
      committedAtMs: nowMs,
      screenshotUrl: null
    });
  });
  const validity = finalizedPyqExamValidity({
    session: checkpointed,
    state,
    questions: args.questions,
    attempts
  });
  const completedBase: PyqSessionRow = {
    ...checkpointed,
    config: {
      ...checkpointed.config,
      examState: {
        ...state,
        deadline_at: null,
        paused_remaining_sec: 0,
        submission_reason: args.reason,
        confidence_by_question: confidenceRecordForSession(
          checkpointed,
          state.confidence_by_question
        ),
        validity_status: validity.status,
        validity_reasons: validity.reasons,
        validity_metrics: validity.metrics
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
