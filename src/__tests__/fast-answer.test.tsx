import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import Pyq from '@/pages/Pyq';
import {
  loadPyqManifest,
  normalizePyqManifest,
  type PyqManifest,
  type PyqQuestion
} from '@/lib/pyq';
import { fastAnswerInputs, needsFastAnswerCheck } from '@/lib/fast-answer';
import { usePyqPreferencesStore } from '@/stores/pyq-preferences';
import { useAuthStore } from '@/stores/auth';
import type { ApiUser as User } from '@/lib/fastapi-client';

// The shared setup turns the check off for other suites; this file tests it for real.
vi.unmock('@/lib/fast-answer');

const USER = '00000000-0000-4000-8000-000000000001';

vi.mock('@/lib/pyq', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pyq')>();
  return { ...original, loadPyqManifest: vi.fn(original.loadPyqManifest) };
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

vi.mock('@/lib/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/image')>()),
  captureElementToDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,cXVlc3Rpb24=')
}));

vi.mock('@/lib/backend-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/backend-config')>()),
  backendConfig: {
    backend: 'fastapi',
    fastapi: true,
    error: null,
    apiUrl: '/api',
    clerkKey: 'pk_test_fixture'
  }
}));
vi.mock('@/lib/api-client', async () => ({
  apiConfigured: false,
  apiClient: (await import('@/lib/fastapi-client')).fastapiClient
}));

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
  html: '<p>Which proposition is a tautology?</p>',
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
      file: '/api/v1/pyq/subjects/discrete-mathematics',
      topics: [{ slug: 'propositional-logic', label: 'Propositional Logic', count: 1 }]
    }
  ]
});

describe('fast answer rules', () => {
  it('asks only about answered commits under eight seconds', () => {
    expect(needsFastAnswerCheck(3000, 'MARK')).toBe(true);
    expect(needsFastAnswerCheck(7999, 'FIFTY_FIFTY')).toBe(true);
    expect(needsFastAnswerCheck(8000, 'MARK')).toBe(false);
    expect(needsFastAnswerCheck(2000, 'SKIP')).toBe(false);
  });

  it('turns a guess into a low-confidence 50/50 and paper work into unknown timing', () => {
    expect(fastAnswerInputs('guessed', 'MARK', 'high')).toEqual({
      decision: 'FIFTY_FIFTY',
      confidence: 'low',
      extra: {}
    });
    expect(fastAnswerInputs('earlier', 'MARK', 'medium')).toEqual({
      decision: 'MARK',
      confidence: 'medium',
      extra: { duration_source: 'unknown' }
    });
    expect(fastAnswerInputs('here', 'MARK', null)).toEqual({
      decision: 'MARK',
      confidence: null,
      extra: {}
    });
  });
});

describe('fast answer check in practice', () => {
  beforeEach(async () => {
    vi.mocked(loadPyqManifest).mockResolvedValue(manifest);
    localStorage.clear();
    useAuthStore.setState({ user: { id: USER } as User, status: 'signed_in', sandbox: false });
    usePyqPreferencesStore.getState().reset();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'https://air-journal.test');
      if (url.pathname === '/api/v1/pyq/manifest') return Response.json(manifest);
      if (url.pathname === '/api/v1/pyq/subjects/discrete-mathematics')
        return Response.json({
          bankVersion: manifest.bankVersion,
          subject: question.subject,
          questions: [question]
        });
      return new Response(null, { status: 404 });
    });
    await Promise.all([
      db.pyq_attempts.clear(),
      db.pyq_sessions.clear(),
      db.questions.clear(),
      db.learning_events.clear(),
      db.learning_items.clear(),
      db.reattempts.clear(),
      db.sessions.clear()
    ]);
  });

  async function commitQuickly() {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: /Start practice set/i }));
    expect(await screen.findByText('Which proposition is a tautology?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    expect(await screen.findByRole('region', { name: 'Quick answer check' })).toBeInTheDocument();
    // Nothing is saved until the learner answers the check.
    expect(await db.pyq_attempts.toArray()).toHaveLength(0);
    return user;
  }

  it('saves a quick guess as a low-confidence 50/50', async () => {
    const user = await commitQuickly();
    await user.click(screen.getByRole('button', { name: 'Guessed' }));
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    const [attempt] = await db.pyq_attempts.toArray();
    expect(attempt.mark_decision).toBe('FIFTY_FIFTY');
    expect(attempt.confidence).toBe('low');
    expect(attempt.mark_correct).toBe(true);
  });

  it('keeps paper work as the answer but drops its timing', async () => {
    const user = await commitQuickly();
    await user.click(screen.getByRole('button', { name: 'Worked it out on paper first' }));
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    const [attempt] = await db.pyq_attempts.toArray();
    expect(attempt.mark_decision).toBe('MARK');
    expect(attempt.duration_source).toBe('unknown');
  });

  it('lets the learner keep working without saving anything', async () => {
    const user = await commitQuickly();
    await user.click(screen.getByRole('button', { name: 'Keep working' }));
    expect(screen.queryByRole('region', { name: 'Quick answer check' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Commit & reveal key' })).toBeInTheDocument();
    expect(await db.pyq_attempts.toArray()).toHaveLength(0);
  });
});

beforeEach(async () => {
  const { configureClerkRuntime } = await import('@/lib/fastapi-client');
  configureClerkRuntime({
    loaded: true,
    user: { id: 'test-catalog-reader' },
    getToken: async () => 'test-session',
    signOut: async () => {}
  });
});
