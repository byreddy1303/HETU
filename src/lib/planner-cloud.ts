// Durable Supabase persistence for Planner days. localStorage is a responsive,
// user-scoped cache; the complete DayPlan is stored in planner_day_plans.plan.
// The duplicated sessions column remains populated for notification functions.
import { supabase } from '@/lib/supabase';
import {
  cacheDayPlanForUser,
  cachePlannerDayTombstone,
  emptyDayPlan,
  loadPlannerDaySyncState,
  normalizeDayPlan,
  normalizeStudySession,
  type DayPlan,
  type PlannerDaySyncState,
  type StudySession
} from '@/lib/planner-storage';
import { uuid } from '@/lib/utils';

export type CloudDayPlan = DayPlan;

interface CloudDayPlanRow {
  plan_date: string;
  sessions: unknown;
  plan: unknown | null;
  updated_at: string;
  revision: number;
  deleted_at: string | null;
  last_mutation_id?: string | null;
}

export type CloudPlannerTombstone = PlannerDaySyncState;

type PlannerCloudWrite =
  | {
      kind: 'upsert';
      date: string;
      plan: DayPlan;
      expectedRevision: number;
      mutationId: string;
      version: number;
    }
  | {
      kind: 'delete';
      date: string;
      expectedRevision: number;
      mutationId: string;
      deletedAt: string;
      version: number;
    };

export type PlannerCloudOutboxEntry =
  | Omit<Extract<PlannerCloudWrite, { kind: 'upsert' }>, 'version'>
  | Omit<Extract<PlannerCloudWrite, { kind: 'delete' }>, 'version'>;

export interface PlannerCloudConflictEntry {
  schemaVersion: 1;
  kind: 'version-conflict' | 'remote-deletion';
  date: string;
  mutationId: string;
  expectedRevision: number;
  localPlan: DayPlan;
  remotePlan: CloudDayPlan | null;
  remoteTombstone: CloudPlannerTombstone | null;
  detectedAt: string;
}

interface PlannerMutationOutcome {
  error: string | null;
  conflict: string | null;
  applied: boolean;
  plan: CloudDayPlan | null;
  tombstone: CloudPlannerTombstone | null;
}

interface PlannerCloudWriteQueue {
  nextVersion: number;
  pendingByDate: Map<string, PlannerCloudWrite>;
  active: Promise<string | null> | null;
}

const CLOUD_PAGE_SIZE = 1_000;
const PENDING_STORAGE_PREFIX = 'air.planner-cloud-pending.';
const CONFLICT_STORAGE_PREFIX = 'air.planner-cloud-conflict.';
const plannerCloudWriteQueues = new Map<string, PlannerCloudWriteQueue>();
const plannerCloudConflicts = new Map<string, Map<string, PlannerCloudConflictEntry>>();

function pendingStoragePrefix(userId: string): string {
  return `${PENDING_STORAGE_PREFIX}${userId}.`;
}

function pendingStorageKey(userId: string, date: string): string {
  return `${pendingStoragePrefix(userId)}${date}`;
}

function conflictStoragePrefix(userId: string): string {
  return `${CONFLICT_STORAGE_PREFIX}${userId}.`;
}

function conflictStorageKey(userId: string, date: string, mutationId: string): string {
  return `${conflictStoragePrefix(userId)}${date}.${mutationId}`;
}

function conflictIdentity(date: string, mutationId: string): string {
  return `${date}\u0000${mutationId}`;
}

function persistPendingWrite(userId: string, write: PlannerCloudWrite): void {
  try {
    localStorage.setItem(
      pendingStorageKey(userId, write.date),
      JSON.stringify(
        write.kind === 'upsert'
          ? {
              kind: write.kind,
              date: write.date,
              plan: write.plan,
              expectedRevision: write.expectedRevision,
              mutationId: write.mutationId
            }
          : {
              kind: write.kind,
              date: write.date,
              expectedRevision: write.expectedRevision,
              mutationId: write.mutationId,
              deletedAt: write.deletedAt
            }
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

function validPlannerDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validExpectedRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validMutationId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 180;
}

function validDayPlanSnapshot(value: unknown, expectedDate?: string): value is DayPlan {
  if (!isRecord(value)) return false;
  return (
    validPlannerDate(value.date) &&
    (expectedDate === undefined || value.date === expectedDate) &&
    Array.isArray(value.sessions) &&
    validTimestamp(value.updatedAt) &&
    (value.syncRevision === undefined || validExpectedRevision(value.syncRevision))
  );
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
  const normalized = normalizeDayPlan(plan);
  return normalizeDayPlan({
    ...normalized,
    sessions: normalized.sessions.map((session) => ({
      ...session,
      ...(session.execution ? { execution: { ...session.execution } } : {}),
      ...(session.launch
        ? {
            launch: {
              ...session.launch,
              prescription: {
                ...session.launch.prescription,
                exactQuestionUids: [...session.launch.prescription.exactQuestionUids],
                config: { ...session.launch.prescription.config }
              },
              resolvedQuestionUids: [...session.launch.resolvedQuestionUids]
            }
          }
        : {}),
      ...(session.result
        ? {
            result: {
              ...session.result,
              receipt: {
                ...session.result.receipt,
                exactQuestionUids: [...session.result.receipt.exactQuestionUids],
                submittedQuestionUids: [...session.result.receipt.submittedQuestionUids],
                recoveryItemIds: [...session.result.receipt.recoveryItemIds]
              }
            }
          }
        : {})
    })),
    availability: {
      ...normalized.availability,
      timeWindows: normalized.availability.timeWindows.map((window) => ({ ...window }))
    },
    structure: { ...normalized.structure },
    mindset: { ...normalized.mindset },
    nonStudy: { ...normalized.nonStudy },
    review: { ...normalized.review }
  });
}

function rowSessions(value: unknown): StudySession[] {
  return Array.isArray(value)
    ? value.filter(isStudySession).map((session) => normalizeStudySession({ ...session }))
    : [];
}

function rowRevision(value: unknown): number {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 1;
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
  const storedAvailability = stored && isRecord(stored.availability) ? stored.availability : {};
  const sessions =
    stored && Array.isArray(stored.sessions)
      ? rowSessions(stored.sessions)
      : rowSessions(row.sessions);

  return normalizeDayPlan({
    ...defaults,
    ...(stored ?? {}),
    date: row.plan_date,
    sessions,
    availability: { ...defaults.availability, ...storedAvailability },
    structure: { ...defaults.structure, ...storedStructure },
    mindset: { ...defaults.mindset, ...storedMindset },
    nonStudy: { ...defaults.nonStudy, ...storedNonStudy },
    review: { ...defaults.review, ...storedReview },
    updatedAt: row.updated_at,
    syncRevision: rowRevision(row.revision)
  } as DayPlan);
}

function toCloudTombstone(row: CloudDayPlanRow): CloudPlannerTombstone {
  return {
    date: row.plan_date,
    revision: rowRevision(row.revision),
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? row.updated_at
  };
}

function cloudPlanPayload(plan: CloudDayPlan): Record<string, unknown> {
  const payload = { ...cloneDayPlan(plan) } as Record<string, unknown>;
  delete payload.syncRevision;
  return payload;
}

function validTombstone(value: unknown): value is CloudPlannerTombstone {
  if (!isRecord(value)) return false;
  return (
    validPlannerDate(value.date) &&
    validExpectedRevision(value.revision) &&
    Number(value.revision) > 0 &&
    validTimestamp(value.updatedAt) &&
    validTimestamp(value.deletedAt)
  );
}

function normalizeConflictEntry(value: unknown): PlannerCloudConflictEntry | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    (value.kind !== 'version-conflict' && value.kind !== 'remote-deletion') ||
    !validPlannerDate(value.date) ||
    !validMutationId(value.mutationId) ||
    !validExpectedRevision(value.expectedRevision) ||
    !validTimestamp(value.detectedAt) ||
    !validDayPlanSnapshot(value.localPlan, value.date)
  ) {
    return null;
  }
  const localPlan = cloneDayPlan(normalizeDayPlan(value.localPlan as unknown as DayPlan));
  const remotePlan = validDayPlanSnapshot(value.remotePlan, value.date)
    ? cloneDayPlan(normalizeDayPlan(value.remotePlan as unknown as DayPlan))
    : null;
  const remoteTombstone = validTombstone(value.remoteTombstone)
    ? { ...value.remoteTombstone }
    : null;
  if (remoteTombstone && remoteTombstone.date !== value.date) return null;
  if (value.kind === 'remote-deletion' && !remoteTombstone) return null;
  if (value.kind === 'version-conflict' && !remotePlan && !remoteTombstone) return null;
  return {
    schemaVersion: 1,
    kind: value.kind,
    date: value.date,
    mutationId: value.mutationId,
    expectedRevision: value.expectedRevision,
    localPlan,
    remotePlan,
    remoteTombstone,
    detectedAt: value.detectedAt
  };
}

function preservePlannerConflict(
  userId: string,
  write: PlannerCloudWrite,
  outcome: PlannerMutationOutcome
): void {
  if (write.kind !== 'upsert') return;
  const kind =
    outcome.conflict === 'deletion_wins'
      ? 'remote-deletion'
      : outcome.conflict === 'version_conflict'
        ? 'version-conflict'
        : null;
  if (!kind) return;
  const entry: PlannerCloudConflictEntry = {
    schemaVersion: 1,
    kind,
    date: write.date,
    mutationId: write.mutationId,
    expectedRevision: write.expectedRevision,
    localPlan: cloneDayPlan(write.plan),
    remotePlan: outcome.plan ? cloneDayPlan(outcome.plan) : null,
    remoteTombstone: outcome.tombstone ? { ...outcome.tombstone } : null,
    detectedAt: new Date().toISOString()
  };
  const conflicts = plannerCloudConflicts.get(userId) ?? new Map();
  conflicts.set(conflictIdentity(entry.date, entry.mutationId), entry);
  plannerCloudConflicts.set(userId, conflicts);
  try {
    localStorage.setItem(
      conflictStorageKey(userId, write.date, write.mutationId),
      JSON.stringify(entry)
    );
  } catch {
    // The in-memory conflict archive remains exportable this run. Ordinary
    // version conflicts also remain in the retrying outbox.
  }
}

function clearPlannerConflict(userId: string, write: PlannerCloudWrite): void {
  const conflicts = plannerCloudConflicts.get(userId);
  conflicts?.delete(conflictIdentity(write.date, write.mutationId));
  if (conflicts?.size === 0) plannerCloudConflicts.delete(userId);
  try {
    localStorage.removeItem(conflictStorageKey(userId, write.date, write.mutationId));
  } catch {
    // A stale diagnostic copy is harmless and remains exportable.
  }
}

/** Export non-retrying conflict copies so acknowledged deletion never loses work. */
export function exportPlannerCloudConflicts(userId: string): PlannerCloudConflictEntry[] {
  const prefix = conflictStoragePrefix(userId);
  const conflictsById = new Map<string, PlannerCloudConflictEntry>(
    [...(plannerCloudConflicts.get(userId)?.entries() ?? [])].map(([key, entry]) => [
      key,
      normalizeConflictEntry(entry) ?? entry
    ])
  );
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) {
      if (!key?.startsWith(prefix)) continue;
      try {
        const entry = normalizeConflictEntry(JSON.parse(localStorage.getItem(key) ?? 'null'));
        if (!entry) continue;
        const identity = conflictIdentity(entry.date, entry.mutationId);
        const existing = conflictsById.get(identity);
        if (!existing || existing.detectedAt < entry.detectedAt) {
          conflictsById.set(identity, entry);
        }
      } catch {
        // One damaged diagnostic must not hide later valid conflicts.
      }
    }
  } catch {
    // The in-memory copies are still usable when browser storage is unavailable.
  }
  return [...conflictsById.values()].sort(
    (left, right) =>
      left.detectedAt.localeCompare(right.detectedAt) || left.date.localeCompare(right.date)
  );
}

/** Restore conflict copies as diagnostics only; they are never replayed. */
export function importPlannerCloudConflicts(
  userId: string,
  entries: readonly PlannerCloudConflictEntry[]
): number {
  let restored = 0;
  for (const candidate of entries as readonly unknown[]) {
    const entry = normalizeConflictEntry(candidate);
    if (!entry) continue;
    const key = conflictStorageKey(userId, entry.date, entry.mutationId);
    const identity = conflictIdentity(entry.date, entry.mutationId);
    try {
      const existingRaw = localStorage.getItem(key);
      const stored = existingRaw ? normalizeConflictEntry(JSON.parse(existingRaw)) : null;
      const cached = plannerCloudConflicts.get(userId)?.get(identity) ?? null;
      const existing =
        stored && (!cached || stored.detectedAt > cached.detectedAt) ? stored : cached;
      if (existing && existing.detectedAt >= entry.detectedAt) continue;
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      const cached = plannerCloudConflicts.get(userId)?.get(identity);
      if (cached && cached.detectedAt >= entry.detectedAt) continue;
      // Keep restoring independent entries when one storage slot is malformed
      // or browser storage is unavailable.
    }
    const conflicts = plannerCloudConflicts.get(userId) ?? new Map();
    conflicts.set(identity, entry);
    plannerCloudConflicts.set(userId, conflicts);
    restored += 1;
  }
  return restored;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return 'Planner database sync failed.';
}

export async function loadCloudDayPlan(
  userId: string,
  date: string
): Promise<{
  plan: CloudDayPlan | null;
  tombstone: CloudPlannerTombstone | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('planner_day_plans')
      .select('plan_date, sessions, plan, updated_at, revision, deleted_at, last_mutation_id')
      .eq('user_id', userId)
      .eq('plan_date', date)
      .maybeSingle();

    if (error) return { plan: null, tombstone: null, error: error.message };
    if (!data) return { plan: null, tombstone: null, error: null };

    const row = data as CloudDayPlanRow;
    return row.deleted_at
      ? { plan: null, tombstone: toCloudTombstone(row), error: null }
      : { plan: toCloudDayPlan(row), tombstone: null, error: null };
  } catch (error) {
    return { plan: null, tombstone: null, error: errorMessage(error) };
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
): Promise<{
  plans: CloudDayPlan[];
  tombstones: CloudPlannerTombstone[];
  error: string | null;
}> {
  const plans: CloudDayPlan[] = [];
  const tombstones: CloudPlannerTombstone[] = [];

  try {
    for (let offset = 0; ; offset += CLOUD_PAGE_SIZE) {
      let query = supabase
        .from('planner_day_plans')
        .select('plan_date, sessions, plan, updated_at, revision, deleted_at, last_mutation_id')
        .eq('user_id', userId);

      if (fromDate) query = query.gte('plan_date', fromDate);
      if (throughDate) query = query.lte('plan_date', throughDate);

      const { data, error } = await query
        .order('plan_date', { ascending: true })
        .range(offset, offset + CLOUD_PAGE_SIZE - 1);

      if (error) return { plans: [], tombstones: [], error: error.message };
      const rows = (data ?? []) as CloudDayPlanRow[];
      for (const row of rows) {
        if (row.deleted_at) tombstones.push(toCloudTombstone(row));
        else plans.push(toCloudDayPlan(row));
      }
      if (rows.length < CLOUD_PAGE_SIZE) break;
    }

    return { plans, tombstones, error: null };
  } catch (error) {
    return { plans: [], tombstones: [], error: errorMessage(error) };
  }
}

function conflictError(conflict: string | null): string | null {
  switch (conflict) {
    case null:
    case 'idempotent_retry':
    case 'stale_delete_applied':
    case 'deletion_wins':
      return null;
    case 'version_conflict':
      return 'This Planner day changed on another device. Reload it before replacing that version.';
    case 'missing_expected_row':
      return 'This Planner day no longer exists on the server. Reload it before saving again.';
    default:
      return `Planner sync conflict: ${conflict}`;
  }
}

function invalidMutationOutcome(): PlannerMutationOutcome {
  return {
    error: 'Planner database returned an invalid mutation receipt.',
    conflict: null,
    applied: false,
    plan: null,
    tombstone: null
  };
}

function parseMutationOutcome(
  value: unknown,
  expectedDate: string,
  expectedMutationId: string
): PlannerMutationOutcome {
  if (!isRecord(value)) {
    return invalidMutationOutcome();
  }
  const conflict = typeof value.conflict === 'string' ? value.conflict : null;
  const rowValue = value.row;
  const row =
    isRecord(rowValue) &&
    rowValue.plan_date === expectedDate &&
    validTimestamp(rowValue.updated_at) &&
    Number.isSafeInteger(rowValue.revision) &&
    Number(rowValue.revision) > 0 &&
    (rowValue.deleted_at === null || validTimestamp(rowValue.deleted_at)) &&
    Array.isArray(rowValue.sessions)
      ? (rowValue as unknown as CloudDayPlanRow)
      : null;
  const tombstone = row?.deleted_at ? toCloudTombstone(row) : null;
  const plan = row && !row.deleted_at ? toCloudDayPlan(row) : null;
  const applied = value.applied === true;
  if (
    (applied && (!row || row.last_mutation_id !== expectedMutationId)) ||
    (conflict === 'deletion_wins' && (!row || !tombstone)) ||
    (conflict === 'version_conflict' && (!row || (!plan && !tombstone)))
  ) {
    return invalidMutationOutcome();
  }
  return {
    error:
      applied || conflict === 'deletion_wins'
        ? conflictError(conflict)
        : (conflictError(conflict) ?? 'Planner mutation was not applied.'),
    conflict,
    applied,
    plan,
    tombstone
  };
}

function applyMutationOutcomeToCache(userId: string, outcome: PlannerMutationOutcome): void {
  if (outcome.tombstone) cachePlannerDayTombstone(userId, outcome.tombstone);
  else if (outcome.plan) cacheDayPlanForUser(userId, outcome.plan);
}

async function applyCloudMutation(
  userId: string,
  write: PlannerCloudWrite,
  cacheOutcome = true
): Promise<PlannerMutationOutcome> {
  const plan = write.kind === 'upsert' ? cloneDayPlan(write.plan) : null;
  try {
    const { data, error } = await supabase.rpc('apply_planner_day_plan_mutation', {
      p_plan_date: write.date,
      p_expected_revision: write.expectedRevision,
      p_mutation_id: write.mutationId,
      p_sessions: plan?.sessions ?? [],
      p_plan: plan ? cloudPlanPayload(plan) : null,
      p_deleted_at: write.kind === 'delete' ? write.deletedAt : null
    });
    if (error) {
      return {
        error: error.message,
        conflict: null,
        applied: false,
        plan: null,
        tombstone: null
      };
    }
    const outcome = parseMutationOutcome(data, write.date, write.mutationId);
    preservePlannerConflict(userId, write, outcome);
    if (outcome.applied) clearPlannerConflict(userId, write);
    // The RPC derives ownership from auth.uid(). Keep userId client-side only
    // for applying its authoritative receipt to the matching scoped cache.
    if (cacheOutcome && outcome.error === null) applyMutationOutcomeToCache(userId, outcome);
    return outcome;
  } catch (error) {
    return {
      error: errorMessage(error),
      conflict: null,
      applied: false,
      plan: null,
      tombstone: null
    };
  }
}

/** Low-level immediate versioned upsert. UI callers should use the queue. */
export async function saveCloudDayPlan(userId: string, plan: CloudDayPlan): Promise<string | null> {
  const storedPlan = cloneDayPlan(plan);
  const state = loadPlannerDaySyncState(userId, storedPlan.date);
  const outcome = await applyCloudMutation(userId, {
    kind: 'upsert',
    date: storedPlan.date,
    plan: storedPlan,
    expectedRevision: storedPlan.syncRevision ?? state?.revision ?? 0,
    mutationId: uuid(),
    version: 0
  });
  return outcome.error;
}

/** Low-level immediate tombstone. UI callers should use the queue. */
export async function deleteCloudDayPlan(userId: string, date: string): Promise<string | null> {
  const state = loadPlannerDaySyncState(userId, date);
  const outcome = await applyCloudMutation(userId, {
    kind: 'delete',
    date,
    expectedRevision: state?.revision ?? 0,
    mutationId: uuid(),
    deletedAt: state?.deletedAt ?? new Date().toISOString(),
    version: 0
  });
  return outcome.error;
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

async function executeCloudWrite(
  userId: string,
  write: PlannerCloudWrite
): Promise<PlannerMutationOutcome> {
  return applyCloudMutation(userId, write, false);
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
    const outcome = await executeCloudWrite(userId, next);
    const latest = queue.pendingByDate.get(next.date);

    // A newer edit/delete arrived during this request. The serialized loop will
    // persist that replacement next, so the older result cannot win remotely.
    if (!latest || latest.version !== next.version) {
      if (outcome.error) {
        firstError ??= outcome.error;
        continue;
      }
      if (outcome.conflict === 'deletion_wins' && outcome.tombstone) {
        cachePlannerDayTombstone(userId, outcome.tombstone);
        queue.pendingByDate.delete(next.date);
        clearPersistedWrite(userId, next.date);
        continue;
      }
      const replacement = queue.pendingByDate.get(next.date);
      const acknowledgedRevision = outcome.plan?.syncRevision ?? outcome.tombstone?.revision;
      if (replacement && acknowledgedRevision) {
        replacement.expectedRevision = acknowledgedRevision;
        if (replacement.kind === 'upsert') {
          replacement.plan = { ...replacement.plan, syncRevision: acknowledgedRevision };
        }
        persistPendingWrite(userId, replacement);
      }
      continue;
    }

    if (outcome.error) {
      firstError ??= outcome.error;
      continue;
    }
    applyMutationOutcomeToCache(userId, outcome);
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
  const state = loadPlannerDaySyncState(userId, storedPlan.date);
  const write: PlannerCloudWrite = {
    kind: 'upsert',
    date: storedPlan.date,
    plan: storedPlan,
    expectedRevision: storedPlan.syncRevision ?? state?.revision ?? 0,
    mutationId: uuid(),
    version: ++queue.nextVersion
  };
  queue.pendingByDate.set(storedPlan.date, write);
  persistPendingWrite(userId, write);
  return startWriteQueue(userId, queue);
}

/** Explicit deletion supersedes any queued upsert for that date, in order. */
export function queuePlannerCloudDelete(userId: string, date: string): Promise<string | null> {
  const queue = getWriteQueue(userId);
  const state = loadPlannerDaySyncState(userId, date);
  const write: PlannerCloudWrite = {
    kind: 'delete',
    date,
    expectedRevision: state?.revision ?? 0,
    mutationId: uuid(),
    deletedAt: state?.deletedAt ?? new Date().toISOString(),
    version: ++queue.nextVersion
  };
  queue.pendingByDate.set(date, write);
  persistPendingWrite(userId, write);
  return startWriteQueue(userId, queue);
}

function restorePersistedWrites(userId: string): void {
  const prefix = pendingStoragePrefix(userId);
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) {
      if (!key?.startsWith(prefix)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
        const keyDate = key.slice(prefix.length);
        if (
          !isRecord(parsed) ||
          !validPlannerDate(parsed.date) ||
          parsed.date !== keyDate
        ) {
          continue;
        }
        const queue = getWriteQueue(userId);
        // A live queue entry is always newer than a persisted snapshot read
        // later (including one restored from an old backup).
        if (queue.pendingByDate.has(parsed.date)) continue;
        const state = loadPlannerDaySyncState(userId, parsed.date);
        const expectedRevision = validExpectedRevision(parsed.expectedRevision)
          ? parsed.expectedRevision
          : (state?.revision ?? 0);
        const mutationId = validMutationId(parsed.mutationId) ? parsed.mutationId : uuid();
        if (parsed.kind === 'delete') {
          queue.pendingByDate.set(parsed.date, {
            kind: 'delete',
            date: parsed.date,
            expectedRevision,
            mutationId,
            deletedAt: validTimestamp(parsed.deletedAt)
              ? parsed.deletedAt
              : state?.deletedAt ?? new Date().toISOString(),
            version: ++queue.nextVersion
          });
        } else if (parsed.kind === 'upsert' && isRecord(parsed.plan)) {
          const plan = cloneDayPlan(normalizeDayPlan(parsed.plan as unknown as DayPlan));
          if (plan.date !== parsed.date) continue;
          queue.pendingByDate.set(parsed.date, {
            kind: 'upsert',
            date: parsed.date,
            plan: expectedRevision > 0 ? { ...plan, syncRevision: expectedRevision } : plan,
            expectedRevision,
            mutationId,
            version: ++queue.nextVersion
          });
        }
      } catch {
        // One malformed entry must not stop independent valid dates restoring.
      }
    }
  } catch {
    // Ignore malformed/unavailable cache entries; do not delete potential data.
  }
}

function outboxEntry(write: PlannerCloudWrite): PlannerCloudOutboxEntry {
  if (write.kind === 'upsert') {
    return {
      kind: 'upsert',
      date: write.date,
      plan: cloneDayPlan(write.plan),
      expectedRevision: write.expectedRevision,
      mutationId: write.mutationId
    };
  }
  return {
    kind: 'delete',
    date: write.date,
    expectedRevision: write.expectedRevision,
    mutationId: write.mutationId,
    deletedAt: write.deletedAt
  };
}

/** Snapshot the durable Planner outbox so an offline backup cannot omit it. */
export function exportPlannerCloudOutbox(userId: string): PlannerCloudOutboxEntry[] {
  restorePersistedWrites(userId);
  const queue = plannerCloudWriteQueues.get(userId);
  return queue
    ? [...queue.pendingByDate.values()]
        .sort((left, right) => left.date.localeCompare(right.date))
        .map(outboxEntry)
    : [];
}

/** Restore validated pending writes without starting network activity. */
export function importPlannerCloudOutbox(
  userId: string,
  entries: readonly PlannerCloudOutboxEntry[]
): number {
  restorePersistedWrites(userId);
  let restored = 0;
  const queue = getWriteQueue(userId);
  for (const candidate of entries as readonly unknown[]) {
    if (
      !isRecord(candidate) ||
      !validPlannerDate(candidate.date) ||
      !validExpectedRevision(candidate.expectedRevision) ||
      !validMutationId(candidate.mutationId)
    ) {
      continue;
    }
    const date = candidate.date;
    // Import is a recovery path. It must never replace an edit already queued
    // by this running device or one already restored from local storage.
    if (queue.pendingByDate.has(date)) continue;
    const state = loadPlannerDaySyncState(userId, date);
    if (state && candidate.expectedRevision !== state.revision) continue;

    let write: PlannerCloudWrite;
    if (candidate.kind === 'upsert' && validDayPlanSnapshot(candidate.plan, date)) {
      const plan = cloneDayPlan(normalizeDayPlan(candidate.plan as unknown as DayPlan));
      if (plan.date !== date) continue;
      if (
        state?.deletedAt &&
        candidate.expectedRevision <= state.revision &&
        Date.parse(plan.updatedAt) <= Date.parse(state.updatedAt)
      ) {
        continue;
      }
      write = {
        kind: 'upsert',
        date,
        plan,
        expectedRevision: candidate.expectedRevision,
        mutationId: candidate.mutationId,
        version: ++queue.nextVersion
      };
    } else if (
      candidate.kind === 'delete' &&
      validTimestamp(candidate.deletedAt)
    ) {
      write = {
        kind: 'delete',
        date,
        expectedRevision: candidate.expectedRevision,
        mutationId: candidate.mutationId,
        deletedAt: candidate.deletedAt,
        version: ++queue.nextVersion
      };
    } else {
      continue;
    }
    queue.pendingByDate.set(date, write);
    persistPendingWrite(userId, write);
    restored += 1;
  }
  if (queue.pendingByDate.size === 0 && queue.active === null) {
    plannerCloudWriteQueues.delete(userId);
  }
  return restored;
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
  restorePersistedWrites(userId);
  const queue = plannerCloudWriteQueues.get(userId);
  if (queue && (queue.active || queue.pendingByDate.size > 0)) return true;
  return false;
}
