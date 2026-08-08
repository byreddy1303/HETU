// Buddy push worker.
//
// Invocation modes:
//   1. Signed-in sender: { message_id } requests immediate processing.
//   2. pg_cron: x-air-journal-cron-secret drains pending outbox jobs.
//
// Message insertion never depends on push delivery. The transactional outbox
// retries transient provider failures and retires permanently invalid tokens.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { 
  type SubscriptionRow, 
  type PushCopy,
  deliverToSubscription, 
  truncate 
} from '../_shared/push.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('BUDDY_PUSH_CRON_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const MAX_ATTEMPTS = 8;
const ACTIVE_CHAT_WINDOW_MS = 75_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ClaimedJob {
  message_id: string;
  recipient_id: string;
  attempts: number;
}

interface MessageRow {
  id: string;
  buddy_id: string;
  sender_id: string;
  kind: 'text' | 'question';
  body: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  username: string | null;
  buddy_notification_preview_enabled: boolean;
}

interface DeliveryRow {
  message_id: string;
  subscription_id: string;
  status: 'pending' | 'sent' | 'suppressed' | 'permanent_failure';
  attempts: number;
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function senderLabel(sender: ProfileRow | null): string {
  const name = cleanText(sender?.name);
  if (name) return name;
  const username = cleanText(sender?.username);
  return username ? `@${username}` : 'Your buddy';
}

function notificationCopy(message: MessageRow, sender: ProfileRow | null, showPreview: boolean): PushCopy {
  const senderName = senderLabel(sender);
  const body =
    message.kind === 'question'
      ? showPreview
        ? 'Shared a question — tap to attempt it fresh.'
        : 'Sent you a new message.'
      : showPreview
        ? truncate(cleanText(message.body) || 'Sent you a new message.')
        : 'Sent you a new message.';
  return {
    title: senderName,
    body,
    kind: message.kind,
    route: `/buddy?chat=${encodeURIComponent(message.buddy_id)}`,
    tagId: `msg-${message.id}`,
    buddyId: message.buddy_id,
    messageId: message.id
  };
}

function activeInThisChat(subscription: SubscriptionRow, buddyId: string): boolean {
  if (subscription.active_buddy_id !== buddyId) return false;
  const lastSeen = Date.parse(subscription.last_seen_at);
  return Number.isFinite(lastSeen) && Date.now() - lastSeen < ACTIVE_CHAT_WINDOW_MS;
}

/** Returns true when the user has snoozed this device until a future time. */
function isSnoozed(subscription: SubscriptionRow): boolean {
  if (!subscription.push_quiet_until) return false;
  const until = Date.parse(subscription.push_quiet_until);
  return Number.isFinite(until) && Date.now() < until;
}



function retryAt(attempt: number): string {
  const seconds = Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function finishJob(
  job: ClaimedJob,
  state: 'completed' | 'pending' | 'dead',
  error: string | null = null
): Promise<void> {
  await admin
    .from('buddy_notification_outbox')
    .update({
      status: state,
      next_attempt_at: state === 'pending' ? retryAt(job.attempts) : new Date().toISOString(),
      locked_at: null,
      completed_at: state === 'completed' ? new Date().toISOString() : null,
      last_error: error ? truncate(error, 500) : null,
      updated_at: new Date().toISOString()
    })
    .eq('message_id', job.message_id);
}

async function processJob(job: ClaimedJob): Promise<'completed' | 'retrying' | 'dead'> {
  try {
    const [{ data: messageData, error: messageError }, { data: subscriptionsData }] =
      await Promise.all([
        admin
          .from('buddy_messages')
          .select('id, buddy_id, sender_id, kind, body, created_at')
          .eq('id', job.message_id)
          .maybeSingle(),
        admin
          .from('push_subscriptions')
          .select(
            'id, platform, web_endpoint, web_p256dh, web_auth, native_token, active_buddy_id, last_seen_at, push_quiet_until'
          )
          .eq('user_id', job.recipient_id)
          .eq('enabled', true)
      ]);

    if (messageError) throw new Error(messageError.message);
    if (!messageData) {
      await finishJob(job, 'completed');
      return 'completed';
    }
    const message = messageData as MessageRow;
    const subscriptions = (subscriptionsData as SubscriptionRow[] | null) ?? [];
    if (subscriptions.length === 0) {
      await finishJob(job, 'completed');
      return 'completed';
    }

    const { data: profilesData } = await admin
      .from('users')
      .select('id, name, username, buddy_notification_preview_enabled')
      .in('id', [message.sender_id, job.recipient_id]);
    const profiles = (profilesData as ProfileRow[] | null) ?? [];
    const sender = profiles.find((profile) => profile.id === message.sender_id) ?? null;
    const recipient = profiles.find((profile) => profile.id === job.recipient_id) ?? null;
    const copy = notificationCopy(
      message,
      sender,
      recipient?.buddy_notification_preview_enabled !== false
    );

    await admin.from('buddy_notification_deliveries').upsert(
      subscriptions.map((subscription) => ({
        message_id: job.message_id,
        subscription_id: subscription.id,
        status: 'pending'
      })),
      { onConflict: 'message_id,subscription_id', ignoreDuplicates: true }
    );

    const { data: deliveriesData, error: deliveriesError } = await admin
      .from('buddy_notification_deliveries')
      .select('message_id, subscription_id, status, attempts')
      .eq('message_id', job.message_id)
      .eq('status', 'pending');
    if (deliveriesError) throw new Error(deliveriesError.message);
    const deliveries = (deliveriesData as DeliveryRow[] | null) ?? [];
    const subscriptionById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));

    let transientFailures = 0;
    const errors: string[] = [];
    await Promise.all(
      deliveries.map(async (delivery) => {
        const subscription = subscriptionById.get(delivery.subscription_id);
        if (!subscription) return;
        // Suppress if the user has the chat open on this device or has snoozed
        // alerts. Both paths write 'suppressed' to the delivery row — no retry.
        if (activeInThisChat(subscription, message.buddy_id) || isSnoozed(subscription)) {
          await admin
            .from('buddy_notification_deliveries')
            .update({
              status: 'suppressed',
              updated_at: new Date().toISOString()
            })
            .eq('message_id', job.message_id)
            .eq('subscription_id', subscription.id);
          return;
        }

        const result = await deliverToSubscription(subscription, copy);
        if (!result.error) {
          await admin
            .from('buddy_notification_deliveries')
            .update({
              status: 'sent',
              attempts: delivery.attempts + 1,
              provider_status: result.providerStatus,
              last_error: null,
              delivered_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('message_id', job.message_id)
            .eq('subscription_id', subscription.id);
          return;
        }

        errors.push(result.error);
        if (result.permanent) {
          await Promise.all([
            admin
              .from('buddy_notification_deliveries')
              .update({
                status: 'permanent_failure',
                attempts: delivery.attempts + 1,
                provider_status: result.providerStatus,
                last_error: result.error,
                updated_at: new Date().toISOString()
              })
              .eq('message_id', job.message_id)
              .eq('subscription_id', subscription.id),
            admin
              .from('push_subscriptions')
              .update({ enabled: false, updated_at: new Date().toISOString() })
              .eq('id', subscription.id)
          ]);
          return;
        }

        transientFailures += 1;
        await admin
          .from('buddy_notification_deliveries')
          .update({
            attempts: delivery.attempts + 1,
            provider_status: result.providerStatus,
            last_error: result.error,
            updated_at: new Date().toISOString()
          })
          .eq('message_id', job.message_id)
          .eq('subscription_id', subscription.id);
      })
    );

    if (transientFailures === 0) {
      await finishJob(job, 'completed');
      return 'completed';
    }
    const terminal = job.attempts >= MAX_ATTEMPTS;
    await finishJob(job, terminal ? 'dead' : 'pending', errors.join('; '));
    return terminal ? 'dead' : 'retrying';
  } catch (error) {
    const terminal = job.attempts >= MAX_ATTEMPTS;
    await finishJob(job, terminal ? 'dead' : 'pending', (error as Error).message);
    return terminal ? 'dead' : 'retrying';
  }
}

async function authenticatedUserId(req: Request): Promise<string | null> {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!jwt) return null;
  const asUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await asUser.auth.getUser();
  return error ? null : (data.user?.id ?? null);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const cronAuthorized = safeEqual(
    req.headers.get('x-air-journal-cron-secret') ?? '',
    CRON_SECRET
  );
  let body: { message_id?: string } = {};
  try {
    body = (await req.json()) as { message_id?: string };
  } catch {
    body = {};
  }
  const messageId = cleanText(body.message_id);

  if (!cronAuthorized) {
    if (!UUID_RE.test(messageId)) return json({ error: 'message_id is required' }, 400);
    const userId = await authenticatedUserId(req);
    if (!userId) return json({ error: 'invalid session' }, 401);
    const { data: message } = await admin
      .from('buddy_messages')
      .select('sender_id')
      .eq('id', messageId)
      .maybeSingle();
    if (!message || message.sender_id !== userId) return json({ error: 'not allowed' }, 403);
  }

  const { data: claimed, error: claimError } = await admin.rpc(
    'claim_buddy_notification_jobs',
    {
      p_limit: messageId ? 1 : 20,
      p_message_id: messageId || null
    }
  );
  if (claimError) return json({ error: 'could not claim notification work' }, 500);
  const jobs = (claimed as ClaimedJob[] | null) ?? [];
  const outcomes = await Promise.all(jobs.map(processJob));
  return json({
    ok: true,
    claimed: jobs.length,
    completed: outcomes.filter((outcome) => outcome === 'completed').length,
    retrying: outcomes.filter((outcome) => outcome === 'retrying').length,
    dead: outcomes.filter((outcome) => outcome === 'dead').length
  });
});
