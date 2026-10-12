import { describe, expect, it } from 'vitest';
import { simulateSkippingGuesses, thirdsToMarks } from '@/lib/negative-marking';

describe('simulateSkippingGuesses', () => {
  it('recovers thirds lost to guessed-wrong answers', () => {
    const result = simulateSkippingGuesses([
      { id: 'a1', question_uid: 'q1', mark_decision: 'MARK', mark_correct: true, confidence: 'high', score_thirds: 6 },
      { id: 'a2', question_uid: 'q2', mark_decision: 'FIFTY_FIFTY', mark_correct: false, confidence: 'medium', score_thirds: -1 },
      { id: 'a3', question_uid: 'q3', mark_decision: 'FIFTY_FIFTY', mark_correct: true, confidence: 'medium', score_thirds: 6 }
    ]);
    expect(result.scoredThirds).toBe(11);
    expect(result.recoveredThirds).toBe(1);
    expect(result.withoutGuessesThirds).toBe(12);
    expect(result.guessedWrong).toBe(1);
    expect(result.details).toHaveLength(1);
  });

  it('returns zeros for no guesses', () => {
    const result = simulateSkippingGuesses([
      { id: 'a1', question_uid: 'q1', mark_decision: 'MARK', mark_correct: false, confidence: 'high', score_thirds: -1 }
    ]);
    expect(result.recoveredThirds).toBe(0);
    expect(result.guessedAttempts).toBe(0);
  });
});

describe('thirdsToMarks', () => {
  it('converts thirds to marks', () => {
    expect(thirdsToMarks(6)).toBe(2);
    expect(thirdsToMarks(-1)).toBeCloseTo(-0.33, 2);
  });
});
