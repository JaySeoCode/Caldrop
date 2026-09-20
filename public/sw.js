/**
 * CalDrop service worker.
 *
 * It has exactly one job: receive the Android share-sheet POST declared as
 * `share_target` in the manifest, park the shared screenshot/text in Cache
 * Storage, and hand control to the page, which runs the normal
 * analyse -> preview -> confirm flow.
 *
 * It deliberately caches nothing else. Pages depend on the session cookie and
 * API responses are per-user calendar data - serving either from a cache would
 * show stale or wrong-account content.
 */

const SHARE_CACHE = 'caldrop-share-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share') return;

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const image = form.get('image');
        const text = ['title', 'text', 'url']
          .map((key) => form.get(key))
          .filter((value) => typeof value === 'string' && value.trim() !== '')
          .join('\n');

        const cache = await caches.open(SHARE_CACHE);
        await cache.delete('/shared/image');
        if (image instanceof File && image.size > 0) {
          await cache.put(
            '/shared/image',
            new Response(image, { headers: { 'Content-Type': image.type } }),
          );
        }
        await cache.put(
          '/shared/meta',
          new Response(
            JSON.stringify({ text, hasImage: image instanceof File && image.size > 0, at: Date.now() }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
        return Response.redirect(new URL('/?shared=1', self.location.origin).href, 303);
      } catch {
        return Response.redirect(new URL('/?shared=failed', self.location.origin).href, 303);
      }
    })(),
  );
});

// ---------------------------------------------------------------------------
// Result notifications
//
// When the user hands CalDrop an input and leaves, the analysis finishes on the
// server and arrives here as a push. The notification is the only place the
// user sees what was written, so it carries the events themselves and an Undo
// that removes exactly what this request created.
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'CalDrop';
  const requestId = payload.requestId || null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // One notification per request, so a retry replaces rather than stacks.
      tag: requestId || 'caldrop-result',
      renotify: true,
      data: { requestId, needsAttention: Boolean(payload.needsAttention) },
      actions: requestId ? [{ action: 'undo', title: 'Undo' }] : [],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (event.action === 'undo' && data.requestId) {
    event.waitUntil(
      (async () => {
        let ok = false;
        try {
          const response = await fetch('/api/calendar/undo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ requestId: data.requestId }),
          });
          ok = response.ok;
        } catch {
          ok = false;
        }

        await self.registration.showNotification(
          ok ? 'Removed from your calendar' : 'Could not undo',
          {
            body: ok
              ? 'What CalDrop just added has been deleted.'
              : 'Open CalDrop, or remove it in Google Calendar.',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: `${data.requestId}-undo`,
          },
        );
      })(),
    );
    return;
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow('/');
    })(),
  );
});
