// Token-authenticated actions originating from Android/Web notifications.
// The opaque bearer token is bound to one user, device, notification, and a
// short allow-list of actions in Postgres; this endpoint accepts no raw IDs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const ACTIONS = new Set(['buddy_mark_read', 'buddy_mute_1h', 'study_remind_1h', 'study_mute']);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

  let body: { action_token?: string; action?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'invalid request' }, 400);
  }
  const actionToken = String(body.action_token ?? '');
  const action = String(body.action ?? '');
  if (actionToken.length < 32 || !ACTIONS.has(action)) {
    return json({ ok: false, error: 'invalid action' }, 400);
  }

  const { data, error } = await admin.rpc('perform_notification_action', {
    p_action_token: actionToken,
    p_action: action
  });
  if (error) {
    console.error('[notification-action] action failed:', error.message);
    return json({ ok: false, error: 'action failed' }, 500);
  }
  const result = (data as Array<{ ok: boolean; action_result: string; route: string }> | null)?.[0];
  if (!result?.ok) return json({ ok: false, error: result?.action_result ?? 'action failed' }, 403);
  return json({ ok: true, result: result.action_result, route: result.route });
});
