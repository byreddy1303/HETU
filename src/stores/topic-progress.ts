import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { db } from '@/lib/db';
import { currentUserId } from '@/stores/auth';

export type TopicCompletions = Record<string, string>;

interface TopicProgressState {
  /** Completion timestamp by user id, then stable subject/topic key. */
  byUser: Record<string, TopicCompletions>;
  setCompleted: (userId: string | null | undefined, topicId: string, completed: boolean) => void;
  migrateUserCompletions: (targetUserId: string) => void;
}

export function topicProgressId(subject: string, topic: string): string {
  return `${subject}::${topic}`;
}

export function selectCompletionsForUser(
  byUser: Record<string, TopicCompletions> | undefined,
  userId?: string | null
): TopicCompletions {
  if (!byUser) return {};

  const effectiveId = userId || currentUserId() || 'guest';
  if (byUser[effectiveId] && Object.keys(byUser[effectiveId]).length > 0) {
    return byUser[effectiveId];
  }

  // Priority search for legacy / fallback user keys (sandbox, guest, default, undefined, null)
  const fallbackKeys = [
    '00000000-0000-4000-8000-00000000dev0',
    'guest',
    'sandbox',
    'default',
    'undefined',
    'null'
  ];

  for (const key of fallbackKeys) {
    if (key !== effectiveId && byUser[key] && Object.keys(byUser[key]).length > 0) {
      return byUser[key];
    }
  }

  // Fallback: search any non-empty completions in byUser
  for (const [key, comp] of Object.entries(byUser)) {
    if (key !== effectiveId && comp && Object.keys(comp).length > 0) {
      return comp;
    }
  }

  return {};
}

export async function syncTopicProgressFromDb(userId?: string | null): Promise<void> {
  try {
    const effectiveUserId = userId || currentUserId() || 'guest';
    const store = useTopicProgressStore.getState();
    const current = store.byUser[effectiveUserId];
    if (current && Object.keys(current).length > 0) return;

    let restored: TopicCompletions | null = null;
    const userRow = await db.meta.get(`topic_progress_${effectiveUserId}`);
    if (userRow?.value && typeof userRow.value === 'object') {
      restored = userRow.value as TopicCompletions;
    } else {
      const globalRow = await db.meta.get('air.topic-progress');
      if (globalRow?.value && typeof globalRow.value === 'object') {
        const g = globalRow.value as Record<string, TopicCompletions>;
        restored = selectCompletionsForUser(g, effectiveUserId);
      }
    }

    if (restored && Object.keys(restored).length > 0) {
      useTopicProgressStore.setState((s) => ({
        byUser: {
          ...s.byUser,
          [effectiveUserId]: restored!
        }
      }));
    }
  } catch {
    // Ignore errors when IndexedDB is disabled or unavailable
  }
}

export const useTopicProgressStore = create<TopicProgressState>()(
  persist(
    (set, get) => ({
      byUser: {},
      setCompleted: (userId, topicId, completed) =>
        set((state) => {
          const effectiveUserId = userId || currentUserId() || 'guest';
          const existing = state.byUser[effectiveUserId];
          const base =
            existing && Object.keys(existing).length > 0
              ? existing
              : selectCompletionsForUser(state.byUser, effectiveUserId);

          const next = { ...base };

          if (completed) next[topicId] = new Date().toISOString();
          else delete next[topicId];

          const nextByUser = {
            ...state.byUser,
            [effectiveUserId]: next
          };

          try {
            void db.meta.put({ key: 'air.topic-progress', value: nextByUser });
            if (effectiveUserId) {
              void db.meta.put({ key: `topic_progress_${effectiveUserId}`, value: next });
            }
          } catch {
            // Ignore IndexedDB write errors
          }

          return { byUser: nextByUser };
        }),

      migrateUserCompletions: (targetUserId: string) => {
        const state = get();
        const completions = selectCompletionsForUser(state.byUser, targetUserId);
        if (completions && Object.keys(completions).length > 0) {
          set({
            byUser: {
              ...state.byUser,
              [targetUserId]: completions
            }
          });
          try {
            void db.meta.put({ key: `topic_progress_${targetUserId}`, value: completions });
          } catch {
            // ignore
          }
        }
      }
    }),
    {
      name: 'air.topic-progress',
      version: 1,
      storage: createJSONStorage(() => localStorage)
    }
  )
);

