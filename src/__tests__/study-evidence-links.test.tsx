import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import StudyEvidenceLinks, { type EvidenceLink } from '@/components/learning/StudyEvidenceLinks';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/fastapi-client', () => ({ apiRequest }));
const evidence = {
  id: 'formula-1', collection: 'formulas', title: 'Bayes denominator', section: 'Formulas',
  section_path: '/formulas', version: 1, updated_at: '2026-10-02T00:00:00Z'
};
beforeEach(() => { apiRequest.mockReset(); });

it('finds real evidence, preserves the retry key, displays full content, and removes a versioned connection', async () => {
  let saved: EvidenceLink[] = [];
  let writes = 0;
  apiRequest.mockImplementation(async (path: string, init?: { body: string }) => {
    if (path.startsWith('/v1/learning/evidence?')) return { items: [evidence], complete: true, next_offset: null };
    if (path === '/v1/learning/evidence/formulas/formula-1') return { summary: evidence, item: { expression: 'P(E) = sum P(E|H)P(H)', id: 'formula-1' } };
    if (path === '/v1/learning/evidence-links') {
      writes++;
      const draft = JSON.parse(init!.body);
      saved = [{ ...draft, id: 'link-1', version: writes === 1 ? 1 : 2, evidence }];
      if (writes === 1) throw new Error('Response lost. Retry the connection.');
      return saved[0];
    }
    throw new Error(`Unexpected path ${path}`);
  });
  function Harness() {
    const [links, setLinks] = useState<EvidenceLink[]>([]);
    return <StudyEvidenceLinks conceptId="concept-1" links={links} onChanged={async () => { setLinks([...saved]); }} />;
  }
  render(<MemoryRouter><Harness /></MemoryRouter>);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Study section'), 'formulas');
  await user.type(screen.getByLabelText('Find study evidence'), 'Bayes');
  await user.click(screen.getByRole('button', { name: 'Search evidence' }));
  await user.type(await screen.findByLabelText('How this connects'), 'Normalizes the posterior.');
  await user.click(screen.getByRole('button', { name: 'Save evidence connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Response lost');
  await user.click(screen.getByRole('button', { name: 'Save evidence connection' }));
  expect(await screen.findByText('Normalizes the posterior.')).toBeInTheDocument();
  const bodies = apiRequest.mock.calls.filter(([path]) => path === '/v1/learning/evidence-links').map(([, init]) => JSON.parse(init.body));
  expect(bodies[0].idempotency_key).toBe(bodies[1].idempotency_key);
  await user.click(screen.getByRole('button', { name: 'Read evidence' }));
  const detail = await screen.findByRole('complementary', { name: 'Study evidence details' });
  expect(within(detail).getByText('P(E) = sum P(E|H)P(H)')).toBeInTheDocument();
  expect(within(detail).getByRole('link', { name: 'Open Formulas' })).toHaveAttribute('href', '/formulas');
  await user.click(screen.getByRole('button', { name: 'Remove connection' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Read evidence' })).not.toBeInTheDocument());
  const lastWrite = apiRequest.mock.calls.filter(([path]) => path === '/v1/learning/evidence-links').at(-1)!;
  expect(JSON.parse(lastWrite[1].body)).toMatchObject({ active: false, expected_version: 2 });
});
