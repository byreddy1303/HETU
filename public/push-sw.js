/* Buddy message Web Push handler, imported by the generated Workbox worker. */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'HETU';
  const body = typeof payload.body === 'string' && payload.body.trim()
    ? payload.body.trim()
    : 'Your buddy sent a message.';
  const route = typeof payload.route === 'string' && payload.route.startsWith('/')
    ? payload.route
    : '/buddy';
  const buddyId = typeof payload.buddyId === 'string' ? payload.buddyId : 'new';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/hetu-mark-192.png',
      badge: '/hetu-mark-192.png',
      tag: `buddy-${buddyId}`,
      renotify: true,
      timestamp: Date.now(),
      data: { route, messageId: payload.messageId || null }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawRoute = event.notification.data?.route;
  const route = typeof rawRoute === 'string' && rawRoute.startsWith('/') && !rawRoute.startsWith('//')
    ? rawRoute
    : '/buddy';
  const targetUrl = new URL(route, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        if ('navigate' in existing) await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
