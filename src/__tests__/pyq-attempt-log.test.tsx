import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import Pyq from '@/pages/Pyq';
import { loadPyqManifest, normalizePyqManifest, type PyqManifest, type PyqQuestion } from '@/lib/pyq';
import { createPyqSessionRow } from '@/lib/pyq-session';
import { captureElementToDataUrl } from '@/lib/image';
import { usePyqPreferencesStore } from '@/stores/pyq-preferences';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@supabase/supabase-js';
import { emptyDayPlan, loadDayPlan, saveDayPlan } from '@/lib/planner-storage';
import {
  attachPlannerPyqSession,
  createPlannerPyqRepairBlocks,
  plannerBlockHref
} from '@/lib/planner-execution';

const USER = '00000000-0000-4000-8000-000000000001';
const SAFE_PYQ_IMAGE = '/pyq/images/test/question-q01.png';

vi.mock('@/lib/pyq', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pyq')>();
  return { ...original, loadPyqManifest: vi.fn(original.loadPyqManifest) };
});

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
    vi.mocked(loadPyqManifest).mockResolvedValue(manifest);
    localStorage.clear();
    useAuthStore.setState({
      user: { id: USER } as User,
      status: 'signed_in',
      sandbox: false
    });
    usePyqPreferencesStore.getState().reset();
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
      db.learning_events.clear(),
      db.recovery_sessions.clear(),
      db.learning_items.clear(),
      db.reattempts.clear(),
      db.sessions.clear()
    ]);
  });

  it('honors and attaches the exact typed Planner prescription after durable PYQ creation', async () => {
    const [block] = createPlannerPyqRepairBlocks({
      date: '2026-09-02',
      questionUids: [question.id],
      durationMin: 18,
      subjectLabel: question.subject,
      subjectId: 'discrete-mathematics'
    });
    const plan = emptyDayPlan('2026-09-02');
    plan.sessions = [block];
    saveDayPlan(plan);
    usePyqPreferencesStore.getState().remember(
      {
        subjectSlug: 'all',
        topicSlug: 'all',
        fromYear: 1990,
        toYear: 2026,
        type: 'all',
        order: 'random',
        count: '25',
        history: 'all',
        mode: 'exam'
      },
      'diagnose',
      'stale-device-seed'
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[plannerBlockHref(plan.date, block)]}>
        <Pyq />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Why these 1 exact UIDs/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start practice set' }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();

    const [session] = await db.pyq_sessions.toArray();
    expect(session.question_uids).toEqual([question.id]);
    expect(session.config).toMatchObject({
      recommendationPreset: 'repair',
      selectionSeed: block.launch!.prescription.selectionSeed,
      plannerPrescriptionId: block.launch!.prescription.id,
      plannerTimeBudgetMin: 18,
      mode: 'practice',
      count: 'all'
    });
    expect(await db.sessions.get(session.id)).toMatchObject({
      planner_date: plan.date,
      planner_block_id: block.id,
      target_duration_min: 18
    });
    expect(loadDayPlan(plan.date)?.sessions[0]).toMatchObject({
      launch: {
        pyqSessionId: session.id,
        resolvedQuestionUids: [question.id],
        resolvedAt: session.started_at
      },
      execution: {
        sessionId: session.id,
        startedAt: session.started_at,
        completedAt: null,
        manual: false
      }
    });
  });

  it('resolves every bank file in a multi-subject canonical Planner prescription', async () => {
    const cQuestion: PyqQuestion = {
      ...question,
      id: 'gate-2026-c-q1',
      number: '2',
      subject: 'C Programming',
      subjectSlug: 'c-programming',
      topic: 'Pointers',
      topicSlug: 'pointers',
      html: '<p>Which pointer expression is valid?</p>'
    };
    const dsQuestion: PyqQuestion = {
      ...question,
      id: 'gate-2026-ds-q1',
      number: '3',
      subject: 'Data Structure',
      subjectSlug: 'data-structure',
      topic: 'Trees',
      topicSlug: 'trees',
      html: '<p>Which traversal visits the root first?</p>'
    };
    const multiManifest = normalizePyqManifest({
      bankVersion: 'multi-subject-bank-v1',
      generatedAt: '2026-09-02T00:00:00.000Z',
      source: 'test',
      sourceUrl: 'https://gateoverflow.in',
      firstYear: 2026,
      lastYear: 2026,
      questionCount: 2,
      imageCount: 0,
      answerStatuses: { available: 2, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
      years: [{ year: 2026, count: 2 }],
      subjects: [
        {
          slug: 'c-programming',
          label: 'C Programming',
          count: 1,
          file: '/pyq/c-programming.json',
          topics: [{ slug: 'pointers', label: 'Pointers', count: 1 }]
        },
        {
          slug: 'data-structure',
          label: 'Data Structure',
          count: 1,
          file: '/pyq/data-structure.json',
          topics: [{ slug: 'trees', label: 'Trees', count: 1 }]
        }
      ]
    });
    vi.mocked(loadPyqManifest).mockResolvedValue(multiManifest);
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const pathname = new URL(String(input), 'https://hetu.test').pathname;
      if (pathname === '/pyq/manifest.json') return Response.json(multiManifest);
      if (pathname === '/pyq/c-programming.json') {
        return Response.json({
          bankVersion: multiManifest.bankVersion,
          subject: cQuestion.subject,
          questions: [cQuestion]
        });
      }
      if (pathname === '/pyq/data-structure.json') {
        return Response.json({
          bankVersion: multiManifest.bankVersion,
          subject: dsQuestion.subject,
          questions: [dsQuestion]
        });
      }
      return new Response(null, { status: 404 });
    });
    const href = plannerBlockHref('2026-09-02', {
      id: 'programming-planner-block',
      subject: 'Programming & DS',
      subjectId: 'programming-data-structures',
      durationMin: 30,
      mode: 'PYQ Practice',
      priority: 'P1 Critical',
      target: 'Practice Programming & DS'
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[href]}>
        <Pyq />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Start practice set' }));
    expect(
      await screen.findByText(/Which (pointer expression is valid|traversal visits the root first)\?/)
    ).toBeInTheDocument();
    await waitFor(async () => expect(await db.pyq_sessions.count()).toBe(1));

    const [session] = await db.pyq_sessions.toArray();
    expect(session.config.subjectSlug).toBe('all');
    expect(session.config.subjectSlugs?.slice().sort()).toEqual([
      'c-programming',
      'data-structure'
    ]);
    expect(session.question_uids.slice().sort()).toEqual([
      cQuestion.id,
      dsQuestion.id
    ]);
  });

  it('starts the exact recommended UID set and freezes its reproducibility receipt', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /^Learn/i }));
    expect(await screen.findByText(/Why these 1 exact UIDs/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start practice set' }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();

    const [started] = await db.pyq_sessions.toArray();
    expect(started.question_uids).toEqual([question.id]);
    expect(started.config).toMatchObject({
      recommendationPreset: 'learn',
      history: 'unseen',
      count: '10'
    });
    expect(started.config.selectionSeed).toMatch(/^pyq-/);
    expect(started.config.recommendationReasons).toEqual(
      expect.arrayContaining(['Learn preset', 'Unseen'])
    );
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

      const learningItems = await db.learning_items.toArray();
      expect(learningItems).toHaveLength(1);
      expect(learningItems[0]).toMatchObject({
        question_uid: question.id,
        analysis_state: 'pending',
        recovery_state: 'active',
        stage: 'D3',
        reason_flags: ['wrong', 'high-confidence-wrong']
      });
      expect(await db.learning_events.count()).toBe(1);
      expect(await db.reattempts.count()).toBe(1);

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
    expect(screen.getByRole('region', { name: 'Improvement insights' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Try fresh transfer questions/i })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /^Start a new set with the same filters/i })
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Choose a different set/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Repeat this exact set/i })).toBeEnabled();
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

  it('keeps exact repetition as a secondary action that still starts a clean session', async () => {
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
    expect(await db.pyq_attempts.where('pyq_session_id').equals(firstSession.id).count()).toBe(1);
    await user.click(screen.getByRole('button', { name: /^Repeat this exact set/i }));

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
    expect(await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()).toBe(1);
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
    expect(await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()).toBe(0);
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
    expect(await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()).toBe(1);
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
    expect(await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()).toBe(1);
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

  it('auto-resumes the exact session linked by a Planner block instead of another saved set', async () => {
    const [block] = createPlannerPyqRepairBlocks({
      date: '2026-09-02',
      questionUids: [question.id],
      durationMin: 20,
      subjectLabel: question.subject,
      subjectId: 'discrete-mathematics'
    });
    const plan = emptyDayPlan('2026-09-02');
    plan.sessions = [block];
    saveDayPlan(plan);
    const linked = createPyqSessionRow(
      USER,
      manifest.bankVersion,
      {
        ...block.launch!.prescription.config,
        plannerPrescriptionId: block.launch!.prescription.id
      },
      [question],
      '2026-09-02T06:00:00.000Z'
    );
    const unrelated = createPyqSessionRow(
      USER,
      manifest.bankVersion,
      {
        subjectSlug: 'discrete-mathematics',
        topicSlug: 'all',
        fromYear: 2026,
        toYear: 2026,
        type: 'all',
        order: 'unseen',
        count: '5'
      },
      [question],
      '2026-09-02T05:00:00.000Z'
    );
    await db.pyq_sessions.bulkPut([
      { ...linked, sync_status: 'synced' },
      { ...unrelated, sync_status: 'synced' }
    ]);
    attachPlannerPyqSession({
      plannerDate: plan.date,
      plannerBlockId: block.id,
      prescriptionId: block.launch!.prescription.id,
      pyqSessionId: linked.id,
      resolvedQuestionUids: [question.id],
      startedAt: linked.started_at
    });
    const attached = loadDayPlan(plan.date)!.sessions[0];

    render(
      <MemoryRouter initialEntries={[plannerBlockHref(plan.date, attached)]}>
        <Pyq />
      </MemoryRouter>
    );

    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume practice' })).not.toBeInTheDocument();
    expect((await db.pyq_sessions.get(linked.id))?.status).toBe('active');
    expect((await db.pyq_sessions.get(unrelated.id))?.status).toBe('active');
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

  it('records confidence in practice mode and displays the confidence badge on receipt', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /Start practice set/i }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'A' }));
    // Select Low confidence (aria-label: "Guessed: uncertain")
    await user.click(screen.getByRole('button', { name: 'Guessed: uncertain' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));

    const receipt = await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    expect(within(receipt).getByText('Low confidence')).toBeInTheDocument();

    const attempts = await db.pyq_attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].confidence).toBe('low');
    expect(attempts[0].mark_decision).toBe('FIFTY_FIFTY');
  });
});
