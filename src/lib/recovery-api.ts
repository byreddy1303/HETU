import { apiRequest } from '@/lib/fastapi-client';
import { applyServerRows } from '@/lib/db';
import { uuidFromString } from '@/lib/utils';
import type {
  LearningEventRow, LearningItemRow, PyqAttemptRow, PyqSelectedAnswer,
  QuestionRow, RecoverySessionMode, RecoverySessionRow, ReattemptRow
} from '@/types';
import type { RecoveryGradeDecision, RecoveryGradeEvidence, RecoverySprint } from '@/lib/recovery-engine';
import type { WeakAttemptReason } from '@/lib/learning-recovery';

interface RecoveryResult {
  session?: RecoverySessionRow | null;
  item?: LearningItemRow;
  events?: LearningEventRow[];
  event?: LearningEventRow;
  attempt?: PyqAttemptRow;
  reattempts?: ReattemptRow[];
  compatibilityQuestion?: QuestionRow | null;
  compatibilityReattempt?: ReattemptRow | null;
  idempotent_replay?: boolean;
}

type CachedServerRow = { id: string; user_id?: string; version?: number; [key: string]: unknown };

function cache(userId: string, result: RecoveryResult): void {
  const toCached = (rows: unknown[]): CachedServerRow[] => rows as CachedServerRow[];
  applyServerRows(userId, [
    { name: 'learning_items', rows: result.item ? toCached([result.item]) : [] },
    { name: 'recovery_sessions', rows: result.session ? toCached([result.session]) : [] },
    {
      name: 'learning_events',
      rows: toCached([...(result.events ?? []), ...(result.event ? [result.event] : [])])
    },
    { name: 'pyq_attempts', rows: result.attempt ? toCached([result.attempt]) : [] },
    {
      name: 'questions',
      rows: result.compatibilityQuestion ? toCached([result.compatibilityQuestion]) : []
    },
    {
      name: 'reattempts',
      rows: toCached([
        ...(result.reattempts ?? []),
        ...(result.compatibilityReattempt ? [result.compatibilityReattempt] : [])
      ])
    }
  ]);
}

export function cacheRecoveryResponse(userId: string, result: RecoveryResult): void {
  cache(userId, result);
}

export async function getSessionApi(userId: string, sessionId: string): Promise<RecoverySessionRow> {
  const result = await apiRequest<{ session: RecoverySessionRow }>(`/v1/recovery/sessions/${encodeURIComponent(sessionId)}`);
  cache(userId, result);
  return result.session;
}

export function recoveryKey(operation: string, payload: unknown): string {
  return uuidFromString(`recovery-api:${operation}:${JSON.stringify(payload)}`);
}

function version(row: { version?: number }): number {
  if (!Number.isInteger(row.version) || (row.version ?? 0) < 1) {
    throw new Error('Refresh the saved recovery record before continuing.');
  }
  return row.version!;
}

function command(session: RecoverySessionRow, itemId: string, operation: string, payload: unknown = null) {
  return {
    idempotency_key: recoveryKey(operation, [session.id, session.current_index, payload]),
    expected_version: version(session), expected_index: session.current_index, item_id: itemId
  };
}

async function post<T extends RecoveryResult>(userId: string, path: string, payload?: unknown): Promise<T> {
  const result = await apiRequest<T>(`/v1/recovery${path}`, {
    method: 'POST', ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
  });
  // Durable receipts contain the original outcome. Resume current session state after a late retry.
  if (result.idempotent_replay && result.session) {
    const current = await apiRequest<{ session: RecoverySessionRow }>(`/v1/recovery/sessions/${encodeURIComponent(result.session.id)}`);
    result.session = current.session;
  }
  cache(userId, result);
  return result;
}

export async function captureAttemptApi(userId: string, attemptId: string, questionId?: string) {
  const suffix = questionId ? `?question_id=${encodeURIComponent(questionId)}` : '';
  const result = await apiRequest<(RecoveryResult & { item: LearningItemRow; event: LearningEventRow; reasons: WeakAttemptReason[]; compatibilityQuestion: QuestionRow | null; compatibilityReattempt: ReattemptRow | null }) | null>(
    `/v1/recovery/attempts/${encodeURIComponent(attemptId)}/capture${suffix}`, { method: 'POST' }
  );
  if (result) cache(userId, result);
  return result;
}

export async function analysisApi(userId: string, attemptId: string): Promise<LearningItemRow | null> {
  const result = await apiRequest<RecoveryResult | null>(`/v1/recovery/attempts/${encodeURIComponent(attemptId)}/analysis`, { method: 'POST' });
  if (result) cache(userId, result);
  return result?.item ?? null;
}

export async function scheduleQuestionApi(userId: string, questionId: string): Promise<ReattemptRow | null> {
  const result = await post<RecoveryResult>(userId, `/questions/${encodeURIComponent(questionId)}/schedule`);
  return result.compatibilityReattempt ?? null;
}

export async function reconcileRecoveryApi(userId: string): Promise<void> {
  let cursor: number | null = 0;
  while (cursor !== null) {
    const result: { next_cursor: number | null } = await apiRequest(`/v1/recovery/reconcile?cursor=${cursor}`, { method: 'POST' });
    cursor = result.next_cursor;
  }
  // Reconciliation can cover many records; hydrate once instead of returning an oversized body.
  const { hydrateTables } = await import('@/lib/db');
  await hydrateTables(userId, ['learning_items', 'learning_events', 'reattempts']);
}

export async function startSessionApi(args: {
  userId: string; mode: RecoverySessionMode; itemIds: string[]; key: string;
}): Promise<{ session: RecoverySessionRow; sprint: RecoverySprint }> {
  return post(args.userId, '/sessions', {
    idempotency_key: args.key, mode: args.mode, item_ids: args.itemIds
  }) as Promise<{ session: RecoverySessionRow; sprint: RecoverySprint }>;
}

export async function latestSessionApi(userId: string): Promise<RecoverySessionRow | null> {
  const result = await apiRequest<{ items: RecoverySessionRow[] }>('/v1/recovery/sessions?resumable_only=true&limit=1');
  if (result.items[0]) cache(userId, { session: result.items[0] });
  return result.items[0] ?? null;
}

export async function checkpointApi(session: RecoverySessionRow, patch: Partial<RecoverySessionRow>, updatedAt: string): Promise<RecoverySessionRow> {
  if (patch.current_index !== undefined && patch.current_index !== session.current_index) {
    throw new Error('Only a committed answer or defer can advance the recovery queue.');
  }
  const itemId = session.item_ids[session.current_index];
  if (!itemId) return session;
  const action = patch.status === 'active' ? 'resume' : patch.status === 'abandoned' ? 'abandon' : patch.status === 'interrupted' || patch.status === 'paused' ? 'interrupt' : 'draft';
  const result = await post<RecoveryResult & { session: RecoverySessionRow }>(session.user_id, `/sessions/${encodeURIComponent(session.id)}/checkpoint`, {
    ...command(session, itemId, 'checkpoint', [action, patch.draft_answer, updatedAt]), action,
    ...(action === 'draft' ? { draft_answer: patch.draft_answer ?? null } : {})
  });
  return result.session;
}

export async function hintApi(session: RecoverySessionRow, item: LearningItemRow): Promise<RecoverySessionRow> {
  const result = await post<RecoveryResult & { session: RecoverySessionRow }>(session.user_id,
    `/sessions/${encodeURIComponent(session.id)}/hint`, command(session, item.id, 'hint'));
  return result.session;
}

export async function deferApi(session: RecoverySessionRow, item: LearningItemRow, reason: string): Promise<{ session: RecoverySessionRow; item: LearningItemRow }> {
  return post(session.user_id, `/sessions/${encodeURIComponent(session.id)}/defer`, {
    ...command(session, item.id, 'defer', reason), reason
  }) as Promise<{ session: RecoverySessionRow; item: LearningItemRow }>;
}

export async function interruptApi(session: RecoverySessionRow, reason: string, elapsedMs?: number): Promise<RecoverySessionRow> {
  const itemId = session.item_ids[session.current_index];
  if (!itemId || ['completed', 'abandoned'].includes(session.status)) return session;
  const result = await post<RecoveryResult & { session: RecoverySessionRow }>(session.user_id, `/sessions/${encodeURIComponent(session.id)}/checkpoint`, {
    ...command(session, itemId, 'interrupt', session.current_item_started_at), action: 'interrupt', reason,
    elapsed_ms: elapsedMs == null ? null : Math.max(0, Math.round(elapsedMs))
  });
  return result.session;
}

const uncertainAnswers = new Map<string, { signature: string; payload: Record<string, unknown> }>();

export async function answerApi(args: {
  session: RecoverySessionRow; item: LearningItemRow; evidence: RecoveryGradeEvidence;
  answer: PyqSelectedAnswer; sourcePyqAttemptId?: string | null;
}): Promise<{ session: RecoverySessionRow; item: LearningItemRow; grade: RecoveryGradeDecision; explanation: string }> {
  const payload = {
    answer: args.answer, confidence: args.evidence.confidence, assistance: args.evidence.hintUsed ? 'hint' : 'none',
    duration_ms: Math.max(0, Math.round(args.evidence.timeSpentSec * 1000)), duration_source: 'measured',
    reported_correct: args.evidence.correct, source_pyq_attempt_id: args.sourcePyqAttemptId ?? null
  };
  const slot = `${args.session.user_id}:${args.session.id}:${args.session.current_index}`;
  const signature = JSON.stringify({ ...payload, duration_ms: null });
  const pending = uncertainAnswers.get(slot);
  if (pending && pending.signature !== signature) {
    throw new Error('The previous response may have saved. Refresh the session before changing that answer.');
  }
  const request = pending?.payload ?? { ...command(args.session, args.item.id, 'answer', payload), ...payload };
  uncertainAnswers.set(slot, { signature, payload: request });
  try {
    const result = await post<RecoveryResult & { session: RecoverySessionRow; item: LearningItemRow; grade: RecoveryGradeDecision; explanation: string }>(
      args.session.user_id, `/sessions/${encodeURIComponent(args.session.id)}/answers`, request);
    uncertainAnswers.delete(slot);
    return result;
  } catch (cause) {
    const status = (cause as { status?: number })?.status;
    if (status && status >= 400 && status < 500) uncertainAnswers.delete(slot);
    throw cause;
  }
}

export async function remediationApi(args: { item: LearningItemRow; correctedOpeningMove: string; focusedPlan: string; session?: RecoverySessionRow | null }) {
  return post<RecoveryResult & { item: LearningItemRow; session: RecoverySessionRow | null }>(args.item.user_id, `/items/${encodeURIComponent(args.item.id)}/remediation`, {
    idempotency_key: recoveryKey('remediation', [args.item.id, args.item.lapse_count, args.correctedOpeningMove, args.focusedPlan]),
    expected_version: version(args.item), corrected_opening_move: args.correctedOpeningMove, focused_plan: args.focusedPlan,
    session_id: args.session?.id ?? null, expected_session_version: args.session ? version(args.session) : null,
    expected_index: args.session?.current_index ?? null
  });
}

export async function transferApi(item: LearningItemRow, questionUid: string | null = null, delayDays = 3): Promise<LearningItemRow> {
  const result = await post<RecoveryResult & { item: LearningItemRow }>(item.user_id, `/items/${encodeURIComponent(item.id)}/transfer`, {
    idempotency_key: recoveryKey('transfer', [item.id, item.version, questionUid, delayDays]),
    expected_version: version(item), question_uid: questionUid, delay_days: delayDays
  });
  return result.item;
}
