import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import {
  emptyDayPlan,
  keyFor,
  loadAllDayPlans,
  loadDayPlan,
  migrateLegacyDayPlansForUser,
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

  it('keeps the newest valid plan when scoped and legacy copies overlap', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const date = '2026-07-24';
    const scoped = {
      ...emptyDayPlan(date),
      updatedAt: '2026-07-24T08:00:00.000Z',
      review: { ...emptyDayPlan(date).review, wentWell: 'Older scoped copy' }
    };
    const legacy = {
      ...emptyDayPlan(date),
      updatedAt: '2026-07-24T18:00:00.000Z',
      review: { ...emptyDayPlan(date).review, wentWell: 'Newest legacy copy' }
    };
    localStorage.setItem(`air.planner.${userId}.${date}`, JSON.stringify(scoped));
    localStorage.setItem(`planner_${date}`, JSON.stringify(legacy));

    migrateLegacyDayPlansForUser(userId);

    expect(JSON.parse(localStorage.getItem(`air.planner.${userId}.${date}`) ?? '{}')).toMatchObject(
      {
        updatedAt: legacy.updatedAt,
        review: { wentWell: 'Newest legacy copy' }
      }
    );
    expect(localStorage.getItem(`planner_${date}`)).toBeNull();
  });

  it('accepts only real ISO dates from Telegram planner links', () => {
    expect(plannerDateFromSearch('?date=2026-07-23')).toBe('2026-07-23');
    expect(plannerDateFromSearch('?date=2026-02-31')).toBeNull();
    expect(plannerDateFromSearch('?date=tomorrow')).toBeNull();
  });

  it('migrates aliases on read while retaining every session and unknown label', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const date = '2026-07-24';
    actAs(userId);
    const legacy = emptyDayPlan(date);
    legacy.sessions = [
      {
        id: 'coa',
        subject: 'Computer Organization',
        durationMin: 60,
        mode: 'Deep Study',
        priority: 'P2 High',
        target: 'Pipeline'
      },
      {
        id: 'unknown',
        subject: 'Software Engineering',
        durationMin: 30,
        mode: 'Revision',
        priority: 'P4 Low',
        target: 'Historical topic'
      }
    ];
    localStorage.setItem(keyFor(date), JSON.stringify(legacy));

    const migrated = loadDayPlan(date);

    expect(migrated?.sessions).toHaveLength(2);
    expect(migrated?.sessions[0]).toMatchObject({ subject: 'COA', subjectId: 'coa' });
    expect(migrated?.sessions[1]).toMatchObject({
      subject: 'Software Engineering',
      subjectId: null
    });
    expect(JSON.parse(localStorage.getItem(keyFor(date)) ?? '{}').sessions[0]).toMatchObject({
      subject: 'COA',
      subjectId: 'coa'
    });
  });

  it('stores split programming aliases under one canonical identity without dropping blocks', () => {
    actAs('11111111-1111-4111-8111-111111111111');
    const plan = emptyDayPlan('2026-07-25');
    plan.sessions = [
      {
        id: 'c',
        subject: 'C Programming',
        durationMin: 60,
        mode: 'Deep Study',
        priority: 'P2 High',
        target: 'Pointers'
      },
      {
        id: 'ds',
        subject: 'Data Structures',
        durationMin: 60,
        mode: 'Problem Solving',
        priority: 'P2 High',
        target: 'Trees'
      }
    ];

    const saved = saveDayPlan(plan);

    expect(saved.sessions).toHaveLength(2);
    expect(saved.sessions.map((session) => session.subject)).toEqual([
      'Programming & DS',
      'Programming & DS'
    ]);
    expect(
      saved.sessions.every((session) => session.subjectId === 'programming-data-structures')
    ).toBe(true);
  });
});
