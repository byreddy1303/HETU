import { create } from 'zustand';

/**
 * Live confirmation that data reached the durable store (Postgres).
 *
 * Updates fire from three places only:
 *  - the write-through path (writeLocal / writeLocalBatch / deleteLocal)
 *  - full-hydrate completion (startHydrate)
 *  - the low-cost Postgres heartbeat (every SYNC_HEARTBEAT_MS)
 *
 * Nothing durable lives on this device, so this store is a pure RAM ledger of
 * the last confirmed server round-trip — the UI's "every session is truly in
 * Postgres" proof.
 */
interface SyncStatusState {
  /** Epoch ms of the last round-trip Postgres acknowledged. */
  lastSyncedAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  /** True while a full account hydrate is downloading. */
  syncing: boolean;
  markSyncing: (syncing: boolean) => void;
  markSynced: (at?: number) => void;
  markSyncError: (message: string, at?: number) => void;
  resetSyncStatus: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  lastSyncedAt: null,
  lastErrorAt: null,
  lastError: null,
  syncing: false,
  markSyncing: (syncing) => set({ syncing }),
  markSynced: (at = Date.now()) =>
    set(() => ({
      lastSyncedAt: at,
      lastErrorAt: null,
      lastError: null
    })),
  markSyncError: (message, at = Date.now()) =>
    set(() => ({ lastErrorAt: at, lastError: message })),
  resetSyncStatus: () =>
    set({ lastSyncedAt: null, lastErrorAt: null, lastError: null, syncing: false })
}));

export function noteSyncStarting(): void {
  useSyncStatusStore.getState().markSyncing(true);
}

export function noteSyncDone(): void {
  useSyncStatusStore.getState().markSyncing(false);
}

export function noteSyncSuccess(at = Date.now()): void {
  useSyncStatusStore.getState().markSynced(at);
}

export function noteSyncFailure(message: string, at = Date.now()): void {
  useSyncStatusStore.getState().markSyncError(message, at);
}

export function resetSyncStatus(): void {
  useSyncStatusStore.getState().resetSyncStatus();
}