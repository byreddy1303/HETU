import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { db } from '@/lib/db';
import { currentUserId } from '@/stores/auth';
import { deleteLocal, writeLocal } from '@/lib/sync';
import { nowISO, uuidFromString } from '@/lib/utils';
import { canonicalSubjectId, canonicalSubjectLabel } from '@/lib/subjects';

export type TopicCompletions = Record<string, string>;

interface TopicProgressState {
  /** Completion timestamp by user id, then stable subject/topic key. */
  byUser: Record<string, TopicCompletions>;
  setCompleted: (userId: string | null | undefined, topicId: string, completed: boolean) => void;
  migrateUserCompletions: (targetUserId: string) => void;
}

export function topicProgressId(subject: string, topic: string): string {
  return `${canonicalSubjectLabel(subject)}::${topic.trim()}`;
}

function splitTopicProgressId(id: string): { subject: string; topic: string } | null {
  const divider = id.indexOf('::');
  if (divider <= 0 || divider >= id.length - 2) return null;
  return {
    subject: canonicalSubjectLabel(id.slice(0, divider)),
    topic: id.slice(divider + 2).trim()
  };
}

export function topicProgressRowId(userId: string, subject: string, topic: string): string {
  return uuidFromString(
    `topic-progress:${userId}:${canonicalSubjectLabel(subject)}:${topic.trim()}`
  );
}

/** Merge aliases onto one key and keep the newest completion timestamp. */
export function normalizeTopicCompletions(
  completions: TopicCompletions | null | undefined
): TopicCompletions {
  const normalized: TopicCompletions = {};
  for (const [key, completedAt] of Object.entries(completions ?? {})) {
    if (typeof completedAt !== 'string') continue;
    const parsed = splitTopicProgressId(key);
    if (!parsed) continue;
    const canonicalKey = topicProgressId(parsed.subject, parsed.topic);
    if (!normalized[canonicalKey] || normalized[canonicalKey] < completedAt) {
      normalized[canonicalKey] = completedAt;
    }
  }
  return normalized;
}

function normalizeByUser(
  byUser: Record<string, TopicCompletions> | null | undefined
): Record<string, TopicCompletions> {
  return Object.fromEntries(
    Object.entries(byUser ?? {}).map(([userId, completions]) => [
      userId,
      normalizeTopicCompletions(completions)
    ])
  );
}

function mergeCompletions(...groups: (TopicCompletions | null | undefined)[]): TopicCompletions {
  const merged: TopicCompletions = {};
  for (const group of groups) {
    for (const [key, completedAt] of Object.entries(normalizeTopicCompletions(group))) {
      if (!merged[key] || merged[key] < completedAt) merged[key] = completedAt;
    }
  }
  return merged;
}

async function matchingTopicRows(userId: string, subject: string, topic: string) {
  const canonicalSubject = canonicalSubjectLabel(subject);
  return (await db.topic_progress.where('user_id').equals(userId).toArray()).filter(
    (row) =>
      canonicalSubjectLabel(row.subject) === canonicalSubject && row.topic.trim() === topic.trim()
  );
}

async function persistTopicCompletion(
  userId: string,
  subject: string,
  topic: string,
  completedAt: string
): Promise<void> {
  const canonicalSubject = canonicalSubjectLabel(subject);
  const existing = (await matchingTopicRows(userId, canonicalSubject, topic)).sort((a, b) =>
    b.completed_at.localeCompare(a.completed_at)
  )[0];
  await writeLocal('topic_progress', {
    id: existing?.id ?? topicProgressRowId(userId, canonicalSubject, topic),
    user_id: userId,
    subject: canonicalSubject,
    subject_id: canonicalSubjectId(canonicalSubject),
    topic: topic.trim(),
    completed_at: completedAt,
    updated_at: completedAt
  });
}

async function removeTopicCompletion(
  userId: string,
  subject: string,
  topic: string
): Promise<void> {
  const rows = await matchingTopicRows(userId, subject, topic);
  if (rows.length === 0) {
    await deleteLocal('topic_progress', topicProgressRowId(userId, subject, topic));
    return;
  }
  await Promise.all(rows.map((row) => deleteLocal('topic_progress', row.id)));
}

export function selectCompletionsForUser(
  byUser: Record<string, TopicCompletions> | undefined,
  userId?: string | null
): TopicCompletions {
  if (!byUser) return {};

  const effectiveId = userId || currentUserId() || 'guest';
  if (byUser[effectiveId] && Object.keys(byUser[effectiveId]).length > 0) {
    return normalizeTopicCompletions(byUser[effectiveId]);
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
      return normalizeTopicCompletions(byUser[key]);
    }
  }

  // Fallback: search any non-empty completions in byUser
  for (const [key, comp] of Object.entries(byUser)) {
    if (key !== effectiveId && comp && Object.keys(comp).length > 0) {
      return normalizeTopicCompletions(comp);
    }
  }

  return {};
}

export async function syncTopicProgressFromDb(userId?: string | null): Promise<void> {
  try {
    const effectiveUserId = userId || currentUserId() || 'guest';
    const store = useTopicProgressStore.getState();
    const current = normalizeTopicCompletions(store.byUser[effectiveUserId]);

    let restored: TopicCompletions | null = null;
    const userRow = await db.meta.get(`topic_progress_${effectiveUserId}`);
    if (userRow?.value && typeof userRow.value === 'object') {
      restored = normalizeTopicCompletions(userRow.value as TopicCompletions);
    } else {
      const globalRow = await db.meta.get('air.topic-progress');
      if (globalRow?.value && typeof globalRow.value === 'object') {
        const g = globalRow.value as Record<string, TopicCompletions>;
        restored = selectCompletionsForUser(g, effectiveUserId);
      }
    }

    const legacy = mergeCompletions(restored, current);
    const syncedRows = await db.topic_progress.where('user_id').equals(effectiveUserId).toArray();
    const merged: TopicCompletions = { ...legacy };
    for (const row of syncedRows) {
      const key = topicProgressId(row.subject, row.topic);
      if (!merged[key] || merged[key] < row.completed_at) merged[key] = row.completed_at;
    }

    // One-time migration of legacy localStorage/meta progress into the normal
    // local-first sync engine. Deterministic IDs make repeated runs idempotent.
    for (const [key, completedAt] of Object.entries(legacy)) {
      const parsed = splitTopicProgressId(key);
      if (!parsed) continue;
      const id = topicProgressRowId(effectiveUserId, parsed.subject, parsed.topic);
      if (
        syncedRows.some(
          (row) =>
            canonicalSubjectLabel(row.subject) === parsed.subject &&
            row.topic.trim() === parsed.topic
        )
      )
        continue;
      await writeLocal('topic_progress', {
        id,
        user_id: effectiveUserId,
        subject: parsed.subject,
        subject_id: canonicalSubjectId(parsed.subject),
        topic: parsed.topic,
        completed_at: completedAt,
        updated_at: completedAt
      });
    }

    useTopicProgressStore.setState((s) => ({
      byUser: { ...s.byUser, [effectiveUserId]: merged }
    }));
    await db.meta.put({ key: `topic_progress_${effectiveUserId}`, value: merged });
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
          const existing = normalizeTopicCompletions(state.byUser[effectiveUserId]);
          const base =
            existing && Object.keys(existing).length > 0
              ? existing
              : selectCompletionsForUser(state.byUser, effectiveUserId);

          const next = { ...base };
          const parsed = splitTopicProgressId(topicId);
          const canonicalTopicId = parsed ? topicProgressId(parsed.subject, parsed.topic) : topicId;

          if (completed) next[canonicalTopicId] = new Date().toISOString();
          else delete next[canonicalTopicId];

          const nextByUser = {
            ...state.byUser,
            [effectiveUserId]: next
          };

          try {
            void db.meta.put({ key: 'air.topic-progress', value: nextByUser });
            if (effectiveUserId) {
              void db.meta.put({ key: `topic_progress_${effectiveUserId}`, value: next });
            }
            if (parsed) {
              if (completed) {
                const timestamp = next[canonicalTopicId] ?? nowISO();
                void persistTopicCompletion(
                  effectiveUserId,
                  parsed.subject,
                  parsed.topic,
                  timestamp
                ).catch(() => undefined);
              } else {
                void removeTopicCompletion(effectiveUserId, parsed.subject, parsed.topic).catch(
                  () => undefined
                );
              }
            }
          } catch {
            // Ignore IndexedDB write errors
          }

          return { byUser: nextByUser };
        }),

      migrateUserCompletions: (targetUserId: string) => {
        const state = get();
        const completions = normalizeTopicCompletions(
          selectCompletionsForUser(state.byUser, targetUserId)
        );
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const previous = (persisted ?? {}) as Partial<TopicProgressState>;
        return { ...previous, byUser: normalizeByUser(previous.byUser) } as TopicProgressState;
      },
      merge: (persisted, current) => {
        const previous = (persisted ?? {}) as Partial<TopicProgressState>;
        return {
          ...current,
          ...previous,
          byUser: normalizeByUser(previous.byUser)
        };
      }
    }
  )
);
