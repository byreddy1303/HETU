// Buddy push worker.
//
// Invocation modes:
//   1. Signed-in sender: { message_id } requests immediate processing.
//   2. pg_cron: x-air-journal-cron-secret drains pending outbox jobs.
//
// Message insertion never depends on push delivery. The transactional outbox
// retries transient provider failures and retires permanently invalid tokens.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { importPKCS8, SignJWT } from 'npm:jose@6.1.0';
import { corsHeaders, json } from '../_shared/cors.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('BUDDY_PUSH_CRON_SECRET') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT =
  Deno.env.get('VAPID_SUBJECT') ??
  Deno.env.get('VITE_APP_URL') ??
  'mailto:notifications@airjournal.app';
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '';

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

interface SubscriptionRow {
  id: string;
  platform: 'web' | 'android' | 'ios';
  web_endpoint: string | null;
  web_p256dh: string | null;
  web_auth: string | null;
  native_token: string | null;
  active_buddy_id: string | null;
  last_seen_at: string;
}

interface DeliveryRow {
  message_id: string;
  subscription_id: string;
  status: 'pending' | 'sent' | 'suppressed' | 'permanent_failure';
  attempts: number;
}

interface DeliveryResult {
  permanent: boolean;
  providerStatus: number | null;
  error: string | null;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

class PushDeliveryError extends Error {
  permanent: boolean;
  providerStatus: number | null;

  constructor(message: string, permanent = false, providerStatus: number | null = null) {
    super(message);
    this.name = 'PushDeliveryError';
    this.permanent = permanent;
    this.providerStatus = providerStatus;
  }
}

let fcmAccessToken: { value: string; expiresAt: number } | null = null;
let parsedServiceAccount: ServiceAccount | null | undefined;

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

function truncate(value: string, max = 180): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function senderLabel(sender: ProfileRow | null): string {
  const name = cleanText(sender?.name);
  if (name) return name;
  const username = cleanText(sender?.username);
  return username ? `@${username}` : 'Your buddy';
}

function notificationCopy(message: MessageRow, sender: ProfileRow | null, showPreview: boolean) {
  const senderName = senderLabel(sender);
  const body =
    message.kind === 'question'
      ? showPreview
        ? 'Shared a question with you.'
        : 'Sent you a new message.'
      : showPreview
        ? truncate(cleanText(message.body) || 'Sent you a new message.')
        : 'Sent you a new message.';
  return {
    title: senderName,
    body,
    route: `/buddy?chat=${encodeURIComponent(message.buddy_id)}`
  };
}

function activeInThisChat(subscription: SubscriptionRow, buddyId: string): boolean {
  if (subscription.active_buddy_id !== buddyId) return false;
  const lastSeen = Date.parse(subscription.last_seen_at);
  return Number.isFinite(lastSeen) && Date.now() - lastSeen < ACTIVE_CHAT_WINDOW_MS;
}

function serviceAccount(): ServiceAccount | null {
  if (parsedServiceAccount !== undefined) return parsedServiceAccount;
  if (!FCM_SERVICE_ACCOUNT_JSON) {
    parsedServiceAccount = null;
    return null;
  }
  try {
    const parsed = JSON.parse(FCM_SERVICE_ACCOUNT_JSON) as Partial<ServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('project_id, client_email, and private_key are required');
    }
    parsedServiceAccount = parsed as ServiceAccount;
    return parsedServiceAccount;
  } catch (error) {
    console.error('[buddy-push] invalid FCM_SERVICE_ACCOUNT_JSON:', (error as Error).message);
    parsedServiceAccount = null;
    return null;
  }
}

async function getFcmAccessToken(account: ServiceAccount): Promise<string> {
  if (fcmAccessToken && fcmAccessToken.expiresAt - Date.now() > 60_000) {
    return fcmAccessToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(account.token_uri ?? 'https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;
  if (!response.ok || !payload?.access_token) {
    throw new PushDeliveryError(
      truncate(payload?.error_description ?? `FCM authorization failed (${response.status})`, 240),
      false,
      response.status
    );
  }
  fcmAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(300, payload.expires_in ?? 3600) * 1000
  };
  return fcmAccessToken.value;
}

async function sendWebPush(
  subscription: SubscriptionRow,
  message: MessageRow,
  copy: ReturnType<typeof notificationCopy>
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new PushDeliveryError('Web Push VAPID keys are not configured');
  }
  if (!subscription.web_endpoint || !subscription.web_p256dh || !subscription.web_auth) {
    throw new PushDeliveryError('Web Push subscription is incomplete', true);
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.web_endpoint,
        keys: { p256dh: subscription.web_p256dh, auth: subscription.web_auth }
      },
      JSON.stringify({
        title: copy.title,
        body: copy.body,
        route: copy.route,
        buddyId: message.buddy_id,
        messageId: message.id
      }),
      {
        TTL: 24 * 60 * 60,
        urgency: 'high',
        topic: `buddy-${message.buddy_id.replace(/-/g, '').slice(0, 26)}`
      }
    );
  } catch (error) {
    const status = Number((error as { statusCode?: number }).statusCode) || null;
    const permanent = status === 404 || status === 410;
    throw new PushDeliveryError(
      truncate((error as Error).message || 'Web Push delivery failed', 240),
      permanent,
      status
    );
  }
}

async function sendNativePush(
  subscription: SubscriptionRow,
  message: MessageRow,
  copy: ReturnType<typeof notificationCopy>
): Promise<void> {
  const account = serviceAccount();
  if (!account) throw new PushDeliveryError('FCM service account is not configured');
  if (!subscription.native_token) {
    throw new PushDeliveryError('Native push token is missing', true);
  }
  const accessToken = await getFcmAccessToken(account);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: subscription.native_token,
          notification: { title: copy.title, body: copy.body },
          data: {
            route: copy.route,
            buddyId: message.buddy_id,
            messageId: message.id
          },
          android: {
            priority: 'high',
            ttl: '86400s',
            collapse_key: `buddy-${message.buddy_id}`,
            notification: {
              channel_id: 'buddy_messages',
              tag: `buddy-${message.buddy_id}`,
              visibility: 'PRIVATE',
              default_sound: true,
              default_vibrate_timings: true
            }
          }
        }
      })
    }
  );
  if (response.ok) return;

  const payload = (await response.json().catch(() => null)) as {
    error?: {
      message?: string;
      details?: Array<{ errorCode?: string }>;
    };
  } | null;
  const errorCode = payload?.error?.details?.find((detail) => detail.errorCode)?.errorCode;
  const permanent = errorCode === 'UNREGISTERED';
  if (response.status === 401) fcmAccessToken = null;
  throw new PushDeliveryError(
    truncate(payload?.error?.message ?? `FCM delivery failed (${response.status})`, 240),
    permanent,
    response.status
  );
}

async function deliverToSubscription(
  subscription: SubscriptionRow,
  message: MessageRow,
  copy: ReturnType<typeof notificationCopy>
): Promise<DeliveryResult> {
  try {
    if (subscription.platform === 'web') {
      await sendWebPush(subscription, message, copy);
    } else {
      await sendNativePush(subscription, message, copy);
    }
    return { permanent: false, providerStatus: 200, error: null };
  } catch (error) {
    if (error instanceof PushDeliveryError) {
      return {
        permanent: error.permanent,
        providerStatus: error.providerStatus,
        error: error.message
      };
    }
    return {
      permanent: false,
      providerStatus: null,
      error: truncate((error as Error).message || 'Push delivery failed', 240)
    };
  }
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
            'id, platform, web_endpoint, web_p256dh, web_auth, native_token, active_buddy_id, last_seen_at'
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
        if (activeInThisChat(subscription, message.buddy_id)) {
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

        const result = await deliverToSubscription(subscription, message, copy);
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
