import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTopicCompletions,
  selectCompletionsForUser,
  topicProgressId,
  useTopicProgressStore
} from '@/stores/topic-progress';
import { db } from '@/lib/db';

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
});
