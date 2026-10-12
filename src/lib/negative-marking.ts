// Negative-marking simulator (spec §3C): answers are frozen receipts, so the
// simulator never rewrites them. It answers "how many marks did guesses cost?"
// using the stored GATE thirds, so the skip-vs-guess lesson is exact.
import type { PyqAttemptRow } from '@/types';

export interface GuessDetail {
  attemptId: string;
  questionUid: string;
  lostThirds: number;
  reason: 'fifty-fifty' | 'low-confidence';
}

export interface NegativeMarkingSimulation {
  scoredThirds: number;
  withoutGuessesThirds: number;
  recoveredThirds: number;
  guessedAttempts: number;
  guessedWrong: number;
  details: GuessDetail[];
}

type ScoredAttempt = Pick<
  PyqAttemptRow,
  'id' | 'question_uid' | 'mark_decision' | 'mark_correct' | 'confidence' | 'score_thirds'
>;

function isGuess(attempt: ScoredAttempt): 'fifty-fifty' | 'low-confidence' | null {
  if (attempt.mark_decision === 'FIFTY_FIFTY') return 'fifty-fifty';
  if (attempt.confidence === 'low' && attempt.mark_correct === false) return 'low-confidence';
  return null;
}

/**
 * Simulate skipping every guessed answer: guessed-wrong receipts stop losing
 * their stored thirds; guessed-correct receipts keep theirs (a skip would
 * have scored 0, so only strictly-negative receipts are recovered).
 */
export function simulateSkippingGuesses(attempts: readonly ScoredAttempt[]): NegativeMarkingSimulation {
  let scoredThirds = 0;
  let recoveredThirds = 0;
  let guessedAttempts = 0;
  let guessedWrong = 0;
  const details: GuessDetail[] = [];
  for (const attempt of attempts) {
    const thirds = attempt.score_thirds ?? 0;
    scoredThirds += thirds;
    const guess = isGuess(attempt);
    if (!guess) continue;
    guessedAttempts += 1;
    if (attempt.mark_correct === false) {
      guessedWrong += 1;
      if (thirds < 0) {
        recoveredThirds += -thirds;
        details.push({
          attemptId: attempt.id,
          questionUid: attempt.question_uid,
          lostThirds: -thirds,
          reason: guess
        });
      }
    }
  }
  return {
    scoredThirds,
    withoutGuessesThirds: scoredThirds + recoveredThirds,
    recoveredThirds,
    guessedAttempts,
    guessedWrong,
    details
  };
}

/** thirds (⅓-mark units) → marks, rounded to 2dp for display. */
export function thirdsToMarks(thirds: number): number {
  return Math.round((thirds / 3) * 100) / 100;
}
