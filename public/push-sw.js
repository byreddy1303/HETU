/* Buddy message Web Push handler, imported by the generated Workbox worker.
 *
 * Improvements over the initial Codex version:
 *   - App-badge management: setAppBadge(1) on push, clearAppBadge() on click.
 *   - Question-kind CTA: distinct notification body + "Try it" action button.
 *   - Kind field forwarded from payload so the recipient can identify message type.
 *   - Silent fallback: all new fields are optional, so older payloads still work.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const kind = typeof payload.kind === 'string' ? payload.kind : 'text';
  const isQuestion = kind === 'question';

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'HETU';

  const body = typeof payload.body === 'string' && payload.body.trim()
    ? payload.body.trim()
    : 'You have a new notification.';

  const route = typeof payload.route === 'string' && payload.route.startsWith('/')
    ? payload.route
    : '/';
  
  const tagId = typeof payload.tagId === 'string' ? payload.tagId : 'default';

  // Action buttons depend on the kind of notification
  let actions = [];
  if (kind === 'question') {
    actions = [{ action: 'try', title: 'Try it \u2192' }];
  } else if (kind === 'buddy_request') {
    actions = [{ action: 'view_request', title: 'View Request \u2192' }];
  } else if (kind === 'daily_digest') {
    actions = [{ action: 'view_planner', title: 'Open Planner \u2192' }];
  }

  const showAndBadge = self.registration
    .showNotification(title, {
      body,
      icon: '/hetu-mark-192.png',
      badge: '/hetu-mark-192.png',
      tag: tagId,
      renotify: true,
      timestamp: Date.now(),
      actions,
      data: { route, messageId: payload.messageId || null, kind }
    })
    .then(() => {
      // Increment app badge so the OS icon shows an unread dot.
      if ('setAppBadge' in navigator) {
        return navigator.setAppBadge(1).catch(() => undefined);
      }
    });

  event.waitUntil(showAndBadge);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawRoute = event.notification.data?.route;
  const kind = event.notification.data?.kind;
  let route = typeof rawRoute === 'string' && rawRoute.startsWith('/') && !rawRoute.startsWith('//')
    ? rawRoute
    : '/';

  // Modify route based on the interactive action chosen by the user
  if (event.action === 'try' && kind === 'question') {
    const separator = route.includes('?') ? '&' : '?';
    route = `${route}${separator}mode=attempt`;
  } else if (event.action === 'view_request' && kind === 'buddy_request') {
    route = '/buddy';
  } else if (event.action === 'view_planner' && kind === 'daily_digest') {
    route = '/planner';
  }

  const targetUrl = new URL(route, self.location.origin).href;

  // Clear the app badge now that the user is engaging with the notification.
  const clearBadge = 'clearAppBadge' in navigator
    ? navigator.clearAppBadge().catch(() => undefined)
    : Promise.resolve();

  event.waitUntil(
    Promise.all([
      clearBadge,
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
        const existing = clients.find(
          (client) => new URL(client.url).origin === self.location.origin
        );
        if (existing) {
          if ('navigate' in existing) await existing.navigate(targetUrl);
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
    ])
  );
});
