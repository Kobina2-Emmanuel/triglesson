/* Service worker: makes the lesson work offline.
   - Own files: network first (so online users always get the latest deploy), cache as fallback.
   - CDN files (Three.js, KaTeX, fonts): cache first. All saved on the first online visit.
   BUMP `VERSION` whenever you deploy changes, so old caches are cleared. */
const VERSION = 'v3';
const CORE = 'angles-core-' + VERSION;
const CDN = 'angles-cdn-' + VERSION;

const LOCAL = ['./', 'index.html', 'style.css', 'script.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

const CDN_JS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js'
];
/* stylesheets: saved, then scanned for the font files they point to */
const CDN_CSS = [
  'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css',
  'https://fonts.googleapis.com/css2?family=Sora:wght@400;600;800&family=Inter:wght@400;500;600&display=swap'
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

async function saveUrl(cache, url) {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return false;
    await cache.put(url, r);
    return true;
  } catch (e) { return false; }
}
async function saveCss(cache, url) {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return false;
    const text = await r.clone().text();
    await cache.put(url, r);
    const fonts = Array.from(text.matchAll(/url\(([^)]+)\)/g))
      .map(m => m[1].replace(/['"]/g, '').trim())
      .filter(u => /\.woff2(\?|$)/.test(u))              /* woff2 only: every browser with a service worker supports it */
      .map(u => new URL(u, url).href);
    const res = await Promise.all(fonts.map(u => saveUrl(cache, u)));
    return res.every(Boolean);
  } catch (e) { return false; }
}
async function complete() {
  const cache = await caches.open(CDN);
  const hits = await Promise.all(CDN_JS.concat(CDN_CSS).map(u => cache.match(u)));
  return hits.every(Boolean);
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    await (await caches.open(CORE)).addAll(LOCAL);
    const cdn = await caches.open(CDN);
    await Promise.all(CDN_JS.map(u => saveUrl(cdn, u)).concat(CDN_CSS.map(u => saveCss(cdn, u))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CORE && k !== CDN) await caches.delete(k);
    await self.clients.claim();
    const full = await complete();
    for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage({ type: 'offline-ready', full });
  })());
});

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
async function networkFirst(req) {
  const cache = await caches.open(CORE);
  try {
    const r = await withTimeout(fetch(req), 4000);        /* slow classroom wifi: fall back to the saved copy after 4 s */
    if (r.ok && !new URL(req.url).pathname.endsWith('/sw.js')) cache.put(req, r.clone());
    return r;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match('index.html'));
    return hit || Response.error();
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(CDN);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
    return r;
  } catch (e) { return Response.error(); }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (CDN_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
});
