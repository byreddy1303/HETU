export interface ReadinessQuestionInput {
  mark_decision: string | null;
  mark_correct: boolean | null;
}

export interface ReadinessReattemptInput {
  stage: 'D3' | 'D10' | 'D30' | 'MASTERED';
  scheduled_date: string;
  history: unknown[] | null;
}

const TARGET_PATTERNS = 400;
const SURFACE_BASELINE = 50;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Keep byte-equivalent with the client composite in src/lib/readiness.ts. */
export function computeReadinessScore(
  questions: ReadinessQuestionInput[],
  patternCount: number,
  reattempts: ReadinessReattemptInput[],
  today: string
): number {
  const coverage = clamp01(patternCount / TARGET_PATTERNS);
  const eligible = reattempts.filter(
    (row) => (row.history?.length ?? 0) > 0 || row.scheduled_date <= today
  );
  const stabilised = eligible.filter(
    (row) => row.stage === 'D30' || row.stage === 'MASTERED'
  ).length;
  const retentionRaw = eligible.length === 0 ? 0 : stabilised / eligible.length;
  const retention = retentionRaw * clamp01(eligible.length / 8);

  const marked = questions.filter((row) => row.mark_decision === 'MARK');
  const markedCorrect = marked.filter((row) => row.mark_correct === true).length;
  const calibrationRaw = marked.length === 0 ? 0 : markedCorrect / marked.length;
  const calibration = calibrationRaw * clamp01(marked.length / 10);

  const open = reattempts.filter((row) => row.stage !== 'MASTERED').length;
  const surfaceRaw = clamp01(1 - open / SURFACE_BASELINE);
  const surface = surfaceRaw * clamp01(questions.length / 20);

  return Math.round(
    (coverage * 0.3 + retention * 0.25 + calibration * 0.25 + surface * 0.2) * 100
  );
}
