// Cross-day analytics for the planner. Reads every locally cached DayPlan
// (user-scoped air.planner.* keys) and rolls up the summaries that the /planner
// insights card renders.
//
// Everything here is pure — pass an array of DayPlans in, get numbers back.
// The page loads plans via loadAllDayPlans() once on mount and passes them
// through so the caller controls IO.

import type { DayPlan } from '@/lib/planner-storage';
import { dayKeyPrefix, loadDayPlan, migrateLegacyDayPlans } from '@/lib/planner-storage';
import { canonicalSubjectLabel } from '@/lib/subjects';

function plannedSubjectLabel(subject: string, customSubject?: string): string {
  return subject === 'Custom...' && customSubject ? customSubject : canonicalSubjectLabel(subject);
}

/** Load every currently cached DayPlan. Skips corrupt rows. */
export function loadAllDayPlans(): DayPlan[] {
  const plans: DayPlan[] = [];
  migrateLegacyDayPlans();
  const prefix = dayKeyPrefix();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const date = k.slice(prefix.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const p = loadDayPlan(date);
      if (p) plans.push(p);
    }
  } catch {
    // ignore
  }
  return plans.sort((a, b) => a.date.localeCompare(b.date));
}

function isoNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function inLastNDays(plan: DayPlan, days: number): boolean {
  return plan.date >= isoNDaysAgo(days);
}

/* ---------------------------- basic rollups --------------------------- */

export interface Rollup {
  daysPlanned: number;
  totalMinPlanned: number;
  totalHoursTargeted: number;
  avgSessionsPerDay: number;
  avgSessionDurationMin: number;
}

export function rollup(plans: DayPlan[]): Rollup {
  if (plans.length === 0) {
    return {
      daysPlanned: 0,
      totalMinPlanned: 0,
      totalHoursTargeted: 0,
      avgSessionsPerDay: 0,
      avgSessionDurationMin: 0
    };
  }
  let totalMin = 0;
  let totalTargeted = 0;
  let totalSessions = 0;
  let totalSessionMin = 0;
  for (const p of plans) {
    totalTargeted += p.structure.totalHoursTarget || 0;
    for (const s of p.sessions) {
      totalMin += s.durationMin || 0;
      totalSessions += 1;
      totalSessionMin += s.durationMin || 0;
    }
  }
  return {
    daysPlanned: plans.length,
    totalMinPlanned: totalMin,
    totalHoursTargeted: Math.round(totalTargeted * 10) / 10,
    avgSessionsPerDay: Math.round((totalSessions / plans.length) * 10) / 10,
    avgSessionDurationMin: totalSessions === 0 ? 0 : Math.round(totalSessionMin / totalSessions)
  };
}

/* ----------------------- subject / mode / priority ----------------------- */

export interface Share {
  label: string;
  min: number;
  pct: number;
}

function toShares(minutesByLabel: Map<string, number>): Share[] {
  const total = Array.from(minutesByLabel.values()).reduce((s, x) => s + x, 0);
  if (total === 0) return [];
  return Array.from(minutesByLabel.entries())
    .map(([label, min]) => ({
      label,
      min,
      pct: Math.round((min / total) * 100)
    }))
    .sort((a, b) => b.min - a.min);
}

export function subjectShare(plans: DayPlan[]): Share[] {
  const m = new Map<string, number>();
  for (const p of plans) {
    for (const s of p.sessions) {
      const name = plannedSubjectLabel(s.subject, s.customSubject);
      m.set(name, (m.get(name) ?? 0) + (s.durationMin || 0));
    }
  }
  return toShares(m);
}

export function modeShare(plans: DayPlan[]): Share[] {
  const m = new Map<string, number>();
  for (const p of plans) {
    for (const s of p.sessions) {
      m.set(s.mode, (m.get(s.mode) ?? 0) + (s.durationMin || 0));
    }
  }
  return toShares(m);
}

export function priorityShare(plans: DayPlan[]): Share[] {
  const m = new Map<string, number>();
  for (const p of plans) {
    for (const s of p.sessions) {
      m.set(s.priority, (m.get(s.priority) ?? 0) + (s.durationMin || 0));
    }
  }
  return toShares(m);
}

/* ----------------------------- review stats ----------------------------- */

export interface ReviewStats {
  reviewedDays: number;
  avgCompletionPct: number;
  replicateYes: number;
  replicatePartial: number;
  replicateNo: number;
  moodCounts: Record<string, number>;
}

export function reviewStats(plans: DayPlan[]): ReviewStats {
  let reviewed = 0;
  let sumPct = 0;
  let yes = 0;
  let partial = 0;
  let no = 0;
  const moods: Record<string, number> = {};
  for (const p of plans) {
    const filled =
      p.review.completionPct > 0 ||
      p.review.wentWell.trim().length > 0 ||
      p.review.missed.trim().length > 0 ||
      p.review.endMood !== '' ||
      p.review.replicate !== '';
    if (!filled) continue;
    reviewed += 1;
    sumPct += p.review.completionPct;
    if (p.review.replicate === 'yes') yes += 1;
    else if (p.review.replicate === 'partial') partial += 1;
    else if (p.review.replicate === 'no') no += 1;
    if (p.review.endMood) {
      moods[p.review.endMood] = (moods[p.review.endMood] ?? 0) + 1;
    }
  }
  return {
    reviewedDays: reviewed,
    avgCompletionPct: reviewed === 0 ? 0 : Math.round(sumPct / reviewed),
    replicateYes: yes,
    replicatePartial: partial,
    replicateNo: no,
    moodCounts: moods
  };
}

/* -------------------------- neglected subjects -------------------------- */

/** Subjects (from PLANNER_SUBJECTS) that received less than `minMinutes` in
 *  the last `windowDays` — good candidates to schedule next. */
export function neglectedSubjects(
  plans: DayPlan[],
  allSubjects: readonly string[],
  windowDays: number,
  minMinutes: number
): { label: string; min: number }[] {
  const cutoff = isoNDaysAgo(windowDays);
  const m = new Map<string, number>();
  for (const s of allSubjects) m.set(canonicalSubjectLabel(s), 0);
  for (const p of plans) {
    if (p.date < cutoff) continue;
    for (const sess of p.sessions) {
      const name = plannedSubjectLabel(sess.subject, sess.customSubject);
      if (!m.has(name)) continue; // ignore Custom subjects — can't tell if they're canonical
      m.set(name, (m.get(name) ?? 0) + (sess.durationMin || 0));
    }
  }
  return Array.from(m.entries())
    .filter(([label, min]) => label !== 'Custom...' && min < minMinutes)
    .map(([label, min]) => ({ label, min }))
    .sort((a, b) => a.min - b.min);
}

/* ---------------------------- day type mix ---------------------------- */

export function dayTypeShare(plans: DayPlan[]): Share[] {
  const m = new Map<string, number>();
  for (const p of plans) {
    m.set(p.structure.dayType, (m.get(p.structure.dayType) ?? 0) + 1);
  }
  // Special: count days not minutes.
  const total = plans.length || 1;
  return Array.from(m.entries())
    .map(([label, count]) => ({
      label,
      min: count, // "min" repurposed as raw count
      pct: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.min - a.min);
}

/* ---------------------------- window helpers ---------------------------- */

export function windowed(plans: DayPlan[], days: number): DayPlan[] {
  return plans.filter((p) => inLastNDays(p, days));
}
