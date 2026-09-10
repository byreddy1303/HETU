import { beforeEach, describe, expect, it } from 'vitest';
import type { LearningEventRow, LearningItemRow } from '@/types';
import {
  buildDailyLearningAggregates,
  buildLongitudinalLearningSignals,
  dailyLearningAggregateCacheKey,
  loadDailyLearningAggregateCache,
  normalizeDailyLearningAggregateCache,
  persistDailyLearningAggregateCache
} from '@/lib/longitudinal-learning';

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
    analysis_state: 'pending',
    recovery_state: 'active',
    stage: 'D3',
    scheduled_date: '2026-08-20',
    reason_flags: ['wrong'],
    lapse_count: 0,
    successful_retrieval_count: 0,
    last_grade: null,
    last_interval_days: null,
    successful_due_d30_at: null,
    transfer_passed_at: null,
    mastered_at: null,
    created_at: '2026-08-25T10:00:00.000Z',
    updated_at: '2026-08-25T10:00:00.000Z',
    ...overrides
  };
}

function event(
  id: string,
  itemId: string,
  type: LearningEventRow['event_type'],
  date: string,
  overrides: Partial<LearningEventRow> = {}
): LearningEventRow {
  const at = `${date}T10:00:00.000Z`;
  return {
    id,
    user_id: 'user-1',
    learning_item_id: itemId,
    event_type: type,
    occurred_at: at,
    local_date: date,
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

describe('daily longitudinal learning aggregates', () => {
  beforeEach(() => localStorage.clear());

  it('deduplicates retry events, opens one mistake identity, and derives actionable weekly evidence', () => {
    const items = [
      item('a', {
        analysis_state: 'completed',
        recovery_state: 'mastered',
        stage: 'MASTERED',
        scheduled_date: null,
        successful_retrieval_count: 1,
        transfer_passed_at: '2026-08-30T10:00:00.000Z',
        mastered_at: '2026-08-30T10:00:01.000Z'
      }),
      item('b')
    ];
    const events = [
      event('a-origin', 'a', 'answer_committed', '2026-08-25', {
        is_correct: false,
        time_spent_ms: 120_000,
        metadata: { mark_decision: 'MARK' }
      }),
      event('a-origin-retry', 'a', 'answer_committed', '2026-08-25', {
        is_correct: false,
        idempotency_key: 'a-origin',
        metadata: { mark_decision: 'MARK' }
      }),
      event('a-good', 'a', 'retrieval_good', '2026-08-28', {
        grade: 'good',
        is_correct: true,
        time_spent_ms: 60_000,
        metadata: { previous_stage: 'D3' }
      }),
      event('b-origin', 'b', 'answer_committed', '2026-08-28', {
        is_correct: null,
        metadata: { mark_decision: 'SKIP' }
      }),
      event('b-hard', 'b', 'retrieval_hard', '2026-08-29', {
        grade: 'hard',
        is_correct: true,
        hint_used: true,
        time_spent_ms: 90_000,
        metadata: { previous_stage: 'D3' }
      }),
      event('a-transfer-assigned', 'a', 'transfer_assigned', '2026-08-30'),
      event('a-transfer-passed', 'a', 'transfer_passed', '2026-08-30'),
      event('a-mastered', 'a', 'mastered', '2026-08-30')
    ];

    const series = buildDailyLearningAggregates({ items, events });
    expect(series.duplicateEventsIgnored).toBe(1);
    expect(series.uniqueEventCount).toBe(7);
    expect(series.aggregates).toHaveLength(4);
    expect(series.aggregates.find((row) => row.date === '2026-08-25')).toMatchObject({
      sourceEventCount: 1,
      newMistakes: 1
    });
    expect(series.aggregates.find((row) => row.date === '2026-08-28')).toMatchObject({
      newMistakes: 1,
      retrievals: 1,
      fluentRetrievals: 1,
      hintFreeCorrect: 1,
      recoveryTimeMs: 60_000,
      grades: { again: 0, hard: 0, good: 1, easy: 0 }
    });

    const signals = buildLongitudinalLearningSignals({
      items,
      events,
      periodStart: '2026-08-25',
      periodEnd: '2026-08-31',
      asOfDate: '2026-08-31'
    });
    expect(signals.durableRecovery).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(signals.aggregateSeries).toMatchObject({
      uniqueItemCount: 2,
      duplicateItemsIgnored: 0,
      uniqueEventCount: 7,
      duplicateEventsIgnored: 1
    });
    expect(signals.totals).toMatchObject({
      newMistakes: 2,
      retrievals: 2,
      fluentRetrievals: 1,
      hintFreeRecall: { numerator: 1, denominator: 2, rate: 0.5 },
      transferSuccess: { numerator: 1, denominator: 1, rate: 1 },
      mastered: 1,
      backlogNet: 1
    });
    expect(signals.analytics.wrongToClean7Days).toEqual({
      numerator: 1,
      denominator: 2,
      rate: 0.5
    });
    expect(signals.analytics.stagePassRates).toEqual([
      { stage: 'D3', numerator: 1, denominator: 2, rate: 0.5 }
    ]);
    expect(signals.priority).toMatchObject({ kind: 'overdue', href: '/reattempts' });
  });

  it('persists a bounded account-scoped projection and rejects malformed or cross-account data', () => {
    const series = buildDailyLearningAggregates({
      items: [item('a')],
      events: [
        event('origin', 'a', 'answer_committed', '2026-08-25', {
          is_correct: false,
          metadata: { mark_decision: 'MARK' }
        })
      ]
    });
    const first = persistDailyLearningAggregateCache({
      userId: 'user-1',
      throughDate: '2026-08-31',
      series,
      updatedAt: '2026-08-31T12:00:00.000Z'
    });
    const second = persistDailyLearningAggregateCache({
      userId: 'user-1',
      throughDate: '2026-08-31',
      series,
      updatedAt: '2026-08-31T13:00:00.000Z'
    });
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(loadDailyLearningAggregateCache('user-1')).toEqual(first);
    expect(loadDailyLearningAggregateCache('user-2')).toBeNull();
    expect(localStorage.getItem(dailyLearningAggregateCacheKey('user-2'))).toBeNull();
    expect(normalizeDailyLearningAggregateCache({ ...first, userId: 'user-2' }, 'user-1')).toBeNull();
    expect(
      normalizeDailyLearningAggregateCache(
        { ...first, aggregates: [{ date: 'not-a-date' }] },
        'user-1'
      )?.aggregates
    ).toEqual([]);
  });

  it('does not award the durable north star to an unsupported mastered projection', () => {
    const unsupportedMastery = item('unsupported', {
      recovery_state: 'mastered',
      stage: 'MASTERED',
      scheduled_date: null,
      successful_retrieval_count: 1,
      successful_due_d30_at: null,
      transfer_passed_at: null
    });
    const signals = buildLongitudinalLearningSignals({
      items: [unsupportedMastery],
      events: [],
      periodStart: '2026-08-25',
      periodEnd: '2026-08-31',
      asOfDate: '2026-08-31'
    });
    expect(signals.durableRecovery).toEqual({ numerator: 0, denominator: 1, rate: 0 });
  });

  it('freezes every metric at the as-of date while retaining past mastery before a future reopen', () => {
    const futureMastery = item('future', {
      recovery_state: 'mastered',
      stage: 'MASTERED',
      scheduled_date: null,
      successful_due_d30_at: '2026-09-03T10:00:00.000Z',
      mastered_at: '2026-09-03T10:00:01.000Z'
    });
    const reopenedLater = item('reopened-later', {
      recovery_state: 'active',
      stage: 'D3',
      scheduled_date: '2026-09-05',
      successful_due_d30_at: '2026-08-29T10:00:00.000Z',
      mastered_at: null,
      lapse_count: 1
    });
    const futureItem = item('not-created-yet', {
      created_at: '2026-09-04T10:00:00.000Z',
      scheduled_date: '2026-09-07'
    });
    const events = [
      event('future-origin', 'future', 'answer_committed', '2026-08-25', {
        is_correct: false,
        metadata: { mark_decision: 'MARK' }
      }),
      event('future-d30', 'future', 'retrieval_good', '2026-09-03', {
        grade: 'good',
        is_correct: true,
        metadata: { previous_stage: 'D30' }
      }),
      event('future-mastered', 'future', 'mastered', '2026-09-03'),
      event('past-origin', 'reopened-later', 'answer_committed', '2026-08-20', {
        is_correct: false,
        metadata: { mark_decision: 'MARK' }
      }),
      event('past-d30', 'reopened-later', 'retrieval_good', '2026-08-29', {
        grade: 'good',
        is_correct: true,
        metadata: { previous_stage: 'D30' }
      }),
      event('past-mastered', 'reopened-later', 'mastered', '2026-08-29'),
      event('future-reopen', 'reopened-later', 'reopened', '2026-09-02'),
      event('future-item-created', 'not-created-yet', 'created', '2026-09-04')
    ];

    const signals = buildLongitudinalLearningSignals({
      items: [futureMastery, reopenedLater, futureItem],
      events,
      periodStart: '2026-08-25',
      periodEnd: '2026-09-07',
      asOfDate: '2026-08-31'
    });

    expect(signals.aggregateSeries.aggregates.every((row) => row.date <= '2026-08-31')).toBe(true);
    expect(signals.uniqueEventCount).toBe(4);
    expect(signals.uniqueItemCount).toBe(2);
    expect(signals.durableRecovery).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(signals.analytics.wrongToClean7Days.numerator).toBe(0);
  });

  it('collapses duplicate canonical item identities before daily and durable denominators', () => {
    const mastered = item('mastered-copy', {
      question_uid: 'same-question',
      recovery_state: 'mastered',
      stage: 'MASTERED',
      scheduled_date: null,
      successful_due_d30_at: '2026-08-28T10:00:00.000Z',
      mastered_at: '2026-08-28T10:00:01.000Z'
    });
    const active = item('active-copy', {
      question_uid: 'same-question',
      recovery_state: 'active',
      scheduled_date: '2026-08-20'
    });
    const signals = buildLongitudinalLearningSignals({
      items: [mastered, active],
      events: [
        event('weak-one', 'mastered-copy', 'answer_committed', '2026-08-20', {
          is_correct: false,
          metadata: { mark_decision: 'MARK' }
        }),
        event('weak-two', 'active-copy', 'answer_committed', '2026-08-21', {
          is_correct: false,
          metadata: { mark_decision: 'MARK' }
        })
      ],
      periodStart: '2026-08-20',
      periodEnd: '2026-08-31',
      asOfDate: '2026-08-31'
    });

    expect(signals.uniqueItemCount).toBe(1);
    expect(signals.duplicateItemsIgnored).toBe(1);
    expect(signals.totals.newMistakes).toBe(1);
    expect(signals.durableRecovery).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(signals.priority.kind).toBe('overdue');
  });

  it('uses completed transfer outcomes for a bounded period rate and chooses state-specific work', () => {
    const remediation = item('remediation', {
      recovery_state: 'remediation',
      lapse_count: 3,
      scheduled_date: '2026-08-20'
    });
    const signals = buildLongitudinalLearningSignals({
      items: [remediation],
      events: [
        event('assigned-last-week', 'remediation', 'transfer_assigned', '2026-08-20'),
        event('passed-this-week', 'remediation', 'transfer_passed', '2026-08-26')
      ],
      periodStart: '2026-08-25',
      periodEnd: '2026-08-31',
      asOfDate: '2026-08-31'
    });

    expect(signals.totals.transferSuccess).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(signals.priority).toMatchObject({ kind: 'remediation', href: '/reattempts' });
  });

  it('always returns an executable evidence action, including an empty ledger', () => {
    const signals = buildLongitudinalLearningSignals({
      items: [],
      events: [],
      periodStart: '2026-08-25',
      periodEnd: '2026-08-31',
      asOfDate: '2026-08-31'
    });
    expect(signals.priority).toEqual({
      kind: 'new-evidence',
      title: 'Run a fresh diagnostic PYQ set',
      reason:
        'There is no canonical recovery evidence yet; a broad fresh set can reveal the first defensible repair targets.',
      href: '/pyq?preset=diagnose'
    });
  });
});
