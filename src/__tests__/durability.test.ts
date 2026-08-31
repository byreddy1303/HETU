import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initSync: vi.fn(),
  flushPendingSync: vi.fn(),
  stopSync: vi.fn(),
  syncTopicProgressFromDb: vi.fn(),
  migrateLegacyDayPlansForUser: vi.fn(),
  loadAllDayPlans: vi.fn(),
  loadCloudDayPlans: vi.fn(),
  queuePlannerCloudWrite: vi.fn(),
  flushPlannerCloudWrites: vi.fn(),
  hasPendingPlannerCloudWrites: vi.fn(),
  flushAccountStateWrites: vi.fn(),
  retryAccountStateSync: vi.fn(),
  hasPendingAccountStateWrites: vi.fn(),
  stopAccountStateSync: vi.fn(),
  startAccountStateSync: vi.fn(),
  loadAccountDocument: vi.fn(),
  flushAccountDocumentWrites: vi.fn(),
  hasPendingAccountDocumentWrites: vi.fn(),
  normalizeReferenceProgress: vi.fn(),
  flushReadinessSnapshots: vi.fn(),
  loadDebt: vi.fn(),
  hasStoredDebt: vi.fn(),
  normalizeDebtEntries: vi.fn(),
  wipeLocalState: vi.fn()
}));

vi.mock('@/lib/sync', () => ({
  initSync: mocks.initSync,
  flushPendingSync: mocks.flushPendingSync,
  stopSync: mocks.stopSync
}));

vi.mock('@/stores/topic-progress', () => ({
  syncTopicProgressFromDb: mocks.syncTopicProgressFromDb
}));

vi.mock('@/lib/planner-storage', () => ({
  migrateLegacyDayPlansForUser: mocks.migrateLegacyDayPlansForUser,
  loadAllDayPlans: mocks.loadAllDayPlans
}));

vi.mock('@/lib/planner-cloud', () => ({
  loadCloudDayPlans: mocks.loadCloudDayPlans,
  queuePlannerCloudWrite: mocks.queuePlannerCloudWrite,
  flushPlannerCloudWrites: mocks.flushPlannerCloudWrites,
  hasPendingPlannerCloudWrites: mocks.hasPendingPlannerCloudWrites
}));

vi.mock('@/lib/account-state', () => ({
  flushAccountStateWrites: mocks.flushAccountStateWrites,
  retryAccountStateSync: mocks.retryAccountStateSync,
  hasPendingAccountStateWrites: mocks.hasPendingAccountStateWrites,
  stopAccountStateSync: mocks.stopAccountStateSync,
  startAccountStateSync: mocks.startAccountStateSync
}));

vi.mock('@/lib/account-documents', () => ({
  loadAccountDocument: mocks.loadAccountDocument,
  flushAccountDocumentWrites: mocks.flushAccountDocumentWrites,
  hasPendingAccountDocumentWrites: mocks.hasPendingAccountDocumentWrites,
  normalizeReferenceProgress: mocks.normalizeReferenceProgress
}));

vi.mock('@/lib/readiness-snapshots', () => ({
  flushReadinessSnapshots: mocks.flushReadinessSnapshots,
  loadDebt: mocks.loadDebt,
  hasStoredDebt: mocks.hasStoredDebt,
  normalizeDebtEntries: mocks.normalizeDebtEntries
}));

vi.mock('@/lib/isolation', () => ({
  wipeLocalState: mocks.wipeLocalState
}));

vi.mock('@/data/topper-notes.json', () => ({
  default: [{ id: 'note-1' }]
}));

import { clearLocalCacheSafely, flushAllDurableState } from '@/lib/durability';

describe('durability barrier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    mocks.syncTopicProgressFromDb.mockResolvedValue(undefined);
    mocks.flushPendingSync.mockResolvedValue(true);
    mocks.loadAllDayPlans.mockReturnValue([]);
    mocks.loadCloudDayPlans.mockResolvedValue({ plans: [], error: null });
    mocks.queuePlannerCloudWrite.mockResolvedValue(null);
    mocks.flushPlannerCloudWrites.mockResolvedValue(null);
    mocks.hasPendingPlannerCloudWrites.mockReturnValue(false);
    mocks.flushAccountStateWrites.mockResolvedValue(undefined);
    mocks.retryAccountStateSync.mockResolvedValue(undefined);
    mocks.startAccountStateSync.mockResolvedValue(undefined);
    mocks.hasPendingAccountStateWrites.mockReturnValue(false);
    mocks.loadAccountDocument.mockResolvedValue({ data: null, source: 'absent', error: null });
    mocks.flushAccountDocumentWrites.mockResolvedValue(null);
    mocks.hasPendingAccountDocumentWrites.mockReturnValue(false);
    mocks.normalizeReferenceProgress.mockReturnValue({ revisedIds: [], lastOpenedId: null });
    mocks.flushReadinessSnapshots.mockResolvedValue(null);
    mocks.loadDebt.mockReturnValue([]);
    mocks.hasStoredDebt.mockReturnValue(false);
    mocks.normalizeDebtEntries.mockReturnValue([]);
    mocks.wipeLocalState.mockResolvedValue(undefined);
  });

  it('flushes every durable writer and unopened-page migration before succeeding', async () => {
    const localPlan = {
      date: '2026-08-31',
      updatedAt: '2026-08-31T06:00:00.000Z'
    };
    mocks.loadAllDayPlans.mockReturnValue([localPlan]);
    const result = await flushAllDurableState('user-exact');

    expect(result).toEqual({ ok: true });
    expect(mocks.initSync).toHaveBeenCalledWith('user-exact');
    expect(mocks.syncTopicProgressFromDb).toHaveBeenCalledWith('user-exact');
    expect(mocks.flushPendingSync).toHaveBeenCalledWith('user-exact');
    expect(mocks.flushAccountStateWrites).toHaveBeenCalledWith('user-exact');
    expect(mocks.retryAccountStateSync).toHaveBeenCalledWith('user-exact');
    expect(mocks.migrateLegacyDayPlansForUser).toHaveBeenCalledWith('user-exact');
    expect(mocks.loadAllDayPlans).toHaveBeenCalledWith('user-exact');
    expect(mocks.loadCloudDayPlans).toHaveBeenCalledWith('user-exact');
    expect(mocks.queuePlannerCloudWrite).toHaveBeenCalledWith('user-exact', localPlan);
    expect(mocks.flushPlannerCloudWrites).toHaveBeenCalledWith('user-exact');
    expect(mocks.flushReadinessSnapshots).toHaveBeenCalledWith('user-exact');
    expect(mocks.loadAccountDocument).toHaveBeenCalledTimes(2);
    expect(mocks.loadAccountDocument).toHaveBeenNthCalledWith(
      1,
      'user-exact',
      'topper_notes',
      expect.objectContaining({ legacyData: null })
    );
    expect(mocks.loadAccountDocument).toHaveBeenNthCalledWith(
      2,
      'user-exact',
      'readiness_watchlist',
      expect.objectContaining({ legacyData: null })
    );
    expect(mocks.flushAccountDocumentWrites).toHaveBeenCalledWith('user-exact');
    expect(mocks.retryAccountStateSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.flushAccountStateWrites.mock.invocationCallOrder[0]
    );
    expect(mocks.migrateLegacyDayPlansForUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadAllDayPlans.mock.invocationCallOrder[0]
    );
    expect(mocks.queuePlannerCloudWrite.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.flushPlannerCloudWrites.mock.invocationCallOrder[0]
    );
  });

  it('blocks immediately while offline without touching any local data', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const result = await flushAllDurableState('user-offline');

    expect(result).toEqual({
      ok: false,
      error: 'You are offline. Reconnect before signing out or clearing local data.'
    });
    expect(mocks.syncTopicProgressFromDb).not.toHaveBeenCalled();
    expect(mocks.flushPendingSync).not.toHaveBeenCalled();
    expect(mocks.wipeLocalState).not.toHaveBeenCalled();
  });

  it('returns a no-data-cleared error when any database queue remains pending', async () => {
    mocks.flushPendingSync.mockResolvedValue(false);

    const result = await flushAllDurableState('user-pending');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nothing was cleared.');
    expect(result.error).toContain('Some study records are still waiting for the database.');
    expect(mocks.flushAccountStateWrites).not.toHaveBeenCalled();
    expect(mocks.wipeLocalState).not.toHaveBeenCalled();
  });

  it('stops account listeners and sync before wiping a confirmed disposable cache', async () => {
    const result = await clearLocalCacheSafely('user-clear');

    expect(result).toEqual({ ok: true });
    expect(mocks.stopAccountStateSync).toHaveBeenCalledWith('user-clear');
    expect(mocks.stopSync).toHaveBeenCalledTimes(1);
    expect(mocks.wipeLocalState).toHaveBeenCalledTimes(1);
    expect(mocks.stopAccountStateSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.wipeLocalState.mock.invocationCallOrder[0]
    );
    expect(mocks.stopSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.wipeLocalState.mock.invocationCallOrder[0]
    );
  });

  it('never stops listeners or wipes the cache when the durability check fails', async () => {
    mocks.hasPendingAccountStateWrites.mockReturnValue(true);

    const result = await clearLocalCacheSafely('user-blocked');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Preferences or an in-progress draft');
    expect(mocks.stopAccountStateSync).not.toHaveBeenCalled();
    expect(mocks.stopSync).not.toHaveBeenCalled();
    expect(mocks.wipeLocalState).not.toHaveBeenCalled();
  });

  it('preserves unreadable legacy material instead of treating it as an empty cache', async () => {
    localStorage.setItem('air.topper-notes.user-corrupt', '{not valid JSON');

    const result = await clearLocalCacheSafely('user-corrupt');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('air.topper-notes.user-corrupt');
    expect(result.error).toContain('was left untouched');
    expect(localStorage.getItem('air.topper-notes.user-corrupt')).toBe('{not valid JSON');
    expect(mocks.initSync).not.toHaveBeenCalled();
    expect(mocks.wipeLocalState).not.toHaveBeenCalled();
  });

  it('reports partial device cleanup and restarts account writers', async () => {
    mocks.wipeLocalState.mockRejectedValue(new Error('IndexedDB could not be cleared.'));

    const result = await clearLocalCacheSafely('user-cleanup-error');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('database copy is safe');
    expect(result.error).toContain('IndexedDB could not be cleared.');
    expect(mocks.initSync).toHaveBeenLastCalledWith('user-cleanup-error');
    expect(mocks.startAccountStateSync).toHaveBeenCalledWith('user-cleanup-error');
  });
});
