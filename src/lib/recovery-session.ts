import { db } from '@/lib/db';
import {
  buildRecoverySprint,
  deriveRecoveryGrade,
  transitionRecoveryItem,
  type RecoveryCandidate,
  type RecoveryGradeEvidence,
  type RecoverySprint
} from '@/lib/recovery-engine';
import { writeLocalBatch } from '@/lib/sync';
import { addDaysISO, calendarDateInTimeZone, nowISO, uuid, uuidFromString } from '@/lib/utils';
import type {
  LearningEventRow,
  LearningItemRow,
  PyqSelectedAnswer,
  RecoverySessionMode,
  RecoverySessionRow,
  ReattemptRow
} from '@/types';

function sessionSnapshot(sprint: RecoverySprint): Array<Record<string, unknown>> {
  return sprint.selected.map((candidate, index) => ({
    position: index,
    learning_item_id: candidate.item.id,
    subject: candidate.item.subject,
    topic: candidate.item.topic,
    stage: candidate.item.stage,
    scheduled_date: candidate.item.scheduled_date,
    reason_flags: candidate.item.reason_flags,
    priority_reasons: candidate.reasons,
    priority_score: candidate.score,
    estimated_seconds: candidate.estimatedSeconds
  }));
}

export async function startRecoverySession(args: {
  userId: string;
  mode: RecoverySessionMode;
  candidates: RecoveryCandidate[];
  today: string;
  selectionSeed?: string;
  startedAt?: string;
}): Promise<{ session: RecoverySessionRow; sprint: RecoverySprint }> {
  const sprint = buildRecoverySprint(args.candidates, args.mode, args.today);
  if (sprint.selected.length === 0) throw new Error('No recovery items match this sprint.');
  const startedAt = args.startedAt ?? nowISO();
  const session: RecoverySessionRow = {
    id: uuid(),
    user_id: args.userId,
    status: 'active',
    mode: args.mode,
    selection_seed: args.selectionSeed ?? uuid(),
    item_ids: sprint.selected.map((candidate) => candidate.item.id),
    current_index: 0,
    queue_snapshot: sessionSnapshot(sprint),
    draft_answer: null,
    elapsed_by_item_ms: {},
    deferred_item_ids: [],
    hinted_item_ids: [],
    current_item_started_at: startedAt,
    started_at: startedAt,
    updated_at: startedAt,
    completed_at: null
  };
  await writeLocalBatch([{ name: 'recovery_sessions', row: session }]);
  return { session, sprint };
}

export async function latestResumableRecoverySession(
  userId: string
): Promise<RecoverySessionRow | null> {
  const rows = await db.recovery_sessions
    .where('user_id')
    .equals(userId)
    .filter((row) => ['active', 'paused', 'interrupted'].includes(row.status))
    .toArray();
  return (
    rows.sort(
      (left, right) =>
        right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id)
    )[0] ?? null
  );
}

export async function checkpointRecoverySession(
  session: RecoverySessionRow,
  patch: Partial<
    Pick<
      RecoverySessionRow,
      | 'status'
      | 'current_index'
      | 'draft_answer'
      | 'elapsed_by_item_ms'
      | 'deferred_item_ids'
      | 'hinted_item_ids'
      | 'current_item_started_at'
      | 'completed_at'
    >
  >,
  updatedAt = nowISO()
): Promise<RecoverySessionRow> {
  const stored = await db.recovery_sessions.get(session.id);
  if (stored && stored.user_id !== session.user_id) {
    throw new Error('This recovery session belongs to another learner.');
  }
  const base = stored ?? session;
  if (base.status === 'completed' || base.status === 'abandoned') return base;
  const baseIndex = Math.max(0, Math.min(base.current_index, base.item_ids.length));
  const requestedIndex = Math.max(
    0,
    Math.min(patch.current_index ?? baseIndex, base.item_ids.length)
  );
  const currentIndex = Math.max(baseIndex, requestedIndex);
  if (Object.prototype.hasOwnProperty.call(patch, 'draft_answer') && patch.draft_answer != null) {
    const draft = patch.draft_answer;
    const draftItemId =
      typeof draft === 'object' && draft !== null && !Array.isArray(draft)
        ? (draft as Record<string, unknown>)['itemId']
        : null;
    const currentItemId = base.item_ids[currentIndex] ?? null;
    // A delayed keystroke from the previous question must never become the
    // draft for the next question after a retrieval/defer advances the queue.
    if (typeof draftItemId === 'string' && draftItemId !== currentItemId) return base;
  }
  const next: RecoverySessionRow = {
    ...base,
    ...patch,
    current_index: currentIndex,
    elapsed_by_item_ms: {
      ...base.elapsed_by_item_ms,
      ...(patch.elapsed_by_item_ms ?? {})
    },
    deferred_item_ids: patch.deferred_item_ids
      ? [...new Set([...base.deferred_item_ids, ...patch.deferred_item_ids])]
      : base.deferred_item_ids,
    hinted_item_ids: patch.hinted_item_ids
      ? [...new Set([...base.hinted_item_ids, ...patch.hinted_item_ids])]
      : base.hinted_item_ids,
    updated_at: updatedAt
  };
  if (patch.status === 'active' && base.status !== 'active' && patch.current_item_started_at) {
    // An activation identifies one interruptible run of the current item. Keep
    // it distinct even when two resumes share a coarse/frozen device clock.
    const previousMs = Date.parse(base.updated_at);
    const requestedMs = Date.parse(patch.current_item_started_at);
    if (Number.isFinite(previousMs) && Number.isFinite(requestedMs)) {
      next.current_item_started_at = new Date(Math.max(requestedMs, previousMs + 1)).toISOString();
      next.updated_at = next.current_item_started_at;
    }
  }
  await writeLocalBatch([{ name: 'recovery_sessions', row: next }]);
  return next;
}

function neutralEvent(args: {
  session: RecoverySessionRow;
  item: LearningItemRow;
  type: 'hint_revealed' | 'deferred' | 'interrupted';
  timeZone: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}): LearningEventRow {
  const activation = args.type === 'interrupted'
    ? `:${args.session.current_item_started_at ?? args.session.updated_at}`
    : '';
  const idempotencyKey = `${args.type}:${args.session.id}:${args.item.id}:${args.session.current_index}${activation}`;
  return {
    id: uuidFromString(`learning-event:${idempotencyKey}`),
    user_id: args.session.user_id,
    learning_item_id: args.item.id,
    event_type: args.type,
    occurred_at: args.occurredAt,
    local_date: calendarDateInTimeZone(args.occurredAt, args.timeZone),
    timezone: args.timeZone,
    source_pyq_attempt_id: null,
    recovery_session_id: args.session.id,
    grade: null,
    is_correct: null,
    answer: null,
    confidence: null,
    time_spent_ms: null,
    hint_used: args.type === 'hint_revealed',
    idempotency_key: idempotencyKey,
    metadata: args.metadata ?? {},
    created_at: args.occurredAt
  };
}

async function authoritativeRecoverySession(
  session: RecoverySessionRow
): Promise<RecoverySessionRow> {
  const stored = await db.recovery_sessions.get(session.id);
  if (!stored) return session;
  if (stored.user_id !== session.user_id) {
    throw new Error('This recovery session belongs to another learner.');
  }
  return stored;
}

async function authoritativeRecoveryItem(item: LearningItemRow): Promise<LearningItemRow> {
  const stored = await db.learning_items.get(item.id);
  if (!stored) return item;
  if (stored.user_id !== item.user_id) {
    throw new Error('This recovery item belongs to another learner.');
  }
  return stored;
}

function assertCurrentRecoveryItem(
  session: RecoverySessionRow,
  item: LearningItemRow,
  expectedIndex: number
): void {
  if (session.user_id !== item.user_id) {
    throw new Error('This recovery item belongs to another learner.');
  }
  if (
    session.status !== 'active' ||
    session.current_index !== expectedIndex ||
    session.item_ids[session.current_index] !== item.id
  ) {
    throw new Error('This recovery submission is stale; resume the saved question and try again.');
  }
}

async function committedRecoveryState(
  session: RecoverySessionRow,
  item: LearningItemRow
): Promise<{ session: RecoverySessionRow; item: LearningItemRow }> {
  const [storedSession, storedItem] = await Promise.all([
    db.recovery_sessions.get(session.id),
    db.learning_items.get(item.id)
  ]);
  return {
    session: storedSession?.user_id === session.user_id ? storedSession : session,
    item: storedItem?.user_id === item.user_id ? storedItem : item
  };
}

function committedRecoveryGrade(
  event: LearningEventRow,
  fallback: ReturnType<typeof deriveRecoveryGrade>
): ReturnType<typeof deriveRecoveryGrade> {
  if (!event.grade) return fallback;
  const storedReasons = event.metadata['grade_reasons'];
  const reasons = Array.isArray(storedReasons)
    ? storedReasons.filter((reason): reason is string => typeof reason === 'string')
    : [];
  return {
    grade: event.grade,
    // Never reuse reasons derived from a delayed contradictory submission.
    // Older imported events may predate grade_reasons, so keep that fallback
    // honest without implying the retry's evidence produced the stored grade.
    reasons: reasons.length > 0 ? reasons : ['Previously committed retrieval.']
  };
}

export async function revealRecoveryHint(args: {
  session: RecoverySessionRow;
  item: LearningItemRow;
  timeZone: string;
  occurredAt?: string;
}): Promise<RecoverySessionRow> {
  const occurredAt = args.occurredAt ?? nowISO();
  const requestedEvent = neutralEvent({
    session: args.session,
    item: args.item,
    type: 'hint_revealed',
    timeZone: args.timeZone,
    occurredAt
  });
  const existing = await db.learning_events
    .where('[user_id+idempotency_key]')
    .equals([args.session.user_id, requestedEvent.idempotency_key])
    .first();
  if (existing) return authoritativeRecoverySession(args.session);
  const [session, item] = await Promise.all([
    authoritativeRecoverySession(args.session),
    authoritativeRecoveryItem(args.item)
  ]);
  assertCurrentRecoveryItem(session, item, args.session.current_index);
  const hintedItemIds = [...new Set([...session.hinted_item_ids, item.id])];
  const next: RecoverySessionRow = {
    ...session,
    hinted_item_ids: hintedItemIds,
    updated_at: occurredAt
  };
  const event = neutralEvent({
    session,
    item,
    type: 'hint_revealed',
    timeZone: args.timeZone,
    occurredAt
  });
  try {
    await writeLocalBatch([
      { name: 'recovery_sessions', row: next },
      { name: 'learning_events', row: event }
    ]);
  } catch (cause) {
    const committed = await db.learning_events
      .where('[user_id+idempotency_key]')
      .equals([args.session.user_id, requestedEvent.idempotency_key])
      .first();
    if (committed) return authoritativeRecoverySession(args.session);
    throw cause;
  }
  return next;
}

export async function deferRecoveryItem(args: {
  session: RecoverySessionRow;
  item: LearningItemRow;
  today: string;
  timeZone: string;
  reason: string;
  occurredAt?: string;
}): Promise<{ session: RecoverySessionRow; item: LearningItemRow }> {
  const occurredAt = args.occurredAt ?? nowISO();
  const requestedEvent = neutralEvent({
    session: args.session,
    item: args.item,
    type: 'deferred',
    timeZone: args.timeZone,
    occurredAt
  });
  const existing = await db.learning_events
    .where('[user_id+idempotency_key]')
    .equals([args.session.user_id, requestedEvent.idempotency_key])
    .first();
  if (existing) return committedRecoveryState(args.session, args.item);
  const [baseSession, baseItem] = await Promise.all([
    authoritativeRecoverySession(args.session),
    authoritativeRecoveryItem(args.item)
  ]);
  assertCurrentRecoveryItem(baseSession, baseItem, args.session.current_index);
  const nextIndex = Math.min(baseSession.item_ids.length, baseSession.current_index + 1);
  const completed = nextIndex >= baseSession.item_ids.length;
  const session: RecoverySessionRow = {
    ...baseSession,
    current_index: nextIndex,
    status: completed ? 'completed' : 'active',
    deferred_item_ids: [...new Set([...baseSession.deferred_item_ids, baseItem.id])],
    draft_answer: null,
    current_item_started_at: completed ? null : occurredAt,
    completed_at: completed ? occurredAt : null,
    updated_at: occurredAt
  };
  const item: LearningItemRow = {
    ...baseItem,
    // A defer is capped at one day and never moves a future review later.
    scheduled_date:
      baseItem.scheduled_date && baseItem.scheduled_date > args.today
        ? baseItem.scheduled_date
        : addDaysISO(args.today, 1),
    updated_at: occurredAt
  };
  const event = neutralEvent({
    session: baseSession,
    item: baseItem,
    type: 'deferred',
    timeZone: args.timeZone,
    occurredAt,
    metadata: { reason: args.reason, next_due_date: item.scheduled_date }
  });
  try {
    await writeLocalBatch([
      { name: 'recovery_sessions', row: session },
      { name: 'learning_items', row: item },
      { name: 'learning_events', row: event }
    ]);
  } catch (cause) {
    const committed = await db.learning_events
      .where('[user_id+idempotency_key]')
      .equals([args.session.user_id, requestedEvent.idempotency_key])
      .first();
    if (committed) return committedRecoveryState(args.session, args.item);
    throw cause;
  }
  return { session, item };
}

export async function interruptRecoverySession(args: {
  session: RecoverySessionRow;
  item: LearningItemRow | null;
  timeZone: string;
  reason: string;
  elapsedMs?: number;
  occurredAt?: string;
}): Promise<RecoverySessionRow> {
  const occurredAt = args.occurredAt ?? nowISO();
  const requestedEvent = args.item
    ? neutralEvent({
        session: args.session,
        item: args.item,
        type: 'interrupted',
        timeZone: args.timeZone,
        occurredAt,
        metadata: { reason: args.reason, elapsed_ms: args.elapsedMs ?? null }
      })
    : null;
  if (requestedEvent) {
    const existing = await db.learning_events
      .where('[user_id+idempotency_key]')
      .equals([args.session.user_id, requestedEvent.idempotency_key])
      .first();
    if (existing) return authoritativeRecoverySession(args.session);
  }
  const baseSession = await authoritativeRecoverySession(args.session);
  if (!args.item) {
    if (
      baseSession.status === 'completed' ||
      baseSession.status === 'abandoned' ||
      baseSession.current_index !== args.session.current_index ||
      baseSession.updated_at > args.session.updated_at
    ) {
      return baseSession;
    }
  }
  const item = args.item ? await authoritativeRecoveryItem(args.item) : null;
  if (item) assertCurrentRecoveryItem(baseSession, item, args.session.current_index);
  const elapsedByItem = { ...baseSession.elapsed_by_item_ms };
  if (item && args.elapsedMs != null) {
    elapsedByItem[item.id] = Math.max(0, Math.round(args.elapsedMs));
  }
  const session: RecoverySessionRow = {
    ...baseSession,
    status: 'interrupted',
    elapsed_by_item_ms: elapsedByItem,
    current_item_started_at: null,
    updated_at: occurredAt
  };
  const writes: Parameters<typeof writeLocalBatch>[0] = [
    { name: 'recovery_sessions', row: session }
  ];
  if (item) {
    const event = neutralEvent({
      session: baseSession,
      item,
      type: 'interrupted',
      timeZone: args.timeZone,
      occurredAt,
      metadata: { reason: args.reason, elapsed_ms: args.elapsedMs ?? null }
    });
    writes.push({ name: 'learning_events', row: event });
  }
  try {
    await writeLocalBatch(writes);
  } catch (cause) {
    if (requestedEvent) {
      const committed = await db.learning_events
        .where('[user_id+idempotency_key]')
        .equals([args.session.user_id, requestedEvent.idempotency_key])
        .first();
      if (committed) return authoritativeRecoverySession(args.session);
    }
    throw cause;
  }
  return session;
}

function legacyProjection(
  row: ReattemptRow,
  item: LearningItemRow,
  grade: 'again' | 'hard' | 'good' | 'easy',
  localDate: string,
  answer: PyqSelectedAnswer,
  timeSpentSec: number
): ReattemptRow {
  const stage = item.stage === 'TRANSFER' ? 'D30' : item.stage;
  return {
    ...row,
    learning_item_id: item.id,
    stage,
    scheduled_date: item.scheduled_date ?? row.scheduled_date,
    history: [
      ...row.history,
      {
        date: localDate,
        result: grade === 'again' ? 'fail' : 'clean',
        timeSpent: Math.max(0, Math.round(timeSpentSec)),
        selectedAnswer: answer
      }
    ]
  };
}

export async function recordRecoveryRetrieval(args: {
  session: RecoverySessionRow;
  item: LearningItemRow;
  evidence: RecoveryGradeEvidence;
  answer: PyqSelectedAnswer;
  sourcePyqAttemptId?: string | null;
  timeZone: string;
  today: string;
  occurredAt?: string;
}): Promise<{
  session: RecoverySessionRow;
  item: LearningItemRow;
  grade: ReturnType<typeof deriveRecoveryGrade>;
  explanation: string;
}> {
  const occurredAt = args.occurredAt ?? nowISO();
  const grade = deriveRecoveryGrade(args.evidence);
  const idempotencyKey = `retrieval:${args.session.id}:${args.item.id}:${args.session.current_index}`;
  const existingEvent = await db.learning_events
    .where('[user_id+idempotency_key]')
    .equals([args.session.user_id, idempotencyKey])
    .first();
  if (existingEvent) {
    const committed = await committedRecoveryState(args.session, args.item);
    return {
      ...committed,
      grade: committedRecoveryGrade(existingEvent, grade),
      explanation: 'This retrieval was already committed; no evidence was duplicated.'
    };
  }
  const [baseSession, baseItem] = await Promise.all([
    authoritativeRecoverySession(args.session),
    authoritativeRecoveryItem(args.item)
  ]);
  assertCurrentRecoveryItem(baseSession, baseItem, args.session.current_index);
  const transition = transitionRecoveryItem({
    item: baseItem,
    grade: grade.grade,
    today: args.today,
    occurredAt
  });
  const transitionedItem: LearningItemRow = args.sourcePyqAttemptId
    ? { ...transition.item, latest_pyq_attempt_id: args.sourcePyqAttemptId }
    : transition.item;
  const nextIndex = Math.min(baseSession.item_ids.length, baseSession.current_index + 1);
  const complete = nextIndex >= baseSession.item_ids.length;
  const elapsedByItemMs = {
    ...baseSession.elapsed_by_item_ms,
    [baseItem.id]: Math.max(0, Math.round(args.evidence.timeSpentSec * 1000))
  };
  const session: RecoverySessionRow = {
    ...baseSession,
    status: complete ? 'completed' : 'active',
    current_index: nextIndex,
    draft_answer: null,
    elapsed_by_item_ms: elapsedByItemMs,
    current_item_started_at: complete ? null : occurredAt,
    updated_at: occurredAt,
    completed_at: complete ? occurredAt : null
  };
  const event: LearningEventRow = {
    id: uuidFromString(`learning-event:${idempotencyKey}`),
    user_id: baseSession.user_id,
    learning_item_id: baseItem.id,
    event_type: `retrieval_${grade.grade}`,
    occurred_at: occurredAt,
    local_date: args.today,
    timezone: args.timeZone,
    source_pyq_attempt_id: args.sourcePyqAttemptId ?? null,
    recovery_session_id: baseSession.id,
    grade: grade.grade,
    is_correct: args.evidence.correct,
    answer: args.answer,
    confidence: args.evidence.confidence,
    time_spent_ms: Math.max(0, Math.round(args.evidence.timeSpentSec * 1000)),
    hint_used: args.evidence.hintUsed,
    idempotency_key: idempotencyKey,
    metadata: {
      grade_reasons: grade.reasons,
      previous_stage: baseItem.stage,
      next_stage: transitionedItem.stage,
      next_due_date: transitionedItem.scheduled_date,
      target_time_sec: args.evidence.targetTimeSec
    },
    created_at: occurredAt
  };
  const legacy = await db.reattempts
    .where('[user_id+learning_item_id]')
    .equals([baseSession.user_id, baseItem.id])
    .first();
  const writes: Parameters<typeof writeLocalBatch>[0] = [
    { name: 'recovery_sessions', row: session },
    { name: 'learning_items', row: transitionedItem }
  ];
  writes.push({ name: 'learning_events', row: event });
  if (legacy) {
    writes.push({
      name: 'reattempts',
      row: legacyProjection(
        legacy,
        transitionedItem,
        grade.grade,
        args.today,
        args.answer,
        args.evidence.timeSpentSec
      )
    });
  }
  if (transition.item.recovery_state === 'remediation' && baseItem.recovery_state !== 'remediation') {
    const remediationKey = `remediation-started:${baseSession.id}:${baseItem.id}:${baseSession.current_index}`;
    const remediationEvent: LearningEventRow = {
      ...event,
      id: uuidFromString(`learning-event:${remediationKey}`),
      event_type: 'remediation_started',
      grade: null,
      idempotency_key: remediationKey,
      metadata: { lapse_count: transition.item.lapse_count },
      answer: null
    };
    writes.push({ name: 'learning_events', row: remediationEvent });
  }
  if (baseItem.stage === 'TRANSFER') {
    const transferPassed = transition.mastered;
    const transferKey = `${transferPassed ? 'transfer-passed' : 'transfer-failed'}:${baseSession.id}:${baseItem.id}:${baseSession.current_index}`;
    const transferEvent: LearningEventRow = {
      ...event,
      id: uuidFromString(`learning-event:${transferKey}`),
      event_type: transferPassed ? 'transfer_passed' : 'transfer_failed',
      grade: null,
      idempotency_key: transferKey,
      metadata: {
        retrieval_grade: grade.grade,
        next_stage: transitionedItem.stage,
        next_due_date: transitionedItem.scheduled_date
      },
      answer: null
    };
    const existingTransfer = await db.learning_events
      .where('[user_id+idempotency_key]')
      .equals([baseSession.user_id, transferKey])
      .first();
    if (!existingTransfer) writes.push({ name: 'learning_events', row: transferEvent });
  }
  if (transition.mastered) {
    const masteredKey = `mastered:${baseSession.id}:${baseItem.id}:${baseSession.current_index}`;
    const masteredEvent: LearningEventRow = {
      ...event,
      id: uuidFromString(`learning-event:${masteredKey}`),
      event_type: 'mastered',
      grade: null,
      idempotency_key: masteredKey,
      metadata: {
        via: baseItem.stage === 'TRANSFER' ? 'transfer' : 'due-d30',
        retrieval_grade: grade.grade
      },
      answer: null
    };
    writes.push({ name: 'learning_events', row: masteredEvent });
  }
  try {
    await writeLocalBatch(writes);
  } catch (cause) {
    const committedEvent = await db.learning_events
      .where('[user_id+idempotency_key]')
      .equals([args.session.user_id, idempotencyKey])
      .first();
    if (committedEvent) {
      const committed = await committedRecoveryState(args.session, args.item);
      return {
        ...committed,
        grade: committedRecoveryGrade(committedEvent, grade),
        explanation: 'This retrieval was already committed; no evidence was duplicated.'
      };
    }
    throw cause;
  }
  return { session, item: transitionedItem, grade, explanation: transition.explanation };
}
