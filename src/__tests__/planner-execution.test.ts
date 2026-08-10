import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { db } from '@/lib/db';
import { emptyDayPlan, loadDayPlan, saveDayPlan, type StudySession } from '@/lib/planner-storage';
import {
  markPlannerBlockComplete,
  plannerBlockHref,
  reconcilePlannerExecutions
} from '@/lib/planner-execution';
import { useAuthStore } from '@/stores/auth';

const USER = '11111111-1111-4111-8111-111111111111';
const DATE = '2026-08-10';

function block(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 'block-1',
    subject: 'Operating Systems',
    durationMin: 60,
    mode: 'Problem Solving',
    priority: 'P1 Critical',
    target: 'Synchronization',
    ...overrides
  };
}

function savePlan(...blocks: StudySession[]) {
  const plan = emptyDayPlan(DATE);
  plan.sessions = blocks;
  saveDayPlan(plan);
}

describe('planner execution links', () => {
  beforeEach(async () => {
    localStorage.clear();
    useAuthStore.setState({
      user: { id: USER } as User,
      status: 'signed_in',
      sandbox: false
    });
    await Promise.all([db.sessions.clear(), db.mock_tests.clear()]);
  });

  afterEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, profile: null, status: 'signed_out' });
  });

  it('routes each planner mode into the correct working flow', () => {
    expect(plannerBlockHref(DATE, block({ mode: 'PYQ Practice', durationMin: 30 }))).toContain(
      '/pyq?'
    );
    expect(plannerBlockHref(DATE, block({ mode: 'PYQ Practice', durationMin: 30 }))).toContain(
      'count=10'
    );
    expect(plannerBlockHref(DATE, block({ mode: 'Mock Test' }))).toContain('/mocks?');
    expect(plannerBlockHref(DATE, block())).toContain('/session/new?');
    expect(
      plannerBlockHref(
        DATE,
        block({
          execution: {
            sessionId: 'session-1',
            startedAt: '2026-08-10T10:00:00.000Z',
            completedAt: null,
            actualMin: null,
            manual: false
          }
        })
      )
    ).toBe('/session/session-1/solve');
  });

  it('derives review completion from completed block minutes', () => {
    savePlan(block(), block({ id: 'block-2', durationMin: 30 }));
    markPlannerBlockComplete(DATE, 'block-1', 45);

    const plan = loadDayPlan(DATE);
    expect(plan?.sessions[0].execution?.actualMin).toBe(45);
    expect(plan?.review.completionPct).toBe(50);
  });

  it('does not let one overlong block hide unfinished planned work', () => {
    savePlan(block(), block({ id: 'block-2', durationMin: 30 }));
    markPlannerBlockComplete(DATE, 'block-1', 120);

    expect(loadDayPlan(DATE)?.review.completionPct).toBe(67);
  });

  it('reconciles a completed focused session back into its exact planner block', async () => {
    savePlan(block());
    await db.sessions.put({
      id: 'session-linked',
      user_id: USER,
      kind: 'focused',
      date: DATE,
      subject: 'Operating Systems',
      target_duration_min: 60,
      actual_duration_min: 52,
      insight: null,
      sadhana_done: false,
      interruptions_count: 0,
      planner_date: DATE,
      planner_block_id: 'block-1',
      created_at: '2026-08-10T10:00:00.000Z',
      sync_status: 'synced'
    });

    await expect(reconcilePlannerExecutions(USER)).resolves.toBe(1);
    expect(loadDayPlan(DATE)?.sessions[0].execution).toMatchObject({
      sessionId: 'session-linked',
      actualMin: 52,
      manual: false
    });
    expect(loadDayPlan(DATE)?.review.completionPct).toBe(87);
    await expect(reconcilePlannerExecutions(USER)).resolves.toBe(0);
  });
});
