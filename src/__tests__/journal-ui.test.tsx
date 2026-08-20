import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { QuestionRow } from '@/types';
import { db } from '@/lib/db';
import Journal from '@/pages/Journal';
import type { PyqQuestion } from '@/lib/pyq';
import {
  advancePyqSessionProgress,
  completePyqSession,
  createPyqAttemptRow,
  createPyqSessionRow,
  pyqJournalQuestionId
} from '@/lib/pyq-session';

const USER = '11111111-1111-4111-8111-111111111111';
const FIRST_PYQ_PHOTO = 'data:image/png;base64,cHlxLWZpcnN0LXBob3Rv';
const SECOND_PYQ_PHOTO = 'data:image/png;base64,cHlxLXNlY29uZC1waG90bw==';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    userId: USER,
    status: 'signed_in',
    sandbox: true,
    profile: { timezone: 'Asia/Kolkata' }
  })
}));

describe('Journal question list', () => {
  beforeEach(async () => {
    await Promise.all([
      db.questions.clear(),
      db.sessions.clear(),
      db.pyq_sessions.clear(),
      db.pyq_attempts.clear()
    ]);
  });

  it('shows standalone imported questions before any filter is selected', async () => {
    const question: QuestionRow = {
      id: 'standalone-imported-question',
      user_id: USER,
      session_id: null,
      subject: 'Computer Organization',
      subtopic: "Amdahl's Law",
      source_year: 2026,
      source_ref: 'GO Classes COA Topic Test 2 · Q10 · MCQ',
      question_text: 'What is the best possible parallel execution time?',
      answer_text: 'Your answer: B\nActual answer: C',
      image_url: '/pyq/images/go-classes-coa-topic-test-2/practice-q10-v2.png',
      time_spent_sec: 102,
      target_time_sec: 120,
      outcome: 'W-C',
      pattern_name: 'Parallel speedup limit',
      trigger_sentence: null,
      root_cause: null,
      mark_decision: 'MARK',
      mark_correct: false,
      created_at: '2026-08-13T06:30:00.000Z'
    };
    await db.questions.put({ ...question, sync_status: 'synced' });

    render(
      <MemoryRouter>
        <Journal />
      </MemoryRouter>
    );

    expect(await screen.findByText('Parallel speedup limit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View photo' })).toBeInTheDocument();
    expect(screen.getByText('1 of 1 entry')).toBeInTheDocument();
  });

  it('shows every receipt and full question detail for a selected PYQ session', async () => {
    const firstQuestion: PyqQuestion = {
      id: 'gate-2025-set1-q12',
      year: 2025,
      set: 1,
      number: '12',
      paperLabel: 'GATE CSE 2025 Set 1',
      subject: 'Operating Systems',
      subjectSlug: 'operating-systems',
      topic: 'Processes',
      topicSlug: 'processes',
      subtopics: ['Process states'],
      marks: 1,
      type: 'MCQ',
      answer: 'B',
      tolerance: null,
      answerStatus: 'available',
      html: `
        <p>Which transition cannot occur directly in a process state model?</p>
        <ol type="A">
          <li>Running to ready</li>
          <li>Ready to waiting</li>
          <li>Waiting to ready</li>
          <li>Ready to running</li>
        </ol>
      `,
      sourceUrl: 'https://gateoverflow.in/first-question',
      answerSource: null
    };
    const secondQuestion: PyqQuestion = {
      ...firstQuestion,
      id: 'gate-2024-set2-q31',
      year: 2024,
      set: 2,
      number: '31',
      paperLabel: 'GATE CSE 2024 Set 2',
      topic: 'Deadlocks',
      topicSlug: 'deadlocks',
      subtopics: ['Resource allocation graph'],
      marks: 2,
      answer: 'C',
      html: '<p>Which resource-allocation graph proves that a deadlock exists?</p>',
      sourceUrl: 'https://gateoverflow.in/second-question'
    };
    let session = createPyqSessionRow(
      USER,
      'journal-test-bank-v2',
      {
        subjectSlug: 'operating-systems',
        topicSlug: 'all',
        fromYear: 2024,
        toYear: 2025,
        type: 'MCQ',
        order: 'newest',
        count: '5'
      },
      [firstQuestion, secondQuestion],
      '2026-08-19T10:00:00.000Z'
    );
    const firstAttempt = createPyqAttemptRow({
      userId: USER,
      session,
      question: firstQuestion,
      selectedAnswer: 'A',
      decision: 'MARK',
      bankVersion: session.bank_version,
      questionStartedAtMs: Date.parse('2026-08-19T10:00:00.000Z'),
      committedAtMs: Date.parse('2026-08-19T10:01:05.000Z'),
      screenshotUrl: FIRST_PYQ_PHOTO
    });
    session = advancePyqSessionProgress(
      session,
      firstQuestion.id,
      1,
      firstAttempt.time_spent_sec,
      firstAttempt.attempted_at
    );
    const secondAttempt = createPyqAttemptRow({
      userId: USER,
      session,
      question: secondQuestion,
      selectedAnswer: null,
      decision: 'SKIP',
      bankVersion: session.bank_version,
      questionStartedAtMs: Date.parse('2026-08-19T10:01:05.000Z'),
      committedAtMs: Date.parse('2026-08-19T10:01:35.000Z'),
      screenshotUrl: SECOND_PYQ_PHOTO
    });
    session = completePyqSession(
      advancePyqSessionProgress(
        session,
        secondQuestion.id,
        2,
        secondAttempt.time_spent_sec,
        secondAttempt.attempted_at
      ),
      '2026-08-19T10:01:35.000Z'
    );
    const analysis: QuestionRow = {
      id: pyqJournalQuestionId(firstAttempt.id),
      user_id: USER,
      session_id: session.id,
      subject: firstQuestion.subject,
      subtopic: firstQuestion.topic,
      source_year: firstQuestion.year,
      source_ref: `${firstQuestion.paperLabel} · Q${firstQuestion.number} · MCQ`,
      question_text: 'Which transition cannot occur directly in a process state model?',
      answer_text: 'Answer key: B',
      capture_note: 'I confused ready with waiting.',
      image_url: null,
      time_spent_sec: firstAttempt.time_spent_sec,
      target_time_sec: 120,
      outcome: 'W-C',
      pattern_name: 'Illegal process-state transition',
      trigger_sentence: 'A ready process is waiting only for CPU time.',
      root_cause: 'concept',
      mark_decision: firstAttempt.mark_decision,
      mark_correct: firstAttempt.mark_correct,
      created_at: firstAttempt.attempted_at
    };

    await Promise.all([
      db.pyq_sessions.put({ ...session, sync_status: 'synced' }),
      db.pyq_attempts.bulkPut([
        { ...firstAttempt, sync_status: 'synced' },
        { ...secondAttempt, sync_status: 'synced' }
      ]),
      db.questions.put({ ...analysis, sync_status: 'synced' })
    ]);

    render(
      <MemoryRouter initialEntries={[`/journal?session=${session.id}`]}>
        <Journal />
      </MemoryRouter>
    );

    expect(await screen.findByText('2 submissions in this PYQ session')).toBeInTheDocument();
    const first = screen.getByRole('article', { name: 'PYQ question 1 details' });
    expect(
      within(first).getByText('Which transition cannot occur directly in a process state model?')
    ).toBeInTheDocument();
    expect(within(first).getByText('Incorrect')).toBeInTheDocument();
    expect(within(first).getByText('A')).toBeInTheDocument();
    expect(within(first).getByText('B')).toBeInTheDocument();
    expect(
      within(first).getByRole('img', {
        name: 'Question photo for GATE CSE 2025 Set 1 Q12'
      })
    ).toHaveAttribute('src', FIRST_PYQ_PHOTO);
    expect(
      within(first).getByRole('button', {
        name: 'Open question photo for GATE CSE 2025 Set 1 Q12'
      })
    ).toBeInTheDocument();
    const analysisRegion = within(first).getByRole('region', {
      name: 'Journal analysis for question 1'
    });
    expect(
      within(analysisRegion).getByText('Illegal process-state transition')
    ).toBeInTheDocument();
    expect(within(analysisRegion).getByText('Concept')).toBeInTheDocument();
    expect(within(analysisRegion).getByText('I confused ready with waiting.')).toBeInTheDocument();

    const second = screen.getByRole('article', { name: 'PYQ question 2 details' });
    expect(
      within(second).getByText('Which resource-allocation graph proves that a deadlock exists?')
    ).toBeInTheDocument();
    expect(within(second).getByText('Skipped')).toBeInTheDocument();
    expect(within(second).getByText('Left blank')).toBeInTheDocument();
    expect(within(second).getByText('C')).toBeInTheDocument();
    expect(
      within(second).getByRole('img', {
        name: 'Question photo for GATE CSE 2024 Set 2 Q31'
      })
    ).toHaveAttribute('src', SECOND_PYQ_PHOTO);
    expect(screen.queryByText('No entries match')).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: '19 Aug 26 · PYQ · Operating Systems' })
    ).toBeInTheDocument();
  });
});
