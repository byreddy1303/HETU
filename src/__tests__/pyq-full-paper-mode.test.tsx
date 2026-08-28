import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { normalizePyqManifest, type PyqManifest, type PyqQuestion } from '@/lib/pyq';
import Pyq from '@/pages/Pyq';

const USER = '00000000-0000-4000-8000-000000000001';

const questions: PyqQuestion[] = Array.from({ length: 65 }, (_, index) => ({
  id: `full-paper-ui-${index + 1}`,
  bookSlug: 'gate-cse',
  year: 2026,
  set: 1,
  number: String(index + 1),
  paperLabel: 'GATE CSE 2026 Set 1',
  subject: 'Operating Systems',
  subjectSlug: 'operating-systems',
  topic: 'Processes',
  topicSlug: 'processes',
  subtopics: ['Processes'],
  marks: index < 30 ? 1 : 2,
  type: 'MCQ',
  answer: 'B',
  tolerance: null,
  answerStatus: 'available',
  html: `<p>Full paper UI question ${index + 1}</p>`,
  sourceUrl: `https://gateoverflow.in/full-paper-ui/${index + 1}`,
  answerSource: null
}));

const manifest: PyqManifest = normalizePyqManifest({
  bankVersion: 'full-paper-ui-bank',
  generatedAt: '2026-08-27T00:00:00.000Z',
  source: 'test',
  sourceUrl: 'https://gateoverflow.in',
  firstYear: 2026,
  lastYear: 2026,
  questionCount: 65,
  imageCount: 0,
  answerStatuses: { available: 65, ambiguous: 0, 'marks-to-all': 0, unsupported: 0 },
  years: [{ year: 2026, count: 65 }],
  benchmarkPapers: [
    {
      id: 'gate-cse-2026-set-1',
      bookSlug: 'gate-cse',
      paperLabel: 'GATE CSE 2026 Set 1',
      year: 2026,
      set: 1,
      questionCount: 65,
      maxMarks: 100,
      questionUids: questions.map((question) => question.id)
    }
  ],
  subjects: [
    {
      slug: 'operating-systems',
      label: 'Operating Systems',
      count: 65,
      file: '/pyq/operating-systems.json',
      topics: [{ slug: 'processes', label: 'Processes', count: 65 }]
    }
  ]
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed_in',
    userId: USER,
    sandbox: true,
    user: null,
    profile: { timezone: 'Asia/Kolkata' }
  })
}));

function ReviewDestination() {
  const { id } = useParams();
  return <h1>Full paper report {id}</h1>;
}

describe('authentic PYQ full-paper mode', () => {
  beforeEach(async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'https://hetu.test');
      if (url.pathname === '/pyq/manifest.json') return Response.json(manifest);
      if (url.pathname === '/pyq/operating-systems.json') {
        return Response.json({
          bankVersion: manifest.bankVersion,
          subject: 'Operating Systems',
          questions
        });
      }
      return new Response(null, { status: 404 });
    });
    await Promise.all([
      db.mock_tests.clear(),
      db.pyq_attempts.clear(),
      db.pyq_sessions.clear(),
      db.questions.clear(),
      db.sessions.clear()
    ]);
  });

  it('starts the exact 65Q/100M/180m paper and writes a linked evidence row at submit', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/pyq']}>
        <Routes>
          <Route path="/pyq" element={<Pyq />} />
          <Route path="/session/:id/review" element={<ReviewDestination />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /^Exam mode/i }));
    await user.click(screen.getByRole('button', { name: /Official full paper/i }));

    expect(screen.getByRole('heading', { name: 'Open one sealed benchmark' })).toBeInTheDocument();
    expect(screen.getByText('Sealed · unseen')).toBeInTheDocument();
    expect(screen.getByText('65', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('100', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('180', { selector: 'p' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Closed-book conditions/i }));
    expect(screen.getByText('Eligible to become qualified evidence')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start 3-hour full paper' }));

    expect(
      await screen.findByRole('region', { name: 'Official full paper workspace' })
    ).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('3:00:00');
    const [startedSession] = await db.pyq_sessions.toArray();
    expect(startedSession).toMatchObject({
      config: {
        mode: 'exam',
        examKind: 'full-paper',
        benchmarkPaperId: 'gate-cse-2026-set-1',
        examState: {
          duration_sec: 10_800,
          closed_book_confirmed: true,
          prior_exposure_question_uids: []
        }
      },
      question_uids: questions.map((question) => question.id)
    });

    await user.click(screen.getAllByRole('button', { name: 'Submit exam' })[0]);
    const confirmation = await screen.findByRole('dialog', { name: 'Submit timed exam?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Submit exam' }));

    expect(
      await screen.findByRole('heading', { name: `Full paper report ${startedSession.id}` })
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await db.pyq_attempts.where('pyq_session_id').equals(startedSession.id).count()).toBe(
        65
      );
      const [mock] = await db.mock_tests.where('user_id').equals(USER).toArray();
      expect(mock).toMatchObject({
        source_kind: 'pyq_exam',
        source_pyq_session_id: startedSession.id,
        total_questions: 65,
        max_marks: 100,
        paper_scope: 'full_length',
        freshness: 'unseen',
        timed: true,
        closed_book: true,
        single_sitting: true,
        evidence_status: 'supporting',
        scoring_coverage_pct: 100
      });
      expect(mock.evidence_reasons).toEqual(
        expect.arrayContaining(['incomplete-visit-coverage', 'low-active-time'])
      );
    });
  });
});
