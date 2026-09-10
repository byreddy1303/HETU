import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_VERSION,
  exportAll,
  importEnvelope,
  isBackupEnvelope,
  type BackupEnvelope
} from '@/lib/backup';
import { clearLocalData, db } from '@/lib/db';
import {
  cacheDayPlanForUser,
  cachePlannerDayTombstone,
  emptyDayPlan,
  loadAllDayPlans,
  loadPlannerDaySyncState,
  type DayPlan
} from '@/lib/planner-storage';
import {
  exportPlannerCloudOutbox,
  importPlannerCloudOutbox,
  type PlannerCloudOutboxEntry
} from '@/lib/planner-cloud';
import {
  usePlannerTemplatesStore,
  type PlannerTemplate
} from '@/stores/planner-templates';
import type { UserRow } from '@/types';

function plan(date: string, revision: number, updatedAt: string, target = 'Recovery block'): DayPlan {
  return {
    ...emptyDayPlan(date),
    sessions: [
      {
        id: `block-${date}`,
        subject: 'Algorithms',
        subjectId: 'algorithms',
        durationMin: 60,
        mode: 'Revision',
        priority: 'P2 High',
        target
      }
    ],
    updatedAt,
    syncRevision: revision
  };
}

function template(id: string, updatedAt: string): PlannerTemplate {
  return {
    id,
    name: 'Morning retrieval',
    block: {
      subject: 'Algorithms',
      subjectId: 'algorithms',
      customSubject: null,
      durationMin: 45,
      mode: 'Revision',
      priority: 'P2 High',
      target: 'Blind retrieval',
      resource: null,
      startAt: '06:30'
    },
    recurrence: {
      kind: 'weekdays',
      interval: 1,
      weekdays: [1, 2, 3, 4, 5],
      startDate: '2026-09-01',
      endDate: null,
      maxOccurrences: null
    },
    createdAt: '2026-09-01T05:00:00.000Z',
    updatedAt
  };
}

describe('backup v3 Planner durability', () => {
  beforeEach(async () => {
    localStorage.clear();
    usePlannerTemplatesStore.setState({ templates: [] });
    await clearLocalData();
  });

  it('exports live days, tombstones, templates, and the exact pending outbox', async () => {
    const userId = 'backup-export-user';
    const livePlan = plan('2026-09-03', 4, '2026-09-03T18:00:00.000Z');
    const tombstone = {
      date: '2026-09-04',
      revision: 6,
      updatedAt: '2026-09-04T19:00:01.000Z',
      deletedAt: '2026-09-04T19:00:00.000Z'
    };
    const pending: PlannerCloudOutboxEntry = {
      kind: 'upsert',
      date: livePlan.date,
      plan: { ...livePlan, updatedAt: '2026-09-03T18:05:00.000Z' },
      expectedRevision: 4,
      mutationId: 'backup-pending-upsert'
    };
    const plannerTemplate = template('template-export', '2026-09-01T06:00:00.000Z');
    cacheDayPlanForUser(userId, livePlan);
    cachePlannerDayTombstone(userId, tombstone);
    usePlannerTemplatesStore.setState({ templates: [plannerTemplate] });
    expect(importPlannerCloudOutbox(userId, [pending])).toBe(1);

    const envelope = await exportAll({ id: userId } as UserRow, userId);

    expect(envelope.version).toBe(BACKUP_VERSION);
    expect(envelope.planner).toEqual({
      owner_user_id: userId,
      day_plans: [livePlan],
      tombstones: [tombstone],
      outbox: [pending],
      conflicts: [],
      templates: [plannerTemplate]
    });
    expect(isBackupEnvelope(envelope)).toBe(true);
  });

  it('merges only newer Planner state and restores offline intent without network work', async () => {
    const userId = 'backup-import-user';
    const olderImported = plan(
      '2026-09-05',
      4,
      '2026-09-05T17:00:00.000Z',
      'Older imported edit'
    );
    const newerLocal = plan(
      '2026-09-05',
      5,
      '2026-09-05T18:00:00.000Z',
      'Newer local edit'
    );
    const freshImported = plan('2026-09-06', 2, '2026-09-06T18:00:00.000Z');
    const importedTombstone = {
      date: '2026-09-07',
      revision: 3,
      updatedAt: '2026-09-07T18:00:01.000Z',
      deletedAt: '2026-09-07T18:00:00.000Z'
    };
    const pending: PlannerCloudOutboxEntry = {
      kind: 'upsert',
      date: freshImported.date,
      plan: freshImported,
      expectedRevision: 2,
      mutationId: 'restore-exact-intent'
    };
    const plannerTemplate = template('template-import', '2026-09-02T06:00:00.000Z');
    cacheDayPlanForUser(userId, newerLocal);

    const envelope: BackupEnvelope = {
      version: BACKUP_VERSION,
      exported_at: '2026-09-08T06:00:00.000Z',
      profile: { id: userId } as UserRow,
      rows: {},
      planner: {
        owner_user_id: userId,
        day_plans: [olderImported, freshImported],
        tombstones: [importedTombstone],
        outbox: [pending],
        templates: [plannerTemplate]
      }
    };

    const report = await importEnvelope(envelope, userId);

    expect(report.planner).toEqual({
      dayPlansAdded: 1,
      tombstonesAdded: 1,
      templatesAdded: 1,
      outboxRestored: 1,
      conflictsRestored: 0,
      skipped: 1
    });
    expect(loadAllDayPlans(userId)).toEqual([
      newerLocal,
      freshImported
    ]);
    expect(loadPlannerDaySyncState(userId, importedTombstone.date)).toEqual(importedTombstone);
    expect(exportPlannerCloudOutbox(userId)).toEqual([pending]);
    expect(usePlannerTemplatesStore.getState().templates).toEqual([plannerTemplate]);
  });

  it('rejects a cross-account restore before writing any rows', async () => {
    const envelope: BackupEnvelope = {
      version: BACKUP_VERSION,
      exported_at: '2026-09-08T06:00:00.000Z',
      profile: { id: 'owner-a' } as UserRow,
      rows: {},
      planner: {
        owner_user_id: 'owner-a',
        day_plans: [],
        tombstones: [],
        outbox: [],
        templates: []
      }
    };

    await expect(importEnvelope(envelope, 'owner-b')).rejects.toThrow('different account');
    expect(loadAllDayPlans('owner-b')).toEqual([]);
  });

  it('refuses malformed v3 Planner envelopes at the file boundary', () => {
    expect(
      isBackupEnvelope({
        version: BACKUP_VERSION,
        exported_at: '2026-09-08T06:00:00.000Z',
        rows: {},
        planner: {
          owner_user_id: 'owner-a',
          day_plans: [],
          tombstones: [],
          outbox: []
        }
      })
    ).toBe(false);
  });

  it('rejects malformed outbox intent before importing otherwise valid study rows', async () => {
    const envelope = await exportAll({ id: 'backup-malformed-user' } as UserRow);
    envelope.rows.questions = [{ id: 'must-not-import', user_id: 'backup-malformed-user' }];
    envelope.planner!.outbox = [null as unknown as PlannerCloudOutboxEntry];
    expect(isBackupEnvelope(envelope)).toBe(false);
    await expect(importEnvelope(envelope, 'backup-malformed-user')).rejects.toThrow('malformed');
    expect(await db.questions.count()).toBe(0);
  });

  it('requires an explicit active account and rejects mixed-account study rows atomically', async () => {
    const envelope = await exportAll({ id: 'backup-owner-user' } as UserRow);
    await expect(importEnvelope(envelope)).rejects.toThrow('Sign in');
    envelope.rows.questions = [
      { id: 'owned-row', user_id: 'backup-owner-user' },
      { id: 'foreign-row', user_id: 'another-user' }
    ];
    await expect(importEnvelope(envelope, 'backup-owner-user')).rejects.toThrow('different account');
    expect(await db.questions.count()).toBe(0);
  });
});
