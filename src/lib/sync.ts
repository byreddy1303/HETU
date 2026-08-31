// Local-first sync engine.
// UI writes go to Dexie synchronously via writeLocal(); a background push
// upserts pending rows to Supabase in FK-safe order with exponential backoff.
// Pulls merge server rows into Dexie; local rows still pending always win.
import { db, table, SYNCED_TABLES, type SyncedTableName } from '@/lib/db';
import { normalizeMockSubjectScores, normalizeMockTestRow } from '@/lib/mocks';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import {
  legacyPyqJournalQuestionId,
  pyqAttemptId,
  pyqJournalQuestionId,
  pyqReattemptAttemptId
} from '@/lib/pyq-session';
import { uuidFromString } from '@/lib/utils';
import { normalizeSubjectIdentity } from '@/lib/subjects';
import type {
  Local,
  PyqAttemptRow,
  QuestionRow,
  ReattemptRow,
  TopicProgressRow,
  TriggerPhraseRow
} from '@/types';

interface QueuedDelete {
  table: SyncedTableName;
  id: string;
  /** Absent only on queues created by pre-v6 clients. */
  user_id?: string;
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
let initialPullForUserId: string | null = null;
const initialPullListeners = new Set<() => void>();

function notifyInitialPullChange() {
  initialPullListeners.forEach((l) => l());
}

export function subscribeInitialPull(listener: () => void) {
  initialPullListeners.add(listener);
  return () => {
    initialPullListeners.delete(listener);
  };
}

export function isInitialPullActive() {
  return initialPullBarrier !== null;
}

export function awaitInitialPull(userId: string): Promise<void> {
  if (initialPullForUserId === userId && initialPullBarrier) {
    return initialPullBarrier;
  }
  return Promise.resolve();
}
let pullRetryTimer: ReturnType<typeof setTimeout> | undefined;
let followUpPushNeeded = false;
let pullBackoffMs = 2000;

const BACKOFF_MAX_MS = 60_000;
const PULL_MIN_GAP_MS = 30_000;
const PULL_PAGE_SIZE = 500;

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
type LocalQuestion = Local<QuestionRow>;
type LocalTopicProgress = Local<TopicProgressRow>;

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
  const normalized: Record<string, unknown> = { ...row };
  if (SUBJECT_ROW_TABLES.has(name) && typeof normalized['subject'] === 'string') {
    const identity = normalizeSubjectIdentity(
      normalized['subject'],
      normalized['subject_id']
    );
    normalized['subject'] = identity.label;
    normalized['subject_id'] = identity.id;
  }
  if (name === 'mock_tests' && Array.isArray(normalized['subject_scores'])) {
    normalized['subject_scores'] = normalizeMockSubjectScores(
      normalized['subject_scores'] as Array<{
        subject: string;
        subject_id?: string | null;
        marks: number;
      }>
    );
  }
  if (name === 'mock_tests') return normalizeMockTestRow(normalized) as T;
  return normalized as T;
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
  const allCandidates = [...allAttempts, ...remoteAttempts];
  const candidates = allCandidates.filter((attempt) => attempt.user_id === local.user_id);
  const attemptNumber =
    candidates.reduce(
      (highest, attempt) =>
        attempt.question_uid === local.question_uid &&
        (local.pyq_session_id == null || attempt.pyq_session_id === local.pyq_session_id)
          ? Math.max(highest, attempt.attempt_number)
          : highest,
      0
    ) + 1;
  // Primary keys are global even though attempt numbering is per learner.
  const occupiedIds = new Set(allCandidates.map((attempt) => attempt.id));

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

function sameSyncedPayload(
  left: { id: string } & Record<string, unknown>,
  right: { id: string } & Record<string, unknown>
): boolean {
  const normalizedLeft = { ...left };
  const normalizedRight = { ...right };
  delete normalizedLeft.sync_status;
  delete normalizedRight.sync_status;
  return (
    JSON.stringify(comparableValue(normalizedLeft)) ===
    JSON.stringify(comparableValue(normalizedRight))
  );
}

function latestTimestamp(left: string, right: string): string {
  const leftInstant = Date.parse(left);
  const rightInstant = Date.parse(right);
  if (Number.isFinite(leftInstant) && Number.isFinite(rightInstant)) {
    return rightInstant > leftInstant ? right : left;
  }
  return right > left ? right : left;
}

function topicProgressLogicalKey(
  row: Pick<TopicProgressRow, 'user_id' | 'subject' | 'subject_id' | 'topic'>
): string {
  const identity = normalizeSubjectIdentity(row.subject, row.subject_id);
  return `${row.user_id}\u0000${identity.id ?? identity.label.toLocaleLowerCase('en-IN')}\u0000${row.topic
    .trim()
    .toLocaleLowerCase('en-IN')}`;
}

function normalizeTopicProgressRow(row: LocalTopicProgress): LocalTopicProgress {
  const identity = normalizeSubjectIdentity(row.subject, row.subject_id);
  return {
    ...row,
    subject: identity.label,
    subject_id: identity.id,
    topic: row.topic.trim()
  };
}

async function rewriteQuestionReferences(
  questionIdChanges: Map<string, string>,
  userId?: string
): Promise<void> {
  if (questionIdChanges.size === 0) return;
  if (userId && !syncContextIsCurrent(userId)) throw new SyncContextChangedError();

  const reattempts = (await db.reattempts.toArray()) as Array<Local<ReattemptRow>>;
  const changedReattempts = reattempts.flatMap((row) => {
    if (userId && row.user_id !== userId) return [];
    const questionId = questionIdChanges.get(row.question_id);
    return questionId
      ? [{ ...row, question_id: questionId, sync_status: 'pending' as const }]
      : [];
  });
  if (userId && !syncContextIsCurrent(userId)) throw new SyncContextChangedError();
  if (changedReattempts.length > 0) await db.reattempts.bulkPut(changedReattempts);

  const phrases = (await db.trigger_phrases.toArray()) as Array<Local<TriggerPhraseRow>>;
  const changedPhrases = phrases.flatMap((row) => {
    if (userId && row.user_id !== userId) return [];
    const questionIds = Array.from(
      new Set(row.question_ids.map((id) => questionIdChanges.get(id) ?? id))
    );
    return questionIds.length !== row.question_ids.length ||
      questionIds.some((id, index) => id !== row.question_ids[index])
      ? [{ ...row, question_ids: questionIds, sync_status: 'pending' as const }]
      : [];
  });
  if (userId && !syncContextIsCurrent(userId)) throw new SyncContextChangedError();
  if (changedPhrases.length > 0) await db.trigger_phrases.bulkPut(changedPhrases);
}

/** Collapse aliases/deterministic-ID variants before hitting the server's
 * logical `(user, subject, topic)` uniqueness constraint. */
async function reconcileLocalTopicProgress(userId: string): Promise<void> {
  await db.transaction('rw', db.topic_progress, async () => {
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
    const rows = (await db.topic_progress.where('user_id').equals(userId).toArray()) as LocalTopicProgress[];
    const groups = new Map<string, LocalTopicProgress[]>();
    for (const raw of rows) {
      const row = normalizeTopicProgressRow(raw);
      const group = groups.get(topicProgressLogicalKey(row)) ?? [];
      group.push(row);
      groups.set(topicProgressLogicalKey(row), group);
    }

    for (const group of groups.values()) {
      if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
      group.sort(
        (left, right) =>
          Number(right.sync_status === 'synced') - Number(left.sync_status === 'synced') ||
          left.id.localeCompare(right.id)
      );
      const [keeper, ...duplicates] = group;
      const completedAt = group.reduce(
        (latest, row) => latestTimestamp(latest, row.completed_at),
        keeper.completed_at
      );
      const updatedAt = group.reduce(
        (latest, row) => latestTimestamp(latest, row.updated_at),
        keeper.updated_at
      );
      const merged: LocalTopicProgress = {
        ...keeper,
        completed_at: completedAt,
        updated_at: updatedAt
      };
      const original = rows.find((row) => row.id === keeper.id)!;
      const changed =
        duplicates.length > 0 ||
        !sameSyncedPayload(
          original as LocalTopicProgress & Record<string, unknown>,
          merged as LocalTopicProgress & Record<string, unknown>
        );
      if (changed || group.some((row) => row.sync_status !== 'synced')) {
        merged.sync_status = 'pending';
      }
      if (duplicates.length > 0) {
        await db.topic_progress.bulkDelete(duplicates.map((row) => row.id));
      }
      await db.topic_progress.put(merged);
    }
  });
}

/** Enforce one local analysis per explicit receipt before a batched upsert.
 * Prefer a known server ID, while carrying the newest pending analysis body
 * onto that ID and repairing local references atomically. */
async function reconcileLocalQuestionSources(userId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.questions, db.reattempts, db.trigger_phrases],
    async () => {
      if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
      const rows = (await db.questions.where('user_id').equals(userId).toArray()) as LocalQuestion[];
      const groups = new Map<string, LocalQuestion[]>();
      for (const row of rows) {
        if (!row.source_pyq_attempt_id) continue;
        const key = `${row.user_id}\u0000${row.source_pyq_attempt_id}`;
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
      }

      for (const group of groups.values()) {
        if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
        if (group.length < 2) continue;
        const sourceId = group[0].source_pyq_attempt_id!;
        group.sort(
          (left, right) =>
            Number(right.sync_status === 'synced') - Number(left.sync_status === 'synced') ||
            Number(right.id === pyqJournalQuestionId(sourceId)) -
              Number(left.id === pyqJournalQuestionId(sourceId)) ||
            left.id.localeCompare(right.id)
        );
        const [keeper, ...duplicates] = group;
        const pending = group
          .filter((row) => row.sync_status !== 'synced')
          .sort((left, right) =>
            String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
          )[0];
        const merged: LocalQuestion = {
          ...keeper,
          ...(pending ?? {}),
          id: keeper.id,
          user_id: keeper.user_id,
          source_pyq_attempt_id: sourceId,
          sync_status: pending ? 'pending' : keeper.sync_status
        };
        const changes = new Map(duplicates.map((row) => [row.id, keeper.id] as const));
        await db.questions.bulkDelete(duplicates.map((row) => row.id));
        await db.questions.put(merged);
        await rewriteQuestionReferences(changes, userId);
      }
    }
  );
}

function nextQuestionConflictId(question: LocalQuestion, remote: QuestionRow): string {
  let salt = 0;
  let id = uuidFromString(
    `question-source-conflict:${question.id}:${question.source_pyq_attempt_id}:${remote.source_pyq_attempt_id}`
  );
  // Collision checks happen in the caller's transaction. Deterministic salt
  // keeps repeated reconciliation stable while still preserving both rows.
  while (id === remote.id) {
    salt += 1;
    id = uuidFromString(
      `question-source-conflict:${question.id}:${question.source_pyq_attempt_id}:${remote.source_pyq_attempt_id}:${salt}`
    );
  }
  return id;
}

async function mergeRemoteQuestions(remoteRows: QuestionRow[], userId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.questions, db.reattempts, db.trigger_phrases],
    async () => {
      for (const rawRemote of remoteRows) {
        if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
        const normalizedRemote = normalizeLocalWrite('questions', rawRemote);
        const remote: QuestionRow = {
          ...normalizedRemote,
          source_pyq_attempt_id: normalizedRemote.source_pyq_attempt_id ?? null
        };
        const local = (await db.questions.get(remote.id)) as LocalQuestion | undefined;
        let merged: LocalQuestion = { ...remote, sync_status: 'synced' };
        const referenceChanges = new Map<string, string>();

        if (local && local.sync_status !== 'synced') {
          const localSource = local.source_pyq_attempt_id ?? null;
          const remoteSource = remote.source_pyq_attempt_id ?? null;
          if (localSource && remoteSource && localSource !== remoteSource) {
            let conflictId = nextQuestionConflictId(local, remote);
            let salt = 0;
            while (await db.questions.get(conflictId)) {
              salt += 1;
              conflictId = uuidFromString(
                `question-source-conflict:${local.id}:${localSource}:${remoteSource}:${salt}`
              );
            }
            await db.questions.put({ ...local, id: conflictId, sync_status: 'pending' });
            referenceChanges.set(local.id, conflictId);
          } else {
            merged = {
              ...remote,
              ...local,
              id: remote.id,
              user_id: remote.user_id,
              // A server link is write-once. It must survive a pending edit
              // captured before this device learned that the row was linked.
              source_pyq_attempt_id: remoteSource ?? localSource,
              sync_status: 'pending'
            };
            console.info(`[sync] conflict on questions/${remote.id}: local pending body retained`);
          }
        } else if (
          local?.source_pyq_attempt_id &&
          !remote.source_pyq_attempt_id
        ) {
          // Source links are monotonic: a stale/null remote projection may be
          // advanced to the known non-null link, never the reverse.
          merged = {
            ...remote,
            source_pyq_attempt_id: local.source_pyq_attempt_id,
            sync_status: 'pending'
          };
        }

        const remoteSource = remote.source_pyq_attempt_id ?? null;
        if (remoteSource) {
          const sameSource = ((await db.questions
            .where('source_pyq_attempt_id')
            .equals(remoteSource)
            .toArray()) as LocalQuestion[]).filter(
            (row) => row.user_id === remote.user_id && row.id !== remote.id
          );
          if (sameSource.length > 0) {
            const pending = [
              ...(merged.sync_status !== 'synced' ? [merged] : []),
              ...sameSource.filter((row) => row.sync_status !== 'synced')
            ].sort((left, right) =>
              String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
            )[0];
            if (pending) {
              merged = {
                ...merged,
                ...pending,
                id: remote.id,
                user_id: remote.user_id,
                source_pyq_attempt_id: remoteSource,
                sync_status: 'pending'
              };
            }
            for (const duplicate of sameSource) {
              referenceChanges.set(duplicate.id, remote.id);
            }
            await db.questions.bulkDelete(sameSource.map((row) => row.id));
          }
        }

        if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
        await db.questions.put(merged);
        await rewriteQuestionReferences(referenceChanges, userId);
      }
    }
  );
}

async function mergeRemoteTopicProgress(
  remoteRows: TopicProgressRow[],
  userId: string
): Promise<void> {
  await db.transaction('rw', db.topic_progress, async () => {
    for (const rawRemote of remoteRows) {
      if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
      const remote = normalizeTopicProgressRow({ ...rawRemote, sync_status: 'synced' });
      const remoteKey = topicProgressLogicalKey(remote);
      const localRows = (await db.topic_progress
        .where('user_id')
        .equals(remote.user_id)
        .toArray()) as LocalTopicProgress[];
      const matches = localRows
        .map(normalizeTopicProgressRow)
        .filter((row) => topicProgressLogicalKey(row) === remoteKey);
      const completedAt = matches.reduce(
        (latest, row) => latestTimestamp(latest, row.completed_at),
        remote.completed_at
      );
      const updatedAt = matches.reduce(
        (latest, row) => latestTimestamp(latest, row.updated_at),
        remote.updated_at
      );
      const needsPush = completedAt !== remote.completed_at || updatedAt !== remote.updated_at;
      const merged: LocalTopicProgress = {
        ...remote,
        completed_at: completedAt,
        updated_at: updatedAt,
        sync_status: needsPush ? 'pending' : 'synced'
      };
      const duplicateIds = matches.filter((row) => row.id !== remote.id).map((row) => row.id);
      if (duplicateIds.length > 0) await db.topic_progress.bulkDelete(duplicateIds);
      if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
      await db.topic_progress.put(merged);
    }
  });
}

class SyncContextChangedError extends Error {}

function syncContextIsCurrent(userId: string): boolean {
  return syncEnabled && currentUserId === userId;
}

async function fetchRemoteTable(
  name: SyncedTableName,
  userId: string
): Promise<{ name: SyncedTableName; data: { id: string }[] }> {
  const data: { id: string }[] = [];
  let lastId: string | null = null;
  for (;;) {
    const ordered = supabase
      .from(name)
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true });
    const result = await (lastId ? ordered.gt('id', lastId) : ordered).limit(PULL_PAGE_SIZE);
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
    if (result.error) {
      throw new Error(`[sync] pull failed for ${name}: ${result.error.message}`);
    }
    const page = (result.data ?? []) as { id: string }[];
    data.push(...page);
    if (page.length < PULL_PAGE_SIZE) break;
    lastId = page[page.length - 1].id;
  }
  return { name, data };
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
  for (const question of linkedQuestions.filter((row) => row.user_id === local.user_id)) {
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

  await rewriteQuestionReferences(questionIdChanges, local.user_id);

  await db.pyq_attempts.delete(local.id);
  await db.pyq_attempts.put(rekeyed);
  await db.pyq_attempts.put({ ...remote, sync_status: 'synced' });

  if (local.pyq_session_id) {
    const session = await db.pyq_sessions.get(local.pyq_session_id);
    if (session?.user_id === local.user_id) {
      const sessionAttempts = (await db.pyq_attempts
        .where('pyq_session_id')
        .equals(local.pyq_session_id)
        .toArray()).filter((row) => row.user_id === local.user_id);
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
  // A configured production client can receive writes before initSync has
  // finished (for example while restoring a persisted draft during login).
  // Those rows must remain eligible for the first authenticated push instead
  // of being incorrectly labelled as already present on the server.
  await target.put({
    ...normalizedRow,
    sync_status: supabaseConfigured ? 'pending' : 'synced'
  });
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
  const target = table(name);
  const enabledForUser = syncEnabled ? currentUserId : null;
  let ownerId = enabledForUser;
  await db.transaction('rw', [target, db.meta], async () => {
    const existing = (await target.get(id)) as Record<string, unknown> | undefined;
    if (typeof existing?.['user_id'] === 'string') ownerId = existing['user_id'];
    await target.delete(id);
    if (!enabledForUser || ownerId !== enabledForUser) return;
    const queue =
      ((await db.meta.get('delete_queue'))?.value as QueuedDelete[] | undefined) ?? [];
    if (!queue.some((entry) => entry.table === name && entry.id === id)) {
      await db.meta.put({
        key: 'delete_queue',
        value: [...queue, { table: name, id, user_id: enabledForUser }]
      });
    }
  });
  if (enabledForUser && syncContextIsCurrent(enabledForUser)) schedulePush(0);
}

function schedulePush(delayMs: number) {
  if (!syncEnabled || initialPullBarrier || pullInFlight) return;
  if (pushInFlight && delayMs === 0) {
    followUpPushNeeded = true;
    return;
  }
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void flushPushQueue(), delayMs);
}

async function acknowledgePushedRows(
  name: SyncedTableName,
  payload: Array<{ id: string } & Record<string, unknown>>,
  userId: string
): Promise<boolean> {
  const target = table(name);
  let needsFollowUp = false;
  await db.transaction('rw', target, async () => {
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
    for (const sent of payload) {
      const current = (await target.get(sent.id)) as
        | ({ id: string; sync_status: string } & Record<string, unknown>)
        | undefined;
      if (!current) continue;
      if (current['user_id'] !== userId) continue;
      if (sameSyncedPayload(current, sent)) {
        if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
        await target.update(sent.id, { sync_status: 'synced' });
      } else {
        // An edit landed while the request was in flight. Acknowledge only the
        // exact sent revision and leave this newer revision pending.
        needsFollowUp = true;
      }
    }
  });
  return needsFollowUp;
}

async function removeQueuedDelete(entry: QueuedDelete, userId: string): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
    const queue =
      ((await db.meta.get('delete_queue'))?.value as QueuedDelete[] | undefined) ?? [];
    const next = queue.filter(
      (candidate) =>
        !(
          candidate.table === entry.table &&
          candidate.id === entry.id &&
          (candidate.user_id == null || candidate.user_id === userId)
        )
    );
    await db.meta.put({ key: 'delete_queue', value: next });
  });
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

  const pushingForUserId = currentUserId;
  if (!pushingForUserId) return Promise.resolve();
  let pushHadError = false;
  followUpPushNeeded = false;

  pushInFlight = (async () => {
    for (const name of SYNCED_TABLES) {
      if (!syncContextIsCurrent(pushingForUserId)) return;
      if (name === 'questions') await reconcileLocalQuestionSources(pushingForUserId);
      if (name === 'topic_progress') await reconcileLocalTopicProgress(pushingForUserId);
      const rows = (
        await table(name).where('sync_status').anyOf('pending', 'error').toArray()
      ).filter((row) => (row as Record<string, unknown>)['user_id'] === pushingForUserId);
      if (rows.length === 0) continue;
      const payload = rows.map(({ sync_status: _s, ...rest }) => rest) as Array<
        { id: string } & Record<string, unknown>
      >;
      const { error } = await supabase.from(name).upsert(payload);
      if (!syncContextIsCurrent(pushingForUserId)) return;
      if (error) {
        pushHadError = true;
        console.warn(`[sync] push failed for ${name}: ${error.message}`);
        break; // FK order matters — do not push child tables past a failed parent
      }
      followUpPushNeeded =
        (await acknowledgePushedRows(name, payload, pushingForUserId)) || followUpPushNeeded;
    }

    if (!pushHadError && syncContextIsCurrent(pushingForUserId)) {
      const queue =
        ((await db.meta.get('delete_queue'))?.value as QueuedDelete[] | undefined) ?? [];
      const ownedQueue = queue.filter(
        (entry) => entry.user_id == null || entry.user_id === pushingForUserId
      );
      for (const d of ownedQueue) {
        if (!syncContextIsCurrent(pushingForUserId)) return;
        if (d.table === 'pyq_attempts') {
          console.warn(`[sync] discarded forbidden immutable delete for pyq_attempts/${d.id}`);
          await removeQueuedDelete(d, pushingForUserId);
          continue;
        }
        const recreated = (await table(d.table).get(d.id)) as Record<string, unknown> | undefined;
        if (recreated && recreated['user_id'] === pushingForUserId) {
          // A newer local recreate supersedes this older queued deletion.
          await removeQueuedDelete(d, pushingForUserId);
          if (recreated['sync_status'] !== 'synced') followUpPushNeeded = true;
          continue;
        }
        const { error } = await supabase.from(d.table).delete().eq('id', d.id);
        if (!syncContextIsCurrent(pushingForUserId)) return;
        if (error) {
          console.warn(`[sync] delete failed for ${d.table}/${d.id}: ${error.message}`);
          pushHadError = true;
        } else {
          await removeQueuedDelete(d, pushingForUserId);
        }
      }
    }

    if (!syncContextIsCurrent(pushingForUserId)) return;
    if (pushHadError) {
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
    } else {
      backoffMs = 2000;
    }
  })().finally(() => {
    pushInFlight = null;
    if (
      pushHadError &&
      syncContextIsCurrent(pushingForUserId) &&
      !pullInFlight &&
      !initialPullBarrier
    ) {
      // A same-ID immutable collision can arise after the most recent pull.
      // Reconcile a fresh server snapshot before retrying this payload instead
      // of hammering the immutable row forever.
      beginInitialPull(pushingForUserId, backoffMs);
      return;
    }
    if (
      !pushHadError &&
      followUpPushNeeded &&
      syncContextIsCurrent(pushingForUserId) &&
      !pullInFlight &&
      !initialPullBarrier
    ) {
      followUpPushNeeded = false;
      schedulePush(0);
    }
  });

  return pushInFlight;
}

/** Number of writes/deletes for this account that are not yet confirmed by
 * Supabase. This is intentionally account-scoped so a stale cache belonging
 * to another signed-out user cannot prevent the active account from leaving. */
export async function pendingSyncCount(userId: string): Promise<number> {
  const pendingRows = await Promise.all(
    SYNCED_TABLES.map(async (name) => {
      const rows = await table(name).where('sync_status').anyOf('pending', 'error').toArray();
      return rows.filter(
        (row) => (row as Record<string, unknown>)['user_id'] === userId
      ).length;
    })
  );
  const queue =
    ((await db.meta.get('delete_queue'))?.value as QueuedDelete[] | undefined) ?? [];
  const queuedDeletes = queue.filter(
    (entry) => entry.user_id == null || entry.user_id === userId
  ).length;
  return pendingRows.reduce((total, count) => total + count, queuedDeletes);
}

/** Flush and verify every local-first write before destructive local cleanup.
 * A failed initial pull is treated as unsafe even when no pending rows are
 * visible, because we cannot prove the device cache is represented remotely. */
export async function flushPendingSync(userId: string): Promise<boolean> {
  if (!supabaseConfigured) return true;
  if (!syncEnabled || currentUserId !== userId) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  try {
    await awaitInitialPull(userId);
    await flushPushQueue();
    return (await pendingSyncCount(userId)) === 0;
  } catch {
    return false;
  }
}

async function pruneSyncedRowsMissingFromRemote(
  name: SyncedTableName,
  userId: string,
  remoteIds: Set<string>
): Promise<void> {
  // PYQ attempt receipts are append-only locally and remotely. If a server
  // administrator removes one unexpectedly, retain the device copy rather
  // than converting that incident into a second data-loss event.
  if (name === 'pyq_attempts') return;
  const target = table(name);
  const snapshotKey = `remote_snapshot:${userId}:${name}`;
  await db.transaction('rw', [target, db.meta], async () => {
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
    const previousSnapshot = await db.meta.get(snapshotKey);
    const previouslyRemote = new Set(
      Array.isArray(previousSnapshot?.value)
        ? previousSnapshot.value.filter((id): id is string => typeof id === 'string')
        : []
    );
    const localRows = await target.toArray();
    const missingIds = localRows.flatMap((row) => {
      const record = row as { id: string; user_id?: string; sync_status?: string };
      return record.user_id === userId &&
        record.sync_status === 'synced' &&
        previouslyRemote.has(record.id) &&
        !remoteIds.has(record.id)
        ? [record.id]
        : [];
    });
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
    if (missingIds.length > 0) await target.bulkDelete(missingIds);
    await db.meta.put({ key: snapshotKey, value: [...remoteIds] });
  });
}

/** Merge a complete, paginated server snapshot into Dexie. Fetch failures are
 * propagated before any table merges, so an initial-pull barrier can never
 * release on a partial parent snapshot. */
export function pullAll(userId: string): Promise<void> {
  if (!syncEnabled) return Promise.resolve();
  if (pullInFlight && pullingForUserId === userId) return pullInFlight;
  if (pullInFlight) {
    const previous = pullInFlight;
    return previous.catch(() => undefined).then(() => pullAll(userId));
  }

  const pushBeforePull = pushInFlight;
  pullingForUserId = userId;
  let completed = false;
  const operation: Promise<void> = (async () => {
    // A pull and a push may each make conflict decisions from a local snapshot;
    // serializing them prevents either from acknowledging over the other's
    // merge. New pushes already wait on pullInFlight below.
    if (pushBeforePull) await pushBeforePull;
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();

    // Every table is independent on pull. Starting all requests together makes
    // refresh latency approach the slowest paginated stream, not their sum.
    const results = await Promise.all(SYNCED_TABLES.map((name) => fetchRemoteTable(name, userId)));

    // A sign-out/user switch can happen while the network batch is in flight.
    // Never merge the previous account's response into the newly opened DB.
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
    const queuedDeletes =
      ((await db.meta.get('delete_queue'))?.value as QueuedDelete[] | undefined) ?? [];
    if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
    const deletedKeys = new Set(
      queuedDeletes
        .filter((entry) => entry.user_id == null || entry.user_id === userId)
        .map((entry) => `${entry.table}\u0000${entry.id}`)
    );

    // Merge in FK order after the network fan-out. Attempt collisions are
    // repaired before question rows merge, so a remote analysis can retain the
    // original receipt while the local analysis follows its rekeyed receipt.
    for (const { name, data } of results) {
      if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
      const remoteRows = (data as { id: string }[]).filter(
        (row) => !deletedKeys.has(`${name}\u0000${row.id}`)
      );
      await pruneSyncedRowsMissingFromRemote(
        name,
        userId,
        new Set(remoteRows.map((row) => row.id))
      );
      if (remoteRows.length === 0) continue;
      const target = table(name);
      if (name === 'pyq_attempts') {
        const remoteAttempts = remoteRows.map((row) =>
          normalizeLocalWrite('pyq_attempts', row as unknown as PyqAttemptRow)
        );
        await db.transaction(
          'rw',
          [target, db.questions, db.reattempts, db.trigger_phrases, db.pyq_sessions],
          async () => {
            for (const remote of remoteAttempts) {
              if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
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
              if (local.sync_status === 'synced') {
                // Server-side migrations can enrich old immutable receipts
                // while their logical answer remains unchanged. A clean local
                // cache must mirror that authoritative server row, not invent
                // a new learner attempt from migration metadata.
                await db.pyq_attempts.put({ ...remote, sync_status: 'synced' });
                continue;
              }
              await repairImmutableAttemptCollision(local, remote, remoteAttempts);
            }
          }
        );
        continue;
      }

      if (name === 'questions') {
        await mergeRemoteQuestions(remoteRows as unknown as QuestionRow[], userId);
        continue;
      }

      if (name === 'topic_progress') {
        await mergeRemoteTopicProgress(remoteRows as unknown as TopicProgressRow[], userId);
        continue;
      }

      await db.transaction('rw', target, async () => {
        if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
        const localRows = await target.bulkGet(remoteRows.map((row) => row.id));
        const merged = remoteRows.flatMap((remote, index) => {
          const local = localRows[index];
          if (local && local.sync_status !== 'synced') {
            console.info(`[sync] conflict on ${name}/${remote.id}: local pending wins`);
            return [];
          }
          return [
            {
              ...normalizeLocalWrite(name, remote),
              sync_status: 'synced' as const
            }
          ];
        });
        if (!syncContextIsCurrent(userId)) throw new SyncContextChangedError();
        if (merged.length > 0) await target.bulkPut(merged);
      });
    }
    lastPullAt = Date.now();
    completed = true;
  })().finally(() => {
    if (pullInFlight === operation) {
      pullInFlight = null;
      pullingForUserId = null;
    }
    if (completed && syncContextIsCurrent(userId) && !initialPullBarrier) schedulePush(0);
  });
  pullInFlight = operation;

  return operation;
}

function reportPullFailure(error: unknown): void {
  if (error instanceof SyncContextChangedError) return;
  console.warn(error instanceof Error ? error.message : '[sync] pull failed');
}

function requestPullWithRetry(userId: string): void {
  void pullAll(userId).then(
    () => {
      pullBackoffMs = 2000;
    },
    (error) => {
      if (!syncContextIsCurrent(userId)) return;
      reportPullFailure(error);
      clearTimeout(pullRetryTimer);
      pullBackoffMs = Math.min(pullBackoffMs * 2, BACKOFF_MAX_MS);
      pullRetryTimer = setTimeout(() => requestPullWithRetry(userId), pullBackoffMs);
    }
  );
}

function beginInitialPull(userId: string, pushDelayAfterSuccess = 0): void {
  if (!syncContextIsCurrent(userId)) return;
  const barrier = pullAll(userId);
  initialPullBarrier = barrier;
  initialPullForUserId = userId;
  notifyInitialPullChange();
  void barrier.then(
    () => {
      if (initialPullBarrier !== barrier || !syncContextIsCurrent(userId)) return;
      initialPullBarrier = null;
      initialPullForUserId = null;
      notifyInitialPullChange();
      pullBackoffMs = 2000;
      schedulePush(pushDelayAfterSuccess);
    },
    (error) => {
      if (initialPullBarrier !== barrier || !syncContextIsCurrent(userId)) return;
      reportPullFailure(error);
      pullBackoffMs = Math.min(pullBackoffMs * 2, BACKOFF_MAX_MS);
      clearTimeout(pullRetryTimer);
      // Keep the rejected barrier installed until its replacement starts. Any
      // writes in this interval remain pending instead of bypassing the failed
      // parent snapshot.
      pullRetryTimer = setTimeout(
        () => beginInitialPull(userId, pushDelayAfterSuccess),
        pullBackoffMs
      );
    }
  );
}

function onOnline() {
  if (currentUserId && Date.now() - lastPullAt > PULL_MIN_GAP_MS) {
    requestPullWithRetry(currentUserId);
  } else {
    schedulePush(0);
  }
}

function onFocus() {
  if (currentUserId && Date.now() - lastPullAt > PULL_MIN_GAP_MS) {
    requestPullWithRetry(currentUserId);
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
  const userChanged = currentUserId !== userId;
  if (userChanged) {
    initialPullBarrier = null;
    initialPullForUserId = null;
    notifyInitialPullChange();
    lastPullAt = 0;
    backoffMs = 2000;
    pullBackoffMs = 2000;
    followUpPushNeeded = false;
    clearTimeout(pushTimer);
    clearTimeout(pullRetryTimer);
  }
  syncEnabled = true;
  currentUserId = userId;
  if (!started) {
    started = true;
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
  }
  // Pull first so an old device learns immutable receipts before it tries to
  // push a colliding deterministic ID. A failed/partial pull keeps this
  // barrier closed and retries with backoff.
  if (!initialPullBarrier || initialPullForUserId !== userId) beginInitialPull(userId);
}

export function stopSync(): void {
  syncEnabled = false;
  currentUserId = null;
  pullingForUserId = null;
  initialPullBarrier = null;
  initialPullForUserId = null;
  notifyInitialPullChange();
  clearTimeout(pushTimer);
  clearTimeout(pullRetryTimer);
}

/** Test hook: force-enable without listeners (unit tests drive pushes manually). */
export function _enableForTests(userId: string): void {
  syncEnabled = true;
  currentUserId = userId;
  backoffMs = 2000;
  pullBackoffMs = 2000;
  initialPullBarrier = null;
  initialPullForUserId = null;
  notifyInitialPullChange();
  clearTimeout(pullRetryTimer);
}
