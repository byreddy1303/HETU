import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
function mount(compact = false) {
  return render(
    <MemoryRouter>
      <LocalLearningEngine compact={compact} />
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
    expect(screen.getByText('Scheduled checks (1)').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Fresh application' })).not.toBeVisible();
    fireEvent.click(screen.getByText('Scheduled checks (1)'));
    expect(screen.getByRole('heading', { name: 'Fresh application' })).toBeVisible();
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
    expect(screen.getByText('Automatic preparation').closest('details')).not.toHaveAttribute(
      'open'
    );
    expect(screen.getByRole('button', { name: 'Process saved learning' })).not.toBeVisible();
    expect(screen.getByRole('link', { name: 'Local model settings' })).not.toBeVisible();
    fireEvent.click(screen.getByText('Automatic preparation'));
    expect(screen.getByRole('button', { name: 'Process saved learning' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Process saved learning' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/config'))
    );
  });

  it('recommends resumable practice before the oldest due work and keeps alternatives available', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    const older = {
      ...action,
      id: 'older',
      topic: 'Older due practice',
      data: { ...action.data, due_date: '2000-01-01' }
    };
    const active = {
      ...action,
      id: 'active',
      topic: 'Saved practice',
      data: { ...action.data, due_date: '2099-01-01', active_session_id: 'saved-session' }
    };
    vi.mocked(apiRequest).mockImplementation(async (path, init) =>
      path.endsWith('/actions')
        ? { items: [action, older, active], latest_results: [] }
        : original(path, init)
    );
    mount();
    const recommended = await screen.findByRole('list', { name: 'Recommended practice' });
    expect(within(recommended).getByRole('link', { name: 'Resume practice' })).toHaveAttribute(
      'href',
      '/pyq?resumeSession=saved-session'
    );
    expect(within(recommended).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('3 ready now')).toBeInTheDocument();
    expect(screen.getByText('Other activities (2)').closest('details')).not.toHaveAttribute('open');
    const other = screen.getByRole('list', { name: 'Other prepared activities' });
    expect(other).not.toBeVisible();
    fireEvent.click(screen.getByText('Other activities (2)'));
    expect(other).toBeVisible();
    expect(
      within(other)
        .getAllByText(/^Operating Systems:/)
        .map((item) => item.textContent)
    ).toEqual(['Operating Systems: Older due practice', 'Operating Systems: Memory Management']);
    expect(within(other).getAllByRole('button', { name: 'Start practice' })).toHaveLength(2);
    expect(screen.queryByText(/Scheduled checks/)).not.toBeInTheDocument();
    expect(
      vi.mocked(apiRequest).mock.calls.filter(([path]) => path.endsWith('/prepare'))
    ).toHaveLength(0);
  });

  it('keeps every due and future activity in compact mode and recommends the oldest due', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    const due = [4, 2, 5, 1, 3].map((day) => ({
      ...action,
      id: `due-${day}`,
      topic: `Due ${day}`,
      data: { ...action.data, due_date: `2000-01-0${day}` }
    }));
    const future = { ...action, id: 'future', data: { ...action.data, due_date: '2099-11-01' } };
    vi.mocked(apiRequest).mockImplementation(async (path, init) =>
      path.endsWith('/actions')
        ? { items: [...due, future], latest_results: [] }
        : original(path, init)
    );
    mount(true);
    const recommended = await screen.findByRole('list', { name: 'Recommended practice' });
    expect(within(recommended).getByText('Operating Systems: Due 1')).toBeVisible();
    expect(screen.getByText('5 ready now · 1 scheduled')).toBeInTheDocument();
    expect(screen.getByText('Other activities (4)').closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Other activities (4)'));
    expect(
      within(screen.getByRole('list', { name: 'Other prepared activities' })).getAllByRole(
        'button',
        { name: 'Start practice' }
      )
    ).toHaveLength(4);
    fireEvent.click(screen.getByText('Scheduled checks (1)'));
    expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled();
  });

  it('shows the next date when only scheduled work remains without offering an early start', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation(async (path, init) =>
      path.endsWith('/actions')
        ? {
            items: [{ ...action, data: { ...action.data, due_date: '2099-11-01' } }],
            latest_results: []
          }
        : original(path, init)
    );
    mount(true);
    expect(await screen.findByText('Your next check is scheduled for 1 Nov 2099.')).toBeVisible();
    expect(screen.getByText('0 ready now · 1 scheduled')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Recommended practice' })).not.toBeInTheDocument();
    expect(screen.queryByText(/No prepared activity is waiting/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Scheduled checks (1)'));
    expect(screen.getByRole('button', { name: 'Scheduled' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled();
    expect(
      vi.mocked(apiRequest).mock.calls.filter(([path]) => path.endsWith('/prepare'))
    ).toHaveLength(0);
  });

  it('keeps engine failures and recovery controls visible while preparation settings are collapsed', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation(async (path, init) =>
      path.endsWith('/status')
        ? { ...status, state: 'error', last_error: 'Local model unavailable.' }
        : original(path, init)
    );
    mount();
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Local model unavailable.');
    expect(screen.getByRole('button', { name: 'Retry learning engine' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeVisible();
    expect(screen.getByText('Automatic preparation').closest('details')).not.toHaveAttribute(
      'open'
    );
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeVisible();
  });

  it('keeps every returned recent result behind the collapsed results disclosure', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    const results = [1, 2, 3, 4].map((number) =>
      newMemoryEntry('verification', `result-${number}`, 'Stored result', {
        user_id: 'owner',
        state: 'completed',
        topic: `Result topic ${number}`
      })
    );
    vi.mocked(apiRequest).mockImplementation(async (path, init) =>
      path.endsWith('/actions')
        ? { items: [action], latest_results: results }
        : original(path, init)
    );
    mount();
    const summary = await screen.findByText('Recent results (4)');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Result topic 4')).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText('Result topic 4')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'View result' })).toHaveLength(4);
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
    fireEvent.click(screen.getByText('Automatic preparation'));
    fireEvent.click(screen.getByRole('button', { name: 'Process saved learning' }));
    fireEvent.click(screen.getByText('Automatic preparation'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The local model is offline.');
    act(() => window.dispatchEvent(new Event(LEARNING_UPDATED_EVENT)));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
