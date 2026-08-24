import { describe, expect, it } from 'vitest';
import type { PyqAttemptRow, QuestionRow } from '@/types';
import type { PyqQuestion } from '@/lib/pyq';
import { filterPyqByHistory } from '@/lib/pyq-history';
import { pyqJournalQuestionId } from '@/lib/pyq-session';

function question(id: string, marks: 1 | 2 = 1): PyqQuestion {
  return { id, marks } as PyqQuestion;
}

function attempt(
  id: string,
  questionUid: string,
  patch: Partial<PyqAttemptRow> = {}
): PyqAttemptRow {
  return {
    id,
    user_id: 'user-1',
    pyq_session_id: 'session-1',
    question_uid: questionUid,
    subject: 'Databases',
    year: 2025,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'B',
    capture_version: 2,
    question_snapshot: null,
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: false,
    question_started_at: '2026-08-01T09:00:00.000Z',
    time_spent_ms: 60_000,
    time_spent_sec: 60,
    bank_version: 'v1',
    attempted_at: '2026-08-01T09:01:00.000Z',
    ...patch
  };
}

describe('PYQ history filters', () => {
  const questions = [
    question('unseen'),
    question('wrong'),
    question('guess'),
    question('slow', 2),
    question('skip'),
    question('repeat')
  ];
  const attempts = [
    attempt('a-wrong', 'wrong'),
    attempt('a-guess', 'guess', { mark_decision: 'FIFTY_FIFTY', mark_correct: true }),
    attempt('a-slow', 'slow', { mark_correct: true, time_spent_sec: 240 }),
    attempt('a-skip', 'skip', { mark_decision: 'SKIP', mark_correct: null, selected_answer: null }),
    attempt('a-repeat-1', 'repeat'),
    attempt('a-repeat-2', 'repeat', {
      attempt_number: 2,
      attempted_at: '2026-08-02T09:00:00.000Z',
      mark_correct: true
    })
  ];

  it('selects every supported history slice using the latest attempt', () => {
    const ids = (filter: Parameters<typeof filterPyqByHistory>[1]) =>
      filterPyqByHistory(questions, filter, attempts, []).map((row) => row.id);
    expect(ids('unseen')).toEqual(['unseen']);
    expect(ids('incorrect')).toEqual(['wrong']);
    expect(ids('guessed')).toEqual(['guess']);
    expect(ids('slow')).toEqual(['slow']);
    expect(ids('skipped')).toEqual(['skip']);
    expect(ids('repeated')).toEqual(['repeat']);
  });

  it('removes a wrong answer from the unanalyzed slice after its journal row exists', () => {
    expect(filterPyqByHistory(questions, 'unanalyzed', attempts, []).map((row) => row.id)).toEqual([
      'wrong'
    ]);
    const journal = [
      {
        id: pyqJournalQuestionId('a-wrong'),
        user_id: 'user-1',
        source_pyq_attempt_id: null
      }
    ] as QuestionRow[];
    expect(filterPyqByHistory(questions, 'unanalyzed', attempts, journal)).toEqual([]);
  });
});
