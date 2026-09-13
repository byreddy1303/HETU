// Online-only data facade.
//
// The old local-first engine (background push queue, pending/outbox rows,
// pull-merge conflict repair, infinite initial-pull retries) is gone. Postgres
// is the single source of truth: writes go straight to the database through
// the db layer, and this module only keeps the repository warm for the signed
// in user (hydrate on login, refresh on focus / realtime / retry).
import {
  clearLocalData,
  consumeLocalWrite,
  hydrateAll,
  hydrateTables,
  table
} from '@/lib/db';
import { SYNCED_TABLES } from '@/lib/db';
import type { SyncedTableName } from '@/lib/db';
import { supabase, supabaseConfigured } from '@/lib/supabase';

export const clientDeviceId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

let syncEnabled = false;
let currentUserId: string | null = null;
let hydrateChain: Promise<void> | null = null;
let hydrateForUserId: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const initialPullListeners = new Set<() => void>();

function notifyInitialPullChange(): void {
  initialPullListeners.forEach((listener) => listener());
}

export function subscribeInitialPull(listener: () => void): () => void {
  initialPullListeners.add(listener);
  return () => {
    initialPullListeners.delete(listener);
  };
}

export function isInitialPullActive(): boolean {
  return hydrateChain !== null && hydrateForUserId !== null;
}

let syncChannel: ReturnType<typeof supabase.channel> | null = null;

/** Map a realtime payload table to a RAM-backed synced table, or null. */
function syncedTable(target: string | undefined): SyncedTableName | null {
  if (!target || !(SYNCED_TABLES as readonly string[]).includes(target)) return null;
  return target as SyncedTableName;
}

function setupRealtimeChannel(userId: string): void {
  if (!supabaseConfigured || typeof supabase.channel !== 'function') return;
  if (syncChannel && typeof supabase.removeChannel === 'function') {
    void supabase.removeChannel(syncChannel);
    syncChannel = null;
  }
  syncChannel = supabase.channel(`user-sync:${userId}`);
  syncChannel
    .on('broadcast', { event: 'sync_mutation' }, (payload) => {
      const data = payload.payload as { sourceDeviceId?: string; tables?: string[] } | undefined;
      if (data?.sourceDeviceId === clientDeviceId) return;
      const tables = data?.tables
        ?.map((item) => syncedTable(item))
        .filter((item): item is SyncedTableName => item !== null);
      scheduleRefresh(userId, tables);
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public' },
      (payload) => {
        const name = syncedTable(payload.table);
        if (!name) return;
        const row = (payload.new || payload.old) as { id?: string; user_id?: string } | undefined;
        if (!row?.user_id) return;
        // A change authored by this device was already applied to the RAM cache
        // by the write path. Refreshing again would re-download the whole
        // account (attempts/questions carry multi-hundred-KB screenshots) on
        // every single tap, so skip our own echo unless new facts exist.
        if (row.user_id === userId && row.id && consumeLocalWrite(name, row.id)) return;
        scheduleRefresh(userId, [name]);
      }
    )
    .subscribe();
}

function teardownChannel(): void {
  if (syncChannel && typeof supabase.removeChannel === 'function') {
    void supabase.removeChannel(syncChannel);
  }
  syncChannel = null;
}

function startHydrate(userId: string, tables?: readonly SyncedTableName[]): Promise<void> {
  hydrateForUserId = userId;
  notifyInitialPullChange();
  const operation = (tables && tables.length > 0 ? hydrateTables(userId, tables) : hydrateAll(userId))
    .catch((error) => {
      // A hydration failure must never hang a barrier: the app keeps the last
      // in-memory snapshot and surfaces the error to the logs.
      console.warn('[sync] initial hydrate failed; keeping current cache.', error);
    })
    .finally(() => {
      if (hydrateForUserId === userId) {
        hydrateForUserId = null;
        notifyInitialPullChange();
      }
    });
  hydrateChain = operation;
  return operation;
}

/** Coalesce refreshes so a burst of writes triggers at most one re-pull. */
let pendingRefreshTables: Set<SyncedTableName> | null = null;

function scheduleRefresh(userId: string, tables?: readonly SyncedTableName[]): void {
  if (currentUserId !== userId) return;
  if (tables && tables.length > 0) {
    pendingRefreshTables ??= new Set();
    for (const item of tables) pendingRefreshTables.add(item);
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (currentUserId !== userId) return;
    const names = pendingRefreshTables ? [...pendingRefreshTables] : undefined;
    pendingRefreshTables = null;
    void startHydrate(userId, names);
  }, 350);
}

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

/** Start the repository for a signed-in user. Idempotent per user. */
export function initSync(userId: string): void {
  if (!supabaseConfigured) return;
  if (currentUserId !== userId) {
    teardownChannel();
    currentUserId = userId;
    syncEnabled = true;
    setupRealtimeChannel(userId);
  }
  if (hydrateChain && hydrateForUserId === userId) return;
  void startHydrate(userId);
}

export function stopSync(): void {
  currentUserId = null;
  syncEnabled = false;
  teardownChannel();
  clearTimeout(refreshTimer);
  pendingRefreshTables = null;
  hydrateChain = null;
  hydrateForUserId = null;
  notifyInitialPullChange();
  // Drop the RAM cache. Nothing durable lives on this device, so this is
  // safe and never blocks.
  void clearLocalData();
}

/** Resolve once the account's initial hydrate has finished (or attempted). */
export function awaitInitialPull(userId: string): Promise<void> {
  if (hydrateForUserId === userId && hydrateChain) return hydrateChain;
  if (hydrateChain && !hydrateForUserId && currentUserId === userId) return hydrateChain;
  return Promise.resolve();
}

/** Force a fresh server snapshot into the RAM cache now. */
export async function reconcileAll(userId: string): Promise<void> {
  if (!syncEnabled || currentUserId !== userId) return;
  await startHydrate(userId);
}

/** Refresh when the app or device regains focus / connectivity. */
export function resumeSync(): void {
  if (!syncEnabled || !currentUserId) return;
  scheduleRefresh(currentUserId);
}

/** Notify other devices that tables changed (best-effort realtime ping). */
export function broadcastSyncMutation(_userId: string, tables: string[]): void {
  if (!supabaseConfigured || !syncChannel || typeof syncChannel.send !== 'function') return;
  void syncChannel
    .send({
      type: 'broadcast',
      event: 'sync_mutation',
      payload: { sourceDeviceId: clientDeviceId, tables }
    })
    ?.catch?.(() => undefined);
}

type AnyRow = { id: string } & Record<string, unknown>;

// The repository expects sync_status on every cached row; Postgres strips it.
function withSyncStatus<T extends { id: string }>(row: T): AnyRow {
  return { ...row, sync_status: 'synced' } as unknown as AnyRow;
}

/** Write a row straight to the database. Rejects when the DB is unreachable. */
export async function writeLocal<T extends { id: string }>(
  name: SyncedTableName,
  row: T
): Promise<void> {
  await table(name).put(withSyncStatus(row));
}

/** Batch-write rows straight to the database. */
export async function writeLocalBatch(
  rows: Array<{ name: SyncedTableName; row: { id: string } }>
): Promise<void> {
  if (rows.length === 0) return;
  const grouped = new Map<SyncedTableName, Array<{ id: string }>>();
  for (const { name, row } of rows) {
    const target = grouped.get(name) ?? [];
    target.push(row);
    grouped.set(name, target);
  }
  for (const [name, targetRows] of grouped) {
    await table(name).bulkPut(targetRows.map(withSyncStatus));
  }
}

/** Delete a row from the database. Immutable tables refuse. */
export async function deleteLocal(name: SyncedTableName, id: string): Promise<void> {
  await table(name).delete(id);
}

/** Nothing waits on a background queue anymore — always zero. */
export async function pendingSyncCount(_userId: string): Promise<number> {
  return 0;
}

/** Every write is already committed to Postgres — always flushed. */
export async function flushPendingSync(_userId: string): Promise<boolean> {
  return true;
}

export function flushPushQueue(): Promise<void> {
  return Promise.resolve();
}

/** Old adopt step is a no-op: there is no unowned local data anymore. */
export async function adoptLocalDataForUser(_userId: string): Promise<void> {
  return;
}

/** Test hook: bind to a fake user without touching the network. */
export function _enableForTests(userId: string): void {
  currentUserId = userId;
  syncEnabled = true;
  void clearLocalData();
}