import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import {
  emptyDayPlan,
  keyFor,
  loadAllDayPlans,
  loadDayPlan,
  migrateLegacyDayPlansForUser,
  normalizeDayPlan,
  plannerDateFromSearch,
  saveDayPlan,
  type DayPlan
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

  it('repairs malformed capacity, windows, and nested day fields deterministically', () => {
    const source = {
      ...emptyDayPlan('2026-07-26'),
      availability: {
        availableMin: Number.POSITIVE_INFINITY,
        protectedBufferMin: Number.NEGATIVE_INFINITY,
        timeWindows: [
          {
            id: ' ',
            label: 42,
            start: '25:00',
            end: null,
            energy: 'wired'
          },
          {
            id: 'study',
            label: ' Morning focus ',
            start: '06:30',
            end: '08:00',
            energy: 'high'
          },
          {
            id: 'study',
            label: '',
            start: '08:15',
            end: '09:00',
            energy: 'invalid'
          },
          null
        ]
      },
      structure: null,
      mindset: {
        energyForecast: 'low',
        moodIntent: 12,
        motivationNote: null
      },
      nonStudy: null,
      review: {
        completionPct: Number.NaN,
        endMood: 'ecstatic',
        replicate: 'maybe'
      }
    } as unknown as DayPlan;

    const normalized = normalizeDayPlan(source);

    expect(normalized.availability).toEqual({
      availableMin: 360,
      protectedBufferMin: 45,
      timeWindows: [
        {
          id: 'legacy-window-1',
          label: 'Window 1',
          start: '',
          end: '',
          energy: 'low'
        },
        {
          id: 'study',
          label: 'Morning focus',
          start: '06:30',
          end: '08:00',
          energy: 'high'
        },
        {
          id: 'study-2',
          label: 'Window 3',
          start: '08:15',
          end: '09:00',
          energy: 'low'
        }
      ]
    });
    expect(normalized.structure).toEqual(emptyDayPlan(source.date).structure);
    expect(normalized.mindset).toEqual({
      energyForecast: 'low',
      moodIntent: 'Focused Grind',
      motivationNote: ''
    });
    expect(normalized.nonStudy).toEqual(emptyDayPlan(source.date).nonStudy);
    expect(normalized.review).toMatchObject({ completionPct: 0, endMood: '', replicate: '' });
    expect(normalizeDayPlan(normalized)).toEqual(normalized);
  });

  it('coerces recoverable legacy sessions while removing non-finite execution facts', () => {
    const source = {
      ...emptyDayPlan('2026-07-27'),
      availability: {
        availableMin: '525.4',
        protectedBufferMin: '900',
        timeWindows: []
      },
      sessions: [
        {
          id: ' ',
          subject: 17,
          durationMin: Number.NaN,
          mode: 'Napping',
          priority: 'Urgent',
          target: 99,
          startAt: '99:00',
          actionHref: 'https://example.com',
          execution: {
            sessionId: 42,
            startedAt: 'not-a-date',
            completedAt: null,
            actualMin: Number.POSITIVE_INFINITY,
            manual: 'yes'
          }
        },
        {
          id: 'duplicate',
          subject: '',
          subjectId: 'coa',
          durationMin: '91.6',
          mode: 'Revision',
          priority: 'P1 Critical',
          target: 'Pipeline transfer',
          startAt: '07:15',
          execution: {
            sessionId: ' focus-1 ',
            startedAt: 'bad',
            completedAt: '2026-07-27T08:46:00.000Z',
            actualMin: '46.7',
            manual: false
          }
        },
        {
          id: 'duplicate',
          subject: 'Software Engineering',
          durationMin: -8,
          mode: 'Deep Study',
          priority: 'P2 High',
          target: 'Legacy elective'
        },
        'unrecoverable'
      ]
    } as unknown as DayPlan;

    const normalized = normalizeDayPlan(source);

    expect(normalized.availability).toMatchObject({
      availableMin: 525,
      protectedBufferMin: 480
    });
    expect(normalized.sessions).toHaveLength(3);
    expect(normalized.sessions.map((session) => session.id)).toEqual([
      'legacy-session-2026-07-27-1',
      'duplicate',
      'duplicate-2'
    ]);
    expect(normalized.sessions[0]).toMatchObject({
      subject: 'Custom...',
      subjectId: null,
      durationMin: 60,
      mode: 'Deep Study',
      priority: 'P2 High',
      target: ''
    });
    expect(normalized.sessions[0].startAt).toBeUndefined();
    expect(normalized.sessions[0].actionHref).toBeUndefined();
    expect(normalized.sessions[0].execution).toBeUndefined();
    expect(normalized.sessions[1]).toMatchObject({
      subject: 'COA',
      subjectId: 'coa',
      durationMin: 92,
      startAt: '07:15',
      execution: {
        sessionId: 'focus-1',
        startedAt: null,
        completedAt: '2026-07-27T08:46:00.000Z',
        actualMin: 47,
        manual: false
      }
    });
    expect(normalized.sessions[2]).toMatchObject({
      subject: 'Software Engineering',
      subjectId: null,
      durationMin: 1
    });
  });

  it('bounds and deduplicates multi-bank PYQ subject scopes on hydration', () => {
    const plan = emptyDayPlan('2026-07-28');
    plan.sessions = [
      {
        id: 'programming-pyq',
        subject: 'Programming & DS',
        durationMin: 60,
        mode: 'PYQ Practice',
        priority: 'P1 Critical',
        target: 'Mixed programming transfer',
        launch: {
          kind: 'pyq',
          prescription: {
            schemaVersion: 1,
            id: 'prescription-1',
            plannerDate: plan.date,
            plannerBlockId: 'programming-pyq',
            exactQuestionUids: [],
            config: {
              subjectSlug: 'all',
              subjectSlugs: [
                ' c-programming ',
                'data-structure',
                'c-programming',
                '',
                42,
                'x'.repeat(81)
              ]
            }
          },
          resolvedQuestionUids: [],
          resolvedAt: null,
          pyqSessionId: null
        }
      }
    ] as unknown as DayPlan['sessions'];

    const [session] = normalizeDayPlan(plan).sessions;

    expect(session.launch?.prescription.config.subjectSlugs).toEqual([
      'c-programming',
      'data-structure'
    ]);

    const rawConfig = plan.sessions[0].launch?.prescription.config as unknown as Record<
      string,
      unknown
    >;
    rawConfig.subjectSlugs = [' ', 42, 'x'.repeat(81)];
    expect(normalizeDayPlan(plan).sessions[0].launch?.prescription.config).not.toHaveProperty(
      'subjectSlugs'
    );
  });
});
