import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { db } from '@/lib/db';
import { currentUserId } from '@/stores/auth';
import { deleteLocal, writeLocal } from '@/lib/sync';
import { nowISO, uuidFromString } from '@/lib/utils';

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

function splitTopicProgressId(id: string): { subject: string; topic: string } | null {
  const divider = id.indexOf('::');
  if (divider <= 0 || divider >= id.length - 2) return null;
  return { subject: id.slice(0, divider), topic: id.slice(divider + 2) };
}

export function topicProgressRowId(userId: string, subject: string, topic: string): string {
  return uuidFromString(`topic-progress:${userId}:${subject}:${topic}`);
}

export function selectCompletionsForUser(
  byUser: Record<string, TopicCompletions> | undefined,
  userId?: string | null
): TopicCompletions {
  if (!byUser) return {};

  const effectiveId = userId || currentUserId() || 'guest';
  if (Object.prototype.hasOwnProperty.call(byUser, effectiveId)) {
    return byUser[effectiveId] ?? {};
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

  return {};
}

/** Merge cloud/Dexie rows into the user's optimistic in-memory completions. */
export function mergeTopicProgressRows(
  completions: TopicCompletions,
  rows: readonly { subject: string; topic: string; completed_at: string }[]
): TopicCompletions {
  if (rows.length === 0) return completions;

  const merged = { ...completions };
  for (const row of rows) {
    const key = topicProgressId(row.subject, row.topic);
    if (!merged[key] || merged[key] < row.completed_at) merged[key] = row.completed_at;
  }
  return merged;
}

export async function syncTopicProgressFromDb(userId?: string | null): Promise<void> {
  try {
    const effectiveUserId = userId || currentUserId() || 'guest';
    const store = useTopicProgressStore.getState();
    const current = store.byUser[effectiveUserId] ?? {};

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

    const legacy = { ...(restored ?? {}), ...current };
    const syncedRows = await db.topic_progress.where('user_id').equals(effectiveUserId).toArray();
    const merged = mergeTopicProgressRows(legacy, syncedRows);

    // One-time migration of legacy localStorage/meta progress into the normal
    // local-first sync engine. Deterministic IDs make repeated runs idempotent.
    for (const [key, completedAt] of Object.entries(legacy)) {
      const parsed = splitTopicProgressId(key);
      if (!parsed) continue;
      const id = topicProgressRowId(effectiveUserId, parsed.subject, parsed.topic);
      if (syncedRows.some((row) => row.id === id)) continue;
      await writeLocal('topic_progress', {
        id,
        user_id: effectiveUserId,
        subject: parsed.subject,
        topic: parsed.topic,
        completed_at: completedAt,
        updated_at: completedAt
      });
    }

    useTopicProgressStore.setState((s) => ({
      byUser: { ...s.byUser, [effectiveUserId]: merged }
    }));
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
          const base = existing ?? selectCompletionsForUser(state.byUser, effectiveUserId);

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
            const parsed = splitTopicProgressId(topicId);
            if (parsed) {
              const id = topicProgressRowId(effectiveUserId, parsed.subject, parsed.topic);
              if (completed) {
                const timestamp = next[topicId] ?? nowISO();
                void writeLocal('topic_progress', {
                  id,
                  user_id: effectiveUserId,
                  subject: parsed.subject,
                  topic: parsed.topic,
                  completed_at: timestamp,
                  updated_at: timestamp
                });
              } else {
                void deleteLocal('topic_progress', id);
              }
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
