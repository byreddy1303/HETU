import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadLabValues, saveLabValue } from '@/lib/lab-storage';
import LinearAlgebraLab from '@/pages/LinearAlgebraLab';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ userId: 'account-a' }) }));
vi.mock('@/lib/lab-storage', async (original) => ({
  ...await original<typeof import('@/lib/lab-storage')>(),
  loadLabValues: vi.fn(), saveLabValue: vi.fn()
}));
beforeEach(() => {
  vi.mocked(loadLabValues).mockReset().mockResolvedValue({ 'la-hub::theme': 'light' });
  vi.mocked(saveLabValue).mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

function renderLab() {
  const router = createMemoryRouter([
    { path: '/linear-algebra-lab', element: <LinearAlgebraLab /> },
    { path: '/topper-notes', element: <p>Notes library</p> }
  ], { initialEntries: ['/linear-algebra-lab'] });
  return render(<RouterProvider router={router} />);
}

it('blocks the interactive lab if database loading fails and allows retry', async () => {
  vi.mocked(loadLabValues).mockRejectedValueOnce(new Error('Database unavailable'));
  renderLab();
  expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
  expect(screen.queryByTitle('Linear Algebra lessons and practice')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByTitle('Linear Algebra lessons and practice')).toBeInTheDocument();
  expect(loadLabValues).toHaveBeenCalledWith('account-a');
});

it('hydrates the embedded lab from the account and finishes online saving before navigation', async () => {
  let finish!: () => void;
  vi.mocked(saveLabValue).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  renderLab();
  const frame = await screen.findByTitle('Linear Algebra lessons and practice') as HTMLIFrameElement & { hetuLabStorage: Storage };
  expect(frame.hetuLabStorage.getItem('la-hub::theme')).toBe('light');
  act(() => frame.hetuLabStorage.setItem('gate_la_m1_c1_attempted', '[1]'));
  expect(saveLabValue).toHaveBeenCalledWith('account-a', 'gate_la_m1_c1_attempted', '[1]');
  fireEvent.click(screen.getByRole('link', { name: 'Back to notes' }));
  expect(screen.queryByText('Notes library')).toBeNull();
  expect(screen.getByText('Finishing your save before leaving the lab…')).toBeInTheDocument();
  await act(async () => finish());
  await waitFor(() => expect(screen.getByText('Notes library')).toBeInTheDocument());
});
