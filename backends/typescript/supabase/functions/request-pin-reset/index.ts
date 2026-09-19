// POST /functions/v1/request-pin-reset
// Body: {username}
//
// 1. Resolve username → email via SQL helper (nothing leaks to the client).
// 2. Ask Supabase Auth admin API to generate a recovery link.
// 3. Send our own Resend-branded email carrying that link.
// 4. Return {ok: true} REGARDLESS of whether the username existed — so an
//    attacker can't enumerate usernames.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sendEmail, pinResetRequested } from '../_shared/email.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('VITE_APP_URL') ?? '';
const RECOVERY_TTL_HOURS = 1;

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { username?: string };
  try {
    body = (await req.json()) as { username?: string };
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const username = (body.username ?? '').trim().toLowerCase();

  // Generic OK response used for both success and "no such user" paths.
  const okResponse = json({ ok: true });

  if (!USERNAME_RE.test(username)) return okResponse;

  // Resolve to the account's email.
  const { data: emailData } = await admin.rpc('email_for_username', { uname: username });
  const email = typeof emailData === 'string' ? emailData : null;
  if (!email) return okResponse;

  // Fetch display name so the email addresses them properly (best-effort).
  const { data: profile } = await admin
    .from('users')
    .select('name')
    .ilike('username', username)
    .maybeSingle();
  const name = profile?.name ?? username;

  const base = APP_URL ? APP_URL.replace(/\/$/, '') : new URL(req.url).origin;
  const redirectTo = `${base}/reset-pin`;

  // Generate a recovery link via the admin API. The `link` field it returns
  // includes the recovery access_token in the URL hash — the client picks it
  // up via supabase.auth.onAuthStateChange('PASSWORD_RECOVERY').
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo }
  });
  if (linkErr || !link?.properties?.action_link) {
    console.warn('[request-pin-reset] generateLink failed:', linkErr?.message);
    return okResponse;
  }

  const resetUrl = link.properties.action_link;
  const { subject, html } = pinResetRequested({ name, resetUrl, ttlHours: RECOVERY_TTL_HOURS });
  const mail = await sendEmail({ to: email, subject, html });
  if (!mail.ok) console.warn('[request-pin-reset] mail failed:', mail.error);

  return okResponse;
});
