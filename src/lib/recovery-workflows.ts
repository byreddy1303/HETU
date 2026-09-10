import { db } from '@/lib/db';
import { writeLocalBatch } from '@/lib/sync';
import {
  addDaysISO,
  calendarDateInTimeZone,
  nowISO,
  uuidFromString
} from '@/lib/utils';
import type { PyqQuestion } from '@/lib/pyq';
import type {
  LearningEventRow,
  LearningItemRow,
  PyqAttemptRow,
  RecoverySessionRow
} from '@/types';

export interface TransferQuestionSelection {
  question: PyqQuestion | null;
  eligibleCount: number;
  excludedSeen: number;
  excludedReserved: number;
  seed: string;
  reasons: string[];
}

export interface TransferAssignmentEvidence {
  questionUid: string;
  subject: string;
  topic: string;
  assignedAt: string;
  dueDate: string;
}

export interface RemediationEvidence {
  correctedOpeningMove: string;
  focusedPlan: string;
  completedAt: string;
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('en');
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Pick a fresh, machine-checkable question from the exact same subject/topic.
 * The selector is deterministic and never consumes sealed benchmark questions.
 */
export function selectExactTopicTransferQuestion(args: {
  item: LearningItemRow;
  questions: readonly PyqQuestion[];
  attempts: readonly PyqAttemptRow[];
  reservedQuestionUids?: ReadonlySet<string> | readonly string[];
  seed?: string;
}): TransferQuestionSelection {
  const seen = new Set(
    args.attempts
      .filter((attempt) => attempt.user_id === args.item.user_id)
      .map((attempt) => attempt.question_uid)
  );
  const reserved =
    args.reservedQuestionUids instanceof Set
      ? args.reservedQuestionUids
      : new Set(args.reservedQuestionUids ?? []);
  const subject = normalized(args.item.subject);
  const topic = normalized(args.item.topic);
  const seed =
    args.seed ??
    `${args.item.id}:${args.item.successful_retrieval_count}:${args.item.lapse_count}:transfer`;
  let excludedSeen = 0;
  let excludedReserved = 0;
  const eligible = args.questions.filter((question) => {
    if (question.id === args.item.question_uid) return false;
    if (normalized(question.subject) !== subject || normalized(question.topic) !== topic) {
      return false;
    }
    if (
      question.answerStatus !== 'available' ||
      !['MCQ', 'MSQ', 'NAT'].includes(question.type)
    ) {
      return false;
    }
    if (seen.has(question.id)) {
      excludedSeen += 1;
      return false;
    }
    if (reserved.has(question.id)) {
      excludedReserved += 1;
      return false;
    }
    return true;
  });
  const ordered = [...eligible].sort(
    (left, right) =>
      fnv1a(`${seed}:${left.id}`) - fnv1a(`${seed}:${right.id}`) ||
      right.year - left.year ||
      left.id.localeCompare(right.id)
  );
  return {
    question: ordered[0] ?? null,
    eligibleCount: ordered.length,
    excludedSeen,
    excludedReserved,
    seed,
    reasons: [
      'exact same topic',
      'not attempted before',
      'answer is machine-checkable',
      'sealed benchmark reserve excluded'
    ]
  };
}

function workflowEvent(args: {
  item: LearningItemRow;
  eventType: LearningEventRow['event_type'];
  idempotencyKey: string;
  occurredAt: string;
  timeZone: string;
  sessionId?: string | null;
  metadata: Record<string, unknown>;
}): LearningEventRow {
  return {
    id: uuidFromString(`learning-event:${args.idempotencyKey}`),
    user_id: args.item.user_id,
    learning_item_id: args.item.id,
    event_type: args.eventType,
    occurred_at: args.occurredAt,
    local_date: calendarDateInTimeZone(args.occurredAt, args.timeZone),
    timezone: args.timeZone,
    source_pyq_attempt_id: null,
    recovery_session_id: args.sessionId ?? null,
    grade: null,
    is_correct: null,
    answer: null,
    confidence: null,
    time_spent_ms: null,
    hint_used: false,
    idempotency_key: args.idempotencyKey,
    metadata: args.metadata,
    created_at: args.occurredAt
  };
}

export function transferAssignmentFromEvents(
  events: readonly LearningEventRow[],
  learningItemId: string
): TransferAssignmentEvidence | null {
  const event = events
    .filter(
      (candidate) =>
        candidate.learning_item_id === learningItemId &&
        candidate.event_type === 'transfer_assigned'
    )
    .sort(
      (left, right) =>
        right.occurred_at.localeCompare(left.occurred_at) || right.id.localeCompare(left.id)
    )[0];
  if (!event) return null;
  const questionUid = event.metadata['transfer_question_uid'];
  const dueDate = event.metadata['due_date'];
  if (typeof questionUid !== 'string' || typeof dueDate !== 'string') return null;
  return {
    questionUid,
    subject:
      typeof event.metadata['subject'] === 'string' ? event.metadata['subject'] : '',
    topic: typeof event.metadata['topic'] === 'string' ? event.metadata['topic'] : '',
    assignedAt: event.occurred_at,
    dueDate
  };
}

export function remediationEvidenceFromEvents(
  events: readonly LearningEventRow[],
  learningItemId: string
): RemediationEvidence | null {
  const event = events
    .filter(
      (candidate) =>
        candidate.learning_item_id === learningItemId &&
        candidate.event_type === 'remediation_completed'
    )
    .sort(
      (left, right) =>
        right.occurred_at.localeCompare(left.occurred_at) || right.id.localeCompare(left.id)
    )[0];
  if (!event) return null;
  const correctedOpeningMove = event.metadata['corrected_opening_move'];
  const focusedPlan = event.metadata['focused_plan'];
  if (typeof correctedOpeningMove !== 'string' || typeof focusedPlan !== 'string') return null;
  return { correctedOpeningMove, focusedPlan, completedAt: event.occurred_at };
}

/** Record the learner's corrected first move and one bounded remediation action. */
export async function completeRecoveryRemediation(args: {
  item: LearningItemRow;
  correctedOpeningMove: string;
  focusedPlan: string;
  today: string;
  timeZone: string;
  session?: RecoverySessionRow | null;
  occurredAt?: string;
}): Promise<{ item: LearningItemRow; session: RecoverySessionRow | null }> {
  const correctedOpeningMove = args.correctedOpeningMove.trim();
  const focusedPlan = args.focusedPlan.trim();
  if (correctedOpeningMove.length < 8) {
    throw new Error('Record a specific corrected opening move before continuing.');
  }
  if (focusedPlan.length < 8) {
    throw new Error('Record one focused remediation action before continuing.');
  }
  const occurredAt = args.occurredAt ?? nowISO();
  const item: LearningItemRow = {
    ...args.item,
    recovery_state: 'active',
    stage: 'D3',
    scheduled_date: addDaysISO(args.today, 3),
    analysis_state: 'completed',
    reason_flags: [
      ...new Set([
        ...args.item.reason_flags.filter((flag) => flag !== 'recurring-lapse'),
        'remediation-completed'
      ])
    ],
    updated_at: occurredAt
  };
  const session = args.session
    ? {
        ...args.session,
        current_index: Math.min(
          args.session.item_ids.length,
          args.session.current_index + 1
        ),
        status:
          args.session.current_index + 1 >= args.session.item_ids.length
            ? ('completed' as const)
            : ('active' as const),
        draft_answer: null,
        current_item_started_at:
          args.session.current_index + 1 >= args.session.item_ids.length ? null : occurredAt,
        completed_at:
          args.session.current_index + 1 >= args.session.item_ids.length ? occurredAt : null,
        updated_at: occurredAt
      }
    : null;
  const idempotencyKey = `remediation-completed:${args.item.id}:${args.item.lapse_count}`;
  const event = workflowEvent({
    item: args.item,
    eventType: 'remediation_completed',
    idempotencyKey,
    occurredAt,
    timeZone: args.timeZone,
    sessionId: args.session?.id,
    metadata: {
      corrected_opening_move: correctedOpeningMove,
      focused_plan: focusedPlan,
      next_due_date: item.scheduled_date,
      lapse_count: args.item.lapse_count
    }
  });
  const existing = await db.learning_events
    .where('[user_id+idempotency_key]')
    .equals([args.item.user_id, idempotencyKey])
    .first();
  await writeLocalBatch([
    { name: 'learning_items', row: item },
    ...(session ? [{ name: 'recovery_sessions' as const, row: session }] : []),
    ...(!existing ? [{ name: 'learning_events' as const, row: event }] : [])
  ]);
  return { item, session };
}

/** Assign one exact fresh transfer question and delay it so it tests retention. */
export async function assignRecoveryTransfer(args: {
  item: LearningItemRow;
  question: PyqQuestion;
  today: string;
  timeZone: string;
  delayDays?: number;
  occurredAt?: string;
}): Promise<LearningItemRow> {
  if (args.item.source_kind !== 'pyq') {
    throw new Error('A bank-backed source is required for an exact transfer assignment.');
  }
  if (
    args.question.id === args.item.question_uid ||
    normalized(args.question.subject) !== normalized(args.item.subject) ||
    normalized(args.question.topic) !== normalized(args.item.topic)
  ) {
    throw new Error('Transfer must use a fresh question from the exact same topic.');
  }
  const occurredAt = args.occurredAt ?? nowISO();
  const delayDays = Math.max(1, Math.min(30, Math.round(args.delayDays ?? 3)));
  const dueDate = addDaysISO(args.today, delayDays);
  const item: LearningItemRow = {
    ...args.item,
    recovery_state: 'transfer',
    stage: 'TRANSFER',
    scheduled_date: dueDate,
    reason_flags: [...new Set([...args.item.reason_flags, 'transfer-assigned'])],
    mastered_at: null,
    updated_at: occurredAt
  };
  const idempotencyKey = `transfer-assigned:${args.item.id}:${args.question.id}:${dueDate}`;
  const event = workflowEvent({
    item: args.item,
    eventType: 'transfer_assigned',
    idempotencyKey,
    occurredAt,
    timeZone: args.timeZone,
    metadata: {
      source_question_uid: args.item.question_uid,
      transfer_question_uid: args.question.id,
      subject: args.question.subject,
      topic: args.question.topic,
      due_date: dueDate,
      delay_days: delayDays
    }
  });
  const existing = await db.learning_events
    .where('[user_id+idempotency_key]')
    .equals([args.item.user_id, idempotencyKey])
    .first();
  await writeLocalBatch([
    { name: 'learning_items', row: item },
    ...(!existing ? [{ name: 'learning_events' as const, row: event }] : [])
  ]);
  return item;
}
