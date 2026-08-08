// Data export / import for /settings. Exports the caller's Dexie rows (their
// own data — no buddy-shared rows) as a single JSON envelope. Import merges
// rows using bulkPut so re-importing an old dump against a live app never
// destroys newer local writes (Dexie put is upsert).
import { db, SYNCED_TABLES, type SyncedTableName } from '@/lib/db';
import { writeLocal } from '@/lib/sync';
import type { UserRow } from '@/types';

export const BACKUP_VERSION = 1;

export interface BackupEnvelope {
  version: number;
  exported_at: string;
  profile: UserRow | null;
  rows: Partial<Record<SyncedTableName, unknown[]>>;
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
  if (env.version !== BACKUP_VERSION) {
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
      await writeLocal(name, row as { id: string });
      added++;
    }
    report.push({ table: name, added, skipped });
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
