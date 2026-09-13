// Online-only facade tests. Postgres is the single source of truth; these
// suites run without Supabase env, so writes hit the RAM cache only while
// still exercising the write-through contract (immutability, batches, deletes).
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalData, consumeLocalWrite, db, noteLocalWrite } from '@/lib/db';
import {
  _enableForTests,
  deleteLocal,
  flushPendingSync,
  initSync,
  isSyncEnabled,
  pendingSyncCount,
  stopSync,
  writeLocal,
  writeLocalBatch
} from '@/lib/sync';

const USER = 'user-1';

function sessionRow(id: string, subject = 'Algorithms') {
  return {
    id,
    user_id: USER,
    date: '2026-08-31',
    subject,
    subject_id: null,
    outcome: 'M',
    elapsed_sec: 120,
    interrupted: false,
    created_at: '2026-08-31T06:00:00.000Z',
    updated_at: '2026-08-31T06:00:00.000Z',
    sync_status: 'pending' as const
  };
}

function attemptRow(id: string) {
  return {
    id,
    user_id: USER,
    pyq_session_id: 'ps-1',
    question_uid: 'q-100',
    subject: 'Algorithms',
    subject_id: null,
    year: 2024,
    answer_status: 'answered',
    selected_answer: 'B',
    mark_decision: null,
    mark_correct: null,
    attempt_number: 1,
    time_spent_sec: 45,
    attempted_at: '2026-08-31T06:01:00.000Z',
    created_at: '2026-08-31T06:01:00.000Z',
    capture_version: 3,
    sync_status: 'synced' as const
  };
}

beforeEach(async () => {
  await clearLocalData();
  _enableForTests(USER);
});

describe('write-through facade', () => {
  it('writeLocal commits a row to the repository', async () => {
    await writeLocal('sessions', sessionRow('s-1'));
    const kept = await db.sessions.get('s-1');
    expect(kept).toMatchObject({ id: 's-1', user_id: USER, subject: 'Algorithms' });
    expect(kept?.sync_status).toBe('synced');
  });

  it('writeLocalBatch writes across tables atomically-ish', async () => {
    const pattern: { id: string; user_id: string; name: string; subject: string; count: number; sync_status: string } = {
      id: 'p-1',
      user_id: USER,
      name: 'Sets',
      subject: 'Algorithms',
      count: 2,
      sync_status: 'pending'
    };
    await writeLocalBatch([
      { name: 'sessions', row: sessionRow('s-1') },
      { name: 'sessions', row: sessionRow('s-2', 'Networks') },
      { name: 'patterns', row: pattern }
    ]);
    expect(await db.sessions.count()).toBe(2);
    expect((await db.patterns.get('p-1'))?.count).toBe(2);
  });

  it('deleteLocal removes the row', async () => {
    await writeLocal('sessions', sessionRow('s-1'));
    await deleteLocal('sessions', 's-1');
    expect(await db.sessions.get('s-1')).toBeUndefined();
  });

  it('pendingSyncCount is always zero and flushPendingSync always succeeds', async () => {
    await writeLocal('sessions', sessionRow('s-1'));
    expect(await pendingSyncCount(USER)).toBe(0);
    await expect(flushPendingSync(USER)).resolves.toBe(true);
  });

  it('refuses to mutate committed pyq_attempts and learning_events', async () => {
    await writeLocal('pyq_attempts', attemptRow('att-1'));
    await expect(writeLocal('pyq_attempts', { ...attemptRow('att-1'), selected_answer: 'C' })).rejects.toThrow(
      /immutable/i
    );
    await expect(deleteLocal('pyq_attempts', 'att-1')).rejects.toThrow(/immutable/i);
  });

  it('initSync is inert without Supabase env and stopSync clears the cache', async () => {
    expect(isSyncEnabled()).toBe(true); // _enableForTests
    initSync(USER);
    await writeLocal('sessions', sessionRow('s-1'));
    stopSync();
    expect(await db.sessions.count()).toBe(0);
  });
});

describe('same-device write echo suppression', () => {
  it('marks a committed row so its realtime echo is skipped once', () => {
    noteLocalWrite('sessions', 's-1');
    expect(consumeLocalWrite('sessions', 's-1')).toBe(true);
    // The marker is consumed, so a second echo for the same row refreshes.
    expect(consumeLocalWrite('sessions', 's-1')).toBe(false);
  });

  it('does not suppress echoes for rows this device never wrote', () => {
    expect(consumeLocalWrite('topic_progress', 'never-written')).toBe(false);
  });

  it('keeps markers scoped per table', () => {
    noteLocalWrite('sessions', 's-1');
    expect(consumeLocalWrite('questions', 's-1')).toBe(false);
    expect(consumeLocalWrite('sessions', 's-1')).toBe(true);
  });
});