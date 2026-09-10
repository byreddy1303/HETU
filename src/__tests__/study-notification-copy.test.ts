import { describe, expect, it } from 'vitest';
import {
  dailyPyqCopy,
  detailedDayPlanCopy,
  parseStudyPlanBlocks
} from '../../supabase/functions/_shared/study-notification-copy';
import { openPlannerSessions } from '../../supabase/functions/_shared/planner-reminders';
import { parseTelegramStudySessions } from '../../supabase/functions/_shared/telegram';

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

  it('uses the same unfinished unified blocks for push, email, and Telegram', () => {
    const source = [
      { subject: 'Algorithms', durationMin: 20, mode: 'PYQ', target: 'Migrated legacy task' },
      { subject: 'OS', durationMin: 60, mode: 'Study', execution: { completedAt: '2026-09-10T08:00:00Z' } },
      { subject: 'DBMS', durationMin: 30, mode: 'Revision', execution: { completedAt: null, startedAt: '2026-09-10T08:00:00Z' } },
      { subject: 'Networks', durationMin: 10, execution: { completedAt: 'corrupt' } },
      null
    ];
    const pushBlocks = parseStudyPlanBlocks(source);
    const digestBlocks = parseTelegramStudySessions(openPlannerSessions(source));
    expect(pushBlocks.map((row) => row.subject)).toEqual(['Algorithms', 'DBMS', 'Networks']);
    expect(digestBlocks.map((row) => row.subject)).toEqual(pushBlocks.map((row) => row.subject));
    const copy = detailedDayPlanCopy({ blocks: pushBlocks, openItems: [], reattemptsDue: 0 });
    expect(copy.title).toContain('3 blocks · 1h');
    expect(copy.body).toContain('Migrated legacy task');
    expect(copy.body).not.toContain('OS');
    expect(copy.title).not.toContain('task');
  });

  it('keeps full remaining-work totals when legacy conversion exceeds 24 blocks', () => {
    const source = Array.from({ length: 30 }, () => ({ subject: 'Algorithms', durationMin: 5 }));
    const blocks = parseStudyPlanBlocks(source);
    expect(parseTelegramStudySessions(openPlannerSessions(source))).toHaveLength(30);
    const copy = detailedDayPlanCopy({ blocks, openItems: [], reattemptsDue: 0 });
    expect(copy.title).toContain('30 blocks · 2h 30m');
    expect(copy.body).toContain('26 more blocks');
    expect(copy.body.length).toBeLessThanOrEqual(480);
  });
});
