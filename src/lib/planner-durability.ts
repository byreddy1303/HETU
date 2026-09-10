import { emptyDayPlan, normalizeDayPlan, type DayPlan, type StudySession } from '@/lib/planner-storage';
import { normalizeSubjectIdentity, type SubjectId } from '@/lib/subjects';
import type {
  PlannerTemplateInput,
  PlannerTemplateRecurrence
} from '@/stores/planner-templates';

export type LegacyPlanRecurrence = 'none' | 'daily' | 'weekdays' | 'weekly';

export interface LegacyPlanItem {
  id: string;
  user_id: string;
  title: string;
  subject: string | null;
  subject_id?: SubjectId | string | null;
  notes: string | null;
  due_date: string;
  rrule_kind: LegacyPlanRecurrence;
  ends_on: string | null;
  target_min: number | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface LegacyPlanItemCompletion {
  item_id: string;
  user_id: string;
  on_date: string;
  completed_at: string;
}

export interface LegacyPlannerArtifacts {
  dayPlans: DayPlan[];
  templates: PlannerTemplateInput[];
  migratedItemIds: string[];
}

export interface PlannerConflictSnapshot {
  date: string;
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
}

export type PlannerConflictDecision =
  | { kind: 'remote-tombstone'; winner: PlannerConflictSnapshot }
  | { kind: 'local-delete-pending'; winner: PlannerConflictSnapshot }
  | { kind: 'remote-active'; winner: PlannerConflictSnapshot }
  | { kind: 'local-active'; winner: PlannerConflictSnapshot }
  | { kind: 'equal'; winner: PlannerConflictSnapshot };

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function latestTimestamp(...values: string[]): string {
  return values
    .filter(validTimestamp)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? new Date(0).toISOString();
}

function durationMinutes(value: number | null): number {
  return Number.isFinite(value) ? Math.max(5, Math.min(480, Math.round(value ?? 60))) : 60;
}

function recurrenceFor(item: LegacyPlanItem): PlannerTemplateRecurrence | null {
  if (item.rrule_kind === 'none' || !validDate(item.due_date)) return null;
  const weekday = new Date(`${item.due_date}T12:00:00.000Z`).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return {
    kind: item.rrule_kind,
    interval: 1,
    weekdays:
      item.rrule_kind === 'weekdays'
        ? [1, 2, 3, 4, 5]
        : item.rrule_kind === 'weekly'
          ? [weekday]
          : [],
    startDate: item.due_date,
    endDate: item.ends_on && validDate(item.ends_on) && item.ends_on >= item.due_date
      ? item.ends_on
      : null,
    maxOccurrences: null
  };
}

function blockIdentity(item: LegacyPlanItem) {
  const identity = normalizeSubjectIdentity(item.subject ?? '', item.subject_id);
  return identity.label
    ? { subject: identity.label, subjectId: identity.id, customSubject: null }
    : { subject: 'Custom...', subjectId: null, customSubject: item.title.trim() || null };
}

function blockForOccurrence(
  item: LegacyPlanItem,
  date: string,
  completion: LegacyPlanItemCompletion | undefined
): StudySession {
  const identity = blockIdentity(item);
  const durationMin = durationMinutes(item.target_min);
  return {
    id: `legacy-plan-item:${item.id}:${date}`,
    subject: identity.subject,
    subjectId: identity.subjectId,
    ...(identity.customSubject ? { customSubject: identity.customSubject } : {}),
    durationMin,
    mode: 'Deep Study',
    priority: 'P2 High',
    target: item.title.trim(),
    ...(item.notes?.trim() ? { resource: item.notes.trim() } : {}),
    ...(completion
      ? {
          execution: {
            sessionId: null,
            startedAt: null,
            completedAt: completion.completed_at,
            actualMin: durationMin,
            manual: true
          }
        }
      : {})
  };
}

/**
 * Pure compatibility conversion used by tests, backup tooling and any
 * non-SQL import path. It intentionally converts only finite occurrences:
 * one-off due dates and dates with recorded completion evidence. Recurrence
 * rules themselves become typed templates instead of being expanded forever.
 */
export function legacyPlannerArtifacts(
  items: readonly LegacyPlanItem[],
  completions: readonly LegacyPlanItemCompletion[],
  userId: string
): LegacyPlannerArtifacts {
  const ownedItems = items
    .filter((item) => item.user_id === userId && item.id.trim() && item.title.trim())
    .sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
    );
  const activeItemIds = new Set(
    ownedItems.filter((item) => !item.is_archived).map((item) => item.id)
  );
  const itemById = new Map(ownedItems.map((item) => [item.id, item]));
  const completionByOccurrence = new Map<string, LegacyPlanItemCompletion>();

  for (const completion of completions) {
    if (
      completion.user_id !== userId ||
      !itemById.has(completion.item_id) ||
      !validDate(completion.on_date) ||
      !validTimestamp(completion.completed_at)
    ) {
      continue;
    }
    const key = `${completion.item_id}\u0000${completion.on_date}`;
    const previous = completionByOccurrence.get(key);
    if (!previous || completion.completed_at > previous.completed_at) {
      completionByOccurrence.set(key, completion);
    }
  }

  const datesByItem = new Map<string, Set<string>>();
  for (const item of ownedItems) {
    const dates = new Set<string>();
    if (
      activeItemIds.has(item.id) &&
      item.rrule_kind === 'none' &&
      validDate(item.due_date)
    ) {
      dates.add(item.due_date);
    }
    datesByItem.set(item.id, dates);
  }
  for (const completion of completionByOccurrence.values()) {
    datesByItem.get(completion.item_id)?.add(completion.on_date);
  }

  const planByDate = new Map<string, DayPlan>();
  for (const item of ownedItems) {
    for (const date of datesByItem.get(item.id) ?? []) {
      const completion = completionByOccurrence.get(`${item.id}\u0000${date}`);
      const existing =
        planByDate.get(date) ??
        ({ ...emptyDayPlan(date), updatedAt: new Date(0).toISOString() } satisfies DayPlan);
      existing.sessions.push(blockForOccurrence(item, date, completion));
      existing.updatedAt = latestTimestamp(
        existing.updatedAt,
        item.updated_at,
        item.created_at,
        completion?.completed_at ?? ''
      );
      planByDate.set(date, existing);
    }
  }

  const templates = ownedItems.flatMap((item): PlannerTemplateInput[] => {
    if (!activeItemIds.has(item.id)) return [];
    const recurrence = recurrenceFor(item);
    if (!recurrence) return [];
    const identity = blockIdentity(item);
    return [
      {
        id: `legacy-plan-item:${item.id}`,
        name: item.title.trim().slice(0, 80),
        block: {
          ...identity,
          durationMin: durationMinutes(item.target_min),
          mode: 'Deep Study',
          priority: 'P2 High',
          target: item.title.trim(),
          resource: item.notes?.trim() || null,
          startAt: null
        },
        recurrence,
        createdAt: validTimestamp(item.created_at) ? item.created_at : new Date(0).toISOString(),
        updatedAt: validTimestamp(item.updated_at) ? item.updated_at : item.created_at
      }
    ];
  });

  const representedItemIds = new Set<string>();
  for (const [itemId, dates] of datesByItem) {
    if (dates.size > 0) representedItemIds.add(itemId);
  }
  for (const template of templates) {
    representedItemIds.add(template.id?.replace(/^legacy-plan-item:/, '') ?? '');
  }

  return {
    dayPlans: [...planByDate.values()]
      .map((plan) => normalizeDayPlan(plan))
      .sort((left, right) => left.date.localeCompare(right.date)),
    templates,
    migratedItemIds: ownedItems
      .map((item) => item.id)
      .filter((itemId) => representedItemIds.has(itemId))
  };
}

/**
 * Deterministic client-side conflict classification. Revision is authoritative;
 * timestamps are deliberately not used because device clocks may disagree.
 * At equal revision, a tombstone wins so deletion can never be resurrected.
 */
export function resolvePlannerConflict(
  local: PlannerConflictSnapshot,
  remote: PlannerConflictSnapshot
): PlannerConflictDecision {
  if (local.date !== remote.date) throw new Error('Planner conflicts must refer to the same date.');
  if (remote.revision > local.revision) {
    return remote.deletedAt
      ? { kind: 'remote-tombstone', winner: remote }
      : { kind: 'remote-active', winner: remote };
  }
  if (local.revision > remote.revision) {
    return local.deletedAt
      ? { kind: 'local-delete-pending', winner: local }
      : { kind: 'local-active', winner: local };
  }
  if (remote.deletedAt) return { kind: 'remote-tombstone', winner: remote };
  if (local.deletedAt) return { kind: 'local-delete-pending', winner: local };
  return { kind: 'equal', winner: remote };
}
