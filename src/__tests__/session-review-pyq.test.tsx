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
import {
  createPyqAttemptRow,
  createPyqSessionRow,
  endPausedPyqPracticeSession,
  pyqPracticeSessionRow
} from '@/lib/pyq-session';
import SessionReview from '@/pages/SessionReview';
import type { PyqPracticeDraft, PyqSessionConfig, PyqSessionRow } from '@/types';

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

  it('shows saved unsubmitted practice drafts after reopening the completed report', async () => {
    const config: PyqSessionConfig = {
      subjectSlug: 'algorithms',
      topicSlug: 'shortest-paths',
      fromYear: 2026,
      toYear: 2026,
      type: 'all',
      order: 'unseen',
      count: '5'
    };
    const initialSession = createPyqSessionRow(
      USER,
      'session-review-test-bank',
      config,
      questions.slice(0, 2),
      new Date(START_MS).toISOString()
    );
    const skipped = createPyqAttemptRow({
      userId: USER,
      session: { ...initialSession, current_index: 1, current_question_uid: questions[1].id },
      question: questions[1],
      selectedAnswer: null,
      decision: 'SKIP',
      bankVersion: 'session-review-test-bank',
      questionStartedAtMs: START_MS,
      committedAtMs: START_MS + 2_000,
      screenshotUrl: null
    });
    const savedDraft: PyqPracticeDraft = {
      question_uid: questions[0].id,
      selected_answer: 'B',
      mark_decision: 'MARK',
      confidence: 'low',
      elapsed_ms: 6_000,
      first_started_at: new Date(START_MS).toISOString()
    };
    const retryDraft: PyqPracticeDraft = {
      question_uid: questions[1].id,
      selected_answer: 'C',
      mark_decision: 'FIFTY_FIFTY',
      confidence: 'medium',
      elapsed_ms: 4_000,
      first_started_at: new Date(START_MS + 6_000).toISOString()
    };
    const pausedSession: PyqSessionRow = {
      ...initialSession,
      config: {
        ...config,
        practiceDraft: savedDraft,
        practiceDrafts: {
          [savedDraft.question_uid]: savedDraft,
          [retryDraft.question_uid]: retryDraft
        }
      },
      status: 'paused',
      elapsed_sec: 2,
      current_question_uid: null,
      current_question_started_at: null,
      completed_count: 1,
      completed_question_uids: [questions[1].id]
    };
    const session = endPausedPyqPracticeSession(
      pausedSession,
      new Date(START_MS + 60_000).toISOString()
    );
    await db.transaction('rw', [db.sessions, db.pyq_sessions, db.pyq_attempts], async () => {
      await db.sessions.put({
        ...pyqPracticeSessionRow(session, 'Algorithms'),
        sync_status: 'synced'
      });
      await db.pyq_sessions.put({ ...session, sync_status: 'synced' });
      await db.pyq_attempts.put({ ...skipped, sync_status: 'synced' });
    });

    render(
      <MemoryRouter initialEntries={[`/session/${session.id}/review`]}>
        <Routes>
          <Route path="/session/:id/review" element={<SessionReview />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Practice session complete' });
    expect(screen.getByRole('img', { name: 'Accuracy unavailable' })).toBeInTheDocument();
    const draftCards = screen
      .getAllByText('Saved draft answer · not submitted')
      .map((label) => label.closest('details')!);
    expect(draftCards).toHaveLength(2);
    const [draftOnly, retriedSkip] = draftCards;
    expect(
      within(draftOnly).getByText('Saved draft answer · not submitted').closest('dl')
    ).toHaveTextContent('B');
    expect(within(draftOnly).getByText('Your answer').closest('div')).toHaveTextContent(
      'Not submitted'
    );
    expect(within(draftOnly).getByText('Correct answer').closest('div')).toHaveTextContent(
      'No submitted receipt'
    );
    expect(within(draftOnly).getByText('Outcome').closest('div')).toHaveTextContent(
      'Not submitted'
    );
    expect(within(draftOnly).getByText('Score').closest('div')).toHaveTextContent('Score excluded');
    expect(within(draftOnly).getByText('Time').closest('div')).toHaveTextContent('00:06');
    expect(within(draftOnly).getByText('Low confidence')).toBeInTheDocument();
    expect(within(draftOnly).getByText('Frozen question unavailable')).toBeInTheDocument();

    expect(
      within(retriedSkip).getByText('Saved draft answer · not submitted').closest('dl')
    ).toHaveTextContent('C');
    expect(within(retriedSkip).getByText('Your answer').closest('div')).toHaveTextContent(
      'Left blank'
    );
    expect(within(retriedSkip).getByText('Outcome').closest('div')).toHaveTextContent('Left blank');
    expect(within(retriedSkip).getByText('Time').closest('div')).toHaveTextContent('00:06');
    expect(within(retriedSkip).getByText('Medium confidence')).toBeInTheDocument();
    const paperLedger = screen.getByRole('region', { name: 'Paper ledger' });
    expect(within(paperLedger).getByText('Time taken').closest('div')).toHaveTextContent('00:12');
    expect(await db.pyq_attempts.count()).toBe(1);
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

    const pageHeading = await screen.findByRole('heading', { name: 'Exam submitted' });
    expect(pageHeading.nextElementSibling).toHaveTextContent('3 submitted · 0 analyzed · 1m');
    expect(screen.getByText('PYQ session report')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Algorithms' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '50% graded accuracy' })).toBeInTheDocument();
    const improvementInsights = screen.getByRole('region', { name: 'Improvement insights' });
    expect(within(improvementInsights).getByText('Median pace:').parentElement).toHaveTextContent(
      '7s per timed question'
    );
    expect(within(improvementInsights).getByText('Accuracy:').parentElement).toHaveTextContent(
      '50% correct (1 question), 50% incorrect (1 question) across 2 graded attempts'
    );

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

    expect(screen.getByRole('button', { name: 'Back to PYQ setup' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument();
  });
});
