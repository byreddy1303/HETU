import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import Workflows from '@/pages/Workflows';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/backend-config', () => ({ backendConfig: { fastapi: true } }));
vi.mock('@/lib/fastapi-client', async (load) => ({ ...await load<typeof import('@/lib/fastapi-client')>(), apiRequest }));

const brief = {
  id: 'one', goal: 'Review the mock test', status: 'active', version: 1,
  constraints: [], assumptions: [], corrections: [], references: [], pending_steps: ['Review evidence'],
  completed_steps: [], success_criteria: [], receipts: [], updated_at: '2026-10-12T08:00:00Z'
};

beforeEach(() => { apiRequest.mockReset(); });
afterEach(cleanup);

function renderWorkflows(path = '/workflows') {
  return render(<MemoryRouter initialEntries={[path]}><Link to="/workflows/two">Next workflow</Link>
    <Routes><Route path="/workflows/:workflowId?" element={<Workflows />} /></Routes>
  </MemoryRouter>);
}

describe('workflow loading', () => {
  it('shows loading and a retryable failure before showing a confirmed empty list', async () => {
    let fail!: (cause: Error) => void;
    apiRequest.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }))
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderWorkflows();
    expect(screen.getByRole('navigation', { name: 'Recent workflows' })).toHaveTextContent('Loading workflows…');
    expect(screen.queryByText(/No saved task briefs yet/)).not.toBeInTheDocument();
    await act(async () => fail(new Error('Rate limit exceeded')));
    expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded');
    expect(screen.queryByText(/No saved task briefs yet/)).not.toBeInTheDocument();
    expect(screen.queryByText('Choose a workflow to see its current state.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry load' }));
    expect(await screen.findByText(/No saved task briefs yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('retries a failed selected workflow without claiming there are no saved workflows', async () => {
    let failDetail = true;
    apiRequest.mockImplementation(async (path: string) => {
      if (path.includes('?limit=')) return [brief];
      if (failDetail) throw new Error('Workflow could not load');
      return brief;
    });
    const user = userEvent.setup();
    renderWorkflows('/workflows/one');
    expect(await screen.findByRole('alert')).toHaveTextContent('Workflow could not load');
    expect(screen.queryByText('Choose a workflow to see its current state.')).not.toBeInTheDocument();
    expect(screen.queryByText(/No saved task briefs yet/)).not.toBeInTheDocument();
    failDetail = false;
    await user.click(screen.getByRole('button', { name: 'Retry load' }));
    expect(await screen.findByRole('heading', { name: brief.goal })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cancels old route loads and ignores late results after another workflow opens', async () => {
    let finishFirst!: (value: typeof brief) => void;
    let firstSignal: AbortSignal | undefined;
    apiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('?limit=')) return [brief];
      if (path.endsWith('/one')) {
        firstSignal = init?.signal as AbortSignal;
        return new Promise<typeof brief>((resolve) => { finishFirst = resolve; });
      }
      return { ...brief, id: 'two', goal: 'Review the next mock' };
    });
    const user = userEvent.setup();
    renderWorkflows('/workflows/one');
    await waitFor(() => expect(firstSignal).toBeDefined());
    await user.click(screen.getByRole('link', { name: 'Next workflow' }));
    expect(await screen.findByRole('heading', { name: 'Review the next mock' })).toBeInTheDocument();
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => finishFirst(brief));
    expect(screen.queryByRole('heading', { name: brief.goal })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review the next mock' })).toBeInTheDocument();
  });

  it('aborts its pending load when the page unmounts', async () => {
    let signal: AbortSignal | undefined;
    apiRequest.mockImplementation((_path: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return new Promise(() => {});
    });
    const rendered = renderWorkflows();
    await waitFor(() => expect(signal).toBeDefined());
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('retains a correction operation ID when the write outcome is uncertain', async () => {
    let failed = false;
    apiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        if (!failed) { failed = true; throw new Error('Connection lost'); }
        return { ...brief, version: 2 };
      }
      return path.includes('?limit=') ? [brief] : brief;
    });
    const user = userEvent.setup();
    renderWorkflows('/workflows/one');
    await screen.findByRole('heading', { name: brief.goal });
    await user.type(screen.getByLabelText('Add a correction'), 'Focus on the missed concept.');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.queryByRole('button', { name: 'Retry load' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    const writes = apiRequest.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(writes).toHaveLength(2);
    const first = JSON.parse(writes[0][1].body);
    expect(first).toMatchObject({ expected_version: 1, correction: 'Focus on the missed concept.' });
    expect(JSON.parse(writes[1][1].body).operation_id).toBe(first.operation_id);
  });

  it('retries only reads when refreshing a committed correction fails', async () => {
    let committed = false;
    let failRefresh = true;
    apiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') { committed = true; return { ...brief, version: 2 }; }
      if (committed && failRefresh) throw new Error('Refresh unavailable');
      return path.includes('?limit=') ? [brief] : { ...brief, version: committed ? 2 : 1 };
    });
    const user = userEvent.setup();
    renderWorkflows('/workflows/one');
    await screen.findByRole('heading', { name: brief.goal });
    await user.type(screen.getByLabelText('Add a correction'), 'Focus on the missed concept.');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.getByLabelText('Add a correction')).toHaveValue('');
    failRefresh = false;
    await user.click(screen.getByRole('button', { name: 'Retry load' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(apiRequest.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
    expect(screen.getByText('active · version 2')).toBeInTheDocument();
  });
});
