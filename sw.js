// sw.js — MarkPad service worker. Precache everything on install, then serve
// cache-first: after the first visit the app is 100% functional offline.
// Bump VERSION on any asset change to roll out updates.

const VERSION = 'markpad-v1.0.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)),
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
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        // Runtime-cache anything same-origin we didn't precache (e.g. images
        // referenced by documents) so repeat views work offline too.
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Offline navigation to any path falls back to the app shell.
        if (request.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
