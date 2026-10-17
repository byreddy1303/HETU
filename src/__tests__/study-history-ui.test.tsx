import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudyHistoryBrowser from '@/components/memory/StudyHistoryBrowser';
import { apiRequest } from '@/lib/fastapi-client';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: 'owner', profile: { timezone: 'Asia/Kolkata' } })
}));
vi.mock('@/lib/fastapi-client', async (original) => ({
  ...(await original<typeof import('@/lib/fastapi-client')>()),
  apiRequest: vi.fn()
}));
const event = {
  id: 'pyq_attempts:a1',
  collection: 'pyq_attempts',
  record_id: 'a1',
  title: 'Graph condition',
  excerpt: 'Question prompt',
  subject: 'Algorithms',
  topic: 'Graphs',
  occurred_at: '2026-10-17T09:00:00Z',
  updated_at: '2026-10-17T09:00:00Z',
  state: 'MARK',
  session_id: 's1',
  attempt_id: 'a1',
  question_uid: 'q1',
  href: '/session/s1/review?attempt=a1'
};
const page = { items: [event], total: 1, offset: 0, limit: 25, has_more: false };
const mount = () =>
  render(
    <MemoryRouter>
      <StudyHistoryBrowser />
    </MemoryRouter>
  );

describe('connected study history', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(apiRequest)
      .mockReset()
      .mockImplementation(async (path) =>
        String(path).includes('/history?')
          ? page
          : {
              event,
              evidence: { selected_answer: 'A' },
              sources: [],
              linked_memory: [
                {
                  ...event,
                  id: 'study_memory:m1',
                  collection: 'study_memory',
                  title: 'Saved graph reasoning',
                  href: '/memory/m1'
                }
              ],
              related_truncated: false,
              evidence_truncated: false
            }
      );
  });
  it('opens original evidence and follows its question without inventing new records', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Graph condition/ }));
    expect(await screen.findByRole('link', { name: 'Saved graph reasoning' })).toHaveAttribute(
      'href',
      '/memory/m1'
    );
    expect(screen.getByRole('link', { name: 'Open original record' })).toHaveAttribute(
      'href',
      event.href
    );
    fireEvent.click(screen.getByRole('button', { name: 'Follow this question' }));
    await waitFor(() =>
      expect(vi.mocked(apiRequest).mock.calls.at(-1)?.[0]).toContain('question_uid=q1')
    );
    expect(vi.mocked(apiRequest).mock.calls.every(([, options]) => options?.method !== 'PUT')).toBe(
      true
    );
  });
  it('offers an explicit retry after a source-index failure', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Database unavailable'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry history' }));
    expect(await screen.findByRole('button', { name: /Graph condition/ })).toBeInTheDocument();
  });
});
