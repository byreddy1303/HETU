import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import Mocks from '@/pages/Mocks';

const USER = '11111111-1111-4111-8111-111111111111';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userId: USER, status: 'signed_in', sandbox: true })
}));

describe('mock log UI', () => {
  beforeEach(async () => {
    await db.mock_tests.clear();
  });

  it('rejects inconsistent totals, then saves and deletes a valid mock', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/mocks?new=1&date=2026-08-10']}>
        <Mocks />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Mock name'), 'Full length 04');
    await user.type(screen.getByLabelText('Score'), '54.5');
    await user.type(screen.getByLabelText('Correct'), '40');
    await user.type(screen.getByLabelText('Wrong'), '10');
    await user.type(screen.getByLabelText('Skipped'), '10');
    await user.type(screen.getByLabelText('Mistake 1'), 'Spent too long on aptitude.');
    await user.click(screen.getByRole('button', { name: 'Save mock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must add up to total questions/i);

    await user.clear(screen.getByLabelText('Skipped'));
    await user.type(screen.getByLabelText('Skipped'), '15');
    await user.click(screen.getByRole('button', { name: 'Save mock' }));

    expect(await screen.findByText('Full length 04')).toBeInTheDocument();
    await waitFor(async () => {
      const rows = await db.mock_tests.where('user_id').equals(USER).toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        total_marks: 54.5,
        correct: 40,
        wrong: 10,
        skipped: 15,
        mistakes: ['Spent too long on aptitude.']
      });
    });

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(async () => expect(await db.mock_tests.count()).toBe(0));
    expect(await screen.findByText('No mocks recorded')).toBeInTheDocument();
  });
});
