import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiRequest } from '@/lib/fastapi-client';
import { newMemoryEntry, type StudyMemoryEntry } from '@/lib/study-memory';
import PostExamReview from '@/components/memory/PostExamReview';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ userId: 'learner' }) }));
vi.mock('@/lib/fastapi-client', async (original) => ({ ...await original<typeof import('@/lib/fastapi-client')>(), apiRequest: vi.fn() }));
vi.mock('@/components/memory/ThinkingReviewEditor', () => ({ default: ({ revealState }: { revealState: string }) => <p>Capture condition: {revealState}</p> }));
vi.mock('@/components/memory/SessionEvidenceSummary', () => ({ default: () => null }));

const records = new Map<string, StudyMemoryEntry>();
const attempt: PyqAttemptRow = { id: 'a1', user_id: 'learner', pyq_session_id: 'exam', question_uid: 'q1', subject: 'Algorithms', year: 2024,
  attempt_number: 1, selected_answer: 'A', correct_answer: 'B', capture_version: 3, question_snapshot: null, answer_status: 'available', screenshot_url: null,
  mark_decision: 'MARK', mark_correct: false, confidence: 'high', question_started_at: null, time_spent_ms: 60000, time_spent_sec: 60, bank_version: 'bank', attempted_at: '2026-10-15T10:00:00Z' };
const session = { id: 'exam' } as PyqSessionRow;
const mount = (visible = false) => render(<MemoryRouter><PostExamReview session={session} attempts={[attempt]} answersAlreadyVisible={visible} /></MemoryRouter>);

describe('durable exam answer exposure', () => {
  beforeEach(() => {
    cleanup(); records.clear();
    vi.mocked(apiRequest).mockReset().mockImplementation(async (path, options) => {
      const id = String(path).split('/').at(-1)!;
      if (options?.method === 'PUT') {
        const payload = JSON.parse(String(options.body));
        const entry = { ...newMemoryEntry('exam_review', id, 'Exam'), ...payload, id, user_id: 'learner', version: (records.get(id)?.version || 0) + 1 } as StudyMemoryEntry;
        records.set(id, entry); return entry;
      }
      if (!records.has(id)) throw Object.assign(new Error('Memory entry not found'), { status: 404 });
      return { entry: records.get(id), history: [] };
    });
  });

  it('keeps a revealed key and the after-answer condition after reopening', async () => {
    const view = mount();
    const reveal = screen.getByRole('button', { name: 'Reveal recorded answer key' });
    await waitFor(() => expect(reveal).toBeEnabled());
    fireEvent.click(reveal);
    await waitFor(() => expect([...records.values()][0]?.data.revealed_attempt_ids).toEqual(['a1']));
    view.unmount(); mount();
    await waitFor(() => expect(screen.getByText('Capture condition: after')).toBeInTheDocument());
    expect(screen.getByText(/Recorded key:/)).toHaveTextContent('B');
  });

  it('records exposure when the full answer report has already been opened', async () => {
    mount(true);
    await waitFor(() => expect([...records.values()][0]?.data.revealed_attempt_ids).toEqual(['a1']));
    expect([...records.values()][0].data.answer_report_seen_at).toBeTruthy();
  });
});
