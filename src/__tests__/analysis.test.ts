// F3.4 DoD: numbers match the SQL semantics.
import { describe, it, expect } from 'vitest';
import type { QuestionRow, ReattemptRow, SessionRow } from '@/types';
import {
  calibrationBySubject,
  calibrationOverall,
  dueTodayCount,
  latestSession,
  mistakeSurfaceOpen,
  mistakeSurfaceMovement,
  mistakeSurfaceTrend,
  outcomeDistribution,
  activeDaysBack,
  heatmapCells,
  heatmapRowTotals,
  summarizeWeek
} from '@/lib/analysis';

const USER = '00000000-0000-4000-8000-000000000001';

function q(overrides: Partial<QuestionRow>): QuestionRow {
  return {
    id: 'q-x',
    user_id: USER,
    session_id: null,
    subject: 'Databases',
    subtopic: null,
    source_year: null,
    source_ref: null,
    question_text: null,
    answer_text: null,
    image_url: null,
    time_spent_sec: 60,
    target_time_sec: 120,
    outcome: 'R',
    pattern_name: null,
    trigger_sentence: null,
    root_cause: null,
    mark_decision: null,
    mark_correct: null,
    created_at: '2026-07-17T09:00:00.000Z',
    ...overrides
  };
}

function ra(overrides: Partial<ReattemptRow>): ReattemptRow {
  return {
    id: 'ra-x',
    user_id: USER,
    question_id: 'q-x',
    scheduled_date: '2026-07-17',
    stage: 'D3',
    history: [],
    created_at: '2026-07-14T09:00:00.000Z',
    ...overrides
  };
}

describe('mistakeSurfaceOpen', () => {
  it('counts everything not MASTERED', () => {
    const rows = [ra({ stage: 'D3' }), ra({ stage: 'D10' }), ra({ stage: 'MASTERED' })];
    expect(mistakeSurfaceOpen(rows)).toBe(2);
  });

  it('returns 0 for empty input', () => {
    expect(mistakeSurfaceOpen([])).toBe(0);
  });
});

describe('mistakeSurfaceTrend', () => {
  const now = new Date('2026-07-17T12:00:00Z');

  it('current = open now; prior = open 7 days ago', () => {
    const rows = [
      ra({ stage: 'D3', created_at: '2026-07-01T09:00:00.000Z' }),
      ra({
        stage: 'MASTERED',
        created_at: '2026-06-01T09:00:00.000Z',
        history: [{ date: '2026-07-15', result: 'clean' }]
      })
    ];
    const t = mistakeSurfaceTrend(rows, now);
    expect(t.current).toBe(1);
    expect(t.prior).toBe(2);
    expect(t.delta).toBe(-1);
  });

  it("rows created after the as-of date don't count in prior", () => {
    const rows = [ra({ stage: 'D3', created_at: '2026-07-15T09:00:00.000Z' })];
    const t = mistakeSurfaceTrend(rows, now);
    expect(t.current).toBe(1);
    expect(t.prior).toBe(0);
  });
});

describe('mistakeSurfaceMovement', () => {
  it('separates newly opened work from mastered work without grading the direction', () => {
    const now = new Date('2026-07-17T12:00:00Z');
    const rows = [
      ra({ created_at: '2026-07-16T09:00:00.000Z' }),
      ra({
        id: 'mastered',
        stage: 'MASTERED',
        created_at: '2026-06-01T09:00:00.000Z',
        history: [{ date: '2026-07-15', result: 'clean' }]
      })
    ];
    expect(mistakeSurfaceMovement(rows, now)).toEqual({ opened: 1, mastered: 1, net: 0 });
  });
});

describe('outcomeDistribution', () => {
  it('buckets by outcome and zero-fills the rest', () => {
    const rows = [q({ outcome: 'R' }), q({ outcome: 'R' }), q({ outcome: 'W-C' })];
    const dist = outcomeDistribution(rows);
    expect(dist['R']).toBe(2);
    expect(dist['W-C']).toBe(1);
    expect(dist['RBS']).toBe(0);
    expect(dist['MSQ' as never]).toBeUndefined();
  });
});

describe('latestSession', () => {
  it('picks newest by created_at', () => {
    const older: SessionRow = {
      id: 's-1',
      user_id: USER,
      date: '2026-07-15',
      subject: 'Algorithms',
      target_duration_min: 60,
      actual_duration_min: 60,
      insight: null,
      sadhana_done: false,
      interruptions_count: 0,
      created_at: '2026-07-15T09:00:00.000Z'
    };
    const newer: SessionRow = { ...older, id: 's-2', created_at: '2026-07-17T09:00:00.000Z' };
    expect(latestSession([older, newer])?.id).toBe('s-2');
  });

  it('returns null for empty', () => {
    expect(latestSession([])).toBeNull();
  });

  it('ignores a newer session that is still running', () => {
    const finished: SessionRow = {
      id: 's-finished',
      user_id: USER,
      date: '2026-07-17',
      subject: 'Algorithms',
      target_duration_min: 60,
      actual_duration_min: 42,
      insight: null,
      sadhana_done: false,
      interruptions_count: 0,
      created_at: '2026-07-17T09:00:00.000Z'
    };
    const running: SessionRow = {
      ...finished,
      id: 's-running',
      actual_duration_min: null,
      created_at: '2026-07-22T09:00:00.000Z'
    };
    expect(latestSession([finished, running])?.id).toBe('s-finished');
  });
});

describe('dueTodayCount', () => {
  it('counts scheduled <= today and stage != MASTERED', () => {
    const rows = [
      ra({ scheduled_date: '2026-07-15' }),
      ra({ scheduled_date: '2026-07-17' }),
      ra({ scheduled_date: '2026-07-20' }),
      ra({ scheduled_date: '2026-07-15', stage: 'MASTERED' })
    ];
    expect(dueTodayCount(rows, '2026-07-17')).toBe(2);
  });
});

describe('summarizeWeek', () => {
  const weekStart = '2026-07-13'; // Monday
  it('buckets in-week questions and skips out-of-window rows', () => {
    const rows = [
      q({ outcome: 'R', subject: 'Algorithms', created_at: '2026-07-13T09:00:00.000Z' }),
      q({ outcome: 'RBS', subject: 'Algorithms', created_at: '2026-07-14T09:00:00.000Z' }),
      q({ outcome: 'W-C', subject: 'Databases', created_at: '2026-07-15T09:00:00.000Z' }),
      q({ outcome: 'W-C', subject: 'Databases', created_at: '2026-07-16T09:00:00.000Z' }),
      // out of window
      q({ outcome: 'R', subject: 'Algorithms', created_at: '2026-07-06T09:00:00.000Z' })
    ];
    const s = summarizeWeek(rows, weekStart);
    expect(s.totalQ).toBe(4);
    expect(s.clean).toBe(1);
    expect(s.slow).toBe(1);
    expect(s.wrong).toBe(2);
    expect(s.bySubject[0].subject).toBe('Databases'); // most wrongish first
    expect(s.bySubject[0].wrongish).toBe(2);
    expect(s.weekEnd).toBe('2026-07-19'); // +6 days
  });

  it('counts root causes and top patterns', () => {
    const rows = [
      q({
        outcome: 'W-C',
        root_cause: 'concept',
        pattern_name: 'joins on nulls',
        created_at: '2026-07-13T09:00:00.000Z'
      }),
      q({
        outcome: 'W-C',
        root_cause: 'concept',
        pattern_name: 'joins on nulls',
        created_at: '2026-07-14T09:00:00.000Z'
      }),
      q({
        outcome: 'RBS',
        root_cause: 'strategy',
        pattern_name: 'set cover',
        created_at: '2026-07-15T09:00:00.000Z'
      })
    ];
    const s = summarizeWeek(rows, weekStart);
    expect(s.byRootCause.concept).toBe(2);
    expect(s.byRootCause.strategy).toBe(1);
    expect(s.topPatterns[0]).toEqual({ name: 'joins on nulls', count: 2, total: 2 });
  });

  it('assigns UTC timestamps to the learner\'s local study day', () => {
    const afterMidnightInIndia = q({
      created_at: '2026-07-16T20:00:00.000Z'
    });
    expect(summarizeWeek([afterMidnightInIndia], '2026-07-17', 'Asia/Kolkata').totalQ).toBe(1);
    expect(summarizeWeek([afterMidnightInIndia], '2026-07-17', 'UTC').totalQ).toBe(0);
  });
});

describe('heatmapCells (F5.2 DoD)', () => {
  const rows = [
    q({ outcome: 'R', subject: 'Databases', subtopic: 'SQL — Joins & Subqueries' }),
    q({
      outcome: 'W-C',
      subject: 'Databases',
      subtopic: 'Normalization — BCNF / 4NF',
      root_cause: 'concept'
    }),
    q({
      outcome: 'W-C',
      subject: 'Databases',
      subtopic: 'Normalization — BCNF / 4NF',
      root_cause: 'concept',
      created_at: '2026-07-16T09:00:00.000Z'
    }),
    q({
      outcome: 'RBS',
      subject: 'Algorithms',
      subtopic: 'Dynamic Programming — 1D',
      root_cause: null
    }),
    q({
      outcome: 'W-E',
      subject: 'Databases',
      subtopic: 'Normalization — BCNF / 4NF',
      root_cause: 'computation'
    })
  ];

  it('skips R outcomes and buckets by (subject × subtopic × root_cause)', () => {
    const cells = heatmapCells(rows);
    expect(cells.find((c) => c.rootCause === 'concept' && c.subject === 'Databases')?.count).toBe(
      2
    );
    expect(cells.find((c) => c.rootCause === 'computation')?.count).toBe(1);
    expect(cells.find((c) => c.rootCause === 'unspecified')?.count).toBe(1);
    // R is skipped entirely
    expect(cells.some((c) => c.subtopic === 'SQL — Joins & Subqueries')).toBe(false);
  });

  it('collapses subtopic when groupBySubtopic is false', () => {
    const cells = heatmapCells(rows, { groupBySubtopic: false });
    for (const c of cells) expect(c.subtopic).toBeNull();
    expect(cells.find((c) => c.subject === 'Databases' && c.rootCause === 'concept')?.count).toBe(
      2
    );
  });

  it('respects from/to window', () => {
    const cells = heatmapCells(rows, { from: '2026-07-17', to: '2026-07-17' });
    // only rows from 2026-07-17 (the default in q()) — the 07-16 one is dropped
    expect(cells.find((c) => c.rootCause === 'concept')?.count).toBe(1);
  });

  it('row totals aggregate across causes', () => {
    const cells = heatmapCells(rows);
    const totals = heatmapRowTotals(cells);
    expect(totals.get('Databases||Normalization — BCNF / 4NF')).toBe(3);
    expect(totals.get('Algorithms||Dynamic Programming — 1D')).toBe(1);
  });
});

describe('calibration (F5.4 DoD)', () => {
  it('EV math matches spec: skip=0, correct=+1, wrong=-1/3', () => {
    const rows = [
      q({ subject: 'Databases', mark_decision: 'MARK', mark_correct: true }),
      q({ subject: 'Databases', mark_decision: 'MARK', mark_correct: true }),
      q({ subject: 'Databases', mark_decision: 'MARK', mark_correct: false }),
      q({ subject: 'Databases', mark_decision: 'SKIP', mark_correct: null })
    ];
    const cal = calibrationBySubject(rows);
    const db = cal.find((c) => c.subject === 'Databases');
    expect(db).toBeDefined();
    expect(db!.marked).toBe(3);
    expect(db!.markedCorrect).toBe(2);
    expect(db!.markedWrong).toBe(1);
    expect(db!.skipped).toBe(1);
    // Policy EV includes the skipped question at zero: (2 - 1/3) / 4 = 5/12.
    expect(db!.expectedValue).toBeCloseTo(5 / 12, 5);
    expect(db!.answeredExpectedValue).toBeCloseTo(5 / 9, 5);
    expect(db!.accuracy).toBeCloseTo(2 / 3, 5);
  });

  it('50-50 counts as a decision that pays the same as MARK', () => {
    const rows = [
      q({ subject: 'Algorithms', mark_decision: 'FIFTY_FIFTY', mark_correct: true }),
      q({ subject: 'Algorithms', mark_decision: 'FIFTY_FIFTY', mark_correct: false })
    ];
    const cal = calibrationBySubject(rows);
    const algo = cal.find((c) => c.subject === 'Algorithms')!;
    expect(algo.fiftyFifty).toBe(2);
    expect(algo.fiftyFiftyCorrect).toBe(1);
    // EV: (1 * 1 + 1 * -1/3) / 2 = 1/3
    expect(algo.expectedValue).toBeCloseTo(1 / 3, 5);
  });

  it('can recommend a higher threshold from 50-50 evidence alone', () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      q({
        subject: 'Algorithms',
        mark_decision: 'FIFTY_FIFTY',
        mark_correct: index === 0
      })
    );
    const [algo] = calibrationBySubject(rows);
    expect(algo.accuracy).toBeCloseTo(0.125, 3);
    expect(algo.recommendation).toBe('raise');
  });

  it('recommends raise when accuracy is below break-even (25%)', () => {
    // 1 correct of 8 = 12.5% — well below the -1/3 break-even.
    const rows = Array.from({ length: 8 }, (_, i) =>
      q({ subject: 'Databases', mark_decision: 'MARK', mark_correct: i === 0 })
    );
    const cal = calibrationBySubject(rows);
    expect(cal[0].recommendation).toBe('raise');
  });

  it('reports insufficient signal when sample size is too small to advise', () => {
    const rows = [
      q({ subject: 'Databases', mark_decision: 'MARK', mark_correct: false }),
      q({ subject: 'Databases', mark_decision: 'MARK', mark_correct: false })
    ];
    const cal = calibrationBySubject(rows);
    expect(cal[0].recommendation).toBe('insufficient');
  });

  it('recommends lower for high accuracy + high EV', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      q({
        subject: 'Databases',
        mark_decision: i < 10 ? 'MARK' : 'SKIP',
        mark_correct: i < 9 ? true : i < 10 ? false : null // 9/10 = 90%, plus 2 skips
      })
    );
    const cal = calibrationBySubject(rows);
    expect(cal[0].recommendation).toBe('lower');
  });

  it('overall aggregates per-subject rows', () => {
    const rows = [
      q({ subject: 'Databases', mark_decision: 'MARK', mark_correct: true }),
      q({ subject: 'Algorithms', mark_decision: 'MARK', mark_correct: false }),
      q({ subject: 'Algorithms', mark_decision: 'SKIP', mark_correct: null })
    ];
    const overall = calibrationOverall(calibrationBySubject(rows));
    expect(overall.decided).toBe(2);
    expect(overall.correct).toBe(1);
    expect(overall.wrong).toBe(1);
    expect(overall.skipped).toBe(1);
    // Policy EV includes the skip: (1 - 1/3) / 3 = 2/9.
    expect(overall.expectedValue).toBeCloseTo(2 / 9, 5);
  });
});

describe('activeDaysBack', () => {
  it('counts consecutive days ending today with any tagged question', () => {
    const now = new Date('2026-07-17T12:00:00Z');
    const rows = [
      q({ created_at: '2026-07-17T09:00:00.000Z' }),
      q({ created_at: '2026-07-16T09:00:00.000Z' }),
      q({ created_at: '2026-07-14T09:00:00.000Z' })
    ];
    expect(activeDaysBack(rows, now)).toBe(2); // 17, 16 (15 missing breaks the chain)
  });

  it('returns 0 when today has none', () => {
    const now = new Date('2026-07-17T12:00:00Z');
    const rows = [q({ created_at: '2026-07-15T09:00:00.000Z' })];
    expect(activeDaysBack(rows, now)).toBe(0);
  });
});
