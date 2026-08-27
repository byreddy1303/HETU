import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import Mocks from '@/pages/Mocks';

const USER = '11111111-1111-4111-8111-111111111111';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: USER, status: 'signed_in', sandbox: true })
}));

describe('mock log UI', () => {
  beforeEach(async () => {
    await db.mock_tests.clear();
  });

  it('rejects inconsistent totals, then saves and deletes a valid mock', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/mocks?new=1&date=2026-08-10']}>
        <Mocks />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Mock name'), 'Full length 04');
    await user.type(screen.getByLabelText('Score'), '54.5');
    await user.type(screen.getByLabelText('Correct'), '40');
    await user.type(screen.getByLabelText('Wrong'), '10');
    await user.type(screen.getByLabelText('Skipped'), '10');
    await user.type(screen.getByLabelText('Mistake 1'), 'Spent too long on aptitude.');
    await user.click(screen.getByRole('button', { name: 'Save mock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must add up to total questions/i);

    await user.clear(screen.getByLabelText('Skipped'));
    await user.type(screen.getByLabelText('Skipped'), '15');
    await user.click(screen.getByRole('button', { name: 'Save mock' }));

    expect(await screen.findByText('Full length 04')).toBeInTheDocument();
    await waitFor(async () => {
      const rows = await db.mock_tests.where('user_id').equals(USER).toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        total_marks: 54.5,
        correct: 40,
        wrong: 10,
        skipped: 15,
        mistakes: ['Spent too long on aptitude.']
      });
    });

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(async () => expect(await db.mock_tests.count()).toBe(0));
    expect(await screen.findByText('No mocks recorded')).toBeInTheDocument();
  });

  it('records a manual mock as qualified only after every evidence condition is confirmed', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/mocks?new=1&date=2026-08-18']}>
        <Mocks />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Mock name'), 'External full paper 07');
    await user.type(screen.getByLabelText('Score'), '61.33');
    await user.type(screen.getByLabelText('Correct'), '41');
    await user.type(screen.getByLabelText('Wrong'), '9');
    await user.type(screen.getByLabelText('Skipped'), '15');
    await user.selectOptions(screen.getByLabelText('Paper scope'), 'full_length');
    await user.selectOptions(screen.getByLabelText('Paper freshness'), 'unseen');
    await user.selectOptions(screen.getByLabelText('Timed conditions'), 'yes');
    await user.selectOptions(screen.getByLabelText('Closed book'), 'yes');
    await user.selectOptions(screen.getByLabelText('Single sitting'), 'yes');
    await user.type(screen.getByLabelText('Exact scoring coverage (%)'), '100');

    expect(screen.getByText('This record will be qualified evidence')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save mock' }));

    expect(await screen.findByText('External full paper 07')).toBeInTheDocument();
    await waitFor(async () => {
      const [saved] = await db.mock_tests.where('user_id').equals(USER).toArray();
      expect(saved).toMatchObject({
        source_kind: 'manual',
        paper_scope: 'full_length',
        freshness: 'unseen',
        timed: true,
        closed_book: true,
        single_sitting: true,
        evidence_status: 'qualified',
        evidence_reasons: [],
        scoring_coverage_pct: 100
      });
    });
  });

  it('keeps linked PYQ evidence immutable and routes back to its source report', async () => {
    const sourceSessionId = '22222222-2222-4222-8222-222222222222';
    await db.mock_tests.put({
      id: '33333333-3333-4333-8333-333333333333',
      user_id: USER,
      name: 'GATE CSE 2026 Set 1',
      test_date: '2026-08-20',
      total_marks: 58.67,
      max_marks: 100,
      total_questions: 65,
      correct: 39,
      wrong: 11,
      skipped: 15,
      duration_min: 180,
      subject_scores: [],
      mistakes: [],
      planner_date: null,
      planner_block_id: null,
      created_at: '2026-08-20T06:00:00.000Z',
      updated_at: '2026-08-20T09:00:00.000Z',
      source_kind: 'pyq_exam',
      source_pyq_session_id: sourceSessionId,
      paper_scope: 'full_length',
      freshness: 'unseen',
      timed: true,
      closed_book: true,
      single_sitting: true,
      evidence_status: 'qualified',
      evidence_reasons: [],
      scoring_coverage_pct: 100,
      sync_status: 'synced'
    });

    render(
      <MemoryRouter initialEntries={['/mocks']}>
        <Mocks />
      </MemoryRouter>
    );

    expect(await screen.findByText('GATE CSE 2026 Set 1')).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: /source report/i });
    expect(sourceLink).toHaveAttribute('href', `/session/${sourceSessionId}/review`);
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
