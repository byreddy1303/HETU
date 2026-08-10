import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { QuestionRow, ReattemptRow } from '@/types';
import { db } from '@/lib/db';
import Dashboard from '@/pages/Dashboard';
import DoNow from '@/pages/DoNow';
import Reattempts from '@/pages/Reattempts';

const USER = '00000000-0000-4000-8000-000000000001';
const QUESTION = 'Which schedules are conflict serializable, and why?';
const ANSWER = 'The schedule is not conflict serializable.';
const PATTERN = 'precedence graph cycle';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: USER,
    sandbox: true,
    user: null,
    profile: {
      id: USER,
      name: 'Test learner',
      email: 'learner@example.test',
      username: 'test_learner',
      exam_date: '2027-02-06',
      target_rank: 100,
      sadhana_practice: false,
      timezone: 'Asia/Kolkata',
      created_at: '2026-07-01T00:00:00.000Z',
      welcome_seen_at: '2026-07-01T00:00:00.000Z',
      phone_e164: null,
      digest_email_enabled: false,
      digest_whatsapp_enabled: false,
      digest_hour_local: 6,
      digest_minute_local: 0,
      wa_opted_in_at: null,
      last_digest_sent_on: null,
      buddy_notification_preview_enabled: true
    }
  })
}));

vi.mock('@/components/dashboard/WelcomeOverlay', () => ({ default: () => null }));

async function seedDueQuestion(scheduledDate = '2026-07-20') {
  const question: QuestionRow = {
    id: 'question-due',
    user_id: USER,
    session_id: null,
    subject: 'Databases',
    subtopic: 'Transactions',
    source_year: 2024,
    source_ref: 'GATE CS 2024 Q31',
    question_text: QUESTION,
    answer_text: ANSWER,
    image_url: null,
    time_spent_sec: 180,
    target_time_sec: 120,
    outcome: 'W-C',
    pattern_name: PATTERN,
    trigger_sentence: 'Draw the precedence graph before judging the schedule.',
    root_cause: 'concept',
    mark_decision: 'MARK',
    mark_correct: false,
    created_at: '2026-07-17T10:00:00.000Z'
  };
  const reattempt: ReattemptRow = {
    id: 'reattempt-due',
    user_id: USER,
    question_id: question.id,
    scheduled_date: scheduledDate,
    stage: 'D3',
    history: [],
    created_at: '2026-07-17T10:01:00.000Z'
  };

  await db.questions.put({ ...question, sync_status: 'synced' });
  await db.reattempts.put({ ...reattempt, sync_status: 'synced' });
}

describe('re-attempt solve flow', () => {
  beforeEach(async () => {
    await Promise.all([
      db.questions.clear(),
      db.reattempts.clear(),
      db.sessions.clear(),
      db.weekly_reviews.clear()
    ]);
  });

  it('opens the first exact question on entry and records a timed response', async () => {
    await seedDueQuestion();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reattempts']}>
        <Reattempts />
      </MemoryRouter>
    );

    expect(await screen.findByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText(PATTERN)).toBeInTheDocument();
    expect(screen.getByText('carried forward')).toBeInTheDocument();
    expect(screen.queryByText(ANSWER)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start timer' }));
    expect(await screen.findByText('Attempt running')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish attempt' }));
    expect(await screen.findByText('How did it go?')).toBeInTheDocument();
    expect(screen.queryByText(ANSWER)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText(ANSWER)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clean — answer + method' }));

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await db.reattempts.get('reattempt-due');
      expect(stored?.stage).toBe('D10');
      expect(stored?.history).toHaveLength(1);
      expect(stored?.history[0].timeSpent).toBeTypeOf('number');
    });
  });

  it('opens the first carried-forward question from Dashboard Due now', async () => {
    await seedDueQuestion();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/today" element={<DoNow />} />
          <Route path="/reattempts" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    const dueButton = await screen.findByRole('button', {
      name: '1 ordered actions. Open Do now'
    });
    await user.click(dueButton);

    expect(await screen.findAllByText('Clear due re-attempts')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Start next' }));

    expect(await screen.findByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument();
  });
});
