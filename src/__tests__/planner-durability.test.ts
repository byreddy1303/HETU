import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  legacyPlannerArtifacts,
  resolvePlannerConflict,
  type LegacyPlanItem,
  type LegacyPlanItemCompletion
} from '@/lib/planner-durability';

function item(
  id: string,
  overrides: Partial<LegacyPlanItem> = {}
): LegacyPlanItem {
  return {
    id,
    user_id: 'user-a',
    title: `Task ${id}`,
    subject: 'Database Management System',
    subject_id: null,
    notes: null,
    due_date: '2026-08-10',
    rrule_kind: 'none',
    ends_on: null,
    target_min: 70,
    is_archived: false,
    created_at: '2026-08-01T06:00:00.000Z',
    updated_at: '2026-08-02T06:00:00.000Z',
    ...overrides
  };
}

function completion(
  itemId: string,
  onDate: string,
  completedAt: string,
  userId = 'user-a'
): LegacyPlanItemCompletion {
  return {
    item_id: itemId,
    user_id: userId,
    on_date: onDate,
    completed_at: completedAt
  };
}

describe('legacy Planner consolidation', () => {
  it('preserves finite execution evidence without reactivating archived tasks or expanding recurrence', () => {
    const items = [
      item('one-off'),
      item('weekly', {
        title: 'Weekly graph drill',
        subject: 'Algorithms',
        rrule_kind: 'weekly',
        due_date: '2026-08-11',
        ends_on: '2026-12-31',
        target_min: 45
      }),
      item('archived-recurring', {
        rrule_kind: 'daily',
        is_archived: true
      }),
      item('archived-one-off', { is_archived: true, due_date: '2026-08-12' }),
      item('archived-with-history', {
        is_archived: true,
        due_date: '2026-08-13',
        target_min: 30
      }),
      item('other-user', { user_id: 'user-b' })
    ];
    const completions = [
      completion('weekly', '2026-08-18', '2026-08-18T07:00:00.000Z'),
      completion('weekly', '2026-08-18', '2026-08-18T08:00:00.000Z'),
      completion('archived-with-history', '2026-08-13', '2026-08-13T09:00:00.000Z'),
      completion('other-user', '2026-08-10', '2026-08-10T09:00:00.000Z', 'user-b'),
      completion('one-off', 'invalid-date', '2026-08-10T09:00:00.000Z')
    ];

    const result = legacyPlannerArtifacts(items, completions, 'user-a');

    expect(result.dayPlans.map((plan) => plan.date)).toEqual([
      '2026-08-10',
      '2026-08-13',
      '2026-08-18'
    ]);
    expect(result.dayPlans[0]).toEqual(
      expect.objectContaining({
        updatedAt: '2026-08-02T06:00:00.000Z',
        sessions: [
          expect.objectContaining({
            id: 'legacy-plan-item:one-off:2026-08-10',
            subject: 'Databases',
            subjectId: 'databases',
            durationMin: 70,
            target: 'Task one-off'
          })
        ]
      })
    );
    expect(result.dayPlans[0]?.sessions[0]).not.toHaveProperty('execution');
    expect(result.dayPlans[1]?.sessions[0]?.execution).toEqual({
      sessionId: null,
      startedAt: null,
      completedAt: '2026-08-13T09:00:00.000Z',
      actualMin: 30,
      manual: true
    });
    expect(result.dayPlans[2]?.sessions[0]?.execution?.completedAt).toBe(
      '2026-08-18T08:00:00.000Z'
    );
    expect(result.templates).toEqual([
      expect.objectContaining({
        id: 'legacy-plan-item:weekly',
        name: 'Weekly graph drill',
        recurrence: {
          kind: 'weekly',
          interval: 1,
          weekdays: [2],
          startDate: '2026-08-11',
          endDate: '2026-12-31',
          maxOccurrences: null
        },
        block: expect.objectContaining({
          subject: 'Algorithms',
          subjectId: 'algorithms',
          durationMin: 45
        })
      })
    ]);
    expect(result.migratedItemIds).toEqual(['archived-with-history', 'one-off', 'weekly']);
  });

  it('uses revisions for deterministic active/delete conflict decisions', () => {
    const active = {
      date: '2026-09-01',
      revision: 4,
      updatedAt: '2026-09-01T10:00:00.000Z',
      deletedAt: null
    };
    const tombstone = {
      ...active,
      revision: 5,
      updatedAt: '2026-09-01T10:01:00.000Z',
      deletedAt: '2026-09-01T10:01:00.000Z'
    };

    expect(resolvePlannerConflict(active, tombstone)).toEqual({
      kind: 'remote-tombstone',
      winner: tombstone
    });
    expect(resolvePlannerConflict(tombstone, active)).toEqual({
      kind: 'local-delete-pending',
      winner: tombstone
    });
    expect(
      resolvePlannerConflict(
        { ...active, revision: 5 },
        { ...tombstone, updatedAt: '1999-01-01T00:00:00.000Z' }
      )
    ).toEqual({
      kind: 'remote-tombstone',
      winner: { ...tombstone, updatedAt: '1999-01-01T00:00:00.000Z' }
    });
    expect(() =>
      resolvePlannerConflict(active, { ...active, date: '2026-09-02' })
    ).toThrow('same date');
  });

  it('pins the SQL migration to the versioned, RLS-safe, schema-correct contract', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260902051324_unified_planner_durability.sql'
      ),
      'utf8'
    );

    expect(sql).toContain('add column if not exists revision bigint not null default 1');
    expect(sql).toContain('add column if not exists deleted_at timestamptz');
    expect(sql).toContain("where item.rrule_kind = 'none' and item.is_archived = false");
    expect(sql).toContain("where item.rrule_kind <> 'none' and item.is_archived = false");
    expect(sql).toContain("'schemaVersion', 1");
    expect(sql).toContain("'{data,templates}'");
    expect(sql).toContain('security invoker');
    expect(sql).toContain('caller_id uuid := (select auth.uid())');
    expect(sql).toContain("'conflict', 'idempotent_retry'");
    expect(sql).toContain("'conflict', 'deletion_wins'");
    expect(sql).toContain("'conflict', 'version_conflict'");
    expect(sql).toContain('revoke delete on table public.planner_day_plans from authenticated');
    expect(sql).toMatch(
      /revoke all on function public\.apply_planner_day_plan_mutation\([\s\S]*?from public, anon;/
    );
    expect(sql).toMatch(
      /grant execute on function public\.apply_planner_day_plan_mutation\([\s\S]*?to authenticated;/
    );
  });
});
