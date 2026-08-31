import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flushAllDurableState: vi.fn(),
  unregisterCurrentPushDevice: vi.fn(),
  authSignOut: vi.fn(),
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

vi.mock('@/lib/durability', () => ({
  flushAllDurableState: mocks.flushAllDurableState
}));

vi.mock('@/lib/buddyNotifications', () => ({
  unregisterCurrentPushDevice: mocks.unregisterCurrentPushDevice
}));

vi.mock('@/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      signOut: mocks.authSignOut,
      getSession: vi.fn(),
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

describe('authenticated sign-out durability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      status: 'signed_in',
      user: { id: USER_ID } as User,
      profile: null,
      sandbox: false
    });
    mocks.flushAllDurableState.mockResolvedValue({ ok: true });
    mocks.unregisterCurrentPushDevice.mockResolvedValue(undefined);
    mocks.authSignOut.mockResolvedValue({ error: null });
    mocks.wipeLocalState.mockResolvedValue(undefined);
    mocks.startAccountStateSync.mockResolvedValue(undefined);
  });

  it('rechecks durability after push cleanup, freezes writers, then clears the cache', async () => {
    const result = await useAuthStore.getState().signOut();

    expect(result).toEqual({});
    expect(mocks.flushAllDurableState).toHaveBeenNthCalledWith(1, USER_ID);
    expect(mocks.flushAllDurableState).toHaveBeenNthCalledWith(2, USER_ID);
    expect(mocks.unregisterCurrentPushDevice).toHaveBeenCalledTimes(1);
    expect(mocks.stopAccountStateSync).toHaveBeenCalledWith(USER_ID);
    expect(mocks.stopSync).toHaveBeenCalledTimes(1);
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expect(mocks.wipeLocalState).toHaveBeenCalledTimes(1);

    const firstBarrier = mocks.flushAllDurableState.mock.invocationCallOrder[0];
    const pushCleanup = mocks.unregisterCurrentPushDevice.mock.invocationCallOrder[0];
    const finalBarrier = mocks.flushAllDurableState.mock.invocationCallOrder[1];
    const listenerStop = mocks.stopAccountStateSync.mock.invocationCallOrder[0];
    const authSignOut = mocks.authSignOut.mock.invocationCallOrder[0];
    const localWipe = mocks.wipeLocalState.mock.invocationCallOrder[0];
    expect(firstBarrier).toBeLessThan(pushCleanup);
    expect(pushCleanup).toBeLessThan(finalBarrier);
    expect(finalBarrier).toBeLessThan(listenerStop);
    expect(listenerStop).toBeLessThan(authSignOut);
    expect(authSignOut).toBeLessThan(localWipe);

    expect(useAuthStore.getState()).toMatchObject({
      status: 'signed_out',
      user: null,
      profile: null
    });
  });

  it('keeps the account and device cache intact when the final barrier fails', async () => {
    mocks.flushAllDurableState
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'A late edit is still pending.' });

    const result = await useAuthStore.getState().signOut();

    expect(result).toEqual({ error: 'A late edit is still pending.' });
    expect(mocks.authSignOut).not.toHaveBeenCalled();
    expect(mocks.stopAccountStateSync).not.toHaveBeenCalled();
    expect(mocks.stopSync).not.toHaveBeenCalled();
    expect(mocks.wipeLocalState).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed_in', user: { id: USER_ID } });
  });

  it('restores database listeners when Supabase refuses to sign out', async () => {
    mocks.authSignOut.mockResolvedValue({ error: { message: 'Sign-out request failed.' } });

    const result = await useAuthStore.getState().signOut();

    expect(result).toEqual({ error: 'Sign-out request failed.' });
    expect(mocks.stopAccountStateSync).toHaveBeenCalledWith(USER_ID);
    expect(mocks.stopSync).toHaveBeenCalledTimes(1);
    expect(mocks.initSync).toHaveBeenCalledWith(USER_ID);
    expect(mocks.startAccountStateSync).toHaveBeenCalledWith(USER_ID);
    expect(mocks.wipeLocalState).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed_in', user: { id: USER_ID } });
  });

  it('reports incomplete local cleanup without pretending the account is still signed in', async () => {
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
});
