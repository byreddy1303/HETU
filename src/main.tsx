import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from '@/App';
import '@/index.css';

const UPDATE_CHECK_INTERVAL_MS = 60 * 1000; // Check for PWA updates every 1 minute while app is open

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
  // Reload once so all subsequent requests come from the APK's local server.
  const reloadKey = 'native_service_worker_removed';
  if (wasControlled && sessionStorage.getItem(reloadKey) !== 'true') {
    sessionStorage.setItem(reloadKey, 'true');
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

  window.setInterval(checkForServiceWorkerUpdate, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForServiceWorkerUpdate();
  });
}

if (Capacitor.isNativePlatform()) {
  void disableNativeServiceWorkers().catch(() => undefined);
} else {
  configurePwaUpdates();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
