// Auth store — username + PIN model (2026-07-18).
// Signup goes through the signup-via-invite edge fn (validates invite +
// creates auth user + stamps username). Login goes through the login edge fn
// (server-side username→email resolve + password grant → session tokens).
// Google OAuth and magic-link are gone.
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { db } from '@/lib/db';
import { wipeLocalState } from '@/lib/isolation';
import { loginWithUsernamePin, signupViaInvite } from '@/lib/edge';
import type { UserRow } from '@/types';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { unregisterCurrentPushDevice } from '@/lib/buddyNotifications';

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
  signOut: () => Promise<void>;
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
      if (user) void get().refreshProfile();
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      set({ user, status: user ? 'signed_in' : 'signed_out' });
      if (user) void get().refreshProfile();
      else set({ profile: null });
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
    return {};
  },

  enterSandbox: async () => {
    if (!import.meta.env.DEV || supabaseConfigured) return;
    await db.meta.put({ key: 'sandbox', value: true });
    set({ status: 'signed_in', profile: SANDBOX_PROFILE, sandbox: true });
  },

  signOut: async () => {
    if (get().sandbox) {
      await wipeLocalState();
      set({ status: 'signed_out', profile: null, sandbox: false, user: null });
      return;
    }
    await unregisterCurrentPushDevice();
    await supabase.auth.signOut();
    await wipeLocalState();
    set({ status: 'signed_out', profile: null, user: null });
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
