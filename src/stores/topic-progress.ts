import { create } from 'zustand';
import { db } from '@/lib/db';
import {
  awaitInitialPull,
  deleteLocal,
  flushPendingSync,
  isSyncEnabled,
  writeLocal
} from '@/lib/sync';
import { nowISO, uuidFromString } from '@/lib/utils';
import { canonicalSubjectId, canonicalSubjectLabel } from '@/lib/subjects';
import type { TopicProgressRow } from '@/types';

export type TopicCompletions = Record<string, string>;

interface TopicProgressState {
  /** In-memory view cache only. Supabase/Dexie rows are the source of truth. */
  byUser: Record<string, TopicCompletions>;
  setCompleted: (userId: string, topicId: string, completed: boolean) => Promise<void>;
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

export function completionsFromTopicRows(
  rows: Array<Pick<TopicProgressRow, 'subject' | 'topic' | 'completed_at'>>
): TopicCompletions {
  const completions: TopicCompletions = {};
  for (const row of rows) {
    const key = topicProgressId(row.subject, row.topic);
    if (!completions[key] || completions[key] < row.completed_at) {
      completions[key] = row.completed_at;
    }
  }
  return completions;
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

/** Never borrow another account's progress as a fallback. */
export function selectCompletionsForUser(
  byUser: Record<string, TopicCompletions> | undefined,
  userId?: string | null
): TopicCompletions {
  if (!byUser || !userId) return {};
  return normalizeTopicCompletions(byUser[userId]);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function byUserFromLegacyValue(value: unknown): Record<string, TopicCompletions> {
  const root = recordValue(value);
  if (!root) return {};
  const state = recordValue(root['state']);
  const candidate = recordValue(state?.['byUser']) ?? recordValue(root['byUser']) ?? root;
  return normalizeByUser(candidate as Record<string, TopicCompletions>);
}

function localStorageLegacyByUser(): Record<string, TopicCompletions> {
  try {
    const raw = localStorage.getItem('air.topic-progress');
    return raw ? byUserFromLegacyValue(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

async function legacyCompletionsForUser(userId: string): Promise<TopicCompletions> {
  const userRow = await db.meta.get(`topic_progress_${userId}`);
  const globalRow = await db.meta.get('air.topic-progress');
  return mergeCompletions(
    selectCompletionsForUser(localStorageLegacyByUser(), userId),
    normalizeTopicCompletions(userRow?.value as TopicCompletions | undefined),
    selectCompletionsForUser(byUserFromLegacyValue(globalRow?.value), userId),
    selectCompletionsForUser(useTopicProgressStore.getState().byUser, userId)
  );
}

async function removeMigratedLegacyUser(userId: string): Promise<void> {
  await db.meta.delete(`topic_progress_${userId}`);

  const globalRow = await db.meta.get('air.topic-progress');
  const globalByUser = byUserFromLegacyValue(globalRow?.value);
  if (userId in globalByUser) {
    delete globalByUser[userId];
    if (Object.keys(globalByUser).length > 0) {
      await db.meta.put({ key: 'air.topic-progress', value: globalByUser });
    } else {
      await db.meta.delete('air.topic-progress');
    }
  }

  try {
    const raw = localStorage.getItem('air.topic-progress');
    if (!raw) return;
    const parsed = recordValue(JSON.parse(raw));
    if (!parsed) return;
    const state = recordValue(parsed['state']);
    const byUser = recordValue(state?.['byUser']) ?? recordValue(parsed['byUser']);
    if (!byUser || !(userId in byUser)) return;
    delete byUser[userId];
    if (Object.keys(byUser).length === 0) {
      localStorage.removeItem('air.topic-progress');
    } else {
      localStorage.setItem('air.topic-progress', JSON.stringify(parsed));
    }
  } catch {
    // A malformed legacy cache is not a reason to disturb the durable rows.
  }
}

/** Wait for the account's remote snapshot, then migrate only that account's
 * old Zustand/meta cache into normal topic_progress rows. */
export async function syncTopicProgressFromDb(userId: string): Promise<void> {
  await awaitInitialPull(userId);

  const legacy = await legacyCompletionsForUser(userId);
  const beforeRows = await db.topic_progress.where('user_id').equals(userId).toArray();
  const before = completionsFromTopicRows(beforeRows);

  for (const [key, completedAt] of Object.entries(legacy)) {
    const parsed = splitTopicProgressId(key);
    if (!parsed) continue;
    if (before[key] && before[key] >= completedAt) continue;
    await persistTopicCompletion(userId, parsed.subject, parsed.topic, completedAt);
  }

  const durable = !isSyncEnabled() || (await flushPendingSync(userId));
  const rows = await db.topic_progress.where('user_id').equals(userId).toArray();
  const merged = mergeCompletions(legacy, completionsFromTopicRows(rows));
  useTopicProgressStore.setState((state) => ({
    byUser: { ...state.byUser, [userId]: merged }
  }));

  if (isSyncEnabled() && durable) await removeMigratedLegacyUser(userId);
  if (isSyncEnabled() && !durable) {
    throw new Error(
      'Syllabus progress is queued locally and will retry when the database is reachable.'
    );
  }
}

export const useTopicProgressStore = create<TopicProgressState>()((set) => ({
  byUser: {},
  setCompleted: async (userId, topicId, completed) => {
    const parsed = splitTopicProgressId(topicId);
    if (!parsed) throw new Error(`Invalid syllabus topic id: ${topicId}`);
    const canonicalTopicId = topicProgressId(parsed.subject, parsed.topic);
    const timestamp = nowISO();

    set((state) => {
      const next = { ...selectCompletionsForUser(state.byUser, userId) };
      if (completed) next[canonicalTopicId] = timestamp;
      else delete next[canonicalTopicId];
      return { byUser: { ...state.byUser, [userId]: next } };
    });

    if (completed) {
      await persistTopicCompletion(userId, parsed.subject, parsed.topic, timestamp);
    } else {
      await removeTopicCompletion(userId, parsed.subject, parsed.topic);
    }

    if (isSyncEnabled() && !(await flushPendingSync(userId))) {
      throw new Error('Saved on this device; database sync will retry automatically.');
    }
  }
}));

export function resetTopicProgressMemory(): void {
  useTopicProgressStore.setState({ byUser: {} });
}
