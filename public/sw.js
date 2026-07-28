/* Tipovačka – service worker pro PWA, offline fallback a webové push notifikace. */
const VERSION = 'tipovacka-v8-push-click-handoff';
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

function handOffNotificationClick(client, targetUrl) {
  return new Promise((resolve) => {
    let settled = false;
    let responsePort = null;
    const finish = (handled) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      responsePort?.close();
      resolve(handled);
    };
    const timer = setTimeout(() => finish(false), 700);

    try {
      const channel = new MessageChannel();
      responsePort = channel.port1;
      responsePort.onmessage = (message) => finish(Boolean(message.data?.handled));
      client.postMessage({ type: 'TIPOVACKA_OPEN_NOTIFICATION', url: targetUrl }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((item) => item.focused)
      || windows.find((item) => item.visibilityState === 'visible')
      || windows[0];

    if (!client) return self.clients.openWindow(targetUrl);

    // Běžící PWA dostane kliknutí přímo. To je nutné hlavně na iOS,
    // kde focus() funguje, ale navigate() může URL s parametry zahodit.
    const handled = await handOffNotificationClick(client, targetUrl);
    if (handled) return client.focus();

    // Starší otevřená verze aplikace zprávu neumí přijmout. V takovém
    // případě použijeme klasickou navigaci a po načtení se modal otevře z URL.
    try {
      if ('navigate' in client) {
        const navigated = await client.navigate(targetUrl);
        if (navigated) return navigated.focus();
      }
    } catch {
      // Některé PWA kontejnery navigate() odmítají; otevřeme nové okno níže.
    }

    try {
      await client.focus();
      client.postMessage({ type: 'TIPOVACKA_OPEN_NOTIFICATION', url: targetUrl });
      return client;
    } catch {
      return self.clients.openWindow(targetUrl);
    }
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
