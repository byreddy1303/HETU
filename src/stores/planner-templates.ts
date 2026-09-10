import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { normalizeSubjectIdentity, type SubjectId } from '@/lib/subjects';
import { nowISO, uuid } from '@/lib/utils';

export const MAX_PLANNER_TEMPLATES = 30;

export type PlannerTemplateStudyMode =
  | 'Deep Study'
  | 'Revision'
  | 'Problem Solving'
  | 'PYQ Practice'
  | 'Mock Test'
  | 'Lecture Watch'
  | 'Note Making'
  | 'Doubt Clearing';

export type PlannerTemplatePriority = 'P1 Critical' | 'P2 High' | 'P3 Medium' | 'P4 Low';

/** 0 is Sunday and 6 is Saturday, matching Date#getDay(). */
export type PlannerTemplateWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PlannerTemplateRecurrenceKind = 'daily' | 'weekdays' | 'weekly' | 'custom';

export interface PlannerTemplateRecurrence {
  kind: PlannerTemplateRecurrenceKind;
  /** Repeat every N days or weeks, depending on kind. */
  interval: number;
  /** Used by weekly/custom. Weekdays is normalized to Monday-Friday. */
  weekdays: PlannerTemplateWeekday[];
  /** First eligible calendar date in YYYY-MM-DD form. */
  startDate: string;
  /** Inclusive final date; null means no date boundary. */
  endDate: string | null;
  /** Optional independent safety boundary for generated occurrences. */
  maxOccurrences: number | null;
}

/**
 * Reusable, non-execution Planner fields only. IDs, launch prescriptions,
 * result receipts and execution facts belong to a concrete dated block and
 * are intentionally impossible to persist in a template.
 */
export interface PlannerTemplateBlock {
  subject: string;
  subjectId: SubjectId | null;
  customSubject: string | null;
  durationMin: number;
  mode: PlannerTemplateStudyMode;
  priority: PlannerTemplatePriority;
  target: string;
  resource: string | null;
  startAt: string | null;
}

export interface PlannerTemplate {
  id: string;
  name: string;
  block: PlannerTemplateBlock;
  recurrence: PlannerTemplateRecurrence | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerTemplateInput {
  id?: string;
  name: string;
  block: PlannerTemplateBlock;
  recurrence?: PlannerTemplateRecurrence | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlannerTemplatesSnapshot {
  templates: PlannerTemplate[];
}

interface PlannerTemplateActions {
  /** Create or replace one template; invalid values are ignored. */
  saveTemplate: (input: PlannerTemplateInput) => PlannerTemplate | null;
  deleteTemplate: (id: string) => void;
  reset: () => void;
}

export type PlannerTemplatesState = PlannerTemplatesSnapshot & PlannerTemplateActions;

const STUDY_MODE_VALUES = new Set<PlannerTemplateStudyMode>([
  'Deep Study',
  'Revision',
  'Problem Solving',
  'PYQ Practice',
  'Mock Test',
  'Lecture Watch',
  'Note Making',
  'Doubt Clearing'
]);

const PRIORITY_VALUES = new Set<PlannerTemplatePriority>([
  'P1 Critical',
  'P2 High',
  'P3 Medium',
  'P4 Low'
]);

const RECURRENCE_KIND_VALUES = new Set<PlannerTemplateRecurrenceKind>([
  'daily',
  'weekdays',
  'weekly',
  'custom'
]);

const EPOCH = new Date(0).toISOString();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotData(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return isRecord(value.data) ? value.data : value;
}

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, fallback: T): T {
  return typeof value === 'string' && values.has(value as T) ? (value as T) : fallback;
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : fallback;
}

function validTimestamp(value: unknown, fallback: string): string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback;
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function validClock(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? value : null;
}

function normalizeWeekdays(value: unknown): PlannerTemplateWeekday[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (candidate): candidate is PlannerTemplateWeekday =>
          Number.isInteger(candidate) && candidate >= 0 && candidate <= 6
      )
    )
  ].sort((a, b) => a - b);
}

export function normalizePlannerTemplateRecurrence(
  value: unknown
): PlannerTemplateRecurrence | null {
  if (!isRecord(value)) return null;
  const startDate = validDate(value.startDate);
  if (
    !startDate ||
    typeof value.kind !== 'string' ||
    !RECURRENCE_KIND_VALUES.has(value.kind as PlannerTemplateRecurrenceKind)
  ) {
    return null;
  }

  const kind = value.kind as PlannerTemplateRecurrenceKind;
  const selectedWeekdays = normalizeWeekdays(value.weekdays);
  const startWeekday = new Date(`${startDate}T12:00:00.000Z`).getUTCDay() as PlannerTemplateWeekday;
  const weekdays =
    kind === 'weekdays'
      ? ([1, 2, 3, 4, 5] as PlannerTemplateWeekday[])
      : kind === 'daily'
        ? []
        : selectedWeekdays.length > 0
          ? selectedWeekdays
          : [startWeekday];
  const candidateEndDate = validDate(value.endDate);

  return {
    kind,
    interval: integerInRange(value.interval, 1, 52, 1),
    weekdays,
    startDate,
    endDate: candidateEndDate && candidateEndDate >= startDate ? candidateEndDate : null,
    maxOccurrences:
      value.maxOccurrences === null ? null : integerInRange(value.maxOccurrences, 1, 366, 0) || null
  };
}

export function normalizePlannerTemplateBlock(value: unknown): PlannerTemplateBlock | null {
  if (!isRecord(value)) return null;

  const rawSubject = boundedString(value.subject, 120);
  const identity = normalizeSubjectIdentity(rawSubject, value.subjectId);
  if (!identity.label) return null;

  const customSubject = boundedString(value.customSubject, 120);
  return {
    subject: identity.label,
    subjectId: identity.id,
    customSubject: identity.label === 'Custom...' ? customSubject || null : null,
    durationMin: integerInRange(value.durationMin, 5, 720, 60),
    mode: enumValue(value.mode, STUDY_MODE_VALUES, 'Deep Study'),
    priority: enumValue(value.priority, PRIORITY_VALUES, 'P2 High'),
    target: boundedString(value.target, 500),
    resource: boundedString(value.resource, 500) || null,
    startAt: validClock(value.startAt)
  };
}

export function normalizePlannerTemplate(value: unknown): PlannerTemplate | null {
  if (!isRecord(value)) return null;
  const id = boundedString(value.id, 160);
  const name = boundedString(value.name, 80);
  const block = normalizePlannerTemplateBlock(value.block);
  if (!id || !name || !block) return null;

  const createdAt = validTimestamp(value.createdAt, EPOCH);
  return {
    id,
    name,
    block,
    recurrence: normalizePlannerTemplateRecurrence(value.recurrence),
    createdAt,
    updatedAt: validTimestamp(value.updatedAt, createdAt)
  };
}

/** One validation boundary shared by localStorage and remote account-state hydration. */
export function normalizePlannerTemplatesSnapshot(value: unknown): PlannerTemplatesSnapshot {
  const data = snapshotData(value);
  const templates: PlannerTemplate[] = [];
  const seenIds = new Set<string>();

  if (Array.isArray(data.templates)) {
    for (const candidate of data.templates) {
      const template = normalizePlannerTemplate(candidate);
      if (!template || seenIds.has(template.id)) continue;
      seenIds.add(template.id);
      templates.push(template);
      if (templates.length === MAX_PLANNER_TEMPLATES) break;
    }
  }

  return { templates };
}

export const EMPTY_PLANNER_TEMPLATES: PlannerTemplatesSnapshot = { templates: [] };

export const usePlannerTemplatesStore = create<PlannerTemplatesState>()(
  persist(
    (set, get) => ({
      ...EMPTY_PLANNER_TEMPLATES,
      saveTemplate: (input) => {
        const rawId = boundedString(input.id, 160);
        const existing = rawId
          ? get().templates.find((template) => template.id === rawId)
          : undefined;
        const timestamp = nowISO();
        const normalized = normalizePlannerTemplate({
          ...input,
          id: rawId || uuid(),
          createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
          updatedAt: timestamp
        });
        if (!normalized) return null;

        set((state) => ({
          templates: [
            normalized,
            ...state.templates.filter((template) => template.id !== normalized.id)
          ].slice(0, MAX_PLANNER_TEMPLATES)
        }));
        return normalized;
      },
      deleteTemplate: (id) => {
        const normalizedId = boundedString(id, 160);
        if (!normalizedId) return;
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== normalizedId)
        }));
      },
      reset: () => set({ templates: [] })
    }),
    {
      name: 'air.planner-templates',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ templates: state.templates }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizePlannerTemplatesSnapshot(persisted)
      })
    }
  )
);
