import { PushNotifications, type PermissionStatus } from '@capacitor/push-notifications';
import { isNativeApp, nativePlatform } from '@/lib/native';
import { supabase, supabaseConfigured } from '@/lib/supabase';

const DEVICE_ID_KEY = 'air:buddy-push-device-id';
const OPT_IN_KEY = 'air:buddy-push-opt-in';
const NATIVE_REGISTRATION_TIMEOUT_MS = 15_000;

type PermissionState = PermissionStatus['receive'];
export type BuddyNotificationPermission = PermissionState | 'unsupported';

export interface BuddyNotificationState {
  supported: boolean;
  permission: BuddyNotificationPermission;
  registered: boolean;
  platform: 'web' | 'android' | 'ios';
}

export interface BuddyNotificationResult {
  ok: boolean;
  error?: string;
  permission?: BuddyNotificationPermission;
}

function platform(): 'web' | 'android' | 'ios' {
  if (isNativeApp && nativePlatform === 'android') return 'android';
  if (isNativeApp && nativePlatform === 'ios') return 'ios';
  return 'web';
}

function webPushSupported(): boolean {
  return (
    !isNativeApp &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function webPermission(value: NotificationPermission): PermissionState {
  return value === 'default' ? 'prompt' : value;
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getPushDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const created = uuid();
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function buddyPushOptedIn(): boolean {
  return localStorage.getItem(OPT_IN_KEY) === 'true';
}

function setOptedIn(value: boolean): void {
  localStorage.setItem(OPT_IN_KEY, String(value));
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) {
    output[index] = decoded.charCodeAt(index);
  }
  return output;
}

async function upsertWebSubscription(subscription: PushSubscription): Promise<void> {
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!p256dh || !auth) throw new Error('Browser did not return Web Push encryption keys.');
  const { error } = await supabase.rpc('upsert_push_subscription', {
    p_device_id: getPushDeviceId(),
    p_platform: 'web',
    p_web_endpoint: subscription.endpoint,
    p_web_p256dh: p256dh,
    p_web_auth: auth,
    p_native_token: null
  });
  if (error) throw new Error(error.message);
}

export async function saveNativePushToken(token: string): Promise<void> {
  if (!buddyPushOptedIn() || !supabaseConfigured || !token.trim()) return;
  const currentPlatform = platform();
  if (currentPlatform === 'web') return;
  const { error } = await supabase.rpc('upsert_push_subscription', {
    p_device_id: getPushDeviceId(),
    p_platform: currentPlatform,
    p_web_endpoint: null,
    p_web_p256dh: null,
    p_web_auth: null,
    p_native_token: token.trim()
  });
  if (error) throw new Error(error.message);
}

async function nativePermission(request: boolean): Promise<PermissionState> {
  let status = (await PushNotifications.checkPermissions()).receive;
  if (request && (status === 'prompt' || status === 'prompt-with-rationale')) {
    status = (await PushNotifications.requestPermissions()).receive;
  }
  return status;
}

async function registerNativeToken(): Promise<string> {
  await PushNotifications.createChannel({
    id: 'buddy_messages',
    name: 'Buddy messages',
    description: 'Messages and shared questions from your study buddy.',
    importance: 4,
    visibility: 0,
    vibration: true,
    lights: true,
    lightColor: '#98182B'
  });

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let handles: Array<{ remove: () => Promise<void> }> = [];
    let timer: number | undefined;

    const finish = (error: Error | null, token?: string) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      void Promise.resolve().then(async () => {
        await Promise.all(handles.map((handle) => handle.remove()));
      });
      if (error) reject(error);
      else if (token) resolve(token);
      else reject(new Error('Native push registration did not return a token.'));
    };

    void (async () => {
      handles = await Promise.all([
        PushNotifications.addListener('registration', (token) => finish(null, token.value)),
        PushNotifications.addListener('registrationError', (error) =>
          finish(new Error(error.error || 'Native push registration failed.'))
        )
      ]);
      timer = window.setTimeout(
        () => finish(new Error('Native push registration timed out. Check Firebase configuration.')),
        NATIVE_REGISTRATION_TIMEOUT_MS
      );
      await PushNotifications.register();
    })().catch((error) => finish(error as Error));
  });
}

export async function getBuddyNotificationState(): Promise<BuddyNotificationState> {
  const currentPlatform = platform();
  if (!supabaseConfigured) {
    return { supported: false, permission: 'unsupported', registered: false, platform: currentPlatform };
  }

  const supported = isNativeApp
    ? currentPlatform === 'android' || currentPlatform === 'ios'
    : webPushSupported();
  const permissionPromise: Promise<BuddyNotificationPermission> = isNativeApp && supported
    ? nativePermission(false).catch(() => 'unsupported')
    : Promise.resolve(supported ? webPermission(Notification.permission) : 'unsupported');
  const registrationPromise = supabase
    .from('push_subscriptions')
    .select('id')
    .eq('device_id', getPushDeviceId())
    .eq('enabled', true)
    .maybeSingle();
  const [permission, { data }] = await Promise.all([permissionPromise, registrationPromise]);
  return {
    supported,
    permission,
    registered: Boolean(data) && buddyPushOptedIn(),
    platform: currentPlatform
  };
}

export async function enableBuddyNotifications(): Promise<BuddyNotificationResult> {
  if (!supabaseConfigured) return { ok: false, error: 'Sign in to enable Buddy notifications.' };
  try {
    if (isNativeApp) {
      const permission = await nativePermission(true);
      if (permission !== 'granted') {
        return { ok: false, permission, error: 'Notification permission is blocked in device settings.' };
      }
      setOptedIn(true);
      const token = await registerNativeToken();
      await saveNativePushToken(token);
      return { ok: true, permission };
    }

    if (!webPushSupported()) {
      return {
        ok: false,
        permission: 'unsupported',
        error: 'This browser does not support background notifications.'
      };
    }
    const publicKey = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY ?? '').trim();
    if (!publicKey) {
      return { ok: false, error: 'Web Push is not configured on this deployment.' };
    }
    const browserPermission = await Notification.requestPermission();
    const permission = webPermission(browserPermission);
    if (permission !== 'granted') {
      return {
        ok: false,
        permission,
        error: 'Notification permission is blocked in browser settings.'
      };
    }
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      }));
    await upsertWebSubscription(subscription);
    setOptedIn(true);
    return { ok: true, permission };
  } catch (error) {
    setOptedIn(false);
    return { ok: false, error: (error as Error).message || 'Could not enable notifications.' };
  }
}

export async function disableBuddyNotifications(): Promise<BuddyNotificationResult> {
  // Local intent wins even if a platform API is temporarily unavailable; the
  // server row is removed first and invalid provider endpoints self-retire.
  setOptedIn(false);
  try {
    if (supabaseConfigured) {
      const { error } = await supabase.rpc('unregister_push_subscription', {
        p_device_id: getPushDeviceId()
      });
      if (error) throw new Error(error.message);
    }
    if (isNativeApp) {
      await PushNotifications.unregister();
    } else if (webPushSupported()) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message || 'Could not disable notifications.' };
  }
}

export async function unregisterCurrentPushDevice(): Promise<void> {
  await disableBuddyNotifications();
}

/** Refresh rotated tokens/subscriptions without prompting for permission. */
export async function syncBuddyPushRegistration(): Promise<void> {
  if (!buddyPushOptedIn() || !supabaseConfigured) return;
  if (isNativeApp) {
    if ((await nativePermission(false)) !== 'granted') return;
    const token = await registerNativeToken();
    await saveNativePushToken(token);
    return;
  }
  if (!webPushSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await upsertWebSubscription(subscription);
}

export async function touchActiveBuddy(buddyId: string | null): Promise<void> {
  if (!buddyPushOptedIn() || !supabaseConfigured) return;
  await supabase.rpc('touch_push_subscription', {
    p_device_id: getPushDeviceId(),
    p_active_buddy_id: buddyId
  });
}

/** Best-effort fast path. The database outbox remains the source of retries. */
export function notifyBuddyMessage(messageId: string): void {
  if (!supabaseConfigured) return;
  void supabase.functions
    .invoke('buddy-notifications', { body: { message_id: messageId } })
    .catch(() => undefined);
}

export function routeFromPushData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const route = (data as { route?: unknown }).route;
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) return null;
  return route;
}
