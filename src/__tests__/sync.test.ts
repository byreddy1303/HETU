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
  initSync,
  pullAll,
  stopSync,
  _enableForTests
} from '@/lib/sync';
import { pyqAttemptId, pyqJournalQuestionId } from '@/lib/pyq-session';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteEq: vi.fn(),
  selectPage: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    from: (name: string) => ({
      upsert: (payload: unknown[]) => mocks.upsert(name, payload),
      delete: () => ({ eq: (_col: string, id: string) => mocks.deleteEq(name, id) }),
      select: () => ({
        eq: (_col: string, val: string) => ({
          order: () => {
            const page = (afterId: string | null, limit: number) =>
              mocks.selectPage(name, val, afterId, limit);
            return {
              gt: (_idColumn: string, afterId: string) => ({
                limit: (limit: number) => page(afterId, limit)
              }),
              limit: (limit: number) => page(null, limit)
            };
          }
        })
      })
    })
  }
}));

const USER = '00000000-0000-4000-8000-000000000001';
const USER_2 = '00000000-0000-4000-8000-000000000002';

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

function questionRow(
  id: string,
  overrides: Record<string, unknown> = {}
): { id: string } & Record<string, unknown> {
  return {
    id,
    user_id: USER,
    session_id: null,
    subject: 'Algorithms',
    subject_id: 'algorithms',
    subtopic: 'Graphs',
    source_year: 2026,
    source_ref: 'GATE PYQ',
    question_text: 'Question',
    answer_text: 'Answer',
    image_url: null,
    time_spent_sec: 10,
    target_time_sec: 90,
    outcome: 'R',
    pattern_name: null,
    trigger_sentence: null,
    root_cause: null,
    mark_decision: 'MARK',
    mark_correct: true,
    source_pyq_attempt_id: null,
    created_at: '2026-08-20T09:00:00.000Z',
    ...overrides
  };
}

function topicRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: USER,
    subject: 'COA',
    subject_id: 'coa',
    topic: 'Cache',
    completed_at: '2026-08-20T09:00:00.000Z',
    updated_at: '2026-08-20T09:00:00.000Z',
    ...overrides
  };
}

async function seed(
  name: SyncedTableName,
  row: { id: string } & Record<string, unknown>,
  status: 'pending' | 'synced' | 'error'
) {
  await table(name).put({ ...row, sync_status: status });
}

beforeEach(async () => {
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.deleteEq.mockReset().mockResolvedValue({ error: null });
  mocks.selectPage.mockReset().mockResolvedValue({ data: [], error: null });
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
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
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

  it('acknowledges only the exact revision sent while an edit is in flight', async () => {
    let release!: () => void;
    mocks.upsert.mockImplementation(
      (name: string) =>
        name === 'sessions'
          ? new Promise((resolve) => {
              release = () => resolve({ error: null });
            })
          : Promise.resolve({ error: null })
    );
    await seed('sessions', sessionRow('edit-in-flight', 'Algorithms'), 'pending');

    const flushing = flushPushQueue();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await writeLocal('sessions', sessionRow('edit-in-flight', 'Databases'));
    release();
    await flushing;

    const stored = (await table('sessions').get('edit-in-flight')) as unknown as {
      subject: string;
      sync_status: string;
    };
    expect(stored).toMatchObject({ subject: 'Databases', sync_status: 'pending' });
  });

  it('does not resurrect a row deleted while its upsert is in flight', async () => {
    let release!: () => void;
    mocks.upsert.mockImplementation(
      (name: string) =>
        name === 'sessions'
          ? new Promise((resolve) => {
              release = () => resolve({ error: null });
            })
          : Promise.resolve({ error: null })
    );
    await seed('sessions', sessionRow('delete-in-flight'), 'pending');

    const flushing = flushPushQueue();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await deleteLocal('sessions', 'delete-in-flight');
    release();
    await flushing;

    expect(await table('sessions').get('delete-in-flight')).toBeUndefined();
    expect(mocks.deleteEq).toHaveBeenCalledWith('sessions', 'delete-in-flight');
    expect((await db.meta.get('delete_queue'))?.value).toEqual([]);
  });

  it('never acknowledges an old-user push after the account changes', async () => {
    let release!: () => void;
    mocks.upsert.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ error: null });
        })
    );
    await seed('sessions', sessionRow('old-user-row'), 'pending');

    const flushing = flushPushQueue();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    _enableForTests(USER_2);
    release();
    await flushing;

    expect((await table('sessions').get('old-user-row'))?.sync_status).toBe('pending');
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
      question_snapshot: { answer_source: { sync_status: 'official' } },
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
    await expect(
      writeLocal('pyq_attempts', {
        ...receipt,
        question_snapshot: { answer_source: { sync_status: 'unverified' } }
      })
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
    expect((await db.meta.get('delete_queue'))?.value).toEqual([
      { table: 'sessions', id: 's-3', user_id: USER }
    ]);

    await flushPushQueue();

    expect(mocks.deleteEq).toHaveBeenCalledWith('sessions', 's-3');
    expect((await db.meta.get('delete_queue'))?.value).toEqual([]);
  });

  it('does not restore a queued deletion during pull-before-retry recovery', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let deleteAttempts = 0;
    mocks.deleteEq.mockImplementation(async () => {
      deleteAttempts += 1;
      return deleteAttempts === 1
        ? { error: { message: 'temporary delete failure' } }
        : { error: null };
    });
    await seed('sessions', sessionRow('delete-recovery'), 'synced');
    await deleteLocal('sessions', 'delete-recovery');
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'sessions'
        ? { data: [sessionRow('delete-recovery')], error: null }
        : { data: [], error: null }
    );

    await flushPushQueue();
    await flushPushQueue();

    expect(deleteAttempts).toBe(2);
    expect(await table('sessions').get('delete-recovery')).toBeUndefined();
    expect((await db.meta.get('delete_queue'))?.value).toEqual([]);
  });

  it('pull keeps local pending rows (logged) and overwrites synced ones', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await seed('sessions', sessionRow('s-4', 'LOCAL EDIT'), 'pending');
    await seed('sessions', sessionRow('s-5', 'STALE LOCAL'), 'synced');
    mocks.selectPage.mockImplementation(async (name: string) =>
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

  it('waits for an active push before issuing any pull request', async () => {
    let release!: () => void;
    mocks.upsert.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ error: null });
        })
    );
    await seed('sessions', sessionRow('serialize-me'), 'pending');

    const pushing = flushPushQueue();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const pulling = pullAll(USER);
    expect(mocks.selectPage).not.toHaveBeenCalled();
    release();
    await pushing;
    await pulling;

    expect(mocks.selectPage).toHaveBeenCalledTimes(SYNCED_TABLES.length);
  });

  it('paginates every remote table until a short page is reached', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) =>
      sessionRow(`page-${String(index).padStart(3, '0')}`)
    );
    mocks.selectPage.mockImplementation(
      async (name: string, _user: string, afterId: string | null) => {
        if (name !== 'sessions') return { data: [], error: null };
        if (afterId === null) return { data: firstPage, error: null };
        if (afterId === 'page-499') return { data: [sessionRow('page-500')], error: null };
        return { data: [], error: null };
      }
    );

    await pullAll(USER);

    expect(await table('sessions').count()).toBe(501);
    expect(mocks.selectPage).toHaveBeenCalledWith('sessions', USER, null, 500);
    expect(mocks.selectPage).toHaveBeenCalledWith('sessions', USER, 'page-499', 500);
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
    mocks.selectPage.mockImplementation(async (name: string) =>
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

  it('keeps collision reference rewrites scoped to the receipt owner', async () => {
    const originalId = pyqAttemptId('owner-scoped-session', 'gate-owner', 1);
    const analysisId = pyqJournalQuestionId(originalId);
    const localReceipt = {
      id: originalId,
      user_id: USER,
      pyq_session_id: 'owner-scoped-session',
      question_uid: 'gate-owner',
      attempt_number: 1,
      mark_decision: 'SKIP',
      selected_answer: null,
      time_spent_sec: 8,
      attempted_at: '2026-08-20T09:00:00.000Z'
    };
    await seed('pyq_attempts', localReceipt, 'pending');
    await seed(
      'questions',
      questionRow(analysisId, { source_pyq_attempt_id: originalId }),
      'pending'
    );
    await seed(
      'trigger_phrases',
      {
        id: 'other-user-phrase',
        user_id: USER_2,
        question_ids: [analysisId]
      },
      'synced'
    );
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'pyq_attempts'
        ? {
            data: [
              {
                ...localReceipt,
                mark_decision: 'MARK',
                selected_answer: 'A',
                attempted_at: '2026-08-20T09:01:00.000Z'
              }
            ],
            error: null
          }
        : { data: [], error: null }
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await pullAll(USER);

    expect(await table('trigger_phrases').get('other-user-phrase')).toMatchObject({
      user_id: USER_2,
      question_ids: [analysisId],
      sync_status: 'synced'
    });
  });

  it('rekeys an errored receipt with its analysis graph before remote analyses merge', async () => {
    const sessionId = 'ledger-session';
    const questionUid = 'gate-ledger';
    const originalId = pyqAttemptId(sessionId, questionUid, 1);
    const localAnalysisId = pyqJournalQuestionId(originalId);
    const localReceipt = {
      id: originalId,
      user_id: USER,
      pyq_session_id: sessionId,
      question_uid: questionUid,
      attempt_number: 1,
      mark_decision: 'SKIP',
      selected_answer: null,
      time_spent_sec: 8,
      attempted_at: '2026-08-20T09:00:00.000Z'
    };
    const remoteReceipt = {
      ...localReceipt,
      mark_decision: 'MARK',
      selected_answer: 'A',
      time_spent_sec: 11,
      attempted_at: '2026-08-20T09:01:00.000Z'
    };
    await table('pyq_attempts').put({ ...localReceipt, sync_status: 'error' });
    await seed(
      'pyq_sessions',
      {
        id: sessionId,
        user_id: USER,
        completed_question_uids: [questionUid],
        completed_count: 1,
        elapsed_sec: 8
      },
      'synced'
    );
    await seed(
      'questions',
      questionRow(localAnalysisId, {
        answer_text: 'Local skip analysis',
        source_pyq_attempt_id: originalId
      }),
      'error'
    );
    await seed(
      'reattempts',
      {
        id: 'ledger-review',
        user_id: USER,
        question_id: localAnalysisId,
        scheduled_date: '2026-08-25',
        stage: 'D3',
        history: [],
        created_at: '2026-08-20T09:00:00.000Z'
      },
      'synced'
    );
    await seed(
      'trigger_phrases',
      {
        id: 'ledger-trigger',
        user_id: USER,
        question_ids: ['unrelated-question', localAnalysisId]
      },
      'synced'
    );
    mocks.selectPage.mockImplementation(async (name: string) => {
      if (name === 'pyq_attempts') return { data: [remoteReceipt], error: null };
      if (name === 'questions') {
        return {
          data: [
            questionRow('remote-ledger-analysis', {
              answer_text: 'Remote answer analysis',
              source_pyq_attempt_id: originalId
            })
          ],
          error: null
        };
      }
      return { data: [], error: null };
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await pullAll(USER);

    const attempts = (await table('pyq_attempts').toArray()) as unknown as Array<{
      id: string;
      attempt_number: number;
      sync_status: string;
    }>;
    const rekeyed = attempts.find((row) => row.id !== originalId)!;
    expect(rekeyed).toMatchObject({ attempt_number: 2, sync_status: 'pending' });
    expect(attempts.find((row) => row.id === originalId)).toMatchObject({
      sync_status: 'synced'
    });

    const analyses = (await table('questions').toArray()) as unknown as Array<{
      id: string;
      answer_text: string;
      source_pyq_attempt_id: string;
    }>;
    expect(analyses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pyqJournalQuestionId(rekeyed.id),
          answer_text: 'Local skip analysis',
          source_pyq_attempt_id: rekeyed.id
        }),
        expect.objectContaining({
          id: 'remote-ledger-analysis',
          answer_text: 'Remote answer analysis',
          source_pyq_attempt_id: originalId
        })
      ])
    );
    expect(await table('reattempts').get('ledger-review')).toMatchObject({
      question_id: pyqJournalQuestionId(rekeyed.id),
      sync_status: 'pending'
    });
    expect(await table('trigger_phrases').get('ledger-trigger')).toMatchObject({
      question_ids: ['unrelated-question', pyqJournalQuestionId(rekeyed.id)],
      sync_status: 'pending'
    });
    expect(await table('pyq_sessions').get(sessionId)).toMatchObject({
      completed_question_uids: [questionUid],
      completed_count: 1,
      elapsed_sec: 19,
      sync_status: 'pending'
    });
  });

  it('pulls and repairs a late immutable collision before retrying the failed push', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalId = pyqAttemptId('late-session', 'gate-late', 1);
    const localReceipt = {
      id: originalId,
      user_id: USER,
      pyq_session_id: 'late-session',
      question_uid: 'gate-late',
      attempt_number: 1,
      subject: 'Algorithms',
      year: 2026,
      mark_decision: 'SKIP',
      selected_answer: null,
      time_spent_sec: 5,
      attempted_at: '2026-08-20T09:00:00.000Z'
    };
    const remoteReceipt = {
      ...localReceipt,
      mark_decision: 'MARK',
      selected_answer: 'B',
      attempted_at: '2026-08-20T09:01:00.000Z'
    };
    await seed('pyq_attempts', localReceipt, 'pending');
    let receiptPushes = 0;
    mocks.upsert.mockImplementation(async (name: string) => {
      if (name !== 'pyq_attempts') return { error: null };
      receiptPushes += 1;
      return receiptPushes === 1
        ? { error: { message: 'immutable receipt collision' } }
        : { error: null };
    });
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'pyq_attempts'
        ? { data: [remoteReceipt], error: null }
        : { data: [], error: null }
    );

    await flushPushQueue();
    // The failed push installs a pull barrier. This explicit retry waits for
    // reconciliation rather than resending the colliding original payload.
    await flushPushQueue();

    expect(receiptPushes).toBe(2);
    const pushedReceipts = mocks.upsert.mock.calls
      .filter((call) => call[0] === 'pyq_attempts')
      .map((call) => (call[1] as Array<{ id: string }>)[0]);
    expect(pushedReceipts[0].id).toBe(originalId);
    expect(pushedReceipts[1].id).not.toBe(originalId);
    expect((await table('pyq_attempts').get(originalId)) as unknown).toMatchObject({
      mark_decision: 'MARK',
      sync_status: 'synced'
    });
    expect(await table('pyq_attempts').count()).toBe(2);
  });

  it('lets an authoritative remote migration overwrite a divergent synced receipt', async () => {
    await seed(
      'pyq_attempts',
      {
        id: 'migrated-receipt',
        user_id: USER,
        pyq_session_id: null,
        question_uid: 'gate-q2',
        attempt_number: 1,
        subject: 'Computer Organization',
        mark_decision: 'MARK',
        attempted_at: '2026-08-20T09:00:00.000Z'
      },
      'synced'
    );
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'pyq_attempts'
        ? {
            data: [
              {
                id: 'migrated-receipt',
                user_id: USER,
                pyq_session_id: null,
                question_uid: 'gate-q2',
                attempt_number: 1,
                subject: 'COA',
                subject_id: 'coa',
                mark_decision: 'MARK',
                attempted_at: '2026-08-20T09:00:00.000+00:00'
              }
            ],
            error: null
          }
        : { data: [], error: null }
    );

    await pullAll(USER);

    const rows = (await table('pyq_attempts').toArray()) as unknown as Array<{
      subject: string;
      subject_id: string;
      sync_status: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subject: 'COA', subject_id: 'coa', sync_status: 'synced' });
  });

  it('does not invent a second attempt for a subject-alias-only remote difference', async () => {
    const receipt = {
      id: 'alias-equivalent-receipt',
      user_id: USER,
      pyq_session_id: null,
      question_uid: 'gate-alias',
      attempt_number: 1,
      subject: 'COA',
      subject_id: 'coa',
      mark_decision: 'MARK',
      attempted_at: '2026-08-20T09:00:00.000Z'
    };
    await seed('pyq_attempts', receipt, 'pending');
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'pyq_attempts'
        ? {
            data: [
              {
                ...receipt,
                subject: 'Computer Organization',
                subject_id: null,
                attempted_at: '2026-08-20T09:00:00.000+00:00'
              }
            ],
            error: null
          }
        : { data: [], error: null }
    );

    await pullAll(USER);

    expect(await table('pyq_attempts').count()).toBe(1);
    expect(await table('pyq_attempts').get(receipt.id)).toMatchObject({
      subject: 'COA',
      subject_id: 'coa',
      sync_status: 'synced'
    });
  });

  it('merges a server write-once source link into a pending local question edit', async () => {
    await seed(
      'questions',
      questionRow('linked-edit', { answer_text: 'Local analysis', source_pyq_attempt_id: null }),
      'pending'
    );
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'questions'
        ? {
            data: [
              questionRow('linked-edit', {
                answer_text: 'Remote analysis',
                source_pyq_attempt_id: 'receipt-link'
              })
            ],
            error: null
          }
        : { data: [], error: null }
    );

    await pullAll(USER);

    const stored = (await table('questions').get('linked-edit')) as unknown as {
      answer_text: string;
      source_pyq_attempt_id: string;
      sync_status: string;
    };
    expect(stored).toMatchObject({
      answer_text: 'Local analysis',
      source_pyq_attempt_id: 'receipt-link',
      sync_status: 'pending'
    });
  });

  it('reconciles a different local question ID onto the server analysis ID and repairs references', async () => {
    await seed(
      'questions',
      questionRow('local-analysis', {
        answer_text: 'Newest local analysis',
        source_pyq_attempt_id: 'receipt-one',
        created_at: '2026-08-21T09:00:00.000Z'
      }),
      'pending'
    );
    await seed(
      'reattempts',
      {
        id: 'review-analysis',
        user_id: USER,
        question_id: 'local-analysis',
        scheduled_date: '2026-08-25',
        stage: 'D3',
        history: [],
        created_at: '2026-08-21T09:00:00.000Z'
      },
      'synced'
    );
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'questions'
        ? {
            data: [
              questionRow('remote-analysis', {
                answer_text: 'Older remote analysis',
                source_pyq_attempt_id: 'receipt-one',
                created_at: '2026-08-20T09:00:00.000Z'
              })
            ],
            error: null
          }
        : { data: [], error: null }
    );

    await pullAll(USER);

    const questions = (await table('questions').toArray()) as unknown as Array<{
      id: string;
      answer_text: string;
      source_pyq_attempt_id: string;
      sync_status: string;
    }>;
    expect(questions).toEqual([
      expect.objectContaining({
        id: 'remote-analysis',
        answer_text: 'Newest local analysis',
        source_pyq_attempt_id: 'receipt-one',
        sync_status: 'pending'
      })
    ]);
    expect((await table('reattempts').get('review-analysis'))).toMatchObject({
      question_id: 'remote-analysis',
      sync_status: 'pending'
    });
  });

  it('reconciles topic-progress aliases onto the authoritative remote ID with monotonic completion', async () => {
    await seed(
      'topic_progress',
      topicRow('local-topic', {
        subject: 'Computer Organization',
        subject_id: null,
        completed_at: '2026-08-22T09:00:00.000Z',
        updated_at: '2026-08-22T09:00:00.000Z'
      }),
      'pending'
    );
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'topic_progress'
        ? { data: [topicRow('remote-topic')], error: null }
        : { data: [], error: null }
    );

    await pullAll(USER);

    const rows = (await table('topic_progress').toArray()) as unknown as Array<{
      id: string;
      subject: string;
      subject_id: string;
      completed_at: string;
      sync_status: string;
    }>;
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'remote-topic',
        subject: 'COA',
        subject_id: 'coa',
        completed_at: '2026-08-22T09:00:00.000Z',
        sync_status: 'pending'
      })
    ]);
  });

  it('keeps the initial pull barrier closed when a parent table page fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await seed('questions', questionRow('must-not-push'), 'pending');
    mocks.selectPage.mockImplementation(async (name: string) =>
      name === 'pyq_attempts'
        ? { data: null, error: { message: 'parent unavailable' } }
        : { data: [], error: null }
    );

    initSync(USER);
    await vi.waitFor(() =>
      expect(mocks.selectPage.mock.calls.some((call) => call[0] === 'pyq_attempts')).toBe(true)
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocks.upsert).not.toHaveBeenCalled();
    expect((await table('questions').get('must-not-push'))?.sync_status).toBe('pending');
  });

  it('starts a fresh initial pull when the account changes mid-barrier', async () => {
    const oldUserReleases: Array<() => void> = [];
    mocks.selectPage.mockImplementation(
      (_name: string, userId: string) =>
        userId === USER
          ? new Promise((resolve) => {
              oldUserReleases.push(() => resolve({ data: [], error: null }));
            })
          : Promise.resolve({ data: [], error: null })
    );

    initSync(USER);
    await vi.waitFor(() => expect(oldUserReleases).toHaveLength(SYNCED_TABLES.length));
    initSync(USER_2);
    for (const release of oldUserReleases) release();

    await vi.waitFor(() => {
      const newUserCalls = mocks.selectPage.mock.calls.filter((call) => call[1] === USER_2);
      expect(newUserCalls).toHaveLength(SYNCED_TABLES.length);
    });
  });

  it('starts table pulls in parallel and deduplicates an overlapping refresh', async () => {
    const release: Array<() => void> = [];
    mocks.selectPage.mockImplementation(
      () =>
        new Promise((resolve) => {
          release.push(() => resolve({ data: [], error: null }));
        })
    );

    const first = pullAll(USER);
    const overlapping = pullAll(USER);

    expect(overlapping).toBe(first);
    await vi.waitFor(() => expect(mocks.selectPage).toHaveBeenCalledTimes(SYNCED_TABLES.length));

    for (const resolve of release) resolve();
    await first;
  });
});
