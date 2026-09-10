import { describe, expect, it } from 'vitest';
import { approveCompiledDayPlan, plannerSessionFromApprovedAction } from '@/lib/planner-approval';
import type { CompiledDayPlan, CompiledPlannerAction } from '@/lib/planner-compiler';
import { emptyDayPlan } from '@/lib/planner-storage';

function action(overrides: Partial<CompiledPlannerAction> = {}): CompiledPlannerAction {
  return {
    id: 'work-exact',
    sourceId: null,
    kind: 'pyq',
    title: 'Repair exact scheduler misses',
    detail: '2 high-confidence misses',
    subject: 'Operating Systems',
    durationMin: 30,
    sourceEstimatedMin: 30,
    remainingSourceMin: 0,
    priority: 'P1 Critical',
    energy: 'medium',
    required: true,
    href: '/pyq?preset=repair&history=incorrect&questionUids=q2,q1,q2',
    windowId: 'morning',
    windowLabel: 'Morning',
    startsAt: '06:30',
    endsAt: '07:00',
    explanation: 'Selected because the exact questions remain unresolved.',
    ...overrides
  };
}

function compiled(date: string, actions: CompiledPlannerAction[]): CompiledDayPlan {
  return {
    date,
    status: 'ready',
    nominalCapacityMin: 120,
    capacityMin: 120,
    bufferReservedMin: 20,
    recoveryRequestedMin: 0,
    recoveryReservedMin: 0,
    deferredRecoveryMin: 0,
    newWorkBudgetMin: 100,
    scheduledMin: actions.reduce((sum, item) => sum + item.durationMin, 0),
    unallocatedMin: 0,
    energy: 'high',
    actions,
    deferredCandidateIds: [],
    notes: []
  };
}

describe('Planner compiler approval', () => {
  it('freezes an exact PYQ launch only after the learner approves', () => {
    const block = plannerSessionFromApprovedAction('2026-09-02', action());
    expect(block).toMatchObject({
      subject: 'Operating Systems',
      subjectId: 'operating-systems',
      mode: 'PYQ Practice',
      startAt: '06:30',
      launch: {
        kind: 'pyq',
        prescription: {
          cohort: 'exact-uid',
          exactQuestionUids: ['q2', 'q1'],
          plannerDate: '2026-09-02',
          plannerBlockId: block.id
        },
        resolvedQuestionUids: [],
        pyqSessionId: null
      }
    });
    expect(block.actionHref).toBeUndefined();
  });

  it('retains active/completed evidence while replacing only the unfinished agenda', () => {
    const plan = emptyDayPlan('2026-09-02');
    plan.sessions = [
      {
        id: 'active',
        subject: 'Algorithms',
        durationMin: 60,
        mode: 'Problem Solving',
        priority: 'P1 Critical',
        target: 'Active work',
        execution: {
          sessionId: 'focus-1',
          startedAt: '2026-09-02T06:00:00Z',
          completedAt: null,
          actualMin: null,
          manual: false
        }
      },
      {
        id: 'replace-me',
        subject: 'Databases',
        durationMin: 90,
        mode: 'Deep Study',
        priority: 'P3 Medium',
        target: 'Unapproved work'
      }
    ];

    const next = approveCompiledDayPlan(
      plan,
      compiled(plan.date, [
        action({
          id: 'recovery',
          kind: 'recovery',
          title: 'Clear due recovery',
          subject: null,
          href: '/reattempts?open=first',
          startsAt: null,
          endsAt: null
        })
      ])
    );

    expect(next.sessions.map((item) => item.id)).toEqual(['active', expect.any(String)]);
    expect(next.sessions[0].execution?.sessionId).toBe('focus-1');
    expect(next.sessions[1]).toMatchObject({
      mode: 'Revision',
      actionHref: '/reattempts?open=first'
    });
    expect(plan.sessions).toHaveLength(2);
  });

  it('rejects approval against another date', () => {
    expect(() =>
      approveCompiledDayPlan(emptyDayPlan('2026-09-02'), compiled('2026-09-03', []))
    ).toThrow('another Planner day');
  });
});
