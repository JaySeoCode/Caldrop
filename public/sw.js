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
