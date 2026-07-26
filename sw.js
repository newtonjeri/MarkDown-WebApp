// sw.js — .MD reader+ service worker.
//
// Strategy: the app shell and the app's own code are served NETWORK-FIRST and
// fall back to cache; third-party vendor bundles and icons stay CACHE-FIRST.
// The app is still fully functional offline, but an installed copy is no
// longer frozen at the version it was installed with.
//
// Why not cache-first throughout, as before: freshness then depended entirely
// on a human remembering to edit VERSION below on every deploy. Miss it once
// and this file is byte-identical on the server, the browser's update check
// finds no change, no new worker is ever installed, and every installed phone
// stays on the old build permanently — with no way for the user to force it.

const VERSION = 'mdreader-v1.2.0';

// Only used to name the cache and to evict old ones. Deliberately NOT the
// mechanism that delivers updates any more.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/fonts.css',
  './css/fonts/Inter-400-latin.woff2',
  './css/fonts/Inter-500-latin.woff2',
  './css/fonts/Inter-600-latin.woff2',
  './css/fonts/Inter-700-latin.woff2',
  './css/fonts/JetBrainsMono-400-latin.woff2',
  './css/fonts/JetBrainsMono-700-latin.woff2',
  './js/app.js',
  './js/editor.js',
  './js/emoji-map.js',
  './js/files.js',
  './js/mdhighlight.js',
  './js/pdfexport.js',
  './js/renderer.js',
  './js/theme.js',
  './vendor/marked.umd.js',
  './vendor/purify.min.js',
  './vendor/highlight.min.js',
  './vendor/github-markdown-light.css',
  './vendor/github-markdown-dark.css',
  './vendor/hljs-github-light.min.css',
  './vendor/hljs-github-dark.min.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

/** App code and shell: must be allowed to change without a version bump. */
function isAppShell(url) {
  const p = url.pathname;
  return p.endsWith('/')
    || p.endsWith('/index.html')
    || p.endsWith('.webmanifest')
    // Fonts live under css/ but never change; leave them cache-first so a
    // network-first shell does not re-fetch a megabyte of woff2 every load.
    || (/\/(js|css)\//.test(p) && !p.endsWith('.woff2'));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      // Take over as soon as the new worker is ready. Without this the new
      // worker sits in "waiting" until every client closes — and an installed
      // home-screen app is backgrounded, not closed, so it can wait for days.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  // Kept for a page that wants to promote a waiting worker explicitly. The
  // string is matched exactly; 'SKIP_WAITING' (the Workbox spelling) is also
  // accepted so a future change of convention cannot silently do nothing.
  if (event.data === 'skip-waiting' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  const shell = request.mode === 'navigate' || isAppShell(url);

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);

      if (shell) {
        // Network-first: a deploy is picked up on the next load, with the
        // cache as the offline fallback.
        try {
          const response = await fetch(request);
          if (response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          const cached = await cache.match(request, { ignoreSearch: true });
          if (cached) return cached;
          if (request.mode === 'navigate') {
            const fallback = await cache.match('./index.html');
            if (fallback) return fallback;
          }
          throw err;
        }
      }

      // Vendor bundles, icons and runtime documents: cache-first for speed.
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        if (request.mode === 'navigate') {
          const fallback = await cache.match('./index.html');
          if (fallback) return fallback;
        }
        throw err;
      }
    })(),
  );
});
