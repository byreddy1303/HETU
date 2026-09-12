import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import { normalizePyqManifest, type PyqQuestion } from '@/lib/pyq';
import { createPyqSessionRow, pausePyqSession } from '@/lib/pyq-session';
import { usePyqPreferencesStore } from '@/stores/pyq-preferences';
import Pyq from '@/pages/Pyq';

const USER = '00000000-0000-4000-8000-000000000001';
const question: PyqQuestion = {
  id: 'custom-range-1990',
  bookSlug: 'gate-cse',
  year: 1990,
  set: null,
  number: '1',
  paperLabel: 'GATE CSE 1990',
  subject: 'Discrete Mathematics',
  subjectSlug: 'discrete-mathematics',
  topic: 'Logic',
  topicSlug: 'logic',
  subtopics: ['Logic'],
  marks: 1,
  type: 'MCQ',
  answer: 'B',
  tolerance: null,
  answerStatus: 'available',
  html: '<p>A core question from 1990.</p>',
  sourceUrl: 'https://gateoverflow.in/custom-range/1',
  answerSource: null
};
const recentQuestion = {
  ...question,
  id: 'custom-range-2026',
  year: 2026,
  paperLabel: 'GATE CSE 2026',
  html: '<p>A core question from 2026.</p>'
};
const legacyQuestion = {
  ...recentQuestion,
  id: 'custom-range-tifr',
  bookSlug: 'tifr-gs-cs',
  paperLabel: 'TIFR GS CS 2026',
  html: '<p>A saved TIFR question.</p>'
};
const questions = [question, recentQuestion, legacyQuestion];
const manifest = normalizePyqManifest({
  bankVersion: 'custom-range-bank',
  generatedAt: '2026-09-12T00:00:00Z',
  source: 'test',
  sourceUrl: 'https://gateoverflow.in',
  firstYear: 1990,
  lastYear: 2026,
  questionCount: 3,
  imageCount: 0,
  answerStatuses: { available: 3, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
  years: [
    { year: 1990, count: 1 },
    { year: 2026, count: 2 }
  ],
  subjects: [
    {
      slug: question.subjectSlug,
      label: question.subject,
      count: 3,
      file: '/pyq/discrete-mathematics.json',
      topics: [{ slug: 'logic', label: 'Logic', count: 3 }]
    }
  ],
  benchmarkPapers: [
    {
      id: 'gate-cse-2026-set-1',
      bookSlug: 'gate-cse',
      paperLabel: 'GATE CSE 2026 Set 1',
      year: 2026,
      set: 1,
      questionCount: 65,
      maxMarks: 100,
      questionUids: Array.from({ length: 65 }, (_, index) => `benchmark-${index}`)
    }
  ]
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: USER,
    sandbox: true,
    user: null,
    profile: { id: USER, username: 'rishi', name: 'Rishi', timezone: 'Asia/Kolkata' }
  })
}));

describe('Custom PYQ setup and Rishi catalog visibility', () => {
  beforeEach(async () => {
    usePyqPreferencesStore.getState().reset();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'https://hetu.test');
      if (url.pathname === '/pyq/manifest.json') return Response.json(manifest);
      if (url.pathname === '/pyq/discrete-mathematics.json')
        return Response.json({
          bankVersion: manifest.bankVersion,
          subject: question.subject,
          questions
        });
      return new Response(null, { status: 404 });
    });
    await Promise.all([
      db.pyq_sessions.clear(),
      db.pyq_attempts.clear(),
      db.sessions.clear(),
      db.questions.clear()
    ]);
  });

  it('restores 1990–2026 when returning from a recommendation and keeps the chosen view and subject', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );
    await user.selectOptions(await screen.findByRole('combobox', { name: 'From year' }), '2026');
    await user.click(screen.getByRole('button', { name: 'Multiple questions' }));
    await user.click(screen.getByRole('button', { name: /^Learn/ }));
    await user.click(screen.getByRole('button', { name: /^Custom/ }));
    expect(screen.getByRole('combobox', { name: 'From year' })).toHaveValue('1990');
    expect(screen.getByRole('combobox', { name: 'To year' })).toHaveValue('2026');
    expect(screen.getByRole('button', { name: 'Multiple questions' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await waitFor(() =>
      expect(usePyqPreferencesStore.getState().lastConfig).toMatchObject({
        bookSlug: 'gate-cse',
        subjectSlug: question.subjectSlug,
        fromYear: 1990,
        toYear: 2026,
        practiceView: 'multiple'
      })
    );
    await user.click(screen.getByRole('button', { name: 'Start practice set' }));
    expect(await screen.findByText('A core question from 1990.')).toBeInTheDocument();
    expect(screen.getByText('A core question from 2026.')).toBeInTheDocument();
  });

  it('leaves the single-year Full Paper configuration when Custom is selected', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: /^Full Paper/ }));
    expect(screen.getByRole('button', { name: 'Start 3-hour full paper' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'From year' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Custom/ }));
    expect(screen.getByRole('combobox', { name: 'From year' })).toHaveValue('1990');
    expect(screen.getByRole('combobox', { name: 'To year' })).toHaveValue('2026');
    expect(screen.getByRole('button', { name: 'Start timed exam' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Questions' })).toHaveValue('10');
    await waitFor(() =>
      expect(usePyqPreferencesStore.getState().lastConfig).toMatchObject({
        fromYear: 1990,
        toYear: 2026,
        mode: 'exam',
        examKind: 'timed-set',
        count: '10'
      })
    );
    expect(usePyqPreferencesStore.getState().lastConfig?.benchmarkPaperId).toBeUndefined();
  });

  it('offers Rishi only core questions for new sets while preserving his saved non-core session', async () => {
    const user = userEvent.setup();
    const legacySession = {
      ...pausePyqSession(
        createPyqSessionRow(
          USER,
          manifest.bankVersion,
          {
            bookSlug: 'tifr-gs-cs',
            subjectSlug: 'all',
            fromYear: 2026,
            toYear: 2026,
            type: 'all',
            order: 'oldest',
            count: '5',
            mode: 'practice'
          },
          [legacyQuestion]
        )
      ),
      sync_status: 'pending' as const
    };
    await db.pyq_sessions.add(legacySession);
    usePyqPreferencesStore.getState().remember(legacySession.config, 'custom', 'rishi-core');
    render(
      <MemoryRouter>
        <Pyq />
      </MemoryRouter>
    );
    await screen.findByRole('button', { name: 'Resume practice' });
    expect(screen.queryByRole('combobox', { name: 'Question book' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^All books/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start practice set' }));
    await screen.findByText('A core question from 2026.');
    const sessions = await db.pyq_sessions.toArray();
    expect(sessions.find((session) => session.id === legacySession.id)).toEqual(legacySession);
    const newSession = sessions.find((session) => session.id !== legacySession.id);
    expect(newSession?.config.bookSlug).toBe('gate-cse');
    expect(newSession?.question_uids).not.toContain(legacyQuestion.id);
    expect(sessions).toHaveLength(2);
  });
});
