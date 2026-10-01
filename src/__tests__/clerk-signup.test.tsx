import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({
  inspectInvite: vi.fn(),
  signupWithInvite: vi.fn()
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ status: 'signed_out' }) }));
vi.mock('@/lib/access', () => access);
vi.mock('@/components/shared/ThemeToggle', () => ({ default: () => null }));

import ClerkSignup from '@/pages/ClerkSignup';

function AuthTarget() {
  const [params] = useSearchParams();
  return <p>{params.get('created') === '1' ? 'account-created' : 'sign-in'}</p>;
}

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={['/signup?invite=invite-token-1234567890']}>
      <Routes>
        <Route path="/signup" element={<ClerkSignup />} />
        <Route path="/auth" element={<AuthTarget />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Clerk invite signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.inspectInvite.mockResolvedValue({ valid: true, email: 'student@example.com' });
    access.signupWithInvite.mockResolvedValue({ ok: true, user_id: 'internal-user' });
  });

  it('validates the invite, locks its email, creates the account, and sends the user to sign-in', async () => {
    renderSignup();

    const email = await screen.findByLabelText('Email');
    expect(email).toHaveValue('student@example.com');
    expect(email).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Student Name' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student_1' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-test-password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'a-long-test-password' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('account-created')).toBeInTheDocument();
    expect(access.inspectInvite).toHaveBeenCalledWith(
      'invite-token-1234567890',
      expect.any(AbortSignal)
    );
    expect(access.signupWithInvite).toHaveBeenCalledWith({
      invite_token: 'invite-token-1234567890',
      name: 'Student Name',
      username: 'student_1',
      email: 'student@example.com',
      password: 'a-long-test-password'
    });
  });

  it('keeps signup closed when the invitation is invalid', async () => {
    access.inspectInvite.mockRejectedValue(new Error('Invite is invalid, expired, or already used'));
    renderSignup();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invite is invalid, expired, or already used');
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
  });
});
