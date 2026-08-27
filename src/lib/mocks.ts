import type {
  MockEvidenceStatus,
  MockFreshness,
  MockPaperScope,
  MockSourceKind,
  MockSubjectScore,
  MockTestRow
} from '@/types';
import { normalizeSubjectIdentity, type SubjectId } from '@/lib/subjects';

export interface NormalizedMockSubjectScore extends MockSubjectScore {
  subject_id: SubjectId | null;
}

export const MOCK_EVIDENCE_REQUIREMENTS = Object.freeze({
  totalQuestions: 65,
  maxMarks: 100,
  paperScope: 'full_length' as const,
  freshness: 'unseen' as const,
  scoringCoveragePct: 100
});

export const MOCK_EVIDENCE_REASON = Object.freeze({
  conditionsUnknown: 'conditions-unknown',
  questionCount: 'question-count-not-65',
  maxMarks: 'max-marks-not-100',
  paperScope: 'paper-scope-not-full-length',
  freshness: 'freshness-not-unseen',
  timed: 'not-timed',
  closedBook: 'not-closed-book',
  singleSitting: 'not-single-sitting',
  scoringCoverage: 'scoring-coverage-not-100'
});

const MOCK_EVIDENCE_REASON_LABELS: Record<string, string> = {
  'conditions-unknown': 'one or more test conditions are unknown',
  'question-count-not-65': 'paper does not contain exactly 65 questions',
  'max-marks-not-100': 'paper is not scored out of 100 marks',
  'paper-scope-not-full-length': 'paper is not a full-length mock',
  'freshness-not-unseen': 'paper was not fully unseen at the start',
  'not-timed': 'timed conditions were not confirmed',
  'not-closed-book': 'closed-book conditions were not confirmed',
  'not-single-sitting': 'paper was not completed in one sitting',
  'scoring-coverage-not-100': 'not every question has exact scoring coverage',
  'low-active-time': 'active time was too low for a credible full-paper outcome',
  'incomplete-visit-coverage': 'not every question was visited',
  'nonstandard-paper': 'paper identity or structure did not match the benchmark'
};

export function mockEvidenceReasonLabel(reason: string): string {
  return MOCK_EVIDENCE_REASON_LABELS[reason] ?? reason.replace(/-/g, ' ');
}

export type MockEvidenceCriterionKey =
  | 'total_questions'
  | 'max_marks'
  | 'paper_scope'
  | 'freshness'
  | 'timed'
  | 'closed_book'
  | 'single_sitting'
  | 'scoring_coverage_pct';

export interface MockEvidenceCriterion {
  key: MockEvidenceCriterionKey;
  expected: number | string | boolean;
  actual: number | string | boolean | null;
  result: 'met' | 'not_met' | 'unknown';
  reason: string | null;
}

export interface NormalizedMockEvidence {
  source_kind: MockSourceKind;
  source_pyq_session_id: string | null;
  paper_scope: MockPaperScope;
  freshness: MockFreshness;
  timed: boolean | null;
  closed_book: boolean | null;
  single_sitting: boolean | null;
  evidence_status: MockEvidenceStatus;
  evidence_reasons: string[];
  scoring_coverage_pct: number | null;
}

export interface MockEvidenceQualification {
  qualified: boolean;
  status: MockEvidenceStatus;
  evidence_status: MockEvidenceStatus;
  reasons: string[];
  evidence_reasons: string[];
  criteria: MockEvidenceCriterion[];
}

const SOURCE_KINDS = new Set<MockSourceKind>(['manual', 'pyq_exam']);
const PAPER_SCOPES = new Set<MockPaperScope>(['full_length', 'sectional', 'topic', 'unknown']);
const FRESHNESS_VALUES = new Set<MockFreshness>([
  'unseen',
  'partially_seen',
  'repeated',
  'unknown'
]);
const EVIDENCE_STATUSES = new Set<MockEvidenceStatus>(['qualified', 'supporting', 'excluded']);
const DERIVED_EVIDENCE_REASONS = new Set<string>(Object.values(MOCK_EVIDENCE_REASON));

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scoringCoverage(value: unknown): number | null {
  const parsed = finiteNumber(value);
  if (parsed == null || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizedUserReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const reasons: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const reason = candidate.trim();
    if (!reason || seen.has(reason)) continue;
    seen.add(reason);
    reasons.push(reason);
  }
  return reasons;
}

function criterion(
  key: MockEvidenceCriterionKey,
  expected: number | string | boolean,
  actual: number | string | boolean | null,
  reason: string,
  unknown: boolean
): MockEvidenceCriterion {
  return {
    key,
    expected,
    actual,
    result: unknown ? 'unknown' : actual === expected ? 'met' : 'not_met',
    reason: unknown || actual === expected ? null : reason
  };
}

function normalizedEvidenceInput(
  input: object
): Omit<NormalizedMockEvidence, 'evidence_status' | 'evidence_reasons'> {
  const row = input as Record<string, unknown>;
  const rawSessionId = row['source_pyq_session_id'];
  return {
    source_kind: enumValue(row['source_kind'], SOURCE_KINDS, 'manual'),
    source_pyq_session_id:
      typeof rawSessionId === 'string' && rawSessionId.trim() ? rawSessionId.trim() : null,
    paper_scope: enumValue(row['paper_scope'], PAPER_SCOPES, 'unknown'),
    freshness: enumValue(row['freshness'], FRESHNESS_VALUES, 'unknown'),
    timed: nullableBoolean(row['timed']),
    closed_book: nullableBoolean(row['closed_book']),
    single_sitting: nullableBoolean(row['single_sitting']),
    scoring_coverage_pct: scoringCoverage(row['scoring_coverage_pct'])
  };
}

/**
 * Evaluate a mock against the fixed GATE full-paper evidence contract.
 *
 * `excluded` is an explicit human/system decision and is preserved. Every
 * other status is derived from the inspectable criteria below. Missing facts
 * never receive optimistic defaults: they remain supporting and carry the
 * stable `conditions-unknown` reason.
 */
export function qualifyMockEvidence(input: object): MockEvidenceQualification {
  const row = input as Record<string, unknown>;
  const normalized = normalizedEvidenceInput(input);
  const totalQuestions = finiteNumber(row['total_questions']);
  const maxMarks = finiteNumber(row['max_marks']);
  const criteria: MockEvidenceCriterion[] = [
    criterion(
      'total_questions',
      MOCK_EVIDENCE_REQUIREMENTS.totalQuestions,
      totalQuestions,
      MOCK_EVIDENCE_REASON.questionCount,
      totalQuestions == null
    ),
    criterion(
      'max_marks',
      MOCK_EVIDENCE_REQUIREMENTS.maxMarks,
      maxMarks,
      MOCK_EVIDENCE_REASON.maxMarks,
      maxMarks == null
    ),
    criterion(
      'paper_scope',
      MOCK_EVIDENCE_REQUIREMENTS.paperScope,
      normalized.paper_scope,
      MOCK_EVIDENCE_REASON.paperScope,
      normalized.paper_scope === 'unknown'
    ),
    criterion(
      'freshness',
      MOCK_EVIDENCE_REQUIREMENTS.freshness,
      normalized.freshness,
      MOCK_EVIDENCE_REASON.freshness,
      normalized.freshness === 'unknown'
    ),
    criterion(
      'timed',
      true,
      normalized.timed,
      MOCK_EVIDENCE_REASON.timed,
      normalized.timed == null
    ),
    criterion(
      'closed_book',
      true,
      normalized.closed_book,
      MOCK_EVIDENCE_REASON.closedBook,
      normalized.closed_book == null
    ),
    criterion(
      'single_sitting',
      true,
      normalized.single_sitting,
      MOCK_EVIDENCE_REASON.singleSitting,
      normalized.single_sitting == null
    ),
    criterion(
      'scoring_coverage_pct',
      MOCK_EVIDENCE_REQUIREMENTS.scoringCoveragePct,
      normalized.scoring_coverage_pct,
      MOCK_EVIDENCE_REASON.scoringCoverage,
      normalized.scoring_coverage_pct == null
    )
  ];

  const generatedReasons: string[] = criteria.some((item) => item.result === 'unknown')
    ? [MOCK_EVIDENCE_REASON.conditionsUnknown]
    : [];
  generatedReasons.push(
    ...criteria.flatMap((item) => (item.result === 'not_met' && item.reason ? [item.reason] : []))
  );
  // Reasons derived from criteria are recalculated on every normalization so a
  // corrected manual record can become qualified. Any other reason is an
  // additional evidence blocker (for example a PYQ paper completed with too
  // little active time) and must survive the round trip.
  const blockingInputReasons = normalizedUserReasons(row['evidence_reasons']).filter(
    (reason) => !DERIVED_EVIDENCE_REASONS.has(reason)
  );
  const reasons = [...blockingInputReasons];
  for (const generatedReason of generatedReasons) {
    if (!reasons.includes(generatedReason)) reasons.push(generatedReason);
  }
  const requestedStatus = enumValue(row['evidence_status'], EVIDENCE_STATUSES, 'supporting');
  const allMet =
    criteria.every((item) => item.result === 'met') && blockingInputReasons.length === 0;
  const status: MockEvidenceStatus =
    requestedStatus === 'excluded' ? 'excluded' : allMet ? 'qualified' : 'supporting';

  return {
    qualified: status === 'qualified',
    status,
    evidence_status: status,
    reasons,
    evidence_reasons: reasons,
    criteria
  };
}

/** Materialize the complete backward-compatible storage shape. */
export function normalizeMockEvidence<T extends object>(input: T): T & NormalizedMockEvidence {
  const normalized = normalizedEvidenceInput(input);
  const qualification = qualifyMockEvidence({ ...input, ...normalized });
  return {
    ...input,
    ...normalized,
    evidence_status: qualification.evidence_status,
    evidence_reasons: qualification.evidence_reasons
  };
}

/** Explicit row-oriented name for storage/sync/backup call sites. */
export const normalizeMockTestRow = normalizeMockEvidence;

/**
 * Canonicalize a mock breakdown without losing split historical categories.
 * When aliases collapse (notably C Programming + Data Structure), marks are
 * summed because they represented distinct contributions in the old schema.
 */
export function normalizeMockSubjectScores(
  scores: readonly MockSubjectScore[] | null | undefined
): NormalizedMockSubjectScore[] {
  const merged = new Map<string, NormalizedMockSubjectScore>();
  for (const score of scores ?? []) {
    if (!score || typeof score.subject !== 'string' || !Number.isFinite(score.marks)) continue;
    const legacyId = (score as MockSubjectScore & { subject_id?: unknown }).subject_id;
    const identity = normalizeSubjectIdentity(score.subject, legacyId);
    if (!identity.label) continue;
    const key = identity.id ? `id:${identity.id}` : `label:${identity.label}`;
    const previous = merged.get(key);
    merged.set(key, {
      subject: identity.label,
      subject_id: identity.id,
      marks: (previous?.marks ?? 0) + score.marks
    });
  }
  return [...merged.values()];
}

export function mockSubjectScoreRecord(
  scores: readonly MockSubjectScore[] | null | undefined
): Record<string, string> {
  return Object.fromEntries(
    normalizeMockSubjectScores(scores).map((score) => [score.subject, String(score.marks)])
  );
}

/** Convert the editable record back to canonical rows, retaining unknown keys. */
export function mockSubjectScoresFromRecord(
  values: Readonly<Record<string, string>>
): NormalizedMockSubjectScore[] {
  return normalizeMockSubjectScores(
    Object.entries(values).flatMap(([subject, value]) => {
      const trimmed = value.trim();
      return trimmed && Number.isFinite(Number(trimmed))
        ? [{ subject, marks: Number(trimmed) }]
        : [];
    })
  );
}

export interface MockDraft {
  name: string;
  testDate: string;
  totalMarks: number;
  maxMarks: number;
  totalQuestions: number;
  correct: number;
  wrong: number;
  skipped: number;
  durationMin: number;
}

export function validateMockDraft(draft: MockDraft): string | null {
  if (!draft.name.trim()) return 'Name the mock test.';
  if (draft.name.trim().length > 140) return 'Mock name must be 140 characters or fewer.';
  const parsedDate = new Date(`${draft.testDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.testDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== draft.testDate
  )
    return 'Choose a valid test date.';
  const integers = [
    draft.totalQuestions,
    draft.correct,
    draft.wrong,
    draft.skipped,
    draft.durationMin
  ];
  if (integers.some((value) => !Number.isInteger(value) || value < 0))
    return 'Question counts and duration must be whole non-negative numbers.';
  if (draft.totalQuestions < 1) return 'Total questions must be at least one.';
  if (draft.totalQuestions > 500) return 'Total questions cannot exceed 500.';
  if (draft.durationMin < 1 || draft.durationMin > 720)
    return 'Duration must be between 1 and 720 minutes.';
  if (draft.correct + draft.wrong + draft.skipped !== draft.totalQuestions)
    return 'Correct, wrong, and skipped must add up to total questions.';
  if (!Number.isFinite(draft.maxMarks) || draft.maxMarks <= 0 || draft.maxMarks > 9999.99)
    return 'Maximum marks must be greater than zero.';
  if (
    !Number.isFinite(draft.totalMarks) ||
    draft.totalMarks < -9999.99 ||
    draft.totalMarks > draft.maxMarks
  )
    return 'Score must be a number no greater than maximum marks.';
  return null;
}

export function mockScorePercent(row: Pick<MockTestRow, 'total_marks' | 'max_marks'>): number {
  return row.max_marks <= 0 ? 0 : Math.round((row.total_marks / row.max_marks) * 1000) / 10;
}

export function mockAccuracy(row: Pick<MockTestRow, 'correct' | 'wrong'>): number | null {
  const attempted = row.correct + row.wrong;
  return attempted === 0 ? null : Math.round((row.correct / attempted) * 1000) / 10;
}

export function mockSummary(rows: MockTestRow[]): {
  best: MockTestRow | null;
  worst: MockTestRow | null;
  latest: MockTestRow | null;
  scoreDelta: number | null;
} {
  if (rows.length === 0) return { best: null, worst: null, latest: null, scoreDelta: null };
  const chronological = [...rows].sort((a, b) => a.test_date.localeCompare(b.test_date));
  const ranked = [...rows].sort((a, b) => mockScorePercent(b) - mockScorePercent(a));
  const latest = chronological.at(-1)!;
  const prior = chronological.at(-2);
  return {
    best: ranked[0],
    worst: ranked.at(-1)!,
    latest,
    scoreDelta: prior
      ? Math.round((mockScorePercent(latest) - mockScorePercent(prior)) * 10) / 10
      : null
  };
}
