import { calibrationBySubject, calibrationOverall } from '@/lib/analysis';
import { SUBJECTS } from '@/lib/constants';
import { db } from '@/lib/db';
import { loadAllDayPlans, type DayPlan } from '@/lib/planner-storage';
import { computeReadiness } from '@/lib/readiness';
import { SUBTOPICS_BY_SUBJECT } from '@/lib/subtopics';
import {
  topicProgressId,
  useTopicProgressStore,
  type TopicCompletions
} from '@/stores/topic-progress';
import type {
  FormulaRow,
  InterruptionLogRow,
  PatternRow,
  PyqAttemptRow,
  PyqSessionRow,
  QuestionRow,
  ReattemptRow,
  SessionRow,
  TriggerPhraseRow,
  WeeklyReviewRow
} from '@/types';

export const PROGRESS_REPORT_VERSION = 1;

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
          data.questions.reduce((sum, row) => sum + row.time_spent_sec, 0) /
            data.questions.length
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

  const pyqJudged = data.pyqAttempts.filter((row) => row.mark_correct !== null);
  const pyqCorrect = pyqJudged.filter((row) => row.mark_correct === true).length;
  add('PYQ practice', 'Practice sets', data.pyqSessions.length, 'count');
  add(
    'PYQ practice',
    'Completed practice sets',
    data.pyqSessions.filter((row) => row.status === 'completed').length,
    'count'
  );
  add('PYQ practice', 'Attempts', data.pyqAttempts.length, 'count');
  add(
    'PYQ practice',
    'Unique questions seen',
    new Set(data.pyqAttempts.map((row) => row.question_uid)).size,
    'count'
  );
  add('PYQ practice', 'Correct judged attempts', pyqCorrect, 'count');
  add('PYQ practice', 'Judged accuracy', percentage(pyqCorrect, pyqJudged.length), '%');
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
  add('Re-attempts', 'Clean review rate', percentage(cleanReattempts, reattemptHistory.length), '%');

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

  const calibrationRows = calibrationBySubject(data.questions);
  const calibration = calibrationOverall(calibrationRows);
  add('Calibration', 'Committed answers', calibration.decided, 'count');
  add('Calibration', 'Correct committed answers', calibration.correct, 'count');
  add('Calibration', 'Skipped decisions', calibration.skipped, 'count');
  add('Calibration', 'Committed-answer accuracy', round((calibration.accuracy ?? 0) * 100), '%');
  add('Calibration', 'Expected value per decision', round(calibration.expectedValue, 2), 'marks');

  const readiness = computeReadiness({
    questions: data.questions,
    reattempts: data.reattempts,
    patterns: data.patterns
  });
  add('Readiness', 'Overall score', readiness.score, 'points');
  add('Readiness', 'Confidence', readiness.confidence);
  add('Readiness', 'Coverage', round(readiness.coverage * 100), '%');
  add('Readiness', 'Retention', round(readiness.retention * 100), '%');
  add('Readiness', 'Calibration', round(readiness.calibration * 100), '%');
  add('Readiness', 'Mistake surface', round(readiness.surface * 100), '%');

  let syllabusTopics = 0;
  let completedTopics = 0;
  let completedSubjects = 0;
  for (const subject of SUBJECTS) {
    const topics = (SUBTOPICS_BY_SUBJECT[subject] ?? []).map((topic) => topic.value);
    const completed = topics.filter(
      (topic) => data.topicCompletions[topicProgressId(subject, topic)]
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
    pyqAttempts
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
    db.pyq_attempts.where('user_id').equals(userId).toArray()
  ]);

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
      plannerDays: loadAllDayPlans(userId),
      topicCompletions: useTopicProgressStore.getState().byUser[userId] ?? {}
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
    ['AIR Journal progress report'],
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
  link.download = `air-journal-progress-${report.generatedAt.slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
