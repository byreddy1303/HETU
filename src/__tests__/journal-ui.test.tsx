import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { QuestionRow } from '@/types';
import { db } from '@/lib/db';
import Journal from '@/pages/Journal';

const USER = '11111111-1111-4111-8111-111111111111';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    userId: USER,
    status: 'signed_in',
    sandbox: true,
    profile: { timezone: 'Asia/Kolkata' }
  })
}));

describe('Journal question list', () => {
  beforeEach(async () => {
    await Promise.all([
      db.questions.clear(),
      db.sessions.clear(),
      db.pyq_sessions.clear(),
      db.pyq_attempts.clear()
    ]);
  });

  it('shows standalone imported questions before any filter is selected', async () => {
    const question: QuestionRow = {
      id: 'standalone-imported-question',
      user_id: USER,
      session_id: null,
      subject: 'Computer Organization',
      subtopic: "Amdahl's Law",
      source_year: 2026,
      source_ref: 'GO Classes COA Topic Test 2 · Q10 · MCQ',
      question_text: 'What is the best possible parallel execution time?',
      answer_text: 'Your answer: B\nActual answer: C',
      image_url: '/pyq/images/go-classes-coa-topic-test-2/practice-q10-v2.png',
      time_spent_sec: 102,
      target_time_sec: 120,
      outcome: 'W-C',
      pattern_name: 'Parallel speedup limit',
      trigger_sentence: null,
      root_cause: null,
      mark_decision: 'MARK',
      mark_correct: false,
      created_at: '2026-08-13T06:30:00.000Z'
    };
    await db.questions.put({ ...question, sync_status: 'synced' });

    render(
      <MemoryRouter>
        <Journal />
      </MemoryRouter>
    );

    expect(await screen.findByText('Parallel speedup limit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View photo' })).toBeInTheDocument();
    expect(screen.getByText('1 of 1 entry')).toBeInTheDocument();
  });
});
