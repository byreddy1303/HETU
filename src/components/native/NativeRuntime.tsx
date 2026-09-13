import { useEffect, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { router } from '@/router';
import { resumeSync } from '@/lib/sync';
import {
  configureNativeChrome,
  haptic,
  isNativeApp,
  resolveNativeBackAction,
  routeFromAppUrl
} from '@/lib/native';
import { toast } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { flushAllDurableState } from '@/lib/durability';
import { reloadAccountState } from '@/lib/account-state';

function isTextEntry(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/** Native-only lifecycle wiring. Browser and PWA builds render no UI here. */
export default function NativeRuntime() {
  const authStatus = useAuthStore((state) => state.status);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  useEffect(() => {
    if (!isNativeApp) return;

    void configureNativeChrome();
    void NativeApp.toggleBackButtonHandler({ enabled: true }).catch(() => undefined);
    let lastRootBackAt = 0;

    const listeners = [
      NativeApp.addListener('backButton', ({ canGoBack }) => {
        if (isTextEntry(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
          void Keyboard.hide().catch(() => undefined);
          return;
        }

        const openDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        if (openDialog) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          return;
        }

        const nativeBackEvent = new CustomEvent('air:native-back', { cancelable: true });
        window.dispatchEvent(nativeBackEvent);
        if (nativeBackEvent.defaultPrevented) return;

        const path = window.location.pathname;
        const now = Date.now();
        const action = resolveNativeBackAction({ path, canGoBack, now, lastRootBackAt });
        switch (action.type) {
          case 'history':
            lastRootBackAt = 0;
            void router.navigate(-1);
            return;
          case 'route':
            lastRootBackAt = 0;
            void router.navigate(action.to, { replace: true });
            return;
          case 'arm-exit':
            lastRootBackAt = now;
            haptic('light');
            toast('Press back again to exit.');
            return;
          case 'exit':
            lastRootBackAt = 0;
            void NativeApp.minimizeApp();
            return;
        }
      }),
      NativeApp.addListener('appStateChange', ({ isActive }) => {
        document.documentElement.dataset.appActive = String(isActive);
        const uid = useAuthStore.getState().user?.id;
        const isSandbox = useAuthStore.getState().sandbox;
        if (isActive) {
          lastRootBackAt = 0;
          resumeSync();
          if (uid && !isSandbox) {
            void flushAllDurableState(uid);
            void reloadAccountState(uid);
          }
        } else {
          // Native app minimizing/suspending: immediately push all durable state to Supabase
          if (uid && !isSandbox) {
            void flushAllDurableState(uid);
          }
        }
      }),
      NativeApp.addListener('appUrlOpen', ({ url }) => {
        const route = routeFromAppUrl(url);
        if (route) setPendingRoute(route);
      })
    ];

    void NativeApp.getLaunchUrl().then((launch) => {
      const route = launch?.url ? routeFromAppUrl(launch.url) : null;
      if (route) setPendingRoute(route);
    });

    return () => {
      for (const listener of listeners) void listener.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp || !pendingRoute || authStatus !== 'signed_in') return;
    void router.navigate(pendingRoute, { replace: true });
    setPendingRoute(null);
  }, [authStatus, pendingRoute]);

  return null;
}
