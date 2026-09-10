import { describe, expect, it } from 'vitest';
import {
  compileCapacityAwareDay,
  plannerCandidatesFromSessions,
  type PlannerWorkCandidate
} from '@/lib/planner-compiler';
import { emptyDayPlan } from '@/lib/planner-storage';

function candidate(
  id: string,
  estimatedMin: number,
  overrides: Partial<PlannerWorkCandidate> = {}
): PlannerWorkCandidate {
  return {
    id,
    kind: 'study',
    title: `Work ${id}`,
    estimatedMin,
    priority: 'P3 Medium',
    energy: 'medium',
    ...overrides
  };
}

describe('capacity-aware Planner compiler', () => {
  it('reserves buffer and review debt before selecting bounded explainable new work', () => {
    const plan = emptyDayPlan('2026-08-31');
    plan.structure.totalHoursTarget = 6;
    plan.mindset.energyForecast = 'high';
    const candidates = [
      candidate('critical', 120, {
        priority: 'P1 Critical',
        energy: 'high',
        required: true,
        dueDate: '2026-08-31'
      }),
      candidate('pyq', 60, {
        kind: 'pyq',
        priority: 'P2 High',
        dueDate: '2026-08-30'
      }),
      candidate('revision', 45, { energy: 'low', priority: 'P4 Low' }),
      candidate('later', 60, { dueDate: '2026-09-05' })
    ];
    const before = JSON.stringify({ plan, candidates });

    const compiled = compileCapacityAwareDay({
      date: '2026-08-31',
      plan,
      capacityMin: 300,
      candidates,
      recoveryDebt: {
        count: 8,
        estimatedMin: 60,
        title: 'Clear due re-attempts'
      },
      options: { bufferPct: 0.1, maxActionMin: 90 }
    });

    expect(compiled.capacityMin).toBe(300);
    expect(compiled.bufferReservedMin).toBe(30);
    expect(compiled.recoveryReservedMin).toBe(60);
    expect(compiled.newWorkBudgetMin).toBe(210);
    expect(compiled.actions.length).toBeGreaterThanOrEqual(3);
    expect(compiled.actions.length).toBeLessThanOrEqual(5);
    expect(compiled.actions[0]).toMatchObject({ kind: 'recovery', required: true });
    expect(compiled.actions.some((action) => action.sourceId === 'critical')).toBe(true);
    expect(compiled.actions.every((action) => action.durationMin <= 90)).toBe(true);
    expect(compiled.actions.every((action) => action.explanation.length > 20)).toBe(true);
    expect(compiled.scheduledMin + compiled.bufferReservedMin).toBeLessThanOrEqual(
      compiled.capacityMin
    );
    expect(JSON.stringify({ plan, candidates })).toBe(before);
  });

  it('keeps recovery debt ahead of new work and reports overload when it consumes the day', () => {
    const plan = emptyDayPlan('2026-08-31');
    plan.structure.totalHoursTarget = 4;
    plan.mindset.energyForecast = 'low';

    const compiled = compileCapacityAwareDay({
      date: '2026-08-31',
      plan,
      candidates: [candidate('new-work', 60)],
      recoveryDebt: { count: 30, estimatedMin: 200 },
      options: { maxActionMin: 90 }
    });

    expect(compiled.nominalCapacityMin).toBe(240);
    expect(compiled.capacityMin).toBe(180);
    expect(compiled.status).toBe('overloaded');
    expect(compiled.actions).toHaveLength(3);
    expect(compiled.actions.every((action) => action.kind === 'recovery')).toBe(true);
    expect(compiled.deferredRecoveryMin).toBe(55);
    expect(compiled.deferredCandidateIds).toContain('new-work');
    expect(compiled.unallocatedMin).toBe(0);
  });

  it('fits energy-matched actions into explicit windows and splits long work to reach three actions', () => {
    const compiled = compileCapacityAwareDay({
      date: '2026-08-31',
      capacityMin: 120,
      candidates: [
        candidate('deep', 60, { energy: 'high', priority: 'P1 Critical' }),
        candidate('light', 50, { energy: 'low', priority: 'P2 High' })
      ],
      timeWindows: [
        { id: 'morning', start: '06:00', end: '07:00', energy: 'high' },
        { id: 'evening', start: '18:00', end: '19:00', energy: 'low' }
      ],
      options: { bufferPct: 0, minActions: 3, maxActions: 5 }
    });

    expect(compiled.actions).toHaveLength(3);
    expect(compiled.actions.slice(0, 2).map((action) => action.windowId)).toEqual([
      'morning',
      'morning'
    ]);
    expect(compiled.actions[0]).toMatchObject({ startsAt: '06:00', endsAt: '06:30' });
    expect(compiled.actions[1]).toMatchObject({ startsAt: '06:30', endsAt: '07:00' });
    expect(compiled.actions[2]).toMatchObject({
      sourceId: 'light',
      windowId: 'evening',
      startsAt: '18:00',
      endsAt: '18:50'
    });
  });

  it('adapts unfinished stored sessions without changing them', () => {
    const plan = emptyDayPlan('2026-08-31');
    plan.sessions = [
      {
        id: 'open',
        subject: 'Operating Systems',
        durationMin: 45,
        mode: 'PYQ Practice',
        priority: 'P1 Critical',
        target: 'Solve synchronization PYQs'
      },
      {
        id: 'done',
        subject: 'Algorithms',
        durationMin: 30,
        mode: 'Revision',
        priority: 'P3 Medium',
        target: '',
        execution: {
          sessionId: 'session-done',
          startedAt: '2026-08-31T06:00:00Z',
          completedAt: '2026-08-31T06:30:00Z',
          actualMin: 30,
          manual: false
        }
      }
    ];
    const before = JSON.stringify(plan.sessions);

    expect(plannerCandidatesFromSessions(plan.sessions, plan.date)).toEqual([
      expect.objectContaining({
        id: 'open',
        kind: 'pyq',
        title: 'Solve synchronization PYQs',
        required: true,
        dueDate: '2026-08-31'
      })
    ]);
    expect(JSON.stringify(plan.sessions)).toBe(before);
  });
});
