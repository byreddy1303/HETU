import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PyqSessionHistory from '@/components/pyq/PyqSessionHistory';
import type { PyqSessionRow } from '@/types';

function session(index: number, overrides: Partial<PyqSessionRow> = {}): PyqSessionRow {
  const timestamp = `2026-08-${String(30 - index).padStart(2, '0')}T10:00:00.000Z`;
  return {
    id: `session-${index}`,
    user_id: 'user-1',
    bank_version: 'bank-v1',
    config: {
      bookSlug: 'gate-cse',
      subjectSlug: index === 11 ? 'databases' : 'algorithms',
      topicSlug: 'all',
      fromYear: 1990,
      toYear: 2026,
      type: 'all',
      order: 'random',
      count: '10',
      history: 'all',
      mode: index === 11 ? 'exam' : 'practice',
      recommendationPreset: index === 11 ? 'diagnose' : 'learn',
      savedPrescriptionName: index === 11 ? 'DB benchmark' : undefined
    },
    question_uids: [`q-${index}`],
    completed_question_uids: [`q-${index}`],
    current_index: 1,
    completed_count: 1,
    elapsed_sec: 90,
    status: 'completed',
    current_question_uid: null,
    current_question_started_at: null,
    started_at: timestamp,
    updated_at: timestamp,
    completed_at: timestamp,
    ...overrides
  };
}

describe('complete PYQ session history', () => {
  it('pages the full ledger and searches fields beyond the initial page', async () => {
    const user = userEvent.setup();
    const sessions = Array.from({ length: 12 }, (_, index) => session(index));
    const onReview = vi.fn();
    render(
      <PyqSessionHistory
        sessions={sessions}
        attempts={[]}
        subjectLabels={{ algorithms: 'Algorithms', databases: 'Databases' }}
        onReview={onReview}
      />
    );

    expect(screen.getAllByRole('button', { name: /View report/i })).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getAllByRole('button', { name: /View report/i })).toHaveLength(12);

    await user.type(screen.getByLabelText('Search PYQ session history'), 'DB benchmark');
    expect(screen.getByText(/DB benchmark · Databases/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /View report/i })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /View report/i }));
    expect(onReview).toHaveBeenCalledWith(sessions[11]);
  });

  it('filters by mode and prescription without hiding the total ledger count', async () => {
    const user = userEvent.setup();
    render(
      <PyqSessionHistory
        sessions={[session(0), session(11)]}
        attempts={[]}
        subjectLabels={{ algorithms: 'Algorithms', databases: 'Databases' }}
        onReview={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText('Filter PYQ sessions by mode'), 'exam');
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/DB benchmark · Databases/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter PYQ sessions by preset'), 'diagnose');
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });
});
