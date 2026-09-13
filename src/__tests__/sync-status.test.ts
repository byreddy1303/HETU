import { beforeEach, describe, expect, it } from 'vitest';
import {
  noteSyncDone,
  noteSyncFailure,
  noteSyncStarting,
  noteSyncSuccess,
  resetSyncStatus,
  useSyncStatusStore
} from '@/stores/sync-status';
import { writeLocal } from '@/lib/sync';
import { db } from '@/lib/db';
import { SYNC_HEARTBEAT_MS } from '@/lib/sync';

const USER = '11111111-1111-4111-8111-111111111111';

describe('sync status store', () => {
  beforeEach(async () => {
    resetSyncStatus();
    await db.topic_progress.clear();
  });

  it('records the timestamp of the last confirmed Postgres round-trip', () => {
    const stamp = 1_750_000_000_000;
    useSyncStatusStore.getState().markSyncError('boom');
    noteSyncSuccess(stamp);

    expect(useSyncStatusStore.getState().lastSyncedAt).toBe(stamp);
    expect(useSyncStatusStore.getState().lastErrorAt).toBeNull();
    expect(useSyncStatusStore.getState().lastError).toBeNull();
  });

  it('tracks an error without erasing the last good sync', () => {
    noteSyncSuccess(1_000);
    noteSyncFailure('write failed for topic_progress');

    const state = useSyncStatusStore.getState();
    expect(state.lastSyncedAt).toBe(1_000);
    expect(state.lastErrorAt).toBeGreaterThan(0);
    expect(state.lastError).toContain('write failed');
  });

  it('marks a hydrate as in progress and back to idle', () => {
    noteSyncStarting();
    expect(useSyncStatusStore.getState().syncing).toBe(true);

    noteSyncDone();
    expect(useSyncStatusStore.getState().syncing).toBe(false);
  });

  it('resets completely for the next signed-in user', () => {
    noteSyncSuccess(1_000);
    noteSyncErrorAndStart();
    resetSyncStatus();

    const state = useSyncStatusStore.getState();
    expect(state.lastSyncedAt).toBeNull();
    expect(state.lastErrorAt).toBeNull();
    expect(state.lastError).toBeNull();
    expect(state.syncing).toBe(false);
  });

  it('heartbeat cadence is exactly 300ms as requested', () => {
    expect(SYNC_HEARTBEAT_MS).toBe(300);
  });

  it('never claims a cloud sync when Supabase is not configured (sandbox/dev)', async () => {
    await writeLocal('topic_progress', {
      id: `row-${USER}`,
      user_id: USER,
      subject: 'Algorithms',
      subject_id: 'algorithms',
      topic: 'Greedy',
      completed_at: '2026-08-01T10:00:00.000Z',
      updated_at: '2026-08-01T10:00:00.000Z'
    });

    // The write landed in the RAM repository, but with no Postgres round-trip
    // nothing may claim the data reached the database.
    expect(await db.topic_progress.where('user_id').equals(USER).toArray()).toHaveLength(1);
    expect(useSyncStatusStore.getState().lastSyncedAt).toBeNull();
  });
});

function noteSyncErrorAndStart() {
  noteSyncStarting();
  noteSyncFailure('temporary outage');
}