import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import Pyq from '@/pages/Pyq';
import { normalizePyqManifest, type PyqManifest, type PyqQuestion } from '@/lib/pyq';
import { createPyqSessionRow } from '@/lib/pyq-session';
import { captureElementToDataUrl } from '@/lib/image';

const USER = '00000000-0000-4000-8000-000000000001';
const SAFE_PYQ_IMAGE = '/pyq/images/test/question-q01.png';

const question: PyqQuestion = {
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
  html: `<p>Which proposition is a tautology?</p><figure><img src="${SAFE_PYQ_IMAGE}" alt="Answer-free source question"></figure>`,
  sourceUrl: 'https://gateoverflow.in/test',
  answerSource: null
};

const manifest: PyqManifest = normalizePyqManifest({
  bankVersion: 'test-bank-v2',
  generatedAt: '2026-08-08T00:00:00.000Z',
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
      topics: [{ slug: 'propositional-logic', label: 'Propositional Logic', count: 1 }]
    }
  ]
});

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

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
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

    await waitFor(() =>
      expect(captureElementToDataUrl).toHaveBeenCalledWith(expect.any(HTMLElement), {
        theme: 'light'
      })
    );

    const receipt = await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    expect(within(receipt).getByText('Not correct')).toBeInTheDocument();
    expect(within(receipt).getByText('Your answer')).toBeInTheDocument();
    expect(within(receipt).getByText('A')).toBeInTheDocument();
    expect(within(receipt).getByText('Correct answer')).toBeInTheDocument();
    expect(within(receipt).getByText('B')).toBeInTheDocument();
    expect(within(receipt).getByText('GATE -⅓')).toBeInTheDocument();
    expect(
      within(receipt).getByText('Exact GATE-rule score using the stored question type and marks.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue analysis' }));
    expect(await screen.findByRole('button', { name: 'Pause practice' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Back to answer' }));

    await waitFor(async () => {
      const attempts = await db.pyq_attempts.toArray();
      expect(attempts).toHaveLength(1);
      const [attempt] = attempts;
      expect(attempt.selected_answer).toBe('A');
      expect(attempt.correct_answer).toBe('B');
      expect(attempt.mark_correct).toBe(false);
      expect(attempt.capture_version).toBe(3);
      expect(attempt).toMatchObject({
        question_type: 'MCQ',
        question_marks: 1,
        score_thirds: -1,
        scoring_status: 'scored',
        scoring_version: 1
      });
      expect(attempt.screenshot_url).toBe('data:image/png;base64,cXVlc3Rpb24tc25hcHNob3Q=');
      expect(attempt.time_spent_ms).toBeGreaterThan(0);
      expect(attempt.time_spent_sec).toBe(Math.max(1, Math.ceil(attempt.time_spent_ms! / 1000)));
      expect(attempt.question_started_at).not.toBeNull();
      expect(attempt.question_snapshot).toMatchObject({
        question_uid: question.id,
        subject: question.subject,
        type: 'MCQ',
        html: question.html
      });

      const session = await db.pyq_sessions.get(attempt.pyq_session_id!);
      expect(session?.completed_question_uids).toEqual([question.id]);
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
    await user.click(await screen.findByRole('button', { name: 'Resume practice' }));
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
    expect(screen.getByRole('button', { name: /^View detailed report/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Practice these questions again/i })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /^Start a new set with the same filters/i })
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Choose a different set/i })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /Repeat this exact set/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Repeat these filters/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change filters/i })).not.toBeInTheDocument();
  });

  it('groups auto-journaled PYQ evidence under its canonical session', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    await user.click(await screen.findByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));

    await waitFor(async () => {
      const [attempt] = await db.pyq_attempts.toArray();
      const [journalRow] = await db.questions.toArray();
      expect(attempt.mark_correct).toBe(true);
      expect(journalRow.session_id).toBe(attempt.pyq_session_id);
      expect(journalRow.source_pyq_attempt_id).toBe(attempt.id);
      expect(journalRow.image_url).toBe(SAFE_PYQ_IMAGE);
      expect(journalRow.image_url).not.toBe(attempt.screenshot_url);
      expect(await db.sessions.get(attempt.pyq_session_id!)).toMatchObject({ kind: 'pyq' });
    });
  });

  it('starts a clean session when practicing the completed questions again', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    const [firstSession] = await db.pyq_sessions.toArray();
    await user.click(await screen.findByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    expect(await screen.findByRole('region', { name: 'PYQ attempt receipt' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finish set' }));

    expect(await screen.findByText('Practice set complete')).toBeInTheDocument();
    expect(
      await db.pyq_attempts.where('pyq_session_id').equals(firstSession.id).count()
    ).toBe(1);
    await user.click(screen.getByRole('button', { name: /^Practice these questions again/i }));

    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'PYQ attempt receipt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Answered/ })).toBeEnabled();

    const repeatedSession = (await db.pyq_sessions.toArray()).find(
      (session) => session.id !== firstSession.id
    );
    expect(repeatedSession).toMatchObject({
      status: 'active',
      current_index: 0,
      completed_count: 0,
      completed_question_uids: []
    });

    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    expect(await screen.findByRole('region', { name: 'PYQ attempt receipt' })).toBeInTheDocument();

    await waitFor(async () => {
      const attempts = await db.pyq_attempts.orderBy('attempted_at').toArray();
      expect(attempts).toHaveLength(2);
      expect(attempts.map((attempt) => attempt.pyq_session_id)).toEqual(
        expect.arrayContaining([firstSession.id, repeatedSession!.id])
      );
      expect(
        attempts.find((attempt) => attempt.pyq_session_id === repeatedSession!.id)
      ).toMatchObject({ selected_answer: 'B', attempt_number: 1 });
    });
  });

  it('keeps the workspace open and reports an error when its session disappears before Finish', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    const [startedSession] = await db.pyq_sessions.toArray();
    await user.click(await screen.findByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    expect(await screen.findByRole('region', { name: 'PYQ attempt receipt' })).toBeInTheDocument();

    await db.pyq_sessions.delete(startedSession.id);
    await user.click(screen.getByRole('button', { name: 'Finish set' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not continue this practice set: The active Practice session could not be found.'
    );
    expect(screen.queryByText('Practice set complete')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'PYQ attempt receipt' })).toBeInTheDocument();
  });

  it('lets Commit win a rapid Commit-then-Pause race without pausing or duplicating the receipt', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    await user.click(await screen.findByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));

    const [startedSession] = await db.pyq_sessions.toArray();
    const originalGet = db.pyq_sessions.get.bind(db.pyq_sessions);
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const delayedGet = (async (key: string) => {
      await readGate;
      return originalGet(key);
    }) as unknown as typeof db.pyq_sessions.get;
    const getSpy = vi.spyOn(db.pyq_sessions, 'get').mockImplementationOnce(delayedGet);

    const commit = screen.getByRole('button', { name: 'Commit & reveal key' });
    const pause = screen.getByRole('button', { name: 'Pause practice' });
    act(() => {
      fireEvent.click(commit);
      fireEvent.click(pause);
    });

    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));
    releaseRead();

    await waitFor(async () => {
      const attempts = await db.pyq_attempts
        .where('pyq_session_id')
        .equals(startedSession.id)
        .toArray();
      expect(attempts).toHaveLength(1);
      expect(await db.pyq_sessions.get(startedSession.id)).toMatchObject({
        status: 'active',
        completed_count: 1
      });
    });
    expect(await screen.findByRole('region', { name: 'PYQ attempt receipt' })).toBeInTheDocument();
    expect(screen.queryByText('Paused sessions')).not.toBeInTheDocument();
    expect(
      await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()
    ).toBe(1);
    getSpy.mockRestore();
  });

  it('lets Pause win a rapid Pause-then-Commit race without creating a receipt', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    await user.click(await screen.findByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));

    const [startedSession] = await db.pyq_sessions.toArray();
    const originalGet = db.pyq_sessions.get.bind(db.pyq_sessions);
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const delayedGet = (async (key: string) => {
      await readGate;
      return originalGet(key);
    }) as unknown as typeof db.pyq_sessions.get;
    const getSpy = vi.spyOn(db.pyq_sessions, 'get').mockImplementationOnce(delayedGet);

    const pause = screen.getByRole('button', { name: 'Pause practice' });
    const commit = screen.getByRole('button', { name: 'Commit & reveal key' });
    act(() => {
      fireEvent.click(pause);
      fireEvent.click(commit);
    });

    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));
    releaseRead();

    await waitFor(async () => {
      expect(await db.pyq_sessions.get(startedSession.id)).toMatchObject({ status: 'paused' });
    });
    expect(await screen.findByText('Paused sessions')).toBeInTheDocument();
    expect(
      await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()
    ).toBe(0);
    expect(screen.queryByRole('region', { name: 'PYQ attempt receipt' })).not.toBeInTheDocument();
    getSpy.mockRestore();
  });

  it('lets Finish win a rapid Finish-then-Pause race without leaving a completed receipt in a paused session', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    await user.click(await screen.findByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    expect(await screen.findByRole('region', { name: 'PYQ attempt receipt' })).toBeInTheDocument();

    const [startedSession] = await db.pyq_sessions.toArray();
    const originalGet = db.pyq_sessions.get.bind(db.pyq_sessions);
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const delayedGet = (async (key: string) => {
      await readGate;
      return originalGet(key);
    }) as unknown as typeof db.pyq_sessions.get;
    const getSpy = vi.spyOn(db.pyq_sessions, 'get').mockImplementationOnce(delayedGet);

    const finish = screen.getByRole('button', { name: 'Finish set' });
    const pause = screen.getByRole('button', { name: 'Pause practice' });
    act(() => {
      fireEvent.click(finish);
      fireEvent.click(pause);
    });

    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));
    releaseRead();

    expect(await screen.findByText('Practice set complete')).toBeInTheDocument();
    expect(await db.pyq_sessions.get(startedSession.id)).toMatchObject({
      status: 'completed',
      completed_count: 1
    });
    expect(
      await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()
    ).toBe(1);
    expect(screen.queryByText('Paused sessions')).not.toBeInTheDocument();
    getSpy.mockRestore();
  });

  it('lets Pause win a rapid Pause-then-Finish race without completing the paused session', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    await user.click(await screen.findByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: /^Answered/ }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    expect(await screen.findByRole('region', { name: 'PYQ attempt receipt' })).toBeInTheDocument();

    const [startedSession] = await db.pyq_sessions.toArray();
    const originalGet = db.pyq_sessions.get.bind(db.pyq_sessions);
    let releaseRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const delayedGet = (async (key: string) => {
      await readGate;
      return originalGet(key);
    }) as unknown as typeof db.pyq_sessions.get;
    const getSpy = vi.spyOn(db.pyq_sessions, 'get').mockImplementationOnce(delayedGet);

    const pause = screen.getByRole('button', { name: 'Pause practice' });
    const finish = screen.getByRole('button', { name: 'Finish set' });
    act(() => {
      fireEvent.click(pause);
      fireEvent.click(finish);
    });

    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));
    releaseRead();

    expect(await screen.findByText('Paused sessions')).toBeInTheDocument();
    expect(await db.pyq_sessions.get(startedSession.id)).toMatchObject({
      status: 'paused',
      completed_count: 1
    });
    expect(
      await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()
    ).toBe(1);
    expect(screen.queryByText('Practice set complete')).not.toBeInTheDocument();
    getSpy.mockRestore();
  });

  it('resumes a compatible saved set after the question bank version changes', async () => {
    const saved = createPyqSessionRow(
      USER,
      'older-test-bank',
      {
        subjectSlug: 'discrete-mathematics',
        topicSlug: 'all',
        fromYear: 2026,
        toYear: 2026,
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

    await user.click(await screen.findByRole('button', { name: 'Resume practice' }));
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
        fromYear: 2026,
        toYear: 2026,
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

    await user.click(await screen.findByRole('button', { name: 'Discard session' }));
    await waitFor(async () => {
      expect((await db.pyq_sessions.get(saved.id))?.status).toBe('abandoned');
    });
    expect(screen.queryByRole('button', { name: 'Resume practice' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start practice set' })).toBeEnabled();
  });
});
