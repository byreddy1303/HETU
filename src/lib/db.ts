// Python API repository. Postgres is the ONLY durable store.
//
// This module is a RAM-only cache in front of the database. Reads are served
// from memory after an account hydrate; every write goes straight to Postgres
// (write-through) before the memory cache is touched, so nothing durable ever
// waits on a background sync queue. On sign-out the RAM cache is simply
// dropped — there is no local persistence to wipe or lose.
//
// The public surface is deliberately Dexie-shaped (`db.sessions.where(...)
// .equals(...).toArray()`) so pages, libs and tests keep their queries
// unchanged while the backing store moves from IndexedDB to Postgres.
import { apiClient, apiConfigured } from '@/lib/api-client';
import { normalizeMockSubjectScores, normalizeMockTestRow } from '@/lib/mocks';
import { normalizeSubjectIdentity } from '@/lib/subjects';
import type {
  Local,
  SessionRow,
  QuestionRow,
  PatternRow,
  ReattemptRow,
  FormulaRow,
  TriggerPhraseRow,
  WeeklyReviewRow,
  InterruptionLogRow,
  PyqSessionRow,
  PyqAttemptRow,
  MockTestRow,
  TopicProgressRow,
  LearningItemRow,
  LearningEventRow,
  RecoverySessionRow
} from '@/types';

export type LocalSession = Local<SessionRow>;
export type LocalQuestion = Local<QuestionRow>;
export type LocalPattern = Local<PatternRow>;
export type LocalReattempt = Local<ReattemptRow>;
export type LocalFormula = Local<FormulaRow>;
export type LocalTriggerPhrase = Local<TriggerPhraseRow>;
export type LocalWeeklyReview = Local<WeeklyReviewRow>;
export type LocalInterruptionLog = Local<InterruptionLogRow>;
export type LocalPyqSession = Local<PyqSessionRow>;
export type LocalPyqAttempt = Local<PyqAttemptRow>;
export type LocalMockTest = Local<MockTestRow>;
export type LocalTopicProgress = Local<TopicProgressRow>;
export type LocalLearningItem = Local<LearningItemRow>;
export type LocalLearningEvent = Local<LearningEventRow>;
export type LocalRecoverySession = Local<RecoverySessionRow>;

interface MetaRow {
  key: string;
  value: unknown;
}

/** Tables that write through to Postgres, in FK-safe order. */
export const SYNCED_TABLES = [
  'sessions',
  'pyq_sessions',
  'pyq_attempts',
  'questions',
  'learning_items',
  'recovery_sessions',
  'learning_events',
  'patterns',
  'reattempts',
  'formulas',
  'trigger_phrases',
  'weekly_reviews',
  'interruption_logs',
  'mock_tests',
  'topic_progress'
] as const;

export type SyncedTableName = (typeof SYNCED_TABLES)[number];

type Row = { id: string } & Record<string, unknown>;

/** Append-only receipts that must never be edited or deleted once committed. */
const IMMUTABLE_TABLES = new Set<string>(['pyq_attempts', 'learning_events']);

const SUBJECT_ROW_TABLES = new Set<string>([
  'sessions',
  'questions',
  'patterns',
  'formulas',
  'pyq_attempts',
  'learning_items',
  'topic_progress'
]);

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

// ---- same-device write echo suppression ----
//
// Realtime streams our own committed writes back to us. Re-hydrating then
// would re-download the entire account (attempts/questions embed hundreds of
// multi-hundred-KB screenshots) for every single edit. The write path records
// the rows it committed, and the realtime listener skips refreshes for them.
const LOCAL_WRITE_TTL_MS = 10_000;
const recentLocalWrites = new Map<string, number>();

function localWriteKey(name: SyncedTableName, id: string): string {
  return `${name}:${id}`;
}

/** Remember a row this device is about to commit so its echo can be skipped. */
export function noteLocalWrite(name: SyncedTableName, id: string): void {
  if (recentLocalWrites.size > 1024) {
    const now = Date.now();
    for (const [key, at] of recentLocalWrites) {
      if (now - at > LOCAL_WRITE_TTL_MS) recentLocalWrites.delete(key);
    }
  }
  recentLocalWrites.set(localWriteKey(name, id), Date.now());
}

/** Forget a previously noted write (used when the commit failed). */
function forgetLocalWrite(name: SyncedTableName, id: string): void {
  recentLocalWrites.delete(localWriteKey(name, id));
}

/** True if this device recently committed name/id; consumes the marker. */
export function consumeLocalWrite(name: SyncedTableName, id: string): boolean {
  const key = localWriteKey(name, id);
  const at = recentLocalWrites.get(key);
  if (at === undefined) return false;
  recentLocalWrites.delete(key);
  return Date.now() - at <= LOCAL_WRITE_TTL_MS;
}

// ---- in-memory cache ----

const stores = new Map<SyncedTableName, Map<string, Row>>(
  SYNCED_TABLES.map((name) => [name, new Map()])
);
const metaStore = new Map<string, MetaRow>();

// Most tables keep their existing table-wide write barrier. Syllabus leaves
// are independent: serialize only the same row, so a slow save cannot hold up
// every other checkbox. Bulk writes and clears still respect those row lanes.
const writeChains = new Map<SyncedTableName, Promise<void>>();
const topicWriteChains = new Map<string, Promise<void>>();
let cacheGeneration = 0;
let topicRevision = 0;
const topicRowRevisions = new Map<string, number>();

function enqueueWrite(
  name: SyncedTableName,
  op: () => Promise<void>,
  ids?: readonly string[]
): Promise<void> {
  const generation = cacheGeneration;
  const dependencies = [writeChains.get(name)];
  if (name === 'topic_progress') {
    dependencies.push(...(ids ? ids.map((id) => topicWriteChains.get(id)) : topicWriteChains.values()));
  }
  const run = Promise.all(dependencies).then(async () => {
    if (generation !== cacheGeneration) throw new Error('Account changed before the save started.');
    await op();
  });
  const settled = run.catch(() => undefined);
  if (name === 'topic_progress' && ids?.length) {
    for (const id of ids) topicWriteChains.set(id, settled);
    void settled.then(() => {
      for (const id of ids) {
        if (topicWriteChains.get(id) === settled) topicWriteChains.delete(id);
      }
    });
  } else {
    writeChains.set(name, settled);
    void settled.then(() => {
      if (writeChains.get(name) === settled) writeChains.delete(name);
    });
  }
  return run;
}

export type DbTableName = SyncedTableName | 'meta';
const listeners = new Map<() => void, readonly DbTableName[] | undefined>();
const tableSnapshots = new Map<SyncedTableName, Row[]>();

function notifyChange(names?: readonly DbTableName[]): void {
  if (names) {
    for (const name of names) tableSnapshots.delete(name as SyncedTableName);
  } else tableSnapshots.clear();
  listeners.forEach((tables, listener) => {
    if (!names || !tables || tables.some((name) => names.includes(name))) listener();
  });
}

export function subscribeDb(listener: () => void, tables?: readonly DbTableName[]): () => void {
  listeners.set(listener, tables);
  return () => {
    listeners.delete(listener);
  };
}

function noteCommittedRows(name: string, ids: readonly string[]): void {
  if (name !== 'topic_progress') return;
  for (const id of ids) topicRowRevisions.set(id, ++topicRevision);
}

// ---- normalization (mirrors the previous local-first write path) ----

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

function comparablePayload(value: Row): unknown {
  const normalized = { ...value };
  delete normalized.sync_status;
  if ('attempted_at' in normalized && typeof normalized['attempted_at'] === 'string') {
    const parsed = Date.parse(normalized['attempted_at'] as string);
    if (Number.isFinite(parsed)) normalized['attempted_at'] = new Date(parsed).toISOString();
  }
  for (const field of LEGACY_OPTIONAL_ATTEMPT_FIELDS) {
    if (normalized[field] === undefined) normalized[field] = null;
  }
  return comparableValue(normalized);
}

function samePayload(left: Row, right: Row): boolean {
  return JSON.stringify(comparablePayload(left)) === JSON.stringify(comparablePayload(right));
}

function normalizeTableWrite(name: SyncedTableName, row: Record<string, unknown>): Row {
  const normalized: Record<string, unknown> = { ...row };
  if (SUBJECT_ROW_TABLES.has(name) && typeof normalized['subject'] === 'string') {
    const identity = normalizeSubjectIdentity(normalized['subject'], normalized['subject_id']);
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
  if (name === 'mock_tests') return normalizeMockTestRow(normalized) as unknown as Row;
  return normalized as Row;
}

function asRow(value: unknown): Row {
  return value as Row;
}

function toRemote(row: Row): Record<string, unknown> {
  const { id, ...rest } = row;
  delete rest.sync_status;
  return { id, ...rest };
}

function isMissingRemoteSchema(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    Boolean(error.message?.includes('schema cache')) ||
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST200'
  );
}

async function upsertRowsRemote(name: SyncedTableName, rows: Row[]): Promise<void> {
  if (!apiConfigured || rows.length === 0) return;
  for (const row of rows) noteLocalWrite(name, row.id);
  try {
    const { error } = await apiClient.from(name).upsert(rows.map(toRemote));
    if (error) throw error;
  } catch (error) {
    for (const row of rows) forgetLocalWrite(name, row.id);
    // Never swallow a failed write: if the durable store cannot confirm the
    // write, the caller must surface it instead of pretending the data saved.
    if (isMissingRemoteSchema(error as { message?: string; code?: string } | null)) {
      throw new Error(
        `[db] write to ${name} was NOT saved (remote schema does not expose it): ${(error as { message?: string }).message}`
      );
    }
    throw new Error(`[db] write failed for ${name}: ${(error as { message?: string }).message}`);
  }
}

async function deleteRowRemote(name: SyncedTableName, id: string): Promise<void> {
  if (!apiConfigured) return;
  noteLocalWrite(name, id);
  const { error } = await apiClient.from(name).delete().eq('id', id);
  if (error) {
    forgetLocalWrite(name, id);
    if (isMissingRemoteSchema(error)) {
      throw new Error(
        `[db] delete of ${name}/${id} was NOT applied (remote schema does not expose it): ${error.message}`
      );
    }
    throw new Error(`[db] delete failed for ${name}/${id}: ${error.message}`);
  }
}

// ---- table facade ----

interface WhereClause {
  field: string;
  value: unknown;
}

function matchesWhere(row: Row, clause: WhereClause): boolean {
  const compound = clause.field.startsWith('[') && clause.field.endsWith(']');
  if (compound) {
    const fields = clause.field.slice(1, -1).split('+');
    const values = Array.isArray(clause.value) ? clause.value : [clause.value];
    return fields.every((field, index) => {
      const actual = row[field];
      const expected = values[index];
      return actual === expected || (actual == null && expected == null);
    });
  }
  return row[clause.field] === clause.value;
}

class TableQuery<T> {
  constructor(
    private readonly table: MemoryTable<T>,
    private readonly clauses: WhereClause[],
    private readonly predicates: Array<(row: T) => boolean> = []
  ) {}

  private matches(row: Row): boolean {
    if (!this.clauses.every((clause) => matchesWhere(row, clause))) return false;
    return this.predicates.every((predicate) => predicate(row as T));
  }

  private rows(): T[] {
    return [...this.table.map().values()].filter((row) => this.matches(row)) as T[];
  }

  where(field: string): {
    equals: (value: unknown) => TableQuery<T>;
    anyOf: (values: unknown[]) => TableQuery<T>;
  } {
    return {
      equals: (value: unknown) => new TableQuery(this.table, [...this.clauses, { field, value }], this.predicates),
      anyOf: (values: unknown[]) =>
        new TableQuery(
          this.table,
          values.map((value) => ({ field, value })),
          this.predicates
        )
    };
  }

  filter(predicate: (row: T) => boolean): TableQuery<T> {
    return new TableQuery(this.table, this.clauses, [...this.predicates, predicate]);
  }

  toArray(): Promise<T[]> {
    return Promise.resolve(this.rows());
  }

  sortBy(field: string): Promise<T[]> {
    const rows = this.rows();
    rows.sort((left, right) => {
      const leftValue = (left as Record<string, unknown>)[field];
      const rightValue = (right as Record<string, unknown>)[field];
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return leftValue - rightValue;
      }
      return String(leftValue ?? '').localeCompare(String(rightValue ?? ''));
    });
    return Promise.resolve(rows);
  }

  count(): Promise<number> {
    return Promise.resolve(this.rows().length);
  }

  first(): Promise<T | undefined> {
    return Promise.resolve(this.rows()[0]);
  }
}

class MemoryTable<T> {
  readonly name: string;
  private readonly remoteMode: boolean;
  private readonly mutable: boolean;
  private readonly primaryKey: string;

  constructor(name: string, remoteMode: boolean, primaryKey = 'id') {
    this.name = name;
    this.remoteMode = remoteMode;
    this.mutable = !IMMUTABLE_TABLES.has(name);
    this.primaryKey = primaryKey;
  }

  map(): Map<string, Row> {
    return this.remoteMode
      ? (metaStore as unknown as Map<string, Row>)
      : (stores.get(this.name as SyncedTableName) as unknown as Map<string, Row>);
  }

  private immutabilityError(id: string): Error {
    return new Error(
      this.name === 'pyq_attempts'
        ? `Committed PYQ attempt ${id} is immutable.`
        : `Learning event ${id} is append-only.`
    );
  }

  get(id: string): Promise<T | undefined> {
    return Promise.resolve(this.map().get(id) as T | undefined);
  }

  toArray(): Promise<T[]> {
    return Promise.resolve([...this.map().values()] as T[]);
  }

  count(): Promise<number> {
    return Promise.resolve(this.map().size);
  }

  bulkGet(ids: string[]): Promise<Array<T | undefined>> {
    const map = this.map();
    return Promise.resolve(ids.map((id) => map.get(id) as T | undefined));
  }

  add(row: T): Promise<void> {
    return this.put(row);
  }

  put(row: T): Promise<void> {
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const generation = cacheGeneration;
      const map = this.map();
      if (this.remoteMode) {
        map.set(String((row as unknown as Record<string, unknown>)[this.primaryKey]), asRow(row));
        notifyChange([this.name as DbTableName]);
        return;
      }
      const normalized = normalizeTableWrite(
        this.name as SyncedTableName,
        row as unknown as Record<string, unknown>
      );
      const id = normalized.id;
      if (!this.mutable) {
        const existing = map.get(id);
        if (existing && !samePayload(existing, normalized)) throw this.immutabilityError(id);
        if (existing) return;
      }
      await upsertRowsRemote(this.name as SyncedTableName, [normalized]);
      if (generation !== cacheGeneration) return;
      map.set(id, normalized);
      noteCommittedRows(this.name, [id]);
      notifyChange([this.name as DbTableName]);
    }, [asRow(row).id]);
  }

  bulkPut(rows: T[]): Promise<void> {
    if (rows.length === 0) return Promise.resolve();
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const generation = cacheGeneration;
      const map = this.map();
      if (this.remoteMode) {
        for (const row of rows) {
          map.set(String((row as unknown as Record<string, unknown>)[this.primaryKey]), asRow(row));
        }
        notifyChange([this.name as DbTableName]);
        return;
      }
      const normalizedRows = rows.map((row) =>
        normalizeTableWrite(this.name as SyncedTableName, row as unknown as Record<string, unknown>)
      );
      if (!this.mutable) {
        for (const normalized of normalizedRows) {
          const existing = map.get(normalized.id);
          if (existing && !samePayload(existing, normalized)) {
            throw this.immutabilityError(normalized.id);
          }
        }
      }
      await upsertRowsRemote(
        this.name as SyncedTableName,
        normalizedRows.filter((row) => !map.has(row.id) || this.mutable)
      );
      if (generation !== cacheGeneration) return;
      for (const normalized of normalizedRows) {
        if (this.mutable || !map.has(normalized.id)) map.set(normalized.id, normalized);
      }
      noteCommittedRows(this.name, normalizedRows.map((row) => row.id));
      notifyChange([this.name as DbTableName]);
    }, rows.map((row) => asRow(row).id));
  }

  update(id: string, changes: Record<string, unknown>): Promise<number> {
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const generation = cacheGeneration;
      if (this.remoteMode) {
        const map = this.map();
        const existing = map.get(id);
        if (!existing) return;
        map.set(id, { ...existing, ...changes } as Row);
        notifyChange([this.name as DbTableName]);
        return;
      }
      const map = this.map();
      const existing = map.get(id);
      if (!existing) return;
      if (!this.mutable) throw this.immutabilityError(id);
      const merged = { ...existing, ...changes };
      await upsertRowsRemote(this.name as SyncedTableName, [merged]);
      if (generation !== cacheGeneration) return;
      map.set(id, merged);
      noteCommittedRows(this.name, [id]);
      notifyChange([this.name as DbTableName]);
    }, [id]).then(() => 1);
  }

  delete(id: string): Promise<void> {
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const generation = cacheGeneration;
      if (!this.mutable) throw this.immutabilityError(id);
      const map = this.map();
      // An untick may arrive before the initial snapshot. It must still reach
      // Postgres even when this device has not cached the row yet.
      if (!map.has(id) && this.name !== 'topic_progress') return;
      await deleteRowRemote(this.name as SyncedTableName, id);
      if (generation !== cacheGeneration) return;
      map.delete(id);
      noteCommittedRows(this.name, [id]);
      notifyChange([this.name as DbTableName]);
    }, [id]);
  }

  bulkDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return Promise.resolve();
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const generation = cacheGeneration;
      const map = this.map();
      for (const id of ids) {
        if (!this.mutable) throw this.immutabilityError(id);
        if (!map.has(id) && this.name !== 'topic_progress') continue;
        await deleteRowRemote(this.name as SyncedTableName, id);
        if (generation !== cacheGeneration) return;
        map.delete(id);
        noteCommittedRows(this.name, [id]);
      }
      notifyChange([this.name as DbTableName]);
    }, ids);
  }

  clear(): Promise<void> {
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const map = this.map();
      if (this.remoteMode) {
        map.clear();
        notifyChange([this.name as DbTableName]);
        return;
      }
      if (!this.mutable) {
        for (const id of [...map.keys()]) {
          await deleteRowRemote(this.name as SyncedTableName, id);
        }
      }
      noteCommittedRows(this.name, [...map.keys()]);
      map.clear();
      notifyChange([this.name as DbTableName]);
    });
  }

  orderBy(field: string): { toArray: () => Promise<T[]> } {
    return { toArray: () => new TableQuery(this, []).sortBy(field) };
  }

  where(field: string): {
    equals: (value: unknown) => TableQuery<T>;
    anyOf: (values: unknown[]) => TableQuery<T>;
  } {
    return new TableQuery(this, []).where(field);
  }
}

export const db = {
  sessions: new MemoryTable<LocalSession>('sessions', false),
  questions: new MemoryTable<LocalQuestion>('questions', false),
  patterns: new MemoryTable<LocalPattern>('patterns', false),
  reattempts: new MemoryTable<LocalReattempt>('reattempts', false),
  formulas: new MemoryTable<LocalFormula>('formulas', false),
  trigger_phrases: new MemoryTable<LocalTriggerPhrase>('trigger_phrases', false),
  weekly_reviews: new MemoryTable<LocalWeeklyReview>('weekly_reviews', false),
  interruption_logs: new MemoryTable<LocalInterruptionLog>('interruption_logs', false),
  pyq_sessions: new MemoryTable<LocalPyqSession>('pyq_sessions', false),
  pyq_attempts: new MemoryTable<LocalPyqAttempt>('pyq_attempts', false),
  mock_tests: new MemoryTable<LocalMockTest>('mock_tests', false),
  topic_progress: new MemoryTable<LocalTopicProgress>('topic_progress', false),
  learning_items: new MemoryTable<LocalLearningItem>('learning_items', false),
  learning_events: new MemoryTable<LocalLearningEvent>('learning_events', false),
  recovery_sessions: new MemoryTable<LocalRecoverySession>('recovery_sessions', false),
  meta: new MemoryTable<MetaRow>('meta', true, 'key'),
  /** Dexie-shaped helpers retained for tests and generic callers. */
  table(name: SyncedTableName): MemoryTable<Row> {
    return db[name] as unknown as MemoryTable<Row>;
  },
  async transaction(
    _mode: string,
    _tables: unknown,
    callback: () => Promise<void> | void
  ): Promise<void> {
    return callback();
  },
  delete(): Promise<void> {
    return clearLocalData();
  },
  open(): Promise<void> {
    return Promise.resolve();
  }
};

export function table(name: SyncedTableName): MemoryTable<Row> {
  return db.table(name);
}

/** Stable synchronous snapshots for React's external-store subscription. */
export function getTableSnapshot<Name extends SyncedTableName>(
  name: Name
): Awaited<ReturnType<(typeof db)[Name]['toArray']>> {
  let snapshot = tableSnapshots.get(name);
  if (!snapshot) {
    snapshot = [...stores.get(name)!.values()];
    tableSnapshots.set(name, snapshot);
  }
  return snapshot as unknown as Awaited<ReturnType<(typeof db)[Name]['toArray']>>;
}

// ---- hydration ----

const tableHydrations = new Map<SyncedTableName, { userId: string; promise: Promise<void> }>();
const hydratedUsers = new Map<SyncedTableName, string>();

/** Wait only for this table, sharing any request already started at login. */
export function ensureTableHydrated(userId: string, name: SyncedTableName): Promise<void> {
  if (hydratedUsers.get(name) === userId) return Promise.resolve();
  return hydrateTable(userId, name);
}

function hydrateTable(userId: string, name: SyncedTableName): Promise<void> {
  if (!apiConfigured) return Promise.resolve();
  const active = tableHydrations.get(name);
  if (active?.userId === userId) return active.promise;
  const generation = cacheGeneration;
  const startingRevision = topicRevision;
  const promise = (async () => {
    // Question snapshots contain images. Small pages keep existing history
    // within the hosting response limit, even for image-heavy accounts.
    const pageSize = name === 'questions' || name === 'pyq_attempts' ? 10 : 100;
    const rows: Row[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await apiClient
        .from(name)
        .select('*')
        .eq('user_id', userId)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error && !isMissingRemoteSchema(error)) {
        throw new Error(`[db] hydrate failed for ${name}: ${error.message}`);
      }
      const page = (data ?? []) as Row[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    if (generation !== cacheGeneration) return;
    const map = stores.get(name)!;
    const next = new Map(rows.map((row) => [
      row.id, { ...normalizeTableWrite(name, row), sync_status: 'synced' }
    ]));
    if (name === 'topic_progress') {
      // A read started before a checkbox save must not undo its acknowledged
      // write (including deletions). Keep only changes newer than this read.
      for (const [id, revision] of topicRowRevisions) {
        if (revision <= startingRevision) continue;
        const committed = map.get(id);
        if (committed) next.set(id, committed as Row & { sync_status: string });
        else next.delete(id);
      }
    }
    map.clear();
    for (const [id, row] of next) map.set(id, row);
    hydratedUsers.set(name, userId);
    // Publish lightweight progress immediately; large practice history may
    // still be loading. Each table is replaced only after all its pages load.
    notifyChange([name]);
  })().finally(() => {
    if (tableHydrations.get(name)?.promise === promise) tableHydrations.delete(name);
  });
  tableHydrations.set(name, { userId, promise });
  return promise;
}

/**
 * Replace the RAM cache for the given tables with the server snapshot. Used
 * for realtime refreshes so a single change elsewhere never re-downloads the
 * entire account (attempts/questions embed multi-hundred-KB screenshots).
 */
export async function hydrateTables(
  userId: string,
  names: readonly SyncedTableName[]
): Promise<void> {
  if (names.length === 0 || !apiConfigured) return;
  await Promise.all(names.map((name) => hydrateTable(userId, name)));
}

/**
 * Replace the RAM cache with the full server snapshot for a user. Called on
 * login and on every server-driven refresh. A failed hydration rejects so the
 * caller (initial-pull barrier) can resolve without a caller-blocking retry
 * loop; the app keeps whatever it already had in memory.
 */
export async function hydrateAll(userId: string): Promise<void> {
  if (!apiConfigured) {
    await clearLocalData();
    return;
  }
  await hydrateTables(userId, ['topic_progress', ...SYNCED_TABLES.filter((name) => name !== 'topic_progress')]);
}

/** Drop the RAM cache only — nothing durable is touched. */
export async function clearLocalData(): Promise<void> {
  cacheGeneration++;
  tableHydrations.clear();
  hydratedUsers.clear();
  topicRowRevisions.clear();
  writeChains.clear();
  topicWriteChains.clear();
  recentLocalWrites.clear();
  for (const map of stores.values()) map.clear();
  metaStore.clear();
  notifyChange();
}

/** Test/sandbox hook: seed the RAM cache without touching the network. */
export function seedLocalRows(name: SyncedTableName, rows: Row[]): void {
  const map = stores.get(name)!;
  for (const row of rows) {
    map.set(row.id, row);
  }
  noteCommittedRows(name, rows.map((row) => row.id));
  notifyChange([name]);
}

/** Apply an already committed domain response to RAM without sending it back as a write. */
export function applyServerRows(userId: string, writes: Array<{
  name: SyncedTableName; rows: Array<{ id: string; user_id?: string; version?: number; [key: string]: unknown }>
}>): void {
  let changed = false;
  for (const { name, rows } of writes) {
    for (const row of rows) {
      if (row.user_id !== userId) throw new Error('Domain response belongs to another account.');
    }
    if (!stores.has(name)) throw new Error('Unknown domain response table.');
  }
  for (const { name, rows } of writes) {
    const map = stores.get(name)!;
    for (const row of rows) {
      const existing = map.get(row.id);
      const incomingVersion = typeof row.version === 'number' ? row.version : 0;
      const currentVersion = typeof existing?.version === 'number' ? existing.version : 0;
      if (existing && currentVersion >= incomingVersion && incomingVersion > 0) continue;
      map.set(
        row.id,
        {
          ...normalizeTableWrite(name, row as unknown as Record<string, unknown>),
          sync_status: 'synced'
        } as never
      );
      changed = true;
    }
  }
  if (changed) notifyChange();
}
