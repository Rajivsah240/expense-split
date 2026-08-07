/* Web Push handlers loaded by the generated Workbox service worker. */

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Expense Split';
  const message = typeof payload.body === 'string' ? payload.body : '';
  const groupName = typeof payload.groupName === 'string' ? payload.groupName : '';
  const notificationId = typeof payload.notificationId === 'string' ? payload.notificationId : '';
  const body = groupName && message ? `${groupName}: ${message}` : message || groupName;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      tag: notificationId ? `expense-split:${notificationId}` : 'expense-split',
      renotify: true,
      timestamp: typeof payload.createdAt === 'number' ? payload.createdAt : Date.now(),
      data: {
        url: typeof payload.url === 'string' ? payload.url : '/',
        notificationId,
      },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  let targetUrl = self.location.origin + '/';
  try {
    const requested = new URL(event.notification.data?.url || '/', self.location.origin);
    if (requested.origin === self.location.origin) targetUrl = requested.href;
  } catch {
    /* Open the app root when a malformed payload somehow reaches the worker. */
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
      const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
      if (existing) {
        try {
          await existing.navigate(targetUrl);
        } catch {
          /* Focusing the current app is still preferable to doing nothing. */
        }
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
