import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTopicCompletions,
  topicProgressId,
  useTopicProgressStore
} from '@/stores/topic-progress';

describe('topic progress store', () => {
  beforeEach(() => {
    localStorage.clear();
    useTopicProgressStore.setState({ byUser: {} });
  });

  it('keeps completion records scoped to each user', () => {
    vi.setSystemTime(new Date('2026-08-08T10:00:00.000Z'));
    const id = topicProgressId('Algorithms', 'Divide & Conquer');

    useTopicProgressStore.getState().setCompleted('user-a', id, true);

    expect(useTopicProgressStore.getState().byUser['user-a'][id]).toBe('2026-08-08T10:00:00.000Z');
    expect(useTopicProgressStore.getState().byUser['user-b']).toBeUndefined();
    vi.useRealTimers();
  });

  it('removes the timestamp when a topic is unticked', () => {
    const id = topicProgressId('Databases', 'ER Model');
    const store = useTopicProgressStore.getState();

    store.setCompleted('user-a', id, true);
    useTopicProgressStore.getState().setCompleted('user-a', id, false);

    expect(useTopicProgressStore.getState().byUser['user-a'][id]).toBeUndefined();
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

  it('normalizes alias input before updating the persisted user map', () => {
    vi.setSystemTime(new Date('2026-08-08T10:00:00.000Z'));
    useTopicProgressStore.getState().setCompleted('user-a', 'Computer Organization::Cache', true);

    expect(useTopicProgressStore.getState().byUser['user-a']).toEqual({
      'COA::Cache': '2026-08-08T10:00:00.000Z'
    });
    vi.useRealTimers();
  });
});
