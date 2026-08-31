import type { EditorDraft } from '@/components/shared/questionDraft';
import {
  MARK_DECISIONS,
  OUTCOMES,
  QUESTION_FORMATS,
  ROOT_CAUSES,
  SOURCE_KINDS,
  type QuestionFormat,
  type SourceKind
} from '@/lib/constants';
import { normalizeSubjectIdentity } from '@/lib/subjects';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/utils';
import {
  DEFAULT_PREFERENCES,
  usePrefsStore,
  type DurationMin,
  type FontScale,
  type Preferences
} from '@/stores/prefs';
import {
  EMPTY_ACTIVE_SESSION,
  useSessionStore,
  type ActiveSessionSnapshot,
  type SessionMode
} from '@/stores/session';
import { EMPTY_LOG_DRAFT, useLogStore, type LogDraftSnapshot, type LogMode } from '@/stores/log';
import { useAuthStore } from '@/stores/auth';
import type { MarkDecision, Outcome, RootCause } from '@/types';

export const ACCOUNT_STATE_SCHEMA_VERSION = 1 as const;

export const ACCOUNT_STATE_NAMESPACES = ['preferences', 'active_session', 'log_draft'] as const;

export type AccountStateNamespace = (typeof ACCOUNT_STATE_NAMESPACES)[number];

interface AccountStateDataByNamespace {
  preferences: Preferences;
  active_session: ActiveSessionSnapshot;
  log_draft: LogDraftSnapshot;
}

export interface AccountStatePayload<T> {
  schemaVersion: typeof ACCOUNT_STATE_SCHEMA_VERSION;
  data: T;
}

type AnyAccountStatePayload = AccountStatePayload<
  AccountStateDataByNamespace[AccountStateNamespace]
>;

interface AccountStateRow {
  namespace: string;
  payload: unknown;
}

interface PendingWrite {
  payload: AnyAccountStatePayload;
  fingerprint: string;
  revision: number;
}

interface AccountStateWriter {
  userId: string;
  nextRevision: number;
  pending: Map<AccountStateNamespace, PendingWrite>;
  failedRevisions: Map<AccountStateNamespace, number>;
  lastError: Error | null;
  running: Promise<void> | null;
}

type SyncStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AccountStateRuntime {
  generation: number;
  status: SyncStatus;
  bootstrap: Promise<void> | null;
  unsubscribers: Array<() => void>;
}

const writers = new Map<string, AccountStateWriter>();
const runtimes = new Map<string, AccountStateRuntime>();

function pendingStorageKey(userId: string, namespace: AccountStateNamespace): string {
  return `air.account-state-pending.${userId}.${namespace}`;
}

function persistPendingWrite(
  userId: string,
  namespace: AccountStateNamespace,
  payload: AnyAccountStatePayload
): void {
  try {
    localStorage.setItem(pendingStorageKey(userId, namespace), JSON.stringify(payload));
  } catch {
    // The in-memory queue and the namespace's normal Zustand cache still keep
    // the latest edit for this session when browser storage is unavailable.
  }
}

function clearPersistedPendingWrite(userId: string, namespace: AccountStateNamespace): void {
  try {
    localStorage.removeItem(pendingStorageKey(userId, namespace));
  } catch {
    // Ignore unavailable browser storage after the server has acknowledged.
  }
}

const DURATION_VALUES = new Set<DurationMin>([30, 60, 90, 120]);
const FONT_SCALE_VALUES = new Set<FontScale>(['small', 'normal', 'large']);
const THEME_VALUES = new Set<Preferences['colorTheme']>(['light', 'dark', 'system']);
const SESSION_MODE_VALUES = new Set<SessionMode>(['solve', 'tag']);
const LOG_MODE_VALUES = new Set<LogMode>(['idle', 'single', 'multi']);
const SOURCE_KIND_VALUES = new Set<SourceKind>(SOURCE_KINDS.map((item) => item.value));
const QUESTION_FORMAT_VALUES = new Set<QuestionFormat>(QUESTION_FORMATS.map((item) => item.value));
const OUTCOME_VALUES = new Set<Outcome>(OUTCOMES.map((item) => item.code));
const ROOT_CAUSE_VALUES = new Set<RootCause>(ROOT_CAUSES.map((item) => item.value));
const MARK_DECISION_VALUES = new Set<MarkDecision>(MARK_DECISIONS.map((item) => item.value));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadData(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  return isRecord(payload.data) ? payload.data : payload;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : fallback;
}

function nullableString(value: unknown, fallback: string | null = null): string | null {
  return value === null || typeof value === 'string' ? value : fallback;
}

function nullableFiniteNumber(value: unknown, fallback: number | null = null): number | null {
  return value === null || isFiniteNumber(value) ? value : fallback;
}

function nullableBoolean(value: unknown, fallback: boolean | null = null): boolean | null {
  return value === null || typeof value === 'boolean' ? value : fallback;
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, fallback: T): T {
  return typeof value === 'string' && values.has(value as T) ? (value as T) : fallback;
}

function numberEnumValue<T extends number>(value: unknown, values: ReadonlySet<T>, fallback: T): T {
  return typeof value === 'number' && values.has(value as T) ? (value as T) : fallback;
}

function nullableEnumValue<T extends string>(
  value: unknown,
  values: ReadonlySet<T>,
  fallback: T | null = null
): T | null {
  return value === null
    ? null
    : typeof value === 'string' && values.has(value as T)
      ? (value as T)
      : fallback;
}

function nullableTimestamp(value: unknown, fallback: string | null = null): string | null {
  if (value === null) return null;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback;
}

function isoDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : fallback;
}

function normalizePreferences(payload: unknown): Preferences {
  const data = payloadData(payload);
  const subject = normalizeSubjectIdentity(data.defaultSubject, data.defaultSubjectId);

  return {
    dailyQuestionTarget: integerInRange(
      data.dailyQuestionTarget,
      1,
      200,
      DEFAULT_PREFERENCES.dailyQuestionTarget
    ),
    weeklySessionTarget: integerInRange(
      data.weeklySessionTarget,
      1,
      21,
      DEFAULT_PREFERENCES.weeklySessionTarget
    ),
    weeklyReviewDay: integerInRange(
      data.weeklyReviewDay,
      0,
      6,
      DEFAULT_PREFERENCES.weeklyReviewDay
    ) as Preferences['weeklyReviewDay'],
    defaultSubject: subject.label || null,
    defaultSubjectId: subject.id,
    defaultDurationMin: numberEnumValue(
      data.defaultDurationMin,
      DURATION_VALUES,
      DEFAULT_PREFERENCES.defaultDurationMin
    ),
    defaultQuestionCount: integerInRange(
      data.defaultQuestionCount,
      1,
      1_000,
      DEFAULT_PREFERENCES.defaultQuestionCount
    ),
    colorTheme: enumValue(data.colorTheme, THEME_VALUES, DEFAULT_PREFERENCES.colorTheme),
    compactRows:
      typeof data.compactRows === 'boolean' ? data.compactRows : DEFAULT_PREFERENCES.compactRows,
    showCountdown:
      typeof data.showCountdown === 'boolean'
        ? data.showCountdown
        : DEFAULT_PREFERENCES.showCountdown,
    fontScale: enumValue(data.fontScale, FONT_SCALE_VALUES, DEFAULT_PREFERENCES.fontScale),
    hapticsEnabled:
      typeof data.hapticsEnabled === 'boolean'
        ? data.hapticsEnabled
        : DEFAULT_PREFERENCES.hapticsEnabled,
    backupReminderDays: numberEnumValue(
      data.backupReminderDays,
      new Set<Preferences['backupReminderDays']>([0, 7, 30]),
      DEFAULT_PREFERENCES.backupReminderDays
    ),
    lastBackupAt: nullableTimestamp(data.lastBackupAt, DEFAULT_PREFERENCES.lastBackupAt)
  };
}

function normalizeActiveSession(payload: unknown): ActiveSessionSnapshot {
  const data = payloadData(payload);
  const sessionId = nullableString(data.sessionId);
  const plannedCount = integerInRange(
    data.plannedCount,
    0,
    100_000,
    EMPTY_ACTIVE_SESSION.plannedCount
  );
  const questionStartedAt = nullableFiniteNumber(
    data.questionStartedAt,
    EMPTY_ACTIVE_SESSION.questionStartedAt
  );
  const pendingTimeSpent = nullableFiniteNumber(
    data.pendingTimeSpent,
    EMPTY_ACTIVE_SESSION.pendingTimeSpent
  );

  return {
    sessionId,
    plannedCount,
    questionStartedAt:
      questionStartedAt !== null && questionStartedAt >= 0 ? questionStartedAt : null,
    mode: enumValue(data.mode, SESSION_MODE_VALUES, EMPTY_ACTIVE_SESSION.mode),
    pendingTimeSpent: pendingTimeSpent !== null && pendingTimeSpent >= 0 ? pendingTimeSpent : null
  };
}

function normalizeEditorDraft(value: unknown): EditorDraft | null {
  if (!isRecord(value)) return null;

  const fallbackDate = todayISO();
  const sourceSet = value.sourceSet === 1 || value.sourceSet === 2 ? value.sourceSet : null;
  const marks = nullableFiniteNumber(value.marks);
  const timeSpentSec =
    isFiniteNumber(value.timeSpentSec) && value.timeSpentSec >= 0 ? value.timeSpentSec : 0;

  return {
    subject: typeof value.subject === 'string' ? value.subject : '',
    subtopic: nullableString(value.subtopic),
    sourceKind: enumValue(value.sourceKind, SOURCE_KIND_VALUES, 'pyq'),
    sourceYear:
      Number.isInteger(value.sourceYear) &&
      (value.sourceYear as number) >= 1900 &&
      (value.sourceYear as number) <= 3000
        ? (value.sourceYear as number)
        : null,
    sourceSet,
    questionNumber: nullableString(value.questionNumber),
    format: nullableEnumValue(value.format, QUESTION_FORMAT_VALUES),
    marks: marks !== null && marks > 0 ? marks : null,
    questionText: nullableString(value.questionText),
    answerText: nullableString(value.answerText),
    imageDataUrl: nullableString(value.imageDataUrl),
    outcome: enumValue(value.outcome, OUTCOME_VALUES, 'R'),
    patternName: nullableString(value.patternName),
    triggerSentence: nullableString(value.triggerSentence),
    rootCause: nullableEnumValue(value.rootCause, ROOT_CAUSE_VALUES),
    markDecision: nullableEnumValue(value.markDecision, MARK_DECISION_VALUES),
    markCorrect: nullableBoolean(value.markCorrect),
    timeSpentSec,
    createdDate: isoDate(value.createdDate, fallbackDate)
  };
}

function normalizeLogDraft(payload: unknown): LogDraftSnapshot {
  const data = payloadData(payload);
  const startedAt = nullableFiniteNumber(data.startedAt);
  return {
    mode: enumValue(data.mode, LOG_MODE_VALUES, EMPTY_LOG_DRAFT.mode),
    sessionId: nullableString(data.sessionId),
    startedAt: startedAt !== null && startedAt >= 0 ? startedAt : null,
    loggedCount: integerInRange(data.loggedCount, 0, 1_000_000, 0),
    draft: data.draft === null ? null : normalizeEditorDraft(data.draft)
  };
}

/** Parse only known fields and replace missing/invalid values with safe defaults. */
export function normalizeAccountStatePayload<N extends AccountStateNamespace>(
  namespace: N,
  payload: unknown
): AccountStateDataByNamespace[N] {
  switch (namespace) {
    case 'preferences':
      return normalizePreferences(payload) as AccountStateDataByNamespace[N];
    case 'active_session':
      return normalizeActiveSession(payload) as AccountStateDataByNamespace[N];
    case 'log_draft':
      return normalizeLogDraft(payload) as AccountStateDataByNamespace[N];
  }
}

function preferencesSnapshot(): Preferences {
  const state = usePrefsStore.getState();
  return {
    dailyQuestionTarget: state.dailyQuestionTarget,
    weeklySessionTarget: state.weeklySessionTarget,
    weeklyReviewDay: state.weeklyReviewDay,
    defaultSubject: state.defaultSubject,
    defaultSubjectId: state.defaultSubjectId,
    defaultDurationMin: state.defaultDurationMin,
    defaultQuestionCount: state.defaultQuestionCount,
    colorTheme: state.colorTheme,
    compactRows: state.compactRows,
    showCountdown: state.showCountdown,
    fontScale: state.fontScale,
    hapticsEnabled: state.hapticsEnabled,
    backupReminderDays: state.backupReminderDays,
    lastBackupAt: state.lastBackupAt
  };
}

function activeSessionSnapshot(): ActiveSessionSnapshot {
  const state = useSessionStore.getState();
  return {
    sessionId: state.sessionId,
    plannedCount: state.plannedCount,
    questionStartedAt: state.questionStartedAt,
    mode: state.mode,
    pendingTimeSpent: state.pendingTimeSpent
  };
}

function editorDraftSnapshot(draft: EditorDraft | null): EditorDraft | null {
  return draft ? { ...draft } : null;
}

function logDraftSnapshot(): LogDraftSnapshot {
  const state = useLogStore.getState();
  return {
    mode: state.mode,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    loggedCount: state.loggedCount,
    draft: editorDraftSnapshot(state.draft)
  };
}

function currentData<N extends AccountStateNamespace>(
  namespace: N
): AccountStateDataByNamespace[N] {
  switch (namespace) {
    case 'preferences':
      return preferencesSnapshot() as AccountStateDataByNamespace[N];
    case 'active_session':
      return activeSessionSnapshot() as AccountStateDataByNamespace[N];
    case 'log_draft':
      return logDraftSnapshot() as AccountStateDataByNamespace[N];
  }
}

/** Build the exact JSON document written for a namespace (never includes store actions). */
export function accountStatePayload<N extends AccountStateNamespace>(
  namespace: N
): AccountStatePayload<AccountStateDataByNamespace[N]> {
  return {
    schemaVersion: ACCOUNT_STATE_SCHEMA_VERSION,
    data: currentData(namespace)
  };
}

function fingerprint(payload: AnyAccountStatePayload): string {
  return JSON.stringify(payload);
}

function hydrateNamespace(namespace: AccountStateNamespace, payload: unknown): void {
  switch (namespace) {
    case 'preferences':
      usePrefsStore.setState(normalizeAccountStatePayload(namespace, payload));
      return;
    case 'active_session':
      useSessionStore.setState(normalizeAccountStatePayload(namespace, payload));
      return;
    case 'log_draft':
      useLogStore.setState(normalizeAccountStatePayload(namespace, payload));
      return;
  }
}

function writerFor(userId: string): AccountStateWriter {
  const existing = writers.get(userId);
  if (existing) return existing;
  const writer: AccountStateWriter = {
    userId,
    nextRevision: 0,
    pending: new Map(),
    failedRevisions: new Map(),
    lastError: null,
    running: null
  };
  writers.set(userId, writer);
  return writer;
}

function runtimeFor(userId: string): AccountStateRuntime {
  const existing = runtimes.get(userId);
  if (existing) return existing;
  const runtime: AccountStateRuntime = {
    generation: 0,
    status: 'idle',
    bootstrap: null,
    unsubscribers: []
  };
  runtimes.set(userId, runtime);
  return runtime;
}

function errorFrom(value: unknown): Error {
  if (value instanceof Error) return value;
  if (isRecord(value) && typeof value.message === 'string') return new Error(value.message);
  return new Error('Unable to persist account state.');
}

function mayWriteForUser(userId: string): boolean {
  const auth = useAuthStore.getState();
  if (auth.sandbox || auth.status === 'signed_out') return false;
  return !auth.user || auth.user.id === userId;
}

function nextWritable(writer: AccountStateWriter): [AccountStateNamespace, PendingWrite] | null {
  for (const namespace of ACCOUNT_STATE_NAMESPACES) {
    const pending = writer.pending.get(namespace);
    if (pending && writer.failedRevisions.get(namespace) !== pending.revision) {
      return [namespace, pending];
    }
  }
  return null;
}

async function drainWriter(writer: AccountStateWriter): Promise<void> {
  let candidate = nextWritable(writer);
  while (candidate) {
    const [namespace, attempted] = candidate;
    try {
      const { error } = await supabase.from('account_state').upsert(
        {
          user_id: writer.userId,
          namespace,
          payload: attempted.payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,namespace' }
      );
      if (error) throw error;

      const latest = writer.pending.get(namespace);
      if (latest?.revision === attempted.revision) {
        writer.pending.delete(namespace);
        clearPersistedPendingWrite(writer.userId, namespace);
      }
      writer.failedRevisions.delete(namespace);
      if (writer.pending.size === 0) writer.lastError = null;
    } catch (error) {
      writer.lastError = errorFrom(error);
      const latest = writer.pending.get(namespace);
      if (latest?.revision === attempted.revision) {
        writer.failedRevisions.set(namespace, attempted.revision);
      }
    }
    candidate = nextWritable(writer);
  }
}

function startWriter(writer: AccountStateWriter): Promise<void> {
  if (writer.running) return writer.running;
  const running = drainWriter(writer);
  writer.running = running;
  void running.finally(() => {
    if (writer.running !== running) return;
    writer.running = null;
    if (nextWritable(writer)) void startWriter(writer);
  });
  return running;
}

function enqueueWrite(
  userId: string,
  namespace: AccountStateNamespace,
  payload: AnyAccountStatePayload,
  startImmediately = true
): void {
  const writer = writerFor(userId);
  const nextFingerprint = fingerprint(payload);
  const existing = writer.pending.get(namespace);
  if (existing?.fingerprint === nextFingerprint) return;

  writer.nextRevision += 1;
  writer.pending.set(namespace, {
    payload,
    fingerprint: nextFingerprint,
    revision: writer.nextRevision
  });
  persistPendingWrite(userId, namespace, payload);
  writer.failedRevisions.delete(namespace);
  if (startImmediately && mayWriteForUser(userId)) void startWriter(writer);
}

function restorePersistedPendingWrites(userId: string): void {
  for (const namespace of ACCOUNT_STATE_NAMESPACES) {
    try {
      const raw = localStorage.getItem(pendingStorageKey(userId, namespace));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      const data = normalizeAccountStatePayload(namespace, parsed);
      const payload = {
        schemaVersion: ACCOUNT_STATE_SCHEMA_VERSION,
        data
      } as AnyAccountStatePayload;
      enqueueWrite(userId, namespace, payload, false);
    } catch {
      // Leave malformed legacy state untouched; normal bootstrap remains safe.
    }
  }
}

/** True while at least one latest namespace payload has not reached Supabase. */
export function hasPendingAccountStateWrites(userId: string): boolean {
  if ((writers.get(userId)?.pending.size ?? 0) > 0) return true;
  try {
    return ACCOUNT_STATE_NAMESPACES.some((namespace) =>
      Boolean(localStorage.getItem(pendingStorageKey(userId, namespace)))
    );
  } catch {
    return false;
  }
}

/** Retry every failed namespace and wait until the current coalesced writer stops. */
export async function flushAccountStateWrites(userId: string): Promise<void> {
  const runtime = runtimes.get(userId);
  if (runtime?.bootstrap) await runtime.bootstrap;
  restorePersistedPendingWrites(userId);
  const writer = writers.get(userId);
  if (!writer || writer.pending.size === 0) return;
  if (writer.running) await writer.running;
  if (writer.pending.size === 0) return;
  writer.failedRevisions.clear();
  await startWriter(writer);
  if (writer.pending.size > 0) {
    throw writer.lastError ?? new Error('Some account state is still waiting to be saved.');
  }
}

export const retryAccountStateWrites = flushAccountStateWrites;

function removeSubscriptions(runtime: AccountStateRuntime): void {
  for (const unsubscribe of runtime.unsubscribers.splice(0)) unsubscribe();
}

function installSubscriptions(userId: string, generation: number): void {
  const runtime = runtimeFor(userId);
  if (runtime.generation !== generation) return;
  removeSubscriptions(runtime);

  const subscribe = (
    namespace: AccountStateNamespace,
    register: (listener: () => void) => () => void
  ) => {
    let previous = fingerprint(accountStatePayload(namespace) as AnyAccountStatePayload);
    runtime.unsubscribers.push(
      register(() => {
        if (runtime.generation !== generation || !mayWriteForUser(userId)) return;
        const payload = accountStatePayload(namespace) as AnyAccountStatePayload;
        const next = fingerprint(payload);
        if (next === previous) return;
        previous = next;
        enqueueWrite(userId, namespace, payload);
      })
    );
  };

  subscribe('preferences', (listener) => usePrefsStore.subscribe(listener));
  subscribe('active_session', (listener) => useSessionStore.subscribe(listener));
  subscribe('log_draft', (listener) => useLogStore.subscribe(listener));
}

async function waitForLocalHydration(): Promise<void> {
  const waitFor = (persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  }): Promise<void> => {
    if (persist.hasHydrated()) return Promise.resolve();
    return new Promise((resolve) => {
      const unsubscribe = persist.onFinishHydration(() => {
        unsubscribe();
        resolve();
      });
    });
  };

  await Promise.all([
    waitFor(usePrefsStore.persist),
    waitFor(useSessionStore.persist),
    waitFor(useLogStore.persist)
  ]);
}

async function bootstrapAccountState(userId: string, generation: number): Promise<void> {
  const runtime = runtimeFor(userId);
  await waitForLocalHydration();
  if (runtime.generation !== generation) return;

  // A failed latest payload survives a hard reload independently of the
  // ordinary UI cache. It must win over the older remote row until confirmed.
  restorePersistedPendingWrites(userId);

  const beforeFetch = new Map<AccountStateNamespace, string>(
    ACCOUNT_STATE_NAMESPACES.map((namespace) => [
      namespace,
      fingerprint(accountStatePayload(namespace) as AnyAccountStatePayload)
    ])
  );

  const { data, error } = await supabase
    .from('account_state')
    .select('namespace,payload')
    .eq('user_id', userId)
    .in('namespace', [...ACCOUNT_STATE_NAMESPACES]);

  if (runtime.generation !== generation) return;

  if (error) {
    // A transport/auth failure is never interpreted as an empty account. Keep
    // the local cache visible and subscribe so edits made while offline enter
    // the retry queue rather than disappearing.
    runtime.status = 'error';
    for (const namespace of ACCOUNT_STATE_NAMESPACES) {
      const current = accountStatePayload(namespace) as AnyAccountStatePayload;
      if (fingerprint(current) !== beforeFetch.get(namespace)) {
        enqueueWrite(userId, namespace, current, false);
      }
    }
    installSubscriptions(userId, generation);
    throw errorFrom(error);
  }

  const remote = new Map<AccountStateNamespace, unknown>();
  for (const row of (data ?? []) as AccountStateRow[]) {
    if (ACCOUNT_STATE_NAMESPACES.includes(row.namespace as AccountStateNamespace)) {
      remote.set(row.namespace as AccountStateNamespace, row.payload);
    }
  }

  const writer = writerFor(userId);
  for (const namespace of ACCOUNT_STATE_NAMESPACES) {
    const current = accountStatePayload(namespace) as AnyAccountStatePayload;
    const changedDuringFetch = fingerprint(current) !== beforeFetch.get(namespace);
    const pending = writer.pending.get(namespace);

    if (pending) {
      // A known unacknowledged edit is newer than the fetched row. Reapply it
      // locally (logout may have wiped the cache) and keep it queued.
      hydrateNamespace(namespace, pending.payload);
    } else if (changedDuringFetch) {
      // Do not erase an edit made while the request was in flight.
      enqueueWrite(userId, namespace, current, false);
    } else if (remote.has(namespace)) {
      // The database is authoritative after login when no newer local edit is
      // known. Hydration happens before subscriptions to avoid echo writes.
      hydrateNamespace(namespace, remote.get(namespace));
    } else {
      // First login after this feature ships: migrate the already hydrated
      // Zustand cache into the new account row without changing the UI state.
      enqueueWrite(userId, namespace, current, false);
    }
  }

  runtime.status = 'ready';
  installSubscriptions(userId, generation);
  if (writer.pending.size > 0 && mayWriteForUser(userId)) void startWriter(writer);
}

/** Load authoritative account rows, migrate missing rows, then begin mirroring. */
export function startAccountStateSync(userId: string): Promise<void> {
  const runtime = runtimeFor(userId);
  runtime.generation += 1;
  const generation = runtime.generation;
  runtime.status = 'loading';
  removeSubscriptions(runtime);

  const bootstrap = bootstrapAccountState(userId, generation).finally(() => {
    if (runtime.generation === generation) runtime.bootstrap = null;
  });
  runtime.bootstrap = bootstrap;
  return bootstrap;
}

/** Stop store listeners without discarding failed writes for a later login. */
export function stopAccountStateSync(userId: string): void {
  const runtime = runtimes.get(userId);
  if (!runtime) return;
  runtime.generation += 1;
  runtime.status = 'idle';
  runtime.bootstrap = null;
  removeSubscriptions(runtime);
}

/** Retry bootstrap after a load error, otherwise retry pending writes. */
export async function retryAccountStateSync(userId: string): Promise<void> {
  const runtime = runtimeFor(userId);
  if (runtime.status === 'loading' && runtime.bootstrap) return runtime.bootstrap;
  if (runtime.status !== 'ready') return startAccountStateSync(userId);
  return flushAccountStateWrites(userId);
}
