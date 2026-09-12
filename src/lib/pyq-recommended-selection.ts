import { targetTimeSecForMarks } from '@/lib/constants';
import { pyqBenchmarkPaperExposure, type PyqBenchmarkPaperManifest } from '@/lib/pyq-benchmark';
import { pyqBookSlugForQuestion, type PyqQuestion } from '@/lib/pyq';
import type { PyqAttemptRow } from '@/types';

export type PyqRecommendationPresetId =
  'learn' | 'diagnose' | 'repair' | 'speed' | 'transfer' | 'mixed-gate' | 'full-paper';

export type PyqRecommendationCohort =
  | 'all'
  | 'unseen'
  | 'wrong'
  | 'high-confidence-wrong'
  | 'guessed-correct'
  | 'slow-correct'
  | 'due'
  | 'transfer'
  | 'exact-uid';

export type PyqStratificationDimension = 'subject' | 'topic' | 'year' | 'marks';

export interface PyqRecommendationPresetDefinition {
  id: PyqRecommendationPresetId;
  label: string;
  description: string;
  defaultCount: number | 'paper';
  defaultCohorts: readonly PyqRecommendationCohort[];
  stratifyBy: readonly PyqStratificationDimension[];
}

export const PYQ_RECOMMENDATION_PRESETS: Record<
  PyqRecommendationPresetId,
  PyqRecommendationPresetDefinition
> = {
  learn: {
    id: 'learn',
    label: 'Learn',
    description: 'Build first-pass coverage from questions not attempted before.',
    defaultCount: 10,
    defaultCohorts: ['unseen'],
    stratifyBy: ['subject', 'topic', 'year', 'marks']
  },
  diagnose: {
    id: 'diagnose',
    label: 'Diagnose',
    description: 'Sample broadly to reveal the current shape of strengths and gaps.',
    defaultCount: 15,
    defaultCohorts: ['all'],
    stratifyBy: ['subject', 'topic', 'year', 'marks']
  },
  repair: {
    id: 'repair',
    label: 'Repair',
    description: 'Revisit errors, fragile wins, and questions due for recovery.',
    defaultCount: 10,
    defaultCohorts: ['wrong', 'high-confidence-wrong', 'guessed-correct', 'due'],
    stratifyBy: ['subject', 'topic', 'year', 'marks']
  },
  speed: {
    id: 'speed',
    label: 'Speed',
    description: 'Re-solve correct answers that exceeded their marks-based time target.',
    defaultCount: 10,
    defaultCohorts: ['slow-correct'],
    stratifyBy: ['subject', 'topic', 'year', 'marks']
  },
  transfer: {
    id: 'transfer',
    label: 'Transfer',
    description: 'Test the same ideas on fresh questions or an assigned transfer set.',
    defaultCount: 10,
    defaultCohorts: ['transfer'],
    stratifyBy: ['subject', 'topic', 'year', 'marks']
  },
  'mixed-gate': {
    id: 'mixed-gate',
    label: 'Mixed GATE',
    description: 'Build a broad mixed set from the primary GATE question bank.',
    defaultCount: 15,
    defaultCohorts: ['all'],
    stratifyBy: ['subject', 'topic', 'year', 'marks']
  },
  'full-paper': {
    id: 'full-paper',
    label: 'Full Paper',
    description: 'Use one intact benchmark paper in its official question order.',
    defaultCount: 'paper',
    defaultCohorts: ['exact-uid'],
    stratifyBy: []
  }
};

export interface PyqRecommendationScope {
  subjectSlugs?: readonly string[];
  topicSlugs?: readonly string[];
  years?: readonly number[];
  fromYear?: number;
  toYear?: number;
  marks?: readonly number[];
  bookSlugs?: readonly string[];
  types?: readonly PyqQuestion['type'][];
}

export interface PyqRecommendationReserveInput {
  /** Explicitly protected UIDs, in addition to automatically detected sealed papers. */
  questionUids?: readonly string[];
  /** Explicit exceptions, useful when the learner deliberately opens one protected set. */
  allowedQuestionUids?: readonly string[];
  /** Defaults to true. */
  protectSealedPapers?: boolean;
  /** Explicit global override. Prefer `allowedQuestionUids` for one deliberate paper. */
  includeReserved?: boolean;
}

export interface PyqRecommendationPriorityEvidence {
  /** 0–1 weakness signal from accuracy/calibration evidence. */
  weakness?: number;
  lapseCount?: number;
  /** More stale evidence receives a bounded priority boost. */
  daysSinceAttempt?: number;
  weeklyFocus?: boolean;
  /** 0–100 explicit priority from an approved Planner prescription. */
  plannerPriority?: number;
}

export interface RecommendPyqSelectionInput {
  questions: readonly PyqQuestion[];
  attempts?: readonly PyqAttemptRow[];
  preset: PyqRecommendationPresetId;
  requestedCount?: number | 'all';
  seed?: string | number;
  scope?: PyqRecommendationScope;
  /** Cohorts are OR-ed. Scope fields remain AND-ed filters. */
  cohorts?: readonly PyqRecommendationCohort[];
  dueQuestionUids?: readonly string[];
  /** If omitted, non-primary-book questions form the transfer cohort. */
  transferQuestionUids?: readonly string[];
  /** A hard allowlist for any preset, not merely a ranking hint. */
  exactQuestionUids?: readonly string[];
  primaryBookSlug?: string;
  benchmarkPapers?: readonly PyqBenchmarkPaperManifest[];
  /** Required to preserve official order and selected-paper reserve access for Full Paper. */
  fullPaper?: PyqBenchmarkPaperManifest;
  reserve?: PyqRecommendationReserveInput;
  stratifyBy?: readonly PyqStratificationDimension[];
  priorityByQuestionUid?: Readonly<Record<string, PyqRecommendationPriorityEvidence>>;
}

export interface PyqRecommendationDistribution {
  subject: Record<string, number>;
  topic: Record<string, number>;
  year: Record<string, number>;
  marks: Record<string, number>;
}

export type PyqRecommendationReasonCode =
  | `preset:${PyqRecommendationPresetId}`
  | `cohort:${PyqRecommendationCohort}`
  | 'scope'
  | 'sealed-reserve'
  | 'exact-subset'
  | 'missing-exact-uids'
  | 'shortfall';

export interface PyqRecommendationReasonChip {
  code: PyqRecommendationReasonCode;
  label: string;
  matchedCount?: number;
  selectedCount?: number;
}

export interface PyqRecommendationReserveSummary {
  protected: boolean;
  sealedPaperCount: number;
  reservedQuestionCount: number;
  matchedReservedCount: number;
  excludedCount: number;
  allowedCount: number;
}

export interface PyqRecommendationPreflight {
  /** Scope + cohort matches before reserve protection is applied. */
  exactMatchCount: number;
  requestedCount: number;
  requestedAll: boolean;
  /** Exact matches that may safely be selected after reserve protection. */
  selectableCount: number;
  selectedCount: number;
  estimatedMinutes: number;
  estimatedMarks: number;
  knownMarksCount: number;
  matchedHistory: { unseen: number; seen: number };
  selectedHistory: { unseen: number; seen: number };
  matchedCohorts: Partial<Record<PyqRecommendationCohort, number>>;
  selectedCohorts: Partial<Record<PyqRecommendationCohort, number>>;
  distribution: PyqRecommendationDistribution;
  selectableDistribution: PyqRecommendationDistribution;
  reserve: PyqRecommendationReserveSummary;
  shortfall: number;
  missingExactUidCount: number;
  reproducibilitySeed: string;
  reasonChips: PyqRecommendationReasonChip[];
}

export interface RecommendedPyqSelection {
  preset: PyqRecommendationPresetDefinition;
  cohorts: readonly PyqRecommendationCohort[];
  questions: PyqQuestion[];
  questionUids: string[];
  /** All matched reasons are retained; cohorts can overlap. */
  reasonsByQuestionUid: Record<string, PyqRecommendationCohort[]>;
  priorityReasonsByQuestionUid: Record<string, string[]>;
  preflight: PyqRecommendationPreflight;
}

const COHORT_LABELS: Record<PyqRecommendationCohort, string> = {
  all: 'All eligible',
  unseen: 'Unseen',
  wrong: 'Wrong last time',
  'high-confidence-wrong': 'High-confidence wrong',
  'guessed-correct': 'Guessed correct',
  'slow-correct': 'Slow correct',
  due: 'Due for review',
  transfer: 'Transfer',
  'exact-uid': 'Exact UID set'
};

interface Candidate {
  question: PyqQuestion;
  cohorts: PyqRecommendationCohort[];
  priorityScore: number;
  priorityReasons: string[];
}

interface ReserveState {
  reserved: Set<string>;
  allowed: Set<string>;
  sealedPaperCount: number;
  protected: boolean;
}

function normalizedStringSet(values: readonly string[] | undefined): Set<string> | null {
  if (!values?.length) return null;
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

function normalizedUidSet(values: readonly string[] | undefined): Set<string> | null {
  if (values == null) return null;
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

function normalizedNumberSet(values: readonly number[] | undefined): Set<number> | null {
  if (!values?.length) return null;
  return new Set(values.filter(Number.isFinite));
}

function uniqueQuestions(questions: readonly PyqQuestion[]): PyqQuestion[] {
  const byUid = new Map<string, PyqQuestion>();
  for (const question of questions) {
    if (question.id.trim() && !byUid.has(question.id)) byUid.set(question.id, question);
  }
  return [...byUid.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function compareAttemptRecency(left: PyqAttemptRow, right: PyqAttemptRow): number {
  return (
    left.attempted_at.localeCompare(right.attempted_at) ||
    left.attempt_number - right.attempt_number ||
    left.id.localeCompare(right.id)
  );
}

function latestAttemptsByQuestion(attempts: readonly PyqAttemptRow[]): Map<string, PyqAttemptRow> {
  const latest = new Map<string, PyqAttemptRow>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.question_uid);
    if (!current || compareAttemptRecency(current, attempt) < 0) {
      latest.set(attempt.question_uid, attempt);
    }
  }
  return latest;
}

function matchesScope(
  question: PyqQuestion,
  scope: PyqRecommendationScope | undefined,
  gateOnly: boolean,
  primaryBookSlug: string
): boolean {
  const subjects = normalizedStringSet(scope?.subjectSlugs);
  const topics = normalizedStringSet(scope?.topicSlugs);
  const years = normalizedNumberSet(scope?.years);
  const marks = normalizedNumberSet(scope?.marks);
  const books = normalizedStringSet(scope?.bookSlugs);
  const types = scope?.types?.length ? new Set(scope.types) : null;
  const bookSlug = pyqBookSlugForQuestion(question);

  return (
    (!gateOnly || bookSlug === primaryBookSlug) &&
    (!subjects || subjects.has(question.subjectSlug)) &&
    (!topics || topics.has(question.topicSlug)) &&
    (!years || years.has(question.year)) &&
    (scope?.fromYear == null || question.year >= scope.fromYear) &&
    (scope?.toYear == null || question.year <= scope.toYear) &&
    (!marks || (question.marks != null && marks.has(question.marks))) &&
    (!books || books.has(bookSlug)) &&
    (!types || types.has(question.type))
  );
}

function matchingCohorts(
  question: PyqQuestion,
  latestAttempt: PyqAttemptRow | undefined,
  dueQuestionUids: Set<string>,
  transferQuestionUids: Set<string> | null,
  exactQuestionUids: Set<string> | null,
  primaryBookSlug: string
): PyqRecommendationCohort[] {
  const matches: PyqRecommendationCohort[] = ['all'];
  if (!latestAttempt) matches.push('unseen');
  if (latestAttempt?.mark_correct === false) {
    matches.push('wrong');
    if (
      latestAttempt.confidence === 'high' ||
      (latestAttempt.confidence == null && latestAttempt.mark_decision === 'MARK')
    ) {
      matches.push('high-confidence-wrong');
    }
  }
  if (
    latestAttempt?.mark_correct === true &&
    (latestAttempt.mark_decision === 'FIFTY_FIFTY' ||
      latestAttempt.confidence === 'medium' ||
      latestAttempt.confidence === 'low')
  ) {
    matches.push('guessed-correct');
  }
  if (
    latestAttempt?.mark_correct === true &&
    latestAttempt.time_spent_sec > targetTimeSecForMarks(question.marks)
  ) {
    matches.push('slow-correct');
  }
  if (dueQuestionUids.has(question.id)) matches.push('due');
  if (
    transferQuestionUids?.has(question.id) ||
    (!transferQuestionUids && pyqBookSlugForQuestion(question) !== primaryBookSlug)
  ) {
    matches.push('transfer');
  }
  if (exactQuestionUids?.has(question.id)) matches.push('exact-uid');
  return matches;
}

function reserveState(
  input: RecommendPyqSelectionInput,
  attempts: readonly PyqAttemptRow[]
): ReserveState {
  const protectedByPolicy = input.reserve?.protectSealedPapers !== false;
  const reserved = new Set(input.reserve?.questionUids ?? []);
  const allowed = new Set(input.reserve?.allowedQuestionUids ?? []);
  const papersById = new Map<string, PyqBenchmarkPaperManifest>();
  for (const paper of input.benchmarkPapers ?? []) papersById.set(paper.id, paper);
  if (input.fullPaper) papersById.set(input.fullPaper.id, input.fullPaper);

  let sealedPaperCount = 0;
  if (protectedByPolicy) {
    for (const paper of papersById.values()) {
      if (!pyqBenchmarkPaperExposure(paper, attempts).sealed) continue;
      sealedPaperCount += 1;
      for (const uid of paper.questionUids) reserved.add(uid);
    }
  }
  if (input.preset === 'full-paper' && input.fullPaper) {
    for (const uid of input.fullPaper.questionUids) allowed.add(uid);
  }

  return {
    reserved,
    allowed,
    sealedPaperCount,
    protected: protectedByPolicy || reserved.size > 0
  };
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function dimensionValue(question: PyqQuestion, dimension: PyqStratificationDimension): string {
  if (dimension === 'subject') return question.subjectSlug || 'unknown';
  if (dimension === 'topic') return question.topicSlug || 'unknown';
  if (dimension === 'year') return String(question.year);
  return question.marks == null ? 'unknown' : String(question.marks);
}

function selectStratified(
  candidates: readonly Candidate[],
  count: number,
  dimensions: readonly PyqStratificationDimension[],
  seed: string
): Candidate[] {
  if (count <= 0) return [];
  if (count >= candidates.length) return [...candidates];

  const activeDimensions = dimensions.filter(
    (dimension) =>
      new Set(candidates.map(({ question }) => dimensionValue(question, dimension))).size > 1
  );
  const selectedCounts = new Map<PyqStratificationDimension, Map<string, number>>();
  for (const dimension of activeDimensions) selectedCounts.set(dimension, new Map());

  const remaining = [...candidates];
  const selected: Candidate[] = [];
  while (selected.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestPenalty = Number.POSITIVE_INFINITY;
    let bestPriority = Number.NEGATIVE_INFINITY;
    let bestTieBreak = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      let penalty = 0;
      for (const dimension of activeDimensions) {
        const value = dimensionValue(candidate.question, dimension);
        penalty += selectedCounts.get(dimension)?.get(value) ?? 0;
      }
      const tieBreak = hash32(`${seed}\u0000${candidate.question.id}`);
      if (
        penalty < bestPenalty ||
        (penalty === bestPenalty && candidate.priorityScore > bestPriority) ||
        (penalty === bestPenalty &&
          candidate.priorityScore === bestPriority &&
          tieBreak < bestTieBreak)
      ) {
        bestIndex = index;
        bestPenalty = penalty;
        bestPriority = candidate.priorityScore;
        bestTieBreak = tieBreak;
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    for (const dimension of activeDimensions) {
      const counts = selectedCounts.get(dimension);
      if (!counts) continue;
      const value = dimensionValue(chosen.question, dimension);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return selected;
}

function priorityForQuestion(evidence: PyqRecommendationPriorityEvidence | undefined): {
  score: number;
  reasons: string[];
} {
  if (!evidence) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  let score = 0;
  const weakness = Math.max(0, Math.min(1, evidence.weakness ?? 0));
  if (weakness > 0) {
    score += weakness * 40;
    reasons.push(`${Math.round(weakness * 100)}% weakness signal`);
  }
  const lapses = Math.max(0, Math.floor(evidence.lapseCount ?? 0));
  if (lapses > 0) {
    score += Math.min(60, lapses * 15);
    reasons.push(`${lapses} recovery lapse${lapses === 1 ? '' : 's'}`);
  }
  const days = Math.max(0, Math.floor(evidence.daysSinceAttempt ?? 0));
  if (days > 0) {
    score += Math.min(30, days / 2);
    reasons.push(`${days}d since latest attempt`);
  }
  if (evidence.weeklyFocus) {
    score += 35;
    reasons.push('weekly focus');
  }
  const plannerPriority = Math.max(0, Math.min(100, evidence.plannerPriority ?? 0));
  if (plannerPriority > 0) {
    score += plannerPriority;
    reasons.push('approved Planner prescription');
  }
  return { score, reasons };
}

function sortedRecord(entries: Iterable<[string, number]>): Record<string, number> {
  return Object.fromEntries(
    [...entries].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
  );
}

function distribution(candidates: readonly Candidate[]): PyqRecommendationDistribution {
  const dimensions: Record<PyqStratificationDimension, Map<string, number>> = {
    subject: new Map(),
    topic: new Map(),
    year: new Map(),
    marks: new Map()
  };
  for (const { question } of candidates) {
    for (const dimension of Object.keys(dimensions) as PyqStratificationDimension[]) {
      const value = dimensionValue(question, dimension);
      const counts = dimensions[dimension];
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return {
    subject: sortedRecord(dimensions.subject),
    topic: sortedRecord(dimensions.topic),
    year: sortedRecord(dimensions.year),
    marks: sortedRecord(dimensions.marks)
  };
}

function historySplit(candidates: readonly Candidate[]): { unseen: number; seen: number } {
  const unseen = candidates.filter((candidate) => candidate.cohorts.includes('unseen')).length;
  return { unseen, seen: Math.max(0, candidates.length - unseen) };
}

function cohortCounts(
  candidates: readonly Candidate[]
): Partial<Record<PyqRecommendationCohort, number>> {
  const counts = new Map<PyqRecommendationCohort, number>();
  for (const candidate of candidates) {
    for (const cohort of candidate.cohorts) {
      counts.set(cohort, (counts.get(cohort) ?? 0) + 1);
    }
  }
  return Object.fromEntries(counts) as Partial<Record<PyqRecommendationCohort, number>>;
}

function normalizedRequestedCount(
  input: RecommendPyqSelectionInput,
  preset: PyqRecommendationPresetDefinition,
  selectableCount: number,
  exactUidCount: number
): { count: number; all: boolean } {
  if (input.preset === 'full-paper') {
    return { count: input.fullPaper?.questionCount ?? exactUidCount, all: true };
  }
  if (input.requestedCount === 'all') {
    return { count: exactUidCount > 0 ? exactUidCount : selectableCount, all: true };
  }
  if (typeof input.requestedCount === 'number' && Number.isFinite(input.requestedCount)) {
    return { count: Math.max(0, Math.floor(input.requestedCount)), all: false };
  }
  return {
    count: preset.defaultCount === 'paper' ? exactUidCount : preset.defaultCount,
    all: false
  };
}

function reasonChips(
  preset: PyqRecommendationPresetDefinition,
  cohorts: readonly PyqRecommendationCohort[],
  matched: readonly Candidate[],
  selected: readonly Candidate[],
  scope: PyqRecommendationScope | undefined,
  exactSubset: boolean,
  missingExactUidCount: number,
  excludedCount: number,
  shortfall: number
): PyqRecommendationReasonChip[] {
  const chips: PyqRecommendationReasonChip[] = [
    { code: `preset:${preset.id}`, label: `${preset.label} preset` }
  ];
  for (const cohort of cohorts) {
    chips.push({
      code: `cohort:${cohort}`,
      label: COHORT_LABELS[cohort],
      matchedCount: matched.filter((candidate) => candidate.cohorts.includes(cohort)).length,
      selectedCount: selected.filter((candidate) => candidate.cohorts.includes(cohort)).length
    });
  }
  if (scope && Object.values(scope).some((value) => value != null)) {
    chips.push({ code: 'scope', label: 'Requested scope', matchedCount: matched.length });
  }
  if (exactSubset) {
    chips.push({ code: 'exact-subset', label: 'Exact UID subset', matchedCount: matched.length });
  }
  if (missingExactUidCount > 0) {
    chips.push({
      code: 'missing-exact-uids',
      label: `${missingExactUidCount} requested UID${missingExactUidCount === 1 ? '' : 's'} unavailable`,
      matchedCount: missingExactUidCount
    });
  }
  if (excludedCount > 0) {
    chips.push({
      code: 'sealed-reserve',
      label: `${excludedCount} sealed-paper question${excludedCount === 1 ? '' : 's'} protected`,
      matchedCount: excludedCount
    });
  }
  if (shortfall > 0) {
    chips.push({
      code: 'shortfall',
      label: `${shortfall} question${shortfall === 1 ? '' : 's'} short`,
      matchedCount: shortfall
    });
  }
  return chips;
}

/**
 * Build a deterministic recommendation and everything needed for a live preflight.
 * The same bank, attempts, options, and seed always produce the same UID order,
 * regardless of the incoming question/attempt array order.
 */
export function recommendPyqSelection(input: RecommendPyqSelectionInput): RecommendedPyqSelection {
  const preset = PYQ_RECOMMENDATION_PRESETS[input.preset];
  const attempts = input.attempts ?? [];
  const primaryBookSlug = input.primaryBookSlug?.trim() || 'gate-cse';
  const fullPaperUids = input.fullPaper?.questionUids;
  const exactUidValues = fullPaperUids ?? input.exactQuestionUids;
  const exactQuestionUids = normalizedUidSet(exactUidValues);
  const exactUidOrder =
    exactUidValues?.filter((uid, index, values) => values.indexOf(uid) === index) ?? [];
  const dueQuestionUids = new Set(input.dueQuestionUids ?? []);
  const transferQuestionUids = normalizedUidSet(input.transferQuestionUids);
  const latestAttempts = latestAttemptsByQuestion(attempts);
  const requestedCohorts =
    input.preset === 'full-paper'
      ? preset.defaultCohorts
      : exactQuestionUids && input.cohorts === undefined
        ? (['exact-uid'] as const)
      : input.cohorts?.length
        ? [...new Set(input.cohorts)]
        : preset.defaultCohorts;
  const requestedCohortSet = new Set(requestedCohorts);
  const questions = uniqueQuestions(input.questions);
  const knownQuestionUids = new Set(questions.map((question) => question.id));
  const missingExactUidCount = exactUidOrder.filter((uid) => !knownQuestionUids.has(uid)).length;

  const matched = questions.flatMap((question): Candidate[] => {
    if (exactQuestionUids && !exactQuestionUids.has(question.id)) return [];
    if (
      input.preset !== 'full-paper' &&
      !matchesScope(question, input.scope, input.preset === 'mixed-gate', primaryBookSlug)
    ) {
      return [];
    }
    const cohorts = matchingCohorts(
      question,
      latestAttempts.get(question.id),
      dueQuestionUids,
      transferQuestionUids,
      exactQuestionUids,
      primaryBookSlug
    );
    if (!cohorts.some((cohort) => requestedCohortSet.has(cohort))) return [];
    const priority = priorityForQuestion(input.priorityByQuestionUid?.[question.id]);
    return [
      {
        question,
        cohorts,
        priorityScore: priority.score,
        priorityReasons: priority.reasons
      }
    ];
  });

  const reserve = reserveState(input, attempts);
  const matchedReserved = matched.filter(({ question }) => reserve.reserved.has(question.id));
  const includeAllReserved = input.reserve?.includeReserved === true;
  const selectable = matched.filter(
    ({ question }) =>
      includeAllReserved || !reserve.reserved.has(question.id) || reserve.allowed.has(question.id)
  );
  const excludedCount = matchedReserved.filter(
    ({ question }) => !includeAllReserved && !reserve.allowed.has(question.id)
  ).length;
  const allowedCount = matchedReserved.length - excludedCount;
  const seed = String(input.seed ?? `${input.preset}:default`) || `${input.preset}:default`;
  const requested = normalizedRequestedCount(
    input,
    preset,
    selectable.length,
    exactUidOrder.length
  );

  let selected: Candidate[];
  if (input.preset === 'full-paper') {
    const selectableByUid = new Map(
      selectable.map((candidate) => [candidate.question.id, candidate])
    );
    selected = exactUidOrder.flatMap((uid) => {
      const candidate = selectableByUid.get(uid);
      return candidate ? [candidate] : [];
    });
  } else {
    selected = selectStratified(
      selectable,
      Math.min(requested.count, selectable.length),
      input.stratifyBy ?? preset.stratifyBy,
      seed
    );
  }

  const selectedMarks = selected.flatMap(({ question }) =>
    question.marks != null && Number.isFinite(question.marks) && question.marks > 0
      ? [question.marks]
      : []
  );
  const shortfall = Math.max(0, requested.count - selected.length);
  const reasonsByQuestionUid = Object.fromEntries(
    selected.map(({ question, cohorts }) => [question.id, cohorts])
  );
  const priorityReasonsByQuestionUid = Object.fromEntries(
    selected.map(({ question, priorityReasons }) => [question.id, priorityReasons])
  );

  return {
    preset,
    cohorts: requestedCohorts,
    questions: selected.map(({ question }) => question),
    questionUids: selected.map(({ question }) => question.id),
    reasonsByQuestionUid,
    priorityReasonsByQuestionUid,
    preflight: {
      exactMatchCount: matched.length,
      requestedCount: requested.count,
      requestedAll: requested.all,
      selectableCount: selectable.length,
      selectedCount: selected.length,
      estimatedMinutes:
        Math.round(
          (selected.reduce(
            (seconds, { question }) => seconds + targetTimeSecForMarks(question.marks),
            0
          ) /
            60) *
            10
        ) / 10,
      estimatedMarks: selectedMarks.reduce((sum, marks) => sum + marks, 0),
      knownMarksCount: selectedMarks.length,
      matchedHistory: historySplit(matched),
      selectedHistory: historySplit(selected),
      matchedCohorts: cohortCounts(matched),
      selectedCohorts: cohortCounts(selected),
      distribution: distribution(selected),
      selectableDistribution: distribution(selectable),
      reserve: {
        protected: reserve.protected,
        sealedPaperCount: reserve.sealedPaperCount,
        reservedQuestionCount: reserve.reserved.size,
        matchedReservedCount: matchedReserved.length,
        excludedCount,
        allowedCount
      },
      shortfall,
      missingExactUidCount,
      reproducibilitySeed: seed,
      reasonChips: reasonChips(
        preset,
        requestedCohorts,
        matched,
        selected,
        input.scope,
        exactQuestionUids != null,
        missingExactUidCount,
        excludedCount,
        shortfall
      )
    }
  };
}
