import { describe, expect, it } from 'vitest';
import {
  BASELINE_OPEN_SURFACE,
  TARGET_PATTERN_LIBRARY,
  WEIGHTS,
  calibration,
  computeReadiness,
  computeReadinessBySubject,
  coverage,
  nextMoves,
  readinessComponents,
  retention,
  surface
} from '@/lib/readiness';
import { normalizeAttemptEvidence } from '@/lib/attempt-evidence';
import {
  legacyPyqJournalQuestionId,
  pyqJournalQuestionId
} from '@/lib/pyq-session';
import { GATE_2027_BLUEPRINT } from '@/lib/gate-2027';
import type {
  MarkDecision,
  Outcome,
  PatternRow,
  PyqAttemptRow,
  QuestionRow,
  ReattemptRow,
  ReattemptStage
} from '@/types';
import {
  computeReadinessScore,
  readinessEvidenceCounts
} from '../../supabase/functions/_shared/readiness-score';

function question(o: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: o.id ?? 'q',
    user_id: 'u',
    session_id: null,
    subject: 'Discrete Mathematics',
    subject_id: 'discrete-mathematics',
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
    source_pyq_attempt_id: o.source_pyq_attempt_id ?? null,
    created_at: '2026-07-18T00:00:00.000Z',
    ...o
  };
}

function attempt(
  id: string,
  decision: MarkDecision,
  correct: boolean | null,
  overrides: Partial<PyqAttemptRow> = {}
): PyqAttemptRow {
  return {
    id,
    user_id: 'u',
    pyq_session_id: null,
    question_uid: `bank-${id}`,
    subject: 'Discrete Mathematics',
    subject_id: 'discrete-mathematics',
    year: 2026,
    attempt_number: 1,
    selected_answer: decision === 'SKIP' ? null : 'A',
    correct_answer: 'A',
    capture_version: 2,
    question_snapshot: null,
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: decision,
    mark_correct: correct,
    question_started_at: null,
    time_spent_ms: null,
    time_spent_sec: 30,
    bank_version: 'test',
    attempted_at: `2026-07-18T00:00:${String(id.length).padStart(2, '0')}.000Z`,
    ...overrides
  };
}

function reattempt(stage: ReattemptStage): ReattemptRow {
  return {
    id: `r-${stage}-${Math.random()}`,
    user_id: 'u',
    question_id: 'q',
    scheduled_date: '2000-01-01',
    stage,
    history: [],
    created_at: '2026-07-18T00:00:00.000Z'
  };
}

function pattern(name: string, subject = 'Discrete Mathematics'): PatternRow {
  return {
    id: `p-${name}`,
    user_id: 'u',
    name,
    subject,
    count: 1,
    is_reflexed: false,
    mastery_level: 0,
    first_seen_at: '2026-07-18T00:00:00.000Z'
  };
}

describe('official 2027 blueprint', () => {
  it('encodes the primary-source paper shape and exact section total', () => {
    expect(GATE_2027_BLUEPRINT.durationMinutes).toBe(180);
    expect(GATE_2027_BLUEPRINT.questionCount).toBe(65);
    expect(GATE_2027_BLUEPRINT.totalMarks).toBe(100);
    expect(GATE_2027_BLUEPRINT.sectionMarks).toEqual({
      generalAptitude: 15,
      engineeringMathematics: 13,
      coreSubject: 72
    });
    expect(Object.values(GATE_2027_BLUEPRINT.sectionMarks).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('sub-scores', () => {
  it('coverage saturates at the target', () => {
    expect(coverage(0)).toBe(0);
    expect(coverage(TARGET_PATTERN_LIBRARY / 2)).toBeCloseTo(0.5, 3);
    expect(coverage(TARGET_PATTERN_LIBRARY)).toBe(1);
    expect(coverage(TARGET_PATTERN_LIBRARY * 2)).toBe(1);
  });

  it('retention is 0 with no re-attempts and 1 when all are stabilised', () => {
    expect(retention([])).toBe(0);
    expect(retention([reattempt('D3'), reattempt('D10')])).toBe(0);
    expect(retention([reattempt('D30'), reattempt('MASTERED')])).toBe(1);
  });

  it('calibration uses correct/wrong events and includes uncertain answers', () => {
    const ledger = normalizeAttemptEvidence({
      attempts: [
        attempt('a', 'MARK', true),
        attempt('b', 'FIFTY_FIFTY', false),
        attempt('c', 'SKIP', null)
      ],
      questions: []
    });
    expect(calibration(ledger.events)).toBe(0.5);
    expect(ledger.counts.uncertain).toBe(1);
  });

  it('surface inverts open re-attempts against the baseline', () => {
    expect(surface(0)).toBe(1);
    expect(surface(BASELINE_OPEN_SURFACE / 2)).toBeCloseTo(0.5, 3);
    expect(surface(BASELINE_OPEN_SURFACE)).toBe(0);
  });
});

describe('authoritative exact-once evidence', () => {
  it('counts attempt-only correct, wrong, skip, uncertain, and ungraded receipts', () => {
    const result = computeReadiness({
      questions: [],
      pyqAttempts: [
        attempt('a', 'MARK', true),
        attempt('b', 'MARK', false),
        attempt('c', 'SKIP', null),
        attempt('d', 'FIFTY_FIFTY', true),
        attempt('e', 'FIFTY_FIFTY', null)
      ],
      reattempts: [],
      patterns: []
    });
    expect(result.counts).toMatchObject({
      attempts: 5,
      correct: 2,
      wrong: 1,
      skipped: 1,
      ungraded: 1,
      uncertain: 2,
      legacyJournalAttempts: 0,
      markedDecisions: 3,
      markedCorrect: 2
    });
  });

  it('suppresses explicit, current-seed, and legacy-seed Journal mirrors', () => {
    const source = attempt('source-attempt', 'MARK', false);
    const result = computeReadiness({
      pyqAttempts: [source],
      questions: [
        question({
          id: pyqJournalQuestionId(source.id),
          mark_decision: 'MARK',
          mark_correct: false
        }),
        question({
          id: legacyPyqJournalQuestionId(source.id),
          mark_decision: 'MARK',
          mark_correct: false
        }),
        question({
          id: 'random-linked',
          source_pyq_attempt_id: source.id,
          mark_decision: 'MARK',
          mark_correct: false
        })
      ],
      reattempts: [],
      patterns: []
    });
    expect(result.counts.attempts).toBe(1);
    expect(result.counts.wrong).toBe(1);
    expect(result.counts.legacyJournalAttempts).toBe(0);
  });

  it('uses the same deterministic Journal de-duplication in the weekly scorer', () => {
    const source = attempt('weekly-source', 'FIFTY_FIFTY', true);
    const counts = readinessEvidenceCounts(
      [source],
      [
        {
          id: pyqJournalQuestionId(source.id),
          source_pyq_attempt_id: null,
          mark_decision: 'FIFTY_FIFTY',
          mark_correct: true
        },
        {
          id: legacyPyqJournalQuestionId(source.id),
          source_pyq_attempt_id: null,
          mark_decision: 'FIFTY_FIFTY',
          mark_correct: true
        },
        {
          id: 'independent-journal',
          source_pyq_attempt_id: null,
          mark_decision: 'SKIP',
          mark_correct: null
        }
      ]
    );
    expect(counts).toMatchObject({
      attempts: 2,
      correct: 1,
      skipped: 1,
      uncertain: 1,
      legacyJournalAttempts: 1
    });
  });

  it('keeps a truly unlinked legacy Journal decision as compatibility evidence', () => {
    const result = computeReadiness({
      pyqAttempts: [],
      questions: [question({ id: 'manual', mark_decision: 'MARK', mark_correct: true })],
      reattempts: [],
      patterns: []
    });
    expect(result.counts.attempts).toBe(1);
    expect(result.counts.correct).toBe(1);
    expect(result.counts.legacyJournalAttempts).toBe(1);
  });
});

describe('computeReadiness', () => {
  it('empty inputs do not receive free mistake-surface points', () => {
    const result = computeReadiness({
      questions: [],
      pyqAttempts: [],
      reattempts: [],
      patterns: []
    });
    expect(result).toMatchObject({
      score: 0,
      coverage: 0,
      retention: 0,
      calibration: 0,
      surface: 0,
      confidence: 'early'
    });
  });

  it('keeps the evidence-tempered composite deterministic', () => {
    const patterns = Array.from({ length: 200 }, (_, index) => pattern(`p${index}`));
    const reattempts = [
      reattempt('D30'),
      reattempt('D30'),
      reattempt('MASTERED'),
      reattempt('D3')
    ];
    const attempts = [
      attempt('a', 'MARK', true),
      attempt('b', 'MARK', true),
      attempt('c', 'MARK', false),
      attempt('d', 'MARK', false)
    ];
    const result = computeReadiness({ questions: [], pyqAttempts: attempts, reattempts, patterns });
    expect(result.coverage).toBeCloseTo(0.5, 3);
    expect(result.retention).toBeCloseTo(0.375, 3);
    expect(result.calibration).toBeCloseTo(0.2, 3);
    expect(result.surface).toBeCloseTo(0.188, 3);
    expect(result.score).toBe(33);
  });

  it('matches the weekly edge-function scorer', () => {
    const attempts = Array.from({ length: 20 }, (_, index) =>
      attempt(
        `attempt-${index}`,
        index === 19 ? 'FIFTY_FIFTY' : 'MARK',
        index < 14 ? true : false
      )
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
    const client = computeReadiness({ questions: [], pyqAttempts: attempts, reattempts, patterns });
    const edge = computeReadinessScore(attempts, [], patterns.length, reattempts, '2026-08-22');
    expect(edge).toBe(client.score);
  });
});

describe('components and subjects', () => {
  it('keeps weights at one and contributions near the total', () => {
    expect(WEIGHTS.coverage + WEIGHTS.retention + WEIGHTS.calibration + WEIGHTS.surface).toBe(1);
    const result = computeReadiness({
      questions: [],
      pyqAttempts: [attempt('a', 'MARK', true), attempt('b', 'MARK', false)],
      reattempts: [reattempt('D30'), reattempt('D3')],
      patterns: [pattern('a'), pattern('b')]
    });
    const sum = readinessComponents(result).reduce(
      (total, component) => total + component.contribution,
      0
    );
    expect(Math.abs(sum - result.score)).toBeLessThanOrEqual(3);
  });

  it('canonicalizes legacy subject aliases before bucketing evidence', () => {
    const networkAttempt = attempt('network', 'MARK', true, {
      subject: 'Computer Network',
      subject_id: null
    });
    const rows = computeReadinessBySubject(
      {
        questions: [],
        pyqAttempts: [networkAttempt],
        reattempts: [],
        patterns: [pattern('routing', 'Computer Network')]
      },
      ['Computer Networks', 'Algorithms']
    );
    expect(rows[0].subject).toBe('Computer Networks');
    expect(rows[0].hasSignal).toBe(true);
    expect(rows[0].counts.attempts).toBe(1);
    expect(rows[0].counts.patterns).toBe(1);
    expect(rows[1].hasSignal).toBe(false);
  });
});

describe('nextMoves', () => {
  it('prioritises calibration when graded accuracy is very low', () => {
    const attempts = Array.from({ length: 8 }, (_, index) =>
      attempt(`db-${index}`, 'MARK', index === 0, { subject: 'Databases' })
    );
    const inputs = { questions: [], pyqAttempts: attempts, reattempts: [], patterns: [] };
    const perSubject = computeReadinessBySubject(inputs, ['Databases']);
    const moves = nextMoves(computeReadiness(inputs), perSubject);
    expect(moves[0]).toMatchObject({ kind: 'calibrate', subject: 'Databases', urgency: 'high' });
  });
});
