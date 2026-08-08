import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type TopicCompletions = Record<string, string>;

interface TopicProgressState {
  /** Completion timestamp by user id, then stable subject/topic key. */
  byUser: Record<string, TopicCompletions>;
  setCompleted: (userId: string, topicId: string, completed: boolean) => void;
}

export function topicProgressId(subject: string, topic: string): string {
  return `${subject}::${topic}`;
}

export const useTopicProgressStore = create<TopicProgressState>()(
  persist(
    (set) => ({
      byUser: {},
      setCompleted: (userId, topicId, completed) =>
        set((state) => {
          const current = state.byUser[userId] ?? {};
          const next = { ...current };

          if (completed) next[topicId] = new Date().toISOString();
          else delete next[topicId];

          return {
            byUser: {
              ...state.byUser,
              [userId]: next
            }
          };
        })
    }),
    {
      name: 'air.topic-progress',
      version: 1,
      storage: createJSONStorage(() => localStorage)
    }
  )
);
