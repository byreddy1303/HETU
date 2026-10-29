import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TodayActions from '@/components/dashboard/TodayActions';
import { apiRequest } from '@/lib/fastapi-client';
import { recoveryKey, startSessionApi } from '@/lib/recovery-api';
import { runtimeStorage } from '@/lib/runtime-storage';
import { useSyncStatusStore } from '@/stores/sync-status';

const fixture = vi.hoisted(() => ({
  rows: {
    learningItems: [],
    reattempts: [],
    pyqAttempts: [],
    formulas: [],
    questions: [],
    practiceSessions: [],
    recoverySessions: []
  },
  navigate: vi.fn()
}));
vi.mock('react-router-dom', async (load) => ({
  ...(await load<typeof import('react-router-dom')>()),
  useNavigate: () => fixture.navigate
}));
vi.mock('@/lib/db-hooks', () => ({ useLiveQuery: () => fixture.rows }));
vi.mock('@/lib/db', () => ({ db: {}, subscribeDb: () => () => {} }));
vi.mock('@/lib/sync', () => ({
  subscribeInitialPull: () => () => {},
  isInitialPullActive: () => false
}));
vi.mock('@/lib/fastapi-client', () => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/recovery-api', () => ({
  startSessionApi: vi.fn(),
  recoveryKey: vi.fn(() => 'stable-key')
}));
vi.mock('@/lib/planner-execution', () => ({
  reconcilePlannerExecutions: async () => 0,
  startPlannerBlock: vi.fn()
}));
vi.mock('@/lib/planner-storage', () => ({ loadDayPlan: () => null }));
vi.mock('@/lib/planner-cloud', () => ({ queuePlannerCloudWrite: vi.fn() }));
vi.mock('@/lib/local-learning-engine', () => ({
  LEARNING_UPDATED_EVENT: 'hetu:local-learning-updated',
  prepareLocalLearningActivity: vi.fn()
}));
vi.mock('@/lib/study-memory-practice', () => ({ memoryRepairHref: vi.fn() }));

const concepts = {
  items: [
    { id: 'recall', due_on: '2026-10-18', kind: 'recall', concept: { topic: 'Memory Management' } }
  ],
  today: '2026-10-29',
  complete: true
};
function mount() {
  return render(
    <MemoryRouter>
      <TodayActions userId="owner" today="2026-10-29" />
    </MemoryRouter>
  );
}
function responses(withConcepts = concepts) {
  vi.mocked(apiRequest).mockImplementation(async (path) =>
    path.includes('concept-bridge')
      ? withConcepts
      : path.includes('/v1/recovery')
        ? { complete: true, sprint: { selected: [], estimatedSeconds: 0, deferredCount: 0 } }
        : { items: [], total: 0, has_more: false }
  );
}
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  runtimeStorage.clear();
  useSyncStatusStore.getState().resetSyncStatus();
  responses();
});

describe('local daily queue states and launch', () => {
  it('never claims clear while concept work is pending', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Memory Management recall' });
    expect(screen.queryByText(/The queue is clear/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start next action' }));
    expect(fixture.navigate).toHaveBeenCalledWith('/concept-review/recall');
  });

  it('keeps failed sources visible and retries them', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('Unavailable'));
    mount();
    expect(await screen.findAllByRole('alert')).toHaveLength(4);
    expect(screen.queryByText(/The queue is clear/)).not.toBeInTheDocument();
    responses();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
    await screen.findByRole('heading', { name: 'Memory Management recall' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not claim an empty partial or exam-held queue is clear', async () => {
    responses({ ...concepts, items: [], complete: false });
    mount();
    await screen.findByText(/This is a partial queue/);
    expect(screen.queryByText(/The queue is clear/)).not.toBeInTheDocument();
  });

  it('refreshes completed work after a learning event and retains the time choice across navigation', async () => {
    const view = mount();
    await screen.findByRole('heading', { name: 'Memory Management recall' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time available' }), {
      target: { value: '20' }
    });
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining('mode=minutes-20'),
        expect.anything()
      )
    );
    responses({ ...concepts, items: [] });
    act(() => window.dispatchEvent(new Event('hetu:concept-reviews-updated')));
    await screen.findByText(/The queue is clear/);
    view.unmount();
    mount();
    expect(screen.getByRole('combobox', { name: 'Time available' })).toHaveValue('20');
  });

  it('starts the exact advertised canonical sprint and exposes launch failures', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path.includes('concept-bridge')
        ? { ...concepts, items: [] }
        : path.includes('/v1/recovery')
          ? {
              complete: true,
              sprint: {
                selected: [{ item: { id: 'one' } }],
                estimatedSeconds: 540,
                deferredCount: 5
              }
            }
          : { items: [], total: 0, has_more: false }
    );
    vi.mocked(startSessionApi)
      .mockRejectedValueOnce(new Error('Selection changed'))
      .mockResolvedValue({ session: { id: 'saved' } } as never);
    mount();
    await screen.findByRole('heading', { name: 'Retrieve 1 due question' });
    expect(screen.getByText(/About 9 minutes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start next action' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Selection changed');
    fireEvent.click(screen.getByRole('button', { name: 'Start next action' }));
    await waitFor(() =>
      expect(fixture.navigate).toHaveBeenCalledWith('/reattempts?recoverySession=saved')
    );
    expect(startSessionApi).toHaveBeenLastCalledWith({
      userId: 'owner',
      mode: 'minutes-10',
      itemIds: ['one'],
      key: 'stable-key'
    });
    expect(recoveryKey).toHaveBeenLastCalledWith('today-sprint', [
      'owner',
      '2026-10-29',
      10,
      ['one'],
      JSON.stringify([[['one', null]], null])
    ]);
    expect(vi.mocked(recoveryKey).mock.calls[0]).toEqual(vi.mocked(recoveryKey).mock.calls[1]);
  });

  it('does not claim clear when cached study records failed to refresh', async () => {
    responses({ ...concepts, items: [] });
    useSyncStatusStore.getState().markSyncError('Database unavailable');
    mount();
    await screen.findByText(/Study records could not refresh/);
    expect(screen.queryByText(/The queue is clear/)).not.toBeInTheDocument();
  });
});
