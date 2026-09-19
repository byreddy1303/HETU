// POST /functions/v1/approve-request  {request_id: uuid}
// Authenticated: caller JWT must belong to the owner (first user). Creates
// an invite via public.approve_account_request(), then mails the requester
// the invite link via Resend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sendEmail, inviteApproved } from '../_shared/email.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('VITE_APP_URL') ?? '';
const INVITE_TTL_DAYS = 7;

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!jwt) return json({ error: 'no auth' }, 401);

  // Resolve caller via anon client with their JWT.
  const asUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'invalid session' }, 401);
  const uid = userData.user.id;

  // Owner check via is_owner() SQL helper.
  const { data: isOwnerRes, error: ownerErr } = await asUser.rpc('is_owner');
  if (ownerErr) return json({ error: 'owner check failed' }, 500);
  if (!isOwnerRes) return json({ error: 'not owner' }, 403);

  let body: { request_id?: string };
  try {
    body = (await req.json()) as { request_id?: string };
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const reqId = body.request_id;
  if (!reqId || !/^[0-9a-f-]{36}$/i.test(reqId)) return json({ error: 'invalid request_id' }, 400);

  const { data, error } = await admin.rpc('approve_account_request', {
    req_id: reqId,
    owner_id: uid,
    invite_ttl_days: INVITE_TTL_DAYS
  });
  if (error) return json({ error: error.message }, 400);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return json({ error: 'no row returned' }, 500);

  const base = APP_URL ? APP_URL.replace(/\/$/, '') : new URL(req.url).origin;
  const inviteUrl = `${base}/signup?invite=${encodeURIComponent(row.invite_token)}`;
  const { subject, html } = inviteApproved({
    name: row.requester_name,
    inviteUrl,
    ttlDays: INVITE_TTL_DAYS
  });
  const mail = await sendEmail({ to: row.requester_email, subject, html });
  if (!mail.ok) console.warn('[approve-request] mail failed:', mail.error);

  return json({
    ok: true,
    invite_id: row.invite_id,
    invite_url: inviteUrl,
    mail_sent: mail.ok,
    mail_error: mail.ok ? undefined : mail.error
  });
});
