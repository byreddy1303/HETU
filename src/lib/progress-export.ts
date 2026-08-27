import { SUBJECTS } from '@/lib/constants';
import { db } from '@/lib/db';
import { normalizeAttemptEvidence } from '@/lib/attempt-evidence';
import { GATE_2027_REGISTRY_VERSION } from '@/lib/gate-2027';
import { GATE_SCORING_VERSION } from '@/lib/gate-scoring';
import { loadAllDayPlans, type DayPlan } from '@/lib/planner-storage';
import { normalizeMockEvidence } from '@/lib/mocks';
import { computeReadiness, READINESS_CALCULATION_VERSION } from '@/lib/readiness';
import { aggregatePyqAttemptScores } from '@/lib/pyq-session';
import { official2027TopicsFor, type Official2027TopicSpec } from '@/lib/subtopics';
import {
  topicProgressId,
  useTopicProgressStore,
  type TopicCompletions
} from '@/stores/topic-progress';
import type {
  FormulaRow,
  InterruptionLogRow,
  MockTestRow,
  PatternRow,
  PyqAttemptRow,
  PyqSessionRow,
  QuestionRow,
  ReattemptRow,
  SessionRow,
  TriggerPhraseRow,
  WeeklyReviewRow
} from '@/types';

export const PROGRESS_REPORT_VERSION = 4;

export interface ProgressMetric {
  component: string;
  metric: string;
  value: string | number;
  unit: string;
}

export interface ProgressReport {
  version: number;
  generatedAt: string;
  learnerName: string;
  metrics: ProgressMetric[];
}

export interface ProgressData {
  sessions: SessionRow[];
  questions: QuestionRow[];
  patterns: PatternRow[];
  reattempts: ReattemptRow[];
  formulas: FormulaRow[];
  triggerPhrases: TriggerPhraseRow[];
  weeklyReviews: WeeklyReviewRow[];
  interruptionLogs: InterruptionLogRow[];
  pyqSessions: PyqSessionRow[];
  pyqAttempts: PyqAttemptRow[];
  mocks: MockTestRow[];
  plannerDays: DayPlan[];
  topicCompletions: TopicCompletions;
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round((numerator / denominator) * 100);
}

function officialTopicCompletedAt(
  completions: TopicCompletions,
  topic: Official2027TopicSpec
): string | null {
  return (
    topic.completionAliases
      .map((alias) => completions[topicProgressId(alias.subject, alias.topic)])
      .filter((completedAt): completedAt is string => Boolean(completedAt))
      .sort()
      .at(-1) ?? null
  );
}

/** Build a compact, spreadsheet-friendly view of every learner-facing progress area. */
export function buildProgressReport(
  data: ProgressData,
  {
    learnerName,
    generatedAt = new Date().toISOString()
  }: { learnerName: string; generatedAt?: string }
): ProgressReport {
  const metrics: ProgressMetric[] = [];
  const add = (component: string, metric: string, value: string | number, unit = '') => {
    metrics.push({ component, metric, value, unit });
  };

  const completedSessions = data.sessions.filter((row) => row.actual_duration_min !== null);
  add('Sessions', 'Sessions logged', data.sessions.length, 'count');
  add('Sessions', 'Sessions completed', completedSessions.length, 'count');
  add(
    'Sessions',
    'Study time',
    completedSessions.reduce((sum, row) => sum + (row.actual_duration_min ?? 0), 0),
    'minutes'
  );

  const cleanQuestions = data.questions.filter((row) => row.outcome === 'R').length;
  add('Journal', 'Questions logged', data.questions.length, 'count');
  add('Journal', 'Clean solves', cleanQuestions, 'count');
  add('Journal', 'Clean solve rate', percentage(cleanQuestions, data.questions.length), '%');
  add(
    'Journal',
    'Average solve time',
    data.questions.length === 0
      ? 0
      : round(
          data.questions.reduce((sum, row) => sum + row.time_spent_sec, 0) / data.questions.length
        ),
    'seconds'
  );
  for (const outcome of ['R', 'RBS', 'RBG', 'W-C', 'W-E', 'W-R'] as const) {
    add(
      'Journal',
      `Outcome ${outcome}`,
      data.questions.filter((row) => row.outcome === outcome).length,
      'count'
    );
  }

  const plannedSessions = data.plannerDays.flatMap((day) => day.sessions);
  add('Planner', 'Days planned', data.plannerDays.length, 'count');
  add('Planner', 'Study blocks planned', plannedSessions.length, 'count');
  add(
    'Planner',
    'Study time planned',
    plannedSessions.reduce((sum, row) => sum + row.durationMin, 0),
    'minutes'
  );
  add(
    'Planner',
    'Average day completion',
    data.plannerDays.length === 0
      ? 0
      : round(
          data.plannerDays.reduce((sum, day) => sum + day.review.completionPct, 0) /
            data.plannerDays.length
        ),
    '%'
  );

  const normalizedMocks = data.mocks.map((row) => normalizeMockEvidence(row));
  const qualifiedMocks = normalizedMocks.filter((row) => row.evidence_status === 'qualified');
  const qualifiedByDate = qualifiedMocks.sort((a, b) => a.test_date.localeCompare(b.test_date));
  const latestQualifiedMock = qualifiedByDate.at(-1);
  const bestQualifiedMockPercent = qualifiedMocks.length
    ? Math.max(...qualifiedMocks.map((row) => percentage(row.total_marks, row.max_marks)))
    : 0;
  add('Mock tests', 'Mocks recorded', data.mocks.length, 'count');
  add('Mock tests', 'Qualified full-paper outcomes', qualifiedMocks.length, 'count');
  add(
    'Mock tests',
    'Supporting outcomes',
    normalizedMocks.filter((row) => row.evidence_status === 'supporting').length,
    'count'
  );
  add(
    'Mock tests',
    'Excluded outcomes',
    normalizedMocks.filter((row) => row.evidence_status === 'excluded').length,
    'count'
  );
  add('Mock tests', 'Best qualified score', bestQualifiedMockPercent, '%');
  add(
    'Mock tests',
    'Latest qualified score',
    latestQualifiedMock
      ? percentage(latestQualifiedMock.total_marks, latestQualifiedMock.max_marks)
      : 0,
    '%'
  );
  add(
    'Mock tests',
    'Questions attempted',
    data.mocks.reduce((sum, row) => sum + row.correct + row.wrong, 0),
    'count'
  );

  const attemptLedger = normalizeAttemptEvidence({
    attempts: data.pyqAttempts,
    questions: data.questions
  });
  const exactScores = aggregatePyqAttemptScores(data.pyqAttempts);
  add('PYQ practice', 'Practice sets', data.pyqSessions.length, 'count');
  add(
    'PYQ practice',
    'Completed practice sets',
    data.pyqSessions.filter((row) => row.status === 'completed').length,
    'count'
  );
  add('PYQ practice', 'Immutable attempt receipts', data.pyqAttempts.length, 'count');
  add(
    'PYQ practice',
    'Unique questions seen',
    new Set(data.pyqAttempts.map((row) => row.question_uid)).size,
    'count'
  );
  add('PYQ practice', 'Correct attempts', attemptLedger.counts.correct, 'count');
  add('PYQ practice', 'Wrong attempts', attemptLedger.counts.wrong, 'count');
  add('PYQ practice', 'Skipped attempts', attemptLedger.counts.skipped, 'count');
  add('PYQ practice', 'Ungraded attempts', attemptLedger.counts.ungraded, 'count');
  add('PYQ practice', 'Uncertain decisions', attemptLedger.counts.uncertain, 'count');
  add(
    'PYQ practice',
    'Graded accuracy',
    percentage(
      attemptLedger.counts.correct,
      attemptLedger.counts.correct + attemptLedger.counts.wrong
    ),
    '%'
  );
  add('PYQ practice', 'Exactly scored receipts', exactScores.coveredCount, 'count');
  add('PYQ practice', 'Exact scoring version', GATE_SCORING_VERSION, 'version');
  add('PYQ practice', 'Exact score thirds', exactScores.scoreThirds, 'third-marks');
  add('PYQ practice', 'Exact maximum thirds', exactScores.maxThirds, 'third-marks');
  add('PYQ practice', 'GATE-rule earned score', round(exactScores.scoreMarks, 2), 'marks');
  add('PYQ practice', 'GATE-rule scorable maximum', exactScores.maxMarks, 'marks');
  add(
    'PYQ practice',
    'Exact scoring coverage',
    percentage(exactScores.coveredCount, data.pyqAttempts.length),
    '%'
  );
  add(
    'PYQ practice',
    'Attempt time',
    round(data.pyqAttempts.reduce((sum, row) => sum + row.time_spent_sec, 0) / 60),
    'minutes'
  );

  add('Patterns', 'Patterns identified', data.patterns.length, 'count');
  add(
    'Patterns',
    'Reflexed patterns',
    data.patterns.filter((row) => row.is_reflexed).length,
    'count'
  );

  const reattemptHistory = data.reattempts.flatMap((row) => row.history);
  const cleanReattempts = reattemptHistory.filter((entry) => entry.result === 'clean').length;
  add('Re-attempts', 'Re-attempt cards', data.reattempts.length, 'count');
  add(
    'Re-attempts',
    'Open cards',
    data.reattempts.filter((row) => row.stage !== 'MASTERED').length,
    'count'
  );
  add(
    'Re-attempts',
    'Mastered cards',
    data.reattempts.filter((row) => row.stage === 'MASTERED').length,
    'count'
  );
  add('Re-attempts', 'Reviews completed', reattemptHistory.length, 'count');
  add(
    'Re-attempts',
    'Clean review rate',
    percentage(cleanReattempts, reattemptHistory.length),
    '%'
  );

  add('Weekly review', 'Reviews saved', data.weeklyReviews.length, 'count');
  add(
    'Weekly review',
    'Weeks with a focus action',
    data.weeklyReviews.filter((row) => Boolean(row.this_weeks_fix?.trim())).length,
    'count'
  );

  const heatmapQuestions = data.questions.filter((row) => row.outcome !== 'R');
  add('Heatmap', 'Mistake-surface questions', heatmapQuestions.length, 'count');
  for (const cause of ['concept', 'formula', 'reading', 'computation', 'strategy'] as const) {
    add(
      'Heatmap',
      `${cause[0].toUpperCase()}${cause.slice(1)} root causes`,
      heatmapQuestions.filter((row) => row.root_cause === cause).length,
      'count'
    );
  }

  add('Calibration', 'Exact-once evidence events', attemptLedger.counts.total, 'count');
  add('Calibration', 'Correct graded answers', attemptLedger.counts.correct, 'count');
  add('Calibration', 'Wrong graded answers', attemptLedger.counts.wrong, 'count');
  add('Calibration', 'Skipped decisions', attemptLedger.counts.skipped, 'count');
  add('Calibration', 'Uncertain decisions', attemptLedger.counts.uncertain, 'count');
  add(
    'Calibration',
    'Graded-answer accuracy',
    percentage(
      attemptLedger.counts.correct,
      attemptLedger.counts.correct + attemptLedger.counts.wrong
    ),
    '%'
  );

  const readiness = computeReadiness({
    questions: data.questions,
    pyqAttempts: data.pyqAttempts,
    reattempts: data.reattempts,
    patterns: data.patterns,
    asOfDate: generatedAt.slice(0, 10)
  });
  add('Readiness', 'Overall score', readiness.score, 'points');
  add('Readiness', 'Calculation version', READINESS_CALCULATION_VERSION, 'version');
  add('Readiness', 'Confidence', readiness.confidence);
  add('Readiness', 'Coverage', round(readiness.coverage * 100), '%');
  add('Readiness', 'Retention', round(readiness.retention * 100), '%');
  add('Readiness', 'Calibration', round(readiness.calibration * 100), '%');
  add('Readiness', 'Mistake surface', round(readiness.surface * 100), '%');

  let syllabusTopics = 0;
  let completedTopics = 0;
  let completedSubjects = 0;
  add('Syllabus tracker', 'Registry version', GATE_2027_REGISTRY_VERSION, 'version');
  for (const subject of SUBJECTS) {
    const topics = official2027TopicsFor(subject);
    const completed = topics.filter((topic) =>
      officialTopicCompletedAt(data.topicCompletions, topic)
    ).length;
    syllabusTopics += topics.length;
    completedTopics += completed;
    if (topics.length > 0 && completed === topics.length) completedSubjects += 1;
    add('Syllabus tracker', `${subject} topics completed`, completed, 'count');
    add('Syllabus tracker', `${subject} completion`, percentage(completed, topics.length), '%');
  }
  add('Syllabus tracker', 'Topics completed', completedTopics, 'count');
  add('Syllabus tracker', 'Total topics', syllabusTopics, 'count');
  add('Syllabus tracker', 'Overall completion', percentage(completedTopics, syllabusTopics), '%');
  add('Syllabus tracker', 'Subjects completed', completedSubjects, 'count');

  const drilledPhrases = data.triggerPhrases.filter((row) => row.reflex_time_ms !== null);
  add('Trigger drill', 'Trigger phrases', data.triggerPhrases.length, 'count');
  add('Trigger drill', 'Phrases drilled', drilledPhrases.length, 'count');
  add(
    'Trigger drill',
    'Average best reflex time',
    drilledPhrases.length === 0
      ? 0
      : round(
          drilledPhrases.reduce((sum, row) => sum + (row.reflex_time_ms ?? 0), 0) /
            drilledPhrases.length
        ),
    'milliseconds'
  );

  const asOf = generatedAt.slice(0, 10);
  add('Formulas', 'Formulas saved', data.formulas.length, 'count');
  add(
    'Formulas',
    'Formulas reviewed',
    data.formulas.filter((row) => row.last_reviewed !== null).length,
    'count'
  );
  add(
    'Formulas',
    'Formulas due',
    data.formulas.filter((row) => row.next_review <= asOf).length,
    'count'
  );
  add(
    'Formulas',
    'Times formulas were forgotten',
    data.formulas.reduce((sum, row) => sum + row.forgot_count, 0),
    'count'
  );

  add('Focus', 'Interruptions recorded', data.interruptionLogs.length, 'count');
  for (const kind of ['tab_switch', 'idle', 'exit'] as const) {
    add(
      'Focus',
      `${kind.replace('_', ' ')} interruptions`,
      data.interruptionLogs.filter((row) => row.kind === kind).length,
      'count'
    );
  }

  const subjects = [...new Set(data.questions.map((row) => row.subject))].sort();
  for (const subject of subjects) {
    const questions = data.questions.filter((row) => row.subject === subject);
    const clean = questions.filter((row) => row.outcome === 'R').length;
    add(`Subject: ${subject}`, 'Questions logged', questions.length, 'count');
    add(`Subject: ${subject}`, 'Clean solves', clean, 'count');
    add(`Subject: ${subject}`, 'Mistake-surface questions', questions.length - clean, 'count');
    add(`Subject: ${subject}`, 'Clean solve rate', percentage(clean, questions.length), '%');
  }

  return {
    version: PROGRESS_REPORT_VERSION,
    generatedAt,
    learnerName,
    metrics
  };
}

/** Read only the selected user's rows, even if a stale row from another account is present. */
export async function collectProgressReport(
  userId: string,
  learnerName: string
): Promise<ProgressReport> {
  const [
    sessions,
    questions,
    patterns,
    reattempts,
    formulas,
    triggerPhrases,
    weeklyReviews,
    interruptionLogs,
    pyqSessions,
    pyqAttempts,
    mocks,
    topicProgressRows
  ] = await Promise.all([
    db.sessions.where('user_id').equals(userId).toArray(),
    db.questions.where('user_id').equals(userId).toArray(),
    db.patterns.where('user_id').equals(userId).toArray(),
    db.reattempts.where('user_id').equals(userId).toArray(),
    db.formulas.where('user_id').equals(userId).toArray(),
    db.trigger_phrases.where('user_id').equals(userId).toArray(),
    db.weekly_reviews.where('user_id').equals(userId).toArray(),
    db.interruption_logs.where('user_id').equals(userId).toArray(),
    db.pyq_sessions.where('user_id').equals(userId).toArray(),
    db.pyq_attempts.where('user_id').equals(userId).toArray(),
    db.mock_tests.where('user_id').equals(userId).toArray(),
    db.topic_progress.where('user_id').equals(userId).toArray()
  ]);

  const localCompletions = useTopicProgressStore.getState().byUser[userId] ?? {};
  const topicCompletions: TopicCompletions = { ...localCompletions };
  for (const row of topicProgressRows) {
    topicCompletions[topicProgressId(row.subject, row.topic)] = row.completed_at;
  }

  return buildProgressReport(
    {
      sessions,
      questions,
      patterns,
      reattempts,
      formulas,
      triggerPhrases,
      weeklyReviews,
      interruptionLogs,
      pyqSessions,
      pyqAttempts,
      mocks,
      plannerDays: loadAllDayPlans(userId),
      topicCompletions
    },
    { learnerName }
  );
}

function csvCell(value: string | number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = String(value);
  // Prevent user-authored labels from becoming formulas when opened in a spreadsheet app.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function progressReportCsv(report: ProgressReport): string {
  const rows: (string | number)[][] = [
    ['HETU progress report'],
    ['Learner', report.learnerName],
    ['Generated at', report.generatedAt],
    ['Report version', report.version],
    [],
    ['Component', 'Metric', 'Value', 'Unit'],
    ...report.metrics.map((row) => [row.component, row.metric, row.value, row.unit])
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadProgressReport(report: ProgressReport): void {
  const blob = new Blob([progressReportCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hetu-progress-${report.generatedAt.slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
