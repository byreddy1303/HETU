import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import type { PyqManifest, PyqQuestion } from '@/lib/pyq';
import { createPyqSessionRow } from '@/lib/pyq-session';
import { writeLocal } from '@/lib/sync';
import Pyq from '@/pages/Pyq';

const USER = '00000000-0000-4000-8000-000000000001';

const question: PyqQuestion = {
  id: 'mode-pause-q1',
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
  sourceUrl: 'https://gateoverflow.in/mode-pause/1',
  answerSource: null
};

const manifest: PyqManifest = {
  bankVersion: 'mode-pause-test-bank',
  generatedAt: '2026-08-24T00:00:00.000Z',
  source: 'test',
  sourceUrl: 'https://gateoverflow.in',
  firstYear: 2026,
  lastYear: 2026,
  questionCount: 1,
  imageCount: 0,
  answerStatuses: { available: 1, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
  years: [{ year: 2026, count: 1 }],
  subjects: [
    {
      slug: 'discrete-mathematics',
      label: 'Discrete Mathematics',
      count: 1,
      file: '/pyq/discrete-mathematics.json',
      topics: [
        {
          slug: 'propositional-logic',
          label: 'Propositional Logic',
          count: 1
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

vi.mock('@/lib/sync', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/sync')>();
  return {
    ...original,
    writeLocal: vi.fn(original.writeLocal)
  };
});

describe('PYQ mode selection and pause controls', () => {
  beforeEach(async () => {
    vi.mocked(writeLocal).mockClear();
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

  it('asks for the session mode before the set filters and states how each mode behaves', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    const modeHeading = await screen.findByRole('heading', {
      name: 'Choose how you want to work'
    });
    const modeChooser = modeHeading.closest('section');
    if (!modeChooser) throw new Error('Mode heading must be contained by the mode-choice section.');
    const practiceMode = within(modeChooser).getByRole('button', {
      name: /^Practice mode/i
    });
    const examMode = within(modeChooser).getByRole('button', { name: /^Exam mode/i });

    expect(practiceMode).toHaveAttribute('aria-pressed', 'true');
    expect(modeChooser).toHaveTextContent(/answer key|immediate feedback/i);
    expect(modeChooser).toHaveTextContent(/no overall (?:timer|time limit)|work at your own pace/i);
    expect(modeChooser).toHaveTextContent(/timed/i);
    expect(modeChooser).toHaveTextContent(
      /after (?:final )?(?:submit|submission)|until (?:final )?submission/i
    );

    const filterHeading = screen.getByText('Choose a subject');
    expect(modeChooser.compareDocumentPosition(filterHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByRole('button', { name: 'Start practice set' })).toBeEnabled();

    await user.click(examMode);
    expect(examMode).toHaveAttribute('aria-pressed', 'true');
    expect(practiceMode).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Start timed exam' })).toBeEnabled();
  });

  it('pauses practice immediately, persists the set, and offers an explicit resume action', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();

    const [startedSession] = await db.pyq_sessions.toArray();
    expect(startedSession).toMatchObject({ status: 'active', config: { mode: 'practice' } });

    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' }));
    await user.click(screen.getByRole('button', { name: 'Pause practice' }));

    await waitFor(async () => {
      expect(await db.pyq_sessions.get(startedSession.id)).toMatchObject({
        status: 'paused',
        config: {
          practiceDraft: {
            question_uid: question.id,
            selected_answer: 'B',
            mark_decision: 'FIFTY_FIFTY'
          }
        }
      });
    });
    expect(await screen.findByText('Paused sessions')).toBeInTheDocument();

    const resume = screen.getByRole('button', { name: 'Resume practice' });
    await user.click(resume);
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await waitFor(async () => {
      expect(await db.pyq_sessions.get(startedSession.id)).toMatchObject({ status: 'active' });
    });
  });

  it('shows persisted active time as soon as a paused Practice draft is resumed', async () => {
    const startedAt = '2026-08-24T04:30:00.000Z';
    const session = createPyqSessionRow(
      USER,
      manifest.bankVersion,
      {
        subjectSlug: 'discrete-mathematics',
        topicSlug: 'all',
        fromYear: 2026,
        toYear: 2026,
        type: 'all',
        order: 'unseen',
        count: '5',
        history: 'all',
        mode: 'practice',
        practiceDraft: {
          question_uid: question.id,
          selected_answer: 'B',
          mark_decision: 'MARK',
          elapsed_ms: 65_000,
          first_started_at: startedAt
        }
      },
      [question],
      startedAt
    );
    await db.pyq_sessions.put({
      ...session,
      status: 'paused',
      current_question_uid: null,
      current_question_started_at: null,
      sync_status: 'synced'
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Resume practice' }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('01:05');
    expect(screen.getByRole('timer')).toHaveAccessibleName(
      '01:05 active time on this question'
    );
  });

  it('keeps Practice open and announces a pause write failure', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    const [startedSession] = await db.pyq_sessions.toArray();

    vi.mocked(writeLocal).mockRejectedValueOnce(new Error('Local storage is unavailable.'));
    await user.click(screen.getByRole('button', { name: 'Pause practice' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Local storage is unavailable.');
    expect(screen.getByText('Which proposition is a tautology?')).toBeInTheDocument();
    expect(await db.pyq_sessions.get(startedSession.id)).toMatchObject({ status: 'active' });
    expect(screen.queryByText('Paused sessions')).not.toBeInTheDocument();
  });
});
