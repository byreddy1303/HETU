// F1.3 DoD: offline write lands in Dexie as pending; coming online pushes it
// to Supabase and marks it synced; pull conflicts resolve local-pending-wins
// and log to console.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, table, SYNCED_TABLES, type SyncedTableName } from '@/lib/db';
import {
  writeLocal,
  deleteLocal,
  flushPushQueue,
  pullAll,
  stopSync,
  _enableForTests
} from '@/lib/sync';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteEq: vi.fn(),
  selectEq: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    from: (name: string) => ({
      upsert: (payload: unknown[]) => mocks.upsert(name, payload),
      delete: () => ({ eq: (_col: string, id: string) => mocks.deleteEq(name, id) }),
      select: () => ({ eq: (_col: string, val: string) => mocks.selectEq(name, val) })
    })
  }
}));

const USER = '00000000-0000-4000-8000-000000000001';

function sessionRow(id: string, subject = 'Discrete Mathematics') {
  return {
    id,
    user_id: USER,
    subject,
    question_source: 'GO book',
    target_duration_min: 60,
    started_at: '2026-07-17T09:00:00.000Z'
  };
}

async function seed(
  name: SyncedTableName,
  row: { id: string } & Record<string, unknown>,
  status: 'pending' | 'synced'
) {
  await table(name).put({ ...row, sync_status: status });
}

beforeEach(async () => {
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.deleteEq.mockReset().mockResolvedValue({ error: null });
  mocks.selectEq.mockReset().mockResolvedValue({ data: [], error: null });
  await Promise.all(SYNCED_TABLES.map((n) => table(n).clear()));
  await db.meta.clear();
  _enableForTests(USER);
});

afterEach(() => {
  stopSync();
  vi.restoreAllMocks();
});

describe('sync engine (F1.3)', () => {
  it('offline write stays pending, then syncs when back online', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await writeLocal('sessions', sessionRow('s-1'));
    // let the auto-scheduled push fire — offline, it must no-op
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect((await table('sessions').get('s-1'))?.sync_status).toBe('pending');

    onLine.mockReturnValue(true);
    await flushPushQueue();

    const call = mocks.upsert.mock.calls.find((c) => c[0] === 'sessions');
    expect(call).toBeDefined();
    const pushed = (call as unknown[])[1] as Record<string, unknown>[];
    expect(pushed).toHaveLength(1);
    expect(pushed[0].id).toBe('s-1');
    expect('sync_status' in pushed[0]).toBe(false);
    expect((await table('sessions').get('s-1'))?.sync_status).toBe('synced');
  });

  it('waits for a local write before flushing during sign-out', async () => {
    const target = db.topic_progress;
    const put = target.put.bind(target);
    let releaseWrite: () => void = () => {};
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const delayedPut = async (row: Parameters<typeof target.put>[0]) => {
      await writeGate;
      return put(row);
    };
    vi.spyOn(target, 'put').mockImplementation(delayedPut as typeof target.put);

    const write = writeLocal('topic_progress', {
      id: 'tp-1',
      user_id: USER,
      subject: 'Discrete Mathematics',
      topic: 'Propositional Logic',
      completed_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:00:00.000Z'
    });
    const flush = flushPushQueue();

    await Promise.resolve();
    expect(mocks.upsert).not.toHaveBeenCalled();

    releaseWrite();
    await Promise.all([write, flush]);

    expect(mocks.upsert).toHaveBeenCalledWith(
      'topic_progress',
      expect.arrayContaining([expect.objectContaining({ id: 'tp-1', user_id: USER })])
    );
  });

  it('stops at the first failing table so FK parents push before children', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await seed('sessions', sessionRow('s-2'), 'pending');
    await seed('questions', { id: 'q-1', user_id: USER, session_id: 's-2' }, 'pending');
    mocks.upsert.mockImplementation(async (name: string) =>
      name === 'sessions' ? { error: { message: 'boom' } } : { error: null }
    );

    await flushPushQueue();

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toBe('sessions');
    expect((await table('sessions').get('s-2'))?.sync_status).toBe('pending');
    expect((await table('questions').get('q-1'))?.sync_status).toBe('pending');
  });

  it('queues deletes made offline and drains them on flush', async () => {
    await seed('sessions', sessionRow('s-3'), 'synced');
    await deleteLocal('sessions', 's-3');
    expect(await table('sessions').get('s-3')).toBeUndefined();
    expect((await db.meta.get('delete_queue'))?.value).toEqual([{ table: 'sessions', id: 's-3' }]);

    await flushPushQueue();

    expect(mocks.deleteEq).toHaveBeenCalledWith('sessions', 's-3');
    expect((await db.meta.get('delete_queue'))?.value).toEqual([]);
  });

  it('pull keeps local pending rows (logged) and overwrites synced ones', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await seed('sessions', sessionRow('s-4', 'LOCAL EDIT'), 'pending');
    await seed('sessions', sessionRow('s-5', 'STALE LOCAL'), 'synced');
    mocks.selectEq.mockImplementation(async (name: string) =>
      name === 'sessions'
        ? { data: [sessionRow('s-4', 'REMOTE'), sessionRow('s-5', 'REMOTE')], error: null }
        : { data: [], error: null }
    );

    await pullAll(USER);

    expect(info).toHaveBeenCalledWith('[sync] conflict on sessions/s-4: local pending wins');
    const kept = (await table('sessions').get('s-4')) as unknown as {
      subject: string;
      sync_status: string;
    };
    expect(kept.subject).toBe('LOCAL EDIT');
    expect(kept.sync_status).toBe('pending');
    const overwritten = (await table('sessions').get('s-5')) as unknown as {
      subject: string;
      sync_status: string;
    };
    expect(overwritten.subject).toBe('REMOTE');
    expect(overwritten.sync_status).toBe('synced');
  });

  it('starts table pulls in parallel and deduplicates an overlapping refresh', async () => {
    const release: Array<() => void> = [];
    mocks.selectEq.mockImplementation(
      () =>
        new Promise((resolve) => {
          release.push(() => resolve({ data: [], error: null }));
        })
    );

    const first = pullAll(USER);
    const overlapping = pullAll(USER);

    expect(overlapping).toBe(first);
    await vi.waitFor(() => expect(mocks.selectEq).toHaveBeenCalledTimes(SYNCED_TABLES.length));

    for (const resolve of release) resolve();
    await first;
  });
});
