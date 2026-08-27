import { describe, expect, it } from 'vitest';
import type { MockTestRow } from '@/types';
import {
  mockAccuracy,
  mockEvidenceReasonLabel,
  mockScorePercent,
  mockSubjectScoreRecord,
  mockSubjectScoresFromRecord,
  mockSummary,
  normalizeMockEvidence,
  normalizeMockSubjectScores,
  qualifyMockEvidence,
  validateMockDraft
} from '@/lib/mocks';

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

const qualifiedEvidence = {
  total_questions: 65,
  max_marks: 100,
  source_kind: 'manual' as const,
  source_pyq_session_id: null,
  paper_scope: 'full_length' as const,
  freshness: 'unseen' as const,
  timed: true,
  closed_book: true,
  single_sitting: true,
  evidence_status: 'supporting' as const,
  evidence_reasons: [] as string[],
  scoring_coverage_pct: 100
};

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

  it('merges legacy subject-score aliases without losing split marks or unknowns', () => {
    const normalized = normalizeMockSubjectScores([
      { subject: 'C Programming', marks: 5 },
      { subject: 'Data Structure', marks: 7 },
      { subject: 'DBMS', marks: 8 },
      { subject: 'Software Engineering', marks: 2 }
    ]);

    expect(normalized).toEqual([
      {
        subject: 'Programming & DS',
        subject_id: 'programming-data-structures',
        marks: 12
      },
      { subject: 'Databases', subject_id: 'databases', marks: 8 },
      { subject: 'Software Engineering', subject_id: null, marks: 2 }
    ]);
  });

  it('round-trips canonical and unknown editable subject score fields', () => {
    const record = mockSubjectScoreRecord([
      { subject: 'Computer Network', marks: 6 },
      { subject: 'Legacy Elective', marks: 1.5 }
    ]);
    expect(record).toEqual({ 'Computer Networks': '6', 'Legacy Elective': '1.5' });
    expect(mockSubjectScoresFromRecord(record)).toEqual([
      { subject: 'Computer Networks', subject_id: 'computer-networks', marks: 6 },
      { subject: 'Legacy Elective', subject_id: null, marks: 1.5 }
    ]);
  });

  it('qualifies only when every full-paper condition is explicitly met', () => {
    const qualification = qualifyMockEvidence(qualifiedEvidence);

    expect(qualification).toMatchObject({
      qualified: true,
      evidence_status: 'qualified',
      evidence_reasons: []
    });
    expect(qualification.criteria.every((criterion) => criterion.result === 'met')).toBe(true);
  });

  it('keeps historical rows supporting instead of inferring unknown conditions', () => {
    const normalized = normalizeMockEvidence({
      total_questions: 65,
      max_marks: 100
    });

    expect(normalized).toMatchObject({
      source_kind: 'manual',
      source_pyq_session_id: null,
      paper_scope: 'unknown',
      freshness: 'unknown',
      timed: null,
      closed_book: null,
      single_sitting: null,
      evidence_status: 'supporting',
      evidence_reasons: ['conditions-unknown'],
      scoring_coverage_pct: null
    });
  });

  it('recalculates derived reasons but preserves extra evidence blockers', () => {
    const corrected = normalizeMockEvidence({
      ...qualifiedEvidence,
      evidence_reasons: ['freshness-not-unseen', 'low-active-time', 'low-active-time']
    });

    expect(corrected.evidence_status).toBe('supporting');
    expect(corrected.evidence_reasons).toEqual(['low-active-time']);
    expect(mockEvidenceReasonLabel(corrected.evidence_reasons[0])).toContain('active time');
  });

  it('preserves an explicit exclusion even when every qualification criterion is met', () => {
    const excluded = normalizeMockEvidence({
      ...qualifiedEvidence,
      evidence_status: 'excluded' as const
    });

    expect(excluded.evidence_status).toBe('excluded');
    expect(excluded.evidence_reasons).toEqual([]);
  });
});
