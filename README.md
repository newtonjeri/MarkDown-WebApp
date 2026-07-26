# MarkPad — Markdown Editor & PDF Exporter

An **offline-first Progressive Web App** for viewing, editing, and exporting
Markdown files with GitHub-style rendering. Private by design: no cloud, no
tracking, no network calls after the first load — your files never leave your
device.

![version](https://img.shields.io/badge/version-1.0.0-blue) ![license](https://img.shields.io/badge/deps-all_vendored-success)

## Features

- **GitHub-flavored Markdown preview** — headings, lists, tables, task lists,
  strikethrough, blockquotes, fenced code with syntax highlighting
  (190+ languages via highlight.js), autolinks, and 1,900+ `:emoji:` shortcodes
- **Source editor** with Markdown syntax highlighting, line numbers,
  soft-wrap-aware gutter, auto-indent, and list/quote continuation on Enter
- **Live preview** (~120 ms debounce) with two-way scroll sync
- **PDF export** via the browser's print engine — vector output with
  selectable text, A4/Letter page sizes, three margin presets, optional
  clickable table of contents, automatic page-break rules
- **File management** — open/save `.md` files in place (File System Access
  API on Chrome/Edge; picker + download fallback on Firefox/Safari),
  drag-and-drop, OS file-handler registration ("Open with MarkPad")
- **Autosave** — drafts persist to localStorage (toggleable) and restore on
  next launch
- **Responsive** — split view with draggable divider on desktop, Edit/Preview
  toggle on phones (320 px and up), touch-friendly 40 px targets
- **Dark/light theme** — follows the OS until you toggle it manually; both the
  UI and the GitHub preview stylesheets switch together
- **100% offline** after first visit (service worker precaches everything)
- **Accessible** — landmarks, toolbar labels, focus rings, live status
  regions, skip link, keyboard-operable pane resizer, `Esc`-then-`Tab` escape
  hatch out of the editor

## Quick start

The app is plain HTML/CSS/JS — **no build step**. It just needs to be served
over HTTP (service workers and ES modules don't run from `file://`):

```bash
cd MarkDown-WebApp
python3 -m http.server 8000
# open http://localhost:8000
```

or any static server (`npx serve`, nginx, GitHub Pages, …). Visit once online;
after that it works fully offline and can be installed from the browser's
"Install app" prompt.

## Opening a document by link

MarkPad can be pointed at a remote Markdown file with a query parameter, so
another application can hand a document over:

```
https://newtonjeri.github.io/MarkDown-WebApp/?url=https://example.com/notes.md
```

`file=` and `src=` are accepted as aliases. The linked document replaces
whatever the autosaved draft restored, and opens in a clean (unmodified)
state — it has no file handle, so **Save As** is the way back to disk.

The document name is taken from the URL path, falling back to a `relpath`,
`path`, `name` or `file` query parameter for servers that stream a file by
query rather than by path.

Two requirements on the host serving the document:

- it must send a permissive `Access-Control-Allow-Origin`, since the fetch is
  cross-origin from `github.io`;
- it should serve the file as `text/markdown` (or any text type) rather than
  forcing a download.

If the fetch fails, MarkPad says why — a cross-origin refusal and a dead link
are indistinguishable to the user otherwise — and leaves the editor usable.

## Keyboard shortcuts

| Action | Shortcut | | Action | Shortcut |
| ------ | -------- |-| ------ | -------- |
| Bold | `Ctrl+B` | | Save | `Ctrl+S` |
| Italic | `Ctrl+I` | | Save As | `Ctrl+Shift+S` |
| Inline code | `Ctrl+E` | | Open | `Ctrl+O` |
| Strikethrough | `Ctrl+Shift+X` | | New | `Ctrl+Alt+N` |
| Link | `Ctrl+K` | | Export PDF | `Ctrl+P` |
| Numbered list | `Ctrl+Shift+7` | | Indent lines | `Tab` |
| Bulleted list | `Ctrl+Shift+8` | | Outdent lines | `Shift+Tab` |
| Blockquote | `Ctrl+Shift+9` | | Leave editor by keyboard | `Esc`, then `Tab` |

`Cmd` replaces `Ctrl` on macOS.

## Exporting PDFs

**Export PDF** (or `Ctrl+P`) renders the document with the light GitHub theme
into a hidden print layer, applies your page size/margins as an `@page` rule,
and opens the system print dialog — choose **"Save as PDF"** as the
destination. This is the only fully-offline approach that produces
print-quality *vector* PDFs (selectable text, working internal links) in every
browser; canvas-based exporters produce blurry raster pages.

Extras:

- **Table of contents** — optional, built from `h1–h3`, links jump to the
  right page in the PDF
- **Manual page breaks** — put `<div class="page-break"></div>` in your
  Markdown
- Page numbers appear on browsers that support `@page` margin boxes
  (Chromium 131+)

## Architecture

```
index.html              app shell, toolbar, dialogs, print root
css/app.css             design tokens, layout, themes, responsive + print rules
js/
  app.js                controller: wiring, view modes, autosave, PWA glue
  editor.js             editor component + pure text-transform ops (tested)
  mdhighlight.js        line-based Markdown source highlighter (tested)
  renderer.js           marked pipeline: GFM + emoji + slugs + hljs + DOMPurify (tested)
  files.js              FS Access API + fallbacks, localStorage drafts (tested)
  pdfexport.js          print-root builder, @page injection, TOC
  theme.js              dark/light switching, stylesheet pairs
  emoji-map.js          generated from gemoji (1,913 GitHub shortcodes)
vendor/                 pinned, vendored: marked 18.0.6, DOMPurify 3.4.12,
                        highlight.js 11.11.1 (+ GitHub styles),
                        github-markdown-css 5.9.0
sw.js                   precaching service worker (bump VERSION to release)
manifest.webmanifest    PWA manifest with file_handlers
tests/tests.html        dependency-free unit test runner (48 tests)
```

**Editor design.** A transparent `<textarea>` (the real input, native undo,
IME- and screen-reader-friendly) sits on top of a highlighted mirror `<div>`
with identical font metrics; each logical line is its own block so the gutter
can measure soft-wrapped heights and keep line numbers aligned. The mirror and
gutter follow the textarea's scroll position via transforms.

**Rendering pipeline.** `marked` (GFM) → custom heading renderer with a
github-slugger-compatible slugger → custom emoji inline tokenizer →
highlight.js for fenced code → `DOMPurify` sanitization (scripts, event
handlers, and `javascript:` URLs are stripped; task-list checkboxes are forced
`disabled`) → task-list class fix-up for GitHub CSS.

## Testing

Open `tests/tests.html` via the local server — results render in-page.
Headless run (used in CI/this repo's verification):

```bash
python3 -m http.server 8437 &
firefox --headless --profile <profile-with-dump-enabled> \
  http://127.0.0.1:8437/tests/tests.html
```

## Browser support

| | Chrome/Edge | Firefox | Safari |
| - | - | - | - |
| Editing, preview, PDF export, offline PWA | ✅ | ✅ | ✅ |
| Save in place / "Open with" | ✅ | ⬇ downloads a copy | ⬇ downloads a copy |

Latest two major versions of each. Responsive from 320 px phones to 1920 px+
desktops.

## Known limitations (v1.0)

- Firefox/Safari can't write back to the original file (no File System Access
  API) — **Save** downloads a copy instead; drafts still autosave locally.
- The file handle isn't retained across page reloads (a restored session
  reconnects to its file on the next explicit Save).
- Very large documents (>10,000 lines) switch to approximate line-number
  alignment; >1 MB files may type with visible latency.
- The editor's *source* highlighting is intentionally approximate for exotic
  nesting (the preview is always authoritative).
- PDF page numbers depend on browser `@page` margin-box support.

## Privacy

No analytics, no fonts from CDNs, no external requests of any kind. The
service worker only caches same-origin files. Documents live in your files
and your browser's localStorage — nowhere else.
