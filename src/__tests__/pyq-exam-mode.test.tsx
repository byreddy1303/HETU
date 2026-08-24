import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { db } from '@/lib/db';
import type { PyqManifest, PyqQuestion } from '@/lib/pyq';
import Pyq from '@/pages/Pyq';

const USER = '00000000-0000-4000-8000-000000000001';

const questions: PyqQuestion[] = [
  {
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
    html: '<p>Which proposition is a tautology?</p>',
    sourceUrl: 'https://gateoverflow.in/exam/1',
    answerSource: null
  },
  {
    id: 'gate-2026-set1-q2',
    year: 2026,
    set: 1,
    number: '2',
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Discrete Mathematics',
    subjectSlug: 'discrete-mathematics',
    topic: 'Propositional Logic',
    topicSlug: 'propositional-logic',
    subtopics: ['Logic'],
    marks: 1,
    type: 'MCQ',
    answer: 'C',
    tolerance: null,
    answerStatus: 'available',
    html: '<p>Which option completes the second question?</p>',
    sourceUrl: 'https://gateoverflow.in/exam/2',
    answerSource: null
  },
  {
    id: 'gate-2026-set1-q3',
    year: 2026,
    set: 1,
    number: '3',
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Discrete Mathematics',
    subjectSlug: 'discrete-mathematics',
    topic: 'Propositional Logic',
    topicSlug: 'propositional-logic',
    subtopics: ['Logic'],
    marks: 2,
    type: 'MCQ',
    answer: 'D',
    tolerance: null,
    answerStatus: 'available',
    html: '<p>Which option completes the third question?</p>',
    sourceUrl: 'https://gateoverflow.in/exam/3',
    answerSource: null
  }
];

const manifest: PyqManifest = {
  bankVersion: 'exam-mode-test-bank',
  generatedAt: '2026-08-24T00:00:00.000Z',
  source: 'test',
  sourceUrl: 'https://gateoverflow.in',
  firstYear: 2026,
  lastYear: 2026,
  questionCount: questions.length,
  imageCount: 0,
  answerStatuses: { available: questions.length, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
  years: [{ year: 2026, count: questions.length }],
  subjects: [
    {
      slug: 'discrete-mathematics',
      label: 'Discrete Mathematics',
      count: questions.length,
      file: '/pyq/discrete-mathematics.json',
      topics: [
        {
          slug: 'propositional-logic',
          label: 'Propositional Logic',
          count: questions.length
        }
      ]
    }
  ]
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: USER,
    sandbox: true,
    user: null,
    profile: { timezone: 'Asia/Kolkata' }
  })
}));

function HistoricalReviewDestination() {
  const { id } = useParams();
  return <h1>Historical PYQ review {id}</h1>;
}

describe('PYQ timed exam mode', () => {
  beforeEach(async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'https://air-journal.test');
      if (url.pathname === '/pyq/manifest.json') return Response.json(manifest);
      if (url.pathname === '/pyq/discrete-mathematics.json') {
        return Response.json({
          bankVersion: manifest.bankVersion,
          subject: questions[0].subject,
          questions
        });
      }
      return new Response(null, { status: 404 });
    });
    await Promise.all([
      db.pyq_attempts.clear(),
      db.pyq_sessions.clear(),
      db.questions.clear(),
      db.sessions.clear()
    ]);
  });

  it('keeps answers private until a confirmed final submit, then stores a complete historical session', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/pyq']}>
        <Routes>
          <Route path="/pyq" element={<Pyq />} />
          <Route path="/session/:id/review" element={<HistoricalReviewDestination />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /Exam mode/ }));
    await user.click(screen.getByRole('button', { name: 'Start timed exam' }));

    expect(
      await screen.findByRole('region', { name: 'Timed PYQ exam workspace' })
    ).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('09:00');
    expect(screen.queryByRole('button', { name: 'Commit & reveal key' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Answer key|Correct answer/i)).not.toBeInTheDocument();

    const [startedSession] = await db.pyq_sessions.toArray();
    expect(startedSession).toMatchObject({
      status: 'active',
      config: { mode: 'exam' }
    });

    await user.click(screen.getByRole('radio', { name: 'Option B' }));
    await user.click(screen.getByRole('button', { name: 'Save & next' }));
    expect(
      await screen.findByText('Which option completes the second question?')
    ).toBeInTheDocument();

    let ledger = screen.getByRole('complementary', {
      name: 'Question status and submission'
    });
    expect(
      within(ledger).getByRole('button', { name: 'Question 1: Answered' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark for review & next' }));
    expect(
      await screen.findByText('Which option completes the third question?')
    ).toBeInTheDocument();
    ledger = screen.getByRole('complementary', { name: 'Question status and submission' });
    expect(
      within(ledger).getByRole('button', { name: 'Question 2: Marked for review' })
    ).toBeInTheDocument();

    const optionD = screen.getByRole('radio', { name: 'Option D' });
    await user.click(optionD);
    expect(optionD).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Clear response' }));
    expect(optionD).not.toBeChecked();
    expect(
      within(ledger).getByRole('button', {
        name: 'Question 3: Not answered, current question'
      })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Option A' }));
    await user.click(screen.getByRole('button', { name: 'Save & next' }));

    let confirmation = await screen.findByRole('dialog', { name: 'Submit timed exam?' });
    expect(within(confirmation).getByText('Answered')).toBeInTheDocument();
    expect(within(confirmation).getByText('Not answered')).toBeInTheDocument();
    expect(within(confirmation).getByText('Marked for review')).toBeInTheDocument();
    await user.click(within(confirmation).getByRole('button', { name: 'Return to exam' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Submit timed exam?' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('timer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save & next' }));
    confirmation = await screen.findByRole('dialog', { name: 'Submit timed exam?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Submit exam' }));

    expect(
      await screen.findByRole('heading', {
        name: `Historical PYQ review ${startedSession.id}`
      })
    ).toBeInTheDocument();

    await waitFor(async () => {
      const attempts = await db.pyq_attempts
        .where('pyq_session_id')
        .equals(startedSession.id)
        .toArray();
      expect(attempts).toHaveLength(questions.length);
      expect(new Set(attempts.map((attempt) => attempt.question_uid))).toEqual(
        new Set(questions.map((question) => question.id))
      );
      expect(attempts.map((attempt) => attempt.attempt_number)).toEqual([1, 1, 1]);
      const attemptsByQuestion = new Map(
        attempts.map((attempt) => [attempt.question_uid, attempt])
      );
      expect(
        questions.map((question) => attemptsByQuestion.get(question.id)?.selected_answer)
      ).toEqual(['B', null, 'A']);
      expect(
        questions.map((question) => attemptsByQuestion.get(question.id)?.mark_decision)
      ).toEqual(['MARK', 'SKIP', 'MARK']);

      expect(await db.pyq_sessions.get(startedSession.id)).toMatchObject({
        status: 'completed',
        completed_count: questions.length,
        completed_question_uids: questions.map((question) => question.id),
        config: {
          mode: 'exam',
          examState: {
            submission_reason: 'manual',
            deadline_at: null
          }
        }
      });
      expect(await db.sessions.get(startedSession.id)).toMatchObject({
        id: startedSession.id,
        kind: 'pyq',
        subject: 'Discrete Mathematics',
        target_duration_min: 9,
        actual_duration_min: 1
      });
    });
  });
});
