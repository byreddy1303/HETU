import { db } from '@/lib/db';
import { targetTimeSecForMarks } from '@/lib/constants';
import { writeLocalBatch } from '@/lib/sync';
import {
  addDaysISO,
  calendarDateInTimeZone,
  nowISO,
  todayISOInTimeZone,
  uuidFromString
} from '@/lib/utils';
import type {
  LearningEventRow,
  LearningItemRow,
  PyqAttemptRow,
  QuestionRow,
  RecoveryGrade,
  ReattemptRow
} from '@/types';

export type WeakAttemptReason =
  | 'wrong'
  | 'skipped'
  | 'low-confidence'
  | 'high-confidence-wrong'
  | 'guessed-correct'
  | 'slow-correct';

export interface WeakAttemptCapture {
  item: LearningItemRow;
  event: LearningEventRow;
  reasons: WeakAttemptReason[];
  compatibilityQuestion: QuestionRow | null;
  compatibilityReattempt: ReattemptRow | null;
}

const STAGE_PRIORITY: Record<LearningItemRow['stage'], number> = {
  D3: 0,
  D10: 1,
  D30: 2,
  TRANSFER: 3,
  MASTERED: 4
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function attemptedLocalDate(attemptedAt: string, timeZone: string): string {
  return calendarDateInTimeZone(attemptedAt, timeZone) || todayISOInTimeZone(timeZone);
}

function weakAttemptTargetSeconds(attempt: PyqAttemptRow): number {
  return targetTimeSecForMarks(attempt.question_marks ?? attempt.question_snapshot?.marks);
}

export function weakAttemptReasons(attempt: PyqAttemptRow): WeakAttemptReason[] {
  const reasons: WeakAttemptReason[] = [];
  if (attempt.mark_decision === 'SKIP') reasons.push('skipped');
  if (attempt.mark_correct === false) reasons.push('wrong');
  if (attempt.confidence === 'low') reasons.push('low-confidence');
  if (attempt.mark_correct === false && attempt.confidence === 'high') {
    reasons.push('high-confidence-wrong');
  }
  if (attempt.mark_correct === true && attempt.mark_decision === 'FIFTY_FIFTY') {
    reasons.push('guessed-correct');
  }
  if (
    attempt.mark_correct === true &&
    attempt.time_spent_sec > weakAttemptTargetSeconds(attempt)
  ) {
    reasons.push('slow-correct');
  }
  return unique(reasons);
}

export function needsRecoveryCapture(attempt: PyqAttemptRow): boolean {
  return weakAttemptReasons(attempt).length > 0;
}

function pyqItemId(userId: string, questionUid: string): string {
  return uuidFromString(`learning-item:${userId}:pyq:${questionUid}`);
}

function compatibilityReattemptId(itemId: string): string {
  return uuidFromString(`learning-item:${itemId}:compatibility-reattempt`);
}

function attemptEvent(attempt: PyqAttemptRow, itemId: string, timeZone: string): LearningEventRow {
  return {
    // Attempt ids are globally unique and make the automatic event identical
    // across devices and the SQL backfill.
    id: attempt.id,
    user_id: attempt.user_id,
    learning_item_id: itemId,
    event_type: 'answer_committed',
    occurred_at: attempt.attempted_at,
    local_date: attemptedLocalDate(attempt.attempted_at, timeZone),
    timezone: timeZone,
    source_pyq_attempt_id: attempt.id,
    recovery_session_id: null,
    grade: null,
    is_correct: attempt.mark_correct,
    answer: attempt.selected_answer,
    confidence: attempt.confidence ?? null,
    time_spent_ms: Math.max(0, attempt.time_spent_ms ?? attempt.time_spent_sec * 1000),
    hint_used: false,
    idempotency_key: `attempt:${attempt.id}`,
    metadata: {
      mark_decision: attempt.mark_decision,
      question_uid: attempt.question_uid,
      capture_version: attempt.capture_version,
      question_marks: attempt.question_marks ?? attempt.question_snapshot?.marks ?? null,
      pyq_session_id: attempt.pyq_session_id
    },
    created_at: attempt.attempted_at
  };
}

function newPyqItem(
  attempt: PyqAttemptRow,
  reasons: WeakAttemptReason[],
  timeZone: string,
  id = pyqItemId(attempt.user_id, attempt.question_uid)
): LearningItemRow {
  const localDate = attemptedLocalDate(attempt.attempted_at, timeZone);
  return {
    id,
    user_id: attempt.user_id,
    source_kind: 'pyq',
    question_uid: attempt.question_uid,
    source_question_id: null,
    content_fingerprint: null,
    subject: attempt.subject,
    topic: attempt.question_snapshot?.topic ?? null,
    origin_pyq_attempt_id: attempt.id,
    latest_pyq_attempt_id: attempt.id,
    analysis_state: 'pending',
    recovery_state: 'active',
    stage: 'D3',
    scheduled_date: addDaysISO(localDate, 3),
    reason_flags: reasons,
    lapse_count: 0,
    successful_retrieval_count: 0,
    last_grade: null,
    last_interval_days: null,
    successful_due_d30_at: null,
    transfer_passed_at: null,
    mastered_at: null,
    created_at: attempt.attempted_at,
    updated_at: attempt.attempted_at
  };
}

function mergeWeakAttempt(
  current: LearningItemRow,
  attempt: PyqAttemptRow,
  reasons: WeakAttemptReason[],
  timeZone: string
): LearningItemRow {
  const reopened = current.recovery_state === 'mastered' || current.stage === 'MASTERED';
  const nextDue = addDaysISO(attemptedLocalDate(attempt.attempted_at, timeZone), 3);
  const activeDue =
    current.scheduled_date && !reopened && current.scheduled_date < nextDue
      ? current.scheduled_date
      : nextDue;
  return {
    ...current,
    subject: attempt.subject || current.subject,
    topic: attempt.question_snapshot?.topic ?? current.topic,
    latest_pyq_attempt_id: attempt.id,
    recovery_state: reopened ? 'active' : current.recovery_state,
    stage: reopened ? 'D3' : current.stage,
    scheduled_date: reopened ? nextDue : activeDue,
    reason_flags: unique([...current.reason_flags, ...reasons]),
    mastered_at: reopened ? null : current.mastered_at,
    updated_at: attempt.attempted_at
  };
}

function compatibilityReattempt(
  item: LearningItemRow,
  questionId: string,
  existing: ReattemptRow | null
): ReattemptRow {
  const stage = item.stage === 'TRANSFER' ? 'D30' : item.stage;
  const scheduledDate = item.scheduled_date ?? todayISOInTimeZone();
  if (existing) {
    return {
      ...existing,
      question_id: questionId,
      learning_item_id: item.id,
      stage,
      scheduled_date: scheduledDate
    };
  }
  return {
    id: compatibilityReattemptId(item.id),
    user_id: item.user_id,
    question_id: questionId,
    learning_item_id: item.id,
    scheduled_date: scheduledDate,
    stage,
    history: [],
    created_at: item.created_at
  };
}

/**
 * Atomically capture weak evidence. Repeating the call is safe: canonical
 * identity and event idempotency prevent parallel ladders or duplicate facts.
 */
export async function captureWeakPyqAttempt(args: {
  attempt: PyqAttemptRow;
  timeZone: string;
  compatibilityQuestion?: QuestionRow | null;
}): Promise<WeakAttemptCapture | null> {
  const { attempt, timeZone } = args;
  const reasons = weakAttemptReasons(attempt);
  if (reasons.length === 0) return null;

  const existingItem = await db.learning_items
    .where('[user_id+question_uid]')
    .equals([attempt.user_id, attempt.question_uid])
    .first();
  const item = existingItem
    ? mergeWeakAttempt(existingItem, attempt, reasons, timeZone)
    : newPyqItem(attempt, reasons, timeZone);
  const event = attemptEvent(attempt, item.id, timeZone);
  const existingEvent = await db.learning_events
    .where('[user_id+idempotency_key]')
    .equals([attempt.user_id, event.idempotency_key])
    .first();

  const suppliedQuestion = args.compatibilityQuestion ?? null;
  const linkedQuestion =
    suppliedQuestion ??
    (await db.questions
      .where('source_pyq_attempt_id')
      .equals(attempt.id)
      .filter((question) => question.user_id === attempt.user_id)
      .first()) ??
    null;
  const existingReattempt =
    (await db.reattempts
      .where('[user_id+learning_item_id]')
      .equals([attempt.user_id, item.id])
      .first()) ?? null;
  const reattempt = linkedQuestion
    ? compatibilityReattempt(item, linkedQuestion.id, existingReattempt)
    : null;

  const writes: Parameters<typeof writeLocalBatch>[0] = [];
  if (suppliedQuestion) writes.push({ name: 'questions', row: suppliedQuestion });
  writes.push({ name: 'learning_items', row: item });
  if (!existingEvent) writes.push({ name: 'learning_events', row: event });
  if (reattempt) writes.push({ name: 'reattempts', row: reattempt });
  await writeLocalBatch(writes);

  return {
    item,
    event: existingEvent ?? event,
    reasons,
    compatibilityQuestion: linkedQuestion,
    compatibilityReattempt: reattempt
  };
}

export async function markLearningAnalysisCompleted(args: {
  userId: string;
  sourceAttemptId: string;
  timeZone: string;
  occurredAt?: string;
}): Promise<LearningItemRow | null> {
  const attempt = await db.pyq_attempts.get(args.sourceAttemptId);
  if (!attempt || attempt.user_id !== args.userId) return null;
  const item = await db.learning_items
    .where('[user_id+question_uid]')
    .equals([args.userId, attempt.question_uid])
    .first();
  if (!item) return null;
  const occurredAt = args.occurredAt ?? nowISO();
  const updated: LearningItemRow = {
    ...item,
    analysis_state: 'completed',
    updated_at: occurredAt
  };
  const event: LearningEventRow = {
    id: uuidFromString(`learning-event:analysis:${args.sourceAttemptId}`),
    user_id: args.userId,
    learning_item_id: item.id,
    event_type: 'analysis_completed',
    occurred_at: occurredAt,
    local_date: calendarDateInTimeZone(occurredAt, args.timeZone),
    timezone: args.timeZone,
    source_pyq_attempt_id: args.sourceAttemptId,
    recovery_session_id: null,
    grade: null,
    is_correct: null,
    answer: null,
    confidence: null,
    time_spent_ms: null,
    hint_used: false,
    idempotency_key: `analysis:${args.sourceAttemptId}`,
    metadata: {},
    created_at: occurredAt
  };
  const existingEvent = await db.learning_events
    .where('[user_id+idempotency_key]')
    .equals([args.userId, event.idempotency_key])
    .first();
  await writeLocalBatch([
    { name: 'learning_items', row: updated },
    ...(!existingEvent ? [{ name: 'learning_events' as const, row: event }] : [])
  ]);
  return updated;
}

function conservativeStage(rows: ReattemptRow[]): LearningItemRow['stage'] {
  const open = rows.filter((row) => row.stage !== 'MASTERED');
  if (open.length === 0) return 'MASTERED';
  return open.reduce<LearningItemRow['stage']>((lowest, row) =>
    STAGE_PRIORITY[row.stage] < STAGE_PRIORITY[lowest] ? row.stage : lowest
  , open[0].stage);
}

/**
 * Compatibility migration for devices that pre-date canonical recovery.
 * Call only after the initial cloud pull so remote backfill rows win by ID.
 */
export async function backfillLocalLearningEvidence(userId: string, timeZone: string): Promise<void> {
  const [reattempts, questions, attempts] = await Promise.all([
    db.reattempts.where('user_id').equals(userId).toArray(),
    db.questions.where('user_id').equals(userId).toArray(),
    db.pyq_attempts.where('user_id').equals(userId).toArray()
  ]);
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const groups = new Map<
    string,
    { rows: ReattemptRow[]; questions: QuestionRow[]; attempts: PyqAttemptRow[] }
  >();

  for (const row of reattempts) {
    const question = questionById.get(row.question_id);
    if (!question) continue;
    const attempt = question.source_pyq_attempt_id
      ? attemptById.get(question.source_pyq_attempt_id)
      : undefined;
    const key = attempt ? `pyq:${attempt.question_uid}` : `manual:${question.id}`;
    const group = groups.get(key) ?? { rows: [], questions: [], attempts: [] };
    group.rows.push(row);
    group.questions.push(question);
    if (attempt) group.attempts.push(attempt);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.rows.sort((left, right) =>
      left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
    );
    group.attempts.sort((left, right) => left.attempted_at.localeCompare(right.attempted_at));
    const sourceAttempt = group.attempts[0] ?? null;
    const existing = sourceAttempt
      ? await db.learning_items
          .where('[user_id+question_uid]')
          .equals([userId, sourceAttempt.question_uid])
          .first()
      : await db.learning_items
          .where('[user_id+source_question_id]')
          .equals([userId, group.questions[0].id])
          .first();
    const stage = conservativeStage(group.rows);
    const openDates = group.rows
      .filter((row) => row.stage !== 'MASTERED')
      .map((row) => row.scheduled_date)
      .sort();
    const createdAt = group.rows[0].created_at;
    const legacyLapses = group.rows.reduce(
      (total, row) => total + row.history.filter((entry) => entry.result === 'fail').length,
      0
    );
    const firstQuestion = group.questions[0];
    const reasons = sourceAttempt ? weakAttemptReasons(sourceAttempt) : [];
    const item: LearningItemRow = existing ?? {
      id: group.rows[0].id,
      user_id: userId,
      source_kind: sourceAttempt ? 'pyq' : 'manual',
      question_uid: sourceAttempt?.question_uid ?? null,
      source_question_id: firstQuestion.id,
      content_fingerprint: null,
      subject: firstQuestion.subject,
      topic: firstQuestion.subtopic,
      origin_pyq_attempt_id: sourceAttempt?.id ?? null,
      latest_pyq_attempt_id: group.attempts.at(-1)?.id ?? null,
      analysis_state: 'completed',
      recovery_state: stage === 'MASTERED' ? 'mastered' : 'active',
      stage,
      scheduled_date: openDates[0] ?? null,
      reason_flags: reasons.length > 0 ? reasons : ['legacy-recovery'],
      lapse_count: legacyLapses,
      successful_retrieval_count: group.rows.reduce(
        (total, row) => total + row.history.filter((entry) => entry.result === 'clean').length,
        0
      ),
      last_grade: null,
      last_interval_days: null,
      successful_due_d30_at: null,
      transfer_passed_at: null,
      mastered_at: null,
      created_at: createdAt,
      updated_at: createdAt
    };
    const writes: Parameters<typeof writeLocalBatch>[0] = [
      { name: 'learning_items', row: item }
    ];
    for (const row of group.rows) {
      const linkedReattempt: ReattemptRow = { ...row, learning_item_id: item.id };
      writes.push({ name: 'reattempts', row: linkedReattempt });
      const idempotencyKey = `legacy-created:${row.id}`;
      const alreadyCreated = await db.learning_events
        .where('[user_id+idempotency_key]')
        .equals([userId, idempotencyKey])
        .first();
      if (!alreadyCreated) {
        const createdEvent: LearningEventRow = {
          id: row.id,
          user_id: userId,
          learning_item_id: item.id,
          event_type: 'created',
          occurred_at: row.created_at,
          local_date: calendarDateInTimeZone(row.created_at, timeZone),
          timezone: timeZone,
          source_pyq_attempt_id: null,
          recovery_session_id: null,
          grade: null,
          is_correct: null,
          answer: null,
          confidence: null,
          time_spent_ms: null,
          hint_used: false,
          idempotency_key: idempotencyKey,
          metadata: {
            legacy_reattempt_id: row.id,
            legacy_question_id: row.question_id,
            legacy_stage: row.stage,
            legacy_scheduled_date: row.scheduled_date
          },
          created_at: row.created_at
        };
        writes.push({
          name: 'learning_events',
          row: createdEvent
        });
      }
      for (const [index, history] of row.history.entries()) {
        const historyKey = `legacy-history:${row.id}:${index + 1}`;
        const alreadyImported = await db.learning_events
          .where('[user_id+idempotency_key]')
          .equals([userId, historyKey])
          .first();
        if (alreadyImported) continue;
        const clean = history.result === 'clean';
        const grade: RecoveryGrade = clean ? 'good' : 'again';
        const historyEvent: LearningEventRow = {
          id: uuidFromString(`learning-event:${historyKey}`),
          user_id: userId,
          learning_item_id: item.id,
          event_type: clean ? 'retrieval_good' : 'retrieval_again',
          occurred_at: `${history.date}T00:00:00.000Z`,
          local_date: history.date,
          timezone: timeZone,
          source_pyq_attempt_id: null,
          recovery_session_id: null,
          grade,
          is_correct: clean,
          answer: history.selectedAnswer ?? null,
          confidence: null,
          time_spent_ms:
            history.timeSpent == null ? null : Math.max(0, Math.round(history.timeSpent * 1000)),
          hint_used: false,
          idempotency_key: historyKey,
          metadata: { legacy_history: history, legacy_import: true },
          created_at: createdAt
        };
        writes.push({
          name: 'learning_events',
          row: historyEvent
        });
      }
    }
    await writeLocalBatch(writes);
  }

  // Capture attempts that never reached Journal or the legacy ladder.
  for (const attempt of attempts.sort((a, b) => a.attempted_at.localeCompare(b.attempted_at))) {
    if (!needsRecoveryCapture(attempt)) continue;
    const question = questions.find((candidate) => candidate.source_pyq_attempt_id === attempt.id);
    await captureWeakPyqAttempt({
      attempt,
      timeZone,
      compatibilityQuestion: question ?? null
    });
  }
}
