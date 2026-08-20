import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RequireAuth from '@/components/shared/RequireAuth';
import { useAuth } from '@/hooks/useAuth';

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/pages/Landing', () => ({
  default: () => <h1>Public HETU landing</h1>
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderGuard(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="*"
          element={
            <RequireAuth>
              <h1>Private app shell</h1>
            </RequireAuth>
          }
        />
        <Route path="/auth" element={<h1>Sign in route</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireAuth public landing boundary', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      status: 'signed_out',
      user: null,
      profile: null,
      sandbox: false,
      userId: null
    });
  });

  it('shows the public landing page to a signed-out visitor at the root', async () => {
    renderGuard('/');

    expect(await screen.findByRole('heading', { name: 'Public HETU landing' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Private app shell' })).not.toBeInTheDocument();
  });

  it('keeps private routes behind sign-in', async () => {
    renderGuard('/planner');

    expect(await screen.findByRole('heading', { name: 'Sign in route' })).toBeVisible();
  });

  it('keeps the existing app shell at the root for signed-in learners', () => {
    mockedUseAuth.mockReturnValue({
      status: 'signed_in',
      user: null,
      profile: null,
      sandbox: true,
      userId: null
    });

    renderGuard('/');

    expect(screen.getByRole('heading', { name: 'Private app shell' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Public HETU landing' })).not.toBeInTheDocument();
  });
});
