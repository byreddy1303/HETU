import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import ConceptReview from '@/pages/ConceptReview';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/backend-config', () => ({ backendConfig: { fastapi: true } }));
vi.mock('@/lib/fastapi-client', async (load) => ({ ...await load<typeof import('@/lib/fastapi-client')>(), apiRequest }));

const review = { id: 'one', user_id: 'owner', version: 1, concept_id: 'concept', kind: 'recall', question_origin: 'saved_note',
  prompt: 'Why normalize the weights?', evaluation_guidance: 'Divide by their total.', due_on: '2026-10-10', attempts: [] };

const queue = (items: unknown[] = [review]) => ({ items, today: '2026-10-19', complete: true, held_for_exam: false });
beforeEach(() => { apiRequest.mockReset(); });
afterEach(cleanup);

function renderReview(path = '/concept-review/one') {
  return render(<MemoryRouter initialEntries={[path]}><Link to="/concept-review/two">Next question</Link>
    <Routes><Route path="/concept-review/:reviewId?" element={<ConceptReview />} /></Routes>
  </MemoryRouter>);
}

describe('discussion recall evidence', () => {
  it('separates due and upcoming recall without revealing hidden guidance', async () => {
    apiRequest.mockImplementation(async (path: string) => path.includes('?limit=')
      ? { ...queue(), items: [review, { ...review, id: 'later', prompt: 'Recall this later.', due_on: '2026-11-01' }] }
      : { ...review, has_guidance: true, evaluation_guidance: null,
          source: { href: '/memory/repair', guidance_status: 'unverified_model_proposal', snapshot_changed: false } });
    const user = userEvent.setup();
    renderReview();
    await screen.findByRole('heading', { name: review.prompt });
    expect(screen.getByRole('link', { name: 'Original study activity' })).toHaveAttribute('href', '/memory/repair');
    expect(screen.getByRole('button', { name: 'Show evaluation guidance' })).toBeEnabled();
    expect(screen.queryByText('Divide by their total.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Recall this later\./ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upcoming' }));
    expect(screen.getByRole('link', { name: /Recall this later\./ })).toHaveAttribute('href', '/concept-review/later');
  });
  it('shows loading and a retryable failure before showing a confirmed empty list', async () => {
    let fail!: (cause: Error) => void;
    apiRequest.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }))
      .mockResolvedValueOnce(queue([]));
    const user = userEvent.setup();
    renderReview('/concept-review');
    expect(screen.getByRole('navigation', { name: 'Concept questions' })).toHaveTextContent('Loading concept questions…');
    expect(screen.queryByText(/No concept questions yet/)).not.toBeInTheDocument();
    await act(async () => fail(new Error('Rate limit exceeded')));
    expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded');
    expect(screen.queryByText(/No concept questions yet/)).not.toBeInTheDocument();
    expect(screen.queryByText('Choose a question to begin.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry load' }));
    expect(await screen.findByText(/No concept questions yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('retries a failed selected question without claiming there is nothing to review', async () => {
    let failDetail = true;
    apiRequest.mockImplementation(async (path: string) => {
      if (path.includes('?limit=')) return queue();
      if (failDetail) throw new Error('Question could not load');
      return review;
    });
    const user = userEvent.setup();
    renderReview();
    expect(await screen.findByRole('alert')).toHaveTextContent('Question could not load');
    expect(screen.queryByText('Choose a question to begin.')).not.toBeInTheDocument();
    expect(screen.queryByText(/No concept questions yet/)).not.toBeInTheDocument();
    failDetail = false;
    await user.click(screen.getByRole('button', { name: 'Retry load' }));
    expect(await screen.findByRole('heading', { name: review.prompt })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cancels old route loads and ignores late results after another question opens', async () => {
    let finishFirst!: (value: typeof review) => void;
    let firstSignal: AbortSignal | undefined;
    apiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('?limit=')) return queue();
      if (path.endsWith('/one')) {
        firstSignal = init?.signal as AbortSignal;
        return new Promise<typeof review>((resolve) => { finishFirst = resolve; });
      }
      return { ...review, id: 'two', prompt: 'State the law of total probability.' };
    });
    const user = userEvent.setup();
    renderReview();
    await waitFor(() => expect(firstSignal).toBeDefined());
    await user.click(screen.getByRole('link', { name: 'Next question' }));
    expect(await screen.findByRole('heading', { name: 'State the law of total probability.' })).toBeInTheDocument();
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => finishFirst(review));
    expect(screen.queryByRole('heading', { name: review.prompt })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'State the law of total probability.' })).toBeInTheDocument();
  });

  it('aborts its pending load when the page unmounts', async () => {
    let signal: AbortSignal | undefined;
    apiRequest.mockImplementation((_path: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return new Promise(() => {});
    });
    const rendered = renderReview('/concept-review');
    await waitFor(() => expect(signal).toBeDefined());
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('persists guidance before revealing it and submits the new version with assistance', async () => {
    const saved = { ...review, version: 2, pending_assistance: 'solution' };
    apiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('?limit=')) return queue();
      if (path.endsWith('/help')) return { review: saved, events: [] };
      if (path.endsWith('/responses')) return { ...saved, version: 3 };
      return init?.method === 'POST' ? saved : review;
    });
    const user = userEvent.setup();
    renderReview();
    await screen.findByRole('heading', { name: review.prompt });
    await user.type(screen.getByLabelText('Your answer'), 'The evidence probability is the total weight.');
    await user.click(screen.getByRole('button', { name: 'Show evaluation guidance' }));
    expect(await screen.findByText(review.evaluation_guidance)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('How did your answer hold up?'), 'correct');
    await user.click(screen.getByRole('button', { name: 'Record response' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([path]) => path.endsWith('/responses'))).toBe(true));
    const response = apiRequest.mock.calls.find(([path]) => path.endsWith('/responses'))!;
    expect(JSON.parse(response[1].body)).toMatchObject({ expected_version: 2, assistance: 'solution', evaluated_by: 'self' });
  });

  it('resets answer and assistance when moving to a different discussion question', async () => {
    apiRequest.mockImplementation(async (path: string) => path.includes('?limit=') ? queue() : { ...review, id: path.endsWith('two') ? 'two' : 'one', prompt: path.endsWith('two') ? 'State the law of total probability.' : review.prompt });
    const user = userEvent.setup();
    renderReview();
    await screen.findByRole('heading', { name: review.prompt });
    await user.type(screen.getByLabelText('Your answer'), 'Answer for the first question');
    await user.click(screen.getByRole('link', { name: 'Next question' }));
    await screen.findByRole('heading', { name: 'State the law of total probability.' });
    expect(screen.getByLabelText('Your answer')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Record response' })).toBeDisabled();
  });

  it('retries only reads when refreshing a committed response fails', async () => {
    let committed = false;
    let failRefresh = true;
    apiRequest.mockImplementation(async (path: string) => {
      if (path.endsWith('/responses')) { committed = true; return { ...review, version: 2 }; }
      if (committed && failRefresh) throw new Error('Refresh unavailable');
      return path.includes('?limit=') ? queue() : { ...review, version: committed ? 2 : 1 };
    });
    const user = userEvent.setup();
    renderReview();
    await screen.findByRole('heading', { name: review.prompt });
    await user.type(screen.getByLabelText('Your answer'), 'Normalize by the total.');
    await user.click(screen.getByRole('button', { name: 'Record response' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh unavailable');
    expect(screen.getByLabelText('Your answer')).toHaveValue('');
    failRefresh = false;
    await user.click(screen.getByRole('button', { name: 'Retry load' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(apiRequest.mock.calls.filter(([path]) => path.endsWith('/responses'))).toHaveLength(1);
  });
});
