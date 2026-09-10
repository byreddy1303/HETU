import { describe, expect, it } from 'vitest';
import { buildPyqEvidenceInsights } from '@/lib/pyq-evidence-insights';
import type { PyqAttemptRow } from '@/types';

function attempt(
  id: string,
  questionUid: string,
  overrides: Partial<PyqAttemptRow> = {}
): PyqAttemptRow {
  return {
    id,
    user_id: 'user-1',
    pyq_session_id: 'session-1',
    question_uid: questionUid,
    subject: 'Algorithms',
    subject_id: null,
    year: 2025,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'B',
    capture_version: 3,
    question_snapshot: {
      question_uid: questionUid,
      book_slug: 'gate-cse',
      year: 2025,
      set: 1,
      number: '1',
      paper_label: 'GATE CSE 2025 Set 1',
      subject: 'Algorithms',
      subject_slug: 'algorithms',
      topic: 'Graphs',
      topic_slug: 'graphs',
      subtopics: [],
      marks: 1,
      type: 'MCQ',
      tolerance: null,
      answer_status: 'available',
      answer_source: null,
      html: '<p>Question</p>',
      source_url: 'https://example.test/question'
    },
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: false,
    confidence: 'high',
    question_started_at: '2026-08-01T10:00:00.000Z',
    time_spent_ms: 60_000,
    time_spent_sec: 60,
    bank_version: 'bank-v1',
    attempted_at: '2026-08-01T10:01:00.000Z',
    question_type: 'MCQ',
    question_marks: 1,
    score_thirds: -1,
    scoring_status: 'scored',
    scoring_version: 1,
    ...overrides
  };
}

describe('longitudinal PYQ evidence insights', () => {
  it('keeps all-receipt calibration while exact action cohorts use the latest receipt', () => {
    const insights = buildPyqEvidenceInsights({
      attempts: [
        attempt('high-wrong-old', 'q1'),
        attempt('clean-new', 'q1', {
          attempt_number: 2,
          mark_correct: true,
          confidence: 'high',
          correct_answer: 'A',
          score_thirds: 3,
          attempted_at: '2026-08-10T10:01:00.000Z'
        }),
        attempt('high-wrong-current', 'q2'),
        attempt('guess-correct', 'q3', {
          mark_decision: 'FIFTY_FIFTY',
          confidence: 'medium',
          mark_correct: true,
          correct_answer: 'A',
          score_thirds: 3
        }),
        attempt('slow-correct', 'q4', {
          mark_correct: true,
          confidence: 'high',
          correct_answer: 'A',
          score_thirds: 3,
          time_spent_sec: 180,
          time_spent_ms: 180_000
        })
      ],
      analyzedAttemptIds: new Set(['high-wrong-old'])
    });

    expect(insights.confidence.find((row) => row.confidence === 'high')).toMatchObject({
      attempted: 4,
      correct: 2,
      wrong: 2,
      accuracyPct: 50
    });
    expect(insights.calibrationBySubjectTopic[0]).toMatchObject({
      subject: 'Algorithms',
      topic: 'Graphs',
      highConfidenceWrong: 2,
      highConfidenceAccuracyPct: 50
    });
    expect(insights.cohorts.highConfidenceWrong).toEqual(['q2']);
    expect(insights.cohorts.guessedCorrect).toEqual(['q3']);
    expect(insights.cohorts.slowCorrect).toEqual(['q4']);
    expect(insights.cohorts.wrongUnanalyzed).toEqual(['q2']);
    expect(insights.cohorts.repair).toEqual(['q2', 'q3', 'q4']);
  });

  it('compares a bounded rolling personal median with marks-based GATE targets', () => {
    const insights = buildPyqEvidenceInsights({
      attempts: [
        attempt('pace-1', 'p1', {
          mark_correct: true,
          correct_answer: 'A',
          time_spent_sec: 50,
          attempted_at: '2026-08-01T10:00:00.000Z'
        }),
        attempt('pace-2', 'p2', {
          mark_correct: true,
          correct_answer: 'A',
          time_spent_sec: 70,
          attempted_at: '2026-08-02T10:00:00.000Z'
        }),
        attempt('pace-3', 'p3', {
          mark_correct: true,
          correct_answer: 'A',
          time_spent_sec: 90,
          attempted_at: '2026-08-03T10:00:00.000Z'
        })
      ],
      rollingPaceWindow: 20
    });

    expect(insights.paceBaselines[0]).toMatchObject({
      subject: 'Algorithms',
      marks: 1,
      sampleSize: 3,
      personalMedianSec: 70
    });
    expect(insights.paceBaselines[0].gateTargetSec).toBeGreaterThan(0);
    expect(insights.paceBaselines[0].ratioToTarget).toBeCloseTo(
      70 / insights.paceBaselines[0].gateTargetSec,
      2
    );
  });
});
