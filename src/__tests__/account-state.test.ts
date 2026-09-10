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
import { EMPTY_PYQ_PREFERENCES, usePyqPreferencesStore } from '@/stores/pyq-preferences';
import { EMPTY_PLANNER_TEMPLATES, usePlannerTemplatesStore } from '@/stores/planner-templates';
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
    },
    {
      namespace: 'pyq_preferences',
      payload: {
        schemaVersion: 1,
        data: {
          lastConfig: null,
          lastPreset: 'repair',
          selectionSeed: 'remote-repair-set',
          savedPrescriptions: []
        }
      }
    },
    {
      namespace: 'planner_templates',
      payload: {
        schemaVersion: 1,
        data: {
          templates: [
            {
              id: 'remote-template',
              name: 'Remote repair block',
              block: {
                subject: 'Algorithms',
                subjectId: 'algorithms',
                customSubject: null,
                durationMin: 45,
                mode: 'PYQ Practice',
                priority: 'P1 Critical',
                target: 'Repair graph mistakes',
                resource: null,
                startAt: null
              },
              recurrence: null,
              createdAt: '2026-09-01T10:00:00.000Z',
              updatedAt: '2026-09-01T10:00:00.000Z'
            }
          ]
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
    usePyqPreferencesStore.setState({ ...EMPTY_PYQ_PREFERENCES });
    usePlannerTemplatesStore.setState({ ...EMPTY_PLANNER_TEMPLATES });
  });

  afterEach(() => {
    stopAccountStateSync(USER_ID);
    useAuthStore.setState({ status: 'signed_out', user: null, profile: null, sandbox: false });
    localStorage.clear();
  });

  it('upserts every local namespace when the account has no database rows yet', async () => {
    await retryAccountStateSync(USER_ID);
    await flushAccountStateWrites(USER_ID);

    expect(mocks.query.in).toHaveBeenCalledWith('namespace', [
      'preferences',
      'active_session',
      'log_draft',
      'pyq_preferences',
      'planner_templates'
    ]);
    expect(mocks.query.upsert).toHaveBeenCalledTimes(5);
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
    expect(byNamespace.get('pyq_preferences')).toMatchObject({
      user_id: USER_ID,
      namespace: 'pyq_preferences',
      payload: {
        schemaVersion: 1,
        data: EMPTY_PYQ_PREFERENCES
      }
    });
    expect(byNamespace.get('planner_templates')).toMatchObject({
      user_id: USER_ID,
      namespace: 'planner_templates',
      payload: {
        schemaVersion: 1,
        data: EMPTY_PLANNER_TEMPLATES
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
    expect(usePyqPreferencesStore.getState()).toMatchObject({
      lastPreset: 'repair',
      selectionSeed: 'remote-repair-set',
      savedPrescriptions: []
    });
    expect(usePlannerTemplatesStore.getState().templates).toEqual([
      expect.objectContaining({
        id: 'remote-template',
        name: 'Remote repair block',
        block: expect.objectContaining({
          subject: 'Algorithms',
          subjectId: 'algorithms',
          durationMin: 45,
          mode: 'PYQ Practice'
        })
      })
    ]);
    expect(hasPendingAccountStateWrites(USER_ID)).toBe(false);
  });

  it('mirrors Planner template edits through their own retryable namespace', async () => {
    mocks.query.in.mockResolvedValue({ data: remoteAccountRows(), error: null });
    await retryAccountStateSync(USER_ID);
    mocks.query.upsert.mockClear();

    usePlannerTemplatesStore.getState().saveTemplate({
      id: 'local-template',
      name: 'Local focused block',
      block: {
        subject: 'Databases',
        subjectId: 'databases',
        customSubject: null,
        durationMin: 60,
        mode: 'Revision',
        priority: 'P2 High',
        target: 'Review normalization',
        resource: null,
        startAt: null
      },
      recurrence: null
    });

    await flushAccountStateWrites(USER_ID);

    expect(mocks.query.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        namespace: 'planner_templates',
        payload: expect.objectContaining({
          schemaVersion: 1,
          data: expect.objectContaining({
            templates: expect.arrayContaining([
              expect.objectContaining({ id: 'local-template', name: 'Local focused block' })
            ])
          })
        })
      }),
      { onConflict: 'user_id,namespace' }
    );
    expect(
      localStorage.getItem(`air.account-state-pending.${USER_ID}.planner_templates`)
    ).toBeNull();
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
    expect(localStorage.getItem(`air.account-state-pending.${USER_ID}.preferences`)).toBeNull();
    expect(hasPendingAccountStateWrites(USER_ID)).toBe(false);
  });
});
