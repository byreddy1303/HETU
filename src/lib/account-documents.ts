import { supabase } from '@/lib/supabase';

export const ACCOUNT_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const ACCOUNT_DOCUMENT_NAMESPACES = ['topper_notes', 'readiness_watchlist'] as const;

export type AccountDocumentNamespace = (typeof ACCOUNT_DOCUMENT_NAMESPACES)[number];

export interface AccountDocumentPayload<T> {
  schemaVersion: typeof ACCOUNT_DOCUMENT_SCHEMA_VERSION;
  data: T;
  updatedAt: string;
}

export type AccountDocumentSource = 'database' | 'pending' | 'cache' | 'legacy' | 'absent';

export interface AccountDocumentLoadOptions<T> {
  /** Convert untrusted database/cache JSON into the page's canonical shape. */
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

function cacheStorageKey(userId: string, namespace: AccountDocumentNamespace): string {
  return `air.account-document-cache.${userId}.${namespace}`;
}

function pendingStorageKey(userId: string, namespace: AccountDocumentNamespace): string {
  return `air.account-document-pending.${userId}.${namespace}`;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The in-memory queue still owns the latest edit for this session. The
    // database request starts immediately, so storage-unavailable browsers can
    // still complete the write while online.
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // A server-acknowledged write is already durable. A stale marker can be
    // retried idempotently because the database key is (user_id, namespace).
  }
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

function readPayload(key: string): AccountDocumentPayload<unknown> | null {
  const raw = readStorage(key);
  if (!raw) return null;
  try {
    return parsePayload(JSON.parse(raw));
  } catch {
    return null;
  }
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

function persistPayload(
  userId: string,
  namespace: AccountDocumentNamespace,
  payload: AccountDocumentPayload<unknown>
): void {
  const encoded = JSON.stringify(payload);
  writeStorage(cacheStorageKey(userId, namespace), encoded);
  writeStorage(pendingStorageKey(userId, namespace), encoded);
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
  persistPayload(userId, namespace, payload);
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
        removeStorage(pendingStorageKey(userId, namespace));
      }
      writer.failedRevisions.delete(namespace);
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

function restorePersistedPendingWrites(userId: string): string | null {
  let firstError: string | null = null;
  for (const namespace of ACCOUNT_DOCUMENT_NAMESPACES) {
    const raw = readStorage(pendingStorageKey(userId, namespace));
    if (!raw) continue;
    try {
      const payload = parsePayload(JSON.parse(raw));
      if (!payload) {
        firstError ??= `Pending ${namespace} data is invalid and was not discarded.`;
        continue;
      }
      enqueuePayload(userId, namespace, payload, false);
    } catch {
      firstError ??= `Pending ${namespace} data is invalid and was not discarded.`;
    }
  }
  return firstError;
}

function cachedResult<T>(
  userId: string,
  namespace: AccountDocumentNamespace,
  options: AccountDocumentLoadOptions<T>,
  error: string
): AccountDocumentLoadResult<T> {
  const cached = readPayload(cacheStorageKey(userId, namespace));
  if (cached) {
    return { data: options.normalize(cached.data), source: 'cache', error };
  }
  if (options.legacyData != null) {
    return { data: options.normalize(options.legacyData), source: 'legacy', error };
  }
  return { data: null, source: 'absent', error };
}

function pendingLoadResult<T>(
  userId: string,
  namespace: AccountDocumentNamespace,
  options: AccountDocumentLoadOptions<T>
): AccountDocumentLoadResult<T> | null {
  const pending = readPayload(pendingStorageKey(userId, namespace));
  if (!pending) return null;

  const canonical: AccountDocumentPayload<T> = {
    ...pending,
    data: options.normalize(pending.data)
  };
  const writer = enqueuePayload(userId, namespace, canonical, false);
  // Opening the owning page is itself a useful retry opportunity. A matching
  // in-memory failure from earlier in this runtime must not suppress it.
  writer.failedRevisions.delete(namespace);
  void startWriter(userId, writer);
  writeStorage(cacheStorageKey(userId, namespace), JSON.stringify(canonical));
  return { data: canonical.data, source: 'pending', error: null };
}

/**
 * Load a user document. Supabase wins over an ordinary local cache. The only
 * exception is an explicitly persisted pending edit, which is newer by
 * definition and is retried immediately. An absent row migrates an existing
 * legacy local document without treating a network error as absence.
 */
export async function loadAccountDocument<T>(
  userId: string,
  namespace: AccountDocumentNamespace,
  options: AccountDocumentLoadOptions<T>
): Promise<AccountDocumentLoadResult<T>> {
  const pending = pendingLoadResult(userId, namespace, options);
  if (pending) return pending;

  const writer = writerFor(userId);
  const revisionAtStart = writer.nextRevision;

  let row: AccountDocumentRow | null = null;
  try {
    const { data, error } = await supabase
      .from('account_state')
      .select('payload')
      .eq('user_id', userId)
      .eq('namespace', namespace)
      .maybeSingle();
    if (error) {
      return cachedResult(userId, namespace, options, error.message);
    }
    row = data as AccountDocumentRow | null;
  } catch (error) {
    return cachedResult(userId, namespace, options, errorMessage(error));
  }

  // Do not let a response that began before a user edit overwrite that edit.
  const pendingAfterLoad = pendingLoadResult(userId, namespace, options);
  if (pendingAfterLoad) return pendingAfterLoad;
  if (writer.nextRevision !== revisionAtStart) {
    const cached = readPayload(cacheStorageKey(userId, namespace));
    if (cached) {
      return { data: options.normalize(cached.data), source: 'cache', error: null };
    }
  }

  if (row) {
    const remote = parsePayload(row.payload);
    if (!remote) {
      return {
        data: options.normalize(isRecord(row.payload) ? row.payload.data : undefined),
        source: 'database',
        error: 'The database document had an invalid versioned payload and was normalized safely.'
      };
    }
    const canonical: AccountDocumentPayload<T> = {
      ...remote,
      data: options.normalize(remote.data)
    };
    writeStorage(cacheStorageKey(userId, namespace), JSON.stringify(canonical));
    return { data: canonical.data, source: 'database', error: null };
  }

  // A successful maybeSingle with no row is the only case that triggers the
  // legacy migration. A request error above leaves the legacy cache untouched.
  if (options.legacyData != null) {
    const legacy = options.normalize(options.legacyData);
    const error = await queueAccountDocumentWrite(userId, namespace, legacy);
    return { data: legacy, source: 'legacy', error };
  }

  removeStorage(cacheStorageKey(userId, namespace));
  return { data: null, source: 'absent', error: null };
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
 * Retry every persisted or in-memory document once. This discovers pending
 * markers even after a hard reload and does not require the owning page to be
 * mounted, which makes it suitable for an auth logout barrier.
 */
export async function flushAccountDocumentWrites(userId: string): Promise<string | null> {
  const restoreError = restorePersistedPendingWrites(userId);
  const writer = writers.get(userId);
  if (!writer) return restoreError;

  if (writer.active) await writer.active;
  for (const namespace of writer.pending.keys()) writer.failedRevisions.delete(namespace);

  const syncError = writer.pending.size > 0 ? await startWriter(userId, writer) : null;
  return restoreError ?? syncError;
}

/** Includes in-flight writes and user-scoped markers restored after reload. */
export function hasPendingAccountDocumentWrites(userId: string): boolean {
  const writer = writers.get(userId);
  if (writer && (writer.active !== null || writer.pending.size > 0)) return true;
  return ACCOUNT_DOCUMENT_NAMESPACES.some(
    (namespace) => readStorage(pendingStorageKey(userId, namespace)) !== null
  );
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
