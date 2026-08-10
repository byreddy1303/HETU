import { describe, expect, it } from 'vitest';
import type { MockTestRow } from '@/types';
import { mockAccuracy, mockScorePercent, mockSummary, validateMockDraft } from '@/lib/mocks';

const valid = {
  name: 'Mock 1',
  testDate: '2026-08-10',
  totalMarks: 62,
  maxMarks: 100,
  totalQuestions: 65,
  correct: 35,
  wrong: 10,
  skipped: 20,
  durationMin: 180
};

function row(id: string, date: string, score: number): MockTestRow {
  return {
    id,
    test_date: date,
    total_marks: score,
    max_marks: 100,
    correct: score,
    wrong: 100 - score
  } as MockTestRow;
}

describe('mock tracking math', () => {
  it('validates count integrity and score bounds', () => {
    expect(validateMockDraft(valid)).toBeNull();
    expect(validateMockDraft({ ...valid, skipped: 19 })).toContain('add up');
    expect(validateMockDraft({ ...valid, totalMarks: 101 })).toContain('no greater');
  });

  it('reports normalized score, answered accuracy, best/worst, and latest delta', () => {
    expect(mockScorePercent({ total_marks: 45, max_marks: 75 })).toBe(60);
    expect(mockAccuracy({ correct: 30, wrong: 10 })).toBe(75);
    const summary = mockSummary([
      row('a', '2026-08-01', 40),
      row('b', '2026-08-08', 55),
      row('c', '2026-08-05', 30)
    ]);
    expect(summary.best?.id).toBe('b');
    expect(summary.worst?.id).toBe('c');
    expect(summary.latest?.id).toBe('b');
    expect(summary.scoreDelta).toBe(25);
  });
});
