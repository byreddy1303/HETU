import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import { usePrefsStore } from '@/stores/prefs';
import type { ResolvedTheme } from '@/lib/theme';

export type HapticIntent = 'selection' | 'light' | 'firm' | 'success' | 'warning' | 'error';
export type NativeBackAction =
  | { type: 'history' }
  | { type: 'route'; to: '/' | '/auth' }
  | { type: 'arm-exit' }
  | { type: 'exit' };

const ROOT_ROUTES = new Set(['/', '/auth']);
const AUTH_CHILD_ROUTES = new Set(['/signup', '/forgot-pin', '/reset-pin', '/request-access']);
export const BACK_EXIT_WINDOW_MS = 2_000;

export const isNativeApp = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform();

// Apply the native styling hook before React's first paint. configureNativeChrome
// repeats this defensively when the runtime component mounts.
if (isNativeApp && typeof document !== 'undefined') {
  document.documentElement.dataset.native = nativePlatform;
}

function hapticsAllowed(): boolean {
  return isNativeApp && usePrefsStore.getState().hapticsEnabled !== false;
}

/**
 * Fire-and-forget native feedback. Every call is deliberately best-effort:
 * unsupported hardware, disabled vibration, or a plugin error can never block
 * the study action that triggered it.
 */
export function haptic(intent: HapticIntent): void {
  if (!hapticsAllowed()) return;

  let action: Promise<void>;
  switch (intent) {
    case 'selection':
      action = Haptics.selectionChanged();
      break;
    case 'light':
      action = Haptics.impact({ style: ImpactStyle.Light });
      break;
    case 'firm':
      action = Haptics.impact({ style: ImpactStyle.Medium });
      break;
    case 'success':
      action = Haptics.notification({ type: NotificationType.Success });
      break;
    case 'warning':
      action = Haptics.notification({ type: NotificationType.Warning });
      break;
    case 'error':
      action = Haptics.notification({ type: NotificationType.Error });
      break;
  }

  void action.catch(() => undefined);
}

export async function configureNativeChrome(theme?: ResolvedTheme): Promise<void> {
  if (!isNativeApp) return;
  document.documentElement.dataset.native = nativePlatform;
  const resolved = theme ?? (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  try {
    await Promise.all([
      SystemBars.setStyle({
        style: resolved === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
      }),
      Keyboard.setStyle({ style: resolved === 'dark' ? KeyboardStyle.Dark : KeyboardStyle.Light })
    ]);
  } catch {
    // Native chrome is cosmetic; startup must remain available on older devices.
  }
}

export function routeFromAppUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'airjournal:') {
      const hostPath = parsed.hostname && parsed.hostname !== 'app' ? `/${parsed.hostname}` : '';
      return `${hostPath}${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    }
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    }
  } catch {
    return null;
  }
  return null;
}

/** Android Back policy, kept pure so accidental-exit behavior stays testable. */
export function resolveNativeBackAction({
  path,
  canGoBack,
  now,
  lastRootBackAt
}: {
  path: string;
  canGoBack: boolean;
  now: number;
  lastRootBackAt: number;
}): NativeBackAction {
  if (!ROOT_ROUTES.has(path)) {
    if (canGoBack) return { type: 'history' };
    return { type: 'route', to: AUTH_CHILD_ROUTES.has(path) ? '/auth' : '/' };
  }
  return now - lastRootBackAt <= BACK_EXIT_WINDOW_MS ? { type: 'exit' } : { type: 'arm-exit' };
}
