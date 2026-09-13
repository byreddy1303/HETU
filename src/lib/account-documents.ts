import { supabase } from '@/lib/supabase';
import { broadcastSyncMutation } from '@/lib/sync';

export const ACCOUNT_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const ACCOUNT_DOCUMENT_NAMESPACES = ['topper_notes', 'readiness_watchlist'] as const;

export type AccountDocumentNamespace = (typeof ACCOUNT_DOCUMENT_NAMESPACES)[number];

export interface AccountDocumentPayload<T> {
  schemaVersion: typeof ACCOUNT_DOCUMENT_SCHEMA_VERSION;
  data: T;
  updatedAt: string;
}

export type AccountDocumentSource = 'database' | 'pending' | 'legacy' | 'absent';

export interface AccountDocumentLoadOptions<T> {
  /** Convert untrusted JSON into the page's canonical shape. */
  normalize: (value: unknown) => T;
  /** Supplied only when an older, user-scoped local document actually exists. */
  legacyData?: T | null;
}

export interface AccountDocumentLoadResult<T> {
  data: T | null;
  source: AccountDocumentSource;
  error: string | null;
}

interface AccountDocumentRow {
  payload: unknown;
}

interface PendingDocumentWrite {
  payload: AccountDocumentPayload<unknown>;
  fingerprint: string;
  revision: number;
}

interface DocumentWriter {
  nextRevision: number;
  pending: Map<AccountDocumentNamespace, PendingDocumentWrite>;
  failedRevisions: Map<AccountDocumentNamespace, number>;
  active: Promise<string | null> | null;
}

export interface ReferenceProgress {
  revisedIds: string[];
  lastOpenedId: string | null;
}

const writers = new Map<string, DocumentWriter>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return 'Account document database sync failed.';
}

function parsePayload(raw: unknown): AccountDocumentPayload<unknown> | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== ACCOUNT_DOCUMENT_SCHEMA_VERSION) return null;
  if (!Object.prototype.hasOwnProperty.call(raw, 'data')) return null;
  if (typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt))) {
    return null;
  }
  return {
    schemaVersion: ACCOUNT_DOCUMENT_SCHEMA_VERSION,
    data: raw.data,
    updatedAt: raw.updatedAt
  };
}

function cloneJson<T>(value: T): T {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Account document data must be JSON serializable.');
  return JSON.parse(encoded) as T;
}

function createPayload<T>(data: T): AccountDocumentPayload<T> {
  return {
    schemaVersion: ACCOUNT_DOCUMENT_SCHEMA_VERSION,
    data: cloneJson(data),
    updatedAt: new Date().toISOString()
  };
}

function writerFor(userId: string): DocumentWriter {
  const current = writers.get(userId);
  if (current) return current;
  const created: DocumentWriter = {
    nextRevision: 0,
    pending: new Map(),
    failedRevisions: new Map(),
    active: null
  };
  writers.set(userId, created);
  return created;
}

function enqueuePayload(
  userId: string,
  namespace: AccountDocumentNamespace,
  payload: AccountDocumentPayload<unknown>,
  startImmediately: boolean
): DocumentWriter {
  const writer = writerFor(userId);
  const fingerprint = JSON.stringify(payload);
  const current = writer.pending.get(namespace);
  if (current?.fingerprint === fingerprint) {
    if (startImmediately) void startWriter(userId, writer);
    return writer;
  }

  writer.nextRevision += 1;
  writer.pending.set(namespace, {
    payload,
    fingerprint,
    revision: writer.nextRevision
  });
  writer.failedRevisions.delete(namespace);
  if (startImmediately) void startWriter(userId, writer);
  return writer;
}

function nextWritable(
  writer: DocumentWriter
): [AccountDocumentNamespace, PendingDocumentWrite] | null {
  for (const namespace of ACCOUNT_DOCUMENT_NAMESPACES) {
    const pending = writer.pending.get(namespace);
    if (pending && writer.failedRevisions.get(namespace) !== pending.revision) {
      return [namespace, pending];
    }
  }
  return null;
}

async function drainWriter(userId: string, writer: DocumentWriter): Promise<string | null> {
  let firstError: string | null = null;
  let next = nextWritable(writer);

  while (next) {
    const [namespace, attempted] = next;
    try {
      const { error } = await supabase.from('account_state').upsert(
        {
          user_id: userId,
          namespace,
          payload: attempted.payload,
          updated_at: attempted.payload.updatedAt
        },
        { onConflict: 'user_id,namespace' }
      );
      if (error) throw error;

      const latest = writer.pending.get(namespace);
      if (latest?.revision === attempted.revision) {
        writer.pending.delete(namespace);
      }
      writer.failedRevisions.delete(namespace);
      broadcastSyncMutation(userId, ['account_state']);
    } catch (error) {
      firstError ??= errorMessage(error);
      const latest = writer.pending.get(namespace);
      if (latest?.revision === attempted.revision) {
        writer.failedRevisions.set(namespace, attempted.revision);
      }
    }
    next = nextWritable(writer);
  }

  return firstError;
}

function startWriter(userId: string, writer: DocumentWriter): Promise<string | null> {
  if (writer.active) return writer.active;

  const active = drainWriter(userId, writer);
  writer.active = active;
  void active.finally(() => {
    if (writer.active !== active) return;
    writer.active = null;
    // A replacement may have arrived after the drain selected its final item.
    // Failed revisions are deliberately excluded so an offline request cannot
    // create a tight retry loop.
    if (nextWritable(writer)) void startWriter(userId, writer);
  });
  return active;
}

function pendingLoadResult<T>(
  userId: string,
  namespace: AccountDocumentNamespace,
  options: AccountDocumentLoadOptions<T>
): AccountDocumentLoadResult<T> | null {
  const writer = writerFor(userId);
  const pending = writer.pending.get(namespace);
  if (!pending) return null;

  const canonical: AccountDocumentPayload<T> = {
    ...pending.payload,
    data: options.normalize(pending.payload.data)
  };
  // Opening the owning page is itself a useful retry opportunity. A matching
  // in-memory failure from earlier in this runtime must not suppress it.
  writer.failedRevisions.delete(namespace);
  void startWriter(userId, writer);
  return { data: canonical.data, source: 'pending', error: null };
}

/**
 * Load a user document. Supabase is the source of truth. The only override is
 * an in-memory pending edit, which is newer by definition and is retried
 * immediately. An absent row migrates an existing legacy local document
 * without ever treating a network error as absence.
 */
export async function loadAccountDocument<T>(
  userId: string,
  namespace: AccountDocumentNamespace,
  options: AccountDocumentLoadOptions<T>
): Promise<AccountDocumentLoadResult<T>> {
  const pending = pendingLoadResult(userId, namespace, options);
  if (pending) return pending;

  let row: AccountDocumentRow | null = null;
  try {
    const { data, error } = await supabase
      .from('account_state')
      .select('payload')
      .eq('user_id', userId)
      .eq('namespace', namespace)
      .maybeSingle();
    if (error) {
      return fallbackLoadResult(userId, namespace, options, error.message);
    }
    row = data as AccountDocumentRow | null;
  } catch (error) {
    return fallbackLoadResult(userId, namespace, options, errorMessage(error));
  }

  // Do not let a response that began before a user edit overwrite that edit.
  const pendingAfterLoad = pendingLoadResult(userId, namespace, options);
  if (pendingAfterLoad) return pendingAfterLoad;

  if (row) {
    const remote = parsePayload(row.payload);
    if (!remote) {
      return {
        data: options.normalize(isRecord(row.payload) ? row.payload.data : undefined),
        source: 'database',
        error: 'The database document had an invalid versioned payload and was normalized safely.'
      };
    }
    return { data: options.normalize(remote.data), source: 'database', error: null };
  }

  // A successful maybeSingle with no row is the only case that triggers the
  // legacy migration. A request error above leaves the legacy cache untouched.
  if (options.legacyData != null) {
    const legacy = options.normalize(options.legacyData);
    const error = await queueAccountDocumentWrite(userId, namespace, legacy);
    return { data: legacy, source: 'legacy', error };
  }

  return { data: null, source: 'absent', error: null };
}

function fallbackLoadResult<T>(
  userId: string,
  namespace: AccountDocumentNamespace,
  options: AccountDocumentLoadOptions<T>,
  error: string
): AccountDocumentLoadResult<T> {
  const pending = pendingLoadResult(userId, namespace, options);
  if (pending) return pending;
  if (options.legacyData != null) {
    return { data: options.normalize(options.legacyData), source: 'legacy', error };
  }
  return { data: null, source: 'absent', error };
}

/** Queue the newest JSON snapshot and start its database upsert immediately. */
export function queueAccountDocumentWrite<T>(
  userId: string,
  namespace: AccountDocumentNamespace,
  data: T
): Promise<string | null> {
  const writer = enqueuePayload(userId, namespace, createPayload(data), false);
  return startWriter(userId, writer);
}

/**
 * Retry every failed document once. This does not require the owning page to
 * be mounted, which makes it suitable for an auth logout barrier.
 */
export async function flushAccountDocumentWrites(userId: string): Promise<string | null> {
  const writer = writers.get(userId);
  if (!writer) return null;

  if (writer.active) await writer.active;
  for (const namespace of writer.pending.keys()) writer.failedRevisions.delete(namespace);

  return writer.pending.size > 0 ? startWriter(userId, writer) : null;
}

/** Includes in-flight writes queued this session. */
export function hasPendingAccountDocumentWrites(userId: string): boolean {
  const writer = writers.get(userId);
  return Boolean(writer && (writer.active !== null || writer.pending.size > 0));
}

/** Canonicalize a manifest-backed revision/opened document from untrusted JSON. */
export function normalizeReferenceProgress(
  value: unknown,
  validIds: ReadonlySet<string>
): ReferenceProgress {
  const source = isRecord(value) ? value : {};
  const revisedIds: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(source.revisedIds)) {
    for (const id of source.revisedIds) {
      if (typeof id !== 'string' || !validIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      revisedIds.push(id);
    }
  }

  const lastOpenedId =
    typeof source.lastOpenedId === 'string' && validIds.has(source.lastOpenedId)
      ? source.lastOpenedId
      : null;
  return { revisedIds, lastOpenedId };
}