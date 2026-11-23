import type { MarkDecision, PyqAttemptRow, PyqExamConfidence } from '@/types';

/** Reading a GATE question takes longer than this; a faster commit needs a word. */
export const FAST_ANSWER_MS = 8000;

/**
 * here: solved in the app just now (timing is real);
 * earlier: worked out on paper or before opening it (timing says nothing);
 * guessed: a guess, saved as 50/50 with low confidence so it comes back.
 */
export type FastAnswer = 'here' | 'earlier' | 'guessed';

export function needsFastAnswerCheck(elapsedMs: number, decision: MarkDecision): boolean {
  return decision !== 'SKIP' && Number.isFinite(elapsedMs) && elapsedMs < FAST_ANSWER_MS;
}

/** What the learner's answer to the check changes before the receipt is saved. */
export function fastAnswerInputs(
  choice: FastAnswer | undefined,
  decision: MarkDecision,
  confidence: PyqExamConfidence | null
): {
  decision: MarkDecision;
  confidence: PyqExamConfidence | null;
  extra: Partial<Pick<PyqAttemptRow, 'duration_source'>>;
} {
  if (choice === 'guessed' && decision !== 'SKIP')
    return { decision: 'FIFTY_FIFTY', confidence: 'low', extra: {} };
  if (choice === 'earlier') return { decision, confidence, extra: { duration_source: 'unknown' } };
  return { decision, confidence, extra: {} };
}
