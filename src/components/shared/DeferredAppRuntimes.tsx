import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth';

const BuddyNotificationRuntime = lazy(
  () => import('@/components/notifications/BuddyNotificationRuntime')
);
const BuddyPresenceRuntime = lazy(() => import('@/components/buddy/BuddyPresenceRuntime'));

interface IdleWindow {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/** Starts non-visual collaboration listeners after the signed-in UI is responsive. */
export default function DeferredAppRuntimes() {
  const authStatus = useAuthStore((state) => state.status);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authStatus !== 'signed_in') {
      setReady(false);
      return;
    }

    const idleWindow = window as unknown as IdleWindow;
    const handle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(() => setReady(true), { timeout: 1800 })
      : window.setTimeout(() => setReady(true), 700);

    return () => {
      if (idleWindow.cancelIdleCallback && idleWindow.requestIdleCallback) {
        idleWindow.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
    };
  }, [authStatus]);

  return ready ? (
    <Suspense fallback={null}>
      <BuddyNotificationRuntime />
      <BuddyPresenceRuntime />
    </Suspense>
  ) : null;
}
