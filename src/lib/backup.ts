// Data export / import for /settings. Exports the caller's Dexie rows (their
// own data — no buddy-shared rows) as a single JSON envelope. Import merges
// rows through the same canonical, immutable-aware local write boundary used by
// the UI, so re-importing an old dump never rewrites a committed PYQ receipt.
import { db, SYNCED_TABLES, type SyncedTableName } from '@/lib/db';
import { writeLocal } from '@/lib/sync';
import { normalizeSubjectIdentity } from '@/lib/subjects';
import { normalizeMockSubjectScores } from '@/lib/mocks';
import { scoreGateOutcome } from '@/lib/gate-scoring';
import { pyqJournalSourceMap } from '@/lib/pyq-session';
import type { UserRow } from '@/types';

export const BACKUP_VERSION = 2;

export interface BackupEnvelope {
  version: number;
  exported_at: string;
  profile: UserRow | null;
  rows: Partial<Record<SyncedTableName, unknown[]>>;
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
  if (name === 'pyq_attempts' && row.capture_version === 2) {
    const snapshot =
      row.question_snapshot && typeof row.question_snapshot === 'object'
        ? (row.question_snapshot as Record<string, unknown>)
        : null;
    row.question_type ??= typeof snapshot?.type === 'string' ? snapshot.type : null;
    row.question_marks ??= snapshot?.marks === 1 || snapshot?.marks === 2 ? snapshot.marks : null;
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
export async function exportAll(profile: UserRow | null): Promise<BackupEnvelope> {
  const rows: BackupEnvelope['rows'] = {};
  for (const name of SYNCED_TABLES) {
    const table = db.table(name);
    const list = await table.toArray();
    // Drop Dexie sync_status so re-imports look clean.
    rows[name] = list.map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { sync_status, ...rest } = r as { sync_status?: unknown } & Record<string, unknown>;
      return rest;
    });
  }
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    profile,
    rows
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
export async function importEnvelope(
  env: BackupEnvelope
): Promise<{ table: SyncedTableName; added: number; skipped: number }[]> {
  if (env.version !== 1 && env.version !== BACKUP_VERSION) {
    throw new Error(`unsupported backup version ${env.version}`);
  }
  const report: { table: SyncedTableName; added: number; skipped: number }[] = [];
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
      const { sync_status: _syncStatus, ...row } = question;
      await writeLocal('questions', { ...row, source_pyq_attempt_id: source.id });
    }
  }
  return report;
}

/** Basic shape check — refuses obvious garbage before an import. */
export function isBackupEnvelope(v: unknown): v is BackupEnvelope {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.version === 'number' &&
    typeof o.exported_at === 'string' &&
    !!o.rows &&
    typeof o.rows === 'object'
  );
}
