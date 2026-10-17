import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { db, hydrateTables } from '@/lib/db';
import { apiRequest } from '@/lib/fastapi-client';
import { normalizePyqManifest, type PyqQuestion } from '@/lib/pyq';
import {
  advancePyqSessionProgress,
  createPyqAttemptRow,
  createPyqSessionRow,
  pausePyqPracticeSession,
  pyqPracticeSessionRow,
  startPyqSessionQuestion
} from '@/lib/pyq-session';
import { createPyqExamConfig, pausePyqExamSession, setPyqExamResponse } from '@/lib/pyq-exam';
import { writeLocalBatch } from '@/lib/sync';
import { usePyqPreferencesStore } from '@/stores/pyq-preferences';
import type {
  MockTestRow,
  PyqAttemptRow,
  PyqSessionConfig,
  PyqSessionRow,
  SessionRow
} from '@/types';
import Pyq from '@/pages/Pyq';

const USER = '00000000-0000-4000-8000-000000000001';
const START_MS = Date.parse('2026-10-16T09:00:00.000Z');

interface ExamSubmissionPayload {
  session: PyqSessionRow;
  attempts: PyqAttemptRow[];
  canonical_session: SessionRow;
  mock_test: MockTestRow | null;
}

const questions: PyqQuestion[] = ['B', 'C', 'A'].map((answer, index) => ({
  id: `end-session-q${index + 1}`,
  year: 2026,
  set: 1,
  number: String(index + 1),
  paperLabel: 'GATE CSE 2026 Set 1',
  subject: 'Discrete Mathematics',
  subjectSlug: 'discrete-mathematics',
  topic: 'Propositional Logic',
  topicSlug: 'propositional-logic',
  subtopics: ['Logic'],
  marks: 1,
  type: 'MCQ',
  answer,
  tolerance: null,
  answerStatus: 'available',
  html: `<p>Saved question ${index + 1}</p>`,
  sourceUrl: `https://gateoverflow.in/end-session/${index + 1}`,
  answerSource: null
}));

const manifest = normalizePyqManifest({
  bankVersion: 'end-session-test-bank',
  generatedAt: '2026-10-16T00:00:00.000Z',
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
      file: '/api/v1/pyq/subjects/discrete-mathematics',
      topics: [
        { slug: 'propositional-logic', label: 'Propositional Logic', count: questions.length }
      ]
    }
  ]
});

const config: PyqSessionConfig = {
  bookSlug: 'gate-cse',
  mode: 'practice',
  subjectSlug: 'discrete-mathematics',
  topicSlug: 'all',
  fromYear: 2026,
  toYear: 2026,
  type: 'all',
  order: 'oldest',
  count: 'all'
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
  return { ...original, writeLocalBatch: vi.fn(original.writeLocalBatch) };
});

vi.mock('@/lib/fastapi-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/fastapi-client')>();
  return { ...original, apiRequest: vi.fn(original.apiRequest) };
});

vi.mock('@/lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/db')>();
  return { ...original, hydrateTables: vi.fn(original.hydrateTables) };
});

const realWriteLocalBatch = vi.mocked(writeLocalBatch).getMockImplementation()!;
const realHydrateTables = vi.mocked(hydrateTables).getMockImplementation()!;

function ReviewDestination() {
  const { id } = useParams();
  return <h1>Saved session review {id}</h1>;
}

function renderSetup() {
  return render(
    <MemoryRouter initialEntries={['/pyq']}>
      <Routes>
        <Route path="/pyq" element={<Pyq />} />
        <Route path="/session/:id/review" element={<ReviewDestination />} />
      </Routes>
    </MemoryRouter>
  );
}

async function seedPausedPractice(withReceipt = true) {
  const started = createPyqSessionRow(
    USER,
    manifest.bankVersion,
    config,
    questions,
    new Date(START_MS).toISOString()
  );
  let working = started;
  let receipt: PyqAttemptRow | null = null;
  if (withReceipt) {
    receipt = createPyqAttemptRow({
      userId: USER,
      session: started,
      question: questions[0],
      selectedAnswer: 'B',
      decision: 'MARK',
      confidence: 'high',
      bankVersion: manifest.bankVersion,
      questionStartedAtMs: START_MS,
      committedAtMs: START_MS + 30_000,
      screenshotUrl: null
    });
    working = advancePyqSessionProgress(
      started,
      questions[0].id,
      1,
      30,
      new Date(START_MS + 30_000).toISOString()
    );
    working = startPyqSessionQuestion(
      working,
      questions[1].id,
      new Date(START_MS + 30_000).toISOString()
    );
  }
  const draftQuestion = withReceipt ? questions[1] : questions[0];
  const paused = pausePyqPracticeSession(
    working,
    {
      questionUid: draftQuestion.id,
      selectedAnswer: 'C',
      markDecision: 'FIFTY_FIFTY',
      confidence: 'low'
    },
    START_MS + (withReceipt ? 50_500 : 20_500)
  );
  const seeded: PyqSessionRow = {
    ...paused,
    config: {
      ...paused.config,
      practiceDrafts: {
        ...paused.config.practiceDrafts,
        [questions[2].id]: {
          question_uid: questions[2].id,
          selected_answer: 'A',
          mark_decision: null,
          confidence: null,
          elapsed_ms: 10_500,
          first_started_at: new Date(START_MS).toISOString()
        }
      }
    }
  };
  await db.pyq_sessions.put({ ...seeded, sync_status: 'synced' });
  await db.sessions.put({
    ...pyqPracticeSessionRow(seeded, questions[0].subject),
    sync_status: 'synced'
  });
  if (receipt) await db.pyq_attempts.put({ ...receipt, sync_status: 'synced' });
  return { session: seeded, receipt };
}

async function seedPausedExam() {
  const examConfig = createPyqExamConfig(
    config,
    questions.map((question) => question.id),
    START_MS
  );
  const started = createPyqSessionRow(
    USER,
    manifest.bankVersion,
    examConfig,
    questions,
    new Date(START_MS).toISOString()
  );
  const answered = setPyqExamResponse(started, questions[0], 'B', START_MS + 10_000);
  const paused = pausePyqExamSession(answered, START_MS + 45_000);
  await db.pyq_sessions.put({ ...paused, sync_status: 'synced' });
  await db.sessions.put({
    ...pyqPracticeSessionRow(paused, questions[0].subject),
    sync_status: 'synced'
  });
  return paused;
}

describe('ending paused PYQ sessions', () => {
  beforeEach(async () => {
    usePyqPreferencesStore.getState().reset();
    vi.mocked(writeLocalBatch).mockReset().mockImplementation(realWriteLocalBatch);
    vi.mocked(hydrateTables).mockReset().mockImplementation(realHydrateTables);
    vi.mocked(apiRequest)
      .mockReset()
      .mockImplementation(async <T,>(path: string, init?: RequestInit) => {
        if (path === '/v1/pyq/manifest') return manifest as T;
        if (path.startsWith('/v1/pyq/subjects/discrete-mathematics?')) {
          return {
            bankVersion: manifest.bankVersion,
            subject: questions[0].subject,
            questions
          } as T;
        }
        if (path === '/v1/study-memory/exams/submit') {
          const payload = JSON.parse(String(init?.body)) as ExamSubmissionPayload;
          await db.pyq_attempts.bulkPut(
            payload.attempts.map((attempt) => ({ ...attempt, sync_status: 'synced' }))
          );
          await db.pyq_sessions.put({ ...payload.session, sync_status: 'synced' });
          await db.sessions.put({ ...payload.canonical_session, sync_status: 'synced' });
          if (payload.mock_test)
            await db.mock_tests.put({ ...payload.mock_test, sync_status: 'synced' });
        }
        return { committed: true } as T;
      });
    vi.stubGlobal('scrollTo', vi.fn());
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'https://air-journal.test');
      if (url.pathname === '/api/v1/pyq/manifest') return Response.json(manifest);
      if (url.pathname === '/api/v1/pyq/subjects/discrete-mathematics') {
        return Response.json({
          bankVersion: manifest.bankVersion,
          subject: questions[0].subject,
          questions
        });
      }
      return new Response(null, { status: 404 });
    });
    await Promise.all([
      db.pyq_sessions.clear(),
      db.pyq_attempts.clear(),
      db.sessions.clear(),
      db.questions.clear(),
      db.mock_tests.clear(),
      db.learning_items.clear(),
      db.learning_events.clear(),
      db.recovery_sessions.clear()
    ]);
  });

  it('saves partial practice with its existing receipt and every draft, without counting time paused', async () => {
    const user = userEvent.setup();
    const { session, receipt } = await seedPausedPractice();
    renderSetup();

    await user.click(await screen.findByRole('button', { name: 'End and save' }));

    expect(
      await screen.findByRole('heading', { name: `Saved session review ${session.id}` })
    ).toBeInTheDocument();
    expect(await db.pyq_sessions.get(session.id)).toMatchObject({
      status: 'completed',
      completed_count: 1,
      completed_question_uids: [questions[0].id],
      elapsed_sec: 61,
      current_question_uid: null,
      current_question_started_at: null,
      config: {
        practiceDraft: session.config.practiceDraft,
        practiceDrafts: session.config.practiceDrafts
      }
    });
    expect(await db.pyq_attempts.toArray()).toEqual([
      expect.objectContaining({ id: receipt!.id, selected_answer: 'B' })
    ]);
    expect(await db.sessions.get(session.id)).toMatchObject({
      kind: 'pyq',
      actual_duration_min: 2
    });
  });

  it('can end a paused session with only drafts without inventing answer receipts', async () => {
    const user = userEvent.setup();
    const { session } = await seedPausedPractice(false);
    renderSetup();

    await user.click(await screen.findByRole('button', { name: 'End and save' }));

    expect(
      await screen.findByRole('heading', { name: `Saved session review ${session.id}` })
    ).toBeInTheDocument();
    expect(await db.pyq_sessions.get(session.id)).toMatchObject({
      status: 'completed',
      completed_count: 0,
      completed_question_uids: [],
      elapsed_sec: 31,
      config: { practiceDrafts: session.config.practiceDrafts }
    });
    expect(await db.pyq_attempts.count()).toBe(0);
    expect((await db.sessions.get(session.id))?.actual_duration_min).toBe(1);
  });

  it('keeps practice paused when its report record cannot be saved', async () => {
    const user = userEvent.setup();
    const { session } = await seedPausedPractice();
    vi.mocked(writeLocalBatch).mockImplementation(async (writes) => {
      if (
        writes.some(
          (write) =>
            write.name === 'sessions' &&
            'actual_duration_min' in write.row &&
            write.row.actual_duration_min !== null
        )
      ) {
        throw new Error('report save failed');
      }
      return realWriteLocalBatch(writes);
    });
    renderSetup();

    await user.click(await screen.findByRole('button', { name: 'End and save' }));

    expect(await screen.findByText(/report save failed/)).toBeInTheDocument();
    expect(await db.pyq_sessions.get(session.id)).toMatchObject({
      status: 'paused',
      elapsed_sec: 30
    });
    expect(screen.getByRole('button', { name: 'End and save' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: /Saved session review/ })).not.toBeInTheDocument();
  });

  it('keeps a failed save paused and supports a retry without duplicating time or receipts', async () => {
    const user = userEvent.setup();
    const { session } = await seedPausedPractice();
    let failCompletion = true;
    vi.mocked(writeLocalBatch).mockImplementation(async (writes) => {
      if (
        failCompletion &&
        writes.some((write) => write.name === 'pyq_sessions' && write.row.id === session.id)
      ) {
        throw new Error('connection interrupted');
      }
      return realWriteLocalBatch(writes);
    });
    renderSetup();

    await user.click(await screen.findByRole('button', { name: 'End and save' }));

    expect(await screen.findByText(/connection interrupted/)).toBeInTheDocument();
    expect(await db.pyq_sessions.get(session.id)).toMatchObject({
      status: 'paused',
      elapsed_sec: 30
    });
    expect(screen.queryByRole('heading', { name: /Saved session review/ })).not.toBeInTheDocument();
    failCompletion = false;
    await user.click(screen.getByRole('button', { name: 'End and save' }));

    expect(
      await screen.findByRole('heading', { name: `Saved session review ${session.id}` })
    ).toBeInTheDocument();
    expect(await db.pyq_sessions.get(session.id)).toMatchObject({
      status: 'completed',
      elapsed_sec: 61
    });
    expect(await db.pyq_attempts.count()).toBe(1);
  });

  it('submits saved exam responses as a final exam while keeping the paused active time frozen', async () => {
    const user = userEvent.setup();
    const session = await seedPausedExam();
    renderSetup();

    await user.click(await screen.findByRole('button', { name: 'End and save' }));

    expect(
      await screen.findByRole('heading', { name: `Saved session review ${session.id}` })
    ).toBeInTheDocument();
    const examCalls = vi
      .mocked(apiRequest)
      .mock.calls.filter(([path]) => path === '/v1/study-memory/exams/submit');
    expect(examCalls).toHaveLength(1);
    const payload = JSON.parse(String(examCalls[0][1]?.body));
    expect(payload.session).toMatchObject({
      id: session.id,
      status: 'completed',
      elapsed_sec: 45,
      config: {
        examState: {
          responses: { [questions[0].id]: 'B' },
          time_by_question_ms: { [questions[0].id]: 45_000 },
          pause_count: 1,
          submission_reason: 'manual'
        }
      }
    });
    expect(payload.attempts).toHaveLength(questions.length);
    expect(payload.attempts[0]).toMatchObject({
      question_uid: questions[0].id,
      selected_answer: 'B',
      time_spent_ms: 45_000
    });
    expect(payload.attempts.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question_uid: questions[1].id,
          mark_decision: 'SKIP',
          selected_answer: null
        }),
        expect.objectContaining({
          question_uid: questions[2].id,
          mark_decision: 'SKIP',
          selected_answer: null
        })
      ])
    );
    expect(await db.pyq_attempts.count()).toBe(questions.length);
    await waitFor(async () =>
      expect((await db.pyq_sessions.get(session.id))?.status).toBe('completed')
    );
  });

  it('reconciles a committed exam after a lost response instead of submitting new receipts on retry', async () => {
    const user = userEvent.setup();
    const session = await seedPausedExam();
    const defaultRequest = vi.mocked(apiRequest).getMockImplementation()!;
    let authoritativeSubmission: ExamSubmissionPayload | null = null;
    vi.mocked(apiRequest).mockImplementation(async <T,>(path: string, init?: RequestInit) => {
      if (path === '/v1/study-memory/exams/submit') {
        authoritativeSubmission = JSON.parse(String(init?.body)) as ExamSubmissionPayload;
        throw new Error('submission response lost');
      }
      return (await defaultRequest(path, init)) as T;
    });
    vi.mocked(hydrateTables).mockImplementation(async (userId, names) => {
      if (!authoritativeSubmission) return realHydrateTables(userId, names);
      await db.pyq_attempts.bulkPut(
        authoritativeSubmission.attempts.map((attempt) => ({ ...attempt, sync_status: 'synced' }))
      );
      await db.pyq_sessions.put({ ...authoritativeSubmission.session, sync_status: 'synced' });
      await db.sessions.put({
        ...authoritativeSubmission.canonical_session,
        sync_status: 'synced'
      });
      if (authoritativeSubmission.mock_test) {
        await db.mock_tests.put({ ...authoritativeSubmission.mock_test, sync_status: 'synced' });
      }
    });
    renderSetup();

    await user.click(await screen.findByRole('button', { name: 'End and save' }));

    expect(await screen.findByText(/submission response lost/)).toBeInTheDocument();
    expect(authoritativeSubmission).not.toBeNull();
    expect(await db.pyq_sessions.get(session.id)).toMatchObject({ status: 'paused' });
    expect(await db.pyq_attempts.count()).toBe(0);
    expect(screen.queryByRole('heading', { name: /Saved session review/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'End and save' }));

    expect(
      await screen.findByRole('heading', { name: `Saved session review ${session.id}` })
    ).toBeInTheDocument();
    expect(
      vi.mocked(apiRequest).mock.calls.filter(([path]) => path === '/v1/study-memory/exams/submit')
    ).toHaveLength(1);
    expect(hydrateTables).toHaveBeenCalledWith(USER, [
      'pyq_sessions',
      'sessions',
      'pyq_attempts',
      'mock_tests'
    ]);
    expect(await db.pyq_sessions.get(session.id)).toMatchObject({
      status: 'completed',
      elapsed_sec: 45
    });
    expect(await db.pyq_attempts.count()).toBe(questions.length);
  });
});
