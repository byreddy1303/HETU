// Auth store — username + PIN model (2026-07-18).
// Signup goes through the signup-via-invite edge fn (validates invite +
// creates auth user + stamps username). Login goes through the login edge fn
// (server-side username→email resolve + password grant → session tokens).
// Google OAuth and magic-link are gone. A successful login remembers this
// device (refresh token under `air.device-trust`) so the same browser can
// restore the session silently; explicit sign-out and "Wipe local" forget it.
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { db } from '@/lib/db';
import { wipeLocalState } from '@/lib/isolation';
import { loginWithUsernamePin, signupViaInvite } from '@/lib/edge';
import type { UserRow } from '@/types';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { unregisterCurrentPushDevice } from '@/lib/buddyNotifications';
import { initSync, stopSync } from '@/lib/sync';
import { clearTrustedDevice, readTrustedDevice, rememberTrustedDevice } from '@/lib/device-trust';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

export interface SignupPayload {
  username: string;
  pin: string;
  email?: string;
  name?: string;
  invite_token?: string;
}

interface AuthState {
  status: AuthStatus;
  user: User | null;
  profile: UserRow | null;
  /** True when running without Supabase env in dev ("local sandbox"). */
  sandbox: boolean;
  init: () => void;
  signIn: (username: string, pin: string) => Promise<{ error?: string }>;
  signUp: (payload: SignupPayload) => Promise<{ error?: string }>;
  enterSandbox: () => Promise<void>;
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

const SANDBOX_PROFILE: UserRow = {
  id: '00000000-0000-4000-8000-00000000dev0',
  name: 'Sandbox',
  email: 'sandbox@local',
  username: 'sandbox',
  exam_date: EXAM_DATE_DEFAULT,
  target_rank: 100,
  sadhana_practice: false,
  timezone: 'Asia/Kolkata',
  created_at: new Date().toISOString(),
  welcome_seen_at: null,
  phone_e164: null,
  digest_email_enabled: true,
  digest_whatsapp_enabled: false,
  digest_hour_local: 6,
  digest_minute_local: 0,
  wa_opted_in_at: null,
  last_digest_sent_on: null,
  buddy_notification_preview_enabled: true,
  study_notifications_enabled: false
};

let initialized = false;

// Keeps the trusted-device record's refresh token in step with the live
// session. supabase-js rotates the token on every refresh, so the stored one
// must track the latest value or a future restore would fail on a stale token.
function refreshTrustedToken(refreshToken: string): void {
  const trusted = readTrustedDevice();
  if (!trusted) return;
  rememberTrustedDevice({
    userId: trusted.userId,
    username: trusted.username,
    refreshToken
  });
}

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

    if (!supabaseConfigured) {
      db.meta.get('sandbox').then(async (row) => {
        if (row?.value) {
          const stored = (await db.meta.get('sandbox_profile'))?.value as UserRow | undefined;
          set({
            status: 'signed_in',
            profile: stored ? { ...SANDBOX_PROFILE, ...stored } : SANDBOX_PROFILE,
            sandbox: true
          });
        } else {
          set({ status: 'signed_out' });
        }
      });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      set({ user, status: user ? 'signed_in' : 'signed_out' });
      if (user) {
        if (data.session?.refresh_token) refreshTrustedToken(data.session.refresh_token);
        void get().refreshProfile();
        return;
      }
      // A trusted device restores the session silently — the username + PIN
      // screen is never shown again on a browser that signed in before. The
      // refresh token is rotated by the server, so a failed restore simply
      // forgets the device.
      const trusted = readTrustedDevice();
      if (!trusted) return;
      void supabase.auth.refreshSession({ refresh_token: trusted.refreshToken }).then(
        ({ data: restored, error }) => {
          if (error) {
            console.warn('[air] Trusted-device restore failed; forgetting this device.', error);
            clearTrustedDevice();
            return;
          }
          const restoredUser = restored.session?.user ?? null;
          if (!restoredUser) {
            clearTrustedDevice();
            return;
          }
          set({ user: restoredUser, status: 'signed_in' });
          if (restored.session?.refresh_token) {
            rememberTrustedDevice({
              userId: restoredUser.id,
              username: trusted.username,
              refreshToken: restored.session.refresh_token
            });
          }
          void get().refreshProfile();
        }
      );
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      set({ user, status: user ? 'signed_in' : 'signed_out' });
      if (user) {
        if (session?.refresh_token) refreshTrustedToken(session.refresh_token);
        void get().refreshProfile();
      } else set({ profile: null });
    });
  },

  refreshProfile: async () => {
    const { user, sandbox } = get();
    if (sandbox || !user) return;
    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!error && data) set({ profile: data as UserRow });
  },

  signIn: async (username, pin) => {
    const res = await loginWithUsernamePin({ username, pin });
    if (!('ok' in res) || !res.ok) return { error: res.error };
    // Hand the tokens to the Supabase client so future calls carry the JWT.
    const { error } = await supabase.auth.setSession({
      access_token: res.access_token,
      refresh_token: res.refresh_token
    });
    if (error) return { error: error.message };
    await get().refreshProfile();
    const userId = res.user?.id ?? get().user?.id;
    if (userId) {
      rememberTrustedDevice({ userId, username, refreshToken: res.refresh_token });
    }
    return {};
  },

  signUp: async (payload) => {
    const res = await signupViaInvite(payload);
    if (!('ok' in res) || !res.ok) return { error: res.error };
    // Sign in immediately with the same credentials so the user lands
    // straight on the dashboard.
    const login = await loginWithUsernamePin({
      username: payload.username,
      pin: payload.pin
    });
    if (!('ok' in login) || !login.ok) return { error: login.error };
    const { error } = await supabase.auth.setSession({
      access_token: login.access_token,
      refresh_token: login.refresh_token
    });
    if (error) return { error: error.message };
    await get().refreshProfile();
    const userId = login.user?.id ?? get().user?.id;
    if (userId) {
      rememberTrustedDevice({ userId, username: payload.username, refreshToken: login.refresh_token });
    }
    return {};
  },

  enterSandbox: async () => {
    if (!import.meta.env.DEV || supabaseConfigured) return;
    await db.meta.put({ key: 'sandbox', value: true });
    set({ status: 'signed_in', profile: SANDBOX_PROFILE, sandbox: true });
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
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
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

    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      // auth-js removes the local session for most sign-out API failures. Only
      // restore the signed-in UI when a session is demonstrably still present.
      let sessionStillPresent = true;
      try {
        const { data } = await supabase.auth.getSession();
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
    // Sign-out is the user's word that this browser should not come back
    // silently; drop the trusted-device record (the sweep above covers it too).
    clearTrustedDevice();
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
    const { error } = await supabase.from('users').update(patch).eq('id', user.id);
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
