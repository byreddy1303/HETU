import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionEvidenceSummary from '@/components/memory/SessionEvidenceSummary';
import { apiRequest } from '@/lib/fastapi-client';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: 'owner', profile: { timezone: 'Asia/Kolkata' } })
}));
vi.mock('@/lib/fastapi-client', async (original) => ({
  ...(await original<typeof import('@/lib/fastapi-client')>()),
  apiRequest: vi.fn()
}));
const session: PyqSessionRow = {
  id: 'set',
  user_id: 'owner',
  bank_version: 'test',
  config: {
    mode: 'practice',
    subjectSlug: 'algorithms',
    fromYear: 2020,
    toYear: 2026,
    type: 'all',
    order: 'unseen',
    count: '15'
  },
  question_uids: Array.from({ length: 15 }, (_, i) => `q${i}`),
  completed_question_uids: [],
  current_index: 15,
  completed_count: 6,
  elapsed_sec: 500,
  status: 'completed',
  current_question_uid: null,
  current_question_started_at: null,
  started_at: '2026-10-17T09:00:00Z',
  updated_at: '2026-10-17T10:00:00Z',
  completed_at: '2026-10-17T10:00:00Z'
};
const attempts = Array.from({ length: 6 }, (_, i): PyqAttemptRow => ({
  id: `a${i}`,
  user_id: 'owner',
  pyq_session_id: 'set',
  question_uid: `q${i}`,
  subject: 'Algorithms',
  year: 2026,
  attempt_number: 1,
  selected_answer: 'A',
  correct_answer: 'B',
  capture_version: 3,
  question_snapshot: null,
  answer_status: 'available',
  screenshot_url: null,
  mark_decision: 'MARK',
  mark_correct: i < 2,
  confidence: 'high',
  question_started_at: '2026-10-17T09:00:00Z',
  time_spent_ms: 40000,
  time_spent_sec: 40,
  bank_version: 'test',
  attempted_at: '2026-10-17T09:01:00Z',
  question_type: 'MSQ',
  question_marks: 1,
  score_thirds: i < 2 ? 3 : 0,
  scoring_status: 'scored',
  scoring_version: 1
}));
const mount = () =>
  render(
    <MemoryRouter>
      <SessionEvidenceSummary session={session} attempts={attempts} onSelectAttempt={vi.fn()} />
    </MemoryRouter>
  );

describe('session evidence and follow-up UI', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(apiRequest).mockReset().mockResolvedValue({ items: [], total: 0, has_more: false });
  });
  it('shows partial submission coverage without counting missing questions as skips', async () => {
    mount();
    expect(screen.getByText('6 submitted of 15 selected.')).toBeInTheDocument();
    expect(screen.getByText(/9 have no submitted answer/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '6 submitted; 9 without a submitted answer' })
    ).toBeInTheDocument();
    expect(screen.getByText(/This was practice mode/)).toBeInTheDocument();
    expect(screen.getByText('Explicit skips').nextElementSibling).toHaveTextContent('0');
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
  });
  it('saves one stable repair and reopens it on a later retry instead of duplicating work', async () => {
    const records = new Map();
    let writes = 0;
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (String(path).includes('/entries?')) return { items: [], total: 0, has_more: false };
      const id = String(path).split('/').at(-1)!;
      if (options?.method === 'PUT') {
        writes++;
        const entry = { ...JSON.parse(String(options.body)), id, version: 1 };
        records.set(id, entry);
        return entry;
      }
      if (records.has(id)) return { entry: records.get(id), history: [] };
      throw Object.assign(new Error('Memory entry not found'), { status: 404 });
    });
    const first = mount();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Save repair: Complete the questions without submitted results'
      })
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Open focused repair' })).toBeInTheDocument()
    );
    expect([...records.values()][0].data.question_uids).toEqual(session.question_uids.slice(6));
    expect([...records.values()][0].data.exposure_note).toContain('does not prove');
    first.unmount();
    mount();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Save repair: Complete the questions without submitted results'
      })
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Open focused repair' })).toBeInTheDocument()
    );
    expect(writes).toBe(1);
  });
});
