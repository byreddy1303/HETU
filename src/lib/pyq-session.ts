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
import { pyqAnswerValueForLog } from '@/lib/pyq';
import {
  aggregateGateScores,
  evaluateGateAnswer,
  scoreGateOutcome,
  validatedStoredGateScore,
  type GateCoveredScoreResult
} from '@/lib/gate-scoring';
import { normalizeSubjectIdentity } from '@/lib/subjects';
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

/** Deterministic seed used by the first production PYQ Journal migration. */
export function legacyPyqJournalQuestionId(attemptId: string): string {
  return uuidFromString(`pyq-journal:${attemptId}`);
}

type PyqJournalIdentity = Pick<
  QuestionRow,
  | 'id'
  | 'user_id'
  | 'session_id'
  | 'subject'
  | 'subject_id'
  | 'source_year'
  | 'source_ref'
  | 'source_pyq_attempt_id'
  | 'created_at'
> &
  Partial<Pick<QuestionRow, 'mark_decision' | 'mark_correct' | 'time_spent_sec'>>;

/** Resolve only explicit or deterministic links; no lossy legacy inference. */
export function pyqDeterministicSourceAttemptForJournalQuestion(
  journalQuestion: string | PyqJournalIdentity,
  attempts: PyqAttemptRow[]
): PyqAttemptRow | null {
  const journalQuestionId =
    typeof journalQuestion === 'string' ? journalQuestion : journalQuestion.id;
  if (typeof journalQuestion !== 'string' && journalQuestion.source_pyq_attempt_id) {
    const linked = attempts.filter(
      (attempt) =>
        attempt.id === journalQuestion.source_pyq_attempt_id &&
        attempt.user_id === journalQuestion.user_id
    );
    return linked.length === 1 ? linked[0] : null;
  }
  return (
    attempts.find(
      (attempt) =>
        (typeof journalQuestion === 'string' || attempt.user_id === journalQuestion.user_id) &&
        (pyqJournalQuestionId(attempt.id) === journalQuestionId ||
          legacyPyqJournalQuestionId(attempt.id) === journalQuestionId)
    ) ?? null
  );
}

function legacyPyqCandidates(
  journalQuestion: PyqJournalIdentity,
  attempts: PyqAttemptRow[]
): PyqAttemptRow[] {
  // Require a standalone ASCII token. A substring check would misclassify
  // unrelated labels such as "Aggregate exercises" as official GATE rows.
  if (!/(^|[^a-z0-9])gate([^a-z0-9]|$)/i.test(journalQuestion.source_ref ?? '')) return [];
  const journalCreatedAt = Date.parse(journalQuestion.created_at);
  const journalSubject = normalizeSubjectIdentity(
    journalQuestion.subject,
    journalQuestion.subject_id
  );
  if (!journalSubject.id) return [];
  return attempts.filter(
    (attempt) =>
      attempt.capture_version !== 2 &&
      attempt.capture_version !== 3 &&
      attempt.user_id === journalQuestion.user_id &&
      (() => {
        const attemptedAt = Date.parse(attempt.attempted_at);
        return Number.isFinite(journalCreatedAt) && Number.isFinite(attemptedAt)
          ? attemptedAt === journalCreatedAt
          : attempt.attempted_at === journalQuestion.created_at;
      })() &&
      normalizeSubjectIdentity(attempt.subject, attempt.subject_id).id === journalSubject.id &&
      (journalQuestion.source_year == null || attempt.year === journalQuestion.source_year) &&
      (journalQuestion.session_id == null ||
        attempt.pyq_session_id === journalQuestion.session_id) &&
      (journalQuestion.mark_decision === undefined ||
        attempt.mark_decision === journalQuestion.mark_decision) &&
      (journalQuestion.mark_correct === undefined ||
        attempt.mark_correct === journalQuestion.mark_correct) &&
      (journalQuestion.time_spent_sec === undefined ||
        attempt.time_spent_sec === journalQuestion.time_spent_sec)
  );
}

/**
 * Return only bidirectionally unique analysis→attempt pairs. This is the safe
 * migration/import API: two plausible Journal rows may never both acquire the
 * one-analysis-per-attempt FK.
 */
export function pyqJournalSourceMap(
  journalQuestions: PyqJournalIdentity[],
  attempts: PyqAttemptRow[]
): Map<string, PyqAttemptRow> {
  const soleCandidate = new Map<string, PyqAttemptRow>();
  const questionCountByAttempt = new Map<string, number>();
  const attemptsByOwnerAndId = new Map(
    attempts.map((attempt) => [`${attempt.user_id}\u0000${attempt.id}`, attempt] as const)
  );

  // An explicit link already consumes the one-analysis slot even when another
  // legacy row also happens to match the receipt heuristically. Counting it
  // first keeps the unlinked row independent instead of creating a duplicate
  // source link that the database's partial unique index would reject.
  for (const question of journalQuestions) {
    if (!question.source_pyq_attempt_id) continue;
    const linked = attemptsByOwnerAndId.get(
      `${question.user_id}\u0000${question.source_pyq_attempt_id}`
    );
    if (linked) {
      questionCountByAttempt.set(linked.id, (questionCountByAttempt.get(linked.id) ?? 0) + 1);
    }
  }
  for (const question of journalQuestions) {
    if (question.source_pyq_attempt_id) continue;
    const deterministic = pyqDeterministicSourceAttemptForJournalQuestion(question, attempts);
    const candidates = deterministic ? [deterministic] : legacyPyqCandidates(question, attempts);
    if (candidates.length !== 1) continue;
    const [candidate] = candidates;
    soleCandidate.set(question.id, candidate);
    questionCountByAttempt.set(candidate.id, (questionCountByAttempt.get(candidate.id) ?? 0) + 1);
  }
  return new Map(
    [...soleCandidate].filter(([, attempt]) => questionCountByAttempt.get(attempt.id) === 1)
  );
}

/**
 * Resolve the immutable PYQ receipt that produced an auto-journal row. The
 * journal ID is deterministic, so this does not rely on lossy source labels or
 * question text matching.
 */
export function pyqSourceAttemptForJournalQuestion(
  journalQuestion: string | PyqJournalIdentity,
  attempts: PyqAttemptRow[]
): PyqAttemptRow | null {
  const exact = pyqDeterministicSourceAttemptForJournalQuestion(journalQuestion, attempts);
  if (exact || typeof journalQuestion === 'string') return exact ?? null;

  // Journal rows created before immutable v2 receipts used random IDs. Their
  // creation timestamp was copied directly from the source attempt, which lets
  // us reconnect the legacy row without guessing from flattened prompt text.
  const legacyMatches = legacyPyqCandidates(journalQuestion, attempts);
  return legacyMatches.length === 1 ? legacyMatches[0] : null;
}

/** Restore the exact bundled PYQ, including its original option HTML and key. */
export function pyqQuestionFromAttempt(attempt: PyqAttemptRow): PyqQuestion | null {
  const snapshot = attempt.question_snapshot;
  if ((attempt.capture_version !== 2 && attempt.capture_version !== 3) || !snapshot) return null;
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

/**
 * One durable receipt per commit inside a due round. The first receipt keeps
 * the historical seed so existing local/server rows remain addressable.
 */
export function pyqReattemptAttemptId(
  reattemptId: string,
  reattemptRound: number,
  roundAttemptNumber = 1
): string {
  const seed = `pyq-reattempt:${reattemptId}:${reattemptRound}`;
  return uuidFromString(roundAttemptNumber === 1 ? seed : `${seed}:${roundAttemptNumber}`);
}

export function nextPyqAttemptNumber(
  attempts: Array<Pick<PyqAttemptRow, 'attempt_number' | 'pyq_session_id' | 'question_uid'>>,
  pyqSessionId: string,
  questionUid: string
): number {
  return (
    attempts.reduce(
      (highest, attempt) =>
        attempt.pyq_session_id === pyqSessionId && attempt.question_uid === questionUid
          ? Math.max(highest, attempt.attempt_number)
          : highest,
      0
    ) + 1
  );
}

export function nextReattemptRoundAttemptNumber(
  attempts: PyqAttemptRow[],
  reattemptId: string,
  reattemptRound: number
): number {
  let highest = 0;
  for (const attempt of attempts) {
    if (attempt.reattempt_id === reattemptId && attempt.reattempt_round === reattemptRound) {
      highest = Math.max(highest, attempt.round_attempt_number ?? 1);
      continue;
    }
    // Pre-origin receipts used exactly this first-attempt ID.
    if (
      attempt.id === pyqReattemptAttemptId(reattemptId, reattemptRound) &&
      attempt.reattempt_id == null
    ) {
      highest = Math.max(highest, 1);
    }
  }
  return highest + 1;
}

export interface PyqAttemptScorePresentation {
  label: string;
  covered: boolean;
  detail: string;
}

export type PyqAttemptScoreReceipt = Pick<
  PyqAttemptRow,
  | 'question_type'
  | 'question_marks'
  | 'answer_status'
  | 'mark_decision'
  | 'mark_correct'
  | 'score_thirds'
  | 'scoring_status'
  | 'scoring_version'
>;

/** Return a covered v1 result only when every frozen scoring fact agrees. */
export function validatedPyqAttemptScore(
  attempt: PyqAttemptScoreReceipt
): GateCoveredScoreResult | null {
  return validatedStoredGateScore({
    questionType: attempt.question_type,
    marks: attempt.question_marks,
    answerStatus: attempt.answer_status,
    decision: attempt.mark_decision,
    correctness: attempt.mark_correct,
    scoreThirds: attempt.score_thirds,
    scoringStatus: attempt.scoring_status,
    scoringVersion: attempt.scoring_version
  });
}

export function aggregatePyqAttemptScores(attempts: readonly PyqAttemptScoreReceipt[]) {
  const results = attempts.flatMap((attempt) => {
    const result = validatedPyqAttemptScore(attempt);
    return result ? [result] : [];
  });
  return { ...aggregateGateScores(results), coveredCount: results.length };
}

/** Compact, exact third-mark presentation shared by both attempt surfaces. */
export function pyqAttemptScorePresentation(
  attempt: PyqAttemptScoreReceipt
): PyqAttemptScorePresentation {
  const score = validatedPyqAttemptScore(attempt);
  if (!score) {
    return {
      label: 'Marks unavailable',
      covered: false,
      detail: 'Excluded because versioned scoring metadata is incomplete or inconsistent.'
    };
  }
  const thirds = score.scoreThirds;
  const magnitude = Math.abs(thirds);
  const marks =
    magnitude === 0
      ? '0'
      : magnitude === 1
        ? '⅓'
        : magnitude === 2
          ? '⅔'
          : magnitude % 3 === 0
            ? String(magnitude / 3)
            : (magnitude / 3).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const delta = thirds > 0 ? `+${marks}` : thirds < 0 ? `-${marks}` : marks;
  return {
    label: `GATE ${delta}`,
    covered: true,
    detail:
      score.status === 'bonus'
        ? 'Exact GATE-rule score from stored metadata · marks awarded to all.'
        : 'Exact GATE-rule score using the stored question type and marks.'
  };
}

/**
 * Create an immutable receipt for a spaced PYQ re-attempt. Re-attempt
 * receipts intentionally have no practice-session FK: they belong to the PYQ's
 * chronological answer history, not to the already-closed original set.
 */
export function createPyqReattemptAttemptRow(args: {
  userId: string;
  reattemptId: string;
  reattemptRound: number;
  roundAttemptNumber: number;
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
    id: pyqReattemptAttemptId(args.reattemptId, args.reattemptRound, args.roundAttemptNumber),
    pyq_session_id: null,
    reattempt_id: args.reattemptId,
    reattempt_round: args.reattemptRound,
    round_attempt_number: args.roundAttemptNumber
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
  const completed = Array.from(new Set([...session.completed_question_uids, questionUid]));
  return {
    ...session,
    completed_question_uids: completed,
    current_index: Math.max(session.current_index, nextIndex),
    completed_count: Math.max(session.completed_count, completed.length),
    // Completed-question coverage is unique, but elapsed time is a ledger sum:
    // a later answer after a skip is real work and must not replace the skip.
    elapsed_sec: session.elapsed_sec + Math.max(0, Math.round(timeSpentSec)),
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

/** Build the only valid immutable attempt record used by the UI. */
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
  const subject = normalizeSubjectIdentity(args.question.subject, args.question.subjectSlug);
  const markCorrect = evaluateGateAnswer({
    questionType: args.question.type,
    marks: args.question.marks,
    answerStatus: args.question.answerStatus,
    decision: args.decision,
    selectedAnswer,
    correctAnswer,
    tolerance: args.question.tolerance
  });
  const scored = scoreGateOutcome({
    questionType: args.question.type,
    marks: args.question.marks,
    answerStatus: args.question.answerStatus,
    decision: args.decision,
    correctness: markCorrect
  });

  return {
    id: pyqAttemptId(args.session.id, args.question.id, attemptNumber),
    user_id: args.userId,
    pyq_session_id: args.session.id,
    question_uid: args.question.id,
    subject: subject.label || args.question.subject,
    subject_id: subject.id,
    year: args.question.year,
    attempt_number: attemptNumber,
    selected_answer: selectedAnswer,
    correct_answer: correctAnswer,
    capture_version: 3,
    question_snapshot: pyqQuestionSnapshot(args.question),
    answer_status: args.question.answerStatus,
    screenshot_url: args.screenshotUrl,
    mark_decision: args.decision,
    mark_correct: markCorrect,
    question_started_at: questionStartedAt,
    time_spent_ms: timeSpentMs,
    time_spent_sec: Math.max(1, Math.ceil(timeSpentMs / 1000)),
    bank_version: args.bankVersion,
    attempted_at: attemptedAt,
    question_type: args.question.type,
    question_marks: args.question.marks,
    score_thirds: scored.scoreThirds,
    scoring_status: scored.status,
    scoring_version: scored.scoringVersion,
    reattempt_id: null,
    reattempt_round: null,
    round_attempt_number: null
  };
}
