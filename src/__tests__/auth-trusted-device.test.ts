import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import {
  clearTrustedDevice,
  readTrustedDevice,
  rememberTrustedDevice
} from '@/lib/device-trust';
import type { useAuthStore as UseAuthStore } from '@/stores/auth';

const mocks = vi.hoisted(() => ({
  unregisterCurrentPushDevice: vi.fn(),
  authSignOut: vi.fn(),
  authGetSession: vi.fn(),
  authRefreshSession: vi.fn(),
  authSetSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  wipeLocalState: vi.fn(),
  initSync: vi.fn(),
  stopSync: vi.fn(),
  stopAccountStateSync: vi.fn(),
  startAccountStateSync: vi.fn(),
  from: vi.fn(),
  dbMetaGet: vi.fn(),
  dbMetaPut: vi.fn(),
  loginWithUsernamePin: vi.fn(),
  signupViaInvite: vi.fn()
}));

vi.mock('@/lib/buddyNotifications', () => ({
  unregisterCurrentPushDevice: mocks.unregisterCurrentPushDevice
}));

vi.mock('@/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      signOut: mocks.authSignOut,
      getSession: mocks.authGetSession,
      refreshSession: mocks.authRefreshSession,
      setSession: mocks.authSetSession,
      onAuthStateChange: mocks.onAuthStateChange
    },
    from: mocks.from
  }
}));

vi.mock('@/lib/isolation', () => ({
  wipeLocalState: mocks.wipeLocalState
}));

vi.mock('@/lib/sync', () => ({
  initSync: mocks.initSync,
  stopSync: mocks.stopSync
}));

vi.mock('@/lib/account-state', () => ({
  stopAccountStateSync: mocks.stopAccountStateSync,
  startAccountStateSync: mocks.startAccountStateSync
}));

vi.mock('@/lib/db', () => ({
  db: {
    meta: {
      get: mocks.dbMetaGet,
      put: mocks.dbMetaPut
    }
  }
}));

vi.mock('@/lib/edge', () => ({
  loginWithUsernamePin: mocks.loginWithUsernamePin,
  signupViaInvite: mocks.signupViaInvite
}));

type AuthStore = typeof UseAuthStore;

const USER_ID = '11111111-1111-4111-8111-111111111111';

// Each test gets a fresh auth-store module instance so the module-level `init`
// guard does not swallow successive boots.
async function freshAuthStore(): Promise<AuthStore> {
  vi.resetModules();
  const mod = await import('@/stores/auth');
  return mod.useAuthStore;
}

function mockProfileQuery() {
  mocks.from.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { id: USER_ID, username: 'alex' },
          error: null
        }))
      }))
    }))
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.onAuthStateChange.mockReturnValue(() => {});
  mocks.unregisterCurrentPushDevice.mockResolvedValue(undefined);
  mocks.wipeLocalState.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  clearTrustedDevice();
});

describe('auth trusted-device restore (remember this device)', () => {
  it('remembers a device after a successful username+PIN sign-in', async () => {
    mocks.loginWithUsernamePin.mockResolvedValue({
      ok: true,
      user: { id: USER_ID },
      access_token: 'at-1',
      refresh_token: 'rt-1',
      expires_in: 3600,
      token_type: 'bearer'
    });
    mocks.authSetSession.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mockProfileQuery();

    const store = await freshAuthStore();
    const result = await store.getState().signIn('alex', '123456');

    expect(result).toEqual({});
    expect(readTrustedDevice()).toMatchObject({
      userId: USER_ID,
      username: 'alex',
      refreshToken: 'rt-1'
    });
  });

  it('restores the session silently on boot when the session is missing', async () => {
    rememberTrustedDevice({ userId: USER_ID, username: 'alex', refreshToken: 'rt-2' });
    mocks.authGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.authRefreshSession.mockResolvedValue({
      data: {
        session: { user: { id: USER_ID }, refresh_token: 'rt-3' }
      },
      error: null
    });
    mockProfileQuery();

    const store = await freshAuthStore();
    store.getState().init();

    await vi.waitFor(() => {
      expect(store.getState().status).toBe('signed_in');
    });
    expect(store.getState().user?.id).toBe(USER_ID);
    expect(mocks.authRefreshSession).toHaveBeenCalledWith({ refresh_token: 'rt-2' });
    // The rotated refresh token is written back so the next boot still works.
    expect(readTrustedDevice()?.refreshToken).toBe('rt-3');
  });

  it('forgets the device when the stored refresh token is rejected on boot', async () => {
    rememberTrustedDevice({ userId: USER_ID, username: 'alex', refreshToken: 'rt-stale' });
    mocks.authGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.authRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'refresh token is invalid' }
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await freshAuthStore();
    store.getState().init();

    await vi.waitFor(() => {
      expect(readTrustedDevice()).toBeNull();
    });
    expect(warn).toHaveBeenCalled();
    expect(store.getState().status).toBe('signed_out');
  });

  it('sign-out forgets the trusted device', async () => {
    rememberTrustedDevice({ userId: USER_ID, username: 'alex', refreshToken: 'rt-1' });
    mocks.authSignOut.mockResolvedValue({ error: null });
    mocks.unregisterCurrentPushDevice.mockResolvedValue(undefined);

    const store = await freshAuthStore();
    store.setState({ status: 'signed_in', user: { id: USER_ID } as User, profile: null, sandbox: false });

    await store.getState().signOut();

    expect(readTrustedDevice()).toBeNull();
  });
});