// Data export / import for /settings. Exports the caller's Dexie rows (their
// own data — no buddy-shared rows) as a single JSON envelope. Import merges
// rows through the same canonical, immutable-aware local write boundary used by
// the UI, so re-importing an old dump never rewrites a committed PYQ receipt.
import { db, SYNCED_TABLES, type SyncedTableName } from '@/lib/db';
import { writeLocal } from '@/lib/sync';
import { normalizeSubjectIdentity } from '@/lib/subjects';
import { normalizeMockSubjectScores, normalizeMockTestRow } from '@/lib/mocks';
import { scoreGateOutcome } from '@/lib/gate-scoring';
import { pyqJournalSourceMap } from '@/lib/pyq-session';
import {
  cacheDayPlanForUser,
  cachePlannerDayTombstone,
  loadAllDayPlans,
  loadPlannerDaySyncState,
  loadPlannerDayTombstones,
  normalizeDayPlan,
  type DayPlan,
  type PlannerDaySyncState
} from '@/lib/planner-storage';
import {
  exportPlannerCloudConflicts,
  exportPlannerCloudOutbox,
  importPlannerCloudConflicts,
  importPlannerCloudOutbox,
  type PlannerCloudConflictEntry,
  type PlannerCloudOutboxEntry
} from '@/lib/planner-cloud';
import {
  normalizePlannerTemplatesSnapshot,
  usePlannerTemplatesStore,
  type PlannerTemplate
} from '@/stores/planner-templates';
import type { UserRow } from '@/types';

export const BACKUP_VERSION = 3;

export interface PlannerBackupPayload {
  owner_user_id: string;
  day_plans: DayPlan[];
  tombstones: PlannerDaySyncState[];
  outbox: PlannerCloudOutboxEntry[];
  /** Non-retrying copies retained when a remote conflict blocked an edit. */
  conflicts?: PlannerCloudConflictEntry[];
  templates: PlannerTemplate[];
}

export interface BackupEnvelope {
  version: number;
  exported_at: string;
  profile: UserRow | null;
  rows: Partial<Record<SyncedTableName, unknown[]>>;
  /** Added in v3. Carries Planner state that does not live in Dexie tables. */
  planner?: PlannerBackupPayload;
}

export interface PlannerImportReport {
  dayPlansAdded: number;
  tombstonesAdded: number;
  templatesAdded: number;
  outboxRestored: number;
  conflictsRestored: number;
  skipped: number;
}

export type BackupImportReport = Array<{
  table: SyncedTableName;
  added: number;
  skipped: number;
}> & { planner: PlannerImportReport };

const EMPTY_PLANNER_IMPORT_REPORT: PlannerImportReport = {
  dayPlansAdded: 0,
  tombstonesAdded: 0,
  templatesAdded: 0,
  outboxRestored: 0,
  conflictsRestored: 0,
  skipped: 0
};

function validPlannerDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function timestampMs(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeRevision(value: unknown): number {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function validTombstone(value: unknown): value is PlannerDaySyncState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return (
    validPlannerDate(state.date) &&
    Number.isSafeInteger(state.revision) &&
    Number(state.revision) >= 0 &&
    timestampMs(state.updatedAt) > 0 &&
    timestampMs(state.deletedAt) > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validBackupDayPlan(value: unknown): value is DayPlan {
  if (!isRecord(value)) return false;
  return (
    validPlannerDate(value.date) &&
    Array.isArray(value.sessions) &&
    timestampMs(value.updatedAt) > 0 &&
    (value.syncRevision === undefined ||
      (Number.isSafeInteger(value.syncRevision) && Number(value.syncRevision) >= 0))
  );
}

function validBackupOutboxEntry(value: unknown): value is PlannerCloudOutboxEntry {
  if (
    !isRecord(value) ||
    !validPlannerDate(value.date) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    typeof value.mutationId !== 'string' ||
    !value.mutationId.trim() ||
    value.mutationId.length > 180
  ) {
    return false;
  }
  if (value.kind === 'delete') return timestampMs(value.deletedAt) > 0;
  return (
    value.kind === 'upsert' &&
    validBackupDayPlan(value.plan) &&
    value.plan.date === value.date
  );
}

function validBackupConflict(value: unknown): value is PlannerCloudConflictEntry {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    (value.kind !== 'version-conflict' && value.kind !== 'remote-deletion') ||
    !validPlannerDate(value.date) ||
    typeof value.mutationId !== 'string' ||
    !value.mutationId.trim() ||
    value.mutationId.length > 180 ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    !validBackupDayPlan(value.localPlan) ||
    value.localPlan.date !== value.date ||
    timestampMs(value.detectedAt) <= 0
  ) {
    return false;
  }
  const remotePlanValid =
    value.remotePlan === null ||
    (validBackupDayPlan(value.remotePlan) && value.remotePlan.date === value.date);
  const remoteTombstoneValid =
    value.remoteTombstone === null ||
    (validTombstone(value.remoteTombstone) && value.remoteTombstone.date === value.date);
  if (!remotePlanValid || !remoteTombstoneValid) return false;
  return value.kind === 'remote-deletion'
    ? value.remoteTombstone !== null
    : value.remotePlan !== null || value.remoteTombstone !== null;
}

function validPlannerBackup(value: unknown): value is PlannerBackupPayload {
  if (!isRecord(value) || typeof value.owner_user_id !== 'string' || !value.owner_user_id.trim()) {
    return false;
  }
  if (
    !Array.isArray(value.day_plans) ||
    !value.day_plans.every(validBackupDayPlan) ||
    !Array.isArray(value.tombstones) ||
    !value.tombstones.every(validTombstone) ||
    !Array.isArray(value.outbox) ||
    !value.outbox.every(validBackupOutboxEntry) ||
    !Array.isArray(value.templates) ||
    (value.conflicts !== undefined &&
      (!Array.isArray(value.conflicts) || !value.conflicts.every(validBackupConflict)))
  ) {
    return false;
  }
  const normalizedTemplates = normalizePlannerTemplatesSnapshot({ templates: value.templates });
  if (normalizedTemplates.templates.length !== value.templates.length) return false;
  const outboxDates = value.outbox.map((entry) => entry.date);
  return new Set(outboxDates).size === outboxDates.length;
}

function importWins(
  importedRevision: number,
  importedUpdatedAt: string,
  localRevision: number,
  localUpdatedAt: string
): boolean {
  if (importedRevision !== localRevision) return importedRevision > localRevision;
  return timestampMs(importedUpdatedAt) > timestampMs(localUpdatedAt);
}

function migrateImportedRow(
  name: SyncedTableName,
  value: Record<string, unknown>
): Record<string, unknown> {
  const row = { ...value };
  if (typeof row.subject === 'string') {
    const identity = normalizeSubjectIdentity(row.subject, row.subject_id);
    row.subject = identity.label;
    row.subject_id = identity.id;
  }
  if (name === 'mock_tests' && Array.isArray(row.subject_scores)) {
    row.subject_scores = normalizeMockSubjectScores(
      row.subject_scores as Array<{ subject: string; subject_id?: string | null; marks: number }>
    );
  }
  if (name === 'mock_tests') return normalizeMockTestRow(row);
  if (name === 'pyq_attempts' && row.capture_version === 2) {
    const snapshot =
      row.question_snapshot && typeof row.question_snapshot === 'object'
        ? (row.question_snapshot as Record<string, unknown>)
        : null;
    row.question_type ??= typeof snapshot?.type === 'string' ? snapshot.type : null;
    const storedMarks = row.question_marks ?? snapshot?.marks;
    // `question_marks` is a normalized v3 scoring fact and supports only the
    // modern 1/2-mark scheme. The snapshot still retains larger legacy marks.
    row.question_marks = storedMarks === 1 || storedMarks === 2 ? storedMarks : null;
    if (row.scoring_version == null) {
      const scored = scoreGateOutcome({
        questionType: typeof row.question_type === 'string' ? row.question_type : null,
        marks: typeof row.question_marks === 'number' ? row.question_marks : null,
        answerStatus: typeof row.answer_status === 'string' ? row.answer_status : null,
        decision:
          row.mark_decision === 'SKIP' || row.mark_decision === 'FIFTY_FIFTY'
            ? row.mark_decision
            : 'MARK',
        correctness: typeof row.mark_correct === 'boolean' ? row.mark_correct : null
      });
      row.score_thirds = scored.scoreThirds;
      row.scoring_status = scored.status;
      row.scoring_version = scored.scoringVersion;
    }
  }
  return row;
}

/** Serialise everything the current user owns locally. */
export async function exportAll(
  profile: UserRow | null,
  ownerUserId: string | null = profile?.id ?? null
): Promise<BackupEnvelope> {
  if (profile?.id && ownerUserId && profile.id !== ownerUserId) {
    throw new Error('The selected backup account does not match the signed-in profile.');
  }
  const rows: BackupEnvelope['rows'] = {};
  for (const name of SYNCED_TABLES) {
    const table = db.table(name);
    const list = await table.toArray();
    const ownedList = ownerUserId
      ? list.filter(
          (row) =>
            Boolean(row) &&
            typeof row === 'object' &&
            (row as unknown as Record<string, unknown>).user_id === ownerUserId
        )
      : list;
    // Drop Dexie sync_status so re-imports look clean.
    rows[name] = ownedList.map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { sync_status, ...rest } = r as { sync_status?: unknown } & Record<string, unknown>;
      return name === 'mock_tests' ? normalizeMockTestRow(rest) : rest;
    });
  }
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    profile,
    rows,
    ...(ownerUserId
      ? {
          planner: {
            owner_user_id: ownerUserId,
            day_plans: loadAllDayPlans(ownerUserId),
            tombstones: loadPlannerDayTombstones(ownerUserId),
            outbox: exportPlannerCloudOutbox(ownerUserId),
            conflicts: exportPlannerCloudConflicts(ownerUserId),
            templates: normalizePlannerTemplatesSnapshot({
              templates: usePlannerTemplatesStore.getState().templates
            }).templates
          }
        }
      : {})
  };
}

/** Prompt the browser to save the envelope as a JSON file. */
export function downloadEnvelope(env: BackupEnvelope, filename?: string): void {
  const stamp = env.exported_at.slice(0, 10);
  const name = filename ?? `hetu-${stamp}.json`;
  const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Merge an envelope into local storage. Returns per-table counts. */
function restorePlannerPayload(
  payload: PlannerBackupPayload | undefined,
  targetUserId: string | null
): PlannerImportReport {
  const report = { ...EMPTY_PLANNER_IMPORT_REPORT };
  if (!payload) return report;
  if (!targetUserId) {
    throw new Error('Sign in to the account that owns this Planner backup before restoring it.');
  }
  if (payload.owner_user_id !== targetUserId) {
    throw new Error('This backup belongs to a different account and was not imported.');
  }

  const localPlans = new Map(loadAllDayPlans(targetUserId).map((plan) => [plan.date, plan]));
  const importedPlans = new Map<string, DayPlan>();
  for (const candidate of payload.day_plans ?? []) {
    if (!candidate || !validPlannerDate(candidate.date)) {
      report.skipped += 1;
      continue;
    }
    const normalized = normalizeDayPlan(candidate);
    if (normalized.date !== candidate.date) {
      report.skipped += 1;
      continue;
    }
    const current = importedPlans.get(normalized.date);
    const normalizedRevision = safeRevision(normalized.syncRevision);
    if (
      !current ||
      importWins(
        normalizedRevision,
        normalized.updatedAt,
        safeRevision(current.syncRevision),
        current.updatedAt
      )
    ) {
      importedPlans.set(normalized.date, normalized);
    }
  }

  const importedTombstones = new Map<string, PlannerDaySyncState>();
  for (const candidate of payload.tombstones ?? []) {
    if (!validTombstone(candidate)) {
      report.skipped += 1;
      continue;
    }
    const current = importedTombstones.get(candidate.date);
    if (
      !current ||
      importWins(candidate.revision, candidate.updatedAt, current.revision, current.updatedAt)
    ) {
      importedTombstones.set(candidate.date, { ...candidate });
    }
  }

  const plannerDates = new Set([...importedPlans.keys(), ...importedTombstones.keys()]);
  for (const date of plannerDates) {
    const importedPlan = importedPlans.get(date) ?? null;
    const importedTombstone = importedTombstones.get(date) ?? null;
    const localPlan = localPlans.get(date) ?? null;
    const localState = loadPlannerDaySyncState(targetUserId, date);
    const localRevision = Math.max(
      safeRevision(localPlan?.syncRevision),
      safeRevision(localState?.revision)
    );
    const localUpdatedAt =
      timestampMs(localState?.updatedAt) > timestampMs(localPlan?.updatedAt)
        ? (localState?.updatedAt ?? '')
        : (localPlan?.updatedAt ?? '');

    const importedPlanRevision = safeRevision(importedPlan?.syncRevision);
    const tombstoneWinsPlan =
      importedTombstone &&
      (!importedPlan ||
        importedTombstone.revision > importedPlanRevision ||
        (importedTombstone.revision === importedPlanRevision &&
          timestampMs(importedTombstone.updatedAt) >= timestampMs(importedPlan.updatedAt)));

    if (tombstoneWinsPlan) {
      if (
        importedTombstone.revision > localRevision ||
        (importedTombstone.revision === localRevision &&
          timestampMs(importedTombstone.updatedAt) >= timestampMs(localUpdatedAt)) ||
        (!localPlan && !localState)
      ) {
        cachePlannerDayTombstone(targetUserId, importedTombstone);
        report.tombstonesAdded += 1;
      } else {
        report.skipped += 1;
      }
      continue;
    }

    if (!importedPlan) continue;
    const localTombstoneWins =
      localState?.deletedAt &&
      (localState.revision > importedPlanRevision ||
        (localState.revision === importedPlanRevision &&
          timestampMs(localState.updatedAt) >= timestampMs(importedPlan.updatedAt)));
    if (
      !localTombstoneWins &&
      (importWins(
        importedPlanRevision,
        importedPlan.updatedAt,
        localRevision,
        localUpdatedAt
      ) ||
        (!localPlan && !localState))
    ) {
      cacheDayPlanForUser(targetUserId, importedPlan);
      report.dayPlansAdded += 1;
    } else {
      report.skipped += 1;
    }
  }

  const currentTemplates = usePlannerTemplatesStore.getState().templates;
  const currentById = new Map(currentTemplates.map((template) => [template.id, template]));
  const importedTemplates = normalizePlannerTemplatesSnapshot({
    templates: payload.templates ?? []
  }).templates;
  for (const template of importedTemplates) {
    const current = currentById.get(template.id);
    if (current && timestampMs(current.updatedAt) >= timestampMs(template.updatedAt)) {
      report.skipped += 1;
      continue;
    }
    currentById.set(template.id, template);
    report.templatesAdded += 1;
  }
  usePlannerTemplatesStore.setState(
    normalizePlannerTemplatesSnapshot({
      templates: [...currentById.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      )
    })
  );

  const safeOutbox = (payload.outbox ?? []).filter((entry) => {
    const state = loadPlannerDaySyncState(targetUserId, entry.date);
    if (!state) return true;
    if (entry.expectedRevision !== state.revision) {
      report.skipped += 1;
      return false;
    }
    const intentAt = entry.kind === 'delete' ? entry.deletedAt : entry.plan.updatedAt;
    if (timestampMs(intentAt) < timestampMs(state.updatedAt)) {
      report.skipped += 1;
      return false;
    }
    if (
      state.deletedAt &&
      entry.kind === 'upsert' &&
      timestampMs(entry.plan.updatedAt) <= timestampMs(state.deletedAt)
    ) {
      report.skipped += 1;
      return false;
    }
    return true;
  });
  report.outboxRestored = importPlannerCloudOutbox(targetUserId, safeOutbox);
  report.skipped += safeOutbox.length - report.outboxRestored;
  const conflicts = Array.isArray(payload.conflicts) ? payload.conflicts : [];
  report.conflictsRestored = importPlannerCloudConflicts(targetUserId, conflicts);
  report.skipped += conflicts.length - report.conflictsRestored;
  return report;
}

export async function importEnvelope(
  env: BackupEnvelope,
  targetUserId: string | null = null
): Promise<BackupImportReport> {
  if (![1, 2, BACKUP_VERSION].includes(env.version)) {
    throw new Error(`unsupported backup version ${env.version}`);
  }
  if (!isBackupEnvelope(env)) {
    throw new Error('This backup contains malformed records and was not imported.');
  }
  if (env.planner && !targetUserId) {
    throw new Error('Sign in to the account that owns this Planner backup before restoring it.');
  }
  const sourceOwner = env.planner?.owner_user_id ?? env.profile?.id ?? null;
  if (targetUserId && sourceOwner && sourceOwner !== targetUserId) {
    throw new Error('This backup belongs to a different account and was not imported.');
  }
  // Validate ownership across the entire payload before the first database write.
  // An envelope label alone must never authorize a mixed-account restore.
  if (targetUserId) {
    for (const name of SYNCED_TABLES) {
      for (const row of env.rows[name] ?? []) {
        if (isRecord(row) && row.user_id !== targetUserId) {
          throw new Error('This backup contains records from a different account and was not imported.');
        }
      }
    }
  }
  const report = [] as unknown as BackupImportReport;
  report.planner = { ...EMPTY_PLANNER_IMPORT_REPORT };
  for (const name of SYNCED_TABLES) {
    const rows = env.rows[name] ?? [];
    let added = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !('id' in row)) {
        skipped++;
        continue;
      }
      try {
        await writeLocal(
          name,
          migrateImportedRow(name, row as Record<string, unknown>) as { id: string }
        );
        added++;
      } catch (error) {
        if (error instanceof Error && error.message.includes('immutable')) {
          skipped++;
          continue;
        }
        throw error;
      }
    }
    report.push({ table: name, added, skipped });
  }

  // Older backups pre-date the explicit analysis→attempt link. Reconnect only
  // deterministic or uniquely matched rows after attempts and questions have
  // both been restored; ambiguity stays untouched.
  const [attempts, questions] = await Promise.all([
    db.pyq_attempts.toArray(),
    db.questions.toArray()
  ]);
  const safeSourceByQuestionId = pyqJournalSourceMap(questions, attempts);
  for (const question of questions) {
    if (question.source_pyq_attempt_id) continue;
    const source = safeSourceByQuestionId.get(question.id);
    if (source) {
      await writeLocal('questions', { ...question, source_pyq_attempt_id: source.id });
    }
  }
  report.planner = restorePlannerPayload(
    env.planner,
    targetUserId
  );
  return report;
}

/** Basic shape check — refuses obvious garbage before an import. */
export function isBackupEnvelope(v: unknown): v is BackupEnvelope {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const planner = o.planner;
  const plannerValid = planner === undefined || validPlannerBackup(planner);
  return (
    typeof o.version === 'number' &&
    typeof o.exported_at === 'string' &&
    isRecord(o.rows) &&
    Object.values(o.rows).every(Array.isArray) &&
    plannerValid
  );
}
