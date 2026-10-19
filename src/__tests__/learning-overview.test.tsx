import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LearningOverview from '@/components/dashboard/LearningOverview';
import { apiRequest } from '@/lib/fastapi-client';
import {
  getLocalLearningActions,
  getLocalLearningStatus,
  LEARNING_UPDATED_EVENT
} from '@/lib/local-learning-engine';
import { newMemoryEntry } from '@/lib/study-memory';

vi.mock('@/lib/backend-config', () => ({ backendConfig: { fastapi: true, isLocal: true } }));
vi.mock('@/lib/fastapi-client', async (load) => ({ ...await load<typeof import('@/lib/fastapi-client')>(), apiRequest: vi.fn() }));
vi.mock('@/lib/local-learning-engine', async (load) => ({
  ...(await load<typeof import('@/lib/local-learning-engine')>()),
  getLocalLearningActions: vi.fn(),
  getLocalLearningStatus: vi.fn()
}));

const ready = newMemoryEntry('repair', 'ready', 'Count page faults', {
  user_id: 'owner',
  state: 'open',
  evidence_kind: 'model',
  data: {
    due_date: '2026-10-18',
    activity: 'retry',
    reason: 'Saved answer 2; frozen key 6.',
    question_uids: ['go:460036'],
    concept_review_id: 'recall'
  }
});
const later = newMemoryEntry('repair', 'later', 'Delayed application', {
  user_id: 'owner',
  state: 'open',
  data: { due_date: '2026-10-22' }
});
const props = {
  userId: 'owner',
  name: 'Kalyan',
  today: '2026-10-19',
  timeZone: 'Asia/Kolkata',
  coreOnly: false,
  showCountdown: true,
  daysLeft: 110,
  resumeSession: null
};

function mount(extra = {}) {
  return render(
    <MemoryRouter>
      <LearningOverview {...props} {...extra} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  cleanup();
  vi.mocked(getLocalLearningActions)
    .mockReset()
    .mockResolvedValue({ items: [ready, later], latest_results: [] });
  vi.mocked(getLocalLearningStatus)
    .mockReset()
    .mockResolvedValue({
      state: 'idle',
      message: '',
      model: 'qwen3:8b',
      last_run_at: null,
      processed_count: 1,
      pending_count: 2
    });
  vi.mocked(apiRequest)
    .mockReset()
    .mockImplementation(async (path) =>
      path.includes('/queue')
        ? {
            items: [
              {
                id: 'recall',
                prompt: 'Explain the first page load.',
                kind: 'recall',
                due_on: '2026-10-19'
              }
            ],
            today: '2026-10-19',
            complete: true,
            held_for_exam: false
          }
        : []
    );
});

describe('connected learning dashboard', () => {
  it('leads with real ready work, separates future checks, and links the recall source', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Count page faults' });
    expect(screen.getByRole('link', { name: 'Recall check' })).toHaveAttribute(
      'href',
      '/concept-review/recall'
    );
    expect(screen.getByRole('link', { name: 'Start practice' }).getAttribute('href')).toContain(
      'memoryRepairId=ready'
    );
    expect(screen.getByText('Scheduled for later')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delayed application' })).toHaveAttribute(
      'href',
      '/memory/later'
    );
    expect(screen.getByRole('link', { name: 'Explain the first page load.' })).toHaveAttribute(
      'href',
      '/concept-review/recall'
    );
    expect(screen.queryByText(/mastered/i)).not.toBeInTheDocument();
  });

  it('keeps partial failures visible without claiming there are zero concept reviews', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('Service unavailable'));
    mount();
    await screen.findByRole('heading', { name: 'Count page faults' });
    expect(
      screen
        .getAllByRole('alert')
        .some((item) => item.textContent?.includes('Concept reviews could not load'))
    ).toBe(true);
    expect(screen.queryByText(/0.*due now/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry overview' })).toBeInTheDocument();
  });

  it('refreshes dated work after a learning event and excludes another owner', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Count page faults' });
    vi.mocked(getLocalLearningActions).mockResolvedValue({
      items: [later, { ...ready, user_id: 'other', title: 'Private foreign activity' }],
      latest_results: []
    });
    act(() => window.dispatchEvent(new Event(LEARNING_UPDATED_EVENT)));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Count page faults' })).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Private foreign activity')).not.toBeInTheDocument();
    expect(screen.getByText('Your next check has a date.')).toBeInTheDocument();
  });

  it('preserves the minimal core-only profile without requesting advanced sections', () => {
    mount({ coreOnly: true });
    expect(screen.getByRole('link', { name: 'Open Do now' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recall before review' })).not.toBeInTheDocument();
    expect(getLocalLearningActions).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
