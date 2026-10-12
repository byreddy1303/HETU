import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuestionAttemptTimeline from '@/components/pyq/QuestionAttemptTimeline';
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
    time_spent_ms: 90000,
    time_spent_sec: 90,
    bank_version: 'bank-1',
    attempted_at: '2024-01-01T00:00:00.000Z',
    ...overrides
  } as PyqAttemptRow;
}

describe('QuestionAttemptTimeline', () => {
  it('shows the attempt count and mastery for answered questions', () => {
    render(
      <QuestionAttemptTimeline
        questionUid="q-1"
        attempts={[
          attempt({ id: 'a1' }),
          attempt({ id: 'a2', attempted_at: '2024-02-01T00:00:00.000Z', mark_correct: true })
        ]}
      />
    );
    expect(screen.getByText(/History · 2 attempts/)).toBeInTheDocument();
    expect(screen.getByText('Fragile')).toBeInTheDocument();
  });

  it('shows an empty state for unseen questions', () => {
    render(<QuestionAttemptTimeline questionUid="q-9" attempts={[attempt({ id: 'a1' })]} />);
    expect(screen.getByText(/No attempts yet/)).toBeInTheDocument();
  });
});
