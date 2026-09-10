import { describe, expect, it } from 'vitest';
import { computeRecoveryAnalytics } from '@/lib/recovery-analytics';
import type { LearningEventRow, LearningItemRow, QuestionRow } from '@/types';

function item(id: string, overrides: Partial<LearningItemRow> = {}): LearningItemRow {
  return {
    id,
    user_id: 'user-1',
    source_kind: 'pyq',
    question_uid: `gate-${id}`,
    source_question_id: `question-${id}`,
    content_fingerprint: null,
    subject: id === 'b' ? 'DBMS' : 'Algorithms',
    topic: 'Topic',
    origin_pyq_attempt_id: `attempt-${id}`,
    latest_pyq_attempt_id: `attempt-${id}`,
    analysis_state: id === 'a' ? 'completed' : 'pending',
    recovery_state: id === 'a' ? 'mastered' : 'active',
    stage: id === 'a' ? 'MASTERED' : 'D10',
    scheduled_date: id === 'a' ? null : '2026-08-20',
    reason_flags: ['wrong'],
    lapse_count: id === 'b' ? 2 : 0,
    successful_retrieval_count: id === 'a' ? 2 : 0,
    last_grade: id === 'a' ? 'good' : 'again',
    last_interval_days: id === 'a' ? null : 3,
    successful_due_d30_at: id === 'a' ? '2026-08-20T10:00:00.000Z' : null,
    transfer_passed_at: null,
    mastered_at: id === 'a' ? '2026-08-20T10:00:00.000Z' : null,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-20T10:00:00.000Z',
    ...overrides
  };
}

function event(
  id: string,
  itemId: string,
  type: LearningEventRow['event_type'],
  at: string,
  overrides: Partial<LearningEventRow> = {}
): LearningEventRow {
  return {
    id,
    user_id: 'user-1',
    learning_item_id: itemId,
    event_type: type,
    occurred_at: at,
    local_date: at.slice(0, 10),
    timezone: 'Asia/Kolkata',
    source_pyq_attempt_id: null,
    recovery_session_id: null,
    grade: null,
    is_correct: null,
    answer: null,
    confidence: null,
    time_spent_ms: null,
    hint_used: false,
    idempotency_key: id,
    metadata: {},
    created_at: at,
    ...overrides
  };
}

function question(id: string, pattern: string, rootCause: QuestionRow['root_cause']): QuestionRow {
  return {
    id: `question-${id}`,
    user_id: 'user-1',
    session_id: null,
    subject: id === 'b' ? 'DBMS' : 'Algorithms',
    subtopic: 'Topic',
    source_year: 2026,
    source_ref: 'GATE',
    question_text: 'Question',
    answer_text: 'Answer',
    image_url: null,
    time_spent_sec: 100,
    target_time_sec: 90,
    outcome: 'W-C',
    pattern_name: pattern,
    trigger_sentence: null,
    root_cause: rootCause,
    mark_decision: 'MARK',
    mark_correct: false,
    source_pyq_attempt_id: `attempt-${id}`,
    created_at: '2026-08-01T10:00:00.000Z'
  };
}

describe('longitudinal recovery analytics', () => {
  it('measures durable conversion, fluency, backlog, overdue age, and causal breakdowns', () => {
    const items = [item('a'), item('b'), item('c', { scheduled_date: '2026-08-29' })];
    const events = [
      event('a-origin', 'a', 'answer_committed', '2026-08-01T10:00:00.000Z', {
        is_correct: false,
        time_spent_ms: 100_000,
        metadata: { mark_decision: 'MARK' }
      }),
      event('a-clean', 'a', 'retrieval_good', '2026-08-06T10:00:00.000Z', {
        grade: 'good',
        is_correct: true,
        time_spent_ms: 60_000,
        metadata: { previous_stage: 'D3' }
      }),
      event('a-mastered', 'a', 'mastered', '2026-08-20T10:00:00.000Z'),
      event('b-origin', 'b', 'answer_committed', '2026-08-01T11:00:00.000Z', {
        is_correct: false,
        confidence: 'high',
        metadata: { mark_decision: 'MARK' }
      }),
      event('b-hint', 'b', 'hint_revealed', '2026-08-10T10:00:00.000Z'),
      event('b-hard', 'b', 'retrieval_hard', '2026-08-10T10:01:00.000Z', {
        grade: 'hard',
        is_correct: true,
        hint_used: true,
        metadata: { previous_stage: 'D3' }
      }),
      event('b-again', 'b', 'retrieval_again', '2026-08-15T10:00:00.000Z', {
        grade: 'again',
        is_correct: false,
        metadata: { previous_stage: 'D10' }
      }),
      event('b-remediation', 'b', 'remediation_started', '2026-08-15T10:00:01.000Z'),
      event('c-origin', 'c', 'answer_committed', '2026-08-25T10:00:00.000Z', {
        is_correct: false,
        metadata: { mark_decision: 'SKIP' }
      })
    ];

    const result = computeRecoveryAnalytics({
      items,
      events,
      questions: [question('a', 'Shortest path', 'concept'), question('b', 'Join order', 'strategy')],
      asOfDate: '2026-08-31',
      windowStart: '2026-08-01'
    });

    expect(result.durableRecovery).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(result.wrongToClean7Days).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(result.wrongToClean30Days).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(result.grades).toEqual({ again: 1, hard: 1, good: 1, easy: 0 });
    expect(result.gradePassRate).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(result.hintFreeRecall).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(result.overdueAge).toEqual({ medianDays: 2, p90Days: 11, count: 2 });
    expect(result.backlog).toEqual({ opened: 3, mastered: 1, net: 2 });
    expect(result.averageTimeImprovementPct).toBe(40);
    expect(result.analysisCompletion).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(result.bySubject.map(({ key, items: count }) => [key, count])).toEqual([
      ['Algorithms', 2],
      ['DBMS', 1]
    ]);
    expect(result.byPattern).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'Shortest path' }),
        expect.objectContaining({ key: 'Join order' })
      ])
    );
    expect(result.byRootCause).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'concept' }),
        expect.objectContaining({ key: 'strategy' })
      ])
    );
  });

  it('counts lapses only after mastery and computes transfer/remediation conversion', () => {
    const items = [item('a')];
    const events = [
      event('pre-again', 'a', 'retrieval_again', '2026-08-10T10:00:00.000Z', { grade: 'again' }),
      event('mastered', 'a', 'mastered', '2026-08-20T10:00:00.000Z'),
      event('reopened', 'a', 'reopened', '2026-08-25T10:00:00.000Z'),
      event('transfer-assigned', 'a', 'transfer_assigned', '2026-08-26T10:00:00.000Z'),
      event('transfer-passed', 'a', 'transfer_passed', '2026-08-27T10:00:00.000Z'),
      event('remediation-started', 'a', 'remediation_started', '2026-08-28T10:00:00.000Z'),
      event('remediation-completed', 'a', 'remediation_completed', '2026-08-29T10:00:00.000Z')
    ];
    const result = computeRecoveryAnalytics({ items, events, asOfDate: '2026-08-31' });
    expect(result.masteredLapse).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(result.transferSuccess).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(result.remediationConversion).toEqual({ numerator: 1, denominator: 1, rate: 1 });
  });
});
