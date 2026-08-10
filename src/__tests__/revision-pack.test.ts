import { describe, expect, it } from 'vitest';
import type {
  FormulaRow,
  QuestionRow,
  ReattemptRow,
  TriggerPhraseRow,
  WeeklyReviewRow
} from '@/types';
import { buildRevisionPack, revisionPackText } from '@/lib/revision-pack';

describe('revision pack', () => {
  it('prioritizes due retrieval and repeated mistake patterns', () => {
    const questions = [
      {
        id: 'q1',
        subject: 'DBMS',
        outcome: 'W-C',
        pattern_name: 'Conflict graph',
        created_at: '2026-08-08'
      },
      {
        id: 'q2',
        subject: 'DBMS',
        outcome: 'W-E',
        pattern_name: 'Conflict graph',
        created_at: '2026-08-09'
      }
    ] as QuestionRow[];
    const pack = buildRevisionPack({
      today: '2026-08-10',
      weeklyReviews: [
        {
          week_start: '2026-08-10',
          this_weeks_fix: 'Write the precedence graph first.'
        } as WeeklyReviewRow
      ],
      formulas: [
        {
          name: 'Bayes',
          subject: 'Maths',
          expression: 'P(A|B)',
          next_review: '2026-08-10'
        } as FormulaRow
      ],
      triggers: [{ phrase: 'same data item', concept: 'conflict' } as TriggerPhraseRow],
      questions,
      reattempts: [{ question_id: 'q1', stage: 'D3', scheduled_date: '2026-08-09' } as ReattemptRow]
    });
    expect(pack.priorityQuestions[0].id).toBe('q1');
    expect(pack.repeatedMistakes[0]).toMatchObject({ name: 'Conflict graph', count: 2 });
    expect(revisionPackText(pack)).toContain('Write the precedence graph first.');
    expect(revisionPackText(pack)).toContain('P(A|B)');
  });
});
