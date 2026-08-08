import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import {
  emptyDayPlan,
  keyFor,
  loadAllDayPlans,
  loadDayPlan,
  plannerDateFromSearch,
  saveDayPlan
} from '@/lib/planner-storage';
import { useAuthStore } from '@/stores/auth';

function actAs(userId: string) {
  useAuthStore.setState({
    user: { id: userId } as User,
    status: 'signed_in',
    sandbox: false
  });
}

describe('Planner local isolation', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, profile: null, status: 'signed_out' });
  });

  it('keeps two users plans in separate local namespaces', () => {
    const firstUserId = '11111111-1111-4111-8111-111111111111';
    actAs(firstUserId);
    const firstPlan = emptyDayPlan('2026-07-22');
    firstPlan.sessions.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subject: 'Operating Systems',
      durationMin: 90,
      mode: 'PYQ Practice',
      priority: 'P1 Critical',
      target: 'Process synchronization'
    });
    saveDayPlan(firstPlan);

    actAs('22222222-2222-4222-8222-222222222222');
    expect(loadDayPlan('2026-07-22')).toBeNull();
    expect(loadAllDayPlans(firstUserId).map((plan) => plan.date)).toEqual(['2026-07-22']);
  });

  it('claims a legacy Planner row for the current user', () => {
    const date = '2026-07-23';
    const legacy = emptyDayPlan(date);
    localStorage.setItem(`planner_${date}`, JSON.stringify(legacy));

    actAs('11111111-1111-4111-8111-111111111111');
    expect(loadDayPlan(date)?.date).toBe(date);
    expect(localStorage.getItem(`planner_${date}`)).toBeNull();
    expect(localStorage.getItem(keyFor(date))).not.toBeNull();
  });

  it('accepts only real ISO dates from Telegram planner links', () => {
    expect(plannerDateFromSearch('?date=2026-07-23')).toBe('2026-07-23');
    expect(plannerDateFromSearch('?date=2026-02-31')).toBeNull();
    expect(plannerDateFromSearch('?date=tomorrow')).toBeNull();
  });
});
