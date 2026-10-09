import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RevisionPack from '@/pages/RevisionPack';
import type { LearningRevisionPack } from '@/lib/learning-revision-pack';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/fastapi-client', () => ({ apiRequest }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ userId: 'learner-one' }) }));

function pack(hash = 'a'.repeat(64)): LearningRevisionPack {
  return {
    as_of: '2026-10-09',
    timezone: 'Asia/Kolkata',
    subject: null,
    limit: 10,
    content_hash: hash,
    retrieved_at: '2026-10-09T01:00:00Z',
    complete: true,
    has_more: {},
    totals_within_scan: {},
    text: 'HETU REVISION PACK\nNormalization\nSource: Study discussion\nFull explanation: https://hetu.test/learning-library/concept-one',
    sections: {
      weekly_focus: null,
      due_formulas: [],
      triggers: [],
      repeated_mistakes: [],
      priority_questions: [],
      due_reviews: [
        {
          id: 'review-one',
          version: 1,
          url: '/concept-review/review-one',
          kind: 'recall',
          prompt: 'Why normalize the weights?',
          due_on: '2026-10-09'
        }
      ],
      saved_concepts: [
        {
          id: 'concept-one',
          version: 1,
          url: '/learning-library/concept-one',
          subject: 'Probability',
          topic: 'Bayes',
          concept: 'Normalization',
          summary: 'Divide each weight by the total.',
          reasoning_origin: 'learner_stated',
          reasoning_correction: 'Likelihoods need not sum to one.',
          recognition_cues: ['Different hypothesis weights'],
          recognition_cue_count: 1,
          retrieval_question: 'Explain the denominator.',
          due_review: true,
          sources_complete: true,
          sources: [
            {
              id: 'source-one',
              captured_at: '2026-10-08T00:00:00Z',
              sources: [
                {
                  title: 'Study discussion',
                  kind: 'conversation',
                  url: 'https://example.com/notes'
                }
              ]
            }
          ],
          evidence_links_complete: true,
          evidence_links: [
            {
              link_id: 'evidence-one',
              rationale: 'Practice the normalization step.',
              record: {
                title: 'Bayes formula',
                section: 'Formulas',
                section_path: '/formulas',
                version: 1
              }
            }
          ]
        }
      ]
    }
  };
}

describe('Python revision pack', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows sourced discussions, saves with retry safety, and opens the stored snapshot', async () => {
    const preview = pack();
    let saves = 0;
    apiRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/revision-pack?limit=10') return preview;
      if (path === '/v1/revision-pack/saved') {
        saves += 1;
        if (saves === 1) throw new Error('Save response interrupted. Retry the save.');
        return { id: 'pack-one', snapshot: preview, idempotent_replay: true };
      }
      if (path === '/v1/revision-pack/saved/pack-one') return { id: 'pack-one', snapshot: preview };
      if (path.startsWith('/v1/revision-pack/saved?'))
        return {
          items: saves >= 2 ? [{ id: 'pack-one', as_of: '2026-10-09', subject: null }] : [],
          next_offset: null,
          complete: true
        };
      throw new Error(`Unexpected path: ${path}`);
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/revision-pack']}>
        <RevisionPack />
      </MemoryRouter>
    );
    expect(await screen.findByText('Likelihoods need not sum to one.')).toBeInTheDocument();
    expect(screen.getByText('From your stated reasoning')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Study discussion' })).toHaveAttribute(
      'href',
      'https://example.com/notes'
    );
    expect(
      screen.getByRole('link', { name: 'Full explanation, sources and history' })
    ).toHaveAttribute('href', '/learning-library/concept-one');
    expect(screen.getByRole('link', { name: 'Open review' })).toHaveAttribute(
      'href',
      '/concept-review/review-one'
    );
    expect(screen.getByText('Practice the normalization step.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save pack' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save response interrupted');
    await user.click(screen.getByRole('button', { name: 'Save pack' }));
    expect(await screen.findByText(/This saved sheet keeps the evidence/)).toBeInTheDocument();
    const bodies = apiRequest.mock.calls
      .filter(([path]) => path === '/v1/revision-pack/saved')
      .map(([, init]) => JSON.parse(init.body));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0].expected_content_hash).toBe(preview.content_hash);
    expect(screen.getByRole('button', { name: 'Save pack' })).toBeDisabled();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(screen.getByRole('button', { name: 'Copy as text' }));
    expect(writeText).toHaveBeenCalledWith(preview.text);
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('/v1/revision-pack/saved/pack-one')
    );
  });

  it('refreshes changed evidence before another save instead of silently overwriting', async () => {
    let generation = 0;
    apiRequest.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/revision-pack?'))
        return pack(generation ? 'b'.repeat(64) : 'a'.repeat(64));
      if (path === '/v1/revision-pack/saved')
        throw new Error('Revision evidence changed; refresh the preview before saving');
      if (path.startsWith('/v1/revision-pack/saved?'))
        return { items: [], next_offset: null, complete: true };
      throw new Error(`Unexpected path: ${path}`);
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RevisionPack />
      </MemoryRouter>
    );
    await screen.findByText('Divide each weight by the total.');
    await user.click(screen.getByRole('button', { name: 'Save pack' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Revision evidence changed');
    generation = 1;
    await user.click(screen.getByRole('button', { name: 'Build current pack' }));
    await screen.findByText('Divide each weight by the total.');
    await user.click(screen.getByRole('button', { name: 'Save pack' }));
    await screen.findByRole('alert');
    const bodies = apiRequest.mock.calls
      .filter(([path]) => path === '/v1/revision-pack/saved')
      .map(([, init]) => JSON.parse(init.body));
    expect(bodies[0].expected_content_hash).toBe('a'.repeat(64));
    expect(bodies[1].expected_content_hash).toBe('b'.repeat(64));
  });

  it('distinguishes unavailable evidence from an empty or complete pack', async () => {
    apiRequest.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/revision-pack?')) throw new Error('Account connection unavailable');
      return { items: [], next_offset: null, complete: true };
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RevisionPack />
      </MemoryRouter>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Account connection unavailable');
    expect(screen.queryByText('Nothing to pack in the retrieved evidence')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save pack' })).toBeDisabled();
    const partial = pack();
    partial.complete = false;
    apiRequest.mockImplementation(async (path: string) =>
      path.startsWith('/v1/revision-pack?')
        ? partial
        : { items: [], next_offset: null, complete: true }
    );
    await user.click(screen.getByRole('button', { name: 'Build current pack' }));
    expect(
      await screen.findByText(/Partial retrieval: older records may be missing/)
    ).toBeInTheDocument();
  });
});
