import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
    sourceUrl: 'https://gateoverflow.in/test/1',
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
    sourceUrl: 'https://gateoverflow.in/test/2',
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
    marks: 1,
    type: 'MCQ',
    answer: 'D',
    tolerance: null,
    answerStatus: 'available',
    html: '<p>Which option completes the third question?</p>',
    sourceUrl: 'https://gateoverflow.in/test/3',
    answerSource: null
  }
];

const manifest: PyqManifest = {
  bankVersion: 'navigation-test-bank',
  generatedAt: '2026-08-13T00:00:00.000Z',
  source: 'test',
  sourceUrl: 'https://gateoverflow.in',
  firstYear: 2026,
  lastYear: 2026,
  questionCount: 3,
  imageCount: 0,
  answerStatuses: { available: 3, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
  years: [{ year: 2026, count: 3 }],
  subjects: [
    {
      slug: 'discrete-mathematics',
      label: 'Discrete Mathematics',
      count: 3,
      file: '/pyq/discrete-mathematics.json',
      topics: [{ slug: 'propositional-logic', label: 'Propositional Logic', count: 3 }]
    }
  ]
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: USER,
    sandbox: true,
    user: null,
    profile: null
  })
}));

vi.mock('@/lib/image', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/image')>();
  return {
    ...original,
    captureElementToDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,bmF2aWdhdGlvbg==')
  };
});

describe('PYQ practice navigation', () => {
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

  it('locks answered questions but lets a skipped question be answered after going back', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(
      await screen.findByRole('button', { name: /Start (?:fresh set|practice)/ })
    );
    await user.click(await screen.findByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    await user.click(await screen.findByRole('button', { name: 'Next question' }));

    expect(
      await screen.findByText('Which option completes the second question?')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Left blank/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    await user.click(await screen.findByRole('button', { name: 'Next question' }));

    expect(
      await screen.findByText('Which option completes the third question?')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(await screen.findByText(/Previously skipped/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    expect(screen.getByRole('button', { name: 'Commit & reveal key' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    await waitFor(async () => {
      expect(
        (await db.pyq_attempts.toArray()).find(
          (attempt) =>
            attempt.question_uid === questions[1].id && attempt.mark_decision === 'MARK'
        )
      ).toMatchObject({ selected_answer: 'C', mark_decision: 'MARK' });
    });
    expect(screen.getByText('Correct')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Previous question' }));

    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'B' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Answered/ })).toBeDisabled();

    await waitFor(async () => {
      const attempts = await db.pyq_attempts.orderBy('attempted_at').toArray();
      expect(attempts).toHaveLength(3);
      const secondQuestionAttempts = attempts
        .filter((attempt) => attempt.question_uid === questions[1].id)
        .sort((left, right) => left.attempt_number - right.attempt_number);
      expect(secondQuestionAttempts).toHaveLength(2);
      expect(secondQuestionAttempts[0]).toMatchObject({
        attempt_number: 1,
        selected_answer: null,
        mark_decision: 'SKIP',
        mark_correct: null
      });
      expect(secondQuestionAttempts[1]).toMatchObject({
        attempt_number: 2,
        selected_answer: 'C',
        mark_decision: 'MARK',
        mark_correct: true
      });
      expect(secondQuestionAttempts[0].id).not.toBe(secondQuestionAttempts[1].id);
    });
  });
});
