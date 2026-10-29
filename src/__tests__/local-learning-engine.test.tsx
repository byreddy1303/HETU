import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LocalLearningEngine from '@/components/memory/LocalLearningEngine';
import { apiRequest } from '@/lib/fastapi-client';
import { LEARNING_UPDATED_EVENT } from '@/lib/local-learning-engine';
import { newMemoryEntry } from '@/lib/study-memory';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: 'owner', profile: { timezone: 'Asia/Kolkata' } })
}));
vi.mock('@/lib/fastapi-client', async (original) => ({
  ...(await original<typeof import('@/lib/fastapi-client')>()),
  apiRequest: vi.fn()
}));
const config = {
  provider: 'ollama',
  base_url: 'http://127.0.0.1:11434',
  model: '',
  enabled: false,
  time_zone: 'Asia/Kolkata'
};
const status = {
  state: 'disabled',
  message: 'Connect a local model.',
  last_run_at: null,
  model: '',
  processed_count: 0,
  pending_count: 0
};
const action = newMemoryEntry('repair', 'repair', 'Count initial page loads', {
  user_id: 'owner',
  state: 'open',
  evidence_kind: 'model',
  session_id: 'source',
  subject: 'Operating Systems',
  topic: 'Memory Management',
  data: {
    reason: 'The saved answer was 2; the frozen key is 6.',
    success_criteria: 'Trace every request.',
    question_uids: ['go:460036'],
    source_attempt_ids: ['attempt'],
    duration_min: 10,
    activity: 'retry'
  }
});
function mount() {
  return render(
    <MemoryRouter>
      <LocalLearningEngine />
    </MemoryRouter>
  );
}

describe('automatic local learning UI', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(apiRequest)
      .mockReset()
      .mockImplementation(async (path) => {
        if (path.endsWith('/config')) return config;
        if (path.endsWith('/status')) return status;
        if (path.endsWith('/actions')) return { items: [action], latest_results: [] };
        throw new Error('Unexpected API path');
      });
  });

  it('shows one practice action and keeps source navigation collapsed without leaking answers', async () => {
    mount();
    expect(
      await screen.findByRole('heading', { name: 'Retry original questions' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
    expect(screen.getByText('1 question')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Original evidence' }).closest('details')
    ).not.toHaveAttribute('open');
    expect(screen.queryByText(action.title)).not.toBeInTheDocument();
    expect(screen.queryByText(String(action.data.reason))).not.toBeInTheDocument();
    expect(screen.queryByText(String(action.data.success_criteria))).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Details and source'));
    expect(screen.getByRole('link', { name: 'Original evidence' })).toHaveAttribute(
      'href',
      '/session/source/review?attempt=attempt'
    );
    expect(screen.getByText(/Source records may reveal them/)).toBeInTheDocument();
    expect(screen.queryByText(String(action.data.reason))).not.toBeInTheDocument();
    expect(screen.queryByText(String(action.data.success_criteria))).not.toBeInTheDocument();
  });

  it('distinguishes the same topic by activity, time, count and date', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation(async (path, init) =>
      path.endsWith('/actions')
        ? {
            items: [
              action,
              {
                ...action,
                id: 'transfer',
                data: {
                  ...action.data,
                  activity: 'transfer',
                  duration_min: 20,
                  question_uids: ['fresh-1', 'fresh-2'],
                  due_date: '2099-11-01'
                }
              }
            ],
            latest_results: []
          }
        : original(path, init)
    );
    mount();
    await screen.findByRole('heading', { name: 'Retry original questions' });
    expect(screen.getByRole('heading', { name: 'Fresh application' })).toBeInTheDocument();
    expect(screen.getByText('20 min')).toBeInTheDocument();
    expect(screen.getByText('2 questions')).toBeInTheDocument();
    expect(screen.getByText(/Scheduled 1 Nov 2099/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled();
  });

  it('keeps connection configuration in Settings and retains processing controls', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Prepared practice' });
    await screen.findByRole('heading', { name: 'Retry original questions' });
    expect(screen.getByRole('link', { name: 'Local model settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(screen.queryByLabelText('Installed model')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Local server address')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Process saved learning' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/config'))
    );
  });

  it('checks eligibility before opening a prepared activity and makes failures visible', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (path.endsWith('/prepare')) throw new Error('No eligible matching questions remain.');
      return original(path, init);
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Start practice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No eligible matching questions remain.'
    );
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/actions/repair/prepare'), {
      method: 'POST'
    });
  });

  it('refreshes activities after saved work changes and exposes processing failures', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    let finished = false;
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (path.endsWith('/config')) return { ...config, model: 'local-model', enabled: true };
      if (path.endsWith('/actions')) return { items: finished ? [] : [action], latest_results: [] };
      if (path.endsWith('/run')) throw new Error('The local model is offline.');
      return original(path, init);
    });
    mount();
    await screen.findByRole('heading', { name: 'Retry original questions' });
    finished = true;
    act(() => window.dispatchEvent(new Event('hetu:memory-saved')));
    await screen.findByText(/No prepared activity is waiting/);
    expect(screen.queryByRole('button', { name: 'Start practice' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Process saved learning' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The local model is offline.');
    act(() => window.dispatchEvent(new Event(LEARNING_UPDATED_EVENT)));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
