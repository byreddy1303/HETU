import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn()
  };
  return { from: vi.fn(), query };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
  supabaseConfigured: true
}));

import {
  flushAccountDocumentWrites,
  hasPendingAccountDocumentWrites,
  loadAccountDocument,
  normalizeReferenceProgress,
  queueAccountDocumentWrite,
  type ReferenceProgress
} from '@/lib/account-documents';

const VALID_IDS = new Set(['note-1', 'note-2', 'note-3']);
const normalize = (value: unknown): ReferenceProgress =>
  normalizeReferenceProgress(value, VALID_IDS);

function payload(data: ReferenceProgress, updatedAt = '2026-08-30T12:00:00.000Z') {
  return { schemaVersion: 1, data, updatedAt };
}

describe('durable account documents', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.query.upsert.mockResolvedValue({ error: null });
  });

  it('uses the exact user database document as the source of truth', async () => {
    const userId = 'database-authority-user';
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        payload: payload(
          { revisedIds: ['note-2'], lastOpenedId: 'note-2' },
          '2026-08-30T13:00:00.000Z'
        )
      },
      error: null
    });

    const result = await loadAccountDocument(userId, 'topper_notes', { normalize });

    expect(result).toEqual({
      data: { revisedIds: ['note-2'], lastOpenedId: 'note-2' },
      source: 'database',
      error: null
    });
    expect(mocks.query.eq).toHaveBeenNthCalledWith(1, 'user_id', userId);
    expect(mocks.query.eq).toHaveBeenNthCalledWith(2, 'namespace', 'topper_notes');
  });

  it('migrates an existing legacy document only after the database confirms absence', async () => {
    const userId = 'legacy-migration-user';
    const legacyData = { revisedIds: ['note-1', 'note-3'], lastOpenedId: 'note-3' };

    const result = await loadAccountDocument(userId, 'topper_notes', {
      normalize,
      legacyData
    });

    expect(result).toEqual({ data: legacyData, source: 'legacy', error: null });
    expect(mocks.query.upsert).toHaveBeenCalledWith(
      {
        user_id: userId,
        namespace: 'topper_notes',
        payload: {
          schemaVersion: 1,
          data: legacyData,
          updatedAt: expect.any(String)
        },
        updated_at: expect.any(String)
      },
      { onConflict: 'user_id,namespace' }
    );
    expect(hasPendingAccountDocumentWrites(userId)).toBe(false);
  });

  it('never reports another user document when the database is unavailable', async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'offline' }
    });

    const result = await loadAccountDocument('isolated-user', 'topper_notes', { normalize });

    expect(result).toEqual({ data: null, source: 'absent', error: 'offline' });
  });

  it('flushes an in-memory pending edit even when the owning page is not mounted', async () => {
    const userId = 'hard-reload-user';
    mocks.query.upsert.mockResolvedValueOnce({ error: { message: 'network unavailable' } });
    const failed = await queueAccountDocumentWrite(userId, 'topper_notes', {
      revisedIds: ['note-1', 'note-2'],
      lastOpenedId: 'note-2'
    });

    expect(failed).toBe('network unavailable');
    expect(hasPendingAccountDocumentWrites(userId)).toBe(true);

    const error = await flushAccountDocumentWrites(userId);

    expect(error).toBeNull();
    expect(hasPendingAccountDocumentWrites(userId)).toBe(false);
  });

  it('treats an in-flight pending edit as newer than the database', async () => {
    const userId = 'pending-load-user';
    let releaseWrite: ((value: { error: null }) => void) | undefined;
    mocks.query.upsert.mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          releaseWrite = resolve;
        })
    );
    const queued = queueAccountDocumentWrite(userId, 'topper_notes', {
      revisedIds: ['note-3'],
      lastOpenedId: 'note-3'
    });
    await vi.waitFor(() => expect(mocks.query.upsert).toHaveBeenCalledTimes(1));

    const result = await loadAccountDocument(userId, 'topper_notes', { normalize });

    expect(result).toEqual({
      data: { revisedIds: ['note-3'], lastOpenedId: 'note-3' },
      source: 'pending',
      error: null
    });
    expect(mocks.query.maybeSingle).not.toHaveBeenCalled();

    releaseWrite?.({ error: null });
    await queued;
    expect(hasPendingAccountDocumentWrites(userId)).toBe(false);
  });

  it('does not let an older in-flight database read overwrite a new page edit', async () => {
    const userId = 'load-write-race-user';
    let finishLoad:
      | ((result: { data: { payload: ReturnType<typeof payload> }; error: null }) => void)
      | undefined;
    let releaseWrite: ((value: { error: null }) => void) | undefined;
    mocks.query.maybeSingle.mockImplementationOnce(
      () =>
        new Promise<{ data: { payload: ReturnType<typeof payload> }; error: null }>((resolve) => {
          finishLoad = resolve;
        })
    );
    mocks.query.upsert.mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          releaseWrite = resolve;
        })
    );

    const loading = loadAccountDocument(userId, 'topper_notes', { normalize });
    await vi.waitFor(() => expect(mocks.query.maybeSingle).toHaveBeenCalledTimes(1));
    const latest = { revisedIds: ['note-2'], lastOpenedId: 'note-2' };
    const queued = queueAccountDocumentWrite(userId, 'topper_notes', latest);
    await vi.waitFor(() => expect(mocks.query.upsert).toHaveBeenCalledTimes(1));
    finishLoad?.({
      data: {
        payload: payload(
          { revisedIds: ['note-1'], lastOpenedId: 'note-1' },
          '2026-08-30T11:00:00.000Z'
        )
      },
      error: null
    });

    expect(await loading).toEqual({ data: latest, source: 'pending', error: null });
    releaseWrite?.({ error: null });
    await queued;
    expect(hasPendingAccountDocumentWrites(userId)).toBe(false);
  });

  it('retains a failed edit in memory and clears it after a retry', async () => {
    const userId = 'offline-retry-user';
    mocks.query.upsert.mockResolvedValueOnce({ error: { message: 'network unavailable' } });

    const firstError = await queueAccountDocumentWrite(userId, 'topper_notes', {
      revisedIds: ['note-1'],
      lastOpenedId: 'note-1'
    });

    expect(firstError).toBe('network unavailable');
    expect(hasPendingAccountDocumentWrites(userId)).toBe(true);

    mocks.query.upsert.mockResolvedValue({ error: null });
    expect(await flushAccountDocumentWrites(userId)).toBeNull();
    expect(hasPendingAccountDocumentWrites(userId)).toBe(false);
  });

  it('serializes writes and coalesces rapid edits to the newest document', async () => {
    const userId = 'coalesced-writes-user';
    let finishFirst: ((result: { error: null }) => void) | undefined;
    mocks.query.upsert
      .mockImplementationOnce(
        () =>
          new Promise<{ error: null }>((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockResolvedValue({ error: null });

    const first = queueAccountDocumentWrite(userId, 'topper_notes', {
      revisedIds: ['note-1'],
      lastOpenedId: 'note-1'
    });
    await vi.waitFor(() => expect(mocks.query.upsert).toHaveBeenCalledTimes(1));
    const second = queueAccountDocumentWrite(userId, 'topper_notes', {
      revisedIds: ['note-1', 'note-2'],
      lastOpenedId: 'note-2'
    });
    const third = queueAccountDocumentWrite(userId, 'topper_notes', {
      revisedIds: ['note-3'],
      lastOpenedId: 'note-3'
    });

    finishFirst?.({ error: null });
    await Promise.all([first, second, third]);

    expect(mocks.query.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.query.upsert.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        user_id: userId,
        payload: expect.objectContaining({
          data: { revisedIds: ['note-3'], lastOpenedId: 'note-3' }
        })
      })
    );
    expect(hasPendingAccountDocumentWrites(userId)).toBe(false);
  });

  it('deduplicates revised ids and rejects ids that are not in the manifest', () => {
    expect(
      normalizeReferenceProgress(
        {
          revisedIds: ['note-2', 'missing', 'note-2', 7, 'note-1'],
          lastOpenedId: 'missing'
        },
        VALID_IDS
      )
    ).toEqual({ revisedIds: ['note-2', 'note-1'], lastOpenedId: null });

    expect(
      normalizeReferenceProgress({ revisedIds: 'note-1', lastOpenedId: 'note-3' }, VALID_IDS)
    ).toEqual({ revisedIds: [], lastOpenedId: 'note-3' });
  });
});
