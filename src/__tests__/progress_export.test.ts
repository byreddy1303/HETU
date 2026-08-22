import { afterEach, describe, expect, it } from 'vitest';
import { db, SYNCED_TABLES, table } from '@/lib/db';
import { emptyDayPlan } from '@/lib/planner-storage';
import { topicProgressId } from '@/stores/topic-progress';
import {
  buildProgressReport,
  collectProgressReport,
  progressReportCsv,
  type ProgressData,
  type ProgressReport
} from '@/lib/progress-export';
import type {
  PatternRow,
  PyqAttemptRow,
  QuestionRow,
  ReattemptRow,
  SessionRow
} from '@/types';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function session(): SessionRow {
  return {
    id: 'session-1',
    user_id: USER_ID,
    kind: 'focused',
    date: '2026-08-01',
    subject: 'Databases',
    target_duration_min: 60,
    actual_duration_min: 55,
    insight: null,
    sadhana_done: false,
    interruptions_count: 0,
    created_at: '2026-08-01T06:00:00.000Z'
  };
}

function question(id: string, outcome: QuestionRow['outcome']): QuestionRow {
  return {
    id,
    user_id: USER_ID,
    session_id: 'session-1',
    subject: 'Databases',
    subtopic: 'Transactions',
    source_year: 2025,
    source_ref: 'GATE PYQ 2025',
    question_text: null,
    answer_text: null,
    image_url: null,
    time_spent_sec: 120,
    target_time_sec: 120,
    outcome,
    pattern_name: 'Conflict serializability',
    trigger_sentence: null,
    root_cause: outcome === 'R' ? null : 'concept',
    mark_decision: 'MARK',
    mark_correct: outcome === 'R',
    created_at: '2026-08-01T06:10:00.000Z'
  };
}

function pattern(): PatternRow {
  return {
    id: 'pattern-1',
    user_id: USER_ID,
    name: 'Conflict serializability',
    subject: 'Databases',
    count: 2,
    is_reflexed: true,
    mastery_level: 1,
    first_seen_at: '2026-08-01T06:10:00.000Z'
  };
}

function reattempt(): ReattemptRow {
  return {
    id: 'reattempt-1',
    user_id: USER_ID,
    question_id: 'question-2',
    scheduled_date: '2026-08-02',
    stage: 'MASTERED',
    history: [{ date: '2026-08-03', result: 'clean', timeSpent: 80 }],
    created_at: '2026-08-01T06:15:00.000Z'
  };
}

function pyqAttempt(
  id: string,
  overrides: Partial<PyqAttemptRow> = {}
): PyqAttemptRow {
  return {
    id,
    user_id: USER_ID,
    pyq_session_id: null,
    question_uid: `bank-${id}`,
    subject: 'Databases',
    subject_id: 'databases',
    year: 2026,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'A',
    capture_version: 3,
    question_snapshot: null,
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: true,
    question_started_at: '2026-08-01T06:00:00.000Z',
    time_spent_ms: 30_000,
    time_spent_sec: 30,
    bank_version: 'test',
    attempted_at: '2026-08-01T06:00:30.000Z',
    question_type: 'MCQ',
    question_marks: 2,
    score_thirds: 6,
    scoring_status: 'scored',
    scoring_version: 1,
    reattempt_id: null,
    reattempt_round: null,
    round_attempt_number: null,
    ...overrides
  };
}

function progressData(): ProgressData {
  const plannerDay = emptyDayPlan('2026-08-01');
  plannerDay.sessions.push({
    id: 'plan-session-1',
    subject: 'Databases',
    durationMin: 90,
    mode: 'Problem Solving',
    priority: 'P1 Critical',
    target: 'Transactions'
  });
  plannerDay.review.completionPct = 80;

  return {
    sessions: [session()],
    questions: [question('question-1', 'R'), question('question-2', 'W-C')],
    patterns: [pattern()],
    reattempts: [reattempt()],
    formulas: [],
    triggerPhrases: [],
    weeklyReviews: [],
    interruptionLogs: [],
    pyqSessions: [],
    pyqAttempts: [],
    mocks: [],
    plannerDays: [plannerDay],
    topicCompletions: {
      [topicProgressId('Databases', 'ER Model')]: '2026-08-01T12:00:00.000Z'
    }
  };
}

function metric(report: ProgressReport, component: string, name: string): string | number {
  const found = report.metrics.find((row) => row.component === component && row.metric === name);
  if (!found) throw new Error(`missing ${component}/${name}`);
  return found.value;
}

describe('progress report export', () => {
  afterEach(async () => {
    await Promise.all(SYNCED_TABLES.map((name) => table(name).clear()));
    localStorage.clear();
  });

  it('summarizes every progress component with numeric spreadsheet values', () => {
    const report = buildProgressReport(progressData(), {
      learnerName: 'Kalyan',
      generatedAt: '2026-08-08T10:00:00.000Z'
    });

    expect(metric(report, 'Sessions', 'Sessions completed')).toBe(1);
    expect(metric(report, 'Journal', 'Clean solve rate')).toBe(50);
    expect(metric(report, 'Planner', 'Study blocks planned')).toBe(1);
    expect(metric(report, 'Patterns', 'Reflexed patterns')).toBe(1);
    expect(metric(report, 'Re-attempts', 'Clean review rate')).toBe(100);
    expect(metric(report, 'Syllabus tracker', 'Databases topics completed')).toBe(1);
    expect(metric(report, 'Subject: Databases', 'Clean solve rate')).toBe(50);

    const components = new Set(report.metrics.map((row) => row.component));
    expect([...components]).toEqual(
      expect.arrayContaining([
        'Sessions',
        'Journal',
        'Planner',
        'Mock tests',
        'PYQ practice',
        'Patterns',
        'Re-attempts',
        'Weekly review',
        'Heatmap',
        'Calibration',
        'Readiness',
        'Syllabus tracker',
        'Trigger drill',
        'Formulas',
        'Focus',
        'Subject: Databases'
      ])
    );
  });

  it('emits a BOM CSV, keeps numbers numeric, and neutralizes spreadsheet formulas', () => {
    const report = buildProgressReport(progressData(), {
      learnerName: '=IMPORTXML("https://example.test")',
      generatedAt: '2026-08-08T10:00:00.000Z'
    });
    const csv = progressReportCsv(report);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=IMPORTXML(""https://example.test"")"');
    expect(csv).toContain('"Journal","Clean solve rate",50,"%"');
  });

  it('exports exact attempt outcomes, third-mark totals, coverage, and readiness version', () => {
    const data = progressData();
    data.questions = [];
    data.pyqAttempts = [
      pyqAttempt('correct'),
      pyqAttempt('wrong-uncertain', {
        mark_decision: 'FIFTY_FIFTY',
        mark_correct: false,
        question_marks: 1,
        score_thirds: -1
      }),
      pyqAttempt('skip', {
        mark_decision: 'SKIP',
        mark_correct: null,
        selected_answer: null,
        question_marks: 1,
        score_thirds: 0
      }),
      pyqAttempt('ungraded', {
        mark_correct: null,
        question_marks: null,
        score_thirds: null,
        scoring_status: 'unscorable'
      })
    ];

    const report = buildProgressReport(data, {
      learnerName: 'Kalyan',
      generatedAt: '2026-08-08T10:00:00.000Z'
    });
    expect(metric(report, 'PYQ practice', 'Immutable attempt receipts')).toBe(4);
    expect(metric(report, 'PYQ practice', 'Correct attempts')).toBe(1);
    expect(metric(report, 'PYQ practice', 'Wrong attempts')).toBe(1);
    expect(metric(report, 'PYQ practice', 'Skipped attempts')).toBe(1);
    expect(metric(report, 'PYQ practice', 'Ungraded attempts')).toBe(1);
    expect(metric(report, 'PYQ practice', 'Uncertain decisions')).toBe(1);
    expect(metric(report, 'PYQ practice', 'Exactly scored receipts')).toBe(3);
    expect(metric(report, 'PYQ practice', 'Exact earned score')).toBe(1.67);
    expect(metric(report, 'PYQ practice', 'Exact scorable maximum')).toBe(4);
    expect(metric(report, 'PYQ practice', 'Exact scoring coverage')).toBe(75);
    expect(metric(report, 'Readiness', 'Calculation version')).toBe(2);
  });

  it('collects only rows belonging to the requested user', async () => {
    await db.questions.bulkPut([
      { ...question('owned-question', 'R'), sync_status: 'synced' },
      {
        ...question('other-question', 'W-C'),
        user_id: '22222222-2222-4222-8222-222222222222',
        sync_status: 'synced'
      }
    ]);

    const report = await collectProgressReport(USER_ID, 'Kalyan');
    expect(metric(report, 'Journal', 'Questions logged')).toBe(1);
    expect(metric(report, 'Journal', 'Clean solve rate')).toBe(100);
  });
});
