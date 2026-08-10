import { useEffect, useState } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth';
import { isNativeApp } from '@/lib/native';
import {
  pushNotificationsOptedIn,
  routeFromPushData,
  saveNativePushToken,
  syncBuddyPushRegistration
} from '@/lib/buddyNotifications';

/** Keeps opted-in device registrations fresh and handles native deep links. */
export default function BuddyNotificationRuntime() {
  const authStatus = useAuthStore((state) => state.status);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus !== 'signed_in' || !pushNotificationsOptedIn()) return;
    void syncBuddyPushRegistration().catch(() => undefined);

    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncBuddyPushRegistration().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncWhenVisible);
    };
  }, [authStatus]);

  useEffect(() => {
    if (!isNativeApp) return;
    const listeners = [
      PushNotifications.addListener('registration', (token) => {
        void saveNativePushToken(token.value).catch(() => undefined);
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
        const route = routeFromPushData(event.notification.data);
        if (route) setPendingRoute(route);
      })
    ];
    return () => {
      for (const listener of listeners) void listener.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    if (!pendingRoute || authStatus !== 'signed_in') return;
    void router.navigate(pendingRoute);
    setPendingRoute(null);
  }, [authStatus, pendingRoute]);

  return null;
}
