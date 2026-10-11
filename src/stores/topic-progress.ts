import { create } from 'zustand';
import { runtimeStorage as localStorage } from '@/lib/runtime-storage';
import { db, ensureTableHydrated, getTableSnapshot, subscribeDb, type SyncedTableName } from '@/lib/db';
import {
  deleteLocal,
  isSyncEnabled,
  writeLocal,
  writeLocalBatch
} from '@/lib/sync';
import { nowISO, uuidFromString } from '@/lib/utils';
import { canonicalSubjectId, canonicalSubjectLabel } from '@/lib/subjects';
import type { TopicProgressRow } from '@/types';

export type TopicCompletions = Record<string, string>;

interface TopicMutation {
  sequence: number;
  completedAt: string | null;
}

interface TopicProgressState {
  /** In-memory view cache only. online database rows are the source of truth. */
  byUser: Record<string, TopicCompletions>;
  pendingByUser: Record<string, Record<string, TopicMutation>>;
  setCompleted: (userId: string, topicId: string, completed: boolean) => Promise<void>;
}

export const EMPTY_TOPIC_COMPLETIONS: TopicCompletions = {};
let generation = 0;
let mutationSequence = 0;
const saveChains = new Map<string, Promise<void>>();
const touchedTopics = new Set<string>();
const progressLoads = new Map<string, Promise<void>>();

function mutationKey(userId: string, topicId: string): string {
  return `${userId}:${topicId}`;
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
    selectCompletionsForUser(byUserFromLegacyValue(globalRow?.value), userId)
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

/** The view cache is never migration input: doing so resurrects deletions and
 * can echo an optimistic click back as a second database write. */
export function syncTopicProgressFromDb(userId: string): Promise<void> {
  const existing = progressLoads.get(userId);
  if (existing) return existing;
  const load = loadTopicProgress(userId).catch((error) => {
    if (progressLoads.get(userId) === load) progressLoads.delete(userId);
    throw error;
  });
  progressLoads.set(userId, load);
  return load;
}

async function loadTopicProgress(userId: string): Promise<void> {
  const startedGeneration = generation;
  await ensureTableHydrated(userId, 'topic_progress');
  if (startedGeneration !== generation) return;

  const legacy = await legacyCompletionsForUser(userId);
  const beforeRows = await db.topic_progress.where('user_id').equals(userId).toArray();
  const before = completionsFromTopicRows(beforeRows);

  // Latest existing row per canonical leaf, so re-migrating a key keeps its
  // stable id (and any downstream references) while bumping completed_at.
  const existingByKey = new Map<string, TopicProgressRow>();
  for (const row of beforeRows) {
    const key = topicProgressId(row.subject, row.topic);
    const current = existingByKey.get(key);
    if (!current || row.completed_at > current.completed_at) existingByKey.set(key, row);
  }

  // Persist everything missing/newer in ONE batched write. The old per-key
  // `put` loop turned a stale offline-era cache into hundreds of sequential
  // API upserts, each notifying every live query and freezing the page.
  const pending: Array<{ name: SyncedTableName; row: TopicProgressRow }> = [];
  for (const completionsKey of Object.keys(legacy)) {
    if (touchedTopics.has(mutationKey(userId, completionsKey))) continue;
    const parsed = splitTopicProgressId(completionsKey);
    if (!parsed) continue;
    const completedAt = legacy[completionsKey] as string;
    const canonicalTopicKey = topicProgressId(parsed.subject, parsed.topic);
    if (before[canonicalTopicKey] && before[canonicalTopicKey] >= completedAt) continue;
    const canonicalSubject = canonicalSubjectLabel(parsed.subject);
    const topic = parsed.topic.trim();
    const existing = existingByKey.get(canonicalTopicKey);
    pending.push({
      name: 'topic_progress',
      row: {
        id: existing?.id ?? topicProgressRowId(userId, canonicalSubject, topic),
        user_id: userId,
        subject: canonicalSubject,
        subject_id: canonicalSubjectId(canonicalSubject),
        topic,
        completed_at: completedAt,
        updated_at: completedAt
      }
    });
  }
  if (pending.length > 0) await writeLocalBatch(pending);
  if (startedGeneration !== generation) return;

  refreshUserCompletions(userId);

  if (isSyncEnabled()) await removeMigratedLegacyUser(userId);
}

function currentCompletions(state: TopicProgressState, userId: string): TopicCompletions {
  const completions = completionsFromTopicRows(
    getTableSnapshot('topic_progress').filter((row) => row.user_id === userId)
  );
  for (const [topicId, pending] of Object.entries(state.pendingByUser[userId] ?? {})) {
    if (pending.completedAt) completions[topicId] = pending.completedAt;
    else delete completions[topicId];
  }
  return completions;
}

function refreshUserCompletions(userId: string): void {
  useTopicProgressStore.setState((state) => {
    const completions = currentCompletions(state, userId);
    const previous = state.byUser[userId];
    if (previous && Object.keys(previous).length === Object.keys(completions).length &&
      Object.entries(completions).every(([id, at]) => previous[id] === at)) return state;
    return { byUser: { ...state.byUser, [userId]: completions } };
  });
}

export const useTopicProgressStore = create<TopicProgressState>()((set) => ({
  byUser: {},
  pendingByUser: {},
  setCompleted: async (userId, topicId, completed) => {
    const parsed = splitTopicProgressId(topicId);
    if (!parsed) throw new Error(`Invalid syllabus topic id: ${topicId}`);
    const canonicalTopicId = topicProgressId(parsed.subject, parsed.topic);
    const timestamp = nowISO();
    const key = mutationKey(userId, canonicalTopicId);
    const startedGeneration = generation;
    const mutation: TopicMutation = {
      sequence: ++mutationSequence,
      completedAt: completed ? timestamp : null
    };
    touchedTopics.add(key);

    set((state) => {
      const next = currentCompletions(state, userId);
      if (completed) next[canonicalTopicId] = timestamp;
      else delete next[canonicalTopicId];
      return {
        byUser: { ...state.byUser, [userId]: next },
        pendingByUser: {
          ...state.pendingByUser,
          [userId]: { ...state.pendingByUser[userId], [canonicalTopicId]: mutation }
        }
      };
    });

    const isLatest = () => startedGeneration === generation &&
      useTopicProgressStore.getState().pendingByUser[userId]?.[canonicalTopicId] === mutation;
    const settle = () => {
      set((state) => {
        const pending = { ...state.pendingByUser[userId] };
        delete pending[canonicalTopicId];
        const nextState = { ...state, pendingByUser: { ...state.pendingByUser, [userId]: pending } };
        return {
          pendingByUser: nextState.pendingByUser,
          byUser: { ...state.byUser, [userId]: currentCompletions(nextState, userId) }
        };
      });
    };
    const persist = async () => {
      // Collapse superseded clicks that have not been sent yet. An in-flight
      // write finishes first; only then can the newest intent for that leaf run.
      if (!isLatest()) return;
      try {
        // Only the small progress table is needed to retain legacy row IDs.
        // The UI has already changed; unrelated account history never gates it.
        await ensureTableHydrated(userId, 'topic_progress');
        if (!isLatest()) return;
        if (completed) await persistTopicCompletion(userId, parsed.subject, parsed.topic, timestamp);
        else await removeTopicCompletion(userId, parsed.subject, parsed.topic);
        if (isLatest()) settle();
      } catch (error) {
        // An older failure must never roll back a more recent click. The latest
        // failure restores the last acknowledged database state, not an older
        // optimistic value that might itself have failed.
        if (!isLatest()) return;
        settle();
        throw new Error(
          `Could not confirm that change was saved. ${error instanceof Error ? error.message : 'Check your connection and try again.'}`
        );
      }
    };
    const previous = saveChains.get(key);
    const save = previous ? previous.catch(() => undefined).then(persist) : persist();
    saveChains.set(key, save);
    try {
      await save;
    } finally {
      if (saveChains.get(key) === save) saveChains.delete(key);
    }
  }
}));

// Publish remote edits and acknowledged writes synchronously. Pending checks
// AND unticks overlay them until the matching request finishes.
subscribeDb(() => {
  const users = new Set([
    ...Object.keys(useTopicProgressStore.getState().byUser),
    ...getTableSnapshot('topic_progress').map((row) => row.user_id)
  ]);
  for (const userId of users) refreshUserCompletions(userId);
}, ['topic_progress']);

export function resetTopicProgressMemory(): void {
  generation++;
  saveChains.clear();
  touchedTopics.clear();
  progressLoads.clear();
  useTopicProgressStore.setState({ byUser: {}, pendingByUser: {} });
}
