// POST /functions/v1/request-access
// Public endpoint (anon key required only for Supabase gateway). Validates
// form input, inserts an account_requests row (soft-throttled to 1 pending
// per email per day by the DB unique index), and mails the owner via Resend.
//
// Never creates an auth.users row. Owner still approves manually.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sendEmail, newRequestNotification } from '../_shared/email.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? '';
const APP_URL = Deno.env.get('VITE_APP_URL') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

interface Body {
  name?: unknown;
  email?: unknown;
  purpose?: unknown;
  // Honeypot: bots fill hidden fields; humans do not.
  website?: unknown;
}

function validate(b: Body): { ok: true; name: string; email: string; purpose: string } | { ok: false; error: string } {
  if (typeof b.website === 'string' && b.website.trim().length > 0) {
    // Silent success to bots — same 200 shape but no side-effect.
    return { ok: false, error: '__honeypot__' };
  }
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const purpose = typeof b.purpose === 'string' ? b.purpose.trim() : '';
  if (name.length < 1 || name.length > 80) return { ok: false, error: 'Name is required (max 80).' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email.' };
  if (purpose.length < 10 || purpose.length > 500) return { ok: false, error: 'Tell us in 10–500 characters why you want in.' };
  return { ok: true, name, email, purpose };
}

async function sha256hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const v = validate(body);
  if (!v.ok) {
    // Honeypot short-circuits with a 200 so bots don't retry.
    if (v.error === '__honeypot__') return json({ ok: true }, 200);
    return json({ error: v.error }, 400);
  }

  // Reject if the email already has an account. Guides duplicates to sign in
  // instead of piling up owner-inbox requests for accounts that exist.
  const { data: existingUser } = await admin
    .from('users')
    .select('id')
    .ilike('email', v.email)
    .maybeSingle();
  if (existingUser) {
    return json(
      { ok: false, error: 'An account with this email already exists. Try signing in instead.' },
      409
    );
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ua = req.headers.get('user-agent') ?? '';
  const ipHash = ip ? await sha256hex(`req:${ip}`) : null;

  const { data: inserted, error } = await admin
    .from('account_requests')
    .insert({
      name: v.name,
      email: v.email,
      purpose: v.purpose,
      ip_hash: ipHash,
      user_agent: ua.slice(0, 300)
    })
    .select('id')
    .single();

  if (error) {
    // Unique index → duplicate pending request today. Treat as success to
    // avoid leaking whether someone has already asked; message stays generic.
    if (error.code === '23505') {
      return json({ ok: true, dedup: true });
    }
    return json({ error: 'failed to record request' }, 500);
  }

  // Fire-and-forget owner notification. Mail failure does not fail the request.
  const notifyTarget = OWNER_EMAIL || (await ownerEmailFromDb());
  if (notifyTarget) {
    const adminUrl = APP_URL
      ? `${APP_URL.replace(/\/$/, '')}/settings#requests`
      : `${new URL(req.url).origin}/settings#requests`;
    const { subject, html } = newRequestNotification({
      name: v.name,
      email: v.email,
      purpose: v.purpose,
      adminUrl
    });
    // Not awaited long — we still want to know if it failed for logs.
    const res = await sendEmail({ to: notifyTarget, subject, html, reply_to: v.email });
    if (!res.ok) console.warn('[request-access] mail failed:', res.error);
  } else {
    console.warn('[request-access] no OWNER_EMAIL configured; skipping notification');
  }

  return json({ ok: true, id: inserted.id });
});

async function ownerEmailFromDb(): Promise<string | null> {
  const { data } = await admin.rpc('owner_email');
  return typeof data === 'string' ? data : null;
}
