import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clerk = vi.hoisted(() => ({
  loaded: false,
  user: null as null | { id: string; username: string; primaryEmailAddress: { emailAddress: string } },
  getToken: vi.fn(async () => 'token'), signOut: vi.fn(async () => {})
}));
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ isLoaded: clerk.loaded, getToken: clerk.getToken, signOut: clerk.signOut, sessionId: clerk.user ? 'session-1' : null }),
  useUser: () => ({ isLoaded: clerk.loaded, user: clerk.user })
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_BACKEND', 'fastapi'); vi.stubEnv('VITE_API_URL', '/api');
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_synthetic');
  clerk.loaded = false; clerk.user = null;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    id: '0199d613-7d64-70c6-9046-3c919f48d974',
    email: 'alex@example.com',
    username: 'alex',
    profile: {}
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('Clerk provider lifecycle', () => {
  it('gates app startup until Clerk is loaded and the compatibility runtime is bound', async () => {
    const { default: Runtime } = await import('@/components/auth/ClerkRuntime');
    const { fastapiClient } = await import('@/lib/fastapi-client');
    const view = render(<Runtime><p>Authenticated application</p></Runtime>);
    expect(screen.queryByText('Authenticated application')).toBeNull();
    clerk.loaded = true;
    clerk.user = { id: 'user_a', username: 'alex', primaryEmailAddress: { emailAddress: 'alex@example.com' } };
    view.rerender(<Runtime><p>Authenticated application</p></Runtime>);
    expect(await screen.findByText('Authenticated application')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/me', expect.objectContaining({
      headers: { Authorization: 'Bearer token' }, cache: 'no-store'
    }));
    expect((await fastapiClient.auth.getSession()).data.session?.user).toMatchObject({
      id: '0199d613-7d64-70c6-9046-3c919f48d974', email: 'alex@example.com'
    });
    const changed = vi.fn();
    const subscription = fastapiClient.auth.onAuthStateChange(changed);
    await waitFor(() => expect(changed).toHaveBeenCalled());
    clerk.user = null;
    await act(async () => view.rerender(<Runtime><p>Authenticated application</p></Runtime>));
    await waitFor(() => expect(changed).toHaveBeenCalledWith('SIGNED_OUT', null));
    subscription.data.subscription.unsubscribe();
  });

  it('shows an account error instead of mounting with an external provider id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      JSON.stringify({ detail: 'Authentication mapping is invalid' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    ));
    clerk.loaded = true;
    clerk.user = { id: 'user_a', username: 'alex', primaryEmailAddress: { emailAddress: 'alex@example.com' } };
    const { default: Runtime } = await import('@/components/auth/ClerkRuntime');
    render(<Runtime><p>Authenticated application</p></Runtime>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication mapping is invalid');
    expect(screen.queryByText('Authenticated application')).toBeNull();
  });

  it('blocks invalid cutover configuration without mounting the app or a sandbox', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    const { default: Provider } = await import('@/components/auth/AuthProvider');
    render(<Provider><p>App with data writes</p></Provider>);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in configuration needs attention');
    expect(screen.queryByText('App with data writes')).toBeNull();
  });
});
