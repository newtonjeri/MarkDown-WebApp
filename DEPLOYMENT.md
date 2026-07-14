# Deploying MarkPad

MarkPad is a static PWA — a folder of files. There is **no build step**.

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
the address bar. `.md` files can then be opened with MarkPad from the OS file
manager ("Open with…").

## Releasing an update

1. Make your changes.
2. Bump `VERSION` in `sw.js` (e.g. `markpad-v1.0.1`) — this invalidates the
   old cache; clients get the update on their next load and see an
   "Update ready" toast.

## Smoke test after deploy

1. Load the app, type text → preview updates live.
2. DevTools → Network → "Offline" → reload → app still works.
3. Export PDF → print dialog shows the rendered document.
