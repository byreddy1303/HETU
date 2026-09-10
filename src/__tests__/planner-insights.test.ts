import { describe, expect, it } from 'vitest';
import { bucketPlansByDate, neglectedSubjects, windowed } from '@/lib/planner-insights';
import { emptyDayPlan, type DayPlan } from '@/lib/planner-storage';

function plan(date: string, subject = 'Algorithms', durationMin = 30): DayPlan {
  const value = emptyDayPlan(date);
  value.sessions.push({
    id: `block-${date}`,
    subject,
    durationMin,
    mode: 'PYQ Practice',
    priority: 'P2 High',
    target: ''
  });
  return value;
}

describe('Planner date analytics', () => {
  it('buckets past, today and future plans without reordering or mutating input', () => {
    const plans = [plan('2026-09-01'), plan('2026-08-30'), plan('2026-08-31')];
    const before = JSON.stringify(plans);

    const buckets = bucketPlansByDate(plans, '2026-08-31');

    expect(buckets.past.map((row) => row.date)).toEqual(['2026-08-30']);
    expect(buckets.today.map((row) => row.date)).toEqual(['2026-08-31']);
    expect(buckets.future.map((row) => row.date)).toEqual(['2026-09-01']);
    expect(JSON.stringify(plans)).toBe(before);
  });

  it('uses an inclusive 30-date window ending today and excludes future plans', () => {
    const plans = [
      plan('2026-08-01'),
      plan('2026-08-02'),
      plan('2026-08-30'),
      plan('2026-08-31'),
      plan('2026-09-01')
    ];

    expect(windowed(plans, 30, '2026-08-31').map((row) => row.date)).toEqual([
      '2026-08-02',
      '2026-08-30',
      '2026-08-31'
    ]);
    expect(windowed(plans, 0, '2026-08-31')).toEqual([]);
  });

  it('does not let future work hide a currently neglected subject', () => {
    const plans = [plan('2026-09-01', 'Algorithms', 120)];

    expect(neglectedSubjects(plans, ['Algorithms'], 30, 60, '2026-08-31')).toEqual([
      { label: 'Algorithms', min: 0 }
    ]);
  });
});
