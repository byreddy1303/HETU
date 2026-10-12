import { describe, expect, it } from 'vitest';
import {
  buildQuestionTimeline,
  masteryForVerdicts
} from '@/lib/question-attempt-timeline';
import type { PyqAttemptRow } from '@/types';

function attempt(overrides: Partial<PyqAttemptRow> & { id: string }): PyqAttemptRow {
  return {
    user_id: 'user-1',
    pyq_session_id: 'session-1',
    question_uid: 'q-1',
    subject: 'OS',
    year: 2024,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'B',
    capture_version: 3,
    question_snapshot: null,
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: false,
    time_spent_ms: 60000,
    time_spent_sec: 60,
    bank_version: 'bank-1',
    attempted_at: '2024-01-01T00:00:00.000Z',
    ...overrides
  } as PyqAttemptRow;
}

describe('masteryForVerdicts', () => {
  it('returns new for no attempts', () => {
    expect(masteryForVerdicts([])).toBe('new');
  });

  it('returns mastered after three straight correct', () => {
    expect(masteryForVerdicts(['wrong', 'correct', 'correct', 'correct'])).toBe('mastered');
  });

  it('returns fragile for a lone correct after misses', () => {
    expect(masteryForVerdicts(['wrong', 'wrong', 'correct'])).toBe('fragile');
  });

  it('returns learning when last is wrong', () => {
    expect(masteryForVerdicts(['correct', 'wrong'])).toBe('learning');
  });

  it('ignores skips when deriving mastery', () => {
    expect(masteryForVerdicts(['wrong', 'skipped', 'correct'])).toBe('fragile');
  });
});

describe('buildQuestionTimeline', () => {
  it('chains every attempt with deltas and links journal rows', () => {
    const attempts = [
      attempt({ id: 'a1', attempted_at: '2024-01-01T00:00:00.000Z', mark_correct: false, time_spent_sec: 90 }),
      attempt({ id: 'a2', attempted_at: '2024-01-05T00:00:00.000Z', mark_correct: true, time_spent_sec: 40 }),
      attempt({
        id: 'a3',
        attempted_at: '2024-01-10T00:00:00.000Z',
        mark_correct: true,
        time_spent_sec: 35,
        pyq_session_id: null,
        reattempt_id: 'r-1',
        reattempt_round: 1,
        round_attempt_number: 1
      })
    ];
    const timeline = buildQuestionTimeline('q-1', attempts, [
      { id: 'j-1', source_pyq_attempt_id: 'a1' }
    ]);
    expect(timeline.totalAttempts).toBe(3);
    expect(timeline.mastery).toBe('fragile');
    expect(timeline.streak).toBe(2);
    expect(timeline.timeDeltaSec).toEqual([null, -50, -5]);
    expect(timeline.attempts[2].mode).toBe('reattempt');
    expect(timeline.attempts[0].journalQuestionId).toBe('j-1');
    expect(timeline.completedReattemptRounds).toBe(1);
  });

  it('scopes to one question and returns new for unseen', () => {
    const timeline = buildQuestionTimeline('q-9', [attempt({ id: 'a1' })]);
    expect(timeline.totalAttempts).toBe(0);
    expect(timeline.mastery).toBe('new');
    expect(timeline.lastVerdict).toBeNull();
  });
});
