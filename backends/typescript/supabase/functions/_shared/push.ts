import webpush from 'npm:web-push@3.6.7';
import { importPKCS8, SignJWT } from 'npm:jose@6.1.0';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT =
  Deno.env.get('VAPID_SUBJECT') ??
  Deno.env.get('VITE_APP_URL') ??
  'mailto:notifications@airjournal.app';
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '';

export interface SubscriptionRow {
  id: string;
  platform: 'web' | 'android' | 'ios';
  web_endpoint: string | null;
  web_p256dh: string | null;
  web_auth: string | null;
  native_token: string | null;
  active_buddy_id: string | null;
  last_seen_at: string;
  push_quiet_until: string | null;
}

export interface DeliveryResult {
  permanent: boolean;
  providerStatus: number | null;
  error: string | null;
}

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export class PushDeliveryError extends Error {
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

export function truncate(value: string, max = 180): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function serviceAccount(): ServiceAccount | null {
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

export async function getFcmAccessToken(account: ServiceAccount): Promise<string> {
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

export interface PushCopy {
  title: string;
  body: string;
  kind: string;
  route: string;
  tagId?: string;
  buddyId?: string; // specific to buddy chats
  messageId?: string; // specific to buddy chats
  replyToken?: string; // Android-only, short-lived single-notification token
  replyUrl?: string; // Android-only HTTPS Edge Function endpoint
  channelId?: 'buddy_messages' | 'study_reminders';
  priority?: 'high' | 'normal';
  actions?: PushAction[];
  actionToken?: string;
  actionUrl?: string;
}

export interface PushAction {
  id: string;
  label: string;
  type: 'open' | 'api';
  route?: string;
}

export async function sendWebPush(subscription: SubscriptionRow, copy: PushCopy): Promise<void> {
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
        kind: copy.kind,
        route: copy.route,
        tagId: copy.tagId,
        buddyId: copy.buddyId,
        messageId: copy.messageId,
        actions: copy.actions ?? [],
        actionToken: copy.actionToken,
        actionUrl: copy.actionUrl
      }),
      {
        TTL: 24 * 60 * 60,
        urgency: copy.priority === 'normal' ? 'normal' : 'high'
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

export async function sendNativePush(subscription: SubscriptionRow, copy: PushCopy): Promise<void> {
  const account = serviceAccount();
  if (!account) throw new PushDeliveryError('FCM service account is not configured');
  if (!subscription.native_token) {
    throw new PushDeliveryError('Native push token is missing', true);
  }
  const accessToken = await getFcmAccessToken(account);
  const tagKey = copy.tagId || copy.messageId || `${copy.kind}-${crypto.randomUUID()}`;
  const channelId = copy.channelId ?? 'buddy_messages';
  const priority = copy.priority ?? 'high';
  const actions = (copy.actions ?? []).slice(0, 3);

  const data = {
    title: copy.title,
    body: copy.body,
    route: copy.route,
    kind: copy.kind,
    tagId: tagKey,
    buddyId: copy.buddyId || '',
    messageId: copy.messageId || '',
    replyToken: copy.replyToken || '',
    replyUrl: copy.replyUrl || '',
    channelId,
    actionToken: copy.actionToken || '',
    actionUrl: copy.actionUrl || '',
    action1Id: actions[0]?.id || '',
    action1Label: actions[0]?.label || '',
    action1Type: actions[0]?.type || '',
    action1Route: actions[0]?.route || '',
    action2Id: actions[1]?.id || '',
    action2Label: actions[1]?.label || '',
    action2Type: actions[1]?.type || '',
    action2Route: actions[1]?.route || '',
    action3Id: actions[2]?.id || '',
    action3Label: actions[2]?.label || '',
    action3Type: actions[2]?.type || '',
    action3Route: actions[2]?.route || ''
  };

  const sendFcm = async (platformPayload: Record<string, unknown>): Promise<void> => {
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
            ...platformPayload
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
  };

  if (subscription.platform === 'android') {
    // The notification payload is the reliable closed-app fallback. A second
    // high-priority data message upgrades that same (tag, id=0) notification
    // with app-defined Reply/Read/Mute actions when the native service runs.
    await sendFcm({
      notification: { title: copy.title, body: copy.body },
      data: { ...data, renderMode: 'fallback' },
      android: {
        priority,
        ttl: '86400s',
        notification: {
          channel_id: channelId,
          tag: tagKey,
          notification_priority: priority === 'high' ? 'PRIORITY_HIGH' : 'PRIORITY_DEFAULT',
          visibility: 'PRIVATE',
          default_sound: true,
          default_vibrate_timings: true
        }
      }
    });
    try {
      await sendFcm({
        data: { ...data, renderMode: 'interactive', replaceSystemNotification: '1' },
        android: { priority: 'high', ttl: '86400s' }
      });
    } catch (error) {
      // The user already has the fallback alert. An interaction-upgrade failure
      // must not turn a successfully delivered notification into a retry storm.
      console.warn('[push] Android interaction upgrade unavailable:', (error as Error).message);
    }
    return;
  }

  await sendFcm({
    notification: { title: copy.title, body: copy.body },
    data,
    apns: {
      payload: {
        aps: {
          alert: { title: copy.title, body: copy.body },
          sound: 'default',
          badge: 1,
          'content-available': 1,
          'mutable-content': 1
        }
      },
      headers: {
        'apns-priority': '10',
        'apns-collapse-id': tagKey.slice(0, 64)
      }
    }
  });
}

export async function deliverToSubscription(
  subscription: SubscriptionRow,
  copy: PushCopy
): Promise<DeliveryResult> {
  try {
    if (subscription.platform === 'web') {
      await sendWebPush(subscription, copy);
    } else {
      await sendNativePush(subscription, copy);
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
