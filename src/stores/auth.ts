import { create } from 'zustand';
import type { ApiUser as User } from '@/lib/api-client';
import { apiClient, apiConfigured } from '@/lib/api-client';
import { db } from '@/lib/db';
import { wipeLocalState } from '@/lib/isolation';
import type { UserRow } from '@/types';
import { unregisterCurrentPushDevice } from '@/lib/buddyNotifications';
import { initSync, stopSync } from '@/lib/sync';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  profile: UserRow | null;
  /** Retained for test fixtures; deployed accounts always use the online API. */
  sandbox: boolean;
  init: () => void;
  signOut: (options?: { force?: boolean }) => Promise<{ error?: string }>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<{ error?: string }>;
}

/** Editable subset of the users row — everything the Settings page owns. */
export type ProfilePatch = Partial<
  Pick<
    UserRow,
    | 'name'
    | 'exam_date'
    | 'target_rank'
    | 'timezone'
    | 'digest_email_enabled'
    | 'digest_hour_local'
    | 'digest_minute_local'
    | 'buddy_notification_preview_enabled'
    | 'study_notifications_enabled'
  >
>;

let initialized = false;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for cleanup.')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  profile: null,
  sandbox: false,

  init: () => {
    if (initialized) return;
    initialized = true;

    if (!apiConfigured) { set({ status: 'signed_out' }); return; }

    apiClient.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      set({ user, status: user ? 'signed_in' : 'signed_out' });
      if (user) void get().refreshProfile();
    });

    apiClient.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      set({ user, status: user ? 'signed_in' : 'signed_out' });
      if (user) {
        void get().refreshProfile();
      } else set({ profile: null });
    });
  },

  refreshProfile: async () => {
    const { user, sandbox } = get();
    if (sandbox || !user) return;
    const { data, error } = await apiClient.from('users').select('*').eq('id', user.id).single();
    if (!error && data && get().user?.id === user.id) set({ profile: data as UserRow });
  },

  signOut: async (options?: { force?: boolean }) => {
    // With Postgres as the only durable store there is no local durability
    // barrier to cross. Sign-out just revokes the session and drops RAM.
    if (get().sandbox) {
      try {
        await wipeLocalState();
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Local cleanup failed.';
        return { error: detail };
      }
      set({ status: 'signed_out', profile: null, sandbox: false, user: null });
      return {};
    }

    const userId = get().user?.id;
    if (!userId) {
      try {
        await apiClient.auth.signOut({ scope: 'local' }).catch(() => {});
      } catch {
        // ignore
      }
      try {
        await wipeLocalState();
      } catch {
        // ignore
      }
      set({ status: 'signed_out', profile: null, user: null, sandbox: false });
      return {};
    }

    // Best-effort push cleanup with a hard bound so it can never deadlock the
    // button. Force sign-out gives the even shorter leash.
    try {
      await withTimeout(unregisterCurrentPushDevice(), options?.force ? 2000 : 8000);
    } catch (error) {
      console.warn('[air] Sign-out: push-device cleanup did not finish, proceeding.', error);
    }

    const accountState = await import('@/lib/account-state');
    accountState.stopAccountStateSync(userId);
    stopSync();
    // Freeze authenticated routes before yielding to the network request.
    set({ status: 'loading' });

    const { error } = await apiClient.auth.signOut({ scope: 'local' });
    if (error) {
      // auth-js removes the local session for most sign-out API failures. Only
      // restore the signed-in UI when a session is demonstrably still present.
      let sessionStillPresent = true;
      try {
        const { data } = await apiClient.auth.getSession();
        sessionStillPresent = Boolean(data.session);
      } catch {
        // If session verification itself fails, preserve state instead of
        // guessing that sign-out completed.
      }
      if (sessionStillPresent) {
        set({ status: 'signed_in' });
        initSync(userId);
        void accountState.startAccountStateSync(userId).catch((restartError) => {
          console.error('[air] Account sync could not restart after sign-out failed.', restartError);
        });
        return { error: error.message };
      }
    }

    let cleanupError: string | null = null;
    try {
      await wipeLocalState();
    } catch (error) {
      cleanupError =
        error instanceof Error ? error.message : 'This device cache was not fully cleared.';
    }
    set({ status: 'signed_out', profile: null, user: null });
    return cleanupError
      ? {
          error: `You are signed out and your database data is safe, but local cleanup was incomplete. ${cleanupError}`
        }
      : {};
  },

  updateProfile: async (patch) => {
    const { profile, sandbox, user } = get();
    if (!profile) return { error: 'no profile loaded' };
    const merged: UserRow = { ...profile, ...patch };
    if (sandbox) {
      await db.meta.put({ key: 'sandbox_profile', value: merged });
      set({ profile: merged });
      return {};
    }
    if (!user) return { error: 'not signed in' };
    const { error } = await apiClient.from('users').update(patch).eq('id', user.id);
    if (error) return { error: error.message };
    set({ profile: merged });
    return {};
  }
}));

/** The id every local row is scoped to (sandbox id when offline-dev). */
export function currentUserId(): string | null {
  const s = useAuthStore.getState();
  return s.sandbox ? s.profile!.id : (s.user?.id ?? null);
}
