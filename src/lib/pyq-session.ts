import type {
  MarkDecision,
  PyqAttemptRow,
  PyqQuestionSnapshot,
  PyqSelectedAnswer,
  PyqSessionConfig,
  PyqSessionRow,
  QuestionRow,
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

/**
 * Resolve the immutable PYQ receipt that produced an auto-journal row. The
 * journal ID is deterministic, so this does not rely on lossy source labels or
 * question text matching.
 */
export function pyqSourceAttemptForJournalQuestion(
  journalQuestion:
    | string
    | Pick<
        QuestionRow,
        'id' | 'session_id' | 'subject' | 'source_year' | 'source_ref' | 'created_at'
      >,
  attempts: PyqAttemptRow[]
): PyqAttemptRow | null {
  const journalQuestionId =
    typeof journalQuestion === 'string' ? journalQuestion : journalQuestion.id;
  const exact = attempts.find(
    (attempt) =>
      attempt.capture_version === 2 &&
      attempt.question_snapshot !== null &&
      pyqJournalQuestionId(attempt.id) === journalQuestionId
  );
  if (exact || typeof journalQuestion === 'string') return exact ?? null;

  // Journal rows created before immutable v2 receipts used random IDs. Their
  // creation timestamp was copied directly from the source attempt, which lets
  // us reconnect the legacy row without guessing from flattened prompt text.
  if (!journalQuestion.source_ref?.toLowerCase().includes('gate')) return null;
  const legacyMatches = attempts.filter(
    (attempt) =>
      attempt.capture_version !== 2 &&
      attempt.attempted_at === journalQuestion.created_at &&
      attempt.subject === journalQuestion.subject &&
      (journalQuestion.source_year == null || attempt.year === journalQuestion.source_year) &&
      (journalQuestion.session_id == null || attempt.pyq_session_id === journalQuestion.session_id)
  );
  return legacyMatches.length === 1 ? legacyMatches[0] : null;
}

/** Restore the exact bundled PYQ, including its original option HTML and key. */
export function pyqQuestionFromAttempt(attempt: PyqAttemptRow): PyqQuestion | null {
  const snapshot = attempt.question_snapshot;
  if (attempt.capture_version !== 2 || !snapshot) return null;
  return {
    id: snapshot.question_uid,
    year: snapshot.year,
    set: snapshot.set,
    number: snapshot.number,
    paperLabel: snapshot.paper_label,
    subject: snapshot.subject,
    subjectSlug: snapshot.subject_slug,
    topic: snapshot.topic,
    topicSlug: snapshot.topic_slug,
    subtopics: [...snapshot.subtopics],
    marks: snapshot.marks,
    type: snapshot.type as PyqQuestion['type'],
    answer: attempt.correct_answer as PyqQuestion['answer'],
    tolerance: snapshot.tolerance ? { ...snapshot.tolerance } : null,
    answerStatus: snapshot.answer_status,
    html: snapshot.html,
    sourceUrl: snapshot.source_url,
    answerSource: snapshot.answer_source
  };
}

/** One durable receipt per due-round, even across reloads before ladder grading. */
export function pyqReattemptAttemptId(reattemptId: string, completedRoundCount: number): string {
  return uuidFromString(`pyq-reattempt:${reattemptId}:${completedRoundCount}`);
}

/**
 * Create the capture-version-2 receipt for a spaced PYQ re-attempt. Re-attempt
 * receipts intentionally have no practice-session FK: they belong to the PYQ's
 * chronological answer history, not to the already-closed original set.
 */
export function createPyqReattemptAttemptRow(args: {
  userId: string;
  reattemptId: string;
  completedRoundCount: number;
  sourceAttempt: PyqAttemptRow;
  question: PyqQuestion;
  selectedAnswer: PyqSelectedAnswer;
  decision: MarkDecision;
  questionStartedAtMs: number;
  committedAtMs: number;
  screenshotUrl: string | null;
  attemptNumber: number;
}): PyqAttemptRow {
  const syntheticSession: PyqSessionRow = {
    id: args.sourceAttempt.pyq_session_id ?? args.sourceAttempt.id,
    user_id: args.userId,
    bank_version: args.sourceAttempt.bank_version,
    config: {
      subjectSlug: args.question.subjectSlug,
      topicSlug: args.question.topicSlug,
      fromYear: args.question.year,
      toYear: args.question.year,
      type:
        args.question.type === 'MCQ' || args.question.type === 'MSQ' || args.question.type === 'NAT'
          ? args.question.type
          : 'all',
      order: 'unseen',
      count: '5'
    },
    question_uids: [args.question.id],
    completed_question_uids: [],
    current_index: 0,
    completed_count: 0,
    elapsed_sec: 0,
    status: 'active',
    current_question_uid: args.question.id,
    current_question_started_at: new Date(args.questionStartedAtMs).toISOString(),
    started_at: new Date(args.questionStartedAtMs).toISOString(),
    updated_at: new Date(args.questionStartedAtMs).toISOString(),
    completed_at: null
  };
  const attempt = createPyqAttemptRow({
    userId: args.userId,
    session: syntheticSession,
    question: args.question,
    selectedAnswer: args.selectedAnswer,
    decision: args.decision,
    bankVersion: args.sourceAttempt.bank_version,
    questionStartedAtMs: args.questionStartedAtMs,
    committedAtMs: args.committedAtMs,
    screenshotUrl: args.screenshotUrl,
    attemptNumber: args.attemptNumber
  });
  return {
    ...attempt,
    id: pyqReattemptAttemptId(args.reattemptId, args.completedRoundCount),
    pyq_session_id: null
  };
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
    planner_date: existing?.planner_date ?? null,
    planner_block_id: existing?.planner_block_id ?? null,
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

export function pausePyqSession(session: PyqSessionRow, now = nowISO()): PyqSessionRow {
  if (session.status !== 'active') {
    throw new Error('Only an active PYQ set can be paused.');
  }
  return {
    ...session,
    status: 'paused',
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
  retryingSkippedAttempt?: boolean;
}): PyqAttemptRow {
  if (args.session.status !== 'active') {
    throw new Error('Cannot submit an answer to a closed PYQ set.');
  }
  if (args.session.bank_version !== args.bankVersion) {
    throw new Error('PYQ bank version changed during the set.');
  }
  const retryingCompletedSkip =
    args.retryingSkippedAttempt === true &&
    args.session.completed_question_uids.includes(args.question.id);
  if (
    args.session.question_uids[args.session.current_index] !== args.question.id &&
    !retryingCompletedSkip
  ) {
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
