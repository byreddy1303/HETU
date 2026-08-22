// Local-first sync engine.
// UI writes go to Dexie synchronously via writeLocal(); a background push
// upserts pending rows to Supabase in FK-safe order with exponential backoff.
// Pulls merge server rows into Dexie; local rows still pending always win.
import { db, table, SYNCED_TABLES, type SyncedTableName } from '@/lib/db';
import { normalizeMockSubjectScores } from '@/lib/mocks';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import {
  legacyPyqJournalQuestionId,
  pyqAttemptId,
  pyqJournalQuestionId,
  pyqReattemptAttemptId
} from '@/lib/pyq-session';
import { uuidFromString } from '@/lib/utils';
import { normalizeSubjectIdentity } from '@/lib/subjects';
import type { Local, PyqAttemptRow, QuestionRow, ReattemptRow, TriggerPhraseRow } from '@/types';

interface QueuedDelete {
  table: SyncedTableName;
  id: string;
}

let syncEnabled = false;
let started = false;
let backoffMs = 2000;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushInFlight: Promise<void> | null = null;
let lastPullAt = 0;
let currentUserId: string | null = null;
let pullInFlight: Promise<void> | null = null;
let pullingForUserId: string | null = null;
let initialPullBarrier: Promise<void> | null = null;

const BACKOFF_MAX_MS = 60_000;
const PULL_MIN_GAP_MS = 30_000;

const LEGACY_OPTIONAL_ATTEMPT_FIELDS = [
  'subject_id',
  'question_type',
  'question_marks',
  'score_thirds',
  'scoring_status',
  'scoring_version',
  'reattempt_id',
  'reattempt_round',
  'round_attempt_number'
] as const;

function comparableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'sync_status')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, comparableValue(nested)])
    );
  }
  return value;
}

function comparableAttempt(value: { id: string } & Record<string, unknown>): unknown {
  const normalized = { ...value };
  delete normalized.sync_status;
  // Old server/local receipts legitimately omit fields introduced by capture
  // v3. Treat omitted and null as the same legacy payload.
  for (const field of LEGACY_OPTIONAL_ATTEMPT_FIELDS) {
    if (normalized[field] === undefined) normalized[field] = null;
  }
  for (const field of ['attempted_at', 'question_started_at'] as const) {
    const raw = normalized[field];
    if (typeof raw !== 'string') continue;
    const instant = Date.parse(raw);
    if (Number.isFinite(instant)) normalized[field] = new Date(instant).toISOString();
  }
  return comparableValue(normalized);
}

function sameImmutableAttempt(
  left: { id: string } & Record<string, unknown>,
  right: { id: string } & Record<string, unknown>
): boolean {
  return JSON.stringify(comparableAttempt(left)) === JSON.stringify(comparableAttempt(right));
}

type LocalAttempt = Local<PyqAttemptRow>;

const SUBJECT_ROW_TABLES = new Set<SyncedTableName>([
  'sessions',
  'questions',
  'patterns',
  'formulas',
  'pyq_attempts',
  'topic_progress'
]);

/** Canonicalize every new local write, not only rows present during the Dexie
 * v6 upgrade. Unknown historical/custom labels remain intact with a null id. */
function normalizeLocalWrite<T extends { id: string }>(name: SyncedTableName, row: T): T {
  const normalized = { ...row } as T & Record<string, unknown>;
  if (SUBJECT_ROW_TABLES.has(name) && typeof normalized.subject === 'string') {
    const identity = normalizeSubjectIdentity(normalized.subject, normalized.subject_id);
    normalized.subject = identity.label;
    normalized.subject_id = identity.id;
  }
  if (name === 'mock_tests' && Array.isArray(normalized.subject_scores)) {
    normalized.subject_scores = normalizeMockSubjectScores(
      normalized.subject_scores as Array<{
        subject: string;
        subject_id?: string | null;
        marks: number;
      }>
    );
  }
  return normalized;
}

function nextAvailableConflictIdentity(
  local: LocalAttempt,
  allAttempts: LocalAttempt[],
  remoteAttempts: PyqAttemptRow[]
): {
  id: string;
  attemptNumber: number;
  roundAttemptNumber: number | null;
} {
  const candidates = [...allAttempts, ...remoteAttempts];
  const attemptNumber =
    candidates.reduce(
      (highest, attempt) =>
        attempt.question_uid === local.question_uid &&
        (local.pyq_session_id == null || attempt.pyq_session_id === local.pyq_session_id)
          ? Math.max(highest, attempt.attempt_number)
          : highest,
      0
    ) + 1;
  const occupiedIds = new Set(candidates.map((attempt) => attempt.id));

  if (local.reattempt_id && local.reattempt_round != null) {
    let roundAttemptNumber =
      candidates.reduce(
        (highest, attempt) =>
          attempt.reattempt_id === local.reattempt_id &&
          attempt.reattempt_round === local.reattempt_round
            ? Math.max(highest, attempt.round_attempt_number ?? 1)
            : highest,
        0
      ) + 1;
    let id = pyqReattemptAttemptId(
      local.reattempt_id,
      local.reattempt_round,
      roundAttemptNumber
    );
    while (occupiedIds.has(id)) {
      roundAttemptNumber += 1;
      id = pyqReattemptAttemptId(local.reattempt_id, local.reattempt_round, roundAttemptNumber);
    }
    return { id, attemptNumber, roundAttemptNumber };
  }

  if (local.pyq_session_id) {
    let nextAttemptNumber = attemptNumber;
    let id = pyqAttemptId(local.pyq_session_id, local.question_uid, nextAttemptNumber);
    while (occupiedIds.has(id)) {
      nextAttemptNumber += 1;
      id = pyqAttemptId(local.pyq_session_id, local.question_uid, nextAttemptNumber);
    }
    return { id, attemptNumber: nextAttemptNumber, roundAttemptNumber: null };
  }

  // Pre-origin spaced receipts have no session or review identity. Preserve
  // them under a stable conflict-recovery ID instead of guessing a relation.
  let salt = 0;
  let id = uuidFromString(
    `pyq-conflict:${local.id}:${local.question_uid}:${attemptNumber}:${local.attempted_at}`
  );
  while (occupiedIds.has(id)) {
    salt += 1;
    id = uuidFromString(
      `pyq-conflict:${local.id}:${local.question_uid}:${attemptNumber}:${local.attempted_at}:${salt}`
    );
  }
  return { id, attemptNumber, roundAttemptNumber: null };
}

function rekeyedJournalQuestionId(questionId: string, oldAttemptId: string, newAttemptId: string) {
  if (questionId === pyqJournalQuestionId(oldAttemptId)) {
    return pyqJournalQuestionId(newAttemptId);
  }
  if (questionId === legacyPyqJournalQuestionId(oldAttemptId)) {
    return legacyPyqJournalQuestionId(newAttemptId);
  }
  return uuidFromString(`pyq-conflict-question:${questionId}:${newAttemptId}`);
}

/**
 * Preserve both sides of a deterministic-ID collision. The server receipt
 * keeps the original ID; the unsynced local submission becomes the next
 * attempt, and every local analysis/reference moves with it atomically.
 */
async function repairImmutableAttemptCollision(
  local: LocalAttempt,
  remote: PyqAttemptRow,
  remoteAttempts: PyqAttemptRow[]
): Promise<void> {
  const allAttempts = (await db.pyq_attempts.toArray()) as LocalAttempt[];
  const identity = nextAvailableConflictIdentity(local, allAttempts, remoteAttempts);
  const rekeyed: LocalAttempt = {
    ...local,
    id: identity.id,
    attempt_number: identity.attemptNumber,
    round_attempt_number:
      local.reattempt_id && local.reattempt_round != null
        ? identity.roundAttemptNumber
        : local.round_attempt_number,
    sync_status: 'pending'
  };

  const linkedQuestions = (await db.questions
    .where('source_pyq_attempt_id')
    .equals(local.id)
    .toArray()) as Array<Local<QuestionRow>>;
  const questionIdChanges = new Map<string, string>();
  for (const question of linkedQuestions) {
    let nextId = rekeyedJournalQuestionId(question.id, local.id, rekeyed.id);
    let salt = 0;
    while ((await db.questions.get(nextId)) && nextId !== question.id) {
      salt += 1;
      nextId = uuidFromString(
        `pyq-conflict-question:${question.id}:${rekeyed.id}:${salt}`
      );
    }
    questionIdChanges.set(question.id, nextId);
    await db.questions.delete(question.id);
    await db.questions.put({
      ...question,
      id: nextId,
      source_pyq_attempt_id: rekeyed.id,
      sync_status: 'pending'
    });
  }

  if (questionIdChanges.size > 0) {
    const reattempts = (await db.reattempts.toArray()) as Array<Local<ReattemptRow>>;
    const changedReattempts = reattempts.flatMap((row) => {
      const questionId = questionIdChanges.get(row.question_id);
      return questionId
        ? [{ ...row, question_id: questionId, sync_status: 'pending' as const }]
        : [];
    });
    if (changedReattempts.length > 0) await db.reattempts.bulkPut(changedReattempts);

    const phrases = (await db.trigger_phrases.toArray()) as Array<Local<TriggerPhraseRow>>;
    const changedPhrases = phrases.flatMap((row) => {
      const questionIds = row.question_ids.map((id) => questionIdChanges.get(id) ?? id);
      return questionIds.some((id, index) => id !== row.question_ids[index])
        ? [{ ...row, question_ids: questionIds, sync_status: 'pending' as const }]
        : [];
    });
    if (changedPhrases.length > 0) await db.trigger_phrases.bulkPut(changedPhrases);
  }

  await db.pyq_attempts.delete(local.id);
  await db.pyq_attempts.put(rekeyed);
  await db.pyq_attempts.put({ ...remote, sync_status: 'synced' });

  if (local.pyq_session_id) {
    const session = await db.pyq_sessions.get(local.pyq_session_id);
    if (session) {
      const sessionAttempts = await db.pyq_attempts
        .where('pyq_session_id')
        .equals(local.pyq_session_id)
        .toArray();
      const completed = Array.from(
        new Set([...session.completed_question_uids, ...sessionAttempts.map((row) => row.question_uid)])
      );
      await db.pyq_sessions.put({
        ...session,
        completed_question_uids: completed,
        completed_count: Math.max(session.completed_count, completed.length),
        elapsed_sec: sessionAttempts.reduce((sum, row) => sum + row.time_spent_sec, 0),
        sync_status: 'pending'
      });
    }
  }

  console.warn(
    `[sync] immutable conflict on pyq_attempts/${local.id}: remote kept; local rekeyed to ${rekeyed.id}`
  );
}

async function putLocalRow<T extends { id: string }>(
  name: SyncedTableName,
  row: T
): Promise<void> {
  const target = table(name);
  const normalizedRow = normalizeLocalWrite(name, row);
  if (name === 'pyq_attempts') {
    const existing = (await target.get(normalizedRow.id)) as
      | ({ id: string } & Record<string, unknown>)
      | undefined;
    if (existing) {
      if (!sameImmutableAttempt(existing, normalizedRow as T & Record<string, unknown>)) {
        throw new Error(`Committed PYQ attempt ${normalizedRow.id} is immutable.`);
      }
      return;
    }
  }
  await target.put({ ...normalizedRow, sync_status: syncEnabled ? 'pending' : 'synced' });
}

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

/** Write a row locally (source of truth) and schedule a background push. */
export async function writeLocal<T extends { id: string }>(
  name: SyncedTableName,
  row: T
): Promise<void> {
  await putLocalRow(name, row);
  if (syncEnabled) schedulePush(0);
}

export async function writeLocalBatch(
  rows: { name: SyncedTableName; row: { id: string } }[]
): Promise<void> {
  if (rows.length === 0) return;
  const targets = [...new Set(rows.map(({ name }) => name))].map((name) => table(name));
  await db.transaction('rw', targets, async () => {
    for (const { name, row } of rows) {
      await putLocalRow(name, row);
    }
  });
  if (syncEnabled) schedulePush(0);
}

/** Delete locally now; queue the remote delete if we cannot reach the server. */
export async function deleteLocal(name: SyncedTableName, id: string): Promise<void> {
  if (name === 'pyq_attempts') {
    throw new Error('Committed PYQ attempts cannot be deleted.');
  }
  await table(name).delete(id);
  if (!syncEnabled) return;
  const queue = ((await db.meta.get('delete_queue'))?.value as QueuedDelete[] | undefined) ?? [];
  await db.meta.put({ key: 'delete_queue', value: [...queue, { table: name, id }] });
  schedulePush(0);
}

function schedulePush(delayMs: number) {
  if (!syncEnabled || initialPullBarrier || pullInFlight) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void flushPushQueue(), delayMs);
}

/** Push every pending row (and queued deletes). Exposed for tests + listeners. */
export function flushPushQueue(): Promise<void> {
  if (!syncEnabled) return Promise.resolve();
  if (initialPullBarrier) {
    const barrier = initialPullBarrier;
    return barrier.then(() => flushPushQueue());
  }
  if (pullInFlight) {
    const pull = pullInFlight;
    return pull.then(() => flushPushQueue());
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve();
  // Callers that overlap an auto-scheduled push must await the same work instead
  // of returning early while deletes or pending rows are still in flight.
  if (pushInFlight) return pushInFlight;

  pushInFlight = (async () => {
    let hadError = false;
    for (const name of SYNCED_TABLES) {
      const rows = await table(name).where('sync_status').anyOf('pending', 'error').toArray();
      if (rows.length === 0) continue;
      const payload = rows.map(({ sync_status: _s, ...rest }) => rest);
      const { error } = await supabase.from(name).upsert(payload);
      if (error) {
        hadError = true;
        console.warn(`[sync] push failed for ${name}: ${error.message}`);
        break; // FK order matters — do not push child tables past a failed parent
      }
      await table(name).bulkPut(rows.map((r) => ({ ...r, sync_status: 'synced' as const })));
    }

    if (!hadError) {
      const queue =
        ((await db.meta.get('delete_queue'))?.value as QueuedDelete[] | undefined) ?? [];
      const remaining: QueuedDelete[] = [];
      for (const d of queue) {
        if (d.table === 'pyq_attempts') {
          console.warn(`[sync] discarded forbidden immutable delete for pyq_attempts/${d.id}`);
          continue;
        }
        const { error } = await supabase.from(d.table).delete().eq('id', d.id);
        if (error) {
          console.warn(`[sync] delete failed for ${d.table}/${d.id}: ${error.message}`);
          remaining.push(d);
          hadError = true;
        }
      }
      await db.meta.put({ key: 'delete_queue', value: remaining });
    }

    if (hadError) {
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      schedulePush(backoffMs);
    } else {
      backoffMs = 2000;
    }
  })().finally(() => {
    pushInFlight = null;
  });

  return pushInFlight;
}

/** Merge all server rows for this user into Dexie. Local pending rows win. */
export function pullAll(userId: string): Promise<void> {
  if (!syncEnabled) return Promise.resolve();
  if (pullInFlight && pullingForUserId === userId) return pullInFlight;

  pullingForUserId = userId;
  pullInFlight = (async () => {
    // Every table is independent on pull. Starting all requests together makes
    // refresh latency approach the slowest request, not the sum of eight RTTs.
    const results = await Promise.all(
      SYNCED_TABLES.map(async (name) => ({
        name,
        result: await supabase.from(name).select('*').eq('user_id', userId)
      }))
    );

    // A sign-out/user switch can happen while the network batch is in flight.
    // Never merge the previous account's response into the newly opened DB.
    if (!syncEnabled || currentUserId !== userId) return;

    // Merge in FK order after the network fan-out. Attempt collisions are
    // repaired before question rows merge, so a remote analysis can retain the
    // original receipt while the local analysis follows its rekeyed receipt.
    for (const { name, result: { data, error } } of results) {
      if (error) {
        console.warn(`[sync] pull failed for ${name}: ${error.message}`);
        continue;
      }
      if (!data?.length) continue;

      const remoteRows = data as { id: string }[];
      const target = table(name);
      if (name === 'pyq_attempts') {
        const remoteAttempts = remoteRows as unknown as PyqAttemptRow[];
        await db.transaction(
          'rw',
          [target, db.questions, db.reattempts, db.trigger_phrases, db.pyq_sessions],
          async () => {
            for (const remote of remoteAttempts) {
              const local = (await db.pyq_attempts.get(remote.id)) as LocalAttempt | undefined;
              if (!local) {
                await db.pyq_attempts.put({ ...remote, sync_status: 'synced' });
                continue;
              }
              if (
                sameImmutableAttempt(
                  local as LocalAttempt & Record<string, unknown>,
                  remote as PyqAttemptRow & Record<string, unknown>
                )
              ) {
                await db.pyq_attempts.put({ ...remote, sync_status: 'synced' });
                continue;
              }
              await repairImmutableAttemptCollision(local, remote, remoteAttempts);
            }
          }
        );
        continue;
      }

      await db.transaction('rw', target, async () => {
        const localRows = await target.bulkGet(remoteRows.map((row) => row.id));
        const merged = remoteRows.flatMap((remote, index) => {
          const local = localRows[index];
          if (local && local.sync_status !== 'synced') {
            console.info(`[sync] conflict on ${name}/${remote.id}: local pending wins`);
            return [];
          }
          return [{ ...remote, sync_status: 'synced' as const }];
        });
        if (merged.length > 0) await target.bulkPut(merged);
      });
    }
    lastPullAt = Date.now();
  })().finally(() => {
    pullInFlight = null;
    pullingForUserId = null;
    if (syncEnabled) schedulePush(0);
  });

  return pullInFlight;
}

function onOnline() {
  if (currentUserId && Date.now() - lastPullAt > PULL_MIN_GAP_MS) {
    void pullAll(currentUserId);
  } else {
    schedulePush(0);
  }
}

function onFocus() {
  if (currentUserId && Date.now() - lastPullAt > PULL_MIN_GAP_MS) {
    void pullAll(currentUserId);
  } else {
    schedulePush(0);
  }
}

/** Reconcile immediately when a native shell returns to the foreground. */
export function resumeSync(): void {
  if (!syncEnabled) return;
  onFocus();
}

/** Start the engine for a signed-in (non-sandbox) user. Idempotent. */
export function initSync(userId: string): void {
  if (!supabaseConfigured) return;
  syncEnabled = true;
  currentUserId = userId;
  if (!started) {
    started = true;
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
  }
  // Pull first so an old device learns immutable receipts before it tries to
  // push a colliding deterministic ID. Pending local rows still win the pull.
  const barrier = pullAll(userId);
  initialPullBarrier = barrier;
  void barrier.finally(() => {
    if (initialPullBarrier !== barrier) return;
    initialPullBarrier = null;
    schedulePush(0);
  });
}

export function stopSync(): void {
  syncEnabled = false;
  currentUserId = null;
  pullingForUserId = null;
  initialPullBarrier = null;
  clearTimeout(pushTimer);
}

/** Test hook: force-enable without listeners (unit tests drive pushes manually). */
export function _enableForTests(userId: string): void {
  syncEnabled = true;
  currentUserId = userId;
  backoffMs = 2000;
  initialPullBarrier = null;
}
