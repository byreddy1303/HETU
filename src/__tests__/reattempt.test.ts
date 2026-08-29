// F3.3 DoD: ladder progression D3→D10→D30→MASTERED; failure moves back one rung.
import { describe, it, expect, beforeEach } from 'vitest';
import type { ReattemptRow } from '@/types';
import {
  advance,
  buildReattemptQueue,
  evaluateLoggedReattemptAnswer,
  needsReattempt,
  scheduleReattempt,
  recordReattemptResult
} from '@/lib/reattempt';
import { db } from '@/lib/db';

const USER = '00000000-0000-4000-8000-000000000001';
const TODAY = '2026-07-17';

function ladderRow(stage: ReattemptRow['stage'], scheduled = TODAY): ReattemptRow {
  return {
    id: 'ra-1',
    user_id: USER,
    question_id: 'q-1',
    scheduled_date: scheduled,
    stage,
    history: [],
    created_at: '2026-07-14T09:00:00.000Z'
  };
}

describe('advance (pure ladder)', () => {
  it('progresses D3 → D10 → D30 → MASTERED on clean results', () => {
    let state = ladderRow('D3');
    let next = advance(state, 'clean', TODAY);
    expect(next.stage).toBe('D10');
    expect(next.scheduled_date).toBe('2026-07-27'); // +10d

    state = { ...state, ...next };
    next = advance(state, 'clean', TODAY);
    expect(next.stage).toBe('D30');
    expect(next.scheduled_date).toBe('2026-08-16'); // +30d

    state = { ...state, ...next };
    next = advance(state, 'clean', TODAY);
    expect(next.stage).toBe('MASTERED');
    // MASTERED keeps its last scheduled_date (SQL coalesce semantics)
    expect(next.scheduled_date).toBe('2026-08-16');
    expect(next.history.map((h) => h.result)).toEqual(['clean', 'clean', 'clean']);
  });

  it.each([
    ['D3', 'D3', '2026-07-20'],
    ['D10', 'D3', '2026-07-20'],
    ['D30', 'D10', '2026-07-27']
  ] as const)('fail at %s moves to %s', (stage, expectedStage, expectedDate) => {
    const next = advance(ladderRow(stage), 'fail', TODAY);
    expect(next.stage).toBe(expectedStage);
    expect(next.scheduled_date).toBe(expectedDate);
    expect(next.history).toEqual([{ date: TODAY, result: 'fail' }]);
  });

  it('clean on MASTERED stays MASTERED and keeps its date', () => {
    const next = advance(ladderRow('MASTERED', '2026-08-16'), 'clean', TODAY);
    expect(next.stage).toBe('MASTERED');
    expect(next.scheduled_date).toBe('2026-08-16');
  });

  it('stores rounded solve time when a timed attempt is reported', () => {
    const next = advance(ladderRow('D3'), 'clean', TODAY, 94.6);
    expect(next.history).toEqual([{ date: TODAY, result: 'clean', timeSpent: 95 }]);
  });

  it('stores the learner answer, saved key, and exam decision with the attempt', () => {
    const next = advance(ladderRow('D3'), 'fail', TODAY, 75, {
      selectedAnswer: ['A', 'C'],
      correctAnswer: ['A', 'D'],
      markDecision: 'FIFTY_FIFTY'
    });

    expect(next.history[0]).toEqual({
      date: TODAY,
      result: 'fail',
      timeSpent: 75,
      selectedAnswer: ['A', 'C'],
      correctAnswer: ['A', 'D'],
      markDecision: 'FIFTY_FIFTY'
    });
  });
});

describe('evaluateLoggedReattemptAnswer', () => {
  it('checks MCQ and MSQ keys without depending on choice order', () => {
    expect(evaluateLoggedReattemptAnswer('MCQ', 'B', 'Answer key: b', 'MARK')).toBe(true);
    expect(evaluateLoggedReattemptAnswer('MCQ', 'A', 'B', 'MARK')).toBe(false);
    expect(evaluateLoggedReattemptAnswer('MCQ', 'E', 'Answer key: E', 'MARK')).toBe(true);
    expect(evaluateLoggedReattemptAnswer('MSQ', ['C', 'A'], 'A, C', 'MARK')).toBe(true);
    expect(evaluateLoggedReattemptAnswer('MSQ', ['E', 'B'], 'B, E', 'MARK')).toBe(true);
  });

  it('checks exact NAT values and treats a skipped answer as incorrect', () => {
    expect(evaluateLoggedReattemptAnswer('NAT', '42.5', 'Answer: 42.5', 'MARK')).toBe(true);
    expect(evaluateLoggedReattemptAnswer('NAT', '42.6', '42.5', 'MARK')).toBe(false);
    expect(evaluateLoggedReattemptAnswer('MCQ', null, 'B', 'SKIP')).toBe(false);
  });

  it('does not guess when a saved answer is not a checkable key', () => {
    expect(
      evaluateLoggedReattemptAnswer(
        'MCQ',
        'C',
        'The schedule is not conflict serializable.',
        'MARK'
      )
    ).toBeNull();
  });
});

describe('needsReattempt', () => {
  it('is false for R, true for RBS/RBG and every W-*', () => {
    expect(needsReattempt('R')).toBe(false);
    for (const o of ['RBS', 'RBG', 'W-C', 'W-E', 'W-R'] as const) {
      expect(needsReattempt(o)).toBe(true);
    }
  });
});

describe('buildReattemptQueue', () => {
  it('carries every unanswered earlier row into today until a result is recorded', () => {
    const rows = [
      ladderRow('D3', '2026-07-15'),
      { ...ladderRow('D10', '2026-07-17'), id: 'ra-2' },
      { ...ladderRow('D30', '2026-07-20'), id: 'ra-3' },
      { ...ladderRow('MASTERED', '2026-07-15'), id: 'ra-4' }
    ];

    const queue = buildReattemptQueue(rows, '2026-07-17');

    expect(queue.due.map((row) => row.id)).toEqual(['ra-1', 'ra-2']);
    expect(queue.upcoming.map((row) => row.id)).toEqual(['ra-3']);
    expect(queue.mastered).toBe(1);
  });
});

describe('scheduling (Dexie-backed)', () => {
  beforeEach(async () => {
    await db.reattempts.clear();
  });

  it('creates a D3 row due today + 3', async () => {
    const row = await scheduleReattempt(USER, 'q-9', TODAY);
    expect(row?.stage).toBe('D3');
    expect(row?.scheduled_date).toBe('2026-07-20');
    const stored = await db.reattempts.get(row!.id);
    expect(stored?.sync_status).toBe('synced'); // sandbox: sync disabled in tests
  });

  it('does not duplicate an open ladder for the same question', async () => {
    await scheduleReattempt(USER, 'q-9', TODAY);
    const second = await scheduleReattempt(USER, 'q-9', TODAY);
    expect(second).toBeNull();
    expect(await db.reattempts.where('question_id').equals('q-9').count()).toBe(1);
  });

  it('recordReattemptResult persists the advanced row', async () => {
    const row = (await scheduleReattempt(USER, 'q-9', TODAY))!;
    const updated = await recordReattemptResult(row, 'clean', TODAY);
    expect(updated.stage).toBe('D10');
    const stored = await db.reattempts.get(row.id);
    expect(stored?.stage).toBe('D10');
    expect(stored?.history).toHaveLength(1);
  });
});
