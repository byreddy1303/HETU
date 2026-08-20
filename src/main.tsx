import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from '@/App';
import '@/index.css';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

// Catch Vite dynamic module preload failures (e.g., after new deployments)
window.addEventListener('vite:preloadError', () => {
  const pageHasBeenReloaded = sessionStorage.getItem('page_reloaded_for_chunk_error');
  if (!pageHasBeenReloaded) {
    sessionStorage.setItem('page_reloaded_for_chunk_error', 'true');
    window.location.reload();
  }
});

async function disableNativeServiceWorkers(): Promise<void> {
  if (!navigator.serviceWorker) return;

  const wasControlled = Boolean(navigator.serviceWorker.controller);
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  // A controller remains active for the current document after unregistering.
  // After unregistering, the next document cannot be controlled, so this
  // reload is self-limiting without a session flag that could become stale.
  if (wasControlled) {
    window.location.reload();
  }
}

function configurePwaUpdates(): void {
  // When an installed PWA is already controlled by a service worker, a newly
  // activated release should replace the open app without asking the learner
  // to refresh. Ignore the first claim on a brand-new installation.
  let hasServiceWorkerController = Boolean(navigator.serviceWorker?.controller);
  let reloadingForUpdate = false;

  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (!hasServiceWorkerController) {
      hasServiceWorkerController = true;
      return;
    }
    if (reloadingForUpdate) return;

    reloadingForUpdate = true;
    window.location.reload();
  });

  function checkForServiceWorkerUpdate(): void {
    if (!navigator.serviceWorker) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined);
  }

  // Installed PWAs can stay open for days. Check immediately and periodically
  // so an activated release replaces obsolete cached screens.
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      void registration.update();
    }
  });

  window.setInterval(() => {
    if (document.visibilityState === 'visible') checkForServiceWorkerUpdate();
  }, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForServiceWorkerUpdate();
  });
}

function schedulePwaUpdates(): void {
  const start = () => configurePwaUpdates();
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(start, { timeout: 2500 });
    return;
  }
  window.setTimeout(start, 1200);
}

if (Capacitor.isNativePlatform()) {
  void disableNativeServiceWorkers().catch(() => undefined);
} else {
  schedulePwaUpdates();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
