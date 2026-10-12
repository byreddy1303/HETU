import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClerkAPIResponseError } from '@clerk/react/errors';
const clerk = vi.hoisted(() => ({ create: vi.fn(), setActive: vi.fn(), status: 'signed_out' }));
vi.mock('@clerk/react/legacy', () => ({ useSignIn: () => ({
  isLoaded: true, signIn: { create: clerk.create }, setActive: clerk.setActive
}) }));
vi.mock('@clerk/react', () => ({ SignIn: ({ forceRedirectUrl }: { forceRedirectUrl: string }) =>
  <p data-return-path={forceRedirectUrl}>Additional sign-in verification</p>
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ status: clerk.status }) }));
import ClerkAuth from '@/pages/ClerkAuth';
beforeEach(() => {
  clerk.create.mockReset(); clerk.setActive.mockReset().mockResolvedValue(undefined);
  clerk.status = 'signed_out';
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function submit(initialEntry = '/auth') {
  render(<MemoryRouter initialEntries={[initialEntry]}><ClerkAuth /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'alex' } });
  fireEvent.change(screen.getByLabelText('Password or existing PIN'), { target: { value: 'synthetic-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}
it('activates only a completed provider session', async () => {
  clerk.create.mockResolvedValue({ status: 'complete', createdSessionId: 'session-synthetic' });
  submit();
  await waitFor(() => expect(clerk.setActive).toHaveBeenCalledWith({ session: 'session-synthetic' }));
  expect(clerk.create).toHaveBeenCalledWith({ identifier: 'alex', password: 'synthetic-password', strategy: 'password' });
});
it('offers verification instead of activating a pending session', async () => {
  clerk.create.mockResolvedValue({ status: 'needs_second_factor' });
  submit();
  expect(await screen.findByText('Additional sign-in verification')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('additional verification');
  expect(clerk.setActive).not.toHaveBeenCalled();
});
it.each(['form_password_compromised', 'form_password_pwned'])(
  'explains %s and offers provider recovery without activating a session', async (code) => {
    clerk.create.mockRejectedValue(new ClerkAPIResponseError('Password rejected', {
      status: 422, data: [{ code, message: 'Password rejected' }]
    }));
    submit();
    expect(await screen.findByText('Additional sign-in verification')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('requires a security reset');
    expect(clerk.setActive).not.toHaveBeenCalled();
  }
);
it('shows the provider lockout duration and allows a later retry', async () => {
  clerk.create.mockRejectedValue(new ClerkAPIResponseError('Locked', {
    status: 403, data: [{ code: 'user_locked', message: 'Locked',
      long_message: 'Your account is locked. Try again in 30 minutes.' }]
  }));
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 30 minutes');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  expect(clerk.setActive).not.toHaveBeenCalled();
});
it('keeps incorrect credentials generic and distinguishes a service outage', async () => {
  clerk.create.mockRejectedValueOnce(new ClerkAPIResponseError('Incorrect', {
    status: 422, data: [{ code: 'form_identifier_not_found', message: 'Unknown user' }]
  })).mockRejectedValueOnce(new ClerkAPIResponseError('Unavailable', { status: 503, data: [] }));
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your username or email and password');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable'));
  expect(clerk.setActive).not.toHaveBeenCalled();
});
it('releases a stuck sign-in and never activates its late result', async () => {
  vi.useFakeTimers();
  let finish!: (value: object) => void;
  clerk.create.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  submit();
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(screen.getByRole('alert')).toHaveTextContent('took too long');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  await act(async () => { finish({ status: 'complete', createdSessionId: 'late-session' }); });
  expect(clerk.setActive).not.toHaveBeenCalled();
});

it('keeps the OAuth continuation when additional verification is needed', async () => {
  clerk.create.mockResolvedValue({ status: 'needs_second_factor' });
  const returnPath = '/__clerk/oauth/authorize/continue?client_id=synthetic&state=test%2Bvalue';
  submit(`/auth?redirect_url=${encodeURIComponent(returnPath)}`);
  expect(await screen.findByText('Additional sign-in verification'))
    .toHaveAttribute('data-return-path', returnPath);
});

it('returns an already signed-in learner to the original consent request', async () => {
  clerk.status = 'signed_in';
  const returnPath = '/oauth-consent?client_id=synthetic&scope=hetu%3Aread&state=test%2Bvalue';
  function Destination() {
    const location = useLocation();
    return <p>{location.pathname + location.search}</p>;
  }
  render(<MemoryRouter initialEntries={[`/auth?redirect_url=${encodeURIComponent(returnPath)}`]}>
    <Routes>
      <Route path="/auth" element={<ClerkAuth />} />
      <Route path="/oauth-consent" element={<Destination />} />
    </Routes>
  </MemoryRouter>);
  expect(await screen.findByText(returnPath)).toBeInTheDocument();
});
