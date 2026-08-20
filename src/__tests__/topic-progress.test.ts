import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeTopicProgressRows,
  selectCompletionsForUser,
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

  it('treats an explicitly empty user scope as authoritative', () => {
    const id = topicProgressId('Databases', 'ER Model');
    const byUser = {
      'user-a': {},
      'user-b': { [id]: '2026-08-08T10:00:00.000Z' }
    };

    expect(selectCompletionsForUser(byUser, 'user-a')).toEqual({});
    expect(selectCompletionsForUser(byUser, 'user-c')).toEqual({});
  });

  it('merges rows that arrive from a delayed cloud pull', () => {
    const id = topicProgressId('Discrete Mathematics', 'Propositional Logic');
    const restored = mergeTopicProgressRows({}, [
      {
        subject: 'Discrete Mathematics',
        topic: 'Propositional Logic',
        completed_at: '2026-08-08T10:00:00.000Z'
      }
    ]);

    expect(restored[id]).toBe('2026-08-08T10:00:00.000Z');
  });
});
