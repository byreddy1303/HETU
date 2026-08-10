/* Interactive Web Push handler, imported by the generated Workbox worker.
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

  const title =
    typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'HETU';

  const body =
    typeof payload.body === 'string' && payload.body.trim()
      ? payload.body.trim()
      : 'You have a new notification.';

  const route =
    typeof payload.route === 'string' && payload.route.startsWith('/') ? payload.route : '/';

  const tagId = typeof payload.tagId === 'string' ? payload.tagId : 'default';
  // Use a unique tag per notification so each one is shown independently.
  // Fall back to tagId only if messageId is absent (legacy payloads).
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : null;
  const notifTag = messageId ? `notif-${messageId}` : `${tagId}-${Date.now()}`;

  const payloadActions = Array.isArray(payload.actions)
    ? payload.actions
        .filter(
          (action) => action && typeof action.id === 'string' && typeof action.label === 'string'
        )
        .slice(0, 2)
    : [];
  // Preserve useful actions for payloads sent by older workers.
  const legacyActions =
    kind === 'question'
      ? [{ id: 'try', label: 'Try it \u2192', type: 'open', route }]
      : kind === 'buddy_request'
        ? [{ id: 'view_request', label: 'View Request \u2192', type: 'open', route: '/buddy' }]
        : kind === 'daily_digest'
          ? [{ id: 'view_planner', label: 'Open Planner \u2192', type: 'open', route: '/planner' }]
          : [];
  const notificationActions = payloadActions.length > 0 ? payloadActions : legacyActions;
  const actions = notificationActions.map((action) => ({ action: action.id, title: action.label }));

  const showAndBadge = self.registration
    .showNotification(title, {
      body,
      icon: '/hetu-mark-192.png',
      badge: '/hetu-mark-192.png',
      tag: notifTag,
      renotify: false,
      timestamp: Date.now(),
      actions,
      data: {
        route,
        messageId: payload.messageId || null,
        kind,
        actions: notificationActions,
        actionToken: typeof payload.actionToken === 'string' ? payload.actionToken : '',
        actionUrl: typeof payload.actionUrl === 'string' ? payload.actionUrl : ''
      }
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
  let route =
    typeof rawRoute === 'string' && rawRoute.startsWith('/') && !rawRoute.startsWith('//')
      ? rawRoute
      : '/';

  const configuredAction = Array.isArray(event.notification.data?.actions)
    ? event.notification.data.actions.find((action) => action.id === event.action)
    : null;

  // Modify route based on an older interactive action chosen by the user.
  if (
    configuredAction?.type === 'open' &&
    typeof configuredAction.route === 'string' &&
    configuredAction.route.startsWith('/') &&
    !configuredAction.route.startsWith('//')
  ) {
    route = configuredAction.route;
  } else if (event.action === 'try' && kind === 'question') {
    const separator = route.includes('?') ? '&' : '?';
    route = `${route}${separator}mode=attempt`;
  } else if (event.action === 'view_request' && kind === 'buddy_request') {
    route = '/buddy';
  } else if (event.action === 'view_planner' && kind === 'daily_digest') {
    route = '/planner';
  }

  if (configuredAction?.type === 'api') {
    let endpoint = null;
    try {
      const parsed = new URL(event.notification.data?.actionUrl || '');
      if (parsed.protocol === 'https:') endpoint = parsed.href;
    } catch {
      endpoint = null;
    }
    const token = event.notification.data?.actionToken;
    if (endpoint && typeof token === 'string' && token.length >= 32) {
      event.waitUntil(
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_token: token, action: configuredAction.id })
        }).then((response) => {
          if (!response.ok) throw new Error('notification action failed');
        })
      );
    }
    return;
  }

  const targetUrl = new URL(route, self.location.origin).href;

  // Clear the app badge now that the user is engaging with the notification.
  const clearBadge =
    'clearAppBadge' in navigator
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
