# Deploying .MD reader+

.MD reader+ is a static PWA — a folder of files. There is **no build step**.

## What to deploy

Everything except `tests/` (optional to include), `README.md`, and this file
is required at runtime:

```
index.html  manifest.webmanifest  sw.js
css/  js/  vendor/  icons/
```

## Options

### Local / LAN
```bash
python3 -m http.server 8000        # then open http://localhost:8000
```

### Any static host (GitHub Pages, Netlify, nginx, S3…)
Copy the folder as-is. All URLs are relative, so it works from a subpath
(e.g. `https://example.com/markpad/`). Requirements:

- **HTTPS** (or `localhost`) — service workers and the File System Access API
  require a secure context.
- Serve `manifest.webmanifest` as `application/manifest+json` (most hosts do)
  and `sw.js` from the app's root path so its scope covers the app.

### Install as an app
Visit once in Chrome/Edge (desktop or Android) and use the "Install" icon in
the address bar. `.md` files can then be opened with .MD reader+ from the OS file
manager ("Open with…").

## Releasing an update

1. Make your changes.
2. Push. That is the whole procedure — clients update themselves.

Updates no longer depend on remembering to bump a constant. The app shell and
the app's own code (`index.html`, `js/`, `css/`) are served **network-first**
with the cache as the offline fallback, so a deploy is picked up on the next
load; the service worker calls `skipWaiting()` so it takes over immediately
rather than waiting for every client to close; and the page reloads itself on
`controllerchange`.

Bumping `VERSION` in `sw.js` is now optional — it only renames the cache and
evicts the old one, which is worth doing when a vendor bundle or an icon
changes, since those stay cache-first.

> This used to be the whole update mechanism, and it was fragile: miss the
> bump once and `sw.js` was byte-identical on the server, the browser's update
> check found no change, and every installed phone stayed on the old build
> permanently.

**One safety note:** the reload is skipped when the document has unsaved
changes and autosave is off — the app shows a message instead, because
reloading would discard the buffer.

## Smoke test after deploy

1. Load the app, type text → preview updates live.
2. DevTools → Network → "Offline" → reload → app still works.
3. Export PDF → print dialog shows the rendered document.
