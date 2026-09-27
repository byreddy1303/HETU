// Thin, typed wrappers for the edge functions:
//   - request-access   (public: uses anon key as bearer since Supabase's
//                       function gateway always requires an auth header)
//   - approve-request  (owner auth)
//   - decline-request  (owner auth)
// Keeps error handling consistent so pages don't reinvent status-code parsing.
import { supabase } from '@/lib/supabase';
import { backendConfig } from '@/lib/backend-config';
import { apiRequest, normalizeError } from '@/lib/fastapi-client';

async function fastapiEdge<T>(path: string, body: unknown, isPublic = false): Promise<T | EdgeError> {
  try {
    return await apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }, { public: isPublic });
  } catch (error) {
    const detail = normalizeError(error);
    return { ok: false, status: detail.status ?? 0, error: detail.message };
  }
}

function functionsBase(): string {
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321';
  return `${url.replace(/\/$/, '')}/functions/v1`;
}

function anonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
}

async function currentJwt(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export interface RequestAccessInput {
  name: string;
  email: string;
  purpose: string;
  /** Honeypot — leave empty. */
  website?: string;
}

export interface RequestAccessOk {
  ok: true;
  id?: string;
  dedup?: boolean;
}

export interface EdgeError {
  ok: false;
  status: number;
  error: string;
}

export async function requestAccess(
  input: RequestAccessInput
): Promise<RequestAccessOk | EdgeError> {
  if (backendConfig.fastapi) return fastapiEdge('/v1/access/request', input, true);
  const key = anonKey();
  if (!key) {
    return { ok: false, status: 0, error: 'Supabase is not configured yet.' };
  }
  const res = await fetch(`${functionsBase()}/request-access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Supabase Functions Gateway requires an auth header on every request.
      // For public endpoints we use the anon key — the edge fn's own logic
      // then decides what to do with the payload.
      Authorization: `Bearer ${key}`,
      apikey: key
    },
    body: JSON.stringify(input)
  }).catch((e) => {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 0 });
  });
  const body = (await readJson(res)) as { ok?: boolean; id?: string; dedup?: boolean; error?: string } | null;
  if (res.ok && body?.ok) return { ok: true, id: body.id, dedup: body.dedup };
  return {
    ok: false,
    status: res.status,
    error: body?.error ?? `request-access ${res.status}`
  };
}

export interface ApproveResult {
  ok: true;
  invite_id: string;
  invite_url: string;
  mail_sent: boolean;
  mail_error?: string;
}

export async function approveRequest(requestId: string): Promise<ApproveResult | EdgeError> {
  if (backendConfig.fastapi) return fastapiEdge(`/v1/access/${encodeURIComponent(requestId)}/approve`, {});
  const jwt = await currentJwt();
  if (!jwt) return { ok: false, status: 401, error: 'Sign in first.' };
  const res = await fetch(`${functionsBase()}/approve-request`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ request_id: requestId })
  });
  const body = (await readJson(res)) as
    | (ApproveResult & { ok: true })
    | { error?: string }
    | null;
  if (res.ok && body && (body as ApproveResult).ok) return body as ApproveResult;
  return {
    ok: false,
    status: res.status,
    error: (body as { error?: string })?.error ?? `approve ${res.status}`
  };
}

export interface DeclineResult {
  ok: true;
  mail_sent: boolean;
  mail_error?: string;
}

export async function declineRequest(
  requestId: string,
  opts: { reason?: string; notify?: boolean } = {}
): Promise<DeclineResult | EdgeError> {
  if (backendConfig.fastapi) return fastapiEdge(`/v1/access/${encodeURIComponent(requestId)}/decline`, opts);
  const jwt = await currentJwt();
  if (!jwt) return { ok: false, status: 401, error: 'Sign in first.' };
  const res = await fetch(`${functionsBase()}/decline-request`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ request_id: requestId, reason: opts.reason, notify: opts.notify })
  });
  const body = (await readJson(res)) as
    | (DeclineResult & { ok: true })
    | { error?: string }
    | null;
  if (res.ok && body && (body as DeclineResult).ok) return body as DeclineResult;
  return {
    ok: false,
    status: res.status,
    error: (body as { error?: string })?.error ?? `decline ${res.status}`
  };
}

export function isEdgeError(x: unknown): x is EdgeError {
  return typeof x === 'object' && x !== null && (x as { ok?: boolean }).ok === false;
}

// -------- Auth flow: username + PIN ---------------------------------------

export interface SignupInput {
  username: string;
  pin: string;
  email?: string;
  name?: string;
  invite_token?: string;
}

export interface SignupOk {
  ok: true;
  user_id: string;
  email: string;
}

export async function signupViaInvite(input: SignupInput): Promise<SignupOk | EdgeError> {
  if (backendConfig.fastapi) return { ok: false, status: 400, error: 'Use the Clerk sign-in and recovery form.' };
  const key = anonKey();
  if (!key) return { ok: false, status: 0, error: 'Supabase is not configured yet.' };
  const res = await fetch(`${functionsBase()}/signup-via-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key
    },
    body: JSON.stringify(input)
  }).catch((e) => new Response(JSON.stringify({ error: (e as Error).message }), { status: 0 }));
  const body = (await readJson(res)) as { ok?: boolean; user_id?: string; email?: string; error?: string } | null;
  if (res.ok && body?.ok && body.user_id && body.email) {
    return { ok: true, user_id: body.user_id, email: body.email };
  }
  return { ok: false, status: res.status, error: body?.error ?? `signup ${res.status}` };
}

export interface LoginInput {
  username: string;
  pin: string;
}

export interface LoginOk {
  ok: true;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { id?: string; email?: string };
}

export async function loginWithUsernamePin(input: LoginInput): Promise<LoginOk | EdgeError> {
  if (backendConfig.fastapi) return { ok: false, status: 400, error: 'Use the Clerk sign-in and recovery form.' };
  const key = anonKey();
  if (!key) return { ok: false, status: 0, error: 'Supabase is not configured yet.' };
  const res = await fetch(`${functionsBase()}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key
    },
    body: JSON.stringify(input)
  }).catch((e) => new Response(JSON.stringify({ error: (e as Error).message }), { status: 0 }));
  const body = (await readJson(res)) as (LoginOk & { ok: true }) | { error?: string } | null;
  if (res.ok && body && (body as LoginOk).ok) return body as LoginOk;
  return { ok: false, status: res.status, error: (body as { error?: string })?.error ?? `login ${res.status}` };
}

export interface PinResetInput {
  username: string;
}

export async function requestPinReset(input: PinResetInput): Promise<{ ok: true } | EdgeError> {
  if (backendConfig.fastapi) return { ok: false, status: 400, error: 'Use the Clerk sign-in and recovery form.' };
  const key = anonKey();
  if (!key) return { ok: false, status: 0, error: 'Supabase is not configured yet.' };
  const res = await fetch(`${functionsBase()}/request-pin-reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key
    },
    body: JSON.stringify(input)
  }).catch((e) => new Response(JSON.stringify({ error: (e as Error).message }), { status: 0 }));
  const body = (await readJson(res)) as { ok?: boolean; error?: string } | null;
  if (res.ok && body?.ok) return { ok: true };
  return { ok: false, status: res.status, error: body?.error ?? `reset ${res.status}` };
}

export type BuddyRequestStatus =
  | 'sent'
  | 'new'
  | 'reopened'
  | 'already_pending'
  | 'active'
  | 'cooldown'
  | 'rate_limit'
  | 'self'
  | 'no_such_user'
  | 'invalid_username';

export interface BuddyRequestOk {
  ok: true;
  exists: boolean;
  status: BuddyRequestStatus;
  created: boolean;
}

export async function sendBuddyRequest(
  username: string
): Promise<BuddyRequestOk | EdgeError> {
  if (backendConfig.fastapi) {
    const { data, error } = await supabase.rpc<BuddyRequestOk>('send_buddy_request', { username });
    return error || !data ? { ok: false, status: error?.status ?? 0, error: error?.message ?? 'Buddy request failed.' } : data;
  }
  const jwt = await currentJwt();
  if (!jwt) return { ok: false, status: 401, error: 'Sign in first.' };
  const res = await fetch(`${functionsBase()}/buddy-request`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username })
  }).catch((e) => new Response(JSON.stringify({ error: (e as Error).message }), { status: 0 }));
  const body = (await readJson(res)) as
    | { ok?: boolean; exists?: boolean; status?: BuddyRequestStatus; created?: boolean; error?: string }
    | null;
  if (res.ok && body?.ok) {
    return {
      ok: true,
      exists: !!body.exists,
      status: (body.status ?? 'sent') as BuddyRequestStatus,
      created: !!body.created
    };
  }
  return {
    ok: false,
    status: res.status,
    error: body?.error ?? `buddy-request ${res.status}`
  };
}

/** Optional client-side check before submitting the signup form. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (backendConfig.fastapi) return false; // Clerk owns identifiers in the cutover.
  const key = anonKey();
  if (!key) return true;
  const url = `${functionsBase().replace('/functions/v1', '')}/rest/v1/rpc/is_username_available`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      apikey: key
    },
    body: JSON.stringify({ uname: username })
  }).catch(() => null);
  if (!res || !res.ok) return true; // fail-open: signup will reject if actually taken
  const val = (await res.json().catch(() => null)) as unknown;
  return val === true;
}
