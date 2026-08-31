// Durable Supabase persistence for Planner days. localStorage is a responsive,
// user-scoped cache; the complete DayPlan is stored in planner_day_plans.plan.
// The duplicated sessions column remains populated for notification functions.
import { supabase } from '@/lib/supabase';
import {
  emptyDayPlan,
  normalizeDayPlan,
  normalizeStudySession,
  type DayPlan,
  type StudySession
} from '@/lib/planner-storage';

export type CloudDayPlan = DayPlan;

interface CloudDayPlanRow {
  plan_date: string;
  sessions: unknown;
  plan: unknown | null;
  updated_at: string;
}

type PlannerCloudWrite =
  | { kind: 'upsert'; date: string; plan: DayPlan; version: number }
  | { kind: 'delete'; date: string; version: number };

interface PlannerCloudWriteQueue {
  nextVersion: number;
  pendingByDate: Map<string, PlannerCloudWrite>;
  active: Promise<string | null> | null;
}

const CLOUD_PAGE_SIZE = 1_000;
const PENDING_STORAGE_PREFIX = 'air.planner-cloud-pending.';
const plannerCloudWriteQueues = new Map<string, PlannerCloudWriteQueue>();

function pendingStoragePrefix(userId: string): string {
  return `${PENDING_STORAGE_PREFIX}${userId}.`;
}

function pendingStorageKey(userId: string, date: string): string {
  return `${pendingStoragePrefix(userId)}${date}`;
}

function persistPendingWrite(userId: string, write: PlannerCloudWrite): void {
  try {
    localStorage.setItem(
      pendingStorageKey(userId, write.date),
      JSON.stringify(
        write.kind === 'upsert'
          ? { kind: write.kind, date: write.date, plan: write.plan }
          : { kind: write.kind, date: write.date }
      )
    );
  } catch {
    // The in-memory queue and normal DayPlan cache remain available this run.
  }
}

function clearPersistedWrite(userId: string, date: string): void {
  try {
    localStorage.removeItem(pendingStorageKey(userId, date));
  } catch {
    // The database already acknowledged the payload.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStudySession(value: unknown): value is StudySession {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.subject === 'string' &&
    typeof value.durationMin === 'number' &&
    typeof value.mode === 'string' &&
    typeof value.priority === 'string' &&
    typeof value.target === 'string'
  );
}

function cloneDayPlan(plan: DayPlan): DayPlan {
  return normalizeDayPlan({
    ...plan,
    sessions: plan.sessions.map((session) =>
      session.execution ? { ...session, execution: { ...session.execution } } : { ...session }
    ),
    structure: { ...plan.structure },
    mindset: { ...plan.mindset },
    nonStudy: { ...plan.nonStudy },
    review: { ...plan.review }
  });
}

function rowSessions(value: unknown): StudySession[] {
  return Array.isArray(value)
    ? value.filter(isStudySession).map((session) => normalizeStudySession({ ...session }))
    : [];
}

/**
 * Hydrate both current rows and pre-plan-column rows. Nested defaults make a
 * partially written/older JSON object safe to render without dropping fields
 * that are present in the stored payload.
 */
function toCloudDayPlan(row: CloudDayPlanRow): CloudDayPlan {
  const defaults = emptyDayPlan(row.plan_date);
  const stored = isRecord(row.plan) ? row.plan : null;
  const storedStructure = stored && isRecord(stored.structure) ? stored.structure : {};
  const storedMindset = stored && isRecord(stored.mindset) ? stored.mindset : {};
  const storedNonStudy = stored && isRecord(stored.nonStudy) ? stored.nonStudy : {};
  const storedReview = stored && isRecord(stored.review) ? stored.review : {};
  const sessions =
    stored && Array.isArray(stored.sessions)
      ? rowSessions(stored.sessions)
      : rowSessions(row.sessions);

  return normalizeDayPlan({
    ...defaults,
    ...(stored ?? {}),
    date: row.plan_date,
    sessions,
    structure: { ...defaults.structure, ...storedStructure },
    mindset: { ...defaults.mindset, ...storedMindset },
    nonStudy: { ...defaults.nonStudy, ...storedNonStudy },
    review: { ...defaults.review, ...storedReview },
    updatedAt: row.updated_at
  } as DayPlan);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return 'Planner database sync failed.';
}

export async function loadCloudDayPlan(
  userId: string,
  date: string
): Promise<{ plan: CloudDayPlan | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('planner_day_plans')
      .select('plan_date, sessions, plan, updated_at')
      .eq('user_id', userId)
      .eq('plan_date', date)
      .maybeSingle();

    if (error) return { plan: null, error: error.message };
    if (!data) return { plan: null, error: null };

    return { plan: toCloudDayPlan(data as CloudDayPlanRow), error: null };
  } catch (error) {
    return { plan: null, error: errorMessage(error) };
  }
}

/**
 * Load every cloud plan by default so a cleared browser cache can be rebuilt
 * completely. Optional bounds are retained for callers that intentionally need
 * a range. Pagination avoids Supabase's configured per-request row limit.
 */
export async function loadCloudDayPlans(
  userId: string,
  fromDate?: string,
  throughDate?: string
): Promise<{ plans: CloudDayPlan[]; error: string | null }> {
  const plans: CloudDayPlan[] = [];

  try {
    for (let offset = 0; ; offset += CLOUD_PAGE_SIZE) {
      let query = supabase
        .from('planner_day_plans')
        .select('plan_date, sessions, plan, updated_at')
        .eq('user_id', userId);

      if (fromDate) query = query.gte('plan_date', fromDate);
      if (throughDate) query = query.lte('plan_date', throughDate);

      const { data, error } = await query
        .order('plan_date', { ascending: true })
        .range(offset, offset + CLOUD_PAGE_SIZE - 1);

      if (error) return { plans: [], error: error.message };
      const rows = (data ?? []) as CloudDayPlanRow[];
      plans.push(...rows.map(toCloudDayPlan));
      if (rows.length < CLOUD_PAGE_SIZE) break;
    }

    return { plans, error: null };
  } catch (error) {
    return { plans: [], error: errorMessage(error) };
  }
}

/** Low-level immediate upsert. UI callers should use queuePlannerCloudWrite. */
export async function saveCloudDayPlan(userId: string, plan: CloudDayPlan): Promise<string | null> {
  const storedPlan = cloneDayPlan(plan);
  try {
    const { error } = await supabase.from('planner_day_plans').upsert(
      {
        user_id: userId,
        plan_date: storedPlan.date,
        sessions: storedPlan.sessions,
        plan: storedPlan,
        updated_at: storedPlan.updatedAt
      },
      { onConflict: 'user_id,plan_date' }
    );
    return error?.message ?? null;
  } catch (error) {
    return errorMessage(error);
  }
}

/** Low-level immediate delete. UI callers should use queuePlannerCloudDelete. */
export async function deleteCloudDayPlan(userId: string, date: string): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('planner_day_plans')
      .delete()
      .eq('user_id', userId)
      .eq('plan_date', date);
    return error?.message ?? null;
  } catch (error) {
    return errorMessage(error);
  }
}

function getWriteQueue(userId: string): PlannerCloudWriteQueue {
  const existing = plannerCloudWriteQueues.get(userId);
  if (existing) return existing;
  const created: PlannerCloudWriteQueue = {
    nextVersion: 0,
    pendingByDate: new Map(),
    active: null
  };
  plannerCloudWriteQueues.set(userId, created);
  return created;
}

async function executeCloudWrite(userId: string, write: PlannerCloudWrite): Promise<string | null> {
  return write.kind === 'upsert'
    ? saveCloudDayPlan(userId, write.plan)
    : deleteCloudDayPlan(userId, write.date);
}

/**
 * Attempt each currently pending version once. A failed latest version remains
 * in pendingByDate for the next online/focus/logout flush. If a request is
 * superseded while in flight, only its newer replacement is considered final.
 */
async function drainWriteQueue(
  userId: string,
  queue: PlannerCloudWriteQueue
): Promise<string | null> {
  const attemptedVersions = new Set<number>();
  let firstError: string | null = null;

  while (queue.pendingByDate.size > 0) {
    const next = [...queue.pendingByDate.values()].find(
      (write) => !attemptedVersions.has(write.version)
    );
    if (!next) return firstError;

    attemptedVersions.add(next.version);
    const error = await executeCloudWrite(userId, next);
    const latest = queue.pendingByDate.get(next.date);

    // A newer edit/delete arrived during this request. The serialized loop will
    // persist that replacement next, so the older result cannot win remotely.
    if (!latest || latest.version !== next.version) continue;

    if (error) {
      firstError ??= error;
      continue;
    }
    queue.pendingByDate.delete(next.date);
    clearPersistedWrite(userId, next.date);
  }

  return firstError;
}

function startWriteQueue(userId: string, queue: PlannerCloudWriteQueue): Promise<string | null> {
  if (queue.active) return queue.active;

  const active = drainWriteQueue(userId, queue);
  queue.active = active;
  void active.then(() => {
    if (queue.active !== active) return;
    queue.active = null;
    if (queue.pendingByDate.size === 0) plannerCloudWriteQueues.delete(userId);
  });
  return active;
}

/**
 * Queue the newest complete DayPlan snapshot and start persistence immediately.
 * Repeated edits for one date coalesce while the prior request is in flight.
 */
export function queuePlannerCloudWrite(userId: string, plan: CloudDayPlan): Promise<string | null> {
  const queue = getWriteQueue(userId);
  const storedPlan = cloneDayPlan(plan);
  const write: PlannerCloudWrite = {
    kind: 'upsert',
    date: storedPlan.date,
    plan: storedPlan,
    version: ++queue.nextVersion
  };
  queue.pendingByDate.set(storedPlan.date, write);
  persistPendingWrite(userId, write);
  return startWriteQueue(userId, queue);
}

/** Explicit deletion supersedes any queued upsert for that date, in order. */
export function queuePlannerCloudDelete(userId: string, date: string): Promise<string | null> {
  const queue = getWriteQueue(userId);
  const write: PlannerCloudWrite = {
    kind: 'delete',
    date,
    version: ++queue.nextVersion
  };
  queue.pendingByDate.set(date, write);
  persistPendingWrite(userId, write);
  return startWriteQueue(userId, queue);
}

function restorePersistedWrites(userId: string): void {
  const prefix = pendingStoragePrefix(userId);
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
      if (!isRecord(parsed) || typeof parsed.date !== 'string') continue;
      const queue = getWriteQueue(userId);
      if (queue.pendingByDate.has(parsed.date)) continue;
      if (parsed.kind === 'delete') {
        queue.pendingByDate.set(parsed.date, {
          kind: 'delete',
          date: parsed.date,
          version: ++queue.nextVersion
        });
      } else if (parsed.kind === 'upsert' && isRecord(parsed.plan)) {
        queue.pendingByDate.set(parsed.date, {
          kind: 'upsert',
          date: parsed.date,
          plan: cloneDayPlan(normalizeDayPlan(parsed.plan as unknown as DayPlan)),
          version: ++queue.nextVersion
        });
      }
    }
  } catch {
    // Ignore malformed/unavailable cache entries; do not delete potential data.
  }
}

/**
 * Wait for an active drain or retry retained failures once. This is safe to call
 * during logout, and from online/focus handlers.
 */
export function flushPlannerCloudWrites(userId: string): Promise<string | null> {
  restorePersistedWrites(userId);
  const queue = plannerCloudWriteQueues.get(userId);
  if (!queue) return Promise.resolve(null);
  return queue.active ?? startWriteQueue(userId, queue);
}

/** Includes both queued failures and a write that is currently in flight. */
export function hasPendingPlannerCloudWrites(userId: string): boolean {
  const queue = plannerCloudWriteQueues.get(userId);
  if (queue && (queue.active || queue.pendingByDate.size > 0)) return true;
  try {
    const prefix = pendingStoragePrefix(userId);
    for (let index = 0; index < localStorage.length; index += 1) {
      if (localStorage.key(index)?.startsWith(prefix)) return true;
    }
  } catch {
    // Browser storage unavailable; rely on the in-memory queue above.
  }
  return false;
}
