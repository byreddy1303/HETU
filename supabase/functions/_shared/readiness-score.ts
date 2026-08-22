export const READINESS_CALCULATION_VERSION = 2 as const;

export interface ReadinessAttemptInput {
  id: string;
  mark_decision: string | null;
  mark_correct: boolean | null;
}

export interface ReadinessQuestionInput {
  id: string;
  source_pyq_attempt_id?: string | null;
  mark_decision: string | null;
  mark_correct: boolean | null;
}

export interface ReadinessReattemptInput {
  stage: 'D3' | 'D10' | 'D30' | 'MASTERED';
  scheduled_date: string;
  history: unknown[] | null;
}

export interface ReadinessEvidenceCounts {
  attempts: number;
  correct: number;
  wrong: number;
  skipped: number;
  ungraded: number;
  uncertain: number;
  legacyJournalAttempts: number;
}

export interface ReadinessScoreResult {
  calculationVersion: typeof READINESS_CALCULATION_VERSION;
  score: number;
  components: {
    coverage: number;
    retention: number;
    calibration: number;
    surface: number;
  };
  counts: ReadinessEvidenceCounts & {
    patterns: number;
    eligibleReattempts: number;
    stabilised: number;
    openReattempts: number;
  };
}

const TARGET_PATTERNS = 400;
const SURFACE_BASELINE = 50;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// Keep this byte-equivalent with src/lib/utils.ts. Historical PYQ analyses used
// both deterministic seeds, before the explicit source-attempt FK existed.
function uuidFromString(seed: string): string {
  const bytes = new Uint8Array(16);
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < seed.length; index += 1) {
    first ^= seed.charCodeAt(index);
    first = Math.imul(first, 0x01000193);
    second ^= seed.charCodeAt(seed.length - index - 1);
    second = Math.imul(second, 0x85ebca6b);
  }
  for (let index = 0; index < 16; index += 1) {
    const source = index < 8 ? first : second;
    bytes[index] = (source >>> ((index % 4) * 8)) & 0xff;
    first = Math.imul(first ^ (first >>> 13), 0xc2b2ae35);
    second = Math.imul(second ^ (second >>> 16), 0x27d4eb2f);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function addOutcome(
  counts: ReadinessEvidenceCounts,
  markDecision: string | null,
  markCorrect: boolean | null
): void {
  counts.attempts += 1;
  if (markDecision === 'FIFTY_FIFTY') counts.uncertain += 1;
  if (markDecision === 'SKIP') {
    counts.skipped += 1;
  } else if (markCorrect === true) {
    counts.correct += 1;
  } else if (markCorrect === false) {
    counts.wrong += 1;
  } else {
    counts.ungraded += 1;
  }
}

/**
 * Convert immutable PYQ receipts plus unlinked legacy Journal decisions into
 * exact-once readiness evidence. Linked analysis rows carry diagnosis only;
 * they never add another performance event.
 */
export function readinessEvidenceCounts(
  attempts: ReadinessAttemptInput[],
  questions: ReadinessQuestionInput[]
): ReadinessEvidenceCounts {
  const counts: ReadinessEvidenceCounts = {
    attempts: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    ungraded: 0,
    uncertain: 0,
    legacyJournalAttempts: 0
  };
  const seenAttemptIds = new Set<string>();
  const mirroredJournalIds = new Set<string>();
  for (const row of attempts) {
    if (seenAttemptIds.has(row.id)) continue;
    seenAttemptIds.add(row.id);
    mirroredJournalIds.add(uuidFromString(`pyq-journal-question:${row.id}`));
    mirroredJournalIds.add(uuidFromString(`pyq-journal:${row.id}`));
    addOutcome(counts, row.mark_decision, row.mark_correct);
  }
  const seenQuestionIds = new Set<string>();
  for (const row of questions) {
    if (
      row.source_pyq_attempt_id ||
      mirroredJournalIds.has(row.id) ||
      row.mark_decision == null
    ) continue;
    if (seenQuestionIds.has(row.id)) continue;
    seenQuestionIds.add(row.id);
    addOutcome(counts, row.mark_decision, row.mark_correct);
    counts.legacyJournalAttempts += 1;
  }
  return counts;
}

/** Keep byte-equivalent with the client composite in src/lib/readiness.ts. */
export function computeReadinessScoreResult(
  attempts: ReadinessAttemptInput[],
  legacyQuestions: ReadinessQuestionInput[],
  patternCount: number,
  reattempts: ReadinessReattemptInput[],
  today: string
): ReadinessScoreResult {
  const evidence = readinessEvidenceCounts(attempts, legacyQuestions);
  const coverage = clamp01(patternCount / TARGET_PATTERNS);
  const eligible = reattempts.filter(
    (row) => (row.history?.length ?? 0) > 0 || row.scheduled_date <= today
  );
  const stabilised = eligible.filter(
    (row) => row.stage === 'D30' || row.stage === 'MASTERED'
  ).length;
  const retentionRaw = eligible.length === 0 ? 0 : stabilised / eligible.length;
  const retention = retentionRaw * clamp01(eligible.length / 8);

  const answered = evidence.correct + evidence.wrong;
  const calibrationRaw = answered === 0 ? 0 : evidence.correct / answered;
  const calibration = calibrationRaw * clamp01(answered / 10);

  const open = reattempts.filter((row) => row.stage !== 'MASTERED').length;
  const surfaceRaw = clamp01(1 - open / SURFACE_BASELINE);
  const surface = surfaceRaw * clamp01(evidence.attempts / 20);
  const score = Math.round(
    (coverage * 0.3 + retention * 0.25 + calibration * 0.25 + surface * 0.2) * 100
  );

  return {
    calculationVersion: READINESS_CALCULATION_VERSION,
    score,
    components: { coverage, retention, calibration, surface },
    counts: {
      ...evidence,
      patterns: patternCount,
      eligibleReattempts: eligible.length,
      stabilised,
      openReattempts: open
    }
  };
}

export function computeReadinessScore(
  attempts: ReadinessAttemptInput[],
  legacyQuestions: ReadinessQuestionInput[],
  patternCount: number,
  reattempts: ReadinessReattemptInput[],
  today: string
): number {
  return computeReadinessScoreResult(
    attempts,
    legacyQuestions,
    patternCount,
    reattempts,
    today
  ).score;
}
