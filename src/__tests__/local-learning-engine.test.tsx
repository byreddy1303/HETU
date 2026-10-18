import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LocalLearningEngine from '@/components/memory/LocalLearningEngine';
import { apiRequest } from '@/lib/fastapi-client';
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

  it('leads with a usable action and its recorded evidence', async () => {
    mount();
    expect(await screen.findByText('Count initial page loads')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start practice' }).getAttribute('href')).toContain(
      'memoryRepairId=repair'
    );
    expect(screen.getByRole('link', { name: 'See original evidence' })).toHaveAttribute(
      'href',
      '/session/source/review?attempt=attempt'
    );
    expect(screen.getByText(/needs a practice check/)).toBeInTheDocument();
    expect(screen.queryByText('Recorded details and evidence')).not.toBeInTheDocument();
  });

  it('discovers and saves a selected local model with automation enabled', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (path.endsWith('/models'))
        return { reachable: true, models: [{ id: 'qwen3:8b', name: 'qwen3:8b' }] };
      if (path.endsWith('/config') && init?.method === 'PUT') return JSON.parse(String(init.body));
      return original(path, init);
    });
    mount();
    await screen.findByText('Count initial page loads');
    fireEvent.click(screen.getByText('Local model connection'));
    fireEvent.click(screen.getByRole('button', { name: 'Test local connection' }));
    await screen.findByRole('option', { name: 'qwen3:8b' });
    fireEvent.change(screen.getByLabelText('Installed model'), { target: { value: 'qwen3:8b' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable automatic study follow-ups/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save connection' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining('/config'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"model":"qwen3:8b"')
        })
      )
    );
    expect(
      await screen.findByText('Connection saved. Automatic study follow-ups are enabled.')
    ).toBeInTheDocument();
  });

  it('checks eligibility before opening a prepared activity', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (path.endsWith('/prepare')) throw new Error('No eligible matching questions remain.');
      return original(path, init);
    });
    mount();
    fireEvent.click(await screen.findByRole('link', { name: 'Start practice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No eligible matching questions remain.'
    );
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/actions/repair/prepare'), {
      method: 'POST'
    });
  });

  it('shows an offline connection error without claiming analysis succeeded', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation(async (path, init) =>
      path.endsWith('/models')
        ? { reachable: false, models: [], message: 'Start Ollama, then test again.' }
        : original(path, init)
    );
    mount();
    await screen.findByText('Count initial page loads');
    fireEvent.click(screen.getByText('Local model connection'));
    fireEvent.click(screen.getByRole('button', { name: 'Test local connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Start Ollama, then test again.');
    expect(screen.getByRole('button', { name: 'Save connection' })).toBeDisabled();
  });
});
