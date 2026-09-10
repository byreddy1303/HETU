// localStorage cache helpers for the calendar-based Planner. Signed-in plans
// are durably persisted in Supabase by planner-cloud; these user-scoped rows
// keep editing instant and preserve an offline cache.
//
// Storage keys:
//   air.planner.<user-id>.YYYY-MM-DD   → DayPlan for that date

import { currentUserId } from '@/stores/auth';
import { canonicalSubjectLabel, normalizeSubjectIdentity, type SubjectId } from '@/lib/subjects';
import type { PlannerPyqLaunchPrescription, PlannerPyqResultReceipt } from '@/lib/planner-pyq';

const LEGACY_DAY_KEY_PREFIX = 'planner_';
const PLANNER_SYNC_KEY_PREFIX = 'air.planner-sync.';

function cachedPlanUpdatedAt(raw: string | null, date: string): number | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.date !== date || !Array.isArray(candidate.sessions)) return null;
    const parsed = typeof candidate.updatedAt === 'string' ? Date.parse(candidate.updatedAt) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return null;
  }
}

export function dayKeyPrefix(): string {
  return `air.planner.${currentUserId() ?? 'signed-out'}.`;
}

export function plannerDateFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('date');
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

/** Claim pre-multi-user Planner rows for one explicitly identified user once. */
export function migrateLegacyDayPlansForUser(userId: string): void {
  if (!userId) return;
  const scopedPrefix = `air.planner.${userId}.`;
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_DAY_KEY_PREFIX)) legacyKeys.push(key);
    }
    for (const legacyKey of legacyKeys) {
      const date = legacyKey.slice(LEGACY_DAY_KEY_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const scopedKey = `${scopedPrefix}${date}`;
      const legacyRaw = localStorage.getItem(legacyKey);
      const legacyUpdatedAt = cachedPlanUpdatedAt(legacyRaw, date);
      // A malformed legacy value stays in place instead of being silently
      // discarded. It can be inspected or recovered by a later migration.
      if (legacyRaw === null || legacyUpdatedAt === null) continue;

      const scopedRaw = localStorage.getItem(scopedKey);
      const scopedUpdatedAt = cachedPlanUpdatedAt(scopedRaw, date);
      let expectedScopedRaw = scopedRaw;
      if (scopedUpdatedAt === null || legacyUpdatedAt >= scopedUpdatedAt) {
        localStorage.setItem(scopedKey, legacyRaw);
        expectedScopedRaw = legacyRaw;
      }

      // Remove the unscoped copy only after a valid equal-or-newer payload is
      // verifiably present in the exact user's namespace.
      if (
        expectedScopedRaw !== null &&
        localStorage.getItem(scopedKey) === expectedScopedRaw &&
        cachedPlanUpdatedAt(expectedScopedRaw, date) !== null
      ) {
        localStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // Best-effort migration; the legacy row remains available for retry.
  }
}

/** Claim pre-multi-user Planner rows for the currently signed-in user once. */
export function migrateLegacyDayPlans(): void {
  const userId = currentUserId();
  if (userId) migrateLegacyDayPlansForUser(userId);
}

/* ------------------------------ types ------------------------------ */

export type StudyMode =
  | 'Deep Study'
  | 'Revision'
  | 'Problem Solving'
  | 'PYQ Practice'
  | 'Mock Test'
  | 'Lecture Watch'
  | 'Note Making'
  | 'Doubt Clearing';

export type Priority = 'P1 Critical' | 'P2 High' | 'P3 Medium' | 'P4 Low';

export type BreakPattern = 'p25' | 'p50' | 'p90' | 'custom' | 'flexible';

export type DayType =
  | 'Full Study Day'
  | 'Half Day'
  | 'Light Day'
  | 'Mock Test Day'
  | 'Rest/Recovery Day'
  | 'Travel Day'
  | 'Exam Day';

export type EnergyForecast = 'high' | 'medium' | 'low' | 'recovery';

/** End-of-day mood identifier. UI maps these to emoji renderings; the
 *  storage layer keeps stable non-emoji strings for persistence. */
export type EndMood = 'drained' | 'flat' | 'ok' | 'strong' | 'fired_up';

export type Replicate = 'yes' | 'partial' | 'no';

export interface PlannerAvailabilityWindow {
  id: string;
  label: string;
  start: string;
  end: string;
  energy: EnergyForecast;
}

export interface PlannerAvailability {
  /** Learner-entered gross study capacity before protected buffer. */
  availableMin: number;
  /** Minutes that the compiler may never assign to work. */
  protectedBufferMin: number;
  /** Optional explicit windows. An empty list means the wake/sleep span is available. */
  timeWindows: PlannerAvailabilityWindow[];
}

export interface PlannerPyqBlockLaunch {
  kind: 'pyq';
  prescription: PlannerPyqLaunchPrescription;
  /** Frozen only after PYQ start resolves the bank against the approved prescription. */
  resolvedQuestionUids: string[];
  resolvedAt: string | null;
  pyqSessionId: string | null;
}

export interface PlannerPyqBlockResult {
  kind: 'pyq';
  receipt: PlannerPyqResultReceipt;
}

export interface StudySession {
  id: string;
  subject: string;
  /** Stable canonical identity; null for Custom... and unknown legacy labels. */
  subjectId?: SubjectId | null;
  /** When subject === 'Custom...' the free-text name lives here. */
  customSubject?: string;
  /** Planned duration in minutes. */
  durationMin: number;
  mode: StudyMode;
  priority: Priority;
  target: string;
  resource?: string;
  /** Route supplied by an evidence candidate (recovery, analysis, syllabus, etc.). */
  actionHref?: string;
  /** Optional agenda clock time; array order remains the authoritative manual order. */
  startAt?: string | null;
  /** Typed, durable executable contract. Currently PYQ is the evidence-rich launch kind. */
  launch?: PlannerPyqBlockLaunch;
  /** Immutable-summary receipt derived from linked attempt evidence. */
  result?: PlannerPyqBlockResult;
  /** Execution facts are filled by linked Hetu sessions or an explicit completion. */
  execution?: {
    sessionId: string | null;
    startedAt: string | null;
    completedAt: string | null;
    actualMin: number | null;
    manual: boolean;
  };
}

export interface DayStructure {
  wakeAt: string;
  sleepAt: string;
  totalHoursTarget: number;
  breakPattern: BreakPattern;
  customBreak?: string;
  dayType: DayType;
}

export interface Mindset {
  energyForecast: EnergyForecast;
  moodIntent: string;
  motivationNote: string;
}

export interface NonStudy {
  exerciseDone: boolean;
  exerciseTime: string;
  errands: string;
  social: string;
}

export interface Review {
  completionPct: number;
  wentWell: string;
  missed: string;
  endMood: EndMood | '';
  replicate: Replicate | '';
}

export interface DayPlan {
  date: string; // YYYY-MM-DD
  sessions: StudySession[];
  availability: PlannerAvailability;
  structure: DayStructure;
  mindset: Mindset;
  nonStudy: NonStudy;
  review: Review;
  updatedAt: string;
  /** Server optimistic-concurrency token. Absent means the day has never synced. */
  syncRevision?: number;
}

export interface PlannerDaySyncState {
  date: string;
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
}

/* ------------------------------ defaults ------------------------------ */

export function emptyDayPlan(date: string): DayPlan {
  return {
    date,
    sessions: [],
    availability: {
      availableMin: 360,
      protectedBufferMin: 45,
      timeWindows: []
    },
    structure: {
      wakeAt: '06:00',
      sleepAt: '23:00',
      totalHoursTarget: 6,
      breakPattern: 'p50',
      dayType: 'Full Study Day'
    },
    mindset: {
      energyForecast: 'high',
      moodIntent: 'Focused Grind',
      motivationNote: ''
    },
    nonStudy: {
      exerciseDone: false,
      exerciseTime: '',
      errands: '',
      social: ''
    },
    review: {
      completionPct: 0,
      wentWell: '',
      missed: '',
      endMood: '',
      replicate: ''
    },
    updatedAt: new Date().toISOString()
  };
}

/* --------------------------- read / write ---------------------------- */

function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — best-effort only.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // best-effort cache cleanup only
  }
}

function plannerDayKeyForUser(userId: string, date: string): string {
  return `air.planner.${userId}.${date}`;
}

function plannerSyncKeyForUser(userId: string, date: string): string {
  return `${PLANNER_SYNC_KEY_PREFIX}${userId}.${date}`;
}

function validPlannerDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function normalizePlannerDaySyncState(value: unknown): PlannerDaySyncState | null {
  if (!isRecord(value) || !validPlannerDate(value.date)) return null;
  const revision = Number(value.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) return null;
  const updatedAt = validTimestamp(value.updatedAt) ? value.updatedAt : new Date(0).toISOString();
  const deletedAt =
    value.deletedAt === null ? null : validTimestamp(value.deletedAt) ? value.deletedAt : null;
  return { date: value.date, revision, updatedAt, deletedAt };
}

/** Read the durable local revision/tombstone metadata for one account day. */
export function loadPlannerDaySyncState(
  userId: string,
  date: string
): PlannerDaySyncState | null {
  if (!userId || !validPlannerDate(date)) return null;
  return normalizePlannerDaySyncState(safeGet<unknown>(plannerSyncKeyForUser(userId, date)));
}

/** Store a server-acknowledged live revision without changing the day payload. */
export function cachePlannerDaySyncState(userId: string, state: PlannerDaySyncState): void {
  const normalized = normalizePlannerDaySyncState(state);
  if (!userId || !normalized) return;
  safeSet(plannerSyncKeyForUser(userId, normalized.date), normalized);
}

/** Return retained local tombstones for backup, hydration and anti-resurrection checks. */
export function loadPlannerDayTombstones(userId: string): PlannerDaySyncState[] {
  const prefix = `${PLANNER_SYNC_KEY_PREFIX}${userId}.`;
  const tombstones: PlannerDaySyncState[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const state = normalizePlannerDaySyncState(safeGet<unknown>(key));
      if (state?.deletedAt) tombstones.push(state);
    }
  } catch {
    return [];
  }
  return tombstones.sort((left, right) => left.date.localeCompare(right.date));
}

/** Apply an authoritative tombstone to one explicit account cache. */
export function cachePlannerDayTombstone(userId: string, state: PlannerDaySyncState): void {
  const normalized = normalizePlannerDaySyncState(state);
  if (!userId || !normalized?.deletedAt) return;
  safeRemove(plannerDayKeyForUser(userId, normalized.date));
  cachePlannerDaySyncState(userId, normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STUDY_MODE_VALUES: readonly StudyMode[] = [
  'Deep Study',
  'Revision',
  'Problem Solving',
  'PYQ Practice',
  'Mock Test',
  'Lecture Watch',
  'Note Making',
  'Doubt Clearing'
];
const PRIORITY_VALUES: readonly Priority[] = [
  'P1 Critical',
  'P2 High',
  'P3 Medium',
  'P4 Low'
];
const BREAK_PATTERN_VALUES: readonly BreakPattern[] = ['p25', 'p50', 'p90', 'custom', 'flexible'];
const DAY_TYPE_VALUES: readonly DayType[] = [
  'Full Study Day',
  'Half Day',
  'Light Day',
  'Mock Test Day',
  'Rest/Recovery Day',
  'Travel Day',
  'Exam Day'
];
const ENERGY_VALUES: readonly EnergyForecast[] = ['high', 'medium', 'low', 'recovery'];
const END_MOOD_VALUES: readonly EndMood[] = ['drained', 'flat', 'ok', 'strong', 'fired_up'];
const REPLICATE_VALUES: readonly Replicate[] = ['yes', 'partial', 'no'];

function normalizedEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizedFiniteNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  round = true
): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  const normalized = round ? Math.round(numeric) : numeric;
  return Math.max(minimum, Math.min(maximum, normalized));
}

function normalizedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizedTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizedClock(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '';
  return Number(match[1]) <= 23 && Number(match[2]) <= 59 ? value : '';
}

function normalizedTimestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function uniqueLegacyId(base: string, usedIds: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function normalizedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function normalizedBoundedStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number
): string[] {
  return normalizedStringArray(value)
    .filter((item) => item.length <= maxLength)
    .slice(0, maxItems);
}

function normalizedPyqLaunch(value: unknown): PlannerPyqBlockLaunch | undefined {
  if (!isRecord(value) || value.kind !== 'pyq' || !isRecord(value.prescription)) return undefined;
  const prescription = value.prescription;
  const config = prescription.config;
  if (
    prescription.schemaVersion !== 1 ||
    typeof prescription.id !== 'string' ||
    typeof prescription.plannerDate !== 'string' ||
    typeof prescription.plannerBlockId !== 'string' ||
    !isRecord(config)
  ) {
    return undefined;
  }
  const exactQuestionUids = normalizedStringArray(prescription.exactQuestionUids);
  const subjectSlugs = normalizedBoundedStringArray(config.subjectSlugs, 32, 80);
  const normalizedConfig: Record<string, unknown> = { ...config };
  delete normalizedConfig.subjectSlugs;
  if (subjectSlugs.length > 0) normalizedConfig.subjectSlugs = subjectSlugs;
  const normalizedPrescription = {
    ...prescription,
    exactQuestionUids,
    config: normalizedConfig
  } as unknown as PlannerPyqLaunchPrescription;
  return {
    kind: 'pyq',
    prescription: normalizedPrescription,
    resolvedQuestionUids: normalizedStringArray(value.resolvedQuestionUids),
    resolvedAt: normalizedTimestamp(value.resolvedAt),
    pyqSessionId: normalizedTrimmedString(value.pyqSessionId)
  };
}

function normalizedPyqResult(value: unknown): PlannerPyqBlockResult | undefined {
  if (!isRecord(value) || value.kind !== 'pyq' || !isRecord(value.receipt)) return undefined;
  const receipt = value.receipt;
  if (
    receipt.schemaVersion !== 1 ||
    typeof receipt.id !== 'string' ||
    typeof receipt.prescriptionId !== 'string' ||
    typeof receipt.plannerDate !== 'string' ||
    typeof receipt.plannerBlockId !== 'string' ||
    typeof receipt.pyqSessionId !== 'string'
  ) {
    return undefined;
  }
  return {
    kind: 'pyq',
    receipt: {
      ...receipt,
      exactQuestionUids: normalizedStringArray(receipt.exactQuestionUids),
      submittedQuestionUids: normalizedStringArray(receipt.submittedQuestionUids),
      recoveryItemIds: normalizedStringArray(receipt.recoveryItemIds)
    } as unknown as PlannerPyqResultReceipt
  };
}

function normalizedExecution(value: unknown): StudySession['execution'] | undefined {
  if (!isRecord(value)) return undefined;
  const sessionId = normalizedTrimmedString(value.sessionId);
  const startedAt = normalizedTimestamp(value.startedAt);
  const completedAt = normalizedTimestamp(value.completedAt);
  const actualMin =
    value.actualMin === null || value.actualMin === undefined
      ? null
      : normalizedFiniteNumber(value.actualMin, Number.NaN, 0, 1_440);
  const safeActualMin = Number.isFinite(actualMin) ? actualMin : null;
  const manual = value.manual === true;
  if (
    sessionId === null &&
    startedAt === null &&
    completedAt === null &&
    safeActualMin === null &&
    !manual
  ) {
    return undefined;
  }
  return {
    sessionId,
    startedAt,
    completedAt,
    actualMin: safeActualMin,
    manual
  };
}

/** Canonicalize known subject aliases without disturbing custom/unknown text. */
export function normalizeStudySession(session: StudySession): StudySession {
  const raw: Record<string, unknown> = isRecord(session as unknown)
    ? (session as unknown as Record<string, unknown>)
    : {};
  const subject = normalizedTrimmedString(raw.subject) ?? '';
  const customSubject = normalizedTrimmedString(raw.customSubject);
  const launch = normalizedPyqLaunch(raw.launch);
  const result = normalizedPyqResult(raw.result);
  const execution = normalizedExecution(raw.execution);
  const startAt = normalizedClock(raw.startAt);
  const retained = { ...raw };
  delete retained.customSubject;
  delete retained.resource;
  delete retained.startAt;
  delete retained.actionHref;
  delete retained.execution;
  delete retained.launch;
  delete retained.result;
  const withContracts: StudySession = {
    ...retained,
    id: normalizedTrimmedString(raw.id) ?? 'legacy-session',
    subject: subject || 'Custom...',
    durationMin: normalizedFiniteNumber(raw.durationMin, 60, 1, 720),
    mode: normalizedEnum(raw.mode, STUDY_MODE_VALUES, 'Deep Study'),
    priority: normalizedEnum(raw.priority, PRIORITY_VALUES, 'P2 High'),
    target: normalizedString(raw.target),
    ...(customSubject ? { customSubject } : {}),
    ...(typeof raw.resource === 'string' ? { resource: raw.resource } : {}),
    ...(startAt ? { startAt } : raw.startAt === null ? { startAt: null } : {}),
    ...(typeof raw.actionHref === 'string' && raw.actionHref.startsWith('/')
      ? { actionHref: raw.actionHref }
      : {}),
    ...(execution ? { execution } : {}),
    ...(launch ? { launch } : {}),
    ...(result && (!launch || result.receipt.prescriptionId === launch.prescription.id)
      ? { result }
      : {})
  };
  if (subject === 'Custom...') {
    return { ...withContracts, subjectId: null };
  }
  const legacySnakeId = raw.subject_id;
  const identity = normalizeSubjectIdentity(subject, raw.subjectId ?? legacySnakeId);
  return {
    ...withContracts,
    subject: identity.label || 'Custom...',
    subjectId: identity.id
  };
}

function normalizedSessions(value: unknown, date: string): StudySession[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  const sessions: StudySession[] = [];
  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) return;
    const normalized = normalizeStudySession(candidate as unknown as StudySession);
    const requestedId = normalizedTrimmedString(candidate.id);
    const fallbackId = `legacy-session-${date || 'unknown'}-${index + 1}`;
    sessions.push({
      ...normalized,
      id: uniqueLegacyId(requestedId ?? fallbackId, usedIds)
    });
  });
  return sessions;
}

function normalizedTimeWindows(
  value: unknown,
  fallbackEnergy: EnergyForecast
): PlannerAvailabilityWindow[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  const windows: PlannerAvailabilityWindow[] = [];
  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) return;
    const requestedId = normalizedTrimmedString(candidate.id);
    windows.push({
      id: uniqueLegacyId(requestedId ?? `legacy-window-${index + 1}`, usedIds),
      label: normalizedTrimmedString(candidate.label) ?? `Window ${index + 1}`,
      start: normalizedClock(candidate.start),
      end: normalizedClock(candidate.end),
      energy: normalizedEnum(candidate.energy, ENERGY_VALUES, fallbackEnergy)
    });
  });
  return windows;
}

/** Normalize all nested subject identities while retaining every plan/session. */
export function normalizeDayPlan(plan: DayPlan): DayPlan {
  const raw: Record<string, unknown> = isRecord(plan as unknown)
    ? (plan as unknown as Record<string, unknown>)
    : {};
  const date = normalizedString(raw.date);
  const defaults = emptyDayPlan(date);
  const availability = isRecord(raw.availability) ? raw.availability : {};
  const structure = isRecord(raw.structure) ? raw.structure : {};
  const mindset = isRecord(raw.mindset) ? raw.mindset : {};
  const nonStudy = isRecord(raw.nonStudy) ? raw.nonStudy : {};
  const review = isRecord(raw.review) ? raw.review : {};
  const energyForecast = normalizedEnum(
    mindset.energyForecast,
    ENERGY_VALUES,
    defaults.mindset.energyForecast
  );
  const availableMin = normalizedFiniteNumber(
    availability.availableMin,
    defaults.availability.availableMin,
    0,
    960
  );
  const requestedBufferMin = normalizedFiniteNumber(
    availability.protectedBufferMin,
    defaults.availability.protectedBufferMin,
    0,
    480
  );
  const retained = { ...raw };
  delete retained.syncRevision;
  return {
    ...defaults,
    ...retained,
    date,
    availability: {
      availableMin,
      protectedBufferMin: Math.min(availableMin, requestedBufferMin),
      timeWindows: normalizedTimeWindows(availability.timeWindows, energyForecast)
    },
    sessions: normalizedSessions(raw.sessions, date),
    structure: {
      wakeAt: normalizedClock(structure.wakeAt) || defaults.structure.wakeAt,
      sleepAt: normalizedClock(structure.sleepAt) || defaults.structure.sleepAt,
      totalHoursTarget: normalizedFiniteNumber(
        structure.totalHoursTarget,
        defaults.structure.totalHoursTarget,
        0,
        24,
        false
      ),
      breakPattern: normalizedEnum(
        structure.breakPattern,
        BREAK_PATTERN_VALUES,
        defaults.structure.breakPattern
      ),
      ...(typeof structure.customBreak === 'string'
        ? { customBreak: structure.customBreak }
        : {}),
      dayType: normalizedEnum(structure.dayType, DAY_TYPE_VALUES, defaults.structure.dayType)
    },
    mindset: {
      energyForecast,
      moodIntent: normalizedString(mindset.moodIntent, defaults.mindset.moodIntent),
      motivationNote: normalizedString(mindset.motivationNote)
    },
    nonStudy: {
      exerciseDone: nonStudy.exerciseDone === true,
      exerciseTime: normalizedString(nonStudy.exerciseTime),
      errands: normalizedString(nonStudy.errands),
      social: normalizedString(nonStudy.social)
    },
    review: {
      completionPct: normalizedFiniteNumber(review.completionPct, 0, 0, 100),
      wentWell: normalizedString(review.wentWell),
      missed: normalizedString(review.missed),
      endMood:
        typeof review.endMood === 'string' && END_MOOD_VALUES.includes(review.endMood as EndMood)
          ? (review.endMood as EndMood)
          : '',
      replicate:
        typeof review.replicate === 'string' &&
        REPLICATE_VALUES.includes(review.replicate as Replicate)
          ? (review.replicate as Replicate)
          : ''
    },
    updatedAt: normalizedTimestamp(raw.updatedAt) ?? defaults.updatedAt,
    ...(Number.isSafeInteger(raw.syncRevision) && Number(raw.syncRevision) > 0
      ? { syncRevision: Number(raw.syncRevision) }
      : {})
  };
}

function migrateCachedPlan(key: string, plan: DayPlan): DayPlan {
  const normalized = normalizeDayPlan(plan);
  if (JSON.stringify(normalized) !== JSON.stringify(plan)) safeSet(key, normalized);
  return normalized;
}

export function keyFor(date: string): string {
  return `${dayKeyPrefix()}${date}`;
}

export function loadDayPlan(date: string): DayPlan | null {
  migrateLegacyDayPlans();
  const userId = currentUserId() ?? 'signed-out';
  if (loadPlannerDaySyncState(userId, date)?.deletedAt) return null;
  const key = keyFor(date);
  const plan = safeGet<DayPlan>(key);
  return plan ? migrateCachedPlan(key, plan) : null;
}

/** Return every locally cached Planner day owned by one user. */
export function loadAllDayPlans(userId: string): DayPlan[] {
  const prefix = `air.planner.${userId}.`;
  const plans: DayPlan[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const date = key.slice(prefix.length);
      if (loadPlannerDaySyncState(userId, date)?.deletedAt) continue;
      const plan = safeGet<DayPlan>(key);
      if (plan?.date === date && Array.isArray(plan.sessions)) {
        plans.push(migrateCachedPlan(key, plan));
      }
    }
  } catch {
    return [];
  }
  return plans.sort((a, b) => a.date.localeCompare(b.date));
}

export function saveDayPlan(plan: DayPlan): DayPlan {
  const userId = currentUserId() ?? 'signed-out';
  const existingSync = loadPlannerDaySyncState(userId, plan.date);
  const inheritedRevision =
    Number.isSafeInteger(plan.syncRevision) && Number(plan.syncRevision) > 0
      ? Number(plan.syncRevision)
      : (existingSync?.revision ?? 0);
  const saved = normalizeDayPlan({
    ...plan,
    updatedAt: new Date().toISOString(),
    ...(inheritedRevision > 0 ? { syncRevision: inheritedRevision } : {})
  });
  safeSet(keyFor(plan.date), saved);
  cachePlannerDaySyncState(userId, {
    date: plan.date,
    revision: inheritedRevision,
    updatedAt: saved.updatedAt,
    deletedAt: null
  });
  return saved;
}

/** Cache a server copy for one explicit account without changing its timestamp. */
export function cacheDayPlanForUser(userId: string, plan: DayPlan): void {
  if (!userId) return;
  const normalized = normalizeDayPlan(plan);
  safeSet(plannerDayKeyForUser(userId, normalized.date), normalized);
  cachePlannerDaySyncState(userId, {
    date: normalized.date,
    revision: normalized.syncRevision ?? 0,
    updatedAt: normalized.updatedAt,
    deletedAt: null
  });
}

/** Cache a server copy for the active account without making it look newer. */
export function cacheDayPlan(plan: DayPlan): void {
  cacheDayPlanForUser(currentUserId() ?? 'signed-out', plan);
}

/**
 * Remove a local day while retaining its base revision. The matching cloud
 * mutation advances that revision and turns this marker into an acknowledged
 * server tombstone.
 */
export function deleteDayPlan(date: string): PlannerDaySyncState {
  const userId = currentUserId() ?? 'signed-out';
  const existingPlan = safeGet<DayPlan>(plannerDayKeyForUser(userId, date));
  const existingSync = loadPlannerDaySyncState(userId, date);
  const now = new Date().toISOString();
  const state: PlannerDaySyncState = {
    date,
    revision: Math.max(existingPlan?.syncRevision ?? 0, existingSync?.revision ?? 0),
    updatedAt: now,
    deletedAt: existingSync?.deletedAt ?? now
  };
  cachePlannerDayTombstone(userId, state);
  return state;
}

/* ----------------------- calendar bulk queries ----------------------- */

/** Return a Set of YYYY-MM-DD keys that have a plan stored. */
export function loadPlanIndexForMonth(year: number, monthIndex: number): Set<string> {
  const set = new Set<string>();
  migrateLegacyDayPlans();
  const prefix = `${dayKeyPrefix()}${year}-${String(monthIndex + 1).padStart(2, '0')}-`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(prefix)) set.add(k.slice(dayKeyPrefix().length));
    }
  } catch {
    // ignore
  }
  return set;
}

/** Quick per-day summary for the calendar cell chips. */
export interface DayCellSummary {
  subjects: string[];
  totalMin: number;
}

export function summarize(plan: DayPlan | null): DayCellSummary {
  if (!plan) return { subjects: [], totalMin: 0 };
  const subjects: string[] = [];
  let totalMin = 0;
  for (const s of plan.sessions) {
    const label =
      s.subject === 'Custom...' && s.customSubject
        ? s.customSubject
        : canonicalSubjectLabel(s.subject);
    if (label && !subjects.includes(label)) subjects.push(label);
    totalMin += s.durationMin || 0;
  }
  return { subjects, totalMin };
}
