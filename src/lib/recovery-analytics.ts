import type {
  LearningEventRow,
  LearningItemRow,
  QuestionRow,
  RecoveryGrade
} from '@/types';

export interface RateMetric {
  numerator: number;
  denominator: number;
  rate: number;
}

export interface RecoveryStageRate extends RateMetric {
  stage: string;
}

export interface RecoveryBreakdown {
  key: string;
  items: number;
  mastered: number;
  durableRecoveryRate: number;
  lapses: number;
}

export interface RecoveryAnalytics {
  durableRecovery: RateMetric;
  wrongToClean7Days: RateMetric;
  wrongToClean30Days: RateMetric;
  grades: Record<RecoveryGrade, number>;
  gradePassRate: RateMetric;
  stagePassRates: RecoveryStageRate[];
  hintFreeRecall: RateMetric;
  transferSuccess: RateMetric;
  masteredLapse: RateMetric;
  remediationConversion: RateMetric;
  analysisCompletion: RateMetric;
  overdueAge: { medianDays: number; p90Days: number; count: number };
  backlog: { opened: number; mastered: number; net: number };
  averageTimeImprovementPct: number | null;
  bySubject: RecoveryBreakdown[];
  byPattern: RecoveryBreakdown[];
  byRootCause: RecoveryBreakdown[];
}

const RETRIEVAL_TYPES = new Set([
  'retrieval_again',
  'retrieval_hard',
  'retrieval_good',
  'retrieval_easy'
]);
const CLEAN_TYPES = new Set(['retrieval_good', 'retrieval_easy']);
const DAY_MS = 86_400_000;

function rate(numerator: number, denominator: number): RateMetric {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? 0 : numerator / denominator
  };
}

function dayDistance(later: string, earlier: string): number {
  const laterMs = Date.parse(later);
  const earlierMs = Date.parse(earlier);
  if (!Number.isFinite(laterMs) || !Number.isFinite(earlierMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (laterMs - earlierMs) / DAY_MS);
}

function percentile(sorted: number[], proportion: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * proportion) - 1);
  return sorted[Math.min(index, sorted.length - 1)];
}

function eventMetadataString(event: LearningEventRow, key: string): string | null {
  const value = event.metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function isWeakOrigin(event: LearningEventRow): boolean {
  if (event.event_type !== 'answer_committed') return false;
  const decision = eventMetadataString(event, 'mark_decision');
  return (
    event.is_correct === false ||
    decision === 'SKIP' ||
    decision === 'FIFTY_FIFTY' ||
    event.confidence === 'low'
  );
}

function firstCleanAfter(
  events: LearningEventRow[],
  origin: LearningEventRow
): LearningEventRow | null {
  return (
    events.find(
      (event) =>
        event.learning_item_id === origin.learning_item_id &&
        CLEAN_TYPES.has(event.event_type) &&
        !event.hint_used &&
        event.occurred_at >= origin.occurred_at
    ) ?? null
  );
}

function breakdown(
  items: LearningItemRow[],
  keyForItem: (item: LearningItemRow) => string | null
): RecoveryBreakdown[] {
  const groups = new Map<string, LearningItemRow[]>();
  for (const item of items) {
    const key = keyForItem(item);
    if (!key) continue;
    const rows = groups.get(key) ?? [];
    rows.push(item);
    groups.set(key, rows);
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const mastered = rows.filter((item) => item.recovery_state === 'mastered').length;
      return {
        key,
        items: rows.length,
        mastered,
        durableRecoveryRate: rows.length === 0 ? 0 : mastered / rows.length,
        lapses: rows.reduce((total, item) => total + item.lapse_count, 0)
      };
    })
    .sort((left, right) => right.items - left.items || left.key.localeCompare(right.key));
}

export function computeRecoveryAnalytics(args: {
  items: LearningItemRow[];
  events: LearningEventRow[];
  questions?: QuestionRow[];
  asOfDate: string;
  windowStart?: string;
}): RecoveryAnalytics {
  const events = [...args.events].sort(
    (left, right) =>
      left.occurred_at.localeCompare(right.occurred_at) || left.id.localeCompare(right.id)
  );
  const weakOrigins = events.filter(isWeakOrigin);
  const firstWeakByItem = new Map<string, LearningEventRow>();
  for (const event of weakOrigins) {
    if (!firstWeakByItem.has(event.learning_item_id)) {
      firstWeakByItem.set(event.learning_item_id, event);
    }
  }
  const uniqueOrigins = [...firstWeakByItem.values()];
  const cleanWithin = (days: number) =>
    uniqueOrigins.filter((origin) => {
      const clean = firstCleanAfter(events, origin);
      return clean != null && dayDistance(clean.occurred_at, origin.occurred_at) <= days;
    }).length;

  const retrievals = events.filter((event) => RETRIEVAL_TYPES.has(event.event_type));
  const grades: Record<RecoveryGrade, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const event of retrievals) {
    if (event.grade) grades[event.grade] += 1;
  }
  const fluentPasses = grades.good + grades.easy;
  const correctRetrievals = retrievals.filter((event) => event.is_correct === true);
  const hintFreeCorrect = correctRetrievals.filter((event) => !event.hint_used).length;

  const stages = new Map<string, { pass: number; total: number }>();
  for (const event of retrievals) {
    const stage = eventMetadataString(event, 'previous_stage') ?? 'legacy';
    const current = stages.get(stage) ?? { pass: 0, total: 0 };
    current.total += 1;
    if (event.grade === 'good' || event.grade === 'easy') current.pass += 1;
    stages.set(stage, current);
  }

  const transferAssigned = events.filter((event) => event.event_type === 'transfer_assigned');
  const transferPassedIds = new Set(
    events
      .filter((event) => event.event_type === 'transfer_passed')
      .map((event) => event.learning_item_id)
  );
  const masteredEvents = events.filter((event) => event.event_type === 'mastered');
  const masteredIds = new Set(masteredEvents.map((event) => event.learning_item_id));
  const masteredAtByItem = new Map<string, string>();
  for (const event of masteredEvents) {
    const previous = masteredAtByItem.get(event.learning_item_id);
    if (!previous || event.occurred_at < previous) {
      masteredAtByItem.set(event.learning_item_id, event.occurred_at);
    }
  }
  const lapsedMasteredIds = new Set(
    events
      .filter(
        (event) =>
          (event.event_type === 'reopened' || event.event_type === 'retrieval_again') &&
          masteredAtByItem.has(event.learning_item_id) &&
          event.occurred_at > (masteredAtByItem.get(event.learning_item_id) as string)
      )
      .map((event) => event.learning_item_id)
  );
  const remediationStartedIds = new Set(
    events
      .filter((event) => event.event_type === 'remediation_started')
      .map((event) => event.learning_item_id)
  );
  const remediationCompletedIds = new Set(
    events
      .filter((event) => event.event_type === 'remediation_completed')
      .map((event) => event.learning_item_id)
  );

  const asOfMs = Date.parse(`${args.asOfDate}T00:00:00.000Z`);
  const overdueAges = args.items
    .filter(
      (item) =>
        item.scheduled_date != null &&
        item.scheduled_date < args.asOfDate &&
        item.recovery_state !== 'mastered' &&
        item.recovery_state !== 'paused'
    )
    .map((item) => {
      const dueMs = Date.parse(`${item.scheduled_date}T00:00:00.000Z`);
      return Math.max(0, Math.floor((asOfMs - dueMs) / DAY_MS));
    })
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  const windowStart = args.windowStart ?? '0000-01-01';
  const openedInWindow = uniqueOrigins.filter(
    (event) => event.local_date >= windowStart && event.local_date <= args.asOfDate
  ).length;
  const masteredInWindow = masteredEvents.filter(
    (event) => event.local_date >= windowStart && event.local_date <= args.asOfDate
  ).length;

  const improvements: number[] = [];
  for (const origin of uniqueOrigins) {
    if (!origin.time_spent_ms || origin.time_spent_ms <= 0) continue;
    const clean = firstCleanAfter(events, origin);
    if (!clean?.time_spent_ms || clean.time_spent_ms <= 0) continue;
    improvements.push(((origin.time_spent_ms - clean.time_spent_ms) / origin.time_spent_ms) * 100);
  }

  const questions = args.questions ?? [];
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const questionByAttemptId = new Map(
    questions
      .filter((question) => question.source_pyq_attempt_id)
      .map((question) => [question.source_pyq_attempt_id as string, question])
  );
  const questionForItem = (item: LearningItemRow): QuestionRow | null =>
    (item.source_question_id ? questionById.get(item.source_question_id) : undefined) ??
    (item.latest_pyq_attempt_id ? questionByAttemptId.get(item.latest_pyq_attempt_id) : undefined) ??
    null;

  const durableMastered = args.items.filter(
    (item) =>
      item.recovery_state === 'mastered' &&
      (item.successful_due_d30_at != null || item.transfer_passed_at != null)
  ).length;
  const analyzed = args.items.filter((item) => item.analysis_state === 'completed').length;

  return {
    durableRecovery: rate(durableMastered, args.items.length),
    wrongToClean7Days: rate(cleanWithin(7), uniqueOrigins.length),
    wrongToClean30Days: rate(cleanWithin(30), uniqueOrigins.length),
    grades,
    gradePassRate: rate(fluentPasses, retrievals.length),
    stagePassRates: [...stages.entries()]
      .map(([stage, value]) => ({ stage, ...rate(value.pass, value.total) }))
      .sort((left, right) => left.stage.localeCompare(right.stage)),
    hintFreeRecall: rate(hintFreeCorrect, correctRetrievals.length),
    transferSuccess: rate(
      transferAssigned.filter((event) => transferPassedIds.has(event.learning_item_id)).length,
      transferAssigned.length
    ),
    masteredLapse: rate(lapsedMasteredIds.size, masteredIds.size),
    remediationConversion: rate(remediationCompletedIds.size, remediationStartedIds.size),
    analysisCompletion: rate(analyzed, args.items.length),
    overdueAge: {
      medianDays: percentile(overdueAges, 0.5),
      p90Days: percentile(overdueAges, 0.9),
      count: overdueAges.length
    },
    backlog: {
      opened: openedInWindow,
      mastered: masteredInWindow,
      net: openedInWindow - masteredInWindow
    },
    averageTimeImprovementPct:
      improvements.length === 0
        ? null
        : improvements.reduce((sum, value) => sum + value, 0) / improvements.length,
    bySubject: breakdown(args.items, (item) => item.subject),
    byPattern: breakdown(args.items, (item) => questionForItem(item)?.pattern_name ?? null),
    byRootCause: breakdown(args.items, (item) => questionForItem(item)?.root_cause ?? null)
  };
}
