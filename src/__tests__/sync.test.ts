// F1.3 DoD: offline write lands in Dexie as pending; coming online pushes it
// to Supabase and marks it synced; pull conflicts resolve local-pending-wins
// and log to console.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, table, SYNCED_TABLES, type SyncedTableName } from '@/lib/db';
import {
  writeLocal,
  writeLocalBatch,
  deleteLocal,
  flushPushQueue,
  pullAll,
  stopSync,
  _enableForTests
} from '@/lib/sync';
import { pyqAttemptId, pyqJournalQuestionId } from '@/lib/pyq-session';

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

async function seed(name: SyncedTableName, row: { id: string } & Record<string, unknown>, status: 'pending' | 'synced') {
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
  it('canonicalizes subject aliases and merged mock sections at every local write', async () => {
    await writeLocal('sessions', sessionRow('canonical-session', 'Computer Organization'));
    const storedSession = (await table('sessions').get('canonical-session')) as unknown as {
      subject: string;
      subject_id: string | null;
    };
    expect(storedSession).toMatchObject({ subject: 'COA', subject_id: 'coa' });

    await writeLocal('mock_tests', {
      id: 'canonical-mock',
      user_id: USER,
      subject_scores: [
        { subject: 'C Programming', marks: 5 },
        { subject: 'Data Structure', marks: 7 }
      ]
    });
    const storedMock = (await table('mock_tests').get('canonical-mock')) as unknown as {
      subject_scores: Array<{ subject: string; subject_id: string | null; marks: number }>;
    };
    expect(storedMock.subject_scores).toEqual([
      { subject: 'Programming & DS', subject_id: 'programming-data-structures', marks: 12 }
    ]);
  });

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

  it('pushes immutable attempts before Journal analyses that reference them', async () => {
    await seed('questions', { id: 'journal-1', user_id: USER, source_pyq_attempt_id: 'attempt-1' }, 'pending');
    await seed('pyq_attempts', { id: 'attempt-1', user_id: USER, mark_decision: 'MARK' }, 'pending');

    await flushPushQueue();

    const pushedTables = mocks.upsert.mock.calls.map((call) => call[0]);
    expect(pushedTables.indexOf('pyq_attempts')).toBeLessThan(pushedTables.indexOf('questions'));
  });

  it('accepts an idempotent receipt write but rejects mutation and deletion', async () => {
    const receipt = {
      id: 'attempt-immutable',
      user_id: USER,
      question_uid: 'gate-q1',
      mark_decision: 'SKIP',
      selected_answer: null,
      attempted_at: '2026-08-20T09:00:00.000Z'
    };
    await writeLocal('pyq_attempts', receipt);
    await expect(
      writeLocal('pyq_attempts', {
        ...receipt,
        attempted_at: '2026-08-20T09:00:00.000+00:00'
      })
    ).resolves.toBeUndefined();
    await expect(
      writeLocal('pyq_attempts', { ...receipt, mark_decision: 'MARK', selected_answer: 'A' })
    ).rejects.toThrow('Committed PYQ attempt attempt-immutable is immutable.');
    await expect(deleteLocal('pyq_attempts', receipt.id)).rejects.toThrow(
      'Committed PYQ attempts cannot be deleted.'
    );
    expect(
      ((await table('pyq_attempts').get(receipt.id)) as unknown as { mark_decision: string })
        .mark_decision
    ).toBe('SKIP');
  });

  it('rolls back a mixed local batch when it would mutate a receipt', async () => {
    await seed(
      'pyq_attempts',
      { id: 'attempt-batch', user_id: USER, mark_decision: 'SKIP' },
      'synced'
    );
    await expect(
      writeLocalBatch([
        { name: 'sessions', row: sessionRow('must-roll-back') },
        {
          name: 'pyq_attempts',
          row: {
            id: 'attempt-batch',
            user_id: USER,
            mark_decision: 'MARK'
          } as { id: string } & Record<string, unknown>
        }
      ])
    ).rejects.toThrow('Committed PYQ attempt attempt-batch is immutable.');
    expect(await table('sessions').get('must-roll-back')).toBeUndefined();
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
    const kept = (await table('sessions').get('s-4')) as unknown as { subject: string; sync_status: string };
    expect(kept.subject).toBe('LOCAL EDIT');
    expect(kept.sync_status).toBe('pending');
    const overwritten = (await table('sessions').get('s-5')) as unknown as { subject: string; sync_status: string };
    expect(overwritten.subject).toBe('REMOTE');
    expect(overwritten.sync_status).toBe('synced');
  });

  it('keeps the remote receipt and atomically rekeys a divergent pending receipt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalId = pyqAttemptId('session-conflict', 'gate-q1', 1);
    await seed(
      'pyq_attempts',
      {
        id: originalId,
        user_id: USER,
        pyq_session_id: 'session-conflict',
        question_uid: 'gate-q1',
        attempt_number: 1,
        mark_decision: 'SKIP',
        selected_answer: null,
        time_spent_sec: 8,
        attempted_at: '2026-08-20T09:00:00.000Z'
      },
      'pending'
    );
    await seed(
      'questions',
      {
        id: pyqJournalQuestionId(originalId),
        user_id: USER,
        source_pyq_attempt_id: originalId,
        mark_decision: 'SKIP'
      },
      'pending'
    );
    mocks.selectEq.mockImplementation(async (name: string) =>
      name === 'pyq_attempts'
        ? {
            data: [
              {
                id: originalId,
                user_id: USER,
                pyq_session_id: 'session-conflict',
                question_uid: 'gate-q1',
                attempt_number: 1,
                mark_decision: 'MARK',
                selected_answer: 'B',
                time_spent_sec: 11,
                attempted_at: '2026-08-20T09:01:00.000+00:00'
              }
            ],
            error: null
          }
        : { data: [], error: null }
    );

    await pullAll(USER);

    const receipts = (await table('pyq_attempts').toArray()) as unknown as Array<{
      id: string;
      attempt_number: number;
      mark_decision: string;
      sync_status: string;
    }>;
    expect(receipts).toHaveLength(2);
    expect(receipts.find((row) => row.id === originalId)).toMatchObject({
      mark_decision: 'MARK',
      sync_status: 'synced'
    });
    const rekeyed = receipts.find((row) => row.id !== originalId)!;
    expect(rekeyed).toMatchObject({
      attempt_number: 2,
      mark_decision: 'SKIP',
      sync_status: 'pending'
    });
    const analyses = (await table('questions').toArray()) as unknown as Array<{
      id: string;
      source_pyq_attempt_id: string;
      sync_status: string;
    }>;
    expect(analyses).toHaveLength(1);
    expect(analyses[0]).toMatchObject({
      source_pyq_attempt_id: rekeyed.id,
      sync_status: 'pending'
    });
    expect(analyses[0].id).toBe(pyqJournalQuestionId(rekeyed.id));
    expect(warn).toHaveBeenCalledWith(
      `[sync] immutable conflict on pyq_attempts/${originalId}: remote kept; local rekeyed to ${rekeyed.id}`
    );
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
