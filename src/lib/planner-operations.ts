import type { DayPlan, Replicate, StudyMode, StudySession } from '@/lib/planner-storage';
import { createPlannerPyqLaunchPrescription } from '@/lib/planner-pyq';
import { canonicalSubjectId, canonicalSubjectLabel } from '@/lib/subjects';
import { gate2027BankSubjectSlugs } from '@/lib/gate-2027';
import { addDaysISO, uuidFromString } from '@/lib/utils';

const MAX_RECURRENCE_OCCURRENCES = 366;
const DEFAULT_PYQ_PACE_SECONDS = 180;
const DEFAULT_RECOVERY_CAPTURE_RATE = 0.35;
const DEFAULT_RECOVERY_MINUTES = 4;
const DEFAULT_RECOVERY_OFFSETS = [3, 10, 30] as const;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requireCalendarDate(value: string, field: string): void {
  if (!isCalendarDate(value)) throw new RangeError(`${field} must be a valid YYYY-MM-DD date.`);
}

function weekday(value: string): number {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

function blockSubject(block: StudySession): string {
  return block.subject === 'Custom...' && block.customSubject?.trim()
    ? block.customSubject.trim()
    : canonicalSubjectLabel(block.subject);
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const source = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(source)));
}

function boundedRate(value: number | undefined, fallback: number): number {
  const source = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, source));
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export type PlannerCopyOperation =
  'full-day' | 'selected-block' | 'rollover' | 'replicate' | 'recurrence';

export interface PlannerBlockCopyOptions {
  sourceDate?: string;
  operation?: PlannerCopyOperation;
  /** Distinguishes deliberate repeated copies of the same source block on one date. */
  ordinal?: number;
  /** Used by append flows to avoid an ID already present on the target day. */
  existingBlockIds?: readonly string[];
}

function copiedBlockId(
  block: StudySession,
  targetDate: string,
  options: PlannerBlockCopyOptions
): string {
  const operation = options.operation ?? 'selected-block';
  const sourceDate = options.sourceDate ?? 'undated';
  const occupied = new Set(options.existingBlockIds ?? []);
  let ordinal = boundedInteger(options.ordinal, 0, 0, 100_000);
  let id = '';
  do {
    id = uuidFromString(
      `planner-copy:v1:${operation}:${sourceDate}:${block.id}:${targetDate}:${ordinal}`
    );
    ordinal += 1;
  } while (occupied.has(id));
  return id;
}

function regeneratedPyqLaunch(
  source: StudySession,
  targetDate: string,
  targetBlockId: string
): NonNullable<StudySession['launch']> {
  const previous = source.launch?.kind === 'pyq' ? source.launch.prescription : null;
  const subjectLabel = previous?.subjectLabel ?? blockSubject(source);
  const canonicalId = source.subjectId ?? canonicalSubjectId(subjectLabel);
  const inferredSubjectSlugs = !previous && canonicalId ? gate2027BankSubjectSlugs(canonicalId) : [];
  const subjectSlugs = previous?.config.subjectSlugs ?? inferredSubjectSlugs;
  const subjectSlug =
    previous?.config.subjectSlug ?? (subjectSlugs.length === 1 ? subjectSlugs[0] : 'all');
  const sourceSeed = previous?.selectionSeed ?? `planner-${source.id}`;
  const prescription = createPlannerPyqLaunchPrescription({
    plannerDate: targetDate,
    plannerBlockId: targetBlockId,
    subjectLabel,
    subjectSlug,
    subjectSlugs,
    durationMin: source.durationMin,
    medianSecondsPerQuestion: previous?.paceSecPerQuestion,
    preferredQuestionCount: previous?.targetQuestionCount,
    ...(previous
      ? {
          topicSlug: previous.config.topicSlug,
          bookSlug: previous.config.bookSlug,
          history: previous.config.history,
          fromYear: previous.config.fromYear,
          toYear: previous.config.toYear,
          type: previous.config.type,
          order: previous.config.order,
          cohort: previous.cohort,
          mode: previous.config.mode,
          examKind: previous.config.examKind,
          protectSealedPapers: previous.protectSealedPapers,
          exactQuestionUids: previous.exactQuestionUids
        }
      : {}),
    // A copied randomized prescription is independently reproducible for its
    // target occurrence instead of silently resolving to the source session.
    selectionSeed: `planner-copy:${targetDate}:${targetBlockId}:${sourceSeed}`
  });

  return {
    kind: 'pyq',
    prescription,
    resolvedQuestionUids: [],
    resolvedAt: null,
    pyqSessionId: null
  };
}

/**
 * Copy one block into a fresh execution identity.
 *
 * Planning intent is retained. Execution and result evidence are never copied.
 * A PYQ launch is reconstructed against the target date/block identifiers and
 * remains unresolved until that new block starts.
 */
export function copyPlannerBlock(
  block: StudySession,
  targetDate: string,
  options: PlannerBlockCopyOptions = {}
): StudySession {
  requireCalendarDate(targetDate, 'targetDate');
  if (options.sourceDate) requireCalendarDate(options.sourceDate, 'sourceDate');
  const id = copiedBlockId(block, targetDate, options);
  const copied: StudySession = { ...block, id };
  delete copied.execution;
  delete copied.result;
  if (block.mode === 'PYQ Practice' || block.launch?.kind === 'pyq') {
    copied.launch = regeneratedPyqLaunch(block, targetDate, id);
  } else {
    delete copied.launch;
  }
  return copied;
}

export interface CopyPlannerDayOptions {
  updatedAt?: string;
  operation?: PlannerCopyOperation;
}

/** Copy every planning input to another date while clearing daily outcomes. */
export function copyFullPlannerDay(
  source: DayPlan,
  targetDate: string,
  options: CopyPlannerDayOptions = {}
): DayPlan {
  requireCalendarDate(source.date, 'source.date');
  requireCalendarDate(targetDate, 'targetDate');
  const operation = options.operation ?? 'full-day';
  const sessions = source.sessions.map((block, ordinal) =>
    copyPlannerBlock(block, targetDate, {
      sourceDate: source.date,
      operation,
      ordinal
    })
  );

  return {
    date: targetDate,
    sessions,
    availability: {
      ...source.availability,
      timeWindows: source.availability.timeWindows.map((window) => ({ ...window }))
    },
    structure: { ...source.structure },
    mindset: { ...source.mindset },
    nonStudy: {
      ...source.nonStudy,
      // This is evidence about the source day, not a reusable plan input.
      exerciseDone: false
    },
    review: {
      completionPct: 0,
      wentWell: '',
      missed: '',
      endMood: '',
      replicate: ''
    },
    // The storage boundary replaces this with write time. Retaining a supplied
    // or source value keeps this transformation deterministic and side-effect free.
    updatedAt: options.updatedAt ?? source.updatedAt
  };
}

/** Copy an explicit subset in source agenda order. Unknown IDs are ignored. */
export function copySelectedPlannerBlocks(
  source: DayPlan,
  selectedBlockIds: readonly string[],
  targetDate: string,
  options: Omit<PlannerBlockCopyOptions, 'sourceDate' | 'operation' | 'ordinal'> = {}
): StudySession[] {
  requireCalendarDate(source.date, 'source.date');
  requireCalendarDate(targetDate, 'targetDate');
  const selected = new Set(selectedBlockIds);
  const existing = [...(options.existingBlockIds ?? [])];
  return source.sessions
    .filter((block) => selected.has(block.id))
    .map((block, ordinal) => {
      const copied = copyPlannerBlock(block, targetDate, {
        sourceDate: source.date,
        operation: 'selected-block',
        ordinal,
        existingBlockIds: existing
      });
      existing.push(copied.id);
      return copied;
    });
}

/** Copy only blocks without completion evidence; started drafts are fresh on rollover. */
export function rolloverUnfinishedPlannerBlocks(
  source: DayPlan,
  targetDate: string,
  options: Omit<PlannerBlockCopyOptions, 'sourceDate' | 'operation' | 'ordinal'> = {}
): StudySession[] {
  requireCalendarDate(source.date, 'source.date');
  requireCalendarDate(targetDate, 'targetDate');
  const existing = [...(options.existingBlockIds ?? [])];
  return source.sessions
    .filter((block) => !block.execution?.completedAt)
    .map((block, ordinal) => {
      const copied = copyPlannerBlock(block, targetDate, {
        sourceDate: source.date,
        operation: 'rollover',
        ordinal,
        existingBlockIds: existing
      });
      existing.push(copied.id);
      return copied;
    });
}

export type PlannerCopySource = 'yesterday' | 'last-weekday';

/** Strictly previous Monday–Friday date, suitable for a Copy last weekday picker. */
export function previousWeekdayISO(targetDate: string): string {
  requireCalendarDate(targetDate, 'targetDate');
  let candidate = addDaysISO(targetDate, -1);
  while (weekday(candidate) === 0 || weekday(candidate) === 6) {
    candidate = addDaysISO(candidate, -1);
  }
  return candidate;
}

/** Resolve the date input for Copy yesterday / Copy last weekday without doing IO. */
export function plannerCopySourceDate(targetDate: string, source: PlannerCopySource): string {
  requireCalendarDate(targetDate, 'targetDate');
  return source === 'yesterday' ? addDaysISO(targetDate, -1) : previousWeekdayISO(targetDate);
}

export type PlannerReplicateActionKind = 'copy-full-day' | 'copy-selected-blocks' | 'start-fresh';

export interface PlannerReplicateAction {
  decision: Replicate;
  action: PlannerReplicateActionKind;
  plan: DayPlan | null;
  copiedSourceBlockIds: string[];
  omittedSourceBlockIds: string[];
  explanation: string;
}

export interface PlannerReplicateOptions extends CopyPlannerDayOptions {
  /** Used only for Partial. Explicit selection wins over the completed-block fallback. */
  partialBlockIds?: readonly string[];
}

/**
 * Turn the end-of-day Yes/Partial/No answer into one inspectable operation.
 *
 * Yes copies the complete planning shape. Partial copies an explicit selection,
 * or completed blocks when no selection is supplied. No leaves the target
 * untouched and asks the caller to start fresh.
 */
export function createPlannerReplicateAction(
  source: DayPlan,
  targetDate: string,
  decision: Replicate,
  options: PlannerReplicateOptions = {}
): PlannerReplicateAction {
  requireCalendarDate(source.date, 'source.date');
  requireCalendarDate(targetDate, 'targetDate');
  if (decision === 'no') {
    return {
      decision,
      action: 'start-fresh',
      plan: null,
      copiedSourceBlockIds: [],
      omittedSourceBlockIds: source.sessions.map((block) => block.id),
      explanation: 'No plan was copied; the target day remains untouched for a fresh design.'
    };
  }

  const selected =
    decision === 'yes'
      ? source.sessions.map((block) => block.id)
      : options.partialBlockIds
        ? [...new Set(options.partialBlockIds)]
        : source.sessions
            .filter((block) => Boolean(block.execution?.completedAt))
            .map((block) => block.id);
  const selectedSet = new Set(selected);
  const plan = copyFullPlannerDay(source, targetDate, {
    updatedAt: options.updatedAt,
    operation: 'replicate'
  });
  if (decision === 'partial') {
    plan.sessions = plan.sessions.filter((_, index) => selectedSet.has(source.sessions[index].id));
  }
  const copiedSourceBlockIds = source.sessions
    .filter((block) => selectedSet.has(block.id))
    .map((block) => block.id);
  const omittedSourceBlockIds = source.sessions
    .filter((block) => !selectedSet.has(block.id))
    .map((block) => block.id);

  return {
    decision,
    action: decision === 'yes' ? 'copy-full-day' : 'copy-selected-blocks',
    plan,
    copiedSourceBlockIds,
    omittedSourceBlockIds,
    explanation:
      decision === 'yes'
        ? `Copied all ${copiedSourceBlockIds.length} blocks with fresh execution identities.`
        : options.partialBlockIds
          ? `Copied ${copiedSourceBlockIds.length} explicitly selected blocks; omitted ${omittedSourceBlockIds.length}.`
          : `Copied ${copiedSourceBlockIds.length} completed blocks as the proven part of the day; omitted ${omittedSourceBlockIds.length}.`
  };
}

export type PlannerRecurrenceKind = 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom';

export interface PlannerRecurrenceRule {
  kind: PlannerRecurrenceKind;
  startDate: string;
  endDate?: string | null;
  interval?: number;
  /** JavaScript weekday numbers: Sunday=0 through Saturday=6. */
  weekdays?: readonly number[];
  maxOccurrences?: number | null;
}

function recurrenceLimit(rule: PlannerRecurrenceRule): number {
  if (rule.maxOccurrences != null) {
    return boundedInteger(rule.maxOccurrences, 1, 1, MAX_RECURRENCE_OCCURRENCES);
  }
  return rule.endDate ? MAX_RECURRENCE_OCCURRENCES : 1;
}

function startOfWeekMonday(date: string): string {
  const day = weekday(date);
  return addDaysISO(date, -(day === 0 ? 6 : day - 1));
}

/** Expand an inclusive, bounded recurrence without reading or writing Planner state. */
export function expandPlannerRecurrenceDates(rule: PlannerRecurrenceRule): string[] {
  requireCalendarDate(rule.startDate, 'startDate');
  if (rule.endDate) requireCalendarDate(rule.endDate, 'endDate');
  if (rule.endDate && rule.endDate < rule.startDate) return [];
  const limit = recurrenceLimit(rule);
  if (rule.kind === 'none') return [rule.startDate];
  const interval = boundedInteger(rule.interval, 1, 1, 52);
  const through = rule.endDate ?? addDaysISO(rule.startDate, 366 * Math.max(1, interval));
  const results: string[] = [];

  if (rule.kind === 'daily' || rule.kind === 'weekly') {
    const step = rule.kind === 'daily' ? interval : interval * 7;
    for (
      let date = rule.startDate;
      date <= through && results.length < limit;
      date = addDaysISO(date, step)
    ) {
      results.push(date);
    }
    return results;
  }

  if (rule.kind === 'weekdays') {
    let eligibleIndex = 0;
    for (
      let date = rule.startDate;
      date <= through && results.length < limit;
      date = addDaysISO(date, 1)
    ) {
      const day = weekday(date);
      if (day === 0 || day === 6) continue;
      if (eligibleIndex % interval === 0) results.push(date);
      eligibleIndex += 1;
    }
    return results;
  }

  const allowedWeekdays = new Set(
    (rule.weekdays ?? [])
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .map((day) => Math.round(day))
  );
  if (allowedWeekdays.size === 0) return [];
  const anchorWeek = startOfWeekMonday(rule.startDate);
  for (
    let date = rule.startDate;
    date <= through && results.length < limit;
    date = addDaysISO(date, 1)
  ) {
    const weekOffset = Math.floor(
      (Date.parse(`${startOfWeekMonday(date)}T12:00:00Z`) - Date.parse(`${anchorWeek}T12:00:00Z`)) /
        (7 * 86_400_000)
    );
    if (weekOffset % interval === 0 && allowedWeekdays.has(weekday(date))) {
      results.push(date);
    }
  }
  return results;
}

export interface PlannerPlanVsActualRow {
  subject: string;
  mode: StudyMode;
  plannedBlockCount: number;
  completedBlockCount: number;
  timeEvidenceBlockCount: number;
  plannedMin: number;
  plannedMinWithActual: number;
  actualMin: number;
  estimationErrorMin: number;
  meanErrorMin: number | null;
  meanAbsoluteErrorMin: number | null;
  meanAbsolutePercentageErrorPct: number | null;
  /** Actual / planned for blocks with actual-time evidence; 1 is calibrated. */
  timeCalibrationFactor: number | null;
  overrunBlockCount: number;
  onTargetBlockCount: number;
  underrunBlockCount: number;
  plannedQuestions: number;
  plannedQuestionsWithResult: number;
  attemptedQuestions: number;
  questionCompletionPct: number | null;
  correctQuestions: number;
  incorrectQuestions: number;
  skippedQuestions: number;
  unscoredQuestions: number;
  answerAccuracyPct: number | null;
  completedOutcomeCount: number;
  partialOutcomeCount: number;
  missedOutcomeCount: number;
  inProgressOutcomeCount: number;
}

interface MutablePlannerPlanVsActualRow extends PlannerPlanVsActualRow {
  absoluteErrorTotal: number;
  absolutePercentageErrorTotal: number;
}

function emptyCalibrationRow(subject: string, mode: StudyMode): MutablePlannerPlanVsActualRow {
  return {
    subject,
    mode,
    plannedBlockCount: 0,
    completedBlockCount: 0,
    timeEvidenceBlockCount: 0,
    plannedMin: 0,
    plannedMinWithActual: 0,
    actualMin: 0,
    estimationErrorMin: 0,
    meanErrorMin: null,
    meanAbsoluteErrorMin: null,
    meanAbsolutePercentageErrorPct: null,
    timeCalibrationFactor: null,
    overrunBlockCount: 0,
    onTargetBlockCount: 0,
    underrunBlockCount: 0,
    plannedQuestions: 0,
    plannedQuestionsWithResult: 0,
    attemptedQuestions: 0,
    questionCompletionPct: null,
    correctQuestions: 0,
    incorrectQuestions: 0,
    skippedQuestions: 0,
    unscoredQuestions: 0,
    answerAccuracyPct: null,
    completedOutcomeCount: 0,
    partialOutcomeCount: 0,
    missedOutcomeCount: 0,
    inProgressOutcomeCount: 0,
    absoluteErrorTotal: 0,
    absolutePercentageErrorTotal: 0
  };
}

export interface PlannerPlanVsActualOptions {
  /** When supplied, future plans are excluded from both planned and actual totals. */
  throughDate?: string;
}

/** Build honest calibration scopes from blocks carrying actual execution/result evidence. */
export function plannerPlanVsActualBySubjectMode(
  plans: readonly DayPlan[],
  options: PlannerPlanVsActualOptions = {}
): PlannerPlanVsActualRow[] {
  if (options.throughDate) requireCalendarDate(options.throughDate, 'throughDate');
  const groups = new Map<string, MutablePlannerPlanVsActualRow>();
  for (const plan of plans) {
    if (options.throughDate && plan.date > options.throughDate) continue;
    for (const block of plan.sessions) {
      const subject = blockSubject(block);
      const key = `${subject}\u0000${block.mode}`;
      const row = groups.get(key) ?? emptyCalibrationRow(subject, block.mode);
      const plannedMin = Math.max(0, Math.round(block.durationMin || 0));
      row.plannedBlockCount += 1;
      row.plannedMin += plannedMin;
      if (block.execution?.completedAt) row.completedBlockCount += 1;
      const actual = block.execution?.actualMin;
      if (typeof actual === 'number' && Number.isFinite(actual) && actual >= 0) {
        const actualMin = Math.round(actual);
        const error = actualMin - plannedMin;
        row.timeEvidenceBlockCount += 1;
        row.plannedMinWithActual += plannedMin;
        row.actualMin += actualMin;
        row.absoluteErrorTotal += Math.abs(error);
        row.absolutePercentageErrorTotal += plannedMin > 0 ? Math.abs(error) / plannedMin : 0;
        if (error > 0) row.overrunBlockCount += 1;
        else if (error < 0) row.underrunBlockCount += 1;
        else row.onTargetBlockCount += 1;
      }

      if (block.launch?.kind === 'pyq') {
        row.plannedQuestions += block.launch.prescription.targetQuestionCount;
      }
      if (block.result?.kind === 'pyq') {
        const receipt = block.result.receipt;
        row.plannedQuestionsWithResult += receipt.requestedQuestionCount;
        row.attemptedQuestions += receipt.attemptedQuestionCount;
        row.correctQuestions += receipt.correctCount;
        row.incorrectQuestions += receipt.incorrectCount;
        row.skippedQuestions += receipt.skippedCount;
        row.unscoredQuestions += receipt.unscoredCount;
        if (receipt.outcome === 'completed') row.completedOutcomeCount += 1;
        else if (receipt.outcome === 'partial') row.partialOutcomeCount += 1;
        else if (receipt.outcome === 'abandoned') row.missedOutcomeCount += 1;
        else row.inProgressOutcomeCount += 1;
      }
      groups.set(key, row);
    }
  }

  return [...groups.values()]
    .map((row): PlannerPlanVsActualRow => {
      const evidence = row.timeEvidenceBlockCount;
      const graded = row.correctQuestions + row.incorrectQuestions;
      const { absoluteErrorTotal, absolutePercentageErrorTotal, ...publicRow } = row;
      return {
        ...publicRow,
        estimationErrorMin: row.actualMin - row.plannedMinWithActual,
        meanErrorMin:
          evidence === 0 ? null : round((row.actualMin - row.plannedMinWithActual) / evidence),
        meanAbsoluteErrorMin: evidence === 0 ? null : round(absoluteErrorTotal / evidence),
        meanAbsolutePercentageErrorPct:
          evidence === 0 ? null : round((absolutePercentageErrorTotal / evidence) * 100, 1),
        timeCalibrationFactor:
          row.plannedMinWithActual === 0
            ? null
            : round(row.actualMin / row.plannedMinWithActual, 3),
        questionCompletionPct:
          row.plannedQuestionsWithResult === 0
            ? null
            : round((row.attemptedQuestions / row.plannedQuestionsWithResult) * 100, 1),
        answerAccuracyPct: graded === 0 ? null : round((row.correctQuestions / graded) * 100, 1)
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.mode.localeCompare(b.mode));
}

export type PlannerRecoveryRateSource = 'explicit' | 'history' | 'fallback';

export interface ProposedPyqRecoveryLoadInput {
  plannerDate: string;
  block: StudySession;
  /** Explicit expected fraction of questions automatically captured for recovery. */
  expectedCaptureRate?: number;
  /** Used when no explicit rate is supplied and attemptedCount is positive. */
  historicalCapture?: {
    capturedCount: number;
    attemptedCount: number;
  };
  fallbackCaptureRate?: number;
  minutesPerReview?: number;
  reviewOffsetsDays?: readonly number[];
  /** Used only for an old untyped PYQ block. */
  fallbackPaceSeconds?: number;
}

export interface ProposedPyqRecoveryLoadDay {
  date: string;
  offsetDays: number;
  label: string;
  expectedReviews: number;
  estimatedMin: number;
}

export interface ProposedPyqRecoveryLoadEstimate {
  plannerDate: string;
  blockId: string;
  targetQuestionCount: number;
  questionCountSource: 'typed-prescription' | 'duration-and-pace';
  expectedCaptureRate: number;
  captureRateSource: PlannerRecoveryRateSource;
  expectedRecoveryItems: number;
  minutesPerReview: number;
  reviewOffsetsDays: number[];
  expectedReviewOccurrences: number;
  totalEstimatedMin: number;
  days: ProposedPyqRecoveryLoadDay[];
  formula: string;
  assumptions: string[];
}

/**
 * Estimate the incremental D3/D10/D30 burden created by a proposed PYQ block.
 * Every multiplier and fallback is returned so the UI never presents fake precision.
 */
export function estimateProposedPyqRecoveryLoad(
  input: ProposedPyqRecoveryLoadInput
): ProposedPyqRecoveryLoadEstimate {
  requireCalendarDate(input.plannerDate, 'plannerDate');
  const typedCount =
    input.block.launch?.kind === 'pyq' ? input.block.launch.prescription.targetQuestionCount : null;
  const fallbackPaceSeconds = boundedInteger(
    input.fallbackPaceSeconds,
    DEFAULT_PYQ_PACE_SECONDS,
    30,
    900
  );
  const targetQuestionCount =
    typedCount == null
      ? Math.max(1, Math.floor((Math.max(1, input.block.durationMin) * 60) / fallbackPaceSeconds))
      : Math.max(1, Math.round(typedCount));
  const history = input.historicalCapture;
  const hasHistory =
    history !== undefined &&
    Number.isFinite(history.attemptedCount) &&
    history.attemptedCount > 0 &&
    Number.isFinite(history.capturedCount);
  const fallbackRate = boundedRate(input.fallbackCaptureRate, DEFAULT_RECOVERY_CAPTURE_RATE);
  const captureRateSource: PlannerRecoveryRateSource =
    typeof input.expectedCaptureRate === 'number' && Number.isFinite(input.expectedCaptureRate)
      ? 'explicit'
      : hasHistory
        ? 'history'
        : 'fallback';
  const expectedCaptureRate =
    captureRateSource === 'explicit'
      ? boundedRate(input.expectedCaptureRate, fallbackRate)
      : captureRateSource === 'history'
        ? boundedRate(history!.capturedCount / history!.attemptedCount, fallbackRate)
        : fallbackRate;
  const minutesPerReview = boundedInteger(input.minutesPerReview, DEFAULT_RECOVERY_MINUTES, 1, 180);
  const offsets = [
    ...new Set(
      (input.reviewOffsetsDays ?? DEFAULT_RECOVERY_OFFSETS)
        .filter((offset) => Number.isFinite(offset) && offset >= 0)
        .map((offset) => Math.round(offset))
    )
  ].sort((a, b) => a - b);
  const expectedRecoveryItems = round(targetQuestionCount * expectedCaptureRate);
  const days = offsets.map((offsetDays, index): ProposedPyqRecoveryLoadDay => ({
    date: addDaysISO(input.plannerDate, offsetDays),
    offsetDays,
    label:
      offsetDays === 3
        ? 'D3'
        : offsetDays === 10
          ? 'D10'
          : offsetDays === 30
            ? 'D30'
            : `R${index + 1}`,
    expectedReviews: expectedRecoveryItems,
    estimatedMin: round(expectedRecoveryItems * minutesPerReview, 1)
  }));
  const expectedReviewOccurrences = round(expectedRecoveryItems * offsets.length);
  const totalEstimatedMin = round(expectedReviewOccurrences * minutesPerReview, 1);
  const ratePercent = round(expectedCaptureRate * 100, 1);

  return {
    plannerDate: input.plannerDate,
    blockId: input.block.id,
    targetQuestionCount,
    questionCountSource: typedCount == null ? 'duration-and-pace' : 'typed-prescription',
    expectedCaptureRate,
    captureRateSource,
    expectedRecoveryItems,
    minutesPerReview,
    reviewOffsetsDays: offsets,
    expectedReviewOccurrences,
    totalEstimatedMin,
    days,
    formula: `${targetQuestionCount} questions × ${ratePercent}% capture = ${expectedRecoveryItems} expected items; ${expectedRecoveryItems} × ${offsets.length} reviews × ${minutesPerReview}m = ${totalEstimatedMin}m.`,
    assumptions: [
      captureRateSource === 'explicit'
        ? `Capture rate was supplied explicitly (${ratePercent}%).`
        : captureRateSource === 'history'
          ? `Capture rate uses ${history!.capturedCount}/${history!.attemptedCount} historical attempts (${ratePercent}%).`
          : `No learner history was supplied; the disclosed fallback capture rate is ${ratePercent}%.`,
      typedCount == null
        ? `Question count is estimated from ${input.block.durationMin} minutes at ${fallbackPaceSeconds} seconds per question.`
        : `Question count comes from typed prescription ${input.block.launch!.prescription.id}.`,
      `Every expected item is conservatively assumed to reach all ${offsets.length} review offsets (${offsets.join(', ')} days).`,
      `Each review is budgeted at ${minutesPerReview} minutes.`
    ]
  };
}
