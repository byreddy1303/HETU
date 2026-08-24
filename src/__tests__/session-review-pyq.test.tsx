import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '@/lib/db';
import {
  checkpointPyqExamSession,
  createPyqExamConfig,
  finalizePyqExam,
  setPyqExamResponse
} from '@/lib/pyq-exam';
import type { PyqQuestion } from '@/lib/pyq';
import { createPyqSessionRow, pyqPracticeSessionRow } from '@/lib/pyq-session';
import SessionReview from '@/pages/SessionReview';

const USER = '00000000-0000-4000-8000-000000000001';
const START_MS = Date.parse('2026-08-24T04:30:00.000Z');

const questions: PyqQuestion[] = [
  {
    id: 'session-review-q1',
    year: 2026,
    set: 1,
    number: '1',
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    topic: 'Shortest Paths',
    topicSlug: 'shortest-paths',
    subtopics: ['Dijkstra'],
    marks: 2,
    type: 'MCQ',
    answer: 'B',
    tolerance: null,
    answerStatus: 'available',
    html: '<p>The first frozen exam question.</p>',
    sourceUrl: 'https://gateoverflow.in/review/1',
    answerSource: null
  },
  {
    id: 'session-review-q2',
    year: 2026,
    set: 1,
    number: '2',
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    topic: 'Shortest Paths',
    topicSlug: 'shortest-paths',
    subtopics: ['Bellman-Ford'],
    marks: 1,
    type: 'MCQ',
    answer: 'C',
    tolerance: null,
    answerStatus: 'available',
    html: '<p>The second frozen exam question.</p>',
    sourceUrl: 'https://gateoverflow.in/review/2',
    answerSource: null
  },
  {
    id: 'session-review-q3',
    year: 2026,
    set: 1,
    number: '3',
    paperLabel: 'GATE CSE 2026 Set 1',
    subject: 'Algorithms',
    subjectSlug: 'algorithms',
    topic: 'Shortest Paths',
    topicSlug: 'shortest-paths',
    subtopics: ['Floyd-Warshall'],
    marks: 2,
    type: 'MCQ',
    answer: 'D',
    tolerance: null,
    answerStatus: 'available',
    html: '<p>The third frozen exam question.</p>',
    sourceUrl: 'https://gateoverflow.in/review/3',
    answerSource: null
  }
];

function completedExamFixture() {
  const baseConfig = {
    subjectSlug: 'algorithms',
    topicSlug: 'shortest-paths',
    fromYear: 2026,
    toYear: 2026,
    type: 'all' as const,
    order: 'unseen' as const,
    count: '5' as const,
    history: 'all' as const
  };
  const examConfig = createPyqExamConfig(
    baseConfig,
    questions.map((question) => question.id),
    START_MS
  );
  let session = createPyqSessionRow(
    USER,
    'session-review-test-bank',
    examConfig,
    questions,
    new Date(START_MS).toISOString()
  );
  session = setPyqExamResponse(session, questions[0], 'B', START_MS + 100);
  session = checkpointPyqExamSession(session, questions[1].id, START_MS + 4_000);
  session = setPyqExamResponse(session, questions[1], 'A', START_MS + 4_100);
  session = checkpointPyqExamSession(session, questions[2].id, START_MS + 11_000);
  return finalizePyqExam({
    userId: USER,
    session,
    questions,
    bankVersion: 'session-review-test-bank',
    reason: 'manual',
    nowMs: START_MS + 18_000
  });
}

describe('historical PYQ session review', () => {
  beforeEach(async () => {
    await Promise.all([
      db.pyq_attempts.clear(),
      db.pyq_sessions.clear(),
      db.questions.clear(),
      db.sessions.clear()
    ]);
  });

  it('renders the detailed report from immutable PYQ receipts without Journal rows', async () => {
    const finalized = completedExamFixture();
    const canonical = pyqPracticeSessionRow(finalized.session, 'Algorithms');
    await db.transaction('rw', [db.sessions, db.pyq_sessions, db.pyq_attempts], async () => {
      await db.sessions.put({ ...canonical, sync_status: 'synced' });
      await db.pyq_sessions.put({ ...finalized.session, sync_status: 'synced' });
      await db.pyq_attempts.bulkPut(
        finalized.attempts.map((attempt) => ({ ...attempt, sync_status: 'synced' }))
      );
    });
    expect(await db.questions.count()).toBe(0);
    expect(finalized.attempts.every((attempt) => attempt.capture_version === 3)).toBe(true);

    render(
      <MemoryRouter initialEntries={[`/session/${finalized.session.id}/review`]}>
        <Routes>
          <Route path="/session/:id/review" element={<SessionReview />} />
        </Routes>
      </MemoryRouter>
    );

    const pageHeading = await screen.findByRole('heading', { name: 'Session logged' });
    expect(pageHeading.nextElementSibling).toHaveTextContent('3 submitted · 0 analyzed · 1m');
    expect(screen.getByText('PYQ session report')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Algorithms' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '50% graded accuracy' })).toBeInTheDocument();

    const responseLedger = screen.getByRole('region', { name: 'Response ledger' });
    expect(
      within(responseLedger).getByText('Questions attempted').closest('div')
    ).toHaveTextContent('2');
    expect(within(responseLedger).getByText('Correct attempts').closest('div')).toHaveTextContent(
      '1'
    );
    expect(within(responseLedger).getByText('Incorrect attempts').closest('div')).toHaveTextContent(
      '1'
    );
    expect(
      within(responseLedger).getByText('Left blank / no receipt').closest('div')
    ).toHaveTextContent('1');

    const marksLedger = screen.getByRole('region', { name: 'Marks ledger' });
    expect(within(marksLedger).getByText('Correct marks').closest('div')).toHaveTextContent('+2');
    expect(within(marksLedger).getByText('Penalty marks').closest('div')).toHaveTextContent(
      '−0.33'
    );
    expect(within(marksLedger).getByText('Resultant marks').closest('div')).toHaveTextContent(
      '+1.67'
    );

    const paperLedger = screen.getByRole('region', { name: 'Paper ledger' });
    expect(within(paperLedger).getByText('Total questions').closest('div')).toHaveTextContent('3');
    expect(within(paperLedger).getByText('Total marks').closest('div')).toHaveTextContent('5');
    expect(within(paperLedger).getByText('Exam duration').closest('div')).toHaveTextContent(
      '09:00'
    );
    expect(within(paperLedger).getByText('Time taken').closest('div')).toHaveTextContent('00:18');
    expect(
      screen.getByRole('list', { name: 'Marks by question in question order' })
    ).toBeInTheDocument();

    const firstReceipt = screen.getByText('The first frozen exam question.').closest('details');
    expect(firstReceipt).not.toBeNull();
    expect(within(firstReceipt!).getByText('Your answer').closest('div')).toHaveTextContent('B');
    expect(within(firstReceipt!).getByText('Correct answer').closest('div')).toHaveTextContent('B');

    const secondReceipt = screen.getByText('The second frozen exam question.').closest('details');
    expect(secondReceipt).not.toBeNull();
    expect(within(secondReceipt!).getByText('Your answer').closest('div')).toHaveTextContent('A');
    expect(within(secondReceipt!).getByText('Correct answer').closest('div')).toHaveTextContent(
      'C'
    );

    const skippedReceipt = screen.getByText('The third frozen exam question.').closest('details');
    expect(skippedReceipt).not.toBeNull();
    expect(within(skippedReceipt!).getByText('Your answer').closest('div')).toHaveTextContent(
      'Left blank'
    );
    expect(within(skippedReceipt!).getByText('Correct answer').closest('div')).toHaveTextContent(
      'D'
    );
    expect(
      screen.getByText(
        'Outcome analysis covers 0 of 3 submitted PYQs. The remaining attempt receipts are still preserved in PYQ practice.'
      )
    ).toBeInTheDocument();
  });
});
