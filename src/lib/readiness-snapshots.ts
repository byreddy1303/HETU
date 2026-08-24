// Local-only trend + debt tracking for the readiness page.
//
// Snapshots are indexed by YYYY-MM-DD; we keep the last 180 days (~6 months
// covers pre-exam prep). The weekly delta compares today's score to the
// snapshot from ~7 days ago. Debt entries track any component (or
// subject×component) that stays below its healthy threshold for consecutive
// weeks so the user sees what's been holding them back the longest.

import type { ReadinessBreakdown, ReadinessComponentKey, SubjectReadiness } from '@/lib/readiness';

// Re-export the calculation module's version so storage/UI cannot drift from
// the formula they are snapshotting.
export { READINESS_CALCULATION_VERSION } from '@/lib/readiness';

const STORAGE_PREFIX = 'air-journal:readiness:v3';
const LEGACY_STORAGE_PREFIX = 'air-journal:readiness:v2';

/** Kept modest so localStorage stays cheap. 180 days is more than any GATE
 *  prep cycle needs. */
const MAX_SNAPSHOTS = 180;

/* ------------------------------- types ------------------------------- */

export interface ReadinessSnapshot {
  date: string; // YYYY-MM-DD (local)
  score: number;
  coverage: number;
  retention: number;
  calibration: number;
  surface: number;
  daysToExam: number;
  /** Version 1 was Journal-only. Version 2 uses the immutable attempt ledger. */
  calculationVersion: number;
  evidenceCounts?: Record<string, number>;
}

export interface DebtEntry {
  key: string; // stable id — either `component:coverage` or `subject:DBMS:coverage`
  component: ReadinessComponentKey;
  subject: string | null;
  since: string; // YYYY-MM-DD first observed below threshold
  weeksHeld: number;
  lastSeen: string; // YYYY-MM-DD most recent observation still below
}

/* ------------------------------ storage ------------------------------ */

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore (quota / disabled)
  }
}

/* ---------------------------- snapshots ---------------------------- */

function storageKey(
  userId: string,
  kind: 'snapshots' | 'watchlist',
  prefix = STORAGE_PREFIX
): string {
  return `${prefix}:${userId}:${kind}`;
}

export function loadSnapshots(userId: string): ReadinessSnapshot[] {
  const current = safeGet<ReadinessSnapshot[]>(storageKey(userId, 'snapshots'), []);
  if (current.length > 0) {
    return current
      .map((row) => ({ ...row, calculationVersion: row.calculationVersion ?? 1 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // The v2 local envelope pre-dates methodology versioning. Preserve those
  // rows explicitly as calculation version 1 instead of silently treating
  // them as comparable with the corrected attempt-ledger series.
  const legacy = safeGet<Array<Omit<ReadinessSnapshot, 'calculationVersion'>>>(
    storageKey(userId, 'snapshots', LEGACY_STORAGE_PREFIX),
    []
  );
  const migrated = legacy
    .map((row) => ({ ...row, calculationVersion: 1 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (migrated.length > 0) safeSet(storageKey(userId, 'snapshots'), migrated);
  return migrated;
}

/** Idempotent upsert of today's snapshot. Overwrites the row for `date` if
 *  it exists so the latest score for the day wins. */
export function upsertSnapshot(userId: string, next: ReadinessSnapshot): ReadinessSnapshot[] {
  const all = loadSnapshots(userId).filter(
    (s) => s.date !== next.date || s.calculationVersion !== next.calculationVersion
  );
  all.push(next);
  all.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = all.slice(-MAX_SNAPSHOTS);
  safeSet(storageKey(userId, 'snapshots'), trimmed);
  return trimmed;
}

/** Compare today's snapshot to the closest one from ~7 days ago. */
export function weeklyDelta(snapshots: ReadinessSnapshot[]): number | null {
  if (snapshots.length < 2) return null;
  const today = snapshots[snapshots.length - 1];
  const comparable = snapshots.filter(
    (snapshot) => snapshot.calculationVersion === today.calculationVersion
  );
  if (comparable.length < 2) return null;
  const target = new Date(today.date);
  target.setDate(target.getDate() - 7);
  const targetISO = target.toISOString().slice(0, 10);
  // pick the snapshot with the smallest positive diff from the target
  let best: ReadinessSnapshot | null = null;
  let bestDiff = Infinity;
  for (const s of comparable) {
    if (s.date === today.date) continue;
    const diff = Math.abs(new Date(s.date).getTime() - new Date(targetISO).getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  if (!best || bestDiff > 3 * 86400000) return null;
  return today.score - best.score;
}

/* --------------------------- projection ---------------------------- */

export interface Projection {
  projectedScore: number;
  slopePerDay: number;
  sampleDays: number;
}

/** Naive linear regression on the last 30 days of snapshots. Returns the
 *  score the current slope would land you at on the exam day. */
export function projectToExam(
  snapshots: ReadinessSnapshot[],
  daysToExam: number
): Projection | null {
  const latestVersion = snapshots.at(-1)?.calculationVersion;
  const recent = snapshots
    .filter((snapshot) => snapshot.calculationVersion === latestVersion)
    .slice(-30);
  if (recent.length < 4) return null;
  const t0 = new Date(recent[0].date).getTime();
  const spanDays = (new Date(recent[recent.length - 1].date).getTime() - t0) / 86400000;
  if (spanDays < 21) return null;
  const xs = recent.map((s) => (new Date(s.date).getTime() - t0) / 86400000);
  const ys = recent.map((s) => s.score);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const xExam = xs[xs.length - 1] + daysToExam;
  const projected = Math.round(intercept + slope * xExam);
  return {
    projectedScore: Math.max(0, Math.min(100, projected)),
    slopePerDay: Math.round(slope * 100) / 100,
    sampleDays: recent.length
  };
}

/* ------------------------------- debt ------------------------------- */

const HEALTHY_THRESHOLDS: Record<ReadinessComponentKey, number> = {
  coverage: 0.6,
  retention: 0.55,
  calibration: 0.65,
  surface: 0.6
};

export function loadDebt(userId: string): DebtEntry[] {
  const current = safeGet<DebtEntry[]>(storageKey(userId, 'watchlist'), []);
  if (current.length > 0) return current;
  const legacy = safeGet<DebtEntry[]>(storageKey(userId, 'watchlist', LEGACY_STORAGE_PREFIX), []);
  if (legacy.length > 0) safeSet(storageKey(userId, 'watchlist'), legacy);
  return legacy;
}

function debtKey(subject: string | null, component: ReadinessComponentKey): string {
  return subject ? `subject:${subject}:${component}` : `component:${component}`;
}

/** Recompute the debt log for today based on the overall breakdown + per-subject
 *  matrix. Any (subject, component) that is below its healthy threshold either
 *  opens a new debt entry or increments the weeksHeld on an existing one. Debts
 *  that flip above the threshold are dropped. */
export function updateDebt(
  userId: string,
  today: string,
  overall: ReadinessBreakdown,
  perSubject: SubjectReadiness[]
): DebtEntry[] {
  const existing = new Map<string, DebtEntry>(loadDebt(userId).map((d) => [d.key, d]));
  const now = new Date(today);

  function observe(subject: string | null, component: ReadinessComponentKey, value: number) {
    const k = debtKey(subject, component);
    if (value >= HEALTHY_THRESHOLDS[component]) {
      existing.delete(k);
      return;
    }
    const prev = existing.get(k);
    if (!prev) {
      existing.set(k, {
        key: k,
        component,
        subject,
        since: today,
        weeksHeld: 0,
        lastSeen: today
      });
      return;
    }
    // Count weeks between since and today.
    const weeks = Math.max(
      0,
      Math.floor((now.getTime() - new Date(prev.since).getTime()) / (7 * 86400000))
    );
    existing.set(k, { ...prev, weeksHeld: weeks, lastSeen: today });
  }

  if (overall.confidence !== 'early') {
    observe(null, 'coverage', overall.coverage);
    observe(null, 'retention', overall.retention);
    observe(null, 'calibration', overall.calibration);
    observe(null, 'surface', overall.surface);
  }

  for (const s of perSubject) {
    if (!s.hasSignal || s.confidence === 'early') continue;
    observe(s.subject, 'coverage', s.coverage);
    observe(s.subject, 'retention', s.retention);
    observe(s.subject, 'calibration', s.calibration);
    observe(s.subject, 'surface', s.surface);
  }

  const list = Array.from(existing.values()).sort((a, b) => b.weeksHeld - a.weeksHeld);
  safeSet(storageKey(userId, 'watchlist'), list);
  return list;
}

export const DEBT_LABEL: Record<ReadinessComponentKey, string> = {
  coverage: 'Coverage',
  retention: 'Retention',
  calibration: 'Calibration',
  surface: 'Mistake surface'
};
