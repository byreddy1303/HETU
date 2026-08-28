import { describe, expect, it } from 'vitest';
import type { QuestionRow } from '@/types';
import { applyDraftToRow, draftFromRow, emptyDraft } from '@/components/shared/questionDraft';

const question: QuestionRow = {
  id: 'question-1',
  user_id: 'user-1',
  session_id: null,
  subject: 'Algorithms',
  subtopic: null,
  source_year: null,
  source_ref: null,
  question_text: 'Find the shortest path.',
  answer_text: null,
  image_url: null,
  time_spent_sec: 90,
  target_time_sec: 120,
  outcome: 'R',
  pattern_name: null,
  trigger_sentence: null,
  root_cause: null,
  mark_decision: null,
  mark_correct: null,
  created_at: '2026-07-22T09:00:00.000Z'
};

describe('question answer persistence', () => {
  it('starts blank and persists a normalized answer through the shared editor pipeline', () => {
    const draft = emptyDraft('Algorithms', '2026-07-22');
    expect(draft.answerText).toBeNull();

    const saved = applyDraftToRow(question, {
      ...draft,
      questionText: question.question_text,
      answerText: '  Run Dijkstra from the source.  '
    });

    expect(saved.answer_text).toBe('Run Dijkstra from the source.');
    expect(draftFromRow(saved).answerText).toBe('Run Dijkstra from the source.');
  });

  it('preserves an audited legacy PYQ mark allocation through journal edits', () => {
    const legacy = {
      ...question,
      source_year: 1996,
      source_ref: 'GATE PYQ · 1996 · Q14',
      target_time_sec: 450
    };
    const draft = draftFromRow(legacy);

    expect(draft.marks).toBe(5);
    expect(applyDraftToRow(legacy, { ...draft, answerText: 'Audited answer.' }).target_time_sec).toBe(
      450
    );
  });
});
