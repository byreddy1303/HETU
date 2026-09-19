// POST /functions/v1/decline-request  {request_id, reason?}
// Owner-only. Marks request declined, mails a polite decline.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sendEmail, inviteDeclined } from '../_shared/email.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!jwt) return json({ error: 'no auth' }, 401);

  const asUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'invalid session' }, 401);
  const uid = userData.user.id;
  const { data: isOwnerRes } = await asUser.rpc('is_owner');
  if (!isOwnerRes) return json({ error: 'not owner' }, 403);

  let body: { request_id?: string; reason?: string; notify?: boolean };
  try {
    body = (await req.json()) as { request_id?: string; reason?: string; notify?: boolean };
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const reqId = body.request_id;
  if (!reqId || !/^[0-9a-f-]{36}$/i.test(reqId)) return json({ error: 'invalid request_id' }, 400);
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  const notify = body.notify !== false; // default true

  const { data, error } = await admin.rpc('decline_account_request', {
    req_id: reqId,
    owner_id: uid,
    reason
  });
  if (error) return json({ error: error.message }, 400);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return json({ error: 'no row returned' }, 500);

  if (notify) {
    const { subject, html } = inviteDeclined({ name: row.requester_name, reason });
    const mail = await sendEmail({ to: row.requester_email, subject, html });
    if (!mail.ok) console.warn('[decline-request] mail failed:', mail.error);
    return json({ ok: true, mail_sent: mail.ok, mail_error: mail.ok ? undefined : mail.error });
  }
  return json({ ok: true, mail_sent: false });
});
