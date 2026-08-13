import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { QuestionRow, ReattemptRow } from '@/types';
import { db } from '@/lib/db';
import { loadPyqQuestionByUid, type PyqQuestion } from '@/lib/pyq';
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
const ANSWER = 'C';
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

vi.mock('@/lib/pyq', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pyq')>();
  return {
    ...original,
    loadPyqQuestionByUid: vi.fn().mockResolvedValue(null)
  };
});

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

async function seedDuePyq(stage: ReattemptRow['stage'] = 'D3') {
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
    stage,
    history: [],
    created_at: '2026-07-17T10:01:01.000Z'
  };

  await db.pyq_sessions.put({ ...session, sync_status: 'synced' });
  await db.pyq_attempts.put({ ...firstAttempt, sync_status: 'synced' });
  await db.questions.put({ ...journalQuestion, sync_status: 'synced' });
  await db.reattempts.put({ ...reattempt, sync_status: 'synced' });
}

async function seedLegacyDuePyq() {
  const pyq: PyqQuestion = {
    id: 'go:1354',
    year: 2005,
    set: null,
    number: '18',
    paperLabel: 'GATE CSE 2005',
    subject: 'Digital Logic',
    subjectSlug: 'digital-logic',
    topic: 'Boolean Algebra',
    topicSlug: 'boolean-algebra',
    subtopics: ['K-map'],
    marks: null,
    type: 'MCQ',
    answer: 'A',
    tolerance: null,
    answerStatus: 'available',
    html: String.raw`<p>The switching expression corresponding to $f(A,B,C,D)=\Sigma(1, 4, 5, 9, 11, 12)$ is:</p><ol style="list-style-type:upper-alpha"><li>$BC’D’ + A’C’D + AB’D$</li><li>$ABC’ + ACD + B’C’D$</li><li>$ACD’ + A’BC’ + AC’D’$</li><li>$A’BD + ACD’ + BCD’$</li></ol>`,
    sourceUrl: 'https://gateoverflow.in/1354/gate-cse-2005-question-18',
    answerSource: null
  };
  const session = createPyqSessionRow(
    USER,
    'legacy-bank',
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
    '2026-08-02T10:00:00.000Z'
  );
  const currentAttempt = createPyqAttemptRow({
    userId: USER,
    session,
    question: pyq,
    selectedAnswer: 'C',
    decision: 'MARK',
    bankVersion: 'legacy-bank',
    questionStartedAtMs: Date.parse('2026-08-02T10:00:00.000Z'),
    committedAtMs: Date.parse('2026-08-02T10:01:00.000Z'),
    screenshotUrl: null
  });
  const legacyAttempt = {
    ...currentAttempt,
    id: 'legacy-pyq-attempt',
    pyq_session_id: null,
    capture_version: 1 as const,
    question_snapshot: null
  };
  const journalQuestion: QuestionRow = {
    id: 'random-legacy-journal-question',
    user_id: USER,
    session_id: null,
    subject: pyq.subject,
    subtopic: pyq.topic,
    source_year: pyq.year,
    source_ref: 'GATE PYQ · 2005 · Q 18 · MCQ',
    question_text:
      'The switching expression corresponding to $f(A,B,C,D)=\\Sigma(1, 4, 5, 9, 11, 12)$ is: $BC’D’ + A’C’D + AB’D$ $ABC’ + ACD + B’C’D$ $ACD’ + A’BC’ + AC’D’$ $A’BD + ACD’ + BCD’$',
    answer_text: 'Answer key: A',
    image_url: null,
    time_spent_sec: legacyAttempt.time_spent_sec,
    target_time_sec: 120,
    outcome: 'W-E',
    pattern_name: 'K-Map and determine the MIN SOP/POS',
    trigger_sentence: 'Draw K-Map and determine the MIN SOP/POS',
    root_cause: 'concept',
    mark_decision: legacyAttempt.mark_decision,
    mark_correct: legacyAttempt.mark_correct,
    created_at: legacyAttempt.attempted_at
  };
  const reattempt: ReattemptRow = {
    id: 'legacy-pyq-reattempt',
    user_id: USER,
    question_id: journalQuestion.id,
    scheduled_date: '2026-08-05',
    stage: 'D3',
    history: [],
    created_at: '2026-08-02T10:01:01.000Z'
  };

  await db.pyq_attempts.put({ ...legacyAttempt, sync_status: 'synced' });
  await db.questions.put({ ...journalQuestion, sync_status: 'synced' });
  await db.reattempts.put({ ...reattempt, sync_status: 'synced' });
  return pyq;
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
    vi.mocked(loadPyqQuestionByUid).mockReset().mockResolvedValue(null);
  });

  it('restores the original options and math for a legacy PYQ journal row', async () => {
    const pyq = await seedLegacyDuePyq();
    vi.mocked(loadPyqQuestionByUid).mockResolvedValue(pyq);

    const { container } = render(
      <MemoryRouter initialEntries={['/reattempts/legacy-pyq-reattempt']}>
        <Routes>
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('GATE CSE 2005')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll('.pyq-content ol > li')).toHaveLength(4));
    expect(container.querySelectorAll('.katex')).toHaveLength(5);
    expect(container).not.toHaveTextContent('$BC’D’');
    expect(loadPyqQuestionByUid).toHaveBeenCalledWith('go:1354', 'Digital Logic');
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
  });

  it('automatically checks a logged MCQ and advances it after the answer is committed', async () => {
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
    expect(await screen.findByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument();
    expect(screen.queryByText('Actual answer')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal answer' }));

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

  it('reviews answered questions as locked and reopens skipped questions for an answer', async () => {
    await seedDueQuestion();
    const firstQuestion = await db.questions.get('question-due');
    const firstReattempt = await db.reattempts.get('reattempt-due');
    await db.questions.put({
      ...firstQuestion!,
      id: 'question-due-second',
      question_text: 'Which option completes the second re-attempt?',
      sync_status: 'synced'
    });
    await db.reattempts.put({
      ...firstReattempt!,
      id: 'reattempt-due-second',
      question_id: 'question-due-second',
      sync_status: 'synced'
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reattempts/reattempt-due']}>
        <Routes>
          <Route path="/reattempts" element={<Reattempts />} />
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal answer' }));

    expect(
      await screen.findByText('Which option completes the second re-attempt?')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(await screen.findByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText(/Answer locked/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'A' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(
      await screen.findByText('Which option completes the second re-attempt?')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Left blank: skipped' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal answer' }));

    expect(await screen.findByText('Review this re-attempt test')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(await screen.findByRole('button', { name: 'C' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal answer' }));

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.reattempts.get('reattempt-due'))?.history).toHaveLength(1);
      expect((await db.reattempts.get('reattempt-due-second'))?.history).toEqual([
        expect.objectContaining({
          selectedAnswer: 'C',
          markDecision: 'MARK',
          result: 'clean'
        })
      ]);
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

  it('automatically checks and advances a correct PYQ re-attempt', async () => {
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

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
    const stored = await db.reattempts.get('reattempt-pyq');
    expect(stored?.stage).toBe('D10');
    expect(stored?.history[0].result).toBe('clean');
    expect(stored?.history[0]).toMatchObject({
      selectedAnswer: 'B',
      correctAnswer: 'B',
      markDecision: 'MARK'
    });
  });

  it('lets a skipped PYQ re-attempt be answered when revisited', async () => {
    await seedDuePyq();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reattempts/reattempt-pyq']}>
        <Routes>
          <Route path="/reattempts" element={<Reattempts />} />
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Left blank: skipped' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    expect(await screen.findByText('Review this re-attempt test')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    await user.click(await screen.findByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
    await waitFor(async () => {
      const attempts = await db.pyq_attempts
        .where('question_uid')
        .equals('gate-2026-set1-q1')
        .toArray();
      expect(attempts).toHaveLength(2);
      expect(attempts.find((attempt) => attempt.pyq_session_id === null)).toMatchObject({
        selected_answer: 'B',
        mark_decision: 'MARK',
        mark_correct: true
      });
      expect((await db.reattempts.get('reattempt-pyq'))?.history[0]).toMatchObject({
        selectedAnswer: 'B',
        markDecision: 'MARK',
        result: 'clean'
      });
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

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await db.reattempts.get('reattempt-due');
      expect(stored?.history[0]).toMatchObject({
        selectedAnswer: '42.5',
        correctAnswer: '42.5',
        markDecision: 'MARK'
      });
    });
  });

  it('automatically moves an incorrect D30 PYQ back to D10', async () => {
    await seedDuePyq('D30');
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/reattempts/reattempt-pyq']}>
        <Routes>
          <Route path="/reattempts" element={<Reattempts />} />
          <Route path="/reattempts/:reattemptId" element={<Reattempts />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await db.reattempts.get('reattempt-pyq');
      expect(stored?.stage).toBe('D10');
      expect(stored?.history[0]).toMatchObject({
        result: 'fail',
        selectedAnswer: 'A',
        correctAnswer: 'B',
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
