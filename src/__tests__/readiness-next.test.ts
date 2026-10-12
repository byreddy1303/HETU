import { describe, expect, it } from 'vitest';
import { buildNextActionPack } from '@/lib/readiness-next';
import type { QuestionTimeline } from '@/lib/question-attempt-timeline';

function timeline(overrides: Partial<QuestionTimeline> & { questionUid: string }): QuestionTimeline {
  return {
    totalAttempts: 2,
    mastery: 'learning',
    streak: 0,
    lastVerdict: 'wrong',
    avgTimeSec: 60,
    attempts: [],
    timeDeltaSec: [],
    completedReattemptRounds: 0,
    ...overrides
  };
}

describe('buildNextActionPack', () => {
  it('ranks due first, then fragile, then relearn, and caps the list', () => {
    const actions = buildNextActionPack(
      [
        timeline({ questionUid: 'relearn-q' }),
        timeline({ questionUid: 'fragile-q', mastery: 'fragile', lastVerdict: 'correct', streak: 1 }),
        timeline({ questionUid: 'due-q' })
      ],
      ['due-q'],
      2
    );
    expect(actions.map((action) => action.questionUid)).toEqual(['due-q', 'fragile-q']);
    expect(actions[0].reason).toBe('due');
  });

  it('skips unseen questions', () => {
    const actions = buildNextActionPack([
      timeline({ questionUid: 'unseen-q', totalAttempts: 0, mastery: 'new', lastVerdict: null })
    ]);
    expect(actions).toEqual([]);
  });
});
