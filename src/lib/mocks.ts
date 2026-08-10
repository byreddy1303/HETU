import type { MockTestRow } from '@/types';

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
