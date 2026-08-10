import { describe, expect, it } from 'vitest';
import {
  dailyPyqCopy,
  detailedDayPlanCopy,
  parseStudyPlanBlocks
} from '../../supabase/functions/_shared/study-notification-copy';

describe('study notification copy', () => {
  const blocks = parseStudyPlanBlocks([
    {
      id: '1',
      subject: 'Algorithms',
      durationMin: 90,
      mode: 'PYQ Practice',
      priority: 'P1 Critical',
      target: 'Solve 15 dynamic-programming PYQs'
    },
    {
      id: '2',
      subject: 'Operating Systems',
      durationMin: 60,
      mode: 'Revision',
      priority: 'P2 High',
      target: 'Revise process scheduling'
    }
  ]);

  it('turns a real daily plan into a detailed, bounded notification', () => {
    const copy = detailedDayPlanCopy({
      blocks,
      openItems: [
        { id: 'task-1', title: 'Review mock mistakes', subject: 'Aptitude', targetMin: 30 }
      ],
      reattemptsDue: 3
    });

    expect(copy.hasPlan).toBe(true);
    expect(copy.title).toContain('2 blocks');
    expect(copy.title).toContain('2h 30m');
    expect(copy.body).toContain('Algorithms · 1h 30m — Solve 15 dynamic-programming PYQs');
    expect(copy.body).toContain('Operating Systems · 1h — Revise process scheduling');
    expect(copy.body).toContain('Task: Aptitude · Review mock mistakes · 30m');
    expect(copy.body).toContain('3 re-attempts also due.');
    expect(copy.body.length).toBeLessThanOrEqual(480);
  });

  it('uses a specific empty-plan prompt only when no plan exists', () => {
    const copy = detailedDayPlanCopy({ blocks: [], openItems: [], reattemptsDue: 0 });
    expect(copy.hasPlan).toBe(false);
    expect(copy.body).toContain('No study blocks or open tasks');
  });

  it('makes the daily PYQ reminder follow a planned PYQ block', () => {
    const copy = dailyPyqCopy({ blocks, attemptedLast24h: 4 });
    expect(copy.title).toBe('Daily PYQs · 1h 30m planned');
    expect(copy.body).toContain('Algorithms · 1h 30m');
    expect(copy.body).toContain('4 PYQs solved in the last 24h');
    expect(copy.body).toContain('Start today’s planned set now.');
  });

  it('still sends an actionable daily PYQ target without a plan', () => {
    const copy = dailyPyqCopy({ blocks: [], attemptedLast24h: 0 });
    expect(copy.title).toBe('Daily PYQ reminder');
    expect(copy.body).toContain('complete at least 10 questions');
  });
});
