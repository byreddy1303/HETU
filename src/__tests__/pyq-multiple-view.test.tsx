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
  html: '<p>Choose the true proposition.</p><ol type="A"><li>A proposition is always false.</li><li>A proposition or its negation is true.</li><li>A proposition and its negation are true.</li><li>No proposition has a truth value.</li></ol>',
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
    html: '<p>Select all valid implications.</p><ol style="list-style-type: upper-alpha"><li>A conjunction implies either operand.</li><li>A disjunction implies both operands.</li><li>A proposition implies its double negation.</li><li>A proposition implies its negation.</li></ol>'
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

function questionCard(number: number) {
  return within(screen.getByRole('article', { name: `Question ${number}` }));
}

function option(number: number, letter: string) {
  return questionCard(number).getByRole('button', { name: letter });
}

async function commitWithHighConfidence(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
  await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
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
      const stem = new DOMParser().parseFromString(question.html, 'text/html').querySelector('p')!;
      expect(screen.getByText(stem.textContent!)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'Commit & reveal key' })).toHaveLength(1);
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
    await user.click(option(1, 'B'));
    await user.click(screen.getByRole('button', { name: 'One question' }));
    await waitFor(() =>
      expect(screen.queryByText('Select all valid implications.')).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Multiple questions' }));
    expect(await screen.findByText('Select all valid implications.')).toBeInTheDocument();
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(async () => {
      const [session] = await db.pyq_sessions.toArray();
      expect(session.config.practiceView).toBe('multiple');
    });
    expect(usePyqPreferencesStore.getState().lastConfig?.practiceView).toBe('multiple');
  });

  it('selects option content directly on inactive cards and asks confidence after the answer', async () => {
    const user = userEvent.setup();
    renderPractice();
    await startMultiple(user);
    expect(
      screen.queryByRole('group', { name: 'How confident do you feel?' })
    ).not.toBeInTheDocument();
    expect(questionCard(1).getByRole('button', { name: 'Commit & reveal key' })).toBeDisabled();
    expect(questionCard(3).queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(questionCard(3).getByRole('button', { name: 'Work on question 3' })).toBeEnabled();

    await user.click(questionCard(2).getByText('A conjunction implies either operand.'));
    expect(
      await questionCard(2).findByRole('button', { name: 'Commit & reveal key' })
    ).toBeDisabled();
    expect(option(2, 'A')).toHaveAttribute('aria-pressed', 'true');
    expect(
      questionCard(2).getByRole('group', { name: 'How confident do you feel?' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Answered: committed' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await user.click(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' }));
    expect(questionCard(2).getByRole('button', { name: 'Commit & reveal key' })).toBeEnabled();
    await user.click(questionCard(2).getByText('A proposition implies its double negation.'));
    expect(option(2, 'A')).toHaveAttribute('aria-pressed', 'true');
    expect(option(2, 'C')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(questionCard(2).getByRole('button', { name: 'Commit & reveal key' })).toBeDisabled();
    await user.click(option(2, 'A'));
    expect(option(2, 'A')).toHaveAttribute('aria-pressed', 'false');
    expect(option(2, 'C')).toHaveAttribute('aria-pressed', 'true');

    await user.click(questionCard(1).getByText('A proposition or its negation is true.'));
    expect(
      await questionCard(1).findByRole('button', { name: 'Commit & reveal key' })
    ).toBeDisabled();
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Answered: committed' }));
    await user.click(questionCard(1).getByText('A proposition is always false.'));
    expect(option(1, 'A')).toHaveAttribute('aria-pressed', 'true');
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Answered: committed' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(questionCard(1).getByRole('button', { name: 'Commit & reveal key' })).toBeDisabled();

    await workOnQuestion(user, 2);
    expect(option(2, 'C')).toHaveAttribute('aria-pressed', 'true');
    await user.click(option(2, 'C'));
    expect(
      screen.queryByRole('group', { name: 'How confident do you feel?' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left blank: skipped' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Commit & reveal key' })).toBeDisabled();
    expect(await db.pyq_attempts.count()).toBe(0);
  });

  it('keeps blank skip available and permits retry while committed choices stay locked', async () => {
    const user = userEvent.setup();
    renderPractice();
    await startMultiple(user);
    expect(
      screen.queryByRole('group', { name: 'How confident do you feel?' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Left blank: skipped' }));
    await user.click(screen.getByRole('button', { name: 'Commit & reveal key' }));
    const skippedReceipt = await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    expect(
      within(skippedReceipt).getByText('Left blank', { exact: true, selector: 'p' })
    ).toBeInTheDocument();
    await user.click(option(2, 'A'));
    expect(
      await questionCard(2).findByRole('button', { name: 'Commit & reveal key' })
    ).toBeDisabled();
    expect(option(1, 'B')).toBeEnabled();
    await user.click(option(1, 'B'));
    expect(
      await questionCard(1).findByRole('button', { name: 'Commit & reveal key' })
    ).toBeDisabled();
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Previously skipped/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Answered: committed' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await commitWithHighConfidence(user);
    expect(
      within(await screen.findByRole('region', { name: 'PYQ attempt receipt' })).getByText(
        'Correct',
        { exact: true }
      )
    ).toBeInTheDocument();
    expect(option(1, 'A')).toBeDisabled();
    expect(option(1, 'B')).toBeDisabled();
    await user.click(option(2, 'C'));
    await questionCard(2).findByRole('button', { name: 'Commit & reveal key' });
    expect(option(2, 'A')).toHaveAttribute('aria-pressed', 'true');
    expect(option(2, 'C')).toHaveAttribute('aria-pressed', 'true');
    expect(option(1, 'A')).toBeDisabled();
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
    await user.click(option(1, 'A'));
    expect(
      questionCard(2).getByRole('button', { name: 'Commit & reveal key' })
    ).toBeInTheDocument();
    expect(option(1, 'A')).toHaveAttribute('aria-pressed', 'false');
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
  });

  it('restores independent MCQ, MSQ, numeric, and confidence drafts after jumping and pausing', async () => {
    const user = userEvent.setup();
    const mounted = renderPractice();
    await startMultiple(user);
    await user.click(option(1, 'B'));
    await user.click(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' }));
    await workOnQuestion(user, 2);
    await user.click(option(2, 'A'));
    await user.click(option(2, 'C'));
    await workOnQuestion(user, 3);
    await user.type(screen.getByRole('spinbutton', { name: 'Your numeric answer' }), '12');
    await workOnQuestion(user, 1);
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
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
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guessed 50/50: uncertain' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await workOnQuestion(user, 2);
    expect(option(2, 'A')).toHaveAttribute('aria-pressed', 'true');
    expect(option(2, 'C')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Answered: committed' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Commit & reveal key' })).toBeDisabled();
    const [resumed] = await db.pyq_sessions.toArray();
    expect(resumed.config.practiceDrafts?.[coreQuestions[1].id]).toMatchObject({
      selected_answer: ['A', 'C'],
      confidence: null,
      mark_decision: null
    });
    await workOnQuestion(user, 3);
    expect(screen.getByRole('spinbutton', { name: 'Your numeric answer' })).toHaveValue(12);
    expect(screen.getByRole('button', { name: 'Answered: committed' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Commit & reveal key' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guessed: uncertain' }));
    expect(screen.getByRole('button', { name: 'Commit & reveal key' })).toBeEnabled();
    await user.type(screen.getByRole('spinbutton', { name: 'Your numeric answer' }), '3');
    expect(screen.getByRole('button', { name: 'Guessed: uncertain' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Commit & reveal key' })).toBeDisabled();
    await user.clear(screen.getByRole('spinbutton', { name: 'Your numeric answer' }));
    expect(
      screen.queryByRole('group', { name: 'How confident do you feel?' })
    ).not.toBeInTheDocument();
    expect(await db.pyq_attempts.count()).toBe(0);
  });

  it('keeps the set open after answering the last question first and grades each question independently', async () => {
    const user = userEvent.setup();
    renderPractice();
    await startMultiple(user);
    await workOnQuestion(user, 3);
    await user.type(screen.getByRole('spinbutton', { name: 'Your numeric answer' }), '12');
    await commitWithHighConfidence(user);
    const receipt = await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    expect(within(receipt).getByText('Correct', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish set' })).not.toBeInTheDocument();
    expect((await db.pyq_sessions.toArray())[0]).toMatchObject({
      status: 'active',
      completed_count: 1
    });
    await workOnQuestion(user, 1);
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
    await user.click(option(1, 'B'));
    await commitWithHighConfidence(user);
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    await workOnQuestion(user, 2);
    await user.click(option(2, 'A'));
    await user.click(option(2, 'C'));
    await commitWithHighConfidence(user);
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
    await user.click(option(1, 'B'));
    await commitWithHighConfidence(user);
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    await workOnQuestion(user, 2);
    await user.click(option(2, 'A'));
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
    await user.click(option(1, 'B'));
    await workOnQuestion(user, 2);
    await user.click(option(2, 'A'));
    await user.click(option(2, 'C'));
    await workOnQuestion(user, 3);
    await user.type(screen.getByRole('spinbutton', { name: 'Your numeric answer' }), '12');
    await commitWithHighConfidence(user);
    await screen.findByRole('region', { name: 'PYQ attempt receipt' });
    const [original] = await db.pyq_sessions.toArray();
    expect(original.config.practiceDraft).toBeUndefined();
    expect(original.config.practiceDrafts?.[coreQuestions[0].id].selected_answer).toBe('B');
    expect(original.config.practiceDrafts?.[coreQuestions[1].id].selected_answer).toEqual([
      'A',
      'C'
    ]);
    await user.click(screen.getByRole('button', { name: 'Pause practice' }));
    await user.click(await screen.findByRole('button', { name: 'Resume practice' }));
    await screen.findByRole('article', { name: 'Question 1' });
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
    active.unmount();

    const setup = renderPractice();
    await user.click(await screen.findByRole('button', { name: 'Pause practice' }));
    await screen.findByRole('button', { name: 'Resume practice' });
    const pausedFromSetup = await db.pyq_sessions.get(original.id);
    expect(pausedFromSetup?.status).toBe('paused');
    expect(pausedFromSetup?.config.practiceDrafts?.[coreQuestions[0].id]).toMatchObject({
      selected_answer: 'B',
      mark_decision: null,
      confidence: null
    });
    expect(pausedFromSetup?.config.practiceDrafts?.[coreQuestions[1].id]).toEqual(
      original.config.practiceDrafts?.[coreQuestions[1].id]
    );
    await user.click(screen.getByRole('button', { name: 'Resume practice' }));
    await screen.findByRole('article', { name: 'Question 1' });
    expect(option(1, 'B')).toHaveAttribute('aria-pressed', 'true');
    setup.unmount();

    renderPractice();
    await user.click(await screen.findByRole('button', { name: /Start (?:fresh set|practice)/ }));
    await screen.findByRole('article', { name: 'Question 1' });
    const autoPaused = await db.pyq_sessions.get(original.id);
    expect(autoPaused?.status).toBe('paused');
    expect(autoPaused?.config.practiceDrafts?.[coreQuestions[0].id]).toMatchObject({
      selected_answer: 'B',
      mark_decision: null,
      confidence: null
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
