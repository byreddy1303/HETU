import { describe, expect, it } from 'vitest';
import {
  buildRecoverySprint,
  deriveRecoveryGrade,
  forecastRecoveryLoad,
  rankRecoveryCandidates,
  transitionRecoveryItem,
  type RecoveryCandidate
} from '@/lib/recovery-engine';
import type { LearningItemRow } from '@/types';

function item(overrides: Partial<LearningItemRow> = {}): LearningItemRow {
  return {
    id: 'item-1',
    user_id: 'user-1',
    source_kind: 'pyq',
    question_uid: 'gate-q1',
    source_question_id: null,
    content_fingerprint: null,
    subject: 'Algorithms',
    topic: 'Graphs',
    origin_pyq_attempt_id: 'attempt-1',
    latest_pyq_attempt_id: 'attempt-1',
    analysis_state: 'pending',
    recovery_state: 'active',
    stage: 'D3',
    scheduled_date: '2026-08-31',
    reason_flags: ['wrong'],
    lapse_count: 0,
    successful_retrieval_count: 0,
    last_grade: null,
    last_interval_days: null,
    successful_due_d30_at: null,
    transfer_passed_at: null,
    mastered_at: null,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides
  };
}

describe('transparent adaptive recovery grade', () => {
  it('uses correctness, timing, confidence, cue use, and prior evidence', () => {
    expect(
      deriveRecoveryGrade({
        correct: false,
        blank: false,
        timeSpentSec: 30,
        targetTimeSec: 90,
        confidence: 'high',
        hintUsed: false,
        priorSuccessfulRetrievals: 3
      }).grade
    ).toBe('again');
    expect(
      deriveRecoveryGrade({
        correct: true,
        timeSpentSec: 30,
        targetTimeSec: 90,
        confidence: 'high',
        hintUsed: true,
        priorSuccessfulRetrievals: 2
      })
    ).toMatchObject({ grade: 'hard', reasons: ['opening cue revealed'] });
    expect(
      deriveRecoveryGrade({
        correct: true,
        timeSpentSec: 85,
        targetTimeSec: 90,
        confidence: 'medium',
        hintUsed: false,
        priorSuccessfulRetrievals: 0
      }).grade
    ).toBe('good');
    expect(
      deriveRecoveryGrade({
        correct: true,
        timeSpentSec: 50,
        targetTimeSec: 90,
        confidence: 'high',
        hintUsed: false,
        priorSuccessfulRetrievals: 1
      }).grade
    ).toBe('easy');
  });
});

describe('exam-aware transitions', () => {
  it('does not promote a hinted correct retrieval and enters remediation after repeated lapses', () => {
    const hard = transitionRecoveryItem({
      item: item({ stage: 'D10' }),
      grade: 'hard',
      today: '2026-08-31',
      occurredAt: '2026-08-31T10:00:00.000Z'
    });
    expect(hard.item).toMatchObject({ stage: 'D10', scheduled_date: '2026-09-05' });

    const again = transitionRecoveryItem({
      item: item({ stage: 'D10', lapse_count: 2 }),
      grade: 'again',
      today: '2026-08-31',
      occurredAt: '2026-08-31T10:00:00.000Z'
    });
    expect(again.item).toMatchObject({
      stage: 'D3',
      recovery_state: 'remediation',
      scheduled_date: '2026-09-03',
      lapse_count: 3
    });
    expect(again.item.reason_flags).toContain('recurring-lapse');
  });

  it('credits mastery only after demonstrated due D30 recall or a fresh transfer pass', () => {
    const waiting = item({ stage: 'D30', successful_due_d30_at: null, mastered_at: null });
    expect(waiting.recovery_state).not.toBe('mastered');

    const duePass = transitionRecoveryItem({
      item: waiting,
      grade: 'good',
      today: '2026-08-31',
      occurredAt: '2026-08-31T10:00:00.000Z'
    });
    expect(duePass.item).toMatchObject({
      stage: 'MASTERED',
      recovery_state: 'mastered',
      successful_due_d30_at: '2026-08-31T10:00:00.000Z'
    });

    const transfer = transitionRecoveryItem({
      item: item({ stage: 'TRANSFER', recovery_state: 'transfer' }),
      grade: 'easy',
      today: '2026-08-31',
      occurredAt: '2026-08-31T11:00:00.000Z'
    });
    expect(transfer.item.transfer_passed_at).toBe('2026-08-31T11:00:00.000Z');
    expect(transfer.mastered).toBe(true);
  });
});

describe('bounded prioritized recovery', () => {
  const candidates: RecoveryCandidate[] = [
    {
      item: item({ id: 'a', subject: 'Algorithms', scheduled_date: '2026-08-20', lapse_count: 2 }),
      estimatedSeconds: 300,
      marks: 2,
      confidenceSurprise: true
    },
    {
      item: item({ id: 'b', subject: 'Algorithms', scheduled_date: '2026-08-31' }),
      estimatedSeconds: 360
    },
    {
      item: item({ id: 'c', subject: 'DBMS', scheduled_date: '2026-08-30' }),
      estimatedSeconds: 240,
      weeklyFocus: true
    },
    {
      item: item({ id: 'd', subject: 'OS', scheduled_date: '2026-09-02' }),
      estimatedSeconds: 180
    }
  ];

  it('ranks disclosed priority reasons and interleaves subjects inside the time bound', () => {
    const ranked = rankRecoveryCandidates(candidates, '2026-08-31');
    expect(ranked[0].item.id).toBe('a');
    expect(ranked[0].reasons).toEqual(
      expect.arrayContaining(['11d overdue', '2 lapses', '2 marks', 'confidence surprise'])
    );

    const sprint = buildRecoverySprint(candidates, 'minutes-10', '2026-08-31');
    expect(sprint.estimatedSeconds).toBeLessThanOrEqual(600);
    expect(sprint.selected.map((candidate) => candidate.item.subject).slice(0, 2)).toEqual([
      'Algorithms',
      'DBMS'
    ]);
    expect(sprint.mustRecoverToday.length).toBeGreaterThan(0);
    expect(sprint.deferredCount).toBeGreaterThan(0);
  });

  it('forecasts overdue debt today and scheduled load without double counting', () => {
    const forecast = forecastRecoveryLoad(candidates, '2026-08-31', 3);
    expect(forecast).toEqual([
      { date: '2026-08-31', itemCount: 3, estimatedMinutes: 15, overdue: 2 },
      { date: '2026-09-01', itemCount: 0, estimatedMinutes: 0, overdue: 0 },
      { date: '2026-09-02', itemCount: 1, estimatedMinutes: 3, overdue: 0 }
    ]);
  });
});
