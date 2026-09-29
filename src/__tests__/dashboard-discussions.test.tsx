import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiscussionLibraryCard from '@/components/dashboard/DiscussionLibraryCard';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/backend-config', () => ({ backendConfig: { fastapi: true } }));
vi.mock('@/lib/fastapi-client', () => ({ apiRequest }));

describe('dashboard saved discussions', () => {
  beforeEach(() => apiRequest.mockReset());

  it('shows recent organized concepts and opens the full Library record', async () => {
    apiRequest.mockResolvedValue({
      items: [{
        id: 'concept-1', subject: 'Probability', topic: 'Bayesian inference',
        concept: 'Posterior normalization', summary: 'Normalize prior times likelihood.'
      }],
      total_matches: 1,
      complete: true
    });
    render(<MemoryRouter><DiscussionLibraryCard userId="learner-1" /></MemoryRouter>);

    expect(await screen.findByText('Posterior normalization')).toBeInTheDocument();
    expect(screen.getByText('Probability / Bayesian inference')).toBeInTheDocument();
    expect(screen.getByText('1 saved concept · most recent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Probability / Bayesian inference: Posterior normalization' }))
      .toHaveAttribute('href', '/learning-library/concept-1');
    expect(apiRequest).toHaveBeenCalledWith('/v1/learning/search?limit=3&offset=0');
  });
});
