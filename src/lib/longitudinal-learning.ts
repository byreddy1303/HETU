import type { LearningEventRow, LearningItemRow, RecoveryGrade } from '@/types';
import {
  computeRecoveryAnalytics,
  type RateMetric,
  type RecoveryAnalytics
} from '@/lib/recovery-analytics';
import { uuidFromString } from '@/lib/utils';

const DAILY_AGGREGATE_SCHEMA_VERSION = 1 as const;
const MAX_CACHED_DAYS = 730;
const RETRIEVAL_TYPES = new Set<LearningEventRow['event_type']>([
  'retrieval_again',
  'retrieval_hard',
  'retrieval_good',
  'retrieval_easy'
]);
const FLUENT_RETRIEVAL_TYPES = new Set<LearningEventRow['event_type']>([
  'retrieval_good',
  'retrieval_easy'
]);

export interface DailyLearningSubjectAggregate {
  subject: string;
  newMistakes: number;
  retrievals: number;
  fluentRetrievals: number;
  mastered: number;
  reopened: number;
}

export interface DailyLearningAggregate {
  date: string;
  sourceEventCount: number;
  newMistakes: number;
  retrievals: number;
  fluentRetrievals: number;
  hintFreeCorrect: number;
  correctRetrievals: number;
  grades: Record<RecoveryGrade, number>;
  transferAssigned: number;
  transferPassed: number;
  transferFailed: number;
  remediationStarted: number;
  remediationCompleted: number;
  analysisCompleted: number;
  mastered: number;
  reopened: number;
  recoveryTimeMs: number;
  bySubject: DailyLearningSubjectAggregate[];
}

export interface DailyLearningAggregateSeries {
  aggregates: DailyLearningAggregate[];
  sourceFingerprint: string;
  uniqueItemCount: number;
  duplicateItemsIgnored: number;
  uniqueEventCount: number;
  duplicateEventsIgnored: number;
}

export type LearningPriorityKind =
  | 'overdue'
  | 'due'
  | 'lapse'
  | 'hint-dependence'
  | 'transfer'
  | 'remediation'
  | 'analysis'
  | 'backlog'
  | 'new-evidence'
  | 'maintain';

export interface ActionableLearningPriority {
  kind: LearningPriorityKind;
  title: string;
  reason: string;
  href: '/reattempts' | '/journal' | '/pyq?preset=diagnose' | '/pyq?preset=transfer';
}

export interface LearningPeriodTotals {
  newMistakes: number;
  retrievals: number;
  fluentRetrievals: number;
  hintFreeRecall: RateMetric;
  transferSuccess: RateMetric;
  mastered: number;
  reopened: number;
  remediationStarted: number;
  remediationCompleted: number;
  analysisCompleted: number;
  backlogNet: number;
  grades: Record<RecoveryGrade, number>;
}

export interface LongitudinalLearningSignals {
  periodStart: string;
  periodEnd: string;
  /** Complete bounded projection through `asOfDate`, suitable for durable caching. */
  aggregateSeries: DailyLearningAggregateSeries;
  daily: DailyLearningAggregate[];
  totals: LearningPeriodTotals;
  analytics: RecoveryAnalytics;
  durableRecovery: RateMetric;
  dueBacklog: number;
  overdueBacklog: number;
  priority: ActionableLearningPriority;
  sourceFingerprint: string;
  uniqueItemCount: number;
  duplicateItemsIgnored: number;
  uniqueEventCount: number;
  duplicateEventsIgnored: number;
}

export interface DailyLearningAggregateCache {
  schemaVersion: typeof DAILY_AGGREGATE_SCHEMA_VERSION;
  userId: string;
  throughDate: string;
  sourceFingerprint: string;
  aggregates: DailyLearningAggregate[];
  updatedAt: string;
}

interface MutableSubjectAggregate extends DailyLearningSubjectAggregate {
  newItemIds: Set<string>;
}

interface MutableDailyAggregate extends Omit<DailyLearningAggregate, 'bySubject'> {
  newItemIds: Set<string>;
  subjects: Map<string, MutableSubjectAggregate>;
}

interface CanonicalLearningLedger {
  items: LearningItemRow[];
  events: LearningEventRow[];
  duplicateItemsIgnored: number;
  duplicateEventsIgnored: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function rate(numerator: number, denominator: number): RateMetric {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? 0 : numerator / denominator
  };
}

function gradeCounts(): Record<RecoveryGrade, number> {
  return { again: 0, hard: 0, good: 0, easy: 0 };
}

function eventKey(event: LearningEventRow): string {
  const idempotencyKey = event.idempotency_key?.trim() ?? '';
  return `${event.user_id}:${idempotencyKey || event.id}`;
}

function uniqueEvents(events: readonly LearningEventRow[]): LearningEventRow[] {
  const ordered = [...events].sort(
    (left, right) =>
      left.occurred_at.localeCompare(right.occurred_at) || left.id.localeCompare(right.id)
  );
  const byKey = new Map<string, LearningEventRow>();
  for (const event of ordered) {
    const key = eventKey(event);
    if (!byKey.has(key)) byKey.set(key, event);
  }
  return [...byKey.values()];
}

function canonicalItemKey(item: LearningItemRow): string {
  if (item.source_kind === 'pyq' && item.question_uid?.trim()) {
    return `${item.user_id}:pyq:${item.question_uid.trim()}`;
  }
  if (item.source_question_id?.trim()) {
    return `${item.user_id}:${item.source_kind}:question:${item.source_question_id.trim()}`;
  }
  if (item.content_fingerprint?.trim()) {
    return `${item.user_id}:${item.source_kind}:content:${item.content_fingerprint.trim()}`;
  }
  return `${item.user_id}:${item.source_kind}:id:${item.id}`;
}

function recoveryStateRank(item: LearningItemRow): number {
  if (item.recovery_state === 'remediation') return 0;
  if (item.recovery_state === 'active') return 1;
  if (item.recovery_state === 'transfer') return 2;
  if (item.recovery_state === 'paused') return 3;
  return 4;
}

function conservativeCanonicalItem(rows: readonly LearningItemRow[]): LearningItemRow {
  return [...rows].sort(
    (left, right) =>
      recoveryStateRank(left) - recoveryStateRank(right) ||
      (left.scheduled_date ?? '9999-12-31').localeCompare(
        right.scheduled_date ?? '9999-12-31'
      ) ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id)
  )[0];
}

/** Collapse defensive duplicate identities before any denominator is formed. */
function canonicalLearningLedger(
  items: readonly LearningItemRow[],
  events: readonly LearningEventRow[]
): CanonicalLearningLedger {
  const itemGroups = new Map<string, LearningItemRow[]>();
  for (const item of items) {
    const key = canonicalItemKey(item);
    const rows = itemGroups.get(key) ?? [];
    rows.push(item);
    itemGroups.set(key, rows);
  }
  const aliases = new Map<string, string>();
  const canonicalItems = [...itemGroups.values()].map((rows) => {
    const survivor = conservativeCanonicalItem(rows);
    for (const row of rows) aliases.set(row.id, survivor.id);
    return survivor;
  });
  const remappedEvents = events.map((event) => {
    const learningItemId = aliases.get(event.learning_item_id);
    return learningItemId && learningItemId !== event.learning_item_id
      ? { ...event, learning_item_id: learningItemId }
      : event;
  });
  const canonicalEvents = uniqueEvents(remappedEvents);
  return {
    items: canonicalItems,
    events: canonicalEvents,
    duplicateItemsIgnored: Math.max(0, items.length - canonicalItems.length),
    duplicateEventsIgnored: Math.max(0, events.length - canonicalEvents.length)
  };
}

function metadataString(event: LearningEventRow, key: string): string | null {
  const value = event.metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function timestampDate(value: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function itemCreatedByDate(
  item: LearningItemRow,
  events: readonly LearningEventRow[],
  asOfDate: string
): boolean {
  const firstLocalEventDate = events
    .filter(
      (event) => event.learning_item_id === item.id && isCalendarDate(event.local_date)
    )
    .map((event) => event.local_date)
    .sort()[0];
  const createdDate = firstLocalEventDate ?? timestampDate(item.created_at);
  return createdDate == null || createdDate <= asOfDate;
}

interface DurableRecoveryProjection {
  metric: RateMetric;
  masteredItemIds: Set<string>;
  durableItemIds: Set<string>;
}

function durableRecoveryAsOf(
  items: readonly LearningItemRow[],
  events: readonly LearningEventRow[],
  asOfDate: string
): DurableRecoveryProjection {
  const eventsByItem = new Map<string, LearningEventRow[]>();
  for (const event of events) {
    if (!isCalendarDate(event.local_date)) continue;
    const rows = eventsByItem.get(event.learning_item_id) ?? [];
    rows.push(event);
    eventsByItem.set(event.learning_item_id, rows);
  }
  let durable = 0;
  const masteredItemIds = new Set<string>();
  const durableItemIds = new Set<string>();
  for (const item of items) {
    const allItemEvents = (eventsByItem.get(item.id) ?? []).sort(
      (left, right) =>
        left.occurred_at.localeCompare(right.occurred_at) || left.id.localeCompare(right.id)
    );
    const itemEvents = allItemEvents.filter((event) => event.local_date <= asOfDate);
    const proofFromProjection =
      [item.successful_due_d30_at, item.transfer_passed_at]
        .map(timestampDate)
        .some((date) => date != null && date <= asOfDate);
    const proofFromEvents = itemEvents.some(
      (event) =>
        event.event_type === 'transfer_passed' ||
        ((event.event_type === 'retrieval_good' || event.event_type === 'retrieval_easy') &&
          metadataString(event, 'previous_stage') === 'D30')
    );
    const stateTransitions = itemEvents.filter(
      (event) =>
        event.event_type === 'mastered' ||
        event.event_type === 'reopened' ||
        event.event_type === 'retrieval_again'
    );
    const lastTransition = stateTransitions.at(-1);
    const masteredDate = timestampDate(item.mastered_at);
    const updatedDate = timestampDate(item.updated_at);
    const hasFutureStateTransition = allItemEvents.some(
      (event) =>
        event.local_date > asOfDate &&
        (event.event_type === 'mastered' ||
          event.event_type === 'reopened' ||
          event.event_type === 'retrieval_again')
    );
    const currentProjectionApplies =
      !hasFutureStateTransition && (updatedDate == null || updatedDate <= asOfDate);
    const masteredAsOf = currentProjectionApplies
      ? item.recovery_state === 'mastered' && (masteredDate == null || masteredDate <= asOfDate)
      : lastTransition?.event_type === 'mastered';
    if (masteredAsOf) masteredItemIds.add(item.id);
    if (masteredAsOf && (proofFromProjection || proofFromEvents)) {
      durable += 1;
      durableItemIds.add(item.id);
    }
  }
  return {
    metric: rate(durable, items.length),
    masteredItemIds,
    durableItemIds
  };
}

function isWeakOrigin(event: LearningEventRow): boolean {
  if (event.event_type !== 'answer_committed') return false;
  const decision = metadataString(event, 'mark_decision');
  return (
    event.is_correct === false ||
    decision === 'SKIP' ||
    decision === 'FIFTY_FIFTY' ||
    event.confidence === 'low'
  );
}

function emptyDaily(date: string): MutableDailyAggregate {
  return {
    date,
    sourceEventCount: 0,
    newMistakes: 0,
    retrievals: 0,
    fluentRetrievals: 0,
    hintFreeCorrect: 0,
    correctRetrievals: 0,
    grades: gradeCounts(),
    transferAssigned: 0,
    transferPassed: 0,
    transferFailed: 0,
    remediationStarted: 0,
    remediationCompleted: 0,
    analysisCompleted: 0,
    mastered: 0,
    reopened: 0,
    recoveryTimeMs: 0,
    newItemIds: new Set(),
    subjects: new Map()
  };
}

function subjectAggregate(
  daily: MutableDailyAggregate,
  subject: string
): MutableSubjectAggregate {
  const current = daily.subjects.get(subject);
  if (current) return current;
  const created: MutableSubjectAggregate = {
    subject,
    newMistakes: 0,
    retrievals: 0,
    fluentRetrievals: 0,
    mastered: 0,
    reopened: 0,
    newItemIds: new Set()
  };
  daily.subjects.set(subject, created);
  return created;
}

function publicDaily(row: MutableDailyAggregate): DailyLearningAggregate {
  return {
    date: row.date,
    sourceEventCount: row.sourceEventCount,
    newMistakes: row.newItemIds.size,
    retrievals: row.retrievals,
    fluentRetrievals: row.fluentRetrievals,
    hintFreeCorrect: row.hintFreeCorrect,
    correctRetrievals: row.correctRetrievals,
    grades: { ...row.grades },
    transferAssigned: row.transferAssigned,
    transferPassed: row.transferPassed,
    transferFailed: row.transferFailed,
    remediationStarted: row.remediationStarted,
    remediationCompleted: row.remediationCompleted,
    analysisCompleted: row.analysisCompleted,
    mastered: row.mastered,
    reopened: row.reopened,
    recoveryTimeMs: row.recoveryTimeMs,
    bySubject: [...row.subjects.values()]
      .map(({ newItemIds, ...subject }) => ({
        ...subject,
        newMistakes: newItemIds.size
      }))
      .sort(
        (left, right) =>
          right.newMistakes - left.newMistakes ||
          right.retrievals - left.retrievals ||
          left.subject.localeCompare(right.subject)
      )
  };
}

/**
 * Derive sparse local-calendar rollups from append-only recovery evidence.
 * Retries are collapsed by the database idempotency key before any metric is
 * counted, and a weak learning identity is opened only once at its first weak
 * answer event.
 */
function buildDailyFromCanonicalLedger(args: {
  ledger: CanonicalLearningLedger;
  fromDate?: string;
  throughDate?: string;
}): DailyLearningAggregateSeries {
  const events = args.ledger.events;
  const itemById = new Map(args.ledger.items.map((item) => [item.id, item]));
  const firstWeakEventByItem = new Map<string, string>();
  for (const event of events) {
    if (isWeakOrigin(event) && !firstWeakEventByItem.has(event.learning_item_id)) {
      firstWeakEventByItem.set(event.learning_item_id, eventKey(event));
    }
  }

  const byDate = new Map<string, MutableDailyAggregate>();
  const includedKeys: string[] = [];
  for (const event of events) {
    if (!isCalendarDate(event.local_date)) continue;
    if (args.fromDate && event.local_date < args.fromDate) continue;
    if (args.throughDate && event.local_date > args.throughDate) continue;
    const daily = byDate.get(event.local_date) ?? emptyDaily(event.local_date);
    const subject = itemById.get(event.learning_item_id)?.subject?.trim() || 'Unclassified';
    const subjectRow = subjectAggregate(daily, subject);
    daily.sourceEventCount += 1;
    includedKeys.push(
      `${eventKey(event)}:${event.event_type}:${event.local_date}:${event.grade ?? ''}:${String(event.is_correct)}:${event.hint_used ? 1 : 0}`
    );

    if (
      isWeakOrigin(event) &&
      firstWeakEventByItem.get(event.learning_item_id) === eventKey(event)
    ) {
      daily.newItemIds.add(event.learning_item_id);
      subjectRow.newItemIds.add(event.learning_item_id);
    }

    if (RETRIEVAL_TYPES.has(event.event_type)) {
      daily.retrievals += 1;
      subjectRow.retrievals += 1;
      if (FLUENT_RETRIEVAL_TYPES.has(event.event_type)) {
        daily.fluentRetrievals += 1;
        subjectRow.fluentRetrievals += 1;
      }
      if (event.is_correct === true) {
        daily.correctRetrievals += 1;
        if (!event.hint_used) daily.hintFreeCorrect += 1;
      }
      if (event.grade) daily.grades[event.grade] += 1;
      if (event.time_spent_ms && event.time_spent_ms > 0) {
        daily.recoveryTimeMs += Math.round(event.time_spent_ms);
      }
    }

    if (event.event_type === 'transfer_assigned') daily.transferAssigned += 1;
    if (event.event_type === 'transfer_passed') daily.transferPassed += 1;
    if (event.event_type === 'transfer_failed') daily.transferFailed += 1;
    if (event.event_type === 'remediation_started') daily.remediationStarted += 1;
    if (event.event_type === 'remediation_completed') daily.remediationCompleted += 1;
    if (event.event_type === 'analysis_completed') daily.analysisCompleted += 1;
    if (event.event_type === 'mastered') {
      daily.mastered += 1;
      subjectRow.mastered += 1;
    }
    if (event.event_type === 'reopened') {
      daily.reopened += 1;
      subjectRow.reopened += 1;
    }
    byDate.set(event.local_date, daily);
  }

  return {
    aggregates: [...byDate.values()].map(publicDaily).sort((a, b) => a.date.localeCompare(b.date)),
    sourceFingerprint: uuidFromString(
      `learning-daily:v1:${[...itemById.values()]
        .map((item) => `${canonicalItemKey(item)}:${item.subject}`)
        .sort()
        .join('|')}::${includedKeys.sort().join('|')}`
    ),
    uniqueItemCount: args.ledger.items.length,
    duplicateItemsIgnored: args.ledger.duplicateItemsIgnored,
    uniqueEventCount: includedKeys.length,
    duplicateEventsIgnored: args.ledger.duplicateEventsIgnored
  };
}

export function buildDailyLearningAggregates(args: {
  items: readonly LearningItemRow[];
  events: readonly LearningEventRow[];
  fromDate?: string;
  throughDate?: string;
}): DailyLearningAggregateSeries {
  if (args.fromDate && !isCalendarDate(args.fromDate)) {
    throw new RangeError('fromDate must be a valid YYYY-MM-DD date.');
  }
  if (args.throughDate && !isCalendarDate(args.throughDate)) {
    throw new RangeError('throughDate must be a valid YYYY-MM-DD date.');
  }
  if (args.fromDate && args.throughDate && args.fromDate > args.throughDate) {
    throw new RangeError('fromDate must be on or before throughDate.');
  }
  return buildDailyFromCanonicalLedger({
    ledger: canonicalLearningLedger(args.items, args.events),
    fromDate: args.fromDate,
    throughDate: args.throughDate
  });
}

function sumPeriod(rows: readonly DailyLearningAggregate[]): LearningPeriodTotals {
  const grades = gradeCounts();
  let newMistakes = 0;
  let retrievals = 0;
  let fluentRetrievals = 0;
  let correctRetrievals = 0;
  let hintFreeCorrect = 0;
  let transferPassed = 0;
  let transferFailed = 0;
  let mastered = 0;
  let reopened = 0;
  let remediationStarted = 0;
  let remediationCompleted = 0;
  let analysisCompleted = 0;
  for (const row of rows) {
    newMistakes += row.newMistakes;
    retrievals += row.retrievals;
    fluentRetrievals += row.fluentRetrievals;
    correctRetrievals += row.correctRetrievals;
    hintFreeCorrect += row.hintFreeCorrect;
    transferPassed += row.transferPassed;
    transferFailed += row.transferFailed;
    mastered += row.mastered;
    reopened += row.reopened;
    remediationStarted += row.remediationStarted;
    remediationCompleted += row.remediationCompleted;
    analysisCompleted += row.analysisCompleted;
    grades.again += row.grades.again;
    grades.hard += row.grades.hard;
    grades.good += row.grades.good;
    grades.easy += row.grades.easy;
  }
  return {
    newMistakes,
    retrievals,
    fluentRetrievals,
    hintFreeRecall: rate(hintFreeCorrect, correctRetrievals),
    // Period conversion uses completed transfer outcomes. An assignment from a
    // prior week followed by a pass this week must never produce a rate >100%.
    transferSuccess: rate(transferPassed, transferPassed + transferFailed),
    mastered,
    reopened,
    remediationStarted,
    remediationCompleted,
    analysisCompleted,
    backlogNet: newMistakes + reopened - mastered,
    grades
  };
}

function actionablePriority(args: {
  items: readonly LearningItemRow[];
  totals: LearningPeriodTotals;
  asOfDate: string;
}): ActionableLearningPriority {
  const open = args.items.filter(
    (item) => item.recovery_state !== 'mastered' && item.recovery_state !== 'paused'
  );
  const retrievable = open.filter((item) => item.recovery_state === 'active');
  const overdue = retrievable.filter(
    (item) => item.scheduled_date != null && item.scheduled_date < args.asOfDate
  );
  if (overdue.length > 0) {
    const ages = overdue
      .map((item) =>
        Math.max(
          0,
          Math.floor(
            (Date.parse(`${args.asOfDate}T12:00:00.000Z`) -
              Date.parse(`${item.scheduled_date as string}T12:00:00.000Z`)) /
              86_400_000
          )
        )
      )
      .sort((left, right) => left - right);
    const p90Age = ages[Math.max(0, Math.ceil(ages.length * 0.9) - 1)] ?? 0;
    return {
      kind: 'overdue',
      title: `Clear ${overdue.length} overdue recovery item${overdue.length === 1 ? '' : 's'}`,
      reason: `P90 overdue age is ${p90Age} days; overdue retrieval remains ahead of new work.`,
      href: '/reattempts'
    };
  }
  const due = retrievable.filter((item) => item.scheduled_date === args.asOfDate);
  if (due.length > 0) {
    return {
      kind: 'due',
      title: `Retrieve ${due.length} item${due.length === 1 ? '' : 's'} due today`,
      reason: 'Due, blind retrieval is the next evidence-bearing step toward durable recovery.',
      href: '/reattempts'
    };
  }
  const lapsed = retrievable.filter((item) => item.lapse_count > 0);
  if (lapsed.length > 0) {
    return {
      kind: 'lapse',
      title: `Repair ${lapsed.length} lapsed item${lapsed.length === 1 ? '' : 's'}`,
      reason: 'A reopened item is stronger evidence of current weakness than raw practice volume.',
      href: '/reattempts'
    };
  }
  const remediation = open.filter((item) => item.recovery_state === 'remediation').length;
  if (remediation > 0) {
    return {
      kind: 'remediation',
      title: `Finish remediation for ${remediation} leech item${remediation === 1 ? '' : 's'}`,
      reason: 'Repeated failure needs a concept repair before another retrieval attempt.',
      href: '/reattempts'
    };
  }
  const transfer = open.filter((item) => item.recovery_state === 'transfer').length;
  if (transfer > 0) {
    return {
      kind: 'transfer',
      title: `Complete ${transfer} fresh transfer check${transfer === 1 ? '' : 's'}`,
      reason: 'Fresh transfer evidence can establish durable mastery without repeating the same prompt.',
      href: '/reattempts'
    };
  }
  if (
    args.totals.hintFreeRecall.denominator >= 3 &&
    args.totals.hintFreeRecall.rate < 0.8
  ) {
    return {
      kind: 'hint-dependence',
      title: 'Run the next recovery sprint blind',
      reason: `${Math.round(args.totals.hintFreeRecall.rate * 100)}% of correct retrievals were hint-free this period; assisted recall is not durable recall.`,
      href: '/reattempts'
    };
  }
  const pendingAnalysis = args.items.filter((item) => item.analysis_state === 'pending').length;
  if (pendingAnalysis > 0) {
    return {
      kind: 'analysis',
      title: `Analyze ${pendingAnalysis} unresolved mistake${pendingAnalysis === 1 ? '' : 's'}`,
      reason: 'Recovery is already scheduled; naming the cause now makes the next repair more precise.',
      href: '/journal'
    };
  }
  if (args.totals.backlogNet > 0) {
    return {
      kind: 'backlog',
      title: `Burn down ${args.totals.backlogNet} net new recovery item${args.totals.backlogNet === 1 ? '' : 's'}`,
      reason: 'New mistakes and lapses outpaced durable mastery during this period.',
      href: '/reattempts'
    };
  }
  if (args.items.length === 0) {
    return {
      kind: 'new-evidence',
      title: 'Run a fresh diagnostic PYQ set',
      reason: 'There is no canonical recovery evidence yet; a broad fresh set can reveal the first defensible repair targets.',
      href: '/pyq?preset=diagnose'
    };
  }
  return {
    kind: 'maintain',
    title: 'Verify mastery on fresh transfer questions',
    reason: 'The due surface is controlled; use a different prompt to verify that the learning transfers.',
    href: '/pyq?preset=transfer'
  };
}

/**
 * Shared Weekly Review / Readiness contract. Recovery events are deduplicated
 * once here, so both consumers see the same denominators and provenance.
 */
export function buildLongitudinalLearningSignals(args: {
  items: readonly LearningItemRow[];
  events: readonly LearningEventRow[];
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
}): LongitudinalLearningSignals {
  if (!isCalendarDate(args.periodStart)) {
    throw new RangeError('periodStart must be a valid YYYY-MM-DD date.');
  }
  if (!isCalendarDate(args.periodEnd)) {
    throw new RangeError('periodEnd must be a valid YYYY-MM-DD date.');
  }
  if (!isCalendarDate(args.asOfDate)) {
    throw new RangeError('asOfDate must be a valid YYYY-MM-DD date.');
  }
  if (args.periodStart > args.periodEnd) {
    throw new RangeError('periodStart must be on or before periodEnd.');
  }
  const canonical = canonicalLearningLedger(args.items, args.events);
  const eventsAsOf = canonical.events.filter(
    (event) => isCalendarDate(event.local_date) && event.local_date <= args.asOfDate
  );
  const itemsAsOf = canonical.items.filter((item) =>
    itemCreatedByDate(item, eventsAsOf, args.asOfDate)
  );
  const itemIdsAsOf = new Set(itemsAsOf.map((item) => item.id));
  const ledgerAsOf: CanonicalLearningLedger = {
    items: itemsAsOf,
    events: eventsAsOf.filter((event) => itemIdsAsOf.has(event.learning_item_id)),
    duplicateItemsIgnored: canonical.duplicateItemsIgnored,
    duplicateEventsIgnored: canonical.duplicateEventsIgnored
  };
  const series = buildDailyFromCanonicalLedger({
    ledger: ledgerAsOf,
    throughDate: args.asOfDate
  });
  const effectivePeriodEnd =
    args.periodEnd < args.asOfDate ? args.periodEnd : args.asOfDate;
  const period = series.aggregates.filter(
    (row) => row.date >= args.periodStart && row.date <= effectivePeriodEnd
  );
  const recoveryProjection = durableRecoveryAsOf(
    ledgerAsOf.items,
    canonical.events,
    args.asOfDate
  );
  const analyticsItems = ledgerAsOf.items.map((item): LearningItemRow => {
    const durable = recoveryProjection.durableItemIds.has(item.id);
    const dueD30Date = timestampDate(item.successful_due_d30_at);
    const transferDate = timestampDate(item.transfer_passed_at);
    return {
      ...item,
      recovery_state:
        durable ? 'mastered' : item.recovery_state === 'mastered' ? 'active' : item.recovery_state,
      stage: durable ? 'MASTERED' : item.stage === 'MASTERED' ? 'D30' : item.stage,
      successful_due_d30_at:
        dueD30Date != null && dueD30Date <= args.asOfDate
          ? item.successful_due_d30_at
          : null,
      transfer_passed_at:
        transferDate != null && transferDate <= args.asOfDate ? item.transfer_passed_at : null,
      mastered_at: durable ? item.mastered_at : null
    };
  });
  const durableRecovery = recoveryProjection.metric;
  const rawAnalytics = computeRecoveryAnalytics({
    items: analyticsItems,
    events: ledgerAsOf.events,
    asOfDate: args.asOfDate,
    windowStart: args.periodStart
  });
  const analytics: RecoveryAnalytics = { ...rawAnalytics, durableRecovery };
  const totals = sumPeriod(period);
  const open = analyticsItems.filter(
    (item) => item.recovery_state !== 'mastered' && item.recovery_state !== 'paused'
  );
  const dueBacklog = open.filter(
    (item) => item.scheduled_date != null && item.scheduled_date <= args.asOfDate
  ).length;
  const overdueBacklog = open.filter(
    (item) => item.scheduled_date != null && item.scheduled_date < args.asOfDate
  ).length;
  return {
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    aggregateSeries: series,
    daily: period,
    totals,
    analytics,
    durableRecovery,
    dueBacklog,
    overdueBacklog,
    priority: actionablePriority({
      items: ledgerAsOf.items,
      totals,
      asOfDate: args.asOfDate
    }),
    sourceFingerprint: series.sourceFingerprint,
    uniqueItemCount: series.uniqueItemCount,
    duplicateItemsIgnored: series.duplicateItemsIgnored,
    uniqueEventCount: series.uniqueEventCount,
    duplicateEventsIgnored: series.duplicateEventsIgnored
  };
}

export function dailyLearningAggregateCacheKey(userId: string): string {
  return `air.learning-daily.v1.${userId}`;
}

function normalizeSubjectAggregate(value: unknown): DailyLearningSubjectAggregate | null {
  if (!isRecord(value) || typeof value.subject !== 'string' || !value.subject.trim()) return null;
  return {
    subject: value.subject.trim(),
    newMistakes: count(value.newMistakes),
    retrievals: count(value.retrievals),
    fluentRetrievals: count(value.fluentRetrievals),
    mastered: count(value.mastered),
    reopened: count(value.reopened)
  };
}

function normalizeDailyAggregate(value: unknown): DailyLearningAggregate | null {
  if (!isRecord(value) || !isCalendarDate(value.date)) return null;
  const rawGrades = isRecord(value.grades) ? value.grades : {};
  return {
    date: value.date,
    sourceEventCount: count(value.sourceEventCount),
    newMistakes: count(value.newMistakes),
    retrievals: count(value.retrievals),
    fluentRetrievals: count(value.fluentRetrievals),
    hintFreeCorrect: count(value.hintFreeCorrect),
    correctRetrievals: count(value.correctRetrievals),
    grades: {
      again: count(rawGrades.again),
      hard: count(rawGrades.hard),
      good: count(rawGrades.good),
      easy: count(rawGrades.easy)
    },
    transferAssigned: count(value.transferAssigned),
    transferPassed: count(value.transferPassed),
    transferFailed: count(value.transferFailed),
    remediationStarted: count(value.remediationStarted),
    remediationCompleted: count(value.remediationCompleted),
    analysisCompleted: count(value.analysisCompleted),
    mastered: count(value.mastered),
    reopened: count(value.reopened),
    recoveryTimeMs: count(value.recoveryTimeMs),
    bySubject: Array.isArray(value.bySubject)
      ? value.bySubject.flatMap((row) => {
          const normalized = normalizeSubjectAggregate(row);
          return normalized ? [normalized] : [];
        })
      : []
  };
}

export function normalizeDailyLearningAggregateCache(
  value: unknown,
  expectedUserId: string
): DailyLearningAggregateCache | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== DAILY_AGGREGATE_SCHEMA_VERSION ||
    value.userId !== expectedUserId ||
    !isCalendarDate(value.throughDate) ||
    typeof value.sourceFingerprint !== 'string' ||
    !value.sourceFingerprint ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    !Array.isArray(value.aggregates)
  ) {
    return null;
  }
  const throughDate = value.throughDate;
  const normalizedRows = value.aggregates
    .flatMap((row) => {
      const normalized = normalizeDailyAggregate(row);
      return normalized ? [normalized] : [];
    })
    .filter((row) => row.date <= throughDate);
  const byDate = new Map<string, DailyLearningAggregate>();
  for (const row of normalizedRows) byDate.set(row.date, row);
  const aggregates = [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-MAX_CACHED_DAYS);
  return {
    schemaVersion: DAILY_AGGREGATE_SCHEMA_VERSION,
    userId: expectedUserId,
    throughDate,
    sourceFingerprint: value.sourceFingerprint,
    aggregates,
    updatedAt: value.updatedAt
  };
}

export function loadDailyLearningAggregateCache(
  userId: string
): DailyLearningAggregateCache | null {
  try {
    const raw = localStorage.getItem(dailyLearningAggregateCacheKey(userId));
    return raw ? normalizeDailyLearningAggregateCache(JSON.parse(raw), userId) : null;
  } catch {
    return null;
  }
}

/**
 * Persist the rebuildable, account-scoped daily projection. Immutable events
 * remain the source of truth; this bounded cache only avoids recomputing a long
 * history on every Weekly Review or Readiness visit.
 */
export function persistDailyLearningAggregateCache(args: {
  userId: string;
  throughDate: string;
  series: DailyLearningAggregateSeries;
  updatedAt: string;
}): DailyLearningAggregateCache {
  if (!args.userId.trim()) throw new RangeError('userId is required.');
  if (!isCalendarDate(args.throughDate)) {
    throw new RangeError('throughDate must be a valid YYYY-MM-DD date.');
  }
  if (!Number.isFinite(Date.parse(args.updatedAt))) {
    throw new RangeError('updatedAt must be a valid timestamp.');
  }
  const next: DailyLearningAggregateCache = {
    schemaVersion: DAILY_AGGREGATE_SCHEMA_VERSION,
    userId: args.userId,
    throughDate: args.throughDate,
    sourceFingerprint: args.series.sourceFingerprint,
    aggregates: args.series.aggregates
      .filter((row) => row.date <= args.throughDate)
      .slice(-MAX_CACHED_DAYS),
    updatedAt: args.updatedAt
  };
  const current = loadDailyLearningAggregateCache(args.userId);
  if (
    current?.throughDate === next.throughDate &&
    current.sourceFingerprint === next.sourceFingerprint
  ) {
    return current;
  }
  try {
    localStorage.setItem(dailyLearningAggregateCacheKey(args.userId), JSON.stringify(next));
  } catch {
    // The source event ledger remains authoritative and can rebuild this cache.
  }
  return next;
}
