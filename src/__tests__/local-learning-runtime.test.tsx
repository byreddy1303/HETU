import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import LocalLearningRuntime from '@/components/memory/LocalLearningRuntime';
import { runLocalLearningEngine } from '@/lib/local-learning-engine';
import { backendConfig } from '@/lib/backend-config';
import { subscribeDb } from '@/lib/db';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ userId: 'owner' }) }));
vi.mock('@/lib/backend-config', () => ({ backendConfig: { isLocal: true } }));
vi.mock('@/lib/db', () => ({ subscribeDb: vi.fn(() => vi.fn()) }));
vi.mock('@/lib/local-learning-engine', () => ({
  LEARNING_UPDATED_EVENT: 'hetu:local-learning-updated',
  runLocalLearningEngine: vi.fn().mockResolvedValue({ state: 'idle' })
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  backendConfig.isLocal = true;
});

describe('automatic learning runtime', () => {
  it('checks on open and saved practice and cleans up its timer', async () => {
    vi.useFakeTimers();
    const view = render(<LocalLearningRuntime />);
    await act(async () => {});
    expect(runLocalLearningEngine).toHaveBeenCalledTimes(1);
    const change = vi.mocked(subscribeDb).mock.calls[0][0];
    await act(async () => {
      change();
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(runLocalLearningEngine).toHaveBeenCalledTimes(2);
    view.unmount();
    await vi.advanceTimersByTimeAsync(120000);
    expect(runLocalLearningEngine).toHaveBeenCalledTimes(2);
  });

  it('does not contact a local model from a hosted workspace', async () => {
    backendConfig.isLocal = false;
    render(<LocalLearningRuntime />);
    await act(async () => {});
    expect(runLocalLearningEngine).not.toHaveBeenCalled();
  });
});
