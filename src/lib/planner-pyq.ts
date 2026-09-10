import type {
  PyqAttemptRow,
  PyqExamKind,
  PyqHistoryFilter,
  PyqSessionConfig,
  PyqSessionMode,
  PyqSessionStatus
} from '@/types';
import type {
  PyqRecommendationCohort,
  PyqRecommendationPresetId
} from '@/lib/pyq-recommended-selection';
import { uuidFromString } from '@/lib/utils';

type PyqCountChoice = PyqSessionConfig['count'];
type PyqQuestionTypeChoice = PyqSessionConfig['type'];
type PyqOrderChoice = PyqSessionConfig['order'];

const FINITE_COUNT_CHOICES = [5, 10, 15, 25, 50] as const;

export interface PlannerPyqLaunchInput {
  plannerDate: string;
  plannerBlockId: string;
  subjectLabel: string;
  subjectSlug?: string;
  /** Exact immutable-bank subjects for one canonical syllabus subject. */
  subjectSlugs?: readonly string[];
  topicSlug?: string;
  bookSlug?: string;
  durationMin: number;
  /** Learner-specific pace wins over the old fixed three-minute assumption. */
  medianSecondsPerQuestion?: number;
  preferredQuestionCount?: number;
  history?: PyqHistoryFilter;
  fromYear?: number;
  toYear?: number;
  type?: PyqQuestionTypeChoice;
  order?: PyqOrderChoice;
  cohort?: PyqRecommendationCohort;
  mode?: PyqSessionMode;
  examKind?: PyqExamKind;
  selectionSeed?: string;
  /** Defaults to true so a planner handoff cannot silently consume a sealed benchmark. */
  protectSealedPapers?: boolean;
  /** A learner-approved hard allowlist. Its order is retained in the prescription receipt. */
  exactQuestionUids?: readonly string[];
}

export interface PlannerPyqLaunchPrescription {
  schemaVersion: 1;
  id: string;
  plannerDate: string;
  plannerBlockId: string;
  subjectLabel: string;
  durationMin: number;
  timeBudgetMin: number;
  paceSecPerQuestion: number;
  targetQuestionCount: number;
  questionBudget: number;
  estimatedDurationMin: number;
  capacityShortfallMin: number;
  cohort: PyqRecommendationCohort;
  selectionSeed: string;
  protectSealedPapers: boolean;
  exactQuestionUids: string[];
  config: Pick<
    PyqSessionConfig,
    | 'subjectSlug'
    | 'subjectSlugs'
    | 'topicSlug'
    | 'fromYear'
    | 'toYear'
    | 'type'
    | 'order'
    | 'count'
    | 'history'
    | 'mode'
    | 'recommendationPreset'
    | 'plannerTimeBudgetMin'
  > & {
    bookSlug?: string;
    examKind?: PyqExamKind;
  };
  explanation: string;
}

export type PlannerPyqReceiptAttempt = Pick<
  PyqAttemptRow,
  | 'id'
  | 'question_uid'
  | 'mark_correct'
  | 'mark_decision'
  | 'time_spent_sec'
  | 'score_thirds'
  | 'confidence'
  | 'question_marks'
  | 'scoring_status'
  | 'attempted_at'
>;

export interface PlannerPyqResultInput {
  prescription: PlannerPyqLaunchPrescription;
  sessionId: string;
  status: PyqSessionStatus;
  startedAt: string;
  completedAt: string | null;
  elapsedSec: number;
  questionUids?: readonly string[];
  recoveryItemIds?: readonly string[];
  attempts: readonly PlannerPyqReceiptAttempt[];
}

export interface PlannerPyqResultReceipt {
  schemaVersion: 1;
  id: string;
  prescriptionId: string;
  plannerDate: string;
  plannerBlockId: string;
  pyqSessionId: string;
  status: PyqSessionStatus;
  outcome: 'completed' | 'partial' | 'abandoned' | 'in-progress';
  startedAt: string;
  completedAt: string | null;
  exactQuestionUids: string[];
  submittedQuestionUids: string[];
  requestedQuestionCount: number;
  attemptedQuestionCount: number;
  submissionCount: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  unscoredCount: number;
  accuracyPct: number | null;
  completionPct: number;
  elapsedSec: number;
  activeAttemptSec: number;
  paceSecPerQuestion: number | null;
  scoreThirds: number | null;
  scorableMarks: number | null;
  possibleScorableMarks: number;
  scoringCoveragePct: number;
  confidenceSurpriseCount: number;
  recoveryItemIds: string[];
  recoveryItemsCreated: number;
  originalTargetStatus: 'met' | 'partial' | 'missed' | 'in-progress';
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const source = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(source)));
}

function nearestCount(target: number): (typeof FINITE_COUNT_CHOICES)[number] {
  return FINITE_COUNT_CHOICES.reduce((best, count) => {
    const distance = Math.abs(count - target);
    const bestDistance = Math.abs(best - target);
    return distance < bestDistance || (distance === bestDistance && count < best) ? count : best;
  }, FINITE_COUNT_CHOICES[0]);
}

function uniqueNonEmpty(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function presetForCohort(cohort: PyqRecommendationCohort): PyqRecommendationPresetId {
  if (cohort === 'unseen') return 'learn';
  if (cohort === 'slow-correct') return 'speed';
  if (cohort === 'transfer') return 'transfer';
  if (cohort === 'all') return 'diagnose';
  return 'repair';
}

function historyForCohort(
  cohort: PyqRecommendationCohort,
  requested: PyqHistoryFilter | undefined
): PyqHistoryFilter {
  if (requested) return requested;
  if (cohort === 'unseen') return 'unseen';
  if (cohort === 'wrong' || cohort === 'high-confidence-wrong') return 'incorrect';
  if (cohort === 'guessed-correct') return 'guessed';
  if (cohort === 'slow-correct') return 'slow';
  return 'all';
}

/** Convert a structured planner intent into a bounded PYQ practice prescription. */
export function createPlannerPyqLaunchPrescription(
  input: PlannerPyqLaunchInput
): PlannerPyqLaunchPrescription {
  const durationMin = boundedInteger(input.durationMin, 30, 5, 480);
  const paceSecPerQuestion = boundedInteger(input.medianSecondsPerQuestion, 180, 30, 900);
  const capacityCount = Math.max(1, Math.floor((durationMin * 60) / paceSecPerQuestion));
  const exactQuestionUids = uniqueNonEmpty(input.exactQuestionUids);
  const desiredCount = boundedInteger(input.preferredQuestionCount, capacityCount, 1, 50);
  const targetQuestionCount =
    exactQuestionUids.length > 0 ? exactQuestionUids.length : nearestCount(desiredCount);
  const estimatedDurationMin = Math.ceil((targetQuestionCount * paceSecPerQuestion) / 60);
  const capacityShortfallMin = Math.max(0, estimatedDurationMin - durationMin);
  const plannerYear = Number(input.plannerDate.slice(0, 4));
  const fallbackYear = Number.isInteger(plannerYear) ? plannerYear : 2026;
  const fromYear = boundedInteger(input.fromYear, 1990, 1980, 2100);
  const toYear = boundedInteger(input.toYear, fallbackYear, 1980, 2100);
  const lowYear = Math.min(fromYear, toYear);
  const highYear = Math.max(fromYear, toYear);
  const cohort = exactQuestionUids.length > 0 ? 'exact-uid' : (input.cohort ?? 'unseen');
  const history = historyForCohort(cohort, input.history);
  const count =
    exactQuestionUids.length > 0
      ? 'all'
      : (String(targetQuestionCount) as Exclude<PyqCountChoice, 'all'>);
  const subjectLabel = input.subjectLabel.trim() || 'All subjects';
  const subjectSlugs = uniqueNonEmpty(input.subjectSlugs);
  const subjectSlug =
    input.subjectSlug?.trim() || (subjectSlugs.length === 1 ? subjectSlugs[0] : 'all');
  const topic = input.topicSlug?.trim() || 'all';
  const mode = input.mode ?? 'practice';
  const preset = presetForCohort(cohort);
  const selectionSeed =
    input.selectionSeed?.trim() ||
    `planner-${input.plannerDate}-${input.plannerBlockId}-${preset}-${targetQuestionCount}`;
  const contentRevision = uuidFromString(
    JSON.stringify([
      subjectLabel,
      subjectSlug,
      subjectSlugs,
      topic,
      durationMin,
      paceSecPerQuestion,
      targetQuestionCount,
      cohort,
      selectionSeed,
      input.protectSealedPapers !== false,
      exactQuestionUids,
      mode,
      input.examKind ?? null,
      lowYear,
      highYear,
      input.type ?? 'all',
      input.order ?? null,
      history
    ])
  );

  return {
    schemaVersion: 1,
    id: `planner-pyq:${input.plannerDate}:${input.plannerBlockId}:${contentRevision}:v1`,
    plannerDate: input.plannerDate,
    plannerBlockId: input.plannerBlockId,
    subjectLabel,
    durationMin,
    timeBudgetMin: durationMin,
    paceSecPerQuestion,
    targetQuestionCount,
    questionBudget: targetQuestionCount,
    estimatedDurationMin,
    capacityShortfallMin,
    cohort,
    selectionSeed,
    protectSealedPapers: input.protectSealedPapers !== false,
    exactQuestionUids,
    config: {
      ...(input.bookSlug?.trim() ? { bookSlug: input.bookSlug.trim() } : {}),
      subjectSlug,
      ...(subjectSlugs.length > 0 ? { subjectSlugs } : {}),
      topicSlug: topic,
      fromYear: lowYear,
      toYear: highYear,
      type: input.type ?? 'all',
      order: input.order ?? (history === 'unseen' ? 'unseen' : 'random'),
      count,
      history,
      mode,
      recommendationPreset: preset,
      plannerTimeBudgetMin: durationMin,
      ...(mode === 'exam' ? { examKind: input.examKind ?? 'timed-set' } : {})
    },
    explanation:
      capacityShortfallMin === 0
        ? `${targetQuestionCount} ${cohort === 'exact-uid' ? 'approved exact-set' : cohort} ${subjectLabel}${topic === 'all' ? '' : `/${topic}`} questions fit a ${durationMin}m block at ${paceSecPerQuestion}s per question.`
        : `${targetQuestionCount} is the smallest supported set, estimated at ${estimatedDurationMin}m (${capacityShortfallMin}m over this block).`
  };
}

/** Search parameters supported now plus structured filters that can be adopted incrementally. */
export function plannerPyqPrescriptionSearchParams(
  prescription: PlannerPyqLaunchPrescription
): URLSearchParams {
  const params = new URLSearchParams({
    plannerDate: prescription.plannerDate,
    plannerBlock: prescription.plannerBlockId,
    subject: prescription.subjectLabel,
    subjectSlug: prescription.config.subjectSlug,
    topic: prescription.config.topicSlug ?? 'all',
    fromYear: String(prescription.config.fromYear),
    toYear: String(prescription.config.toYear),
    type: prescription.config.type,
    order: prescription.config.order,
    count: prescription.config.count,
    history: prescription.config.history ?? 'all',
    preset: prescription.config.recommendationPreset ?? 'diagnose',
    cohort: prescription.cohort,
    seed: prescription.selectionSeed,
    mode: prescription.config.mode ?? 'practice',
    protectSealed: prescription.protectSealedPapers ? '1' : '0',
    plannerPrescription: prescription.id
  });
  params.set('duration', String(prescription.timeBudgetMin));
  if (prescription.config.subjectSlugs?.length) {
    params.set('subjectSlugs', prescription.config.subjectSlugs.join(','));
  }
  if (prescription.config.bookSlug) params.set('book', prescription.config.bookSlug);
  if (prescription.config.examKind) params.set('examKind', prescription.config.examKind);
  if (prescription.exactQuestionUids.length > 0) {
    params.set('questionUids', prescription.exactQuestionUids.join(','));
  }
  return params;
}

export function plannerPyqPrescriptionHref(prescription: PlannerPyqLaunchPrescription): string {
  return `/pyq?${plannerPyqPrescriptionSearchParams(prescription).toString()}`;
}

function latestAttemptByQuestion(
  attempts: readonly PlannerPyqReceiptAttempt[]
): Map<string, PlannerPyqReceiptAttempt> {
  const latest = new Map<string, PlannerPyqReceiptAttempt>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.question_uid);
    if (!current || attempt.attempted_at >= current.attempted_at) {
      latest.set(attempt.question_uid, attempt);
    }
  }
  return latest;
}

/** Summarize immutable PYQ attempts into a planner-facing completion receipt. */
export function createPlannerPyqResultReceipt(
  input: PlannerPyqResultInput
): PlannerPyqResultReceipt {
  const latest = [...latestAttemptByQuestion(input.attempts).values()];
  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;
  let unscoredCount = 0;
  let activeAttemptSec = 0;
  let scoreThirds = 0;
  let hasScore = false;
  let possibleScorableMarks = 0;
  let scorableCount = 0;
  let confidenceSurpriseCount = 0;
  for (const attempt of latest) {
    activeAttemptSec += Math.max(0, Math.round(attempt.time_spent_sec));
    if (attempt.mark_decision === 'SKIP') skippedCount += 1;
    else if (attempt.mark_correct === true) correctCount += 1;
    else if (attempt.mark_correct === false) incorrectCount += 1;
    else unscoredCount += 1;
    if (typeof attempt.score_thirds === 'number' && Number.isFinite(attempt.score_thirds)) {
      scoreThirds += attempt.score_thirds;
      hasScore = true;
    }
    if (
      attempt.scoring_status !== 'unscorable' &&
      (attempt.question_marks === 1 || attempt.question_marks === 2)
    ) {
      possibleScorableMarks += attempt.question_marks;
      scorableCount += 1;
    }
    if (attempt.mark_correct === false && attempt.confidence === 'high') {
      confidenceSurpriseCount += 1;
    }
  }
  const attemptedQuestionCount = latest.length;
  const gradableCount = correctCount + incorrectCount;
  const completionPct = Math.min(
    100,
    Math.round((attemptedQuestionCount / input.prescription.targetQuestionCount) * 100)
  );
  const elapsedSec = Math.max(0, Math.round(input.elapsedSec));
  const outcome =
    input.status === 'abandoned'
      ? 'abandoned'
      : input.status === 'completed'
        ? completionPct >= 100
          ? 'completed'
          : 'partial'
        : 'in-progress';
  const exactQuestionUids = uniqueNonEmpty(
    input.questionUids ?? input.prescription.exactQuestionUids
  );
  const submittedQuestionUids = latest.map((attempt) => attempt.question_uid);
  const recoveryItemIds = uniqueNonEmpty(input.recoveryItemIds);
  const originalTargetStatus =
    outcome === 'in-progress'
      ? 'in-progress'
      : completionPct >= 100
        ? 'met'
        : attemptedQuestionCount > 0
          ? 'partial'
          : 'missed';

  return {
    schemaVersion: 1,
    id: `${input.prescription.id}:${input.sessionId}`,
    prescriptionId: input.prescription.id,
    plannerDate: input.prescription.plannerDate,
    plannerBlockId: input.prescription.plannerBlockId,
    pyqSessionId: input.sessionId,
    status: input.status,
    outcome,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    exactQuestionUids,
    submittedQuestionUids,
    requestedQuestionCount: input.prescription.targetQuestionCount,
    attemptedQuestionCount,
    submissionCount: input.attempts.length,
    correctCount,
    incorrectCount,
    skippedCount,
    unscoredCount,
    accuracyPct: gradableCount === 0 ? null : Math.round((correctCount / gradableCount) * 100),
    completionPct,
    elapsedSec,
    activeAttemptSec,
    paceSecPerQuestion:
      attemptedQuestionCount === 0 ? null : Math.round(elapsedSec / attemptedQuestionCount),
    scoreThirds: hasScore ? scoreThirds : null,
    scorableMarks: hasScore ? scoreThirds / 3 : null,
    possibleScorableMarks,
    scoringCoveragePct:
      attemptedQuestionCount === 0 ? 0 : Math.round((scorableCount / attemptedQuestionCount) * 100),
    confidenceSurpriseCount,
    recoveryItemIds,
    recoveryItemsCreated: recoveryItemIds.length,
    originalTargetStatus
  };
}
