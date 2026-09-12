import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import { normalizePyqManifest, type PyqQuestion } from '@/lib/pyq';
import { usePyqPreferencesStore, type PyqSavedPrescription } from '@/stores/pyq-preferences';
import type { PyqSessionConfig } from '@/types';
import Pyq from '@/pages/Pyq';

const USER = '00000000-0000-4000-8000-000000000001';
const baseQuestion: PyqQuestion = {
  id: 'multiple-view-q1',
  bookSlug: 'gate-cse',
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
  html: '<p>Choose the true proposition.</p>',
  sourceUrl: 'https://gateoverflow.in/multiple-view/1',
  answerSource: null
};
const coreQuestions: PyqQuestion[] = [
  baseQuestion,
  {
    ...baseQuestion,
    id: 'multiple-view-q2',
    number: '2',
    type: 'MSQ',
    answer: ['A', 'C'],
    html: '<p>Select all valid implications.</p>'
  },
  {
    ...baseQuestion,
    id: 'multiple-view-q3',
    number: '3',
    type: 'NAT',
    answer: 12,
    html: '<p>How many assignments satisfy the formula?</p>'
  }
];
const otherQuestion: PyqQuestion = {
  ...baseQuestion,
  id: 'multiple-view-tifr-q1',
  bookSlug: 'tifr-gs-cs',
  paperLabel: 'TIFR GS CS 2026',
  html: '<p>This question belongs to the TIFR catalog.</p>'
};
const questions = [...coreQuestions, otherQuestion];
const subject = {
  slug: 'discrete-mathematics',
  label: 'Discrete Mathematics',
  count: questions.length,
  file: '/pyq/discrete-mathematics.json',
  topics: [{ slug: 'propositional-logic', label: 'Propositional Logic', count: questions.length }]
};
const manifest = normalizePyqManifest({
  bankVersion: 'multiple-view-test-bank',
  generatedAt: '2026-09-11T00:00:00.000Z',
  source: 'test',
  sourceUrl: 'https://gateoverflow.in',
  defaultBookSlug: 'gate-cse',
  firstYear: 2026,
  lastYear: 2026,
  questionCount: questions.length,
  imageCount: 0,
  answerStatuses: { available: questions.length, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
  years: [{ year: 2026, count: questions.length }],
  subjects: [subject],
  books: [
    { slug: 'gate-cse', label: 'GATE CSE Core', count: 3 },
    { slug: 'tifr-gs-cs', label: 'TIFR GS Computer Science', count: 1 }
  ].map((book) => ({
    ...book,
    shortLabel: book.label,
    description: book.label,
    difficultyFloor: book.slug === 'gate-cse' ? 'gate' : 'above-gate',
    sourceClass: 'official-exam',
    source: 'test',
    sourceUrl: 'https://gateoverflow.in',
    firstYear: 2026,
    lastYear: 2026,
    answerStatuses: { available: book.count, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
    years: [{ year: 2026, count: book.count }],
    subjects: [{ ...subject, count: book.count }]
  })),
  benchmarkPapers: []
});
const oldConfig: PyqSessionConfig = {
  bookSlug: 'tifr-gs-cs',
  subjectSlug: 'all',
  topicSlug: 'all',
  fromYear: 2026,
  toYear: 2026,
  type: 'all',
  order: 'oldest',
  count: '5',
  history: 'all',
  mode: 'practice'
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

vi.mock('@/lib/image', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/image')>();
  return {
    ...original,
    captureElementToDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,bXVsdGlwbGU=')
  };
});

function renderPractice(path = '/pyq') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Pyq />
    </MemoryRouter>
  );
}

async function startMultiple(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Multiple questions' }));
  await user.click(screen.getByRole('button', { name: /Start (?:fresh set|practice)/ }));
  return screen.findByRole('article', { name: 'Question 1' });
}

async function workOnQuestion(user: ReturnType<typeof userEvent.setup>, number: number) {
  await user.click(screen.getByRole('button', { name: `Work on question ${number}` }));
  await within(screen.getByRole('article', { name: `Question ${number}` })).findByRole('button', {
    name: 'Commit & reveal key'
  });
}

describe('PYQ multiple-question practice view', () => {
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
      const url = new URL(String(input), 'https://air-journal.test');
      if (url.pathname === '/pyq/manifest.json') return Response.json(manifest);
      if (url.pathname === subject.file) {
        return Response.json({
          bankVersion: manifest.bankVersion,
          subject: subject.label,
          questions
        });
      }
      return new Response(null, { status: 404 });
    });
    await Promise.all([
      db.pyq_attempts.clear(),
      db.pyq_sessions.clear(),
      db.questions.clear(),
      db.sessions.clear(),
      db.learning_events.clear(),
      db.learning_items.clear(),
      db.recovery_sessions.clear(),
      db.reattempts.clear(),
      db.weekly_reviews.clear()
    ]);
  });

  it('shows the complete question sheet and changes views without losing the active answer', async () => {
    const user = userEvent.setup();
    renderPractice();
    expect(await screen.findByRole('button', { name: 'One question' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await startMultiple(user);
    expect(screen.getAllByRole('article', { name: /^Question \d+$/ })).toHaveLength(3);
    for (const question of coreQuestions) {
      expect(screen.getByText(question.html.replace(/<[^>]*>/g, ''))).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'Commit & reveal key' })).toHaveLength(1);
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'One question' }));
    await waitFor(() =>
      expect(screen.queryByText('Select all valid implications.')).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Multiple questions' }));
    expect(await screen.findByText('Select all valid implications.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(async () => {
      const [session] = await db.pyq_sessions.toArray();
      expect(session.config.practiceView).toBe('multiple');
    });
    expect(usePyqPreferencesStore.getState().lastConfig?.practiceView).toBe('multiple');
  });

  it('restores independent MCQ, MSQ, numeric, and confidence drafts after jumping and pausing', async () => {
    const user = userEvent.setup();
    const mounted = renderPractice();
    await startMultiple(user);
    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' }));
    await workOnQuestion(user, 2);
    await user.click(screen.getByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: 'C' }));
    await workOnQuestion(user, 3);
    await user.type(screen.getByRole('spinbutton', { name: 'Your numeric answer' }), '12');
    await workOnQuestion(user, 1);
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(screen.getByRole('button', { name: 'Pause practice' }));
    expect(await screen.findByRole('button', { name: 'Resume practice' })).toBeInTheDocument();
    mounted.unmount();
    renderPractice();
    await user.click(await screen.findByRole('button', { name: 'Resume practice' }));
    expect(await screen.findByRole('article', { name: 'Question 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await workOnQuestion(user, 2);
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'C' })).toHaveAttribute('aria-pressed', 'true');
    await workOnQuestion(user, 3);
    expect(screen.getByRole('spinbutton', { name: 'Your numeric answer' })).toHaveValue(12);
    expect(await db.pyq_attempts.count()).toBe(0);
  });

  it('keeps the set open after answering the last question first and grades each question independently', async () => {
    const user = userEvent.setup();
    renderPractice();
    await startMultiple(user);
    await workOnQuestion(user, 3);
    await user.type(screen.getByRole('spinbutton', { name: 'Your numeric answer' }), '12');
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    const receipt = await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    expect(within(receipt).getByText('Correct', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish set' })).not.toBeInTheDocument();
    expect((await db.pyq_sessions.toArray())[0]).toMatchObject({
      status: 'active',
      completed_count: 1
    });
    await workOnQuestion(user, 1);
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    await workOnQuestion(user, 2);
    await user.click(screen.getByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    await user.click(await screen.findByRole('button', { name: 'Finish set' }));
    expect(
      await screen.findByRole('heading', { name: 'Practice set complete' })
    ).toBeInTheDocument();
    const [session] = await db.pyq_sessions.toArray();
    expect(session).toMatchObject({ status: 'completed', completed_count: 3 });
    expect(new Set(session.completed_question_uids)).toEqual(
      new Set(coreQuestions.map((question) => question.id))
    );
    const attempts = await db.pyq_attempts.toArray();
    expect(attempts).toHaveLength(3);
    expect(attempts.every((attempt) => attempt.mark_correct === true)).toBe(true);
    expect(
      attempts.find((attempt) => attempt.question_uid === coreQuestions[1].id)?.selected_answer
    ).toEqual(['A', 'C']);
    expect(
      attempts.find((attempt) => attempt.question_uid === coreQuestions[2].id)?.selected_answer
    ).toBe('12');
  });

  it('pauses a committed-question review without saving a blank draft or charging review time', async () => {
    const user = userEvent.setup();
    renderPractice();
    await startMultiple(user);
    await user.click(screen.getByRole('button', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    await workOnQuestion(user, 2);
    await user.click(screen.getByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: 'Review question 1' }));
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    const [beforePause] = await db.pyq_sessions.toArray();
    expect(beforePause.config.practiceDrafts?.[coreQuestions[0].id]).toBeUndefined();
    expect(beforePause.config.practiceDrafts?.[coreQuestions[1].id].selected_answer).toEqual(['A']);

    const later = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    try {
      await user.click(screen.getByRole('button', { name: 'Pause practice' }));
      await screen.findByRole('button', { name: 'Resume practice' });
      const paused = await db.pyq_sessions.get(beforePause.id);
      expect(paused?.status).toBe('paused');
      expect(paused?.config.practiceDraft).toBeUndefined();
      expect(paused?.config.practiceDrafts).toEqual(beforePause.config.practiceDrafts);
      expect(paused?.elapsed_sec).toBe(beforePause.elapsed_sec);
      expect(paused?.current_question_uid).toBeNull();
      expect(await db.pyq_attempts.count()).toBe(1);
    } finally {
      later.mockRestore();
    }
  });

  it('preserves map-only drafts after resuming, pausing from setup, and starting another set', async () => {
    const user = userEvent.setup();
    const active = renderPractice();
    await startMultiple(user);
    await user.click(screen.getByRole('button', { name: 'B' }));
    await workOnQuestion(user, 2);
    await user.click(screen.getByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: 'C' }));
    await workOnQuestion(user, 3);
    await user.type(screen.getByRole('spinbutton', { name: 'Your numeric answer' }), '12');
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    const [original] = await db.pyq_sessions.toArray();
    expect(original.config.practiceDraft).toBeUndefined();
    expect(original.config.practiceDrafts?.[coreQuestions[0].id].selected_answer).toBe('B');
    expect(original.config.practiceDrafts?.[coreQuestions[1].id].selected_answer).toEqual(['A', 'C']);
    await user.click(screen.getByRole('button', { name: 'Pause practice' }));
    await user.click(await screen.findByRole('button', { name: 'Resume practice' }));
    expect(await screen.findByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    active.unmount();

    const setup = renderPractice();
    await user.click(await screen.findByRole('button', { name: 'Pause practice' }));
    await screen.findByRole('button', { name: 'Resume practice' });
    const pausedFromSetup = await db.pyq_sessions.get(original.id);
    expect(pausedFromSetup?.status).toBe('paused');
    expect(pausedFromSetup?.config.practiceDrafts?.[coreQuestions[0].id]).toMatchObject({
      selected_answer: 'B',
      mark_decision: 'MARK',
      confidence: 'high'
    });
    expect(pausedFromSetup?.config.practiceDrafts?.[coreQuestions[1].id]).toEqual(
      original.config.practiceDrafts?.[coreQuestions[1].id]
    );
    await user.click(screen.getByRole('button', { name: 'Resume practice' }));
    expect(await screen.findByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    setup.unmount();

    renderPractice();
    await user.click(await screen.findByRole('button', { name: /Start (?:fresh set|practice)/ }));
    await screen.findByRole('article', { name: 'Question 1' });
    const autoPaused = await db.pyq_sessions.get(original.id);
    expect(autoPaused?.status).toBe('paused');
    expect(autoPaused?.config.practiceDrafts?.[coreQuestions[0].id]).toMatchObject({
      selected_answer: 'B',
      mark_decision: 'MARK',
      confidence: 'high'
    });
    expect(autoPaused?.config.practiceDrafts?.[coreQuestions[1].id]).toEqual(
      original.config.practiceDrafts?.[coreQuestions[1].id]
    );
    expect(await db.pyq_sessions.count()).toBe(2);
  });

  it.each(['remembered setup', 'book URL', 'saved prescription', 'Transfer preset'])(
    'keeps new sessions in GATE CSE Core after loading a %s',
    async (source) => {
      const user = userEvent.setup();
      if (source === 'remembered setup') {
        usePyqPreferencesStore.getState().remember(oldConfig, 'custom', 'core-scope-test');
      }
      if (source === 'saved prescription') {
        const prescription: PyqSavedPrescription = {
          id: 'old-tifr-prescription',
          name: 'Legacy TIFR set',
          config: oldConfig,
          preset: 'custom',
          selectionSeed: 'legacy-core-test',
          createdAt: '2026-09-11T00:00:00.000Z',
          updatedAt: '2026-09-11T00:00:00.000Z'
        };
        usePyqPreferencesStore.getState().savePrescription(prescription);
      }
      renderPractice(source === 'book URL' ? '/pyq?book=tifr-gs-cs' : '/pyq');
      await screen.findByRole('button', { name: /Start (?:fresh set|practice)/ });
      expect(screen.queryByRole('combobox', { name: 'Question book' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /TIFR GS Computer Science/ })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^All books/ })).not.toBeInTheDocument();
      if (source === 'saved prescription') {
        await user.click(screen.getByRole('button', { name: 'Legacy TIFR set' }));
      }
      if (source === 'Transfer preset') {
        await user.click(screen.getByRole('button', { name: /^Transfer/ }));
      }
      await user.click(screen.getByRole('button', { name: /Start (?:fresh set|practice)/ }));
      await waitFor(async () => {
        const [session] = await db.pyq_sessions.toArray();
        expect(session).toBeDefined();
        expect(session.config.bookSlug).toBe('gate-cse');
        expect(session.question_uids.length).toBeGreaterThan(0);
        expect(
          session.question_uids.every((uid) =>
            coreQuestions.some((question) => question.id === uid)
          )
        ).toBe(true);
        expect(session.question_uids).not.toContain(otherQuestion.id);
      });
      expect(
        screen.queryByText('This question belongs to the TIFR catalog.')
      ).not.toBeInTheDocument();
    }
  );
});
