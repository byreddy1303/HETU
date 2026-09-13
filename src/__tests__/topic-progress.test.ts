import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTopicCompletions,
  selectCompletionsForUser,
  syncTopicProgressFromDb,
  topicProgressId,
  useTopicProgressStore
} from '@/stores/topic-progress';
import { db } from '@/lib/db';
import { deleteLocal, writeLocal, writeLocalBatch } from '@/lib/sync';

vi.mock('@/lib/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sync')>();
  return {
    ...actual,
    deleteLocal: vi.fn(actual.deleteLocal),
    writeLocal: vi.fn(actual.writeLocal),
    writeLocalBatch: vi.fn(actual.writeLocalBatch)
  };
});

const USER = '11111111-1111-4111-8111-111111111111';

describe('topic progress store', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.topic_progress.clear();
    useTopicProgressStore.setState({ byUser: {} });
  });

  it('keeps completion records scoped to each user', async () => {
    vi.setSystemTime(new Date('2026-08-08T10:00:00.000Z'));
    const id = topicProgressId('Algorithms', 'Divide & Conquer');

    await useTopicProgressStore.getState().setCompleted('user-a', id, true);

    expect(useTopicProgressStore.getState().byUser['user-a'][id]).toBe('2026-08-08T10:00:00.000Z');
    expect(useTopicProgressStore.getState().byUser['user-b']).toBeUndefined();
    vi.useRealTimers();
  });

  it('removes the timestamp when a topic is unticked', async () => {
    const id = topicProgressId('Databases', 'ER Model');
    const store = useTopicProgressStore.getState();

    await store.setCompleted('user-a', id, true);
    await useTopicProgressStore.getState().setCompleted('user-a', id, false);

    expect(useTopicProgressStore.getState().byUser['user-a'][id]).toBeUndefined();
  });

  it('selects exactly one account and never borrows another user completion', () => {
    const algorithms = topicProgressId('Algorithms', 'Divide & Conquer');
    const databases = topicProgressId('Databases', 'ER Model');
    const byUser = {
      'user-a': { [algorithms]: '2026-08-08T10:00:00.000Z' },
      'user-b': { [databases]: '2026-08-09T10:00:00.000Z' }
    };

    expect(selectCompletionsForUser(byUser, 'user-b')).toEqual({
      [databases]: '2026-08-09T10:00:00.000Z'
    });
    expect(selectCompletionsForUser(byUser, 'user-with-no-progress')).toEqual({});
    expect(selectCompletionsForUser(byUser, null)).toEqual({});
  });

  it('uses canonical subject keys for aliases', () => {
    expect(topicProgressId('Database Management System', 'ER Model')).toBe('Databases::ER Model');
    expect(topicProgressId('Computer Network', 'TCP')).toBe('Computer Networks::TCP');
  });

  it('merges alias keys by newest completion and preserves unknown subjects', () => {
    expect(
      normalizeTopicCompletions({
        'DBMS::ER Model': '2026-08-01T10:00:00.000Z',
        'Database Management System::ER Model': '2026-08-02T10:00:00.000Z',
        'Software Engineering::Testing': '2026-08-03T10:00:00.000Z'
      })
    ).toEqual({
      'Databases::ER Model': '2026-08-02T10:00:00.000Z',
      'Software Engineering::Testing': '2026-08-03T10:00:00.000Z'
    });
  });

  it('normalizes alias input before updating the persisted user map', async () => {
    vi.setSystemTime(new Date('2026-08-08T10:00:00.000Z'));
    await useTopicProgressStore
      .getState()
      .setCompleted('user-a', 'Computer Organization::Cache', true);

    expect(useTopicProgressStore.getState().byUser['user-a']).toEqual({
      'COA::Cache': '2026-08-08T10:00:00.000Z'
    });
    vi.useRealTimers();
  });

  it('migrates a legacy localStorage blob into topic_progress rows in one batched write', async () => {
    const legacyByUser: Record<string, string> = {
      [topicProgressId('Algorithms', 'Greedy — Huffman / MST')]: '2026-08-01T10:00:00.000Z',
      [topicProgressId('Databases', 'SQL — Joins & Subqueries')]: '2026-08-02T10:00:00.000Z'
    };
    localStorage.setItem(
      'air.topic-progress',
      JSON.stringify({ state: { byUser: { [USER]: legacyByUser } }, version: 1 })
    );

    await syncTopicProgressFromDb(USER);

    const rows = await db.topic_progress.where('user_id').equals(USER).toArray();
    const byTopic = new Map(rows.map((row) => [row.topic, row]));
    expect(rows.length).toBe(2);
    expect(byTopic.get('Greedy — Huffman / MST')?.completed_at).toBe(
      '2026-08-01T10:00:00.000Z'
    );
    expect(byTopic.get('Greedy — Huffman / MST')?.subject).toBe('Algorithms');
    expect(byTopic.get('SQL — Joins & Subqueries')?.completed_at).toBe('2026-08-02T10:00:00.000Z');
  });

  it('does not re-migrate already-owned legacy rows or regress newer timestamps', async () => {
    const newer = '2026-09-01T10:00:00.000Z';
    await db.topic_progress.put({
      id: `row-er-${USER}`,
      user_id: USER,
      subject: 'Databases',
      subject_id: 'databases',
      topic: 'ER Model',
      completed_at: newer,
      updated_at: newer,
      sync_status: 'synced'
    });
    localStorage.setItem(
      'air.topic-progress',
      JSON.stringify({
        state: {
          byUser: { [USER]: { [topicProgressId('Databases', 'ER Model')]: '2026-08-01T10:00:00.000Z' } }
        },
        version: 1
      })
    );

    await syncTopicProgressFromDb(USER);

    const rows = await db.topic_progress.where('user_id').equals(USER).toArray();
    expect(rows.length).toBe(1);
    expect(rows[0].completed_at).toBe(newer);
    expect(rows[0].id).toBe(`row-er-${USER}`);
  });

  it('reverts the optimistic check when the durable write fails', async () => {
    const id = topicProgressId('Algorithms', 'Divide & Conquer');
    vi.mocked(writeLocal).mockRejectedValueOnce(
      new Error('write failed for topic_progress: connection reset')
    );

    await expect(
      useTopicProgressStore.getState().setCompleted(USER, id, true)
    ).rejects.toThrow(/NOT saved/);

    // The UI must not claim a save the durable store did not confirm.
    expect(useTopicProgressStore.getState().byUser[USER]?.[id]).toBeUndefined();
    expect(await db.topic_progress.where('user_id').equals(USER).toArray()).toEqual([]);
  });

  it('restores the previous timestamp when an untick fails to reach the durable store', async () => {
    const id = topicProgressId('Databases', 'ER Model');

    await useTopicProgressStore.getState().setCompleted(USER, id, true);
    const savedAt = useTopicProgressStore.getState().byUser[USER][id];
    expect(savedAt).toBeTruthy();

    vi.mocked(deleteLocal).mockRejectedValueOnce(
      new Error('delete failed for topic_progress/row: connection reset')
    );

    await expect(
      useTopicProgressStore.getState().setCompleted(USER, id, false)
    ).rejects.toThrow(/NOT saved/);

    expect(useTopicProgressStore.getState().byUser[USER][id]).toBe(savedAt);
    expect(await db.topic_progress.where('user_id').equals(USER).toArray()).toHaveLength(1);
  });

  it('keeps the legacy localStorage backup when the migration write fails', async () => {
    const legacyByUser: Record<string, string> = {
      [topicProgressId('Algorithms', 'Greedy — Huffman / MST')]: '2026-08-01T10:00:00.000Z'
    };
    localStorage.setItem(
      'air.topic-progress',
      JSON.stringify({ state: { byUser: { [USER]: legacyByUser } }, version: 1 })
    );
    vi.mocked(writeLocalBatch).mockRejectedValueOnce(
      new Error('write to topic_progress was NOT saved')
    );

    await expect(syncTopicProgressFromDb(USER)).rejects.toThrow();

    // The last non-durable copy must survive so the next visit can retry.
    expect(localStorage.getItem('air.topic-progress')).not.toBeNull();
    expect(await db.topic_progress.where('user_id').equals(USER).toArray()).toEqual([]);
  });
});
