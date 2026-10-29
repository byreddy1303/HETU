import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LearningMemory from '@/pages/LearningMemory';
import { getMemoryEntry, listMemoryEntries, newMemoryEntry } from '@/lib/study-memory';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: 'owner', profile: { timezone: 'Asia/Kolkata' } })
}));
vi.mock('@/lib/backend-config', () => ({ backendConfig: { isLocal: true } }));
vi.mock('@/lib/study-memory', async (load) => ({
  ...(await load<typeof import('@/lib/study-memory')>()),
  listMemoryEntries: vi.fn(),
  getMemoryEntry: vi.fn()
}));
vi.mock('@/components/layout/PageHeader', () => ({ default: () => <h1>Learning Memory</h1> }));
vi.mock('@/components/memory/LocalLearningEngine', () => ({
  default: () => <section aria-label="Prepared practice">Prepared follow-ups</section>
}));
vi.mock('@/components/memory/StudyHistoryBrowser', () => ({
  default: () => <section aria-label="Study history">Saved history</section>
}));
vi.mock('@/components/memory/MemoryEntryEditor', () => ({
  default: ({ initial }: { initial: { title: string } }) => (
    <section aria-label="Record editor">{initial.title}</section>
  )
}));
const entry = newMemoryEntry('repair', 'one', 'The secret answer is B', {
  user_id: 'owner',
  topic: 'Memory Management',
  data: { activity: 'retry', duration_min: 10 },
  content: 'Use B to solve it'
});
function mount(path = '/memory') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/memory/:entryId?" element={<LearningMemory />} />
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(listMemoryEntries).mockResolvedValue({ items: [entry], total: 1, has_more: false });
  vi.mocked(getMemoryEntry).mockResolvedValue({ entry, revisions: [] } as never);
});
describe('focused Learning Memory sections', () => {
  it('opens one view at a time without repeating follow-ups above history or records', async () => {
    mount();
    expect(screen.getByRole('region', { name: 'Study history' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Prepared practice' })).not.toBeInTheDocument();
    expect(listMemoryEntries).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Practice follow-ups' }));
    expect(screen.getByRole('region', { name: 'Prepared practice' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Study history' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Saved records' }));
    expect(
      await screen.findByRole('link', { name: /Memory Management: Retry the original question/ })
    ).toBeVisible();
    expect(screen.queryByText(/secret answer|Use B/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Prepared practice' })).not.toBeInTheDocument();
  });
  it('opens a linked record directly and can create a concept without leaving a background action list', async () => {
    mount('/memory/one');
    expect(await screen.findByRole('region', { name: 'Record editor' })).toHaveTextContent(
      entry.title
    );
    expect(screen.getByRole('button', { name: 'Saved records' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByRole('region', { name: 'Prepared practice' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add record'));
    fireEvent.click(screen.getByRole('button', { name: 'Add concept' }));
    expect(screen.getByRole('region', { name: 'Record editor' })).toHaveTextContent('New concept');
  });
});
