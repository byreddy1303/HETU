import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { QuestionRow, ReattemptRow } from '@/types';
import { db } from '@/lib/db';
import type { PyqQuestion } from '@/lib/pyq';
import {
  createPyqAttemptRow,
  createPyqSessionRow,
  pyqJournalQuestionId,
  pyqReattemptAttemptId
} from '@/lib/pyq-session';
import { captureElementToDataUrl } from '@/lib/image';
import Dashboard from '@/pages/Dashboard';
import DoNow from '@/pages/DoNow';
import Reattempts from '@/pages/Reattempts';

const USER = '00000000-0000-4000-8000-000000000001';
const QUESTION = 'Which schedules are conflict serializable, and why?';
const ANSWER = 'The schedule is not conflict serializable.';
const PATTERN = 'precedence graph cycle';
const IMAGE =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22100%22%3E%3Crect width=%22200%22 height=%22100%22 fill=%22white%22/%3E%3C/svg%3E';

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

vi.mock('@/lib/image', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/image')>();
  return {
    ...original,
    captureElementToDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,cmVhdHRlbXB0LXNob3Q=')
  };
});

async function seedDueQuestion(
  scheduledDate = '2026-07-20',
  format: 'MCQ' | 'MSQ' | 'NAT' = 'MCQ'
) {
  const question: QuestionRow = {
    id: 'question-due',
    user_id: USER,
    session_id: null,
    subject: 'Databases',
    subtopic: 'Transactions',
    source_year: 2024,
    source_ref: `GATE PYQ · 2024 Set 1 · 31 · ${format}`,
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

async function seedDuePyq() {
  const pyq: PyqQuestion = {
    id: 'gate-2026-set1-q1',
    year: 2026,
    set: 1,
    number: '1',
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Discrete Mathematics',
    subjectSlug: 'discrete-mathematics',
    topic: 'Propositional Logic',
    topicSlug: 'propositional-logic',
    subtopics: ['Logic'],
    marks: 1,
    type: 'MCQ',
    answer: 'B',
    tolerance: null,
    answerStatus: 'available',
    html: `
      <p>Which proposition is a tautology?</p>
      <ol type="A">
        <li>p and not p</li>
        <li>p or not p</li>
        <li>p only</li>
        <li>not p only</li>
      </ol>
    `,
    sourceUrl: 'https://gateoverflow.in/test',
    answerSource: null
  };
  const session = createPyqSessionRow(
    USER,
    'test-bank-v2',
    {
      subjectSlug: pyq.subjectSlug,
      topicSlug: pyq.topicSlug,
      fromYear: pyq.year,
      toYear: pyq.year,
      type: 'MCQ',
      order: 'unseen',
      count: '5'
    },
    [pyq],
    '2026-07-17T10:00:00.000Z'
  );
  const firstAttempt = createPyqAttemptRow({
    userId: USER,
    session,
    question: pyq,
    selectedAnswer: 'A',
    decision: 'MARK',
    bankVersion: 'test-bank-v2',
    questionStartedAtMs: Date.parse('2026-07-17T10:00:00.000Z'),
    committedAtMs: Date.parse('2026-07-17T10:01:00.000Z'),
    screenshotUrl: 'data:image/png;base64,Zmlyc3Q='
  });
  const journalQuestionId = pyqJournalQuestionId(firstAttempt.id);
  const journalQuestion: QuestionRow = {
    id: journalQuestionId,
    user_id: USER,
    session_id: session.id,
    subject: pyq.subject,
    subtopic: pyq.topic,
    source_year: pyq.year,
    source_ref: `${pyq.paperLabel} Q${pyq.number}`,
    question_text: 'Which proposition is a tautology?',
    answer_text: 'Answer key: B',
    image_url: firstAttempt.screenshot_url,
    time_spent_sec: firstAttempt.time_spent_sec,
    target_time_sec: 120,
    outcome: 'W-C',
    pattern_name: 'tautology recognition',
    trigger_sentence: 'Check both truth values.',
    root_cause: 'concept',
    mark_decision: firstAttempt.mark_decision,
    mark_correct: firstAttempt.mark_correct,
    created_at: firstAttempt.attempted_at
  };
  const reattempt: ReattemptRow = {
    id: 'reattempt-pyq',
    user_id: USER,
    question_id: journalQuestionId,
    scheduled_date: '2026-07-20',
    stage: 'D3',
    history: [],
    created_at: '2026-07-17T10:01:01.000Z'
  };

  await db.pyq_sessions.put({ ...session, sync_status: 'synced' });
  await db.pyq_attempts.put({ ...firstAttempt, sync_status: 'synced' });
  await db.questions.put({ ...journalQuestion, sync_status: 'synced' });
  await db.reattempts.put({ ...reattempt, sync_status: 'synced' });
}

describe('re-attempt solve flow', () => {
  beforeEach(async () => {
    await Promise.all([
      db.questions.clear(),
      db.reattempts.clear(),
      db.pyq_attempts.clear(),
      db.pyq_sessions.clear(),
      db.sessions.clear(),
      db.weekly_reviews.clear()
    ]);
    vi.mocked(captureElementToDataUrl).mockClear();
  });

  it('opens a logged MCQ with exam controls and persists the answer comparison', async () => {
    await seedDueQuestion();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reattempts/reattempt-due']}>
        <Routes>
          <Route path="/reattempts" element={<Reattempts />} />
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText(PATTERN)).toBeInTheDocument();
    expect(screen.getByText('carried forward')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit session' })).toBeInTheDocument();
    expect(screen.queryByText(ANSWER)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument();
    expect(screen.queryByText('Actual answer')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal answer' }));

    const history = await screen.findByRole('region', { name: 'Re-attempt answer history' });
    const attemptTwo = within(history).getByText('Attempt 2 answer');
    const attemptOne = within(history).getByText('Attempt 1 answer');
    const actual = within(history).getByText('Actual answer');
    expect(attemptTwo.nextElementSibling).toHaveTextContent('C');
    expect(attemptOne.nextElementSibling).toHaveTextContent('Not captured in the original log');
    expect(actual.nextElementSibling).toHaveTextContent(ANSWER);
    await user.click(screen.getByRole('button', { name: 'Clean — answer + method' }));

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await db.reattempts.get('reattempt-due');
      expect(stored?.stage).toBe('D10');
      expect(stored?.history).toHaveLength(1);
      expect(stored?.history[0].timeSpent).toBeTypeOf('number');
      expect(stored?.history[0]).toMatchObject({
        selectedAnswer: 'C',
        correctAnswer: ANSWER,
        markDecision: 'MARK'
      });
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
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
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
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
  });

  it('runs a due PYQ in the full exam UI and shows second, first, and actual answers', async () => {
    await seedDuePyq();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reattempts']}>
        <Routes>
          <Route path="/reattempts" element={<Reattempts />} />
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start test' }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    expect(screen.getByText('p and not p')).toBeInTheDocument();
    expect(screen.getByText('p or not p')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
    expect(screen.queryByText('Actual answer')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));

    const history = await screen.findByRole('region', { name: 'PYQ answer history' });
    const attemptTwo = within(history).getByText('Attempt 2 answer');
    const attemptOne = within(history).getByText('Attempt 1 answer');
    const actual = within(history).getByText('Actual answer');
    expect(attemptTwo.nextElementSibling).toHaveTextContent('B');
    expect(attemptOne.nextElementSibling).toHaveTextContent('A');
    expect(actual.nextElementSibling).toHaveTextContent('B');

    await waitFor(async () => {
      const attempts = await db.pyq_attempts
        .where('question_uid')
        .equals('gate-2026-set1-q1')
        .sortBy('attempted_at');
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toMatchObject({
        id: pyqReattemptAttemptId('reattempt-pyq', 0),
        pyq_session_id: null,
        attempt_number: 2,
        selected_answer: 'B',
        correct_answer: 'B',
        mark_correct: true,
        capture_version: 2
      });
    });

    await user.click(screen.getByRole('button', { name: 'Clean — answer + method' }));
    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
    const stored = await db.reattempts.get('reattempt-pyq');
    expect(stored?.history[0]).toMatchObject({
      selectedAnswer: 'B',
      correctAnswer: 'B',
      markDecision: 'MARK'
    });
  });

  it('opens a logged NAT with numeric input and stores the submitted value', async () => {
    await seedDueQuestion('2026-07-20', 'NAT');
    const storedQuestion = await db.questions.get('question-due');
    await db.questions.put({ ...storedQuestion!, answer_text: '42.5', sync_status: 'synced' });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reattempts/reattempt-due']}>
        <Routes>
          <Route path="/reattempts" element={<Reattempts />} />
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    const input = await screen.findByLabelText('Your numeric answer');
    await user.type(input, '42.5');
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal answer' }));

    const history = await screen.findByRole('region', { name: 'Re-attempt answer history' });
    const attemptTwo = within(history).getByText('Attempt 2 answer');
    const actual = within(history).getByText('Actual answer');
    expect(attemptTwo.nextElementSibling).toHaveTextContent('42.5');
    expect(actual.nextElementSibling).toHaveTextContent('42.5');

    await user.click(screen.getByRole('button', { name: 'Clean — answer + method' }));
    await waitFor(async () => {
      const stored = await db.reattempts.get('reattempt-due');
      expect(stored?.history[0]).toMatchObject({
        selectedAnswer: '42.5',
        correctAnswer: '42.5',
        markDecision: 'MARK'
      });
    });
  });

  it('opens a question photo in the zoomable full-screen viewer', async () => {
    await seedDueQuestion();
    const stored = await db.questions.get('question-due');
    await db.questions.put({ ...stored!, image_url: IMAGE, sync_status: 'synced' });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reattempts/reattempt-due']}>
        <Routes>
          <Route path="/reattempts" element={<Reattempts />} />
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(
      await screen.findByRole('button', { name: 'Open question image full screen' })
    );
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close preview' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument();
    });
  });
});
