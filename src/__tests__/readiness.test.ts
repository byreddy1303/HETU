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
import { legacyPyqJournalQuestionId, pyqJournalQuestionId } from '@/lib/pyq-session';
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
  computeReadinessScoreResult,
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

function clientEvidenceCounts(attempts: PyqAttemptRow[], questions: QuestionRow[]) {
  const counts = normalizeAttemptEvidence({ attempts, questions }).counts;
  return {
    attempts: counts.total,
    correct: counts.correct,
    wrong: counts.wrong,
    skipped: counts.skipped,
    ungraded: counts.ungraded,
    uncertain: counts.uncertain,
    legacyJournalAttempts: counts.legacyJournal
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

  it('mirrors the bounded random-id legacy resolver in the weekly scorer', () => {
    const legacy = attempt('legacy-weekly', 'MARK', false, {
      capture_version: 1,
      subject: 'Computer Network',
      subject_id: null,
      pyq_session_id: 'legacy-session',
      attempted_at: '2026-07-18T05:30:00.000Z',
      time_spent_sec: 42
    });
    const mirror = question({
      id: 'random-legacy-mirror',
      session_id: 'legacy-session',
      subject: 'Computer Networks',
      subject_id: 'computer-networks',
      source_year: 2026,
      source_ref: 'GATE PYQ · 2026',
      created_at: '2026-07-18T11:00:00+05:30',
      time_spent_sec: 42,
      mark_decision: 'MARK',
      mark_correct: false
    });

    const exactMirror = readinessEvidenceCounts([legacy], [mirror]);
    expect(exactMirror).toEqual(clientEvidenceCounts([legacy], [mirror]));
    expect(exactMirror).toMatchObject({
      attempts: 1,
      wrong: 1,
      legacyJournalAttempts: 0
    });

    // Two compatible receipts make the relationship ambiguous, so the
    // Journal row remains independent compatibility evidence.
    const ambiguousAttempts = [legacy, { ...legacy, id: 'legacy-weekly-2' }];
    const ambiguous = readinessEvidenceCounts(ambiguousAttempts, [mirror]);
    expect(ambiguous).toEqual(clientEvidenceCounts(ambiguousAttempts, [mirror]));
    expect(ambiguous).toMatchObject({
      attempts: 3,
      wrong: 3,
      legacyJournalAttempts: 1
    });
  });

  it('requires GATE to be a standalone source token in the weekly legacy resolver', () => {
    const legacy = attempt('source-boundary', 'MARK', true, {
      capture_version: 1,
      subject: 'Algorithms',
      attempted_at: '2026-07-18T05:30:00.000Z'
    });
    const coincidentalSubstring = question({
      id: 'aggregate-not-gate',
      source_ref: 'Aggregate exercises',
      subject: 'Algorithms',
      created_at: legacy.attempted_at,
      time_spent_sec: legacy.time_spent_sec,
      mark_decision: 'MARK',
      mark_correct: true
    });
    const explicitToken = question({
      ...coincidentalSubstring,
      id: 'gate-token',
      source_ref: '[GATE] PYQ'
    });

    const substringCounts = readinessEvidenceCounts([legacy], [coincidentalSubstring]);
    expect(substringCounts).toEqual(clientEvidenceCounts([legacy], [coincidentalSubstring]));
    expect(substringCounts).toMatchObject({
      attempts: 2,
      correct: 2,
      legacyJournalAttempts: 1
    });
    const tokenCounts = readinessEvidenceCounts([legacy], [explicitToken]);
    expect(tokenCounts).toEqual(clientEvidenceCounts([legacy], [explicitToken]));
    expect(tokenCounts).toMatchObject({
      attempts: 1,
      correct: 1,
      legacyJournalAttempts: 0
    });
  });

  it('does not infer a legacy source link from matching unknown subject labels', () => {
    const legacy = attempt('unknown-subject', 'MARK', false, {
      capture_version: 1,
      subject: 'Legacy Elective',
      subject_id: null,
      attempted_at: '2026-07-18T05:30:00.000Z'
    });
    const customJournal = question({
      id: 'unknown-subject-journal',
      source_ref: 'GATE practice',
      subject: 'Legacy Elective',
      subject_id: null,
      created_at: legacy.attempted_at,
      time_spent_sec: legacy.time_spent_sec,
      mark_decision: legacy.mark_decision,
      mark_correct: legacy.mark_correct
    });

    const counts = readinessEvidenceCounts([legacy], [customJournal]);
    expect(counts).toEqual(clientEvidenceCounts([legacy], [customJournal]));
    expect(counts).toMatchObject({
      attempts: 2,
      wrong: 2,
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

  it('keeps outcome-only legacy Journal evidence in the weekly scorer', () => {
    const rows = (
      [
        ['R', null, null],
        ['RBS', null, null],
        ['RBG', null, null],
        ['W-C', null, null],
        ['W-E', null, null],
        ['W-R', null, null],
        // Missing fields fall back independently while explicit fields win.
        ['R', 'MARK', null],
        ['W-C', 'FIFTY_FIFTY', null],
        // Explicit fields remain authoritative over the legacy outcome.
        ['R', 'MARK', false]
      ] as const
    ).map(([outcome, mark_decision, mark_correct], index) =>
      question({
        id: `legacy-outcome-${index}`,
        outcome,
        mark_decision,
        mark_correct,
        source_pyq_attempt_id: null
      })
    );

    const edgeCounts = readinessEvidenceCounts([], rows);
    expect(edgeCounts).toEqual(clientEvidenceCounts([], rows));
    expect(edgeCounts).toEqual({
      attempts: 9,
      correct: 4,
      wrong: 5,
      skipped: 0,
      ungraded: 0,
      uncertain: 2,
      legacyJournalAttempts: 9
    });
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
    const reattempts = [reattempt('D30'), reattempt('D30'), reattempt('MASTERED'), reattempt('D3')];
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
      attempt(`attempt-${index}`, index === 19 ? 'FIFTY_FIFTY' : 'MARK', index < 14 ? true : false)
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
    const client = computeReadiness({
      questions: [],
      pyqAttempts: attempts,
      reattempts,
      patterns,
      asOfDate: '2026-08-22'
    });
    const edge = computeReadinessScore(attempts, [], patterns.length, reattempts, '2026-08-22');
    expect(edge).toBe(client.score);

    const edgeResult = computeReadinessScoreResult(
      attempts,
      [],
      patterns.length,
      reattempts,
      '2026-08-22'
    );
    expect(edgeResult.components).toEqual({
      coverage: client.coverage,
      retention: client.retention,
      calibration: client.calibration,
      surface: client.surface
    });
    expect(edgeResult.counts).toMatchObject({
      attempts: client.counts.attempts,
      correct: client.counts.correct,
      wrong: client.counts.wrong,
      skipped: client.counts.skipped,
      ungraded: client.counts.ungraded,
      uncertain: client.counts.uncertain,
      legacyJournalAttempts: client.counts.legacyJournalAttempts,
      patterns: client.counts.patterns,
      eligibleReattempts: client.counts.eligibleReattempts,
      stabilised: client.counts.stabilised,
      openReattempts: client.counts.openReattempts
    });
  });

  it('uses the supplied learner-local date for overall and subject eligibility', () => {
    const dueTomorrow = {
      ...reattempt('D30'),
      scheduled_date: '2026-08-23'
    };
    const inputs = {
      questions: [question()],
      pyqAttempts: [],
      reattempts: [dueTomorrow],
      patterns: [],
      asOfDate: '2026-08-22'
    };

    const beforeDue = computeReadiness(inputs);
    const subjectBeforeDue = computeReadinessBySubject(inputs, ['Discrete Mathematics'])[0];
    expect(beforeDue.counts).toMatchObject({ eligibleReattempts: 0, stabilised: 0 });
    expect(subjectBeforeDue.counts).toMatchObject({ eligibleReattempts: 0, stabilised: 0 });
    expect(computeReadiness({ ...inputs, asOfDate: '2026-08-23' }).counts).toMatchObject({
      eligibleReattempts: 1,
      stabilised: 1
    });
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
