/* Tipovačka – jednoduchý service worker (instalovatelnost + offline fallback).
   Záměrně NEcachuje HTML stránek ani API (kvůli přihlášení/RLS a aktuálnosti dat) –
   pouze statické assety a v offline režimu ukáže náhradní obrazovku. */
const VERSION = 'tipovacka-v4';
const STATIC_CACHE = `static-${VERSION}`;

const OFFLINE_HTML = `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tipovačka – offline</title>
<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;
background:#0b1220;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
.b{max-width:320px}h1{font-size:18px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;line-height:1.5}</style>
</head><body><div class="b"><h1>Jsi offline</h1><p>Tipovačka potřebuje připojení k internetu.
Až budeš zase online, zkus to znovu.</p></div></body></html>`;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cizí původ neřešíme

  // Statické assety (build + ikony) → cache-first se stálým doplňováním
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);

  if (isStatic) {
    e.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fetchPromise;
      })
    );
    return;
  }

  // Navigace (otevření stránky) → network-first, offline fallback
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(
        () => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      )
    );
    return;
  }

  // Vše ostatní (API, autentizovaná data) → síť, žádné cachování
});
