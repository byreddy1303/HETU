import { describe, expect, it } from 'vitest';
import {
  nextPlannerSession,
  plannerCapacitySummary,
  plannerWindowMinutes,
  reorderPlannerSessions
} from '@/lib/planner-capacity';
import { emptyDayPlan, type StudySession } from '@/lib/planner-storage';

function session(id: string, durationMin = 45): StudySession {
  return {
    id,
    subject: 'Algorithms',
    durationMin,
    mode: 'Problem Solving',
    priority: 'P2 High',
    target: id
  };
}

describe('Planner capacity and agenda', () => {
  it('protects buffer and exposes the exact overload', () => {
    const plan = emptyDayPlan('2026-09-02');
    plan.availability.availableMin = 120;
    plan.availability.protectedBufferMin = 20;
    plan.sessions = [session('a', 60), session('b', 55)];

    expect(plannerCapacitySummary(plan)).toEqual({
      grossAvailableMin: 120,
      protectedBufferMin: 20,
      netAvailableMin: 100,
      plannedMin: 115,
      remainingMin: 0,
      overloadMin: 15,
      utilizationPct: 100,
      status: 'overloaded',
      guidance: 'Move, shorten, or roll over 15m before approving this day.'
    });
  });

  it('reports remaining schedulable time without consuming the buffer', () => {
    const plan = emptyDayPlan('2026-09-02');
    plan.availability.availableMin = 180;
    plan.availability.protectedBufferMin = 30;
    plan.sessions = [session('a', 90)];

    expect(plannerCapacitySummary(plan)).toMatchObject({
      netAvailableMin: 150,
      plannedMin: 90,
      remainingMin: 60,
      status: 'within-capacity',
      utilizationPct: 60
    });
  });

  it('validates time-window length and reorders without mutating input', () => {
    expect(plannerWindowMinutes({ start: '06:30', end: '08:00' })).toBe(90);
    expect(plannerWindowMinutes({ start: '09:00', end: '08:00' })).toBe(0);
    const original = [session('a'), session('b'), session('c')];
    const moved = reorderPlannerSessions(original, 'c', 0);
    expect(moved.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(original.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('resumes active work before choosing the first unfinished action', () => {
    const done = {
      ...session('done'),
      execution: { sessionId: '1', startedAt: 'x', completedAt: 'y', actualMin: 40, manual: false }
    };
    const waiting = session('waiting');
    const active = {
      ...session('active'),
      execution: {
        sessionId: '2',
        startedAt: 'x',
        completedAt: null,
        actualMin: null,
        manual: false
      }
    };
    expect(nextPlannerSession([done, waiting, active])?.id).toBe('active');
    expect(nextPlannerSession([done, waiting])?.id).toBe('waiting');
    expect(nextPlannerSession([done])).toBeNull();
  });
});
