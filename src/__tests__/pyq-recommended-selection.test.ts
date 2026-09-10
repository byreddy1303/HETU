import { describe, expect, it } from 'vitest';
import type { PyqBenchmarkPaperManifest } from '@/lib/pyq-benchmark';
import type { PyqQuestion } from '@/lib/pyq';
import {
  PYQ_RECOMMENDATION_PRESETS,
  recommendPyqSelection,
  type PyqRecommendationCohort
} from '@/lib/pyq-recommended-selection';
import type { PyqAttemptRow } from '@/types';

function question(id: string, overrides: Partial<PyqQuestion> = {}): PyqQuestion {
  return {
    id,
    bookSlug: 'gate-cse',
    year: 2025,
    set: 1,
    number: id,
    paperLabel: 'GATE CSE 2025 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    topic: 'Shortest paths',
    topicSlug: 'shortest-paths',
    subtopics: [],
    marks: 1,
    type: 'MCQ',
    answer: 'A',
    tolerance: null,
    answerStatus: 'available',
    html: `<p>${id}</p>`,
    sourceUrl: `https://example.test/${id}`,
    answerSource: null,
    ...overrides
  };
}

function attempt(questionUid: string, overrides: Partial<PyqAttemptRow> = {}): PyqAttemptRow {
  return {
    id: `attempt-${questionUid}`,
    user_id: 'user-1',
    pyq_session_id: 'session-1',
    question_uid: questionUid,
    subject: 'Algorithms',
    subject_id: null,
    year: 2025,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'A',
    capture_version: 3,
    question_snapshot: null,
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: true,
    confidence: 'high',
    question_started_at: '2026-08-30T10:00:00.000Z',
    time_spent_ms: 30_000,
    time_spent_sec: 30,
    bank_version: 'bank-test',
    attempted_at: '2026-08-30T10:00:30.000Z',
    question_type: 'MCQ',
    question_marks: 1,
    score_thirds: 3,
    scoring_status: 'scored',
    scoring_version: 1,
    reattempt_id: null,
    reattempt_round: null,
    round_attempt_number: null,
    ...overrides
  };
}

function benchmark(
  id: string,
  questionUids: string[],
  overrides: Partial<PyqBenchmarkPaperManifest> = {}
): PyqBenchmarkPaperManifest {
  return {
    id,
    bookSlug: 'gate-cse',
    paperLabel: 'GATE CSE 2025 Set 1',
    year: 2025,
    set: 1,
    questionCount: questionUids.length,
    maxMarks: questionUids.length,
    questionUids,
    ...overrides
  };
}

describe('recommended PYQ selection', () => {
  it('publishes the seven named product presets', () => {
    expect(Object.values(PYQ_RECOMMENDATION_PRESETS).map(({ label }) => label)).toEqual([
      'Learn',
      'Diagnose',
      'Repair',
      'Speed',
      'Transfer',
      'Mixed GATE',
      'Full Paper'
    ]);
    expect(PYQ_RECOMMENDATION_PRESETS.repair.defaultCohorts).toEqual([
      'wrong',
      'high-confidence-wrong',
      'guessed-correct',
      'due'
    ]);
  });

  it('is seeded, input-order independent, and balances every requested dimension', () => {
    const questions = Array.from({ length: 12 }, (_, index) => {
      const group = index % 2;
      return question(`balanced-${index}`, {
        subject: group === 0 ? 'Algorithms' : 'Databases',
        subjectSlug: group === 0 ? 'algorithms' : 'databases',
        topic: group === 0 ? 'Graphs' : 'Transactions',
        topicSlug: group === 0 ? 'graphs' : 'transactions',
        year: group === 0 ? 2024 : 2025,
        marks: group === 0 ? 1 : 2
      });
    });

    const first = recommendPyqSelection({
      questions,
      preset: 'diagnose',
      requestedCount: 4,
      seed: 'weekly-set-42'
    });
    const reordered = recommendPyqSelection({
      questions: [...questions].reverse(),
      preset: 'diagnose',
      requestedCount: 4,
      seed: 'weekly-set-42'
    });
    const anotherSeed = recommendPyqSelection({
      questions,
      preset: 'diagnose',
      requestedCount: 4,
      seed: 'weekly-set-43'
    });

    expect(reordered.questionUids).toEqual(first.questionUids);
    expect(anotherSeed.questionUids).not.toEqual(first.questionUids);
    expect(first.preflight.distribution).toEqual({
      subject: { algorithms: 2, databases: 2 },
      topic: { graphs: 2, transactions: 2 },
      year: { '2024': 2, '2025': 2 },
      marks: { '1': 2, '2': 2 }
    });
    expect(first.preflight.matchedHistory).toEqual({ unseen: 12, seen: 0 });
    expect(first.preflight.selectedHistory).toEqual({ unseen: 4, seen: 0 });
    expect(first.preflight.selectedCohorts).toMatchObject({ all: 4, unseen: 4 });
    expect(first.preflight.reproducibilitySeed).toBe('weekly-set-42');
  });

  it('uses disclosed learning priority to break equivalent strata before the seeded tie-break', () => {
    const questions = [question('ordinary-a'), question('priority-target'), question('ordinary-b')];
    const priorityByQuestionUid = {
      'priority-target': {
        weakness: 0.75,
        lapseCount: 3,
        daysSinceAttempt: 24,
        weeklyFocus: true,
        plannerPriority: 90
      }
    };

    const first = recommendPyqSelection({
      questions,
      preset: 'diagnose',
      requestedCount: 1,
      seed: 'priority-proof',
      priorityByQuestionUid
    });
    const reordered = recommendPyqSelection({
      questions: [...questions].reverse(),
      preset: 'diagnose',
      requestedCount: 1,
      seed: 'priority-proof',
      priorityByQuestionUid
    });

    expect(first.questionUids).toEqual(['priority-target']);
    expect(reordered.questionUids).toEqual(first.questionUids);
    expect(first.priorityReasonsByQuestionUid).toEqual({
      'priority-target': [
        '75% weakness signal',
        '3 recovery lapses',
        '24d since latest attempt',
        'weekly focus',
        'approved Planner prescription'
      ]
    });
  });

  it('derives all learning cohorts from the latest receipt and explicit UID sets', () => {
    const questions = [
      question('unseen'),
      question('wrong'),
      question('high-wrong'),
      question('guessed'),
      question('slow'),
      question('due'),
      question('transfer', { bookSlug: 'isro-cs-overlap', paperLabel: 'ISRO 2024' }),
      question('exact')
    ];
    const attempts = [
      attempt('wrong', { mark_correct: false, confidence: 'low' }),
      attempt('high-wrong', {
        id: 'high-wrong-old',
        mark_correct: true,
        attempted_at: '2026-08-20T10:00:00.000Z'
      }),
      attempt('high-wrong', {
        id: 'high-wrong-latest',
        attempt_number: 2,
        mark_correct: false,
        confidence: 'high',
        attempted_at: '2026-08-30T10:00:00.000Z'
      }),
      attempt('guessed', {
        mark_correct: true,
        confidence: 'medium',
        mark_decision: 'FIFTY_FIFTY'
      }),
      attempt('slow', { mark_correct: true, time_spent_sec: 91 }),
      attempt('due')
    ];

    const select = (cohort: PyqRecommendationCohort, extra = {}) =>
      recommendPyqSelection({
        questions,
        attempts: [...attempts].reverse(),
        preset: 'diagnose' as const,
        cohorts: [cohort],
        requestedCount: 'all' as const,
        dueQuestionUids: ['due'],
        ...extra
      }).questionUids;

    expect(select('unseen')).toEqual(['exact', 'transfer', 'unseen']);
    expect(select('wrong')).toEqual(['high-wrong', 'wrong']);
    expect(select('high-confidence-wrong')).toEqual(['high-wrong']);
    expect(select('guessed-correct')).toEqual(['guessed']);
    expect(select('slow-correct')).toEqual(['slow']);
    expect(select('due')).toEqual(['due']);
    expect(select('transfer')).toEqual(['transfer']);
    expect(
      select('exact-uid', {
        exactQuestionUids: ['exact', 'wrong']
      })
    ).toEqual(['exact', 'wrong']);
  });

  it('treats an exact UID list as a hard subset before cohort matching', () => {
    const result = recommendPyqSelection({
      questions: [question('q1'), question('q2'), question('q3')],
      preset: 'learn',
      requestedCount: 'all',
      exactQuestionUids: ['q3', 'missing'],
      seed: 'exact-set'
    });

    expect(result.questionUids).toEqual(['q3']);
    expect(result.preflight).toMatchObject({
      exactMatchCount: 1,
      requestedCount: 2,
      selectableCount: 1,
      selectedCount: 1,
      missingExactUidCount: 1,
      shortfall: 1
    });
    expect(result.preflight.reasonChips.map(({ code }) => code)).toContain('exact-subset');
    expect(result.preflight.reasonChips.map(({ code }) => code)).toContain('missing-exact-uids');

    const intentionallyEmpty = recommendPyqSelection({
      questions: [question('q1')],
      preset: 'diagnose',
      cohorts: ['exact-uid'],
      requestedCount: 'all',
      exactQuestionUids: []
    });
    expect(intentionallyEmpty.questionUids).toEqual([]);
    expect(intentionallyEmpty.preflight.exactMatchCount).toBe(0);
  });

  it('keeps an explicitly approved slow-correct UID even under the Repair preset', () => {
    const slow = question('slow-exact');
    const result = recommendPyqSelection({
      questions: [slow, question('unrelated-wrong')],
      attempts: [
        attempt('slow-exact', { mark_correct: true, time_spent_sec: 120 }),
        attempt('unrelated-wrong', { mark_correct: false })
      ],
      preset: 'repair',
      exactQuestionUids: ['slow-exact'],
      requestedCount: 'all',
      seed: 'approved-repair'
    });

    expect(result.questionUids).toEqual(['slow-exact']);
    expect(result.cohorts).toEqual(['exact-uid']);
    expect(result.reasonsByQuestionUid['slow-exact']).toEqual(
      expect.arrayContaining(['slow-correct', 'exact-uid'])
    );
  });

  it('protects every question in a sealed benchmark and exposes reserve-driven shortfall', () => {
    const sealed = benchmark('paper-2025', ['paper-1', 'paper-2']);
    const result = recommendPyqSelection({
      questions: [
        question('paper-1'),
        question('paper-2', { marks: 2 }),
        question('practice-1', { marks: 1 }),
        question('practice-2', { marks: null })
      ],
      preset: 'diagnose',
      requestedCount: 3,
      seed: 'reserve-test',
      benchmarkPapers: [sealed],
      priorityByQuestionUid: {
        'paper-1': {
          weakness: 1,
          lapseCount: 10,
          weeklyFocus: true,
          plannerPriority: 100
        }
      }
    });

    expect(result.questionUids.sort()).toEqual(['practice-1', 'practice-2']);
    expect(result.preflight).toMatchObject({
      exactMatchCount: 4,
      requestedCount: 3,
      selectableCount: 2,
      selectedCount: 2,
      estimatedMinutes: 3.5,
      estimatedMarks: 1,
      knownMarksCount: 1,
      shortfall: 1,
      reserve: {
        protected: true,
        sealedPaperCount: 1,
        reservedQuestionCount: 2,
        matchedReservedCount: 2,
        excludedCount: 2,
        allowedCount: 0
      }
    });
    expect(result.preflight.reasonChips.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['sealed-reserve', 'shortfall'])
    );
  });

  it('stops protecting a benchmark after any prior exposure', () => {
    const paper = benchmark('paper-2025', ['paper-1', 'paper-2']);
    const result = recommendPyqSelection({
      questions: [question('paper-1'), question('paper-2')],
      attempts: [attempt('paper-1')],
      preset: 'diagnose',
      requestedCount: 'all',
      benchmarkPapers: [paper]
    });

    expect(result.questionUids).toEqual(['paper-1', 'paper-2']);
    expect(result.preflight.reserve).toMatchObject({
      sealedPaperCount: 0,
      reservedQuestionCount: 0,
      excludedCount: 0
    });
  });

  it('opens only the deliberately selected full paper and preserves official order', () => {
    const selectedPaper = benchmark('paper-selected', ['paper-2', 'missing', 'paper-1'], {
      questionCount: 3,
      maxMarks: 4
    });
    const otherPaper = benchmark('paper-other', ['other-1']);
    const result = recommendPyqSelection({
      questions: [
        question('paper-1'),
        question('paper-2', { marks: 2 }),
        question('other-1')
      ].reverse(),
      preset: 'full-paper',
      seed: 'paper-run-1',
      benchmarkPapers: [selectedPaper, otherPaper],
      fullPaper: selectedPaper
    });

    expect(result.questionUids).toEqual(['paper-2', 'paper-1']);
    expect(result.preflight).toMatchObject({
      exactMatchCount: 2,
      requestedCount: 3,
      selectableCount: 2,
      selectedCount: 2,
      estimatedMinutes: 4.5,
      estimatedMarks: 3,
      missingExactUidCount: 1,
      shortfall: 1,
      reserve: {
        sealedPaperCount: 2,
        reservedQuestionCount: 4,
        matchedReservedCount: 2,
        excludedCount: 0,
        allowedCount: 2
      }
    });
    expect(result.preflight.reproducibilitySeed).toBe('paper-run-1');
  });

  it('enforces requested scope and keeps Mixed GATE on the primary book', () => {
    const questions = [
      question('gate-match', { year: 2024, marks: 2 }),
      question('gate-old', { year: 2020, marks: 2 }),
      question('gate-other-marks', { year: 2024, marks: 1 }),
      question('isro-match', {
        bookSlug: 'isro-cs-overlap',
        paperLabel: 'ISRO 2024',
        year: 2024,
        marks: 2
      })
    ];
    const result = recommendPyqSelection({
      questions,
      preset: 'mixed-gate',
      requestedCount: 'all',
      scope: {
        subjectSlugs: ['algorithms'],
        topicSlugs: ['shortest-paths'],
        years: [2024],
        fromYear: 2022,
        toYear: 2025,
        marks: [2]
      }
    });

    expect(result.questionUids).toEqual(['gate-match']);
    expect(result.preflight.selectableDistribution).toEqual({
      subject: { algorithms: 1 },
      topic: { 'shortest-paths': 1 },
      year: { '2024': 1 },
      marks: { '2': 1 }
    });
  });
});
