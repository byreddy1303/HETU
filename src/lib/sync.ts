// Local-first sync engine (BUILD.md §4, F1.3).
// UI writes go to Dexie synchronously via writeLocal(); a background push
// upserts pending rows to Supabase in FK-safe order with exponential backoff.
// Pulls merge server rows into Dexie; local rows still pending always win.
import { db, table, SYNCED_TABLES, type SyncedTableName } from '@/lib/db';
import { supabase, supabaseConfigured } from '@/lib/supabase';

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

const BACKOFF_MAX_MS = 60_000;
const PULL_MIN_GAP_MS = 30_000;

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

/** Write a row locally (source of truth) and schedule a background push. */
export async function writeLocal<T extends { id: string }>(
  name: SyncedTableName,
  row: T
): Promise<void> {
  await table(name).put({ ...row, sync_status: syncEnabled ? 'pending' : 'synced' });
  if (syncEnabled) schedulePush(0);
}

export async function writeLocalBatch(
  rows: { name: SyncedTableName; row: { id: string } }[]
): Promise<void> {
  if (rows.length === 0) return;
  const targets = [...new Set(rows.map(({ name }) => name))].map((name) => table(name));
  await db.transaction('rw', targets, async () => {
    for (const { name, row } of rows) {
      await table(name).put({ ...row, sync_status: syncEnabled ? 'pending' : 'synced' });
    }
  });
  if (syncEnabled) schedulePush(0);
}

/** Delete locally now; queue the remote delete if we cannot reach the server. */
export async function deleteLocal(name: SyncedTableName, id: string): Promise<void> {
  await table(name).delete(id);
  if (!syncEnabled) return;
  const queue = ((await db.meta.get('delete_queue'))?.value as QueuedDelete[] | undefined) ?? [];
  await db.meta.put({ key: 'delete_queue', value: [...queue, { table: name, id }] });
  schedulePush(0);
}

function schedulePush(delayMs: number) {
  if (!syncEnabled) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void flushPushQueue(), delayMs);
}

/** Push every pending row (and queued deletes). Exposed for tests + listeners. */
export function flushPushQueue(): Promise<void> {
  if (!syncEnabled) return Promise.resolve();
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

    await Promise.all(
      results.map(async ({ name, result: { data, error } }) => {
        if (error) {
          console.warn(`[sync] pull failed for ${name}: ${error.message}`);
          return;
        }
        if (!data?.length) return;

        const remoteRows = data as { id: string }[];
        const target = table(name);
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
      })
    );
    lastPullAt = Date.now();
  })().finally(() => {
    pullInFlight = null;
    pullingForUserId = null;
  });

  return pullInFlight;
}

function onOnline() {
  schedulePush(0);
  if (currentUserId && Date.now() - lastPullAt > PULL_MIN_GAP_MS) void pullAll(currentUserId);
}

function onFocus() {
  if (currentUserId && Date.now() - lastPullAt > PULL_MIN_GAP_MS) void pullAll(currentUserId);
  schedulePush(0);
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
  void pullAll(userId);
  schedulePush(0);
}

export function stopSync(): void {
  syncEnabled = false;
  currentUserId = null;
  pullingForUserId = null;
  clearTimeout(pushTimer);
}

/** Test hook: force-enable without listeners (unit tests drive pushes manually). */
export function _enableForTests(userId: string): void {
  syncEnabled = true;
  currentUserId = userId;
  backoffMs = 2000;
}
