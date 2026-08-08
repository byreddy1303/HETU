// localStorage helpers for the calendar-based Planner. Kept isolated so we
// can migrate to Dexie/Supabase later without touching the UI.
//
// Storage keys:
//   air.planner.<user-id>.YYYY-MM-DD   → DayPlan for that date

import { currentUserId } from '@/stores/auth';

const LEGACY_DAY_KEY_PREFIX = 'planner_';

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

/** Claim pre-multi-user Planner rows for the currently signed-in user once. */
export function migrateLegacyDayPlans(): void {
  if (!currentUserId()) return;
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_DAY_KEY_PREFIX)) legacyKeys.push(key);
    }
    for (const legacyKey of legacyKeys) {
      const date = legacyKey.slice(LEGACY_DAY_KEY_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const scopedKey = `${dayKeyPrefix()}${date}`;
      if (!localStorage.getItem(scopedKey)) {
        const value = localStorage.getItem(legacyKey);
        if (value) localStorage.setItem(scopedKey, value);
      }
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Best-effort migration; the legacy row remains available for retry.
  }
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

export interface StudySession {
  id: string;
  subject: string;
  /** When subject === 'Custom...' the free-text name lives here. */
  customSubject?: string;
  /** Planned duration in minutes. */
  durationMin: number;
  mode: StudyMode;
  priority: Priority;
  target: string;
  resource?: string;
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
  structure: DayStructure;
  mindset: Mindset;
  nonStudy: NonStudy;
  review: Review;
  updatedAt: string;
}

/* ------------------------------ defaults ------------------------------ */

export function emptyDayPlan(date: string): DayPlan {
  return {
    date,
    sessions: [],
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

export function keyFor(date: string): string {
  return `${dayKeyPrefix()}${date}`;
}

export function loadDayPlan(date: string): DayPlan | null {
  migrateLegacyDayPlans();
  return safeGet<DayPlan>(keyFor(date));
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
      const plan = safeGet<DayPlan>(key);
      if (plan?.date === date && Array.isArray(plan.sessions)) plans.push(plan);
    }
  } catch {
    return [];
  }
  return plans.sort((a, b) => a.date.localeCompare(b.date));
}

export function saveDayPlan(plan: DayPlan): DayPlan {
  const saved = { ...plan, updatedAt: new Date().toISOString() };
  safeSet(keyFor(plan.date), saved);
  return saved;
}

/** Cache a server copy without making it look newer than the server row. */
export function cacheDayPlan(plan: DayPlan): void {
  safeSet(keyFor(plan.date), plan);
}

export function deleteDayPlan(date: string): void {
  try {
    localStorage.removeItem(keyFor(date));
  } catch {
    // ignore
  }
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
    const label = s.subject === 'Custom...' && s.customSubject ? s.customSubject : s.subject;
    if (label && !subjects.includes(label)) subjects.push(label);
    totalMin += s.durationMin || 0;
  }
  return { subjects, totalMin };
}
