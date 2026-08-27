import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import type { MockTestRow } from '@/types';
import Readiness from '@/pages/Readiness';

const USER = '11111111-1111-4111-8111-111111111111';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    userId: USER,
    status: 'signed_in',
    sandbox: true,
    profile: { timezone: 'Asia/Kolkata', exam_date: '2027-02-07' }
  })
}));

function mockRow(id: string, name: string, score: number, overrides: Partial<MockTestRow> = {}) {
  return {
    id,
    user_id: USER,
    name,
    test_date: '2026-08-20',
    total_marks: score,
    max_marks: 100,
    total_questions: 65,
    correct: 40,
    wrong: 10,
    skipped: 15,
    duration_min: 180,
    subject_scores: [],
    mistakes: [],
    planner_date: null,
    planner_block_id: null,
    created_at: '2026-08-20T06:00:00.000Z',
    updated_at: '2026-08-20T09:00:00.000Z',
    source_kind: 'manual' as const,
    source_pyq_session_id: null,
    paper_scope: 'full_length' as const,
    freshness: 'unseen' as const,
    timed: true,
    closed_book: true,
    single_sitting: true,
    evidence_status: 'qualified' as const,
    evidence_reasons: [],
    scoring_coverage_pct: 100,
    sync_status: 'synced' as const,
    ...overrides
  };
}

describe('readiness mock evidence gate', () => {
  beforeEach(async () => {
    localStorage.clear();
    await Promise.all([
      db.mock_tests.clear(),
      db.questions.clear(),
      db.reattempts.clear(),
      db.patterns.clear(),
      db.pyq_attempts.clear()
    ]);
  });

  it('uses only qualified full-paper scores in the readiness outcome range', async () => {
    await db.mock_tests.bulkPut([
      mockRow('qualified', 'Qualified paper', 62),
      mockRow('supporting', 'Repeated high score', 99, {
        test_date: '2026-08-22',
        freshness: 'repeated',
        evidence_status: 'supporting'
      }),
      mockRow('excluded', 'Excluded high score', 100, {
        test_date: '2026-08-23',
        evidence_status: 'excluded'
      })
    ]);

    render(
      <MemoryRouter>
        <Readiness />
      </MemoryRouter>
    );

    expect(await screen.findByText('Qualified mock outcomes')).toBeInTheDocument();
    expect(screen.getByText(/Qualified paper · 2026-08-20/)).toBeInTheDocument();
    expect(screen.getByText('62–62%')).toBeInTheDocument();
    expect(screen.queryByText(/Repeated high score/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Excluded high score/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 supporting and 1 excluded record/)).toBeInTheDocument();
    expect(screen.getByText(/no numeric rank estimate is shown/i)).toBeInTheDocument();
  });
});
