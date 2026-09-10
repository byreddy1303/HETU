import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PlannerMutationArgs {
  p_plan_date: string;
  p_expected_revision: number;
  p_mutation_id: string;
  p_sessions: unknown[];
  p_plan: Record<string, unknown> | null;
  p_deleted_at: string | null;
}

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    maybeSingle: vi.fn()
  };
  return { from: vi.fn(), rpc: vi.fn(), query };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc }
}));

import {
  exportPlannerCloudConflicts,
  exportPlannerCloudOutbox,
  flushPlannerCloudWrites,
  hasPendingPlannerCloudWrites,
  importPlannerCloudOutbox,
  loadCloudDayPlan,
  loadCloudDayPlans,
  queuePlannerCloudDelete,
  queuePlannerCloudWrite,
  saveCloudDayPlan,
  type PlannerCloudOutboxEntry
} from '@/lib/planner-cloud';
import {
  emptyDayPlan,
  loadPlannerDaySyncState,
  type DayPlan
} from '@/lib/planner-storage';

function completePlan(date = '2026-07-25'): DayPlan {
  return {
    ...emptyDayPlan(date),
    sessions: [
      {
        id: 'session-1',
        subject: 'Databases',
        subjectId: 'databases',
        durationMin: 180,
        mode: 'Deep Study',
        priority: 'P1 Critical',
        target: 'Transactions and recovery',
        resource: 'Notebook 4',
        execution: {
          sessionId: 'focus-1',
          startedAt: '2026-07-25T03:30:00.000Z',
          completedAt: '2026-07-25T06:20:00.000Z',
          actualMin: 170,
          manual: false
        }
      }
    ],
    structure: {
      wakeAt: '05:15',
      sleepAt: '22:45',
      totalHoursTarget: 8.5,
      breakPattern: 'custom',
      customBreak: '15 minutes after every block',
      dayType: 'Mock Test Day'
    },
    mindset: {
      energyForecast: 'medium',
      moodIntent: 'Calm and exact',
      motivationNote: 'Protect the morning block.'
    },
    nonStudy: {
      exerciseDone: true,
      exerciseTime: '18:30',
      errands: 'Collect printouts',
      social: 'Call family'
    },
    review: {
      completionPct: 86,
      wentWell: 'Stayed with the hard questions.',
      missed: 'One normalization revision block.',
      endMood: 'strong',
      replicate: 'partial'
    },
    updatedAt: '2026-07-25T18:40:00.000Z'
  };
}

function mutationRow(args: PlannerMutationArgs, revision: number) {
  const deleted = args.p_deleted_at !== null;
  return {
    plan_date: args.p_plan_date,
    sessions: deleted ? [] : args.p_sessions,
    plan: deleted ? null : args.p_plan,
    updated_at:
      !deleted && typeof args.p_plan?.updatedAt === 'string'
        ? args.p_plan.updatedAt
        : '2026-07-30T12:00:00.000Z',
    revision,
    deleted_at: args.p_deleted_at,
    last_mutation_id: args.p_mutation_id
  };
}

function mutationSuccess(
  args: PlannerMutationArgs,
  revision = args.p_expected_revision + 1,
  conflict: string | null = null
) {
  return {
    data: {
      applied: true,
      conflict,
      row: mutationRow(args, revision)
    },
    error: null
  };
}

describe('Planner cloud durability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.gte.mockReturnValue(mocks.query);
    mocks.query.lte.mockReturnValue(mocks.query);
    mocks.query.order.mockReturnValue(mocks.query);
    mocks.query.range.mockResolvedValue({ data: [], error: null });
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockImplementation((_name: string, args: PlannerMutationArgs) =>
      Promise.resolve(mutationSuccess(args))
    );
  });

  it('round-trips every DayPlan field through the versioned RPC and duplicates sessions', async () => {
    const plan = completePlan();
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        plan_date: plan.date,
        sessions: plan.sessions,
        plan,
        updated_at: plan.updatedAt,
        revision: 1,
        deleted_at: null,
        last_mutation_id: 'server-mutation'
      },
      error: null
    });

    const writeError = await saveCloudDayPlan('user-exact', plan);
    const loaded = await loadCloudDayPlan('user-exact', plan.date);

    expect(writeError).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith(
      'apply_planner_day_plan_mutation',
      expect.objectContaining({
        p_plan_date: plan.date,
        p_expected_revision: 0,
        p_mutation_id: expect.any(String),
        p_sessions: plan.sessions,
        p_plan: expect.objectContaining({
          date: plan.date,
          sessions: plan.sessions,
          review: plan.review
        }),
        p_deleted_at: null
      })
    );
    const rpcPayload = mocks.rpc.mock.calls[0]?.[1] as PlannerMutationArgs;
    expect(rpcPayload.p_plan).not.toHaveProperty('syncRevision');
    expect(loaded).toEqual({ plan: { ...plan, syncRevision: 1 }, tombstone: null, error: null });
  });

  it('hydrates legacy plan-null rows as a complete default plan plus stored sessions', async () => {
    const date = '2026-07-24';
    const updatedAt = '2026-07-24T17:40:00.000Z';
    const legacySession = {
      id: 'session-legacy',
      subject: 'Database Management System',
      durationMin: 90,
      mode: 'Revision',
      priority: 'P2 High',
      target: 'Normalization'
    };
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        plan_date: date,
        updated_at: updatedAt,
        sessions: [legacySession, { subject: 'invalid row' }],
        plan: null,
        revision: 4,
        deleted_at: null
      },
      error: null
    });

    const result = await loadCloudDayPlan('user-legacy', date);

    expect(result).toEqual({
      plan: {
        ...emptyDayPlan(date),
        sessions: [
          expect.objectContaining({
            ...legacySession,
            subject: 'Databases',
            subjectId: 'databases'
          })
        ],
        updatedAt,
        syncRevision: 4
      },
      tombstone: null,
      error: null
    });
  });

  it('loads all history and separates authoritative tombstones from live plans', async () => {
    const oldPlan = completePlan('2024-01-02');
    mocks.query.range.mockResolvedValueOnce({
      data: [
        {
          plan_date: oldPlan.date,
          updated_at: oldPlan.updatedAt,
          sessions: oldPlan.sessions,
          plan: oldPlan,
          revision: 3,
          deleted_at: null
        },
        {
          plan_date: '2024-01-03',
          updated_at: '2024-01-04T09:00:00.000Z',
          sessions: [],
          plan: null,
          revision: 8,
          deleted_at: '2024-01-04T08:59:00.000Z'
        }
      ],
      error: null
    });

    const result = await loadCloudDayPlans('user-history');

    expect(mocks.query.gte).not.toHaveBeenCalled();
    expect(mocks.query.lte).not.toHaveBeenCalled();
    expect(mocks.query.range).toHaveBeenCalledWith(0, 999);
    expect(result).toEqual({
      plans: [{ ...oldPlan, syncRevision: 3 }],
      tombstones: [
        {
          date: '2024-01-03',
          revision: 8,
          updatedAt: '2024-01-04T09:00:00.000Z',
          deletedAt: '2024-01-04T08:59:00.000Z'
        }
      ],
      error: null
    });
  });

  it('persists a meaningful zero-session plan instead of interpreting it as deletion', async () => {
    const base = emptyDayPlan('2026-07-26');
    const plan: DayPlan = {
      ...base,
      review: {
        ...base.review,
        completionPct: 0,
        wentWell: 'Recovery day protected.',
        endMood: 'strong',
        replicate: 'yes'
      },
      updatedAt: '2026-07-26T18:40:00.000Z'
    };

    const error = await queuePlannerCloudWrite('user-zero-session', plan);

    expect(error).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith(
      'apply_planner_day_plan_mutation',
      expect.objectContaining({
        p_sessions: [],
        p_plan: expect.objectContaining({
          sessions: [],
          review: expect.objectContaining({ wentWell: 'Recovery day protected.' })
        }),
        p_deleted_at: null
      })
    );
    expect(hasPendingPlannerCloudWrites('user-zero-session')).toBe(false);
  });

  it('serializes requests and coalesces in-flight edits to the newest complete payload', async () => {
    let finishFirst: ((value: ReturnType<typeof mutationSuccess>) => void) | undefined;
    mocks.rpc
      .mockImplementationOnce((_name: string, args: PlannerMutationArgs) =>
        new Promise<ReturnType<typeof mutationSuccess>>((resolve) => {
          finishFirst = resolve;
          void args;
        })
      )
      .mockImplementationOnce((_name: string, args: PlannerMutationArgs) =>
        Promise.resolve(mutationSuccess(args, 2))
      );
    const first = completePlan('2026-07-27');
    const latest: DayPlan = {
      ...first,
      review: { ...first.review, wentWell: 'Newest edit wins.' },
      updatedAt: '2026-07-27T19:00:00.000Z'
    };

    const drain = queuePlannerCloudWrite('user-coalesce', first);
    queuePlannerCloudWrite('user-coalesce', latest);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const firstArgs = mocks.rpc.mock.calls[0]?.[1] as PlannerMutationArgs;
    finishFirst?.(mutationSuccess(firstArgs, 1));
    expect(await drain).toBeNull();

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    const latestArgs = mocks.rpc.mock.calls[1]?.[1] as PlannerMutationArgs;
    expect(latestArgs).toEqual(
      expect.objectContaining({
        p_expected_revision: 1,
        p_plan: expect.objectContaining({
          updatedAt: latest.updatedAt,
          review: expect.objectContaining({ wentWell: 'Newest edit wins.' })
        })
      })
    );
    expect(hasPendingPlannerCloudWrites('user-coalesce')).toBe(false);
  });

  it('retains a failed latest payload durably and retries it on flush', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
      .mockImplementationOnce((_name: string, args: PlannerMutationArgs) =>
        Promise.resolve(mutationSuccess(args))
      );

    const firstError = await queuePlannerCloudWrite(
      'user-retry',
      completePlan('2026-07-28')
    );

    expect(firstError).toBe('offline');
    expect(hasPendingPlannerCloudWrites('user-retry')).toBe(true);
    expect(exportPlannerCloudOutbox('user-retry')).toEqual([
      expect.objectContaining({ kind: 'upsert', date: '2026-07-28', expectedRevision: 0 })
    ]);
    expect(await flushPlannerCloudWrites('user-retry')).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(hasPendingPlannerCloudWrites('user-retry')).toBe(false);
  });

  it('serializes an explicit tombstone after an in-flight upsert and advances its base revision', async () => {
    let finishUpsert: ((value: ReturnType<typeof mutationSuccess>) => void) | undefined;
    mocks.rpc
      .mockImplementationOnce((_name: string, args: PlannerMutationArgs) =>
        new Promise<ReturnType<typeof mutationSuccess>>((resolve) => {
          finishUpsert = resolve;
          void args;
        })
      )
      .mockImplementationOnce((_name: string, args: PlannerMutationArgs) =>
        Promise.resolve(mutationSuccess(args, 2))
      );
    const plan = completePlan('2026-07-29');

    const drain = queuePlannerCloudWrite('user-delete', plan);
    queuePlannerCloudDelete('user-delete', plan.date);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const upsertArgs = mocks.rpc.mock.calls[0]?.[1] as PlannerMutationArgs;
    finishUpsert?.(mutationSuccess(upsertArgs, 1));
    expect(await drain).toBeNull();

    const deleteArgs = mocks.rpc.mock.calls[1]?.[1] as PlannerMutationArgs;
    expect(deleteArgs).toEqual(
      expect.objectContaining({
        p_plan_date: plan.date,
        p_expected_revision: 1,
        p_sessions: [],
        p_plan: null,
        p_deleted_at: expect.any(String)
      })
    );
    expect(hasPendingPlannerCloudWrites('user-delete')).toBe(false);
    expect(loadPlannerDaySyncState('user-delete', plan.date)).toEqual(
      expect.objectContaining({ date: plan.date, revision: 2, deletedAt: expect.any(String) })
    );
  });

  it('accepts deletion-wins receipts and removes a stale cached plan without retrying it', async () => {
    const userId = 'user-deletion-wins';
    const plan = { ...completePlan('2026-07-30'), syncRevision: 2 };
    localStorage.setItem(`air.planner.${userId}.${plan.date}`, JSON.stringify(plan));
    mocks.rpc.mockImplementationOnce((_name: string, args: PlannerMutationArgs) => ({
      data: {
        applied: false,
        conflict: 'deletion_wins',
        row: {
          ...mutationRow({ ...args, p_deleted_at: '2026-07-30T19:00:00.000Z' }, 5),
          updated_at: '2026-07-30T19:00:01.000Z'
        }
      },
      error: null
    }));

    expect(await queuePlannerCloudWrite(userId, plan)).toBeNull();

    expect(hasPendingPlannerCloudWrites(userId)).toBe(false);
    expect(localStorage.getItem(`air.planner.${userId}.${plan.date}`)).toBeNull();
    expect(exportPlannerCloudConflicts(userId)).toEqual([
      expect.objectContaining({ kind: 'remote-deletion', date: plan.date, localPlan: plan })
    ]);
    expect(loadPlannerDaySyncState(userId, plan.date)).toEqual({
      date: plan.date,
      revision: 5,
      updatedAt: '2026-07-30T19:00:01.000Z',
      deletedAt: '2026-07-30T19:00:00.000Z'
    });
  });

  it('retains a version conflict until a later retry can apply the exact mutation', async () => {
    const userId = 'user-version-conflict';
    const plan = { ...completePlan('2026-07-31'), syncRevision: 2 };
    mocks.rpc
      .mockImplementationOnce((_name: string, args: PlannerMutationArgs) => ({
        data: {
          applied: false,
          conflict: 'version_conflict',
          row: mutationRow(args, 3)
        },
        error: null
      }))
      .mockImplementationOnce((_name: string, args: PlannerMutationArgs) =>
        Promise.resolve(mutationSuccess(args, 3))
      );

    const error = await queuePlannerCloudWrite(userId, plan);

    expect(error).toContain('changed on another device');
    expect(hasPendingPlannerCloudWrites(userId)).toBe(true);
    expect(await flushPlannerCloudWrites(userId)).toBeNull();
    const firstArgs = mocks.rpc.mock.calls[0]?.[1] as PlannerMutationArgs;
    expect(mocks.rpc.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        p_expected_revision: 2,
        p_mutation_id: firstArgs.p_mutation_id
      })
    );
    expect(hasPendingPlannerCloudWrites(userId)).toBe(false);
  });

  it('validates and restores an exported offline outbox without starting network work', async () => {
    const userId = 'user-outbox-import';
    const plan = completePlan('2026-08-01');
    const entries: PlannerCloudOutboxEntry[] = [
      {
        kind: 'upsert',
        date: plan.date,
        plan,
        expectedRevision: 7,
        mutationId: 'restore-upsert-1'
      },
      {
        kind: 'delete',
        date: '2026-08-02',
        expectedRevision: 3,
        mutationId: 'restore-delete-1',
        deletedAt: '2026-08-02T18:00:00.000Z'
      }
    ];

    expect(importPlannerCloudOutbox(userId, entries)).toBe(2);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(exportPlannerCloudOutbox(userId)).toEqual(entries);

    mocks.rpc.mockImplementation((_name: string, args: PlannerMutationArgs) =>
      Promise.resolve(mutationSuccess(args))
    );
    expect(await flushPlannerCloudWrites(userId)).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(hasPendingPlannerCloudWrites(userId)).toBe(false);
  });

  it('isolates damaged persisted days and never lets an old backup replace live pending intent', () => {
    const userId = 'user-malformed-outbox';
    const plan = completePlan('2026-09-09');
    const entry: PlannerCloudOutboxEntry = {
      kind: 'upsert', date: plan.date, plan, expectedRevision: 0, mutationId: 'live-intent'
    };
    localStorage.setItem(`air.planner-cloud-pending.${userId}.2026-09-08`, '{broken');
    localStorage.setItem(`air.planner-cloud-pending.${userId}.${plan.date}`, JSON.stringify(entry));
    expect(exportPlannerCloudOutbox(userId)).toEqual([entry]);
    expect(importPlannerCloudOutbox(userId, [{ ...entry, mutationId: 'old-backup', plan: { ...plan, sessions: [] } }])).toBe(0);
    expect(exportPlannerCloudOutbox(userId)).toEqual([entry]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(localStorage.getItem(`air.planner-cloud-pending.${userId}.2026-09-08`)).toBe('{broken');
  });
});
