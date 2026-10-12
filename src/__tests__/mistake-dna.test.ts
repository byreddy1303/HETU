import { describe, expect, it } from 'vitest';
import { aggregateMistakeDNA, deriveMistakeDNA } from '@/lib/mistake-dna';

describe('deriveMistakeDNA', () => {
  it('returns no tags for correct answers', () => {
    expect(
      deriveMistakeDNA({ markDecision: 'MARK', markCorrect: true, timeSpentSec: 30 })
    ).toEqual([]);
  });

  it('flags fifty-fifty answers as guesses', () => {
    expect(
      deriveMistakeDNA({ markDecision: 'FIFTY_FIFTY', markCorrect: false, timeSpentSec: 120 })
    ).toContain('guess');
  });

  it('flags slow answers as time pressure', () => {
    expect(
      deriveMistakeDNA({
        markDecision: 'MARK',
        markCorrect: false,
        timeSpentSec: 200,
        targetTimeSec: 100
      })
    ).toContain('time-pressure');
  });

  it('flags rushed high-confidence errors as silly', () => {
    expect(
      deriveMistakeDNA({
        markDecision: 'MARK',
        markCorrect: false,
        confidence: 'high',
        timeSpentSec: 20,
        targetTimeSec: 100
      })
    ).toContain('silly');
  });

  it('maps root causes to DNA tags', () => {
    expect(
      deriveMistakeDNA({ markDecision: 'MARK', markCorrect: false, timeSpentSec: 60, rootCause: 'formula' })
    ).toContain('formula');
    expect(
      deriveMistakeDNA({ markDecision: 'MARK', markCorrect: false, timeSpentSec: 60, rootCause: 'reading' })
    ).toContain('misread');
  });

  it('falls back to concept-gap instead of returning empty', () => {
    expect(
      deriveMistakeDNA({ markDecision: 'SKIP', markCorrect: null, timeSpentSec: 0 })
    ).toEqual(['concept-gap']);
  });
});

describe('aggregateMistakeDNA', () => {
  it('ranks tags by frequency', () => {
    const ranked = aggregateMistakeDNA([
      { markDecision: 'FIFTY_FIFTY', markCorrect: false, timeSpentSec: 100 },
      { markDecision: 'FIFTY_FIFTY', markCorrect: true, timeSpentSec: 100 },
      { markDecision: 'MARK', markCorrect: false, timeSpentSec: 100, rootCause: 'formula' }
    ]);
    expect(ranked[0]).toEqual({ tag: 'guess', count: 1 });
  });
});
