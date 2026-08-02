import { describe, expect, it } from 'vitest';
import {
  BASELINE_OPEN_SURFACE,
  TARGET_PATTERN_LIBRARY,
  WEIGHTS,
  calibration,
  computeReadiness,
  computeReadinessBySubject,
  coverage,
  estimateAIRBand,
  examDaySimulator,
  nextMoves,
  readinessComponents,
  retention,
  surface
} from '@/lib/readiness';
import type { PatternRow, QuestionRow, ReattemptRow, Outcome, ReattemptStage } from '@/types';
import { computeReadinessScore } from '../../supabase/functions/_shared/readiness-score';

function question(o: Partial<QuestionRow>): QuestionRow {
  return {
    id: o.id ?? 'q',
    user_id: 'u',
    session_id: null,
    subject: 'Discrete Mathematics',
    subtopic: null,
    source_year: null,
    source_ref: null,
    question_text: null,
    answer_text: null,
    image_url: null,
    time_spent_sec: 0,
    target_time_sec: 120,
    outcome: (o.outcome ?? 'R') as Outcome,
    pattern_name: null,
    trigger_sentence: null,
    root_cause: null,
    mark_decision: o.mark_decision ?? null,
    mark_correct: o.mark_correct ?? null,
    created_at: '2026-07-18T00:00:00.000Z',
    ...o
  };
}

function reattempt(stage: ReattemptStage): ReattemptRow {
  return {
    id: `r-${Math.random()}`,
    user_id: 'u',
    question_id: 'q',
    scheduled_date: '2026-07-25',
    stage,
    history: [],
    created_at: '2026-07-18T00:00:00.000Z'
  };
}

function pattern(name: string): PatternRow {
  return {
    id: `p-${name}`,
    user_id: 'u',
    name,
    subject: 'Discrete Mathematics',
    count: 1,
    is_reflexed: false,
    mastery_level: 0,
    first_seen_at: '2026-07-18T00:00:00.000Z'
  };
}

describe('sub-scores', () => {
  it('coverage saturates at the target', () => {
    expect(coverage(0)).toBe(0);
    expect(coverage(TARGET_PATTERN_LIBRARY / 2)).toBeCloseTo(0.5, 3);
    expect(coverage(TARGET_PATTERN_LIBRARY)).toBe(1);
    expect(coverage(TARGET_PATTERN_LIBRARY * 2)).toBe(1);
  });

  it('retention is 0 with no re-attempts, 1 when all stabilised', () => {
    expect(retention([])).toBe(0);
    expect(retention([reattempt('D3'), reattempt('D10')])).toBe(0);
    expect(retention([reattempt('D30'), reattempt('MASTERED')])).toBe(1);
    expect(retention([reattempt('D3'), reattempt('MASTERED')])).toBeCloseTo(0.5, 3);
  });

  it('calibration only counts MARKed questions', () => {
    expect(calibration([])).toBe(0);
    const qs = [
      question({ mark_decision: 'MARK', mark_correct: true }),
      question({ mark_decision: 'MARK', mark_correct: false }),
      question({ mark_decision: 'SKIP', mark_correct: null }),
      question({ mark_decision: null, mark_correct: null })
    ];
    expect(calibration(qs)).toBeCloseTo(0.5, 3);
  });

  it('surface inverts open re-attempts against the baseline', () => {
    expect(surface(0)).toBe(1);
    expect(surface(BASELINE_OPEN_SURFACE / 2)).toBeCloseTo(0.5, 3);
    expect(surface(BASELINE_OPEN_SURFACE)).toBe(0);
    expect(surface(BASELINE_OPEN_SURFACE * 2)).toBe(0);
  });
});

describe('computeReadiness', () => {
  it('empty inputs do not receive free mistake-surface points', () => {
    const r = computeReadiness({ questions: [], reattempts: [], patterns: [] });
    expect(r.coverage).toBe(0);
    expect(r.retention).toBe(0);
    expect(r.calibration).toBe(0);
    expect(r.surface).toBe(0);
    expect(r.score).toBe(0);
    expect(r.confidence).toBe('early');
  });

  it('mixed synthetic data gives expected composite', () => {
    const patterns = Array.from({ length: 200 }, (_, i) => pattern(`p${i}`)); // 200/400 = 0.5
    const reattempts = [
      reattempt('D30'),
      reattempt('D30'),
      reattempt('MASTERED'),
      reattempt('D3') // 3/4 stabilised
    ];
    // open re-attempts (non-MASTERED) = 3; surface = 1 - 3/50 = 0.94
    const questions = [
      question({ mark_decision: 'MARK', mark_correct: true }),
      question({ mark_decision: 'MARK', mark_correct: true }),
      question({ mark_decision: 'MARK', mark_correct: false }),
      question({ mark_decision: 'MARK', mark_correct: false }) // 2/4 = 0.5
    ];
    const r = computeReadiness({ questions, reattempts, patterns });
    expect(r.coverage).toBeCloseTo(0.5, 3);
    expect(r.retention).toBeCloseTo(0.375, 3); // 4/8 evidence weight
    expect(r.calibration).toBeCloseTo(0.2, 3); // 4/10 evidence weight
    expect(r.surface).toBeCloseTo(0.188, 3); // 4/20 evidence weight
    expect(r.score).toBe(33);
  });

  it('counts breakdown numbers match inputs', () => {
    const r = computeReadiness({
      questions: [question({ mark_decision: 'MARK', mark_correct: true })],
      reattempts: [reattempt('D30')],
      patterns: [pattern('p1')]
    });
    expect(r.counts.patterns).toBe(1);
    expect(r.counts.questions).toBe(1);
    expect(r.counts.eligibleReattempts).toBe(1);
    expect(r.counts.stabilised).toBe(1);
    expect(r.counts.openReattempts).toBe(1); // D30 is still open (not MASTERED)
    expect(r.counts.markedDecisions).toBe(1);
    expect(r.counts.markedCorrect).toBe(1);
  });

  it('does not penalise retention for a new row that is not due yet', () => {
    const future = { ...reattempt('D3'), scheduled_date: '2099-01-01' };
    const r = computeReadiness({
      questions: [question({})],
      reattempts: [future],
      patterns: []
    });
    expect(r.counts.eligibleReattempts).toBe(0);
    expect(r.retention).toBe(0);
  });

  it('matches the weekly edge-function scorer', () => {
    const questions = Array.from({ length: 20 }, (_, index) =>
      question({
        id: `q-${index}`,
        mark_decision: index < 10 ? 'MARK' : null,
        mark_correct: index < 7 ? true : index < 10 ? false : null
      })
    );
    const reattempts = [
      reattempt('MASTERED'),
      reattempt('D30'),
      reattempt('D30'),
      reattempt('D10'),
      reattempt('D10'),
      reattempt('D3'),
      reattempt('D3'),
      reattempt('D3')
    ];
    const patterns = Array.from({ length: 80 }, (_, index) => pattern(`p-${index}`));
    const client = computeReadiness({ questions, reattempts, patterns });
    const edge = computeReadinessScore(questions, patterns.length, reattempts, '2026-08-02');
    expect(edge).toBe(client.score);
  });
});

describe('readinessComponents', () => {
  it('weights sum to 1', () => {
    const s = WEIGHTS.coverage + WEIGHTS.retention + WEIGHTS.calibration + WEIGHTS.surface;
    expect(s).toBeCloseTo(1, 6);
  });

  it('contributions sum to the total score (within rounding)', () => {
    const r = computeReadiness({
      questions: [
        question({ mark_decision: 'MARK', mark_correct: true }),
        question({ mark_decision: 'MARK', mark_correct: false })
      ],
      reattempts: [reattempt('D30'), reattempt('D3')],
      patterns: [pattern('a'), pattern('b')]
    });
    const cs = readinessComponents(r);
    const sum = cs.reduce((s, c) => s + c.contribution, 0);
    expect(Math.abs(sum - r.score)).toBeLessThanOrEqual(3); // rounding slack
  });
});

describe('computeReadinessBySubject', () => {
  it('routes questions/patterns/reattempts to their subject bucket', () => {
    const q1 = question({ id: 'q1', subject: 'Databases' });
    const q2 = question({ id: 'q2', subject: 'Algorithms' });
    const p1 = { ...pattern('joins'), subject: 'Databases' };
    const p2 = { ...pattern('dp'), subject: 'Algorithms' };
    const rows = computeReadinessBySubject(
      { questions: [q1, q2], reattempts: [], patterns: [p1, p2] },
      ['Databases', 'Algorithms', 'Compiler Design']
    );
    const db = rows.find((r) => r.subject === 'Databases')!;
    const algo = rows.find((r) => r.subject === 'Algorithms')!;
    const cd = rows.find((r) => r.subject === 'Compiler Design')!;
    expect(db.hasSignal).toBe(true);
    expect(db.counts.patterns).toBe(1);
    expect(algo.counts.patterns).toBe(1);
    expect(cd.hasSignal).toBe(false);
  });
});

describe('estimateAIRBand', () => {
  it('score < 36 with T− > 60 predicts AIR > 5000', () => {
    const band = estimateAIRBand(30, 90);
    expect(band.low).toBeGreaterThanOrEqual(5000);
  });
  it('score >= 82 with plenty of days maps to sub-100', () => {
    const band = estimateAIRBand(85, 90);
    expect(band.high).toBeLessThanOrEqual(100);
  });
  it('shorter runway penalises a mid score', () => {
    const withRunway = estimateAIRBand(60, 120);
    const tightRunway = estimateAIRBand(60, 5);
    expect(tightRunway.low).toBeGreaterThanOrEqual(withRunway.low);
  });
});

describe('nextMoves', () => {
  it('prioritises calibration when accuracy is bad', () => {
    const qs: QuestionRow[] = [];
    for (let i = 0; i < 8; i++) {
      qs.push(
        question({
          id: `q${i}`,
          subject: 'Databases',
          mark_decision: 'MARK',
          mark_correct: i < 1 // 12.5% accuracy
        })
      );
    }
    const perSubject = computeReadinessBySubject({ questions: qs, reattempts: [], patterns: [] }, [
      'Databases'
    ]);
    const overall = computeReadiness({ questions: qs, reattempts: [], patterns: [] });
    const moves = nextMoves(overall, perSubject);
    expect(moves[0].kind).toBe('calibrate');
    expect(moves[0].subject).toBe('Databases');
    expect(moves[0].urgency).toBe('high');
  });

  it('emits a diagnose move when no subject has signal', () => {
    const perSubject = computeReadinessBySubject({ questions: [], reattempts: [], patterns: [] }, [
      'Databases',
      'Algorithms'
    ]);
    const overall = computeReadiness({ questions: [], reattempts: [], patterns: [] });
    const moves = nextMoves(overall, perSubject);
    expect(moves.some((m) => m.kind === 'diagnose')).toBe(true);
  });
});

describe('examDaySimulator', () => {
  it('is deterministic for the same evidence and remains monotone', () => {
    const qs: QuestionRow[] = [];
    for (let i = 0; i < 20; i++) {
      qs.push(
        question({
          id: `q${i}`,
          subject: 'Databases',
          mark_decision: 'MARK',
          mark_correct: true
        })
      );
    }
    const perfect = computeReadinessBySubject(
      { questions: qs, reattempts: [], patterns: qs.map((_, i) => pattern(`p${i}`)) },
      ['Databases']
    );
    const bad = computeReadinessBySubject(
      {
        questions: qs.map((q) => ({ ...q, mark_correct: false })),
        reattempts: [],
        patterns: []
      },
      ['Databases']
    );
    const perfSim = examDaySimulator(perfect, 200);
    expect(examDaySimulator(perfect, 200)).toEqual(perfSim);
    const badSim = examDaySimulator(bad, 200);
    expect(perfSim.p50).toBeGreaterThan(badSim.p50);
  });
});
