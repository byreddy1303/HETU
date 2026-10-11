import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import ConceptReview from '@/pages/ConceptReview';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/backend-config', () => ({ backendConfig: { fastapi: true } }));
vi.mock('@/lib/fastapi-client', async (load) => ({ ...await load<typeof import('@/lib/fastapi-client')>(), apiRequest }));

const review = { id: 'one', user_id: 'owner', version: 1, concept_id: 'concept', kind: 'recall', question_origin: 'saved_note',
  prompt: 'Why normalize the weights?', evaluation_guidance: 'Divide by their total.', due_on: '2026-10-10', attempts: [] };

beforeEach(() => { apiRequest.mockReset(); });

function renderReview() {
  return render(<MemoryRouter initialEntries={['/concept-review/one']}><Link to="/concept-review/two">Next question</Link>
    <Routes><Route path="/concept-review/:reviewId" element={<ConceptReview />} /></Routes>
  </MemoryRouter>);
}

describe('discussion recall evidence', () => {
  it('persists guidance before revealing it and submits the new version with assistance', async () => {
    const saved = { ...review, version: 2, pending_assistance: 'solution' };
    apiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('?limit=')) return [review];
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
    apiRequest.mockImplementation(async (path: string) => path.includes('?limit=') ? [review] : { ...review, id: path.endsWith('two') ? 'two' : 'one', prompt: path.endsWith('two') ? 'State the law of total probability.' : review.prompt });
    const user = userEvent.setup();
    renderReview();
    await screen.findByRole('heading', { name: review.prompt });
    await user.type(screen.getByLabelText('Your answer'), 'Answer for the first question');
    await user.click(screen.getByRole('link', { name: 'Next question' }));
    await screen.findByRole('heading', { name: 'State the law of total probability.' });
    expect(screen.getByLabelText('Your answer')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Record response' })).toBeDisabled();
  });
});
