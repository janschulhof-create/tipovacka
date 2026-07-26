/* Tipovačka – service worker pro PWA, offline fallback a webové push notifikace. */
const VERSION = 'tipovacka-v7-push-result-modal';
const STATIC_CACHE = `static-${VERSION}`;

const OFFLINE_HTML = `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tipovačka – offline</title>
<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;
background:#0b1220;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
.b{max-width:320px}h1{font-size:18px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;line-height:1.5}</style>
</head><body><div class="b"><h1>Jsi offline</h1><p>Tipovačka potřebuje připojení k internetu.
Až budeš zase online, zkus to znovu.</p></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || '' }; }
  const title = data.title || 'Tipovačka';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag || 'tipovacka-reminder',
    renotify: false,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response && response.status === 200) cache.put(request, response.clone());
        return response;
      }).catch(() => hit);
      return hit || network;
    }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => new Response(OFFLINE_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })));
  }
});
