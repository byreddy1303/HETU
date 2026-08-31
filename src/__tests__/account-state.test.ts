import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    upsert: vi.fn()
  };
  return { from: vi.fn(), query };
});

vi.mock('@/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    from: mocks.from,
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      setSession: vi.fn(),
      signOut: vi.fn()
    }
  }
}));

vi.mock('@/lib/durability', () => ({
  flushAllDurableState: vi.fn()
}));

import {
  flushAccountStateWrites,
  hasPendingAccountStateWrites,
  retryAccountStateSync,
  stopAccountStateSync
} from '@/lib/account-state';
import { useAuthStore } from '@/stores/auth';
import { useLogStore } from '@/stores/log';
import { usePrefsStore } from '@/stores/prefs';
import { useSessionStore } from '@/stores/session';

const USER_ID = '33333333-3333-4333-8333-333333333333';

function remoteAccountRows(dailyQuestionTarget = 41) {
  return [
    {
      namespace: 'preferences',
      payload: { schemaVersion: 1, data: { dailyQuestionTarget, colorTheme: 'light' } }
    },
    {
      namespace: 'active_session',
      payload: {
        schemaVersion: 1,
        data: {
          sessionId: 'remote-session',
          plannedCount: 8,
          questionStartedAt: 1_788_000_000_000,
          mode: 'solve',
          pendingTimeSpent: null
        }
      }
    },
    {
      namespace: 'log_draft',
      payload: {
        schemaVersion: 1,
        data: {
          mode: 'single',
          sessionId: null,
          startedAt: null,
          loggedCount: 2,
          draft: null
        }
      }
    }
  ];
}

describe('account-state cold-start migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.in.mockResolvedValue({ data: [], error: null });
    mocks.query.upsert.mockResolvedValue({ error: null });

    useAuthStore.setState({
      status: 'signed_in',
      user: { id: USER_ID } as User,
      profile: null,
      sandbox: false
    });
    usePrefsStore.setState({
      dailyQuestionTarget: 27,
      weeklySessionTarget: 9,
      defaultSubject: 'Databases',
      defaultSubjectId: 'databases',
      colorTheme: 'dark'
    });
    useSessionStore.setState({
      sessionId: 'active-session-1',
      plannedCount: 15,
      questionStartedAt: 1_789_000_000_000,
      mode: 'tag',
      pendingTimeSpent: 84
    });
    useLogStore.setState({
      mode: 'multi',
      sessionId: 'log-session-1',
      startedAt: 1_789_000_000_000,
      loggedCount: 4,
      draft: null
    });
  });

  afterEach(() => {
    stopAccountStateSync(USER_ID);
    useAuthStore.setState({ status: 'signed_out', user: null, profile: null, sandbox: false });
    localStorage.clear();
  });

  it('upserts all three local namespaces when the account has no database rows yet', async () => {
    await retryAccountStateSync(USER_ID);
    await flushAccountStateWrites(USER_ID);

    expect(mocks.query.in).toHaveBeenCalledWith('namespace', [
      'preferences',
      'active_session',
      'log_draft'
    ]);
    expect(mocks.query.upsert).toHaveBeenCalledTimes(3);
    expect(
      mocks.query.upsert.mock.calls.every(
        ([, options]) => options?.onConflict === 'user_id,namespace'
      )
    ).toBe(true);

    const rows = mocks.query.upsert.mock.calls.map(([row]) => row as Record<string, unknown>);
    const byNamespace = new Map(rows.map((row) => [row.namespace, row]));
    expect(byNamespace.get('preferences')).toMatchObject({
      user_id: USER_ID,
      namespace: 'preferences',
      payload: {
        schemaVersion: 1,
        data: {
          dailyQuestionTarget: 27,
          weeklySessionTarget: 9,
          defaultSubject: 'Databases',
          defaultSubjectId: 'databases',
          colorTheme: 'dark'
        }
      }
    });
    expect(byNamespace.get('active_session')).toMatchObject({
      user_id: USER_ID,
      namespace: 'active_session',
      payload: {
        schemaVersion: 1,
        data: {
          sessionId: 'active-session-1',
          plannedCount: 15,
          mode: 'tag',
          pendingTimeSpent: 84
        }
      }
    });
    expect(byNamespace.get('log_draft')).toMatchObject({
      user_id: USER_ID,
      namespace: 'log_draft',
      payload: {
        schemaVersion: 1,
        data: {
          mode: 'multi',
          sessionId: 'log-session-1',
          loggedCount: 4,
          draft: null
        }
      }
    });
    expect(hasPendingAccountStateWrites(USER_ID)).toBe(false);
  });

  it('hydrates complete database rows without echoing them back as migration writes', async () => {
    mocks.query.in.mockResolvedValue({ data: remoteAccountRows(), error: null });

    await retryAccountStateSync(USER_ID);
    await flushAccountStateWrites(USER_ID);

    expect(mocks.query.upsert).not.toHaveBeenCalled();
    expect(usePrefsStore.getState()).toMatchObject({
      dailyQuestionTarget: 41,
      colorTheme: 'light'
    });
    expect(useSessionStore.getState()).toMatchObject({
      sessionId: 'remote-session',
      plannedCount: 8,
      mode: 'solve'
    });
    expect(useLogStore.getState()).toMatchObject({
      mode: 'single',
      loggedCount: 2,
      draft: null
    });
    expect(hasPendingAccountStateWrites(USER_ID)).toBe(false);
  });

  it('lets a persisted pending edit win over an older database payload until acknowledged', async () => {
    localStorage.setItem(
      `air.account-state-pending.${USER_ID}.preferences`,
      JSON.stringify({
        schemaVersion: 1,
        data: {
          ...usePrefsStore.getState(),
          dailyQuestionTarget: 63,
          colorTheme: 'dark'
        }
      })
    );
    mocks.query.in.mockResolvedValue({ data: remoteAccountRows(12), error: null });

    await retryAccountStateSync(USER_ID);
    await flushAccountStateWrites(USER_ID);

    expect(usePrefsStore.getState()).toMatchObject({
      dailyQuestionTarget: 63,
      colorTheme: 'dark'
    });
    expect(mocks.query.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        namespace: 'preferences',
        payload: expect.objectContaining({
          schemaVersion: 1,
          data: expect.objectContaining({ dailyQuestionTarget: 63, colorTheme: 'dark' })
        })
      }),
      { onConflict: 'user_id,namespace' }
    );
    expect(
      localStorage.getItem(`air.account-state-pending.${USER_ID}.preferences`)
    ).toBeNull();
    expect(hasPendingAccountStateWrites(USER_ID)).toBe(false);
  });
});
