import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  unregisterCurrentPushDevice: vi.fn(),
  authSignOut: vi.fn(),
  authGetSession: vi.fn(),
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
      onAuthStateChange: vi.fn(),
      setSession: vi.fn()
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

import { useAuthStore } from '@/stores/auth';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('authenticated sign-out (online-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      status: 'signed_in',
      user: { id: USER_ID } as User,
      profile: null,
      sandbox: false
    });
    mocks.unregisterCurrentPushDevice.mockResolvedValue(undefined);
    mocks.authSignOut.mockResolvedValue({ error: null });
    mocks.authGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.wipeLocalState.mockResolvedValue(undefined);
    mocks.startAccountStateSync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('revokes the session and clears RAM without any durability barrier', async () => {
    const result = await useAuthStore.getState().signOut();

    expect(result).toEqual({});
    expect(mocks.unregisterCurrentPushDevice).toHaveBeenCalledTimes(1);
    expect(mocks.stopAccountStateSync).toHaveBeenCalledWith(USER_ID);
    expect(mocks.stopSync).toHaveBeenCalledTimes(1);
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expect(mocks.authSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.wipeLocalState).toHaveBeenCalledTimes(1);
    expect(mocks.initSync).not.toHaveBeenCalled();
    expect(mocks.startAccountStateSync).not.toHaveBeenCalled();

    // Ordering is strictly: push cleanup, stop account listeners, stop sync,
    // revoke the session, then drop the RAM cache.
    const pushCleanup = mocks.unregisterCurrentPushDevice.mock.invocationCallOrder[0];
    const listenerStop = mocks.stopAccountStateSync.mock.invocationCallOrder[0];
    const syncStop = mocks.stopSync.mock.invocationCallOrder[0];
    const authSignOut = mocks.authSignOut.mock.invocationCallOrder[0];
    const localWipe = mocks.wipeLocalState.mock.invocationCallOrder[0];
    expect(pushCleanup).toBeLessThan(listenerStop);
    expect(listenerStop).toBeLessThan(syncStop);
    expect(syncStop).toBeLessThan(authSignOut);
    expect(authSignOut).toBeLessThan(localWipe);

    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_out',
      user: null,
      profile: null
    });
  });

  it('finishes sign-out even when push cleanup hangs, bounded by a timeout', async () => {
    vi.useFakeTimers();
    mocks.unregisterCurrentPushDevice.mockReturnValue(new Promise(() => {}));

    const pending = useAuthStore.getState().signOut({ force: true });
    // Force sign-out puts a 2000ms leash on push cleanup.
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;

    expect(result).toEqual({});
    expect(mocks.wipeLocalState).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed_out', user: null });
  });

  it('reports incomplete local cleanup while still finishing sign-out', async () => {
    mocks.wipeLocalState.mockRejectedValue(new Error('Offline database remained open.'));

    const result = await useAuthStore.getState().signOut();

    expect(result.error).toContain('You are signed out and your database data is safe');
    expect(result.error).toContain('Offline database remained open.');
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_out',
      user: null,
      profile: null
    });
    expect(mocks.initSync).not.toHaveBeenCalled();
    expect(mocks.startAccountStateSync).not.toHaveBeenCalled();
  });

  it('restores database listeners when Supabase refuses to sign out', async () => {
    mocks.authSignOut.mockResolvedValue({ error: { message: 'Sign-out request failed.' } });
    mocks.authGetSession.mockResolvedValue({ data: { session: { user: { id: USER_ID } } } });

    const result = await useAuthStore.getState().signOut();

    expect(result).toEqual({ error: 'Sign-out request failed.' });
    expect(mocks.stopAccountStateSync).toHaveBeenCalledWith(USER_ID);
    expect(mocks.stopSync).toHaveBeenCalledTimes(1);
    expect(mocks.initSync).toHaveBeenCalledWith(USER_ID);
    expect(mocks.startAccountStateSync).toHaveBeenCalledWith(USER_ID);
    expect(mocks.wipeLocalState).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed_in', user: { id: USER_ID } });
  });

  it('finishes local cleanup when auth-js reports an error after removing the session', async () => {
    mocks.authSignOut.mockResolvedValue({ error: { message: 'Revoke request failed.' } });
    mocks.authGetSession.mockResolvedValue({ data: { session: null } });

    const result = await useAuthStore.getState().signOut();

    expect(result).toEqual({});
    expect(mocks.wipeLocalState).toHaveBeenCalledTimes(1);
    expect(mocks.initSync).not.toHaveBeenCalled();
    expect(mocks.startAccountStateSync).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_out',
      user: null,
      profile: null
    });
  });

  it('handles sign-out cleanly when user is missing', async () => {
    useAuthStore.setState({ user: null });

    const result = await useAuthStore.getState().signOut();

    expect(result).toEqual({});
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_out',
      user: null,
      profile: null
    });
  });
});