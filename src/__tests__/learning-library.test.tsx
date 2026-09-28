import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LearningLibrary from '@/pages/LearningLibrary';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/backend-config', () => ({ backendConfig: { fastapi: true } }));
vi.mock('@/lib/fastapi-client', () => ({ apiRequest }));

describe('Learning Library', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('reuses a save key after an uncertain failure and opens the persisted concept', async () => {
    let saves = 0;
    apiRequest.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/learning/search')) {
        return { items: [], next_offset: null, total_matches: 0, complete: true };
      }
      if (path === '/v1/learning/captures') {
        saves += 1;
        if (saves === 1) throw new Error('Connection interrupted');
        return { concept_ids: ['concept-one'] };
      }
      if (path.startsWith('/v1/learning/concepts/concept-one')) {
        return {
          page: {
            id: 'concept-one', subject: 'Probability', topic: 'Bayes',
            concept: 'Normalization', summary: 'Normalize the weights.',
            version: 1, updated_at: '2026-09-28T00:00:00Z'
          },
          insights: [{
            id: 'insight-one', version: 1, core_idea: 'Normalize the weights.',
            full_explanation: 'Divide each weight by the total.',
            reasoning_origin: 'none', conditions: [], exceptions: [], examples: [],
            recognition_cues: [], unresolved_questions: []
          }],
          sources: [{
            id: 'source-one', captured_at: '2026-09-28T00:00:00Z',
            sources: [{ title: 'Study chat', kind: 'manual', excerpt: 'Weights sum to one.' }]
          }],
          complete: true
        };
      }
      throw new Error(`Unexpected API path: ${path}`);
    });

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/learning-library']}>
      <Routes>
        <Route path="/learning-library" element={<LearningLibrary />} />
        <Route path="/learning-library/:conceptId" element={<LearningLibrary />} />
      </Routes>
    </MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Add an insight' }));
    await user.type(screen.getByLabelText('Subject'), 'Probability');
    await user.type(screen.getByLabelText('Topic'), 'Bayes');
    await user.type(screen.getByLabelText('Concept'), 'Normalization');
    await user.type(screen.getByLabelText('Quick recall'), 'Normalize the weights.');
    await user.type(screen.getByLabelText('Full explanation'), 'Divide each weight by the total.');
    await user.clear(screen.getByLabelText('Source name'));
    await user.type(screen.getByLabelText('Source name'), 'Study chat');
    await user.click(screen.getByRole('button', { name: 'Save insight' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    await user.click(screen.getByRole('button', { name: 'Save insight' }));

    expect(await screen.findByText('Divide each weight by the total.')).toBeInTheDocument();
    expect(screen.getByText('Weights sum to one.')).toBeInTheDocument();
    await waitFor(() => expect(saves).toBe(2));
    const bodies = apiRequest.mock.calls
      .filter(([path]) => path === '/v1/learning/captures')
      .map(([, init]) => JSON.parse(init.body));
    expect(bodies[0].idempotency_key).toBe(bodies[1].idempotency_key);
  });
});
