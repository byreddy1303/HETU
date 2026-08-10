import { describe, expect, it } from 'vitest';
import type { FormulaRow, PyqAttemptRow, QuestionRow, ReattemptRow } from '@/types';
import { buildDoNowQueue } from '@/lib/do-now';
import { emptyDayPlan } from '@/lib/planner-storage';

describe('Do Now queue', () => {
  it('orders review, analysis, uncertainty, speed, formulas, then planned work', () => {
    const plan = emptyDayPlan('2026-08-10');
    plan.sessions.push({
      id: 'block-1',
      subject: 'Algorithms',
      durationMin: 60,
      mode: 'Problem Solving',
      priority: 'P1 Critical',
      target: 'Solve graph PYQs'
    });
    const reattempts = [{ id: 'r1', stage: 'D3', scheduled_date: '2026-08-09' }] as ReattemptRow[];
    const attempts = [
      {
        id: 'wrong',
        question_uid: 'q1',
        mark_correct: false,
        mark_decision: 'MARK',
        attempted_at: '2026-08-09',
        time_spent_sec: 60
      },
      {
        id: 'guess',
        question_uid: 'q2',
        mark_correct: true,
        mark_decision: 'FIFTY_FIFTY',
        attempted_at: '2026-08-09',
        time_spent_sec: 60
      },
      {
        id: 'slow',
        question_uid: 'q3',
        mark_correct: true,
        mark_decision: 'MARK',
        attempted_at: '2026-08-09',
        time_spent_sec: 200,
        question_snapshot: { marks: 1 }
      }
    ] as PyqAttemptRow[];
    const formulas = [{ id: 'f1', next_review: '2026-08-10' }] as FormulaRow[];
    const queue = buildDoNowQueue({
      today: '2026-08-10',
      reattempts,
      questions: [] as QuestionRow[],
      pyqAttempts: attempts,
      formulas,
      plan
    });
    expect(queue.map((item) => item.kind)).toEqual([
      'reattempt',
      'analysis',
      'guess',
      'slow',
      'formula',
      'planned'
    ]);
    expect(queue[0].detail).toContain('1 overdue');
    expect(queue.at(-1)?.href).toContain('/session/new?');
  });

  it('omits completed planned blocks and analyzed wrong PYQs', async () => {
    const { pyqJournalQuestionId } = await import('@/lib/pyq-session');
    const plan = emptyDayPlan('2026-08-10');
    plan.sessions.push({
      id: 'done',
      subject: 'COA',
      durationMin: 30,
      mode: 'Revision',
      priority: 'P2 High',
      target: '',
      execution: {
        sessionId: 's1',
        startedAt: '2026-08-10T09:00:00Z',
        completedAt: '2026-08-10T09:30:00Z',
        actualMin: 30,
        manual: false
      }
    });
    const attempt = {
      id: 'a1',
      question_uid: 'q1',
      mark_correct: false,
      mark_decision: 'MARK',
      attempted_at: '2026-08-10'
    } as PyqAttemptRow;
    const question = { id: pyqJournalQuestionId(attempt.id) } as QuestionRow;
    expect(
      buildDoNowQueue({
        today: '2026-08-10',
        reattempts: [],
        questions: [question],
        pyqAttempts: [attempt],
        formulas: [],
        plan
      })
    ).toEqual([]);
  });
});
