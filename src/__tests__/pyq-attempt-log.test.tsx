import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import Pyq from '@/pages/Pyq';
import type { PyqManifest, PyqQuestion } from '@/lib/pyq';
import { createPyqSessionRow } from '@/lib/pyq-session';
import { captureElementToDataUrl } from '@/lib/image';

const USER = '00000000-0000-4000-8000-000000000001';

const question: PyqQuestion = {
  id: 'gate-it-2007-q1',
  bookSlug: 'gate-it',
  year: 2007,
  set: null,
  number: '1',
  paperLabel: 'GATE IT 2007',
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
  sourceUrl: 'https://gateoverflow.in/test',
  answerSource: null
};

const manifest: PyqManifest = {
  bankVersion: 'test-bank-v2',
  generatedAt: '2026-08-08T00:00:00.000Z',
  source: 'test',
  sourceUrl: 'https://gateoverflow.in',
  defaultBookSlug: 'gate-it',
  firstYear: 2007,
  lastYear: 2007,
  questionCount: 1,
  imageCount: 0,
  answerStatuses: { available: 1, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
  years: [{ year: 2007, count: 1 }],
  subjects: [
    {
      slug: 'discrete-mathematics',
      label: 'Discrete Mathematics',
      count: 1,
      file: '/pyq/discrete-mathematics.json',
      topics: [{ slug: 'propositional-logic', label: 'Propositional Logic', count: 1 }]
    }
  ],
  books: [
    {
      slug: 'gate-it',
      label: 'GATE IT Archive',
      shortLabel: 'GATE IT',
      description: 'Test archive',
      difficultyFloor: 'gate',
      sourceClass: 'official-exam',
      source: 'test',
      sourceUrl: 'https://gateoverflow.in',
      count: 1,
      firstYear: 2007,
      lastYear: 2007,
      answerStatuses: { available: 1, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
      years: [{ year: 2007, count: 1 }],
      subjects: [
        {
          slug: 'discrete-mathematics',
          label: 'Discrete Mathematics',
          count: 1,
          file: '/pyq/discrete-mathematics.json',
          topics: [{ slug: 'propositional-logic', label: 'Propositional Logic', count: 1 }]
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
    profile: null
  })
}));

vi.mock('@/lib/image', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/image')>();
  return {
    ...original,
    captureElementToDataUrl: vi
      .fn()
      .mockResolvedValue('data:image/png;base64,cXVlc3Rpb24tc25hcHNob3Q=')
  };
});

describe('PYQ committed-attempt logging', () => {
  beforeEach(async () => {
    vi.mocked(captureElementToDataUrl).mockClear();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'https://air-journal.test');
      if (url.pathname === '/pyq/manifest.json') return Response.json(manifest);
      if (url.pathname === '/pyq/discrete-mathematics.json') {
        return Response.json({
          bankVersion: manifest.bankVersion,
          subject: question.subject,
          questions: [question]
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

  it('stores the actual learner response, official key, snapshot, and timer atomically', async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice' }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    const [startedPyqSession] = await db.pyq_sessions.toArray();
    expect(await db.sessions.get(startedPyqSession.id)).toMatchObject({
      id: startedPyqSession.id,
      kind: 'pyq',
      subject: question.subject,
      actual_duration_min: null
    });
    await user.click(screen.getByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));

    expect(captureElementToDataUrl).toHaveBeenCalledWith(expect.any(HTMLElement), {
      theme: 'light'
    });

    const receipt = await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    expect(within(receipt).getByText('Not correct')).toBeInTheDocument();
    expect(within(receipt).getByText('Your answer')).toBeInTheDocument();
    expect(within(receipt).getByText('A')).toBeInTheDocument();
    expect(within(receipt).getByText('Correct answer')).toBeInTheDocument();
    expect(within(receipt).getByText('B')).toBeInTheDocument();

    await waitFor(async () => {
      const attempts = await db.pyq_attempts.toArray();
      expect(attempts).toHaveLength(1);
      const [attempt] = attempts;
      expect(attempt.selected_answer).toBe('A');
      expect(attempt.correct_answer).toBe('B');
      expect(attempt.mark_correct).toBe(false);
      expect(attempt.capture_version).toBe(2);
      expect(attempt.screenshot_url).toBe('data:image/png;base64,cXVlc3Rpb24tc25hcHNob3Q=');
      expect(attempt.time_spent_ms).toBeGreaterThan(0);
      expect(attempt.time_spent_sec).toBe(Math.max(1, Math.ceil(attempt.time_spent_ms! / 1000)));
      expect(attempt.question_started_at).not.toBeNull();
      expect(attempt.question_snapshot).toMatchObject({
        question_uid: question.id,
        book_slug: 'gate-it',
        subject: question.subject,
        type: 'MCQ',
        html: question.html
      });

      const session = await db.pyq_sessions.get(attempt.pyq_session_id!);
      expect(session?.completed_question_uids).toEqual([question.id]);
      expect(session?.config.bookSlug).toBe('gate-it');
      expect(session?.current_index).toBe(1);
      expect(session?.elapsed_sec).toBe(attempt.time_spent_sec);
    });

    // A reload after the final commit but before pressing Finish must not hide
    // an active, exhausted set or leave it blocking all future sessions.
    firstRender.unmount();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Resume set' }));
    expect(await screen.findByText('Practice set complete')).toBeInTheDocument();
    await waitFor(async () => {
      const [session] = await db.pyq_sessions.toArray();
      expect(session.status).toBe('completed');
      expect(session.completed_at).not.toBeNull();
      expect(await db.sessions.get(session.id)).toMatchObject({
        kind: 'pyq',
        actual_duration_min: 1
      });
    });
  });

  it('groups auto-journaled PYQ evidence under its canonical session', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice' }));
    await user.click(await screen.findByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));

    await waitFor(async () => {
      const [attempt] = await db.pyq_attempts.toArray();
      const [journalRow] = await db.questions.toArray();
      expect(attempt.mark_correct).toBe(true);
      expect(journalRow.session_id).toBe(attempt.pyq_session_id);
      expect(journalRow.image_url).toBe(attempt.screenshot_url);
      expect(await db.sessions.get(attempt.pyq_session_id!)).toMatchObject({ kind: 'pyq' });
    });
  });

  it('resumes a compatible saved set after the question bank version changes', async () => {
    const saved = createPyqSessionRow(
      USER,
      'older-test-bank',
      {
        subjectSlug: 'discrete-mathematics',
        topicSlug: 'all',
        fromYear: 2007,
        toYear: 2007,
        type: 'all',
        order: 'unseen',
        count: '5'
      },
      [question]
    );
    await db.pyq_sessions.put({ ...saved, sync_status: 'synced' });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Resume set' }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.pyq_sessions.get(saved.id))?.bank_version).toBe(manifest.bankVersion);
    });
  });

  it('discards an unfinished saved set and immediately unblocks a new one', async () => {
    const saved = createPyqSessionRow(
      USER,
      'older-test-bank',
      {
        subjectSlug: 'discrete-mathematics',
        topicSlug: 'all',
        fromYear: 2007,
        toYear: 2007,
        type: 'all',
        order: 'unseen',
        count: '5'
      },
      [question]
    );
    await db.pyq_sessions.put({ ...saved, sync_status: 'synced' });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Discard set' }));
    await waitFor(async () => {
      expect((await db.pyq_sessions.get(saved.id))?.status).toBe('abandoned');
    });
    expect(screen.queryByRole('button', { name: 'Resume set' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeEnabled();
  });
});
