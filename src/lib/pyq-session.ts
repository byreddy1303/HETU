import type {
  MarkDecision,
  PyqAttemptRow,
  PyqQuestionSnapshot,
  PyqSelectedAnswer,
  PyqSessionConfig,
  PyqSessionRow,
  SessionRow
} from '@/types';
import type { PyqQuestion } from '@/lib/pyq';
import { evaluatePyqAnswer, pyqAnswerValueForLog } from '@/lib/pyq';
import { calendarDateInTimeZone, nowISO, uuid, uuidFromString } from '@/lib/utils';

export function createPyqSessionRow(
  userId: string,
  bankVersion: string,
  config: PyqSessionConfig,
  questions: Pick<PyqQuestion, 'id'>[],
  now = nowISO()
): PyqSessionRow {
  return {
    id: uuid(),
    user_id: userId,
    bank_version: bankVersion,
    config,
    question_uids: questions.map((question) => question.id),
    completed_question_uids: [],
    current_index: 0,
    completed_count: 0,
    elapsed_sec: 0,
    status: 'active',
    current_question_uid: questions[0]?.id ?? null,
    current_question_started_at: questions.length > 0 ? now : null,
    started_at: now,
    updated_at: now,
    completed_at: null
  };
}

export function pyqAttemptId(pyqSessionId: string, questionUid: string, attemptNumber = 1): string {
  return uuidFromString(`pyq-attempt:${pyqSessionId}:${questionUid}:${attemptNumber}`);
}

export function pyqJournalQuestionId(attemptId: string): string {
  return uuidFromString(`pyq-journal-question:${attemptId}`);
}

/** Human-readable subject for the canonical session paired with a PYQ set. */
export function pyqPracticeSubject(
  rows: Array<Pick<PyqQuestion, 'subject'> | Pick<PyqAttemptRow, 'subject'>>
): string {
  const subjects = [...new Set(rows.map((row) => row.subject).filter(Boolean))];
  if (subjects.length === 1) return subjects[0];
  if (subjects.length > 1) return 'Mixed PYQ';
  return 'PYQ practice';
}

/**
 * Every durable PYQ set has a same-ID canonical session row. That lets all
 * session consumers (targets, recent history, reviews and journal filters)
 * treat focused, log-batch and PYQ practice uniformly without weakening the
 * richer PYQ audit tables.
 */
export function pyqPracticeSessionRow(
  session: PyqSessionRow,
  subject: string,
  timeZone = 'Asia/Kolkata',
  existing?: SessionRow | null
): SessionRow {
  const closed = session.status !== 'active';
  const actualDuration = closed
    ? session.completed_count > 0
      ? Math.max(1, Math.ceil(session.elapsed_sec / 60))
      : 0
    : null;
  return {
    id: session.id,
    user_id: session.user_id,
    kind: 'pyq',
    date: existing?.date ?? calendarDateInTimeZone(session.started_at, timeZone),
    subject: subject || existing?.subject || 'PYQ practice',
    target_duration_min: 0,
    actual_duration_min: actualDuration,
    insight: existing?.insight ?? null,
    sadhana_done: existing?.sadhana_done ?? false,
    interruptions_count: existing?.interruptions_count ?? 0,
    created_at: session.started_at
  };
}

export function startPyqSessionQuestion(
  session: PyqSessionRow,
  questionUid: string,
  now = nowISO()
): PyqSessionRow {
  if (session.status !== 'active') throw new Error('Cannot start a question in a closed PYQ set.');
  if (!session.question_uids.includes(questionUid)) {
    throw new Error('Question is not part of this PYQ set.');
  }
  if (
    session.current_question_uid === questionUid &&
    session.current_question_started_at !== null
  ) {
    return session;
  }
  return {
    ...session,
    current_question_uid: questionUid,
    current_question_started_at: now,
    updated_at: now
  };
}

export function advancePyqSessionProgress(
  session: PyqSessionRow,
  questionUid: string,
  nextIndex: number,
  timeSpentSec: number,
  now = nowISO()
): PyqSessionRow {
  if (session.status !== 'active') throw new Error('Cannot advance a closed PYQ set.');
  if (!session.question_uids.includes(questionUid)) {
    throw new Error('Cannot advance a question outside this PYQ set.');
  }
  if (!Number.isFinite(timeSpentSec) || timeSpentSec < 0) {
    throw new Error('PYQ elapsed time must be a non-negative number.');
  }
  if (nextIndex < 0 || nextIndex > session.question_uids.length) {
    throw new Error('PYQ progress is outside the selected set.');
  }
  const alreadyCompleted = session.completed_question_uids.includes(questionUid);
  const completed = Array.from(new Set([...session.completed_question_uids, questionUid]));
  return {
    ...session,
    completed_question_uids: completed,
    current_index: Math.max(session.current_index, nextIndex),
    completed_count: Math.max(session.completed_count, completed.length),
    elapsed_sec: alreadyCompleted
      ? session.elapsed_sec
      : session.elapsed_sec + Math.max(0, Math.round(timeSpentSec)),
    current_question_uid: null,
    current_question_started_at: null,
    updated_at: now
  };
}

export function completePyqSession(session: PyqSessionRow, now = nowISO()): PyqSessionRow {
  return {
    ...session,
    status: 'completed',
    current_index: Math.max(session.current_index, session.question_uids.length),
    completed_count: Math.max(session.completed_count, session.completed_question_uids.length),
    current_question_uid: null,
    current_question_started_at: null,
    updated_at: now,
    completed_at: now
  };
}

export function abandonPyqSession(session: PyqSessionRow, now = nowISO()): PyqSessionRow {
  return {
    ...session,
    status: 'abandoned',
    current_question_uid: null,
    current_question_started_at: null,
    updated_at: now
  };
}

export function pyqQuestionSnapshot(question: PyqQuestion): PyqQuestionSnapshot {
  return {
    question_uid: question.id,
    year: question.year,
    set: question.set,
    number: question.number,
    paper_label: question.paperLabel,
    subject: question.subject,
    subject_slug: question.subjectSlug,
    topic: question.topic,
    topic_slug: question.topicSlug,
    subtopics: [...question.subtopics],
    marks: question.marks,
    type: question.type,
    tolerance: question.tolerance ? { ...question.tolerance } : null,
    answer_status: question.answerStatus,
    answer_source: question.answerSource === undefined ? null : question.answerSource,
    html: question.html,
    source_url: question.sourceUrl
  };
}

function hasCommittedAnswer(value: PyqSelectedAnswer): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value !== 'string' || value.trim().length > 0;
}

function answerMatchesQuestionType(question: PyqQuestion, value: PyqSelectedAnswer): boolean {
  if (!hasCommittedAnswer(value)) return false;
  if (question.type === 'NAT') {
    return !Array.isArray(value) && Number.isFinite(Number(value));
  }
  if (question.type === 'MSQ') return Array.isArray(value);
  return typeof value === 'string';
}

/** Build the only valid version-2 attempt record used by the UI. */
export function createPyqAttemptRow(args: {
  userId: string;
  session: PyqSessionRow;
  question: PyqQuestion;
  selectedAnswer: PyqSelectedAnswer;
  decision: MarkDecision;
  bankVersion: string;
  questionStartedAtMs: number;
  committedAtMs: number;
  screenshotUrl: string | null;
  attemptNumber?: number;
}): PyqAttemptRow {
  if (args.session.status !== 'active') {
    throw new Error('Cannot submit an answer to a closed PYQ set.');
  }
  if (args.session.bank_version !== args.bankVersion) {
    throw new Error('PYQ bank version changed during the set.');
  }
  if (args.session.question_uids[args.session.current_index] !== args.question.id) {
    throw new Error('Only the current PYQ can be committed.');
  }
  const selectedAnswer = args.decision === 'SKIP' ? null : args.selectedAnswer;
  if (args.decision !== 'SKIP' && !answerMatchesQuestionType(args.question, selectedAnswer)) {
    throw new Error('The committed answer does not match the PYQ response type.');
  }
  if (args.decision === 'SKIP' && args.selectedAnswer !== null) {
    throw new Error('A skipped PYQ cannot retain a selected answer.');
  }
  if (!Number.isFinite(args.questionStartedAtMs) || !Number.isFinite(args.committedAtMs)) {
    throw new Error('PYQ attempt timestamps must be valid.');
  }

  const attemptNumber = args.attemptNumber ?? 1;
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error('PYQ attempt number must be a positive integer.');
  }
  const timeSpentMs = Math.max(1, Math.round(args.committedAtMs - args.questionStartedAtMs));
  const attemptedAt = new Date(args.committedAtMs).toISOString();
  const questionStartedAt = new Date(
    Math.min(args.questionStartedAtMs, args.committedAtMs)
  ).toISOString();
  const correctAnswer = pyqAnswerValueForLog(args.question);

  return {
    id: pyqAttemptId(args.session.id, args.question.id, attemptNumber),
    user_id: args.userId,
    pyq_session_id: args.session.id,
    question_uid: args.question.id,
    subject: args.question.subject,
    year: args.question.year,
    attempt_number: attemptNumber,
    selected_answer: selectedAnswer,
    correct_answer: correctAnswer,
    capture_version: 2,
    question_snapshot: pyqQuestionSnapshot(args.question),
    answer_status: args.question.answerStatus,
    screenshot_url: args.screenshotUrl,
    mark_decision: args.decision,
    mark_correct: evaluatePyqAnswer(args.question, selectedAnswer, args.decision),
    question_started_at: questionStartedAt,
    time_spent_ms: timeSpentMs,
    time_spent_sec: Math.max(1, Math.ceil(timeSpentMs / 1000)),
    bank_version: args.bankVersion,
    attempted_at: attemptedAt
  };
}
