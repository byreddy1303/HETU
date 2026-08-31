// Local-only trend + debt tracking for the readiness page.
//
// Snapshots are indexed by YYYY-MM-DD; we keep the last 180 days (~6 months
// covers pre-exam prep). The weekly delta compares today's score to the
// snapshot from ~7 days ago. Debt entries track any component (or
// subject×component) that stays below its healthy threshold for consecutive
// weeks so the user sees what's been holding them back the longest.

import type { ReadinessBreakdown, ReadinessComponentKey, SubjectReadiness } from '@/lib/readiness';
import { supabase, supabaseConfigured } from '@/lib/supabase';

// Re-export the calculation module's version so storage/UI cannot drift from
// the formula they are snapshotting.
export { READINESS_CALCULATION_VERSION } from '@/lib/readiness';

const STORAGE_PREFIX = 'air-journal:readiness:v3';
const LEGACY_STORAGE_PREFIX = 'air-journal:readiness:v2';

/** Kept modest so localStorage stays cheap. 180 days is more than any GATE
 *  prep cycle needs. */
const MAX_SNAPSHOTS = 180;
const REQUIRED_EVIDENCE_KEYS = [
  'attempts',
  'correct',
  'wrong',
  'skipped',
  'ungraded',
  'uncertain'
] as const;

const READINESS_SNAPSHOT_SELECT =
  'user_id, on_date, score, days_to_exam, calculation_version, evidence_counts, components';

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

/** The account-scoped shape returned by the readiness_snapshots Data API. */
export interface ReadinessSnapshotDatabaseRow {
  user_id: string;
  on_date: string;
  score: number;
  days_to_exam: number;
  calculation_version: number | null;
  evidence_counts: unknown;
  components: unknown;
}

/** The exact row shape sent through the database upsert. */
export interface ReadinessSnapshotUpsertRow {
  user_id: string;
  on_date: string;
  score: number;
  days_to_exam: number;
  calculation_version: number;
  evidence_counts: Record<string, number>;
  components: Record<ReadinessComponentKey, number>;
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
  const current = safeGet<ReadinessSnapshot[]>(storageKey(userId, 'snapshots'), []).map((row) => ({
    ...row,
    calculationVersion: row.calculationVersion ?? 1
  }));

  // The v2 local envelope pre-dates methodology versioning. Preserve those
  // rows explicitly as calculation version 1 instead of silently treating
  // them as comparable with the corrected attempt-ledger series. Read both
  // envelopes even after v3 exists so a partially migrated account cannot
  // strand older history in the legacy key.
  const legacy = safeGet<Array<Omit<ReadinessSnapshot, 'calculationVersion'>>>(
    storageKey(userId, 'snapshots', LEGACY_STORAGE_PREFIX),
    []
  );
  const migrated = legacy.map((row) => ({ ...row, calculationVersion: 1 }));
  const combined = dedupeSnapshotsByDate([...migrated, ...current]).slice(-MAX_SNAPSHOTS);
  if (migrated.length > 0) safeSet(storageKey(userId, 'snapshots'), combined);
  return combined;
}

/** Idempotent upsert of today's snapshot. Overwrites the row for `date` if
 *  it exists so the latest score for the day wins. A stale client may not
 *  replace a row from a newer calculation methodology. */
export function upsertSnapshot(userId: string, next: ReadinessSnapshot): ReadinessSnapshot[] {
  const current = loadSnapshots(userId);
  const sameDate = current.find((snapshot) => snapshot.date === next.date);
  if (sameDate && sameDate.calculationVersion > next.calculationVersion) return current;
  if (
    sameDate &&
    sameDate.calculationVersion === next.calculationVersion &&
    evidenceStrength(sameDate) > evidenceStrength(next)
  ) {
    // Live queries briefly expose an empty cache while the initial account
    // pull is still merging. Do not let that transient render replace a more
    // evidence-rich snapshot already held on this device.
    return current;
  }

  const all = current.filter((snapshot) => snapshot.date !== next.date);
  all.push(next);
  all.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = all.slice(-MAX_SNAPSHOTS);
  safeSet(storageKey(userId, 'snapshots'), trimmed);
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, field: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid readiness snapshot ${field}`);
  return number;
}

function databaseEvidenceCounts(
  value: unknown,
  calculationVersion: number
): Record<string, number> | undefined {
  if (!isRecord(value)) {
    if (calculationVersion >= 2) throw new Error('Invalid readiness snapshot evidence_counts');
    return undefined;
  }

  const parsed: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    const number = typeof count === 'number' ? count : Number(count);
    if (Number.isFinite(number)) parsed[key] = number;
  }
  if (
    calculationVersion >= 2 &&
    REQUIRED_EVIDENCE_KEYS.some((key) => !Number.isFinite(parsed[key]))
  ) {
    throw new Error('Invalid readiness snapshot evidence_counts');
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function databaseComponents(
  value: unknown,
  calculationVersion: number
): Record<ReadinessComponentKey, number> {
  if (!isRecord(value)) {
    if (calculationVersion >= 2) throw new Error('Invalid readiness snapshot components');
    return { coverage: 0, retention: 0, calibration: 0, surface: 0 };
  }

  const parsed = {} as Record<ReadinessComponentKey, number>;
  for (const component of ['coverage', 'retention', 'calibration', 'surface'] as const) {
    const raw = value[component];
    if ((raw === null || raw === undefined) && calculationVersion < 2) {
      parsed[component] = 0;
      continue;
    }
    parsed[component] = finiteNumber(raw, `components.${component}`);
  }
  return parsed;
}

/** Convert a Data API row without discarding its component evidence. */
export function readinessSnapshotFromDatabaseRow(
  row: ReadinessSnapshotDatabaseRow
): ReadinessSnapshot {
  const calculationVersion = finiteNumber(row.calculation_version ?? 1, 'calculation_version');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.on_date)) {
    throw new Error('Invalid readiness snapshot on_date');
  }
  const components = databaseComponents(row.components, calculationVersion);
  return {
    date: row.on_date,
    score: finiteNumber(row.score, 'score'),
    coverage: components.coverage,
    retention: components.retention,
    calibration: components.calibration,
    surface: components.surface,
    daysToExam: finiteNumber(row.days_to_exam, 'days_to_exam'),
    calculationVersion,
    evidenceCounts: databaseEvidenceCounts(row.evidence_counts, calculationVersion)
  };
}

/** Convert local/cache history into the constraint-complete database shape. */
export function readinessSnapshotToDatabaseRow(
  userId: string,
  snapshot: ReadinessSnapshot
): ReadinessSnapshotUpsertRow {
  const evidenceCounts = Object.fromEntries(
    REQUIRED_EVIDENCE_KEYS.map((key) => [
      key,
      finiteNumber(snapshot.evidenceCounts?.[key] ?? 0, key)
    ])
  );
  return {
    user_id: userId,
    on_date: snapshot.date,
    score: snapshot.score,
    days_to_exam: snapshot.daysToExam,
    calculation_version: snapshot.calculationVersion,
    evidence_counts: evidenceCounts,
    components: {
      coverage: snapshot.coverage,
      retention: snapshot.retention,
      calibration: snapshot.calibration,
      surface: snapshot.surface
    }
  };
}

/** Resolve the database's one-row-per-date key deterministically. */
export function dedupeSnapshotsByDate(snapshots: ReadinessSnapshot[]): ReadinessSnapshot[] {
  const byDate = new Map<string, ReadinessSnapshot>();
  for (const snapshot of snapshots) {
    const existing = byDate.get(snapshot.date);
    if (!existing || snapshot.calculationVersion >= existing.calculationVersion) {
      byDate.set(snapshot.date, snapshot);
    }
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function evidenceStrength(snapshot: ReadinessSnapshot): number {
  const attempts = snapshot.evidenceCounts?.attempts;
  return typeof attempts === 'number' && Number.isFinite(attempts) ? attempts : -1;
}

/**
 * Return exact-user local rows that are safe to upsert. Existing rows from a
 * newer methodology always win, while same-version rows are refreshed from
 * the latest local calculation.
 */
export function snapshotMigrationRows(
  userId: string,
  localSnapshots: ReadinessSnapshot[],
  remoteSnapshots: ReadinessSnapshot[]
): ReadinessSnapshotUpsertRow[] {
  const remoteByDate = new Map(
    dedupeSnapshotsByDate(remoteSnapshots).map((snapshot) => [snapshot.date, snapshot])
  );
  return dedupeSnapshotsByDate(localSnapshots)
    .filter((snapshot) => {
      const remote = remoteByDate.get(snapshot.date);
      if (!remote) return true;
      if (snapshot.calculationVersion !== remote.calculationVersion) {
        return snapshot.calculationVersion > remote.calculationVersion;
      }
      // For the same methodology, only replace an account row when the local
      // calculation is at least as evidence-rich. This prevents an initial
      // pre-pull empty render from overwriting an established cloud snapshot.
      return evidenceStrength(snapshot) >= evidenceStrength(remote);
    })
    .slice(-MAX_SNAPSHOTS)
    .map((snapshot) => readinessSnapshotToDatabaseRow(userId, snapshot));
}

/**
 * Replace the cached current-methodology series with the confirmed database
 * history while retaining older-methodology rows that are intentionally not
 * part of current trend calculations.
 */
export function cacheRemoteSnapshotHistory(
  userId: string,
  remoteSnapshots: ReadinessSnapshot[],
  calculationVersion: number
): ReadinessSnapshot[] {
  const confirmed = dedupeSnapshotsByDate(remoteSnapshots)
    .filter((snapshot) => snapshot.calculationVersion === calculationVersion)
    .slice(-MAX_SNAPSHOTS);
  const remaining = Math.max(0, MAX_SNAPSHOTS - confirmed.length);
  const historical = dedupeSnapshotsByDate(
    loadSnapshots(userId).filter((snapshot) => snapshot.calculationVersion !== calculationVersion)
  ).slice(-remaining);
  const cached = dedupeSnapshotsByDate([...historical, ...confirmed]);
  safeSet(storageKey(userId, 'snapshots'), cached);
  return cached;
}

function syncError(prefix: string, error: { message?: string } | null): string {
  return `${prefix}${error?.message ? `: ${error.message}` : ''}`;
}

function rowsMatch(expected: ReadinessSnapshotUpsertRow, actual: ReadinessSnapshot): boolean {
  if (actual.calculationVersion > expected.calculation_version) return true;
  if (actual.calculationVersion !== expected.calculation_version) return false;
  const normalizedActual = readinessSnapshotToDatabaseRow(expected.user_id, actual);
  return (
    normalizedActual.score === expected.score &&
    normalizedActual.days_to_exam === expected.days_to_exam &&
    JSON.stringify(normalizedActual.evidence_counts) === JSON.stringify(expected.evidence_counts) &&
    JSON.stringify(normalizedActual.components) === JSON.stringify(expected.components)
  );
}

async function flushReadinessSnapshotsOnce(userId: string): Promise<string | null> {
  const localSnapshots = loadSnapshots(userId);
  if (localSnapshots.length === 0) return null;
  if (!supabaseConfigured) {
    return 'Readiness history cannot be saved because the database is not configured';
  }

  const existingResult = await supabase
    .from('readiness_snapshots')
    .select(READINESS_SNAPSHOT_SELECT)
    .eq('user_id', userId)
    .order('on_date', { ascending: true });
  if (existingResult.error) {
    return syncError('Could not inspect existing readiness history', existingResult.error);
  }

  let existing: ReadinessSnapshot[];
  try {
    existing = ((existingResult.data ?? []) as ReadinessSnapshotDatabaseRow[]).map(
      readinessSnapshotFromDatabaseRow
    );
  } catch (error) {
    return syncError('Could not read existing readiness history', error as Error);
  }

  const rows = snapshotMigrationRows(userId, localSnapshots, existing);
  if (rows.length > 0) {
    const upsertResult = await supabase
      .from('readiness_snapshots')
      .upsert(rows, { onConflict: 'user_id,on_date' });
    if (upsertResult.error) {
      return syncError('Could not save readiness history', upsertResult.error);
    }
  }

  // Re-query rather than trusting only the write response. Logout/cache wipe
  // callers use this function as a durability barrier.
  const verificationResult = await supabase
    .from('readiness_snapshots')
    .select(READINESS_SNAPSHOT_SELECT)
    .eq('user_id', userId)
    .order('on_date', { ascending: true });
  if (verificationResult.error) {
    return syncError('Could not verify readiness history', verificationResult.error);
  }

  let verified: ReadinessSnapshot[];
  try {
    verified = ((verificationResult.data ?? []) as ReadinessSnapshotDatabaseRow[]).map(
      readinessSnapshotFromDatabaseRow
    );
  } catch (error) {
    return syncError('Could not verify readiness history', error as Error);
  }
  const verifiedByDate = new Map(
    dedupeSnapshotsByDate(verified).map((snapshot) => [snapshot.date, snapshot])
  );
  if (
    rows.some((row) => {
      const confirmed = verifiedByDate.get(row.on_date);
      return !confirmed || !rowsMatch(row, confirmed);
    })
  ) {
    return 'Readiness history was not fully confirmed in your account';
  }
  return null;
}

const readinessFlushChains = new Map<string, Promise<string | null>>();

/**
 * Flush all exact-user local snapshots to the account database and verify the
 * result. Returns a human-readable error when a caller must block logout or a
 * destructive cache wipe.
 */
export function flushReadinessSnapshots(userId: string): Promise<string | null> {
  const previous = readinessFlushChains.get(userId) ?? Promise.resolve(null);
  const attempt = () =>
    flushReadinessSnapshotsOnce(userId).catch((error) =>
      syncError('Could not save readiness history', error as Error)
    );
  const next = previous.then(
    () => attempt(),
    () => attempt()
  );
  readinessFlushChains.set(userId, next);
  void next.finally(() => {
    if (readinessFlushChains.get(userId) === next) readinessFlushChains.delete(userId);
  });
  return next;
}

export async function fetchCurrentReadinessSnapshotHistory(
  userId: string,
  calculationVersion: number
): Promise<{ snapshots: ReadinessSnapshot[]; error: string | null }> {
  if (!supabaseConfigured) {
    return { snapshots: [], error: 'The database is not configured' };
  }
  const result = await supabase
    .from('readiness_snapshots')
    .select(READINESS_SNAPSHOT_SELECT)
    .eq('user_id', userId)
    .eq('calculation_version', calculationVersion)
    .order('on_date', { ascending: false })
    .limit(MAX_SNAPSHOTS);
  if (result.error) {
    return { snapshots: [], error: syncError('Could not load readiness history', result.error) };
  }
  try {
    return {
      snapshots: ((result.data ?? []) as ReadinessSnapshotDatabaseRow[])
        .map(readinessSnapshotFromDatabaseRow)
        .sort((left, right) => left.date.localeCompare(right.date)),
      error: null
    };
  } catch (error) {
    return {
      snapshots: [],
      error: syncError('Could not load readiness history', error as Error)
    };
  }
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
  const current = normalizeDebtEntries(safeGet<DebtEntry[]>(storageKey(userId, 'watchlist'), []));
  if (current.length > 0) return current;
  const legacy = normalizeDebtEntries(
    safeGet<DebtEntry[]>(storageKey(userId, 'watchlist', LEGACY_STORAGE_PREFIX), [])
  );
  if (legacy.length > 0) safeSet(storageKey(userId, 'watchlist'), legacy);
  return legacy;
}

export function hasStoredDebt(userId: string): boolean {
  try {
    return (
      localStorage.getItem(storageKey(userId, 'watchlist')) !== null ||
      localStorage.getItem(storageKey(userId, 'watchlist', LEGACY_STORAGE_PREFIX)) !== null
    );
  } catch {
    return false;
  }
}

export function cacheDebt(userId: string, entries: DebtEntry[]): DebtEntry[] {
  const normalized = normalizeDebtEntries(entries);
  safeSet(storageKey(userId, 'watchlist'), normalized);
  return normalized;
}

export function normalizeDebtEntries(value: unknown): DebtEntry[] {
  if (!Array.isArray(value)) return [];
  const components = new Set<ReadinessComponentKey>([
    'coverage',
    'retention',
    'calibration',
    'surface'
  ]);
  const byKey = new Map<string, DebtEntry>();
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    if (
      typeof candidate.key !== 'string' ||
      !components.has(candidate.component as ReadinessComponentKey)
    ) {
      continue;
    }
    if (candidate.subject !== null && typeof candidate.subject !== 'string') continue;
    if (
      typeof candidate.since !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(candidate.since) ||
      typeof candidate.lastSeen !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(candidate.lastSeen) ||
      !Number.isInteger(candidate.weeksHeld) ||
      (candidate.weeksHeld as number) < 0
    ) {
      continue;
    }
    const entry: DebtEntry = {
      key: candidate.key,
      component: candidate.component as ReadinessComponentKey,
      subject: candidate.subject,
      since: candidate.since,
      weeksHeld: candidate.weeksHeld as number,
      lastSeen: candidate.lastSeen
    };
    const existing = byKey.get(entry.key);
    if (!existing || existing.lastSeen <= entry.lastSeen) byKey.set(entry.key, entry);
  }
  return [...byKey.values()].sort(
    (left, right) => right.weeksHeld - left.weeksHeld || left.key.localeCompare(right.key)
  );
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
  return cacheDebt(userId, list);
}

export const DEBT_LABEL: Record<ReadinessComponentKey, string> = {
  coverage: 'Coverage',
  retention: 'Retention',
  calibration: 'Calibration',
  surface: 'Mistake surface'
};
