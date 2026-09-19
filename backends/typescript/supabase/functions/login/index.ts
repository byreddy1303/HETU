// POST /functions/v1/login
// Body: {username, pin}
//
// Resolves username → auth.users.email server-side, then verifies the PIN by
// calling Supabase Auth's password grant with the anon key. On success, the
// session tokens are returned for the client to hand to
// supabase.auth.setSession(...).
//
// The username lookup is done via a security-definer SQL function so RLS
// doesn't leak whether a username exists; failed logins return the same
// generic "invalid credentials" no matter which field is wrong.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const PIN_RE = /^\d{6}$/;

interface Body {
  username?: string;
  pin?: string;
}

const genericError = () => json({ error: 'Invalid username or PIN.' }, 401);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const username = (body.username ?? '').trim().toLowerCase();
  const pin = (body.pin ?? '').trim();

  if (!USERNAME_RE.test(username) || !PIN_RE.test(pin)) return genericError();

  // Look up the email via SQL helper. Returns null if no such username.
  const { data: emailData, error: rpcErr } = await admin.rpc('email_for_username', {
    uname: username
  });
  if (rpcErr) {
    console.warn('[login] email_for_username failed:', rpcErr.message);
    return json({ error: 'Login temporarily unavailable.' }, 500);
  }
  const email = typeof emailData === 'string' ? emailData : null;
  if (!email) return genericError();

  // Verify the PIN by attempting a password grant with the anon client.
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: pin
  });
  if (signInErr || !session?.session) return genericError();

  return json({
    ok: true,
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    expires_in: session.session.expires_in,
    token_type: session.session.token_type,
    user: {
      id: session.user?.id,
      email: session.user?.email
    }
  });
});
