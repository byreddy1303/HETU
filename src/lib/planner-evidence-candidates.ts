import { targetTimeSecForMarks } from '@/lib/constants';
import {
  plannerCandidatesFromSessions,
  type PlannerCandidateKind,
  type PlannerEnergyNeed,
  type PlannerWorkCandidate
} from '@/lib/planner-compiler';
import { plannerBlockHref } from '@/lib/planner-execution';
import type { Priority, StudySession } from '@/lib/planner-storage';
import type { DebtEntry, ReadinessSnapshot } from '@/lib/readiness-snapshots';
import { uuidFromString } from '@/lib/utils';
import type {
  FormulaRow,
  LearningItemRow,
  PyqAttemptRow,
  ReattemptRow,
  WeeklyReviewRow
} from '@/types';

export interface PlannerIncompleteSyllabusTopic {
  /** Stable official-registry identity when one is available. */
  id: string;
  subject: string;
  topic: string;
  estimatedMin?: number;
  priority?: Priority;
  href?: string;
}

export interface BuildPlannerEvidenceCandidatesInput {
  asOfDate: string;
  learningItems?: readonly LearningItemRow[];
  /** Compatibility projections are included only when no canonical item owns them. */
  reattempts?: readonly ReattemptRow[];
  pyqAttempts?: readonly PyqAttemptRow[];
  /** Journal/source receipts already diagnosed outside the canonical item projection. */
  analyzedAttemptIds?: ReadonlySet<string> | readonly string[];
  formulas?: readonly FormulaRow[];
  currentWeeklyReview?: WeeklyReviewRow | null;
  incompleteSyllabusTopics?: readonly PlannerIncompleteSyllabusTopic[];
  readinessDebt?: readonly DebtEntry[];
  readinessSnapshots?: readonly ReadinessSnapshot[];
  /** Only unfinished P1/P2 commitments are retained as compiler candidates. */
  existingSessions?: readonly StudySession[];
}

interface CandidateDraft extends PlannerWorkCandidate {
  reasonParts: string[];
}

type ReadinessComponent = DebtEntry['component'];

const PRIORITY_RANK: Record<Priority, number> = {
  'P1 Critical': 0,
  'P2 High': 1,
  'P3 Medium': 2,
  'P4 Low': 3
};

const KIND_RANK: Record<PlannerCandidateKind, number> = {
  reattempt: 0,
  analysis: 1,
  formula: 2,
  guess: 3,
  slow: 4,
  planned: 5,
  pyq: 6,
  mock: 7,
  study: 8
};

const READINESS_HEALTHY: Record<ReadinessComponent, number> = {
  coverage: 0.6,
  retention: 0.55,
  calibration: 0.65,
  surface: 0.6
};

const READINESS_LABEL: Record<ReadinessComponent, string> = {
  coverage: 'coverage',
  retention: 'retention',
  calibration: 'calibration',
  surface: 'mistake-surface control'
};

function clampMinutes(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, finite));
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function validDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function daysBetween(later: string, earlier: string): number {
  if (!validDate(later) || !validDate(earlier)) return 0;
  return Math.round(
    (Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86_400_000
  );
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function analyzedIds(
  value: BuildPlannerEvidenceCandidatesInput['analyzedAttemptIds']
): Set<string> {
  if (!value) return new Set<string>();
  return new Set(Array.isArray(value) ? value : [...value]);
}

function strongerPriority(left: Priority | undefined, right: Priority | undefined): Priority {
  const leftValue = left ?? 'P3 Medium';
  const rightValue = right ?? 'P3 Medium';
  return PRIORITY_RANK[leftValue] <= PRIORITY_RANK[rightValue] ? leftValue : rightValue;
}

function appendReason(draft: CandidateDraft, reason: string): void {
  const clean = reason.trim().replace(/[.]+$/, '');
  if (clean && !draft.reasonParts.includes(clean)) draft.reasonParts.push(clean);
}

function finalizeReason(parts: readonly string[]): string {
  return parts.length > 0 ? `${parts.join('; ')}.` : 'Selected from current learning evidence.';
}

function subjectIfSingle(values: readonly (string | null | undefined)[]): string | undefined {
  const subjects = uniqueStrings(values);
  return subjects.length === 1 ? subjects[0] : undefined;
}

function stableRow<T extends { id: string }>(left: T, right: T): T {
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);
  return leftJson.localeCompare(rightJson) >= 0 ? left : right;
}

function uniqueRowsById<T extends { id: string }>(rows: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const current = byId.get(row.id);
    byId.set(row.id, current ? stableRow(current, row) : row);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function latestAttemptByQuestion(attempts: readonly PyqAttemptRow[]): PyqAttemptRow[] {
  const latest = new Map<string, PyqAttemptRow>();
  for (const attempt of uniqueRowsById(attempts)) {
    const current = latest.get(attempt.question_uid);
    if (
      !current ||
      attempt.attempted_at > current.attempted_at ||
      (attempt.attempted_at === current.attempted_at &&
        (attempt.attempt_number > current.attempt_number ||
          (attempt.attempt_number === current.attempt_number && attempt.id > current.id)))
    ) {
      latest.set(attempt.question_uid, attempt);
    }
  }
  return [...latest.values()].sort((left, right) =>
    left.question_uid.localeCompare(right.question_uid)
  );
}

function exactPyqHref(args: {
  history: 'incorrect' | 'guessed' | 'slow' | 'unanalyzed';
  preset: 'repair' | 'speed';
  questionUids: readonly string[];
}): string {
  const params = new URLSearchParams({
    history: args.history,
    preset: args.preset,
    questionUids: uniqueStrings(args.questionUids).join(',')
  });
  return `/pyq?${params.toString()}`;
}

function candidateText(candidate: PlannerWorkCandidate): string {
  return normalizedText(
    [candidate.subject, candidate.title, candidate.detail].filter(Boolean).join(' ')
  );
}

function containsEvidence(
  candidate: PlannerWorkCandidate,
  value: string | null | undefined
): boolean {
  const needle = normalizedText(value);
  return needle.length >= 4 && candidateText(candidate).includes(needle);
}

function latestComparableSnapshots(snapshots: readonly ReadinessSnapshot[]): {
  latest: ReadinessSnapshot | null;
  previous: ReadinessSnapshot | null;
} {
  const sorted = snapshots
    .filter((snapshot) => validDate(snapshot.date))
    .slice()
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.calculationVersion - right.calculationVersion ||
        left.score - right.score
    );
  const latest = sorted.at(-1) ?? null;
  if (!latest) return { latest: null, previous: null };
  const sameVersion = sorted.filter(
    (snapshot) =>
      snapshot.calculationVersion === latest.calculationVersion && snapshot.date < latest.date
  );
  return { latest, previous: sameVersion.at(-1) ?? null };
}

function readinessAction(
  component: ReadinessComponent,
  subject?: string | null
): {
  kind: PlannerCandidateKind;
  title: string;
  href: string;
  energy: PlannerEnergyNeed;
} {
  const label = subject?.trim()
    ? `${subject.trim()} ${READINESS_LABEL[component]}`
    : READINESS_LABEL[component];
  const params = new URLSearchParams({ component });
  if (subject?.trim()) params.set('subject', subject.trim());
  if (component === 'coverage') {
    return {
      kind: 'study',
      title: `Close ${label} debt`,
      href: `/syllabus?${params.toString()}`,
      energy: 'medium'
    };
  }
  if (component === 'calibration') {
    params.set('preset', 'diagnose');
    return {
      kind: 'pyq',
      title: `Calibrate ${label}`,
      href: `/pyq?${params.toString()}`,
      energy: 'medium'
    };
  }
  return {
    kind: 'reattempt',
    title: `Strengthen ${label}`,
    href: `/reattempts?open=first&${params.toString()}`,
    energy: 'low'
  };
}

function recoveryEstimate(item: LearningItemRow): number {
  const stageMinutes: Record<LearningItemRow['stage'], number> = {
    D3: 5,
    D10: 7,
    D30: 9,
    TRANSFER: 12,
    MASTERED: 0
  };
  return stageMinutes[item.stage] + Math.min(6, Math.max(0, item.lapse_count) * 2);
}

/**
 * Convert current learning evidence into deterministic, explainable Planner work.
 *
 * This adapter performs no I/O, never mutates its inputs, keeps PYQ cohorts
 * mutually exclusive, and collapses canonical/compatibility projections so
 * one underlying obligation cannot appear twice.
 */
export function buildPlannerEvidenceCandidates(
  input: BuildPlannerEvidenceCandidatesInput
): PlannerWorkCandidate[] {
  const drafts = new Map<string, CandidateDraft>();

  const add = (candidate: PlannerWorkCandidate, reasons: readonly string[]): CandidateDraft => {
    const current = drafts.get(candidate.id);
    if (current) {
      current.estimatedMin = Math.max(current.estimatedMin, candidate.estimatedMin);
      current.priority = strongerPriority(current.priority, candidate.priority);
      current.required = Boolean(current.required || candidate.required);
      if (candidate.dueDate && (!current.dueDate || candidate.dueDate < current.dueDate)) {
        current.dueDate = candidate.dueDate;
      }
      for (const reason of reasons) appendReason(current, reason);
      return current;
    }
    const draft: CandidateDraft = { ...candidate, reasonParts: [] };
    for (const reason of reasons) appendReason(draft, reason);
    drafts.set(draft.id, draft);
    return draft;
  };

  const sessionById = new Map(
    uniqueRowsById(input.existingSessions ?? []).map((session) => [session.id, session])
  );
  for (const session of [...sessionById.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    if (
      session.execution?.completedAt ||
      (session.priority !== 'P1 Critical' && session.priority !== 'P2 High')
    ) {
      continue;
    }
    const candidate = plannerCandidatesFromSessions([session], input.asOfDate)[0];
    if (!candidate) continue;
    add({ ...candidate, href: plannerBlockHref(input.asOfDate, session) }, [
      candidate.reason ?? `${session.priority} Planner commitment`
    ]);
  }

  const canonicalItems = uniqueRowsById(input.learningItems ?? []);
  const canonicalIds = new Set(canonicalItems.map((item) => item.id));
  const dueLearning = canonicalItems.filter(
    (item) =>
      item.recovery_state !== 'mastered' &&
      item.recovery_state !== 'paused' &&
      item.stage !== 'MASTERED' &&
      validDate(item.scheduled_date) &&
      item.scheduled_date <= input.asOfDate
  );
  const dueLegacy = uniqueRowsById(input.reattempts ?? []).filter(
    (row) =>
      row.stage !== 'MASTERED' &&
      validDate(row.scheduled_date) &&
      row.scheduled_date <= input.asOfDate &&
      (!row.learning_item_id || !canonicalIds.has(row.learning_item_id))
  );
  if (dueLearning.length > 0 || dueLegacy.length > 0) {
    const dueDates = [
      ...dueLearning.flatMap((item) =>
        validDate(item.scheduled_date) ? [item.scheduled_date] : []
      ),
      ...dueLegacy.map((row) => row.scheduled_date)
    ].sort();
    const overdue = dueDates.filter((date) => date < input.asOfDate);
    const maximumOverdueDays = overdue.reduce(
      (maximum, date) => Math.max(maximum, daysBetween(input.asOfDate, date)),
      0
    );
    const confidenceSurprises = dueLearning.filter((item) =>
      item.reason_flags.includes('high-confidence-wrong')
    ).length;
    const lapseCount = dueLearning.reduce(
      (total, item) => total + Math.max(0, item.lapse_count),
      0
    );
    const estimatedMin = clampMinutes(
      dueLearning.reduce((total, item) => total + recoveryEstimate(item), 0) +
        dueLegacy.reduce(
          (total, row) =>
            total +
            5 +
            Math.min(6, row.history.filter((entry) => entry.result === 'fail').length * 2),
          0
        ),
      15,
      90
    );
    const count = dueLearning.length + dueLegacy.length;
    add(
      {
        id: 'evidence:due-recovery',
        kind: 'reattempt',
        title: `Clear ${count} due recovery ${count === 1 ? 'item' : 'items'}`,
        detail: `${dueLearning.length} canonical · ${dueLegacy.length} legacy-only · ${overdue.length} overdue`,
        subject: subjectIfSingle(dueLearning.map((item) => item.subject)),
        estimatedMin,
        priority:
          overdue.length > 0 || confidenceSurprises > 0 || lapseCount >= 2
            ? 'P1 Critical'
            : 'P2 High',
        energy: 'low',
        dueDate: dueDates[0],
        required: true,
        splittable: true,
        href: '/reattempts?open=first'
      },
      [
        `${count} blind-retrieval ${count === 1 ? 'review is' : 'reviews are'} due before new exposure`,
        ...(overdue.length > 0
          ? [`${overdue.length} overdue, with the oldest ${maximumOverdueDays} days late`]
          : ['all recovery work is due today']),
        ...(lapseCount > 0 ? [`${lapseCount} recorded recovery lapses`] : []),
        ...(confidenceSurprises > 0
          ? [
              `${confidenceSurprises} high-confidence wrong ${confidenceSurprises === 1 ? 'answer needs' : 'answers need'} correction`
            ]
          : [])
      ]
    );
  }

  const completedAnalysisIds = analyzedIds(input.analyzedAttemptIds);
  for (const item of canonicalItems) {
    if (item.analysis_state !== 'completed') continue;
    if (item.origin_pyq_attempt_id) completedAnalysisIds.add(item.origin_pyq_attempt_id);
    if (item.latest_pyq_attempt_id) completedAnalysisIds.add(item.latest_pyq_attempt_id);
  }
  const latestAttempts = latestAttemptByQuestion(input.pyqAttempts ?? []);
  const pendingWrong = latestAttempts.filter(
    (attempt) => attempt.mark_correct === false && !completedAnalysisIds.has(attempt.id)
  );
  const pendingUids = new Set(pendingWrong.map((attempt) => attempt.question_uid));
  if (pendingWrong.length > 0) {
    const highConfidenceWrong = pendingWrong.filter(
      (attempt) =>
        attempt.confidence === 'high' ||
        (attempt.confidence == null && attempt.mark_decision === 'MARK')
    ).length;
    const attemptedDates = pendingWrong
      .map((attempt) => attempt.attempted_at.slice(0, 10))
      .filter(validDate)
      .sort();
    const olderThanToday = attemptedDates.filter((date) => date < input.asOfDate).length;
    add(
      {
        id: 'evidence:pending-analysis',
        kind: 'analysis',
        title: `Analyze ${pendingWrong.length} pending wrong ${pendingWrong.length === 1 ? 'PYQ' : 'PYQs'}`,
        detail: 'Convert wrong receipts into a root cause and a repair cue before another attempt.',
        subject: subjectIfSingle(pendingWrong.map((attempt) => attempt.subject)),
        estimatedMin: clampMinutes(pendingWrong.length * 8, 15, 75),
        priority: highConfidenceWrong > 0 || olderThanToday > 0 ? 'P1 Critical' : 'P2 High',
        energy: 'medium',
        dueDate: attemptedDates[0] ?? input.asOfDate,
        required: true,
        splittable: true,
        href: exactPyqHref({
          history: 'unanalyzed',
          preset: 'repair',
          questionUids: pendingWrong.map((attempt) => attempt.question_uid)
        })
      },
      [
        `${pendingWrong.length} latest wrong ${pendingWrong.length === 1 ? 'receipt has' : 'receipts have'} no completed analysis`,
        ...(olderThanToday > 0
          ? [
              `${olderThanToday} pending ${olderThanToday === 1 ? 'receipt predates' : 'receipts predate'} today`
            ]
          : []),
        ...(highConfidenceWrong > 0
          ? [
              `${highConfidenceWrong} high-confidence surprise ${highConfidenceWrong === 1 ? 'raises' : 'raise'} urgency`
            ]
          : [])
      ]
    );
  }

  const guessed = latestAttempts.filter(
    (attempt) =>
      attempt.mark_correct === true &&
      attempt.mark_decision === 'FIFTY_FIFTY' &&
      !pendingUids.has(attempt.question_uid)
  );
  const guessedUids = new Set(guessed.map((attempt) => attempt.question_uid));
  const guessedAndSlow = guessed.filter(
    (attempt) =>
      attempt.time_spent_sec >
      targetTimeSecForMarks(attempt.question_marks ?? attempt.question_snapshot?.marks)
  ).length;
  if (guessed.length > 0) {
    add(
      {
        id: 'evidence:guessed-correct',
        kind: 'guess',
        title: `Retest ${guessed.length} guessed-correct ${guessed.length === 1 ? 'PYQ' : 'PYQs'}`,
        detail: 'Retrieve the governing reason without choices, then reject each distractor.',
        subject: subjectIfSingle(guessed.map((attempt) => attempt.subject)),
        estimatedMin: clampMinutes(guessed.length * 5, 15, 60),
        priority: 'P2 High',
        energy: 'medium',
        required: false,
        splittable: true,
        href: exactPyqHref({
          history: 'guessed',
          preset: 'repair',
          questionUids: guessed.map((attempt) => attempt.question_uid)
        })
      },
      [
        `${guessed.length} latest correct ${guessed.length === 1 ? 'answer was' : 'answers were'} marked fifty-fifty`,
        ...(guessedAndSlow > 0
          ? [
              `${guessedAndSlow} ${guessedAndSlow === 1 ? 'was' : 'were'} also slower than the mark-based target`
            ]
          : []),
        'question UIDs are excluded from the separate speed cohort'
      ]
    );
  }

  const slow = latestAttempts.filter(
    (attempt) =>
      attempt.mark_correct === true &&
      !pendingUids.has(attempt.question_uid) &&
      !guessedUids.has(attempt.question_uid) &&
      attempt.time_spent_sec >
        targetTimeSecForMarks(attempt.question_marks ?? attempt.question_snapshot?.marks)
  );
  if (slow.length > 0) {
    const excessSec = slow.reduce(
      (total, attempt) =>
        total +
        Math.max(
          0,
          attempt.time_spent_sec -
            targetTimeSecForMarks(attempt.question_marks ?? attempt.question_snapshot?.marks)
        ),
      0
    );
    add(
      {
        id: 'evidence:slow-correct',
        kind: 'slow',
        title: `Compress ${slow.length} slow-correct ${slow.length === 1 ? 'PYQ' : 'PYQs'}`,
        detail: 'Rehearse the opening move until the method begins inside the mark-based target.',
        subject: subjectIfSingle(slow.map((attempt) => attempt.subject)),
        estimatedMin: clampMinutes(slow.length * 4, 15, 60),
        priority: 'P3 Medium',
        energy: 'medium',
        required: false,
        splittable: true,
        href: exactPyqHref({
          history: 'slow',
          preset: 'speed',
          questionUids: slow.map((attempt) => attempt.question_uid)
        })
      },
      [
        `${slow.length} latest correct ${slow.length === 1 ? 'answer exceeds' : 'answers exceed'} the mark-based pace target`,
        `${Math.ceil(excessSec / 60)} total minutes above target`,
        'guessed-correct UIDs are handled once in the higher-priority uncertainty cohort'
      ]
    );
  }

  const dueFormulas = uniqueRowsById(input.formulas ?? []).filter(
    (formula) => validDate(formula.next_review) && formula.next_review <= input.asOfDate
  );
  if (dueFormulas.length > 0) {
    const formulaDates = dueFormulas.map((formula) => formula.next_review).sort();
    const overdueCount = formulaDates.filter((date) => date < input.asOfDate).length;
    const forgotCount = dueFormulas.reduce(
      (total, formula) => total + Math.max(0, formula.forgot_count),
      0
    );
    add(
      {
        id: 'evidence:due-formulas',
        kind: 'formula',
        title: `Recall ${dueFormulas.length} due ${dueFormulas.length === 1 ? 'formula' : 'formulas'}`,
        detail: 'Commit each expression from memory before revealing the saved formula.',
        subject: subjectIfSingle(dueFormulas.map((formula) => formula.subject)),
        estimatedMin: clampMinutes(dueFormulas.length * 3 + Math.min(15, forgotCount), 10, 60),
        priority: overdueCount > 0 && forgotCount > 0 ? 'P1 Critical' : 'P2 High',
        energy: 'low',
        dueDate: formulaDates[0],
        required: overdueCount > 0,
        splittable: true,
        href: '/formulas?due=1'
      },
      [
        `${dueFormulas.length} formula ${dueFormulas.length === 1 ? 'recall is' : 'recalls are'} due`,
        ...(overdueCount > 0 ? [`${overdueCount} overdue`] : ['all are due today']),
        ...(forgotCount > 0 ? [`${forgotCount} prior forgotten-recall events`] : [])
      ]
    );
  }

  const syllabusDraftIds: string[] = [];
  const syllabusGaps = new Map<string, PlannerIncompleteSyllabusTopic>();
  for (const gap of input.incompleteSyllabusTopics ?? []) {
    const subject = gap.subject.trim();
    const topic = gap.topic.trim();
    if (!subject || !topic) continue;
    const key = `${normalizedText(subject)}\u0000${normalizedText(topic)}`;
    const current = syllabusGaps.get(key);
    syllabusGaps.set(key, current ? stableRow(current, gap) : { ...gap, subject, topic });
  }
  for (const gap of [...syllabusGaps.values()].sort(
    (left, right) =>
      left.subject.localeCompare(right.subject) ||
      left.topic.localeCompare(right.topic) ||
      left.id.localeCompare(right.id)
  )) {
    const matchingPlanned = [...drafts.values()].find(
      (candidate) =>
        candidate.kind === 'planned' &&
        normalizedText(candidate.subject) === normalizedText(gap.subject) &&
        containsEvidence(candidate, gap.topic)
    );
    if (matchingPlanned) {
      appendReason(
        matchingPlanned,
        `${gap.subject} / ${gap.topic} is still incomplete in the official syllabus tracker`
      );
      continue;
    }
    const id = `evidence:syllabus:${uuidFromString(`${normalizedText(gap.subject)}\u0000${normalizedText(gap.topic)}`)}`;
    const params = new URLSearchParams({ subject: gap.subject, topic: gap.topic });
    add(
      {
        id,
        kind: 'study',
        title: `Advance ${gap.topic}`,
        detail: `${gap.subject} · incomplete official syllabus topic`,
        subject: gap.subject,
        estimatedMin: clampMinutes(gap.estimatedMin ?? 45, 15, 120),
        priority: gap.priority ?? 'P3 Medium',
        energy: 'high',
        required: false,
        splittable: true,
        href: gap.href?.trim() || `/syllabus?${params.toString()}`
      },
      [`${gap.subject} / ${gap.topic} has no recorded completion`]
    );
    syllabusDraftIds.push(id);
  }

  const weeklyFix = input.currentWeeklyReview?.this_weeks_fix?.trim() ?? '';
  const weakestConcept = input.currentWeeklyReview?.weakest_concept?.trim() ?? '';
  if (input.currentWeeklyReview && (weeklyFix || weakestConcept)) {
    const matching = [...drafts.values()].find(
      (candidate) =>
        (candidate.kind === 'planned' || syllabusDraftIds.includes(candidate.id)) &&
        (containsEvidence(candidate, weakestConcept) || containsEvidence(candidate, weeklyFix))
    );
    const weeklyReason = [
      ...(weakestConcept ? [`weekly review names ${weakestConcept} as the weakest concept`] : []),
      ...(weeklyFix ? [`approved weekly fix: ${weeklyFix}`] : [])
    ].join('; ');
    if (matching) {
      matching.priority = strongerPriority(matching.priority, 'P2 High');
      appendReason(matching, weeklyReason);
    } else {
      add(
        {
          id: `evidence:weekly-focus:${input.currentWeeklyReview.id}`,
          kind: 'study',
          title: weeklyFix || `Repair ${weakestConcept}`,
          detail: weakestConcept
            ? `Weekly focus · weakest concept: ${weakestConcept}`
            : 'Weekly focus',
          estimatedMin: 45,
          priority: 'P2 High',
          energy: 'high',
          required: false,
          splittable: true,
          href: '/weekly-review'
        },
        [weeklyReason]
      );
    }
  }

  const { latest: latestReadiness, previous: previousReadiness } = latestComparableSnapshots(
    input.readinessSnapshots ?? []
  );
  const snapshotDelta =
    latestReadiness && previousReadiness ? latestReadiness.score - previousReadiness.score : null;
  const readinessValue = (component: ReadinessComponent): number | null =>
    latestReadiness ? latestReadiness[component] : null;
  const readinessReason = (
    component: ReadinessComponent,
    subject: string | null,
    debt?: DebtEntry
  ): string => {
    const value = readinessValue(component);
    const pieces = [
      `${subject ? `${subject} ` : ''}${READINESS_LABEL[component]} remains a readiness gap`,
      ...(debt
        ? [
            `held for ${debt.weeksHeld} ${debt.weeksHeld === 1 ? 'week' : 'weeks'} since ${debt.since}`
          ]
        : []),
      ...(value === null
        ? []
        : [`latest ${READINESS_LABEL[component]} evidence is ${Math.round(value * 100)}%`]),
      ...(latestReadiness ? [`readiness score is ${latestReadiness.score}`] : []),
      ...(snapshotDelta === null
        ? []
        : [
            `${snapshotDelta >= 0 ? '+' : ''}${snapshotDelta} points from the previous comparable snapshot`
          ])
    ];
    return pieces.join(', ');
  };

  const readinessTarget = (
    component: ReadinessComponent,
    subject: string | null
  ): CandidateDraft | undefined => {
    const sameSubject = (candidate: CandidateDraft) =>
      !subject || normalizedText(candidate.subject) === normalizedText(subject);
    if (component === 'coverage') {
      return [...drafts.values()].find(
        (candidate) => syllabusDraftIds.includes(candidate.id) && sameSubject(candidate)
      );
    }
    if (component === 'calibration') {
      return [...drafts.values()].find(
        (candidate) =>
          (candidate.id === 'evidence:pending-analysis' ||
            candidate.id === 'evidence:guessed-correct') &&
          sameSubject(candidate)
      );
    }
    return [...drafts.values()].find(
      (candidate) => candidate.id === 'evidence:due-recovery' && sameSubject(candidate)
    );
  };

  const debtByKey = new Map<string, DebtEntry>();
  for (const debt of input.readinessDebt ?? []) {
    const current = debtByKey.get(debt.key);
    if (
      !current ||
      debt.weeksHeld > current.weeksHeld ||
      (debt.weeksHeld === current.weeksHeld && debt.lastSeen > current.lastSeen)
    ) {
      debtByKey.set(debt.key, { ...debt });
    }
  }
  const representedComponents = new Set<ReadinessComponent>();
  for (const debt of [...debtByKey.values()].sort(
    (left, right) =>
      Number(Boolean(left.subject)) - Number(Boolean(right.subject)) ||
      left.component.localeCompare(right.component) ||
      (left.subject ?? '').localeCompare(right.subject ?? '') ||
      left.key.localeCompare(right.key)
  )) {
    representedComponents.add(debt.component);
    const reason = readinessReason(debt.component, debt.subject, debt);
    const target = readinessTarget(debt.component, debt.subject);
    if (target) {
      target.priority = strongerPriority(
        target.priority,
        debt.weeksHeld >= 2 ? 'P2 High' : 'P3 Medium'
      );
      appendReason(target, reason);
      continue;
    }
    const action = readinessAction(debt.component, debt.subject);
    add(
      {
        id: `evidence:readiness:${uuidFromString(debt.key)}`,
        kind: action.kind,
        title: action.title,
        detail: `Persistent readiness debt · first seen ${debt.since}`,
        subject: debt.subject ?? undefined,
        estimatedMin: debt.subject ? 35 : 30,
        priority: debt.weeksHeld >= 2 ? 'P2 High' : 'P3 Medium',
        energy: action.energy,
        required: false,
        splittable: true,
        href: action.href
      },
      [reason]
    );
  }

  if (latestReadiness) {
    const weakest = (Object.keys(READINESS_HEALTHY) as ReadinessComponent[])
      .map((component) => ({
        component,
        value: latestReadiness[component],
        deficit: READINESS_HEALTHY[component] - latestReadiness[component]
      }))
      .filter((row) => row.deficit > 0)
      .sort(
        (left, right) =>
          right.deficit - left.deficit || left.component.localeCompare(right.component)
      )[0];
    if (weakest && !representedComponents.has(weakest.component)) {
      const reason = readinessReason(weakest.component, null);
      const target = readinessTarget(weakest.component, null);
      if (target) {
        target.priority = strongerPriority(
          target.priority,
          snapshotDelta !== null && snapshotDelta <= -5 ? 'P2 High' : 'P3 Medium'
        );
        appendReason(target, reason);
      } else {
        const action = readinessAction(weakest.component);
        add(
          {
            id: `evidence:readiness-snapshot:${weakest.component}`,
            kind: action.kind,
            title: action.title,
            detail: `Weakest latest readiness component · ${Math.round(weakest.value * 100)}%`,
            estimatedMin: 30,
            priority: snapshotDelta !== null && snapshotDelta <= -5 ? 'P2 High' : 'P3 Medium',
            energy: action.energy,
            required: false,
            splittable: true,
            href: action.href
          },
          [reason]
        );
      }
    }
  }

  return [...drafts.values()]
    .map(({ reasonParts, ...candidate }) => ({
      ...candidate,
      reason: finalizeReason(reasonParts)
    }))
    .sort(
      (left, right) =>
        PRIORITY_RANK[left.priority ?? 'P3 Medium'] -
          PRIORITY_RANK[right.priority ?? 'P3 Medium'] ||
        Number(Boolean(right.required)) - Number(Boolean(left.required)) ||
        (left.dueDate ?? '9999-12-31').localeCompare(right.dueDate ?? '9999-12-31') ||
        KIND_RANK[left.kind] - KIND_RANK[right.kind] ||
        (left.subject ?? '').localeCompare(right.subject ?? '') ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id)
    );
}
