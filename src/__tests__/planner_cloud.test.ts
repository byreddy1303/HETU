import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    upsert: vi.fn()
  };
  return { from: vi.fn(), query };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from }
}));

import { loadCloudDayPlans, saveCloudDayPlan } from '@/lib/planner-cloud';

describe('Planner cloud range loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.gte.mockReturnValue(mocks.query);
    mocks.query.lte.mockReturnValue(mocks.query);
  });

  it('loads and sanitizes cloud-only plans across the requested range', async () => {
    mocks.query.order.mockResolvedValue({
      data: [
        {
          plan_date: '2026-07-24',
          updated_at: '2026-07-21T17:40:00.000Z',
          sessions: [
            {
              id: 'session-1',
              subject: 'Database Management System',
              durationMin: 180,
              mode: 'Deep Study',
              priority: 'P1 Critical',
              target: 'TOC block'
            },
            { subject: 'invalid row' }
          ]
        }
      ],
      error: null
    });

    const result = await loadCloudDayPlans('user-1', '2026-07-21', '2026-08-03');

    expect(mocks.query.gte).toHaveBeenCalledWith('plan_date', '2026-07-21');
    expect(mocks.query.lte).toHaveBeenCalledWith('plan_date', '2026-08-03');
    expect(result.error).toBeNull();
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.sessions).toHaveLength(1);
    expect(result.plans[0]?.date).toBe('2026-07-24');
    expect(result.plans[0]?.sessions[0]).toMatchObject({
      subject: 'Databases',
      subjectId: 'databases'
    });
  });

  it('writes canonical identities while retaining all cloud sessions', async () => {
    mocks.query.upsert.mockResolvedValue({ error: null });

    const error = await saveCloudDayPlan('user-1', {
      date: '2026-07-25',
      updatedAt: '2026-07-21T17:40:00.000Z',
      sessions: [
        {
          id: 'c',
          subject: 'C Programming',
          durationMin: 60,
          mode: 'Deep Study',
          priority: 'P1 Critical',
          target: 'Pointers'
        },
        {
          id: 'custom',
          subject: 'Legacy Elective',
          durationMin: 30,
          mode: 'Revision',
          priority: 'P4 Low',
          target: 'Historical material'
        }
      ]
    });

    expect(error).toBeNull();
    expect(mocks.query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sessions: [
          expect.objectContaining({
            subject: 'Programming & DS',
            subjectId: 'programming-data-structures'
          }),
          expect.objectContaining({ subject: 'Legacy Elective', subjectId: null })
        ]
      }),
      { onConflict: 'user_id,plan_date' }
    );
  });
});
