import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import LearningWorkflows from '@/components/workflows/LearningWorkflows';
import { newMemoryEntry, type StudyMemoryEntry } from '@/lib/study-memory';
import {
  getLocalLearningActions,
  getLocalLearningStatus,
  LEARNING_UPDATED_EVENT,
  prepareLocalLearningActivity
} from '@/lib/local-learning-engine';

const account = vi.hoisted(() => ({ userId: 'owner', isLocal: true }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: account.userId, profile: { timezone: 'Asia/Kolkata' } })
}));
vi.mock('@/lib/backend-config', () => ({
  backendConfig: {
    get isLocal() {
      return account.isLocal;
    }
  }
}));
vi.mock('@/lib/local-learning-engine', async (original) => ({
  ...(await original<typeof import('@/lib/local-learning-engine')>()),
  getLocalLearningActions: vi.fn(),
  getLocalLearningStatus: vi.fn(),
  prepareLocalLearningActivity: vi.fn()
}));
vi.mock('@/lib/study-memory-practice', () => ({
  memoryRepairHref: (entry: StudyMemoryEntry) => `/pyq?memoryRepairId=${entry.id}`
}));

const ready = newMemoryEntry('repair', 'repair-now', 'Trace page faults', {
  user_id: 'owner',
  state: 'open',
  evidence_kind: 'model',
  subject: 'Operating Systems',
  topic: 'Virtual memory',
  session_id: 'original-session',
  data: {
    due_date: '2000-01-01',
    activity: 'retry',
    target: 'Count initial page loads.',
    reason: 'The recorded answer was 2; the frozen key is 6.',
    success_criteria: 'Trace every request.',
    source_attempt_ids: ['original-attempt'],
    question_uids: ['go:460036'],
    duration_min: 10
  }
});
const upcoming = newMemoryEntry('repair', 'repair-later', 'Check page translation again', {
  user_id: 'owner',
  state: 'open',
  evidence_kind: 'rule',
  subject: 'Operating Systems',
  topic: 'Address translation',
  data: {
    due_date: '2999-03-12',
    target: 'Preserve the offset.',
    source_entry_ids: ['previous-repair', 'result'],
    question_uids: ['go:422790']
  }
});
const result = newMemoryEntry('verification', 'result', 'Practice result: page translation', {
  user_id: 'owner',
  state: 'completed',
  session_id: 'completed-session',
  data: {
    reliable_correct: 0,
    reliable_judged: 1,
    submitted: 2,
    planned: 3,
    explicit_skips: 1,
    next_review_entry_id: 'repair-later',
    mastery_claim: false
  }
});
const status = {
  state: 'idle' as const,
  message: '',
  last_run_at: null,
  model: 'qwen3:8b',
  processed_count: 2,
  pending_count: 0
};

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function mount() {
  return render(
    <MemoryRouter>
      <LearningWorkflows />
      <Location />
    </MemoryRouter>
  );
}

describe('learning workflows', () => {
  beforeEach(() => {
    cleanup();
    account.userId = 'owner';
    account.isLocal = true;
    vi.mocked(getLocalLearningActions)
      .mockReset()
      .mockResolvedValue({ items: [ready, upcoming], latest_results: [result] });
    vi.mocked(getLocalLearningStatus).mockReset().mockResolvedValue(status);
    vi.mocked(prepareLocalLearningActivity).mockReset().mockResolvedValue(ready);
  });

  it('links each due activity to its real evidence and checks questions before starting', async () => {
    mount();
    expect(
      await screen.findByRole('heading', {
        name: 'Retry the original question in Operating Systems'
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review source evidence' })).not.toBeVisible();
    const details = screen.getByText('History and evidence').closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('History and evidence'));
    expect(screen.getByRole('link', { name: 'Review source evidence' })).toHaveAttribute(
      'href',
      '/session/original-session/review?attempt=original-attempt'
    );
    expect(screen.queryByText(ready.title)).not.toBeInTheDocument();
    expect(
      screen.queryByText('The recorded answer was 2; the frozen key is 6.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Count initial page loads.')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace every request.')).not.toBeInTheDocument();
    expect(screen.getByText(/Its explanation still needs a practice check/)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Concept repair in Operating Systems' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start practice' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Current location')).toHaveTextContent(
        '/pyq?memoryRepairId=repair-now'
      )
    );
    expect(prepareLocalLearningActivity).toHaveBeenCalledWith('repair-now');
  });

  it('connects a completed check to its scheduled review without counting skips as judged answers', async () => {
    mount();
    await screen.findByRole('heading', {
      name: 'Retry the original question in Operating Systems'
    });
    fireEvent.click(screen.getByRole('button', { name: 'Upcoming checks (1)' }));
    expect(
      screen.getByRole('heading', { name: 'Concept repair in Operating Systems' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('History and evidence'));
    const completed = screen.getByText('Completed practice checks').closest('details');
    expect(completed).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Completed practice checks'));
    expect(completed).toHaveAttribute('open');
    expect(screen.getAllByText('0/1 reliably judged answers correct')).toHaveLength(2);
    expect(
      screen.getAllByText('2/3 selected questions submitted; 1 explicitly skipped.')
    ).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Previous practice result' })).toHaveAttribute(
      'href',
      '/memory/result'
    );
    expect(screen.getByRole('link', { name: 'Next review' })).toHaveAttribute(
      'href',
      '/memory/repair-later'
    );
    expect(
      screen.getByText(/Scheduled for 12 Mar 2999 from the previous practice result/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start practice' })).not.toBeInTheDocument();
    expect(screen.getByText(/not a claim that the concept is mastered/)).toBeInTheDocument();
  });

  it('keeps eligibility failures visible and stays on the workflow page', async () => {
    vi.mocked(prepareLocalLearningActivity).mockRejectedValue(
      new Error('No eligible matching questions remain.')
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Start practice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No eligible matching questions remain.'
    );
    expect(screen.getByLabelText('Current location')).toHaveTextContent('/');
    fireEvent.click(screen.getByText('History and evidence'));
    expect(screen.getByRole('link', { name: 'Activity details' })).toHaveAttribute(
      'href',
      '/memory/repair-now'
    );
  });

  it('refreshes on learning updates and allows a failed request to be retried', async () => {
    vi.mocked(getLocalLearningActions).mockRejectedValueOnce(
      new Error('Local service unavailable.')
    );
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Local service unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry study workflows' }));
    await screen.findByRole('heading', {
      name: 'Retry the original question in Operating Systems'
    });
    vi.mocked(getLocalLearningActions).mockResolvedValue({
      items: [upcoming],
      latest_results: [result]
    });
    act(() => window.dispatchEvent(new Event(LEARNING_UPDATED_EVENT)));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ready or due (0)' })).toBeInTheDocument()
    );
    expect(screen.getByText(/No study activities are due today/)).toBeInTheDocument();
    expect(screen.queryByText(/all.*complete/i)).not.toBeInTheDocument();
  });

  it('discards an old account response when the account changes', async () => {
    let resolveOld!: (value: {
      items: StudyMemoryEntry[];
      latest_results: StudyMemoryEntry[];
    }) => void;
    vi.mocked(getLocalLearningActions).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      })
    );
    const view = mount();
    account.userId = 'other-owner';
    vi.mocked(getLocalLearningActions).mockResolvedValue({ items: [], latest_results: [] });
    view.rerender(
      <MemoryRouter>
        <LearningWorkflows />
        <Location />
      </MemoryRouter>
    );
    await screen.findByText(/No prepared study activities yet/);
    await act(async () => resolveOld({ items: [ready], latest_results: [result] }));
    expect(
      screen.queryByRole('heading', { name: 'Retry the original question in Operating Systems' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(result.title)).not.toBeInTheDocument();
  });

  it('refreshes after external workspace changes and links model failures to Settings', async () => {
    vi.mocked(getLocalLearningStatus).mockResolvedValue({
      ...status,
      state: 'error',
      message: 'Model unavailable.'
    });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Model unavailable.');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    vi.mocked(getLocalLearningActions).mockResolvedValue({ items: [upcoming], latest_results: [] });
    act(() => window.dispatchEvent(new Event('hetu:workspace-changed')));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ready or due (0)' })).toBeInTheDocument()
    );
  });

  it('does not contact local model routes in hosted mode', () => {
    account.isLocal = false;
    mount();
    expect(
      screen.queryByRole('heading', { name: 'Your learning workflows' })
    ).not.toBeInTheDocument();
    expect(getLocalLearningActions).not.toHaveBeenCalled();
    expect(getLocalLearningStatus).not.toHaveBeenCalled();
  });
});
