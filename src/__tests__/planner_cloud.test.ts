import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    then: vi.fn()
  };
  return { from: vi.fn(), query };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from }
}));

import {
  flushPlannerCloudWrites,
  hasPendingPlannerCloudWrites,
  loadCloudDayPlan,
  loadCloudDayPlans,
  queuePlannerCloudDelete,
  queuePlannerCloudWrite,
  saveCloudDayPlan
} from '@/lib/planner-cloud';
import { emptyDayPlan, type DayPlan } from '@/lib/planner-storage';

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

describe('Planner cloud durability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.gte.mockReturnValue(mocks.query);
    mocks.query.lte.mockReturnValue(mocks.query);
    mocks.query.order.mockReturnValue(mocks.query);
    mocks.query.range.mockResolvedValue({ data: [], error: null });
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.query.upsert.mockResolvedValue({ error: null });
    mocks.query.delete.mockReturnValue(mocks.query);
    mocks.query.then.mockImplementation((resolve, reject) =>
      Promise.resolve({ error: null }).then(resolve, reject)
    );
  });

  it('round-trips every DayPlan field and duplicates sessions for notification readers', async () => {
    const plan = completePlan();
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        plan_date: plan.date,
        sessions: plan.sessions,
        plan,
        updated_at: plan.updatedAt
      },
      error: null
    });

    const writeError = await saveCloudDayPlan('user-exact', plan);
    const loaded = await loadCloudDayPlan('user-exact', plan.date);

    expect(writeError).toBeNull();
    expect(mocks.query.upsert).toHaveBeenCalledWith(
      {
        user_id: 'user-exact',
        plan_date: plan.date,
        sessions: plan.sessions,
        plan,
        updated_at: plan.updatedAt
      },
      { onConflict: 'user_id,plan_date' }
    );
    expect(loaded).toEqual({ plan, error: null });
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
        plan: null
      },
      error: null
    });

    const result = await loadCloudDayPlan('user-legacy', date);

    expect(result.error).toBeNull();
    expect(result.plan).toEqual({
      ...emptyDayPlan(date),
      sessions: [
        expect.objectContaining({
          ...legacySession,
          subject: 'Databases',
          subjectId: 'databases'
        })
      ],
      updatedAt
    });
  });

  it('loads all historical plans without applying the former upcoming-date window', async () => {
    const oldPlan = completePlan('2024-01-02');
    mocks.query.range.mockResolvedValueOnce({
      data: [
        {
          plan_date: oldPlan.date,
          updated_at: oldPlan.updatedAt,
          sessions: oldPlan.sessions,
          plan: oldPlan
        }
      ],
      error: null
    });

    const result = await loadCloudDayPlans('user-history');

    expect(mocks.query.gte).not.toHaveBeenCalled();
    expect(mocks.query.lte).not.toHaveBeenCalled();
    expect(mocks.query.range).toHaveBeenCalledWith(0, 999);
    expect(result).toEqual({ plans: [oldPlan], error: null });
  });

  it('persists a meaningful zero-session plan instead of interpreting it as deletion', async () => {
    const plan = {
      ...emptyDayPlan('2026-07-26'),
      review: {
        ...emptyDayPlan('2026-07-26').review,
        completionPct: 0,
        wentWell: 'Recovery day protected.',
        endMood: 'strong' as const,
        replicate: 'yes' as const
      },
      updatedAt: '2026-07-26T18:40:00.000Z'
    };

    const error = await queuePlannerCloudWrite('user-zero-session', plan);

    expect(error).toBeNull();
    expect(mocks.query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sessions: [],
        plan: expect.objectContaining({
          sessions: [],
          review: expect.objectContaining({ wentWell: 'Recovery day protected.' })
        })
      }),
      { onConflict: 'user_id,plan_date' }
    );
    expect(mocks.query.delete).not.toHaveBeenCalled();
    expect(hasPendingPlannerCloudWrites('user-zero-session')).toBe(false);
  });

  it('serializes requests and coalesces in-flight edits to the newest complete payload', async () => {
    let finishFirst: ((value: { error: null }) => void) | undefined;
    mocks.query.upsert
      .mockImplementationOnce(
        () =>
          new Promise<{ error: null }>((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ error: null });
    const first = completePlan('2026-07-27');
    const latest = {
      ...first,
      review: { ...first.review, wentWell: 'Newest edit wins.' },
      updatedAt: '2026-07-27T19:00:00.000Z'
    };

    const drain = queuePlannerCloudWrite('user-coalesce', first);
    queuePlannerCloudWrite('user-coalesce', latest);

    expect(mocks.query.upsert).toHaveBeenCalledTimes(1);
    finishFirst?.({ error: null });
    expect(await drain).toBeNull();

    expect(mocks.query.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.query.upsert.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ plan: latest, updated_at: latest.updatedAt })
    );
    expect(hasPendingPlannerCloudWrites('user-coalesce')).toBe(false);
  });

  it('retains the failed latest payload and retries it on flush', async () => {
    mocks.query.upsert
      .mockResolvedValueOnce({ error: { message: 'offline' } })
      .mockResolvedValueOnce({ error: null });

    const firstError = await queuePlannerCloudWrite('user-retry', completePlan('2026-07-28'));

    expect(firstError).toBe('offline');
    expect(hasPendingPlannerCloudWrites('user-retry')).toBe(true);
    expect(await flushPlannerCloudWrites('user-retry')).toBeNull();
    expect(mocks.query.upsert).toHaveBeenCalledTimes(2);
    expect(hasPendingPlannerCloudWrites('user-retry')).toBe(false);
  });

  it('serializes explicit deletion after an in-flight upsert for the same date', async () => {
    let finishUpsert: ((value: { error: null }) => void) | undefined;
    mocks.query.upsert.mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          finishUpsert = resolve;
        })
    );
    const plan = completePlan('2026-07-29');

    const drain = queuePlannerCloudWrite('user-delete', plan);
    queuePlannerCloudDelete('user-delete', plan.date);

    expect(mocks.query.delete).not.toHaveBeenCalled();
    finishUpsert?.({ error: null });
    expect(await drain).toBeNull();

    expect(mocks.query.delete).toHaveBeenCalledTimes(1);
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', 'user-delete');
    expect(mocks.query.eq).toHaveBeenCalledWith('plan_date', plan.date);
    expect(hasPendingPlannerCloudWrites('user-delete')).toBe(false);
  });
});
