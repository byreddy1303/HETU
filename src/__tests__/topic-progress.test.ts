import { beforeEach, describe, expect, it, vi } from 'vitest';
import { topicProgressId, useTopicProgressStore } from '@/stores/topic-progress';

describe('topic progress store', () => {
  beforeEach(() => {
    localStorage.clear();
    useTopicProgressStore.setState({ byUser: {} });
  });

  it('keeps completion records scoped to each user', () => {
    vi.setSystemTime(new Date('2026-08-08T10:00:00.000Z'));
    const id = topicProgressId('Algorithms', 'Divide & Conquer');

    useTopicProgressStore.getState().setCompleted('user-a', id, true);

    expect(useTopicProgressStore.getState().byUser['user-a'][id]).toBe(
      '2026-08-08T10:00:00.000Z'
    );
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
});
