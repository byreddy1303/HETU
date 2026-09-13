// Supabase-backed repository. Postgres is the ONLY durable store.
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
import { supabase, supabaseConfigured } from '@/lib/supabase';
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

/** Tables that write through to Supabase, in FK-safe order. */
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

// ---- in-memory cache ----

const stores = new Map<SyncedTableName, Map<string, Row>>(
  SYNCED_TABLES.map((name) => [name, new Map()])
);
const metaStore = new Map<string, MetaRow>();

// Per-table promise chain serializing write-through operations so a read-modify
// write (`update`) can never interleave with another write to the same row.
const writeChains = new Map<SyncedTableName, Promise<void>>();
function enqueueWrite(name: SyncedTableName, op: () => Promise<void>): Promise<void> {
  const previous = writeChains.get(name) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(op);
  writeChains.set(
    name,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

const listeners = new Set<() => void>();

function notifyChange(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeDb(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
  if (!supabaseConfigured || rows.length === 0) return;
  const { error } = await supabase.from(name).upsert(rows.map(toRemote));
  if (error) {
    if (isMissingRemoteSchema(error)) {
      console.warn(`[db] Table ${name} not present in remote schema cache; write skipped.`);
      return;
    }
    throw new Error(`[db] write failed for ${name}: ${error.message}`);
  }
}

async function deleteRowRemote(name: SyncedTableName, id: string): Promise<void> {
  if (!supabaseConfigured) return;
  const { error } = await supabase.from(name).delete().eq('id', id);
  if (error) {
    if (isMissingRemoteSchema(error)) {
      console.warn(`[db] Table ${name} not present in remote schema cache; delete skipped.`);
      return;
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
      const map = this.map();
      if (this.remoteMode) {
        map.set(String((row as unknown as Record<string, unknown>)[this.primaryKey]), asRow(row));
        notifyChange();
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
      map.set(id, normalized);
      notifyChange();
    });
  }

  bulkPut(rows: T[]): Promise<void> {
    if (rows.length === 0) return Promise.resolve();
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const map = this.map();
      if (this.remoteMode) {
        for (const row of rows) {
          map.set(String((row as unknown as Record<string, unknown>)[this.primaryKey]), asRow(row));
        }
        notifyChange();
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
      for (const normalized of normalizedRows) {
        if (this.mutable || !map.has(normalized.id)) map.set(normalized.id, normalized);
      }
      notifyChange();
    });
  }

  update(id: string, changes: Record<string, unknown>): Promise<number> {
    return enqueueWrite(this.name as SyncedTableName, async () => {
      if (this.remoteMode) {
        const map = this.map();
        const existing = map.get(id);
        if (!existing) return;
        map.set(id, { ...existing, ...changes } as Row);
        notifyChange();
        return;
      }
      const map = this.map();
      const existing = map.get(id);
      if (!existing) return;
      if (!this.mutable) throw this.immutabilityError(id);
      const merged = { ...existing, ...changes };
      await upsertRowsRemote(this.name as SyncedTableName, [merged]);
      map.set(id, merged);
      notifyChange();
    }).then(() => 1);
  }

  delete(id: string): Promise<void> {
    return enqueueWrite(this.name as SyncedTableName, async () => {
      if (!this.mutable) throw this.immutabilityError(id);
      const map = this.map();
      if (!map.has(id)) return;
      await deleteRowRemote(this.name as SyncedTableName, id);
      map.delete(id);
      notifyChange();
    });
  }

  bulkDelete(ids: string[]): Promise<void> {
    if (ids.length === 0) return Promise.resolve();
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const map = this.map();
      for (const id of ids) {
        if (!this.mutable) throw this.immutabilityError(id);
        if (!map.has(id)) continue;
        await deleteRowRemote(this.name as SyncedTableName, id);
        map.delete(id);
      }
      notifyChange();
    });
  }

  clear(): Promise<void> {
    return enqueueWrite(this.name as SyncedTableName, async () => {
      const map = this.map();
      if (this.remoteMode) {
        map.clear();
        notifyChange();
        return;
      }
      if (!this.mutable) {
        for (const id of [...map.keys()]) {
          await deleteRowRemote(this.name as SyncedTableName, id);
        }
      }
      map.clear();
      notifyChange();
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

// ---- hydration ----

/**
 * Replace the RAM cache with the full server snapshot for a user. Called on
 * login and on every server-driven refresh. A failed hydration rejects so the
 * caller (initial-pull barrier) can resolve without a caller-blocking retry
 * loop; the app keeps whatever it already had in memory.
 */
export async function hydrateAll(userId: string): Promise<void> {
  if (!supabaseConfigured) {
    await clearLocalData();
    return;
  }
  const results = await Promise.all(
    SYNCED_TABLES.map(async (name) => {
      const { data, error } = await supabase
        .from(name)
        .select('*')
        .eq('user_id', userId)
        .order('id', { ascending: true });
      if (error && !isMissingRemoteSchema(error)) {
        throw new Error(`[db] hydrate failed for ${name}: ${error.message}`);
      }
      return { name, rows: (data ?? []) as Row[] };
    })
  );
  for (const { name, rows } of results) {
    const map = stores.get(name)!;
    map.clear();
    for (const row of rows) {
      map.set(row.id, { ...normalizeTableWrite(name, row), sync_status: 'synced' });
    }
  }
  notifyChange();
}

/** Drop the RAM cache only — nothing durable is touched. */
export async function clearLocalData(): Promise<void> {
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
  notifyChange();
}