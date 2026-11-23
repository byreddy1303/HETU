import type { Outcome, PyqAttemptRow, RootCause } from '@/types';

export interface QuickDiagnosisResult {
  outcome: Outcome;
  rootCause: RootCause;
  fix: string | null;
}

export const QUICK_DIAGNOSIS_CAUSES: {
  value: RootCause;
  label: string;
  missOutcome: Outcome;
  example: string;
}[] = [
  {
    value: 'concept',
    label: "Didn't know the idea",
    missOutcome: 'W-C',
    example: 'Always means every case: only events that block P force a switch.'
  },
  {
    value: 'formula',
    label: 'Forgot a formula or fact',
    missOutcome: 'W-C',
    example: 'Physical address = frame number × page size + offset.'
  },
  {
    value: 'reading',
    label: 'Misread the question',
    missOutcome: 'W-R',
    example: 'Circle NOT, always and at most before reading the options.'
  },
  {
    value: 'computation',
    label: 'Calculation slip',
    missOutcome: 'W-E',
    example: 'Write 2 KB = 2048 before dividing the address.'
  },
  {
    value: 'strategy',
    label: 'Wrong approach or too slow',
    missOutcome: 'W-E',
    example: 'Try the smallest case first to eliminate options.'
  }
];

/** Wrong or skipped answers are misses; correct but guessed or slow ones are shaky. */
export function isPracticeMiss(attempt: Pick<PyqAttemptRow, 'mark_correct' | 'mark_decision'>) {
  return attempt.mark_correct === false || attempt.mark_decision === 'SKIP';
}

/** The weak answers that get a 15-second reason: graded misses, guesses, slow solves. */
export function needsQuickDiagnosis(
  attempt: Pick<PyqAttemptRow, 'mark_correct' | 'mark_decision' | 'confidence'>,
  weak: boolean
): boolean {
  return weak && (attempt.mark_correct !== null || attempt.mark_decision === 'SKIP');
}

export function quickDiagnosisOutcome(
  attempt: Pick<PyqAttemptRow, 'mark_correct' | 'mark_decision' | 'confidence'>,
  cause: RootCause
): Outcome {
  if (isPracticeMiss(attempt)) {
    return QUICK_DIAGNOSIS_CAUSES.find((option) => option.value === cause)?.missOutcome ?? 'W-C';
  }
  return attempt.mark_decision === 'FIFTY_FIFTY' || attempt.confidence === 'low' ? 'RBG' : 'RBS';
}
