// app.js — application controller: wires editor, preview, file ops, export,
// theming, autosave, PWA bits, and the responsive view modes together.

import { Editor, lineOps } from './editor.js';
import { renderMarkdown, countStats } from './renderer.js';
import {
  openFile, openDropped, saveFile, saveFileAs, isMarkdownName,
  saveDraft, loadDraft, clearDraft, supportsFSAccess,
} from './files.js';
import { exportPdf, initPrintHooks } from './pdfexport.js';
import { initTheme, toggleTheme, currentTheme } from './theme.js';

const $ = (sel) => document.querySelector(sel);

const WELCOME = `# Welcome to MarkPad :wave:

A fast, **offline-first** Markdown editor with GitHub-style preview and
one-click PDF export. Your work autosaves locally and never leaves this
device.

## Quick start

1. **Open** a \`.md\` file (\`Ctrl+O\`) or just start typing
2. Format with the toolbar or shortcuts — try \`Ctrl+B\`
3. **Save** with \`Ctrl+S\`, or **Export PDF** with \`Ctrl+P\`

## What renders?

Everything GitHub-flavored — tables, task lists, code, ~~and more~~:

- [x] Task lists
- [ ] Emoji like :rocket: :sparkles: :tada:
- [ ] Strikethrough, **bold**, *italic*, \`inline code\`

\`\`\`js
// Syntax-highlighted code blocks
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

| Feature | Shortcut | Works offline |
| ------- | -------- | :-----------: |
| Bold | Ctrl+B | ✅ |
| Link | Ctrl+K | ✅ |
| Export PDF | Ctrl+P | ✅ |

> **Tip** — switch between Edit, Split, and Preview in the toolbar.
> On phones, use the Edit/Preview toggle.

---

Made for people who like their notes *portable* and their tools *quiet*.
`;

/* ------------------------------------------------------------------ state */

const state = {
  fileName: 'untitled.md',
  handle: null,
  lastSaved: null, // content at last successful file save (null = never)
  autosave: localStorage.getItem('mdpad.autosave') !== 'off',
};

const isDirty = () =>
  state.lastSaved === null ? editor.getValue().trim() !== '' && editor.getValue() !== WELCOME
                          : editor.getValue() !== state.lastSaved;

/* ------------------------------------------------------------------- init */

initTheme();

const preview = $('#preview');
const editor = new Editor($('#editor-root'), {
  onChange: onEdited,
  onScroll: (info) => syncScroll('editor', info.fraction),
  onCursor: (c) => {
    $('#status-pos').textContent =
      c.selection > 0 ? `Ln ${c.line}, Col ${c.col} (${c.selection} selected)`
                      : `Ln ${c.line}, Col ${c.col}`;
  },
});

/* ----------------------------------------------------------- status/toast */

let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function refreshFileStatus() {
  $('#file-name').textContent = state.fileName;
  $('#dirty-dot').hidden = !isDirty();
  document.title = `${isDirty() ? '• ' : ''}${state.fileName} — MarkPad`;
}

/* --------------------------------------------------------------- preview */

let renderTimer;
function renderPreviewNow() {
  clearTimeout(renderTimer);
  renderTimer = undefined;
  preview.innerHTML = renderMarkdown(editor.getValue());
}
function schedulePreview() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreviewNow, 120);
}

function refreshStats() {
  const { words, chars } = countStats(editor.getValue());
  $('#status-stats').textContent =
    `${words.toLocaleString()} word${words === 1 ? '' : 's'} · ${chars.toLocaleString()} chars`;
}

/* -------------------------------------------------------------- autosave */

let draftTimer;
function scheduleDraft() {
  if (!state.autosave) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    saveDraft({ content: editor.getValue(), fileName: state.fileName, dirty: isDirty() });
    $('#status-msg').textContent =
      `Draft saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, 800);
}

function onEdited() {
  schedulePreview();
  refreshStats();
  refreshFileStatus();
  scheduleDraft();
}

/* ------------------------------------------------------------- file ops */

function loadDocument(text, name, handle) {
  state.fileName = name;
  state.handle = handle ?? null;
  state.lastSaved = handle ? text : null;
  editor.setValue(text);
  onEdited();
}

async function guardUnsaved() {
  if (!isDirty()) return true;
  const dlg = $('#confirm-dialog');
  return new Promise((resolve) => {
    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'discard'), { once: true });
  });
}

async function doNew() {
  if (!(await guardUnsaved())) return;
  clearDraft();
  loadDocument('', 'untitled.md', null);
  editor.focus();
}

async function doOpen() {
  if (!(await guardUnsaved())) return;
  try {
    const { handle, name, text } = await openFile();
    loadDocument(text, name, handle);
    toast(`Opened ${name}`);
  } catch (err) {
    if (err?.name !== 'AbortError') { console.error(err); toast('Could not open file'); }
  }
}

async function doSave(forceAs = false) {
  try {
    const text = editor.getValue();
    const result = forceAs
      ? await saveFileAs(text, state.fileName)
      : await saveFile(text, state.handle, state.fileName);
    state.handle = result.handle;
    state.fileName = result.name;
    state.lastSaved = text;
    saveDraft({ content: text, fileName: state.fileName, dirty: false });
    refreshFileStatus();
    toast(result.viaDownload
      ? `Downloaded ${result.name} (browser doesn't support in-place saving)`
      : `Saved ${result.name}`);
  } catch (err) {
    if (err?.name !== 'AbortError') { console.error(err); toast('Save failed'); }
  }
}

/* --------------------------------------------------------------- export */

function openExportDialog() {
  $('#export-dialog').showModal();
}

$('#export-form').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'export') return;
  const data = new FormData(e.target);
  exportPdf(editor.getValue(), state.fileName, {
    pageSize: data.get('pageSize'),
    margin: data.get('margin'),
    includeToc: data.get('toc') === 'on',
  });
});

initPrintHooks(() => editor.getValue(), () => state.fileName);

/* ---------------------------------------------------------- scroll sync */

let syncLock = { source: null, until: 0 };
function syncScroll(source, fraction) {
  const now = performance.now();
  if (syncLock.source && syncLock.source !== source && now < syncLock.until) return;
  syncLock = { source, until: now + 120 };
  if (source === 'editor') {
    const max = preview.scrollHeight - preview.clientHeight;
    preview.scrollTop = fraction * max;
  } else {
    editor.setScrollFraction(fraction);
  }
}

preview.addEventListener('scroll', () => {
  const max = preview.scrollHeight - preview.clientHeight;
  if (max > 0) syncScroll('preview', preview.scrollTop / max);
}, { passive: true });

// In-page anchor navigation inside the preview.
preview.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  document.getElementById(decodeURIComponent(a.hash.slice(1)))
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ------------------------------------------------------------ view modes */

const main = $('#main');
const mobileQuery = matchMedia('(max-width: 767px)');

function setView(view) {
  if (view === 'split' && mobileQuery.matches) view = 'edit';
  main.dataset.view = view;
  document.body.dataset.view = view; // lets CSS hide editing tools in preview
  for (const btn of document.querySelectorAll('[data-view-btn]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.viewBtn === view));
  }
  localStorage.setItem('mdpad.view', view);
  if (view !== 'preview') editor.focus();
}

for (const btn of document.querySelectorAll('[data-view-btn]')) {
  btn.addEventListener('click', () => setView(btn.dataset.viewBtn));
}
mobileQuery.addEventListener('change', () => {
  if (mobileQuery.matches && main.dataset.view === 'split') setView('edit');
});

/* -------------------------------------------------------- divider drag */

const divider = $('#divider');
function setSplit(ratio) {
  const clamped = Math.min(0.8, Math.max(0.2, ratio));
  main.style.setProperty('--split', `${(clamped * 100).toFixed(1)}%`);
  localStorage.setItem('mdpad.split', String(clamped));
}
divider.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  divider.setPointerCapture(e.pointerId);
  const rect = main.getBoundingClientRect();
  const onMove = (ev) => setSplit((ev.clientX - rect.left) / rect.width);
  divider.addEventListener('pointermove', onMove);
  divider.addEventListener('pointerup', () => divider.removeEventListener('pointermove', onMove), { once: true });
});
divider.addEventListener('dblclick', () => setSplit(0.5));
divider.addEventListener('keydown', (e) => {
  const cur = parseFloat(localStorage.getItem('mdpad.split') ?? '0.5');
  if (e.key === 'ArrowLeft') setSplit(cur - 0.05);
  if (e.key === 'ArrowRight') setSplit(cur + 0.05);
});

/* ------------------------------------------------------------- toolbar */

const commands = {
  'new': doNew,
  'open': doOpen,
  'save': () => doSave(false),
  'save-as': () => doSave(true),
  'export': openExportDialog,
  'theme': () => { toggleTheme(); updateThemeButton(); },
  'h1': () => editor.applyLineOp(lineOps.heading(1)),
  'h2': () => editor.applyLineOp(lineOps.heading(2)),
  'h3': () => editor.applyLineOp(lineOps.heading(3)),
  'bold': () => editor.applyWrap('**'),
  'italic': () => editor.applyWrap('*'),
  'strike': () => editor.applyWrap('~~'),
  'code': () => editor.applyWrap('`'),
  'link': () => editor.insertLink(false),
  'image': () => editor.insertLink(true),
  'ul': () => editor.applyLineOp(lineOps.bullet),
  'ol': () => editor.applyLineOp(lineOps.ordered),
  'task': () => editor.applyLineOp(lineOps.task),
  'quote': () => editor.applyLineOp(lineOps.quote),
  'codeblock': () => editor.insertCodeBlock(),
  'table': () => editor.insertTable(),
  'hr': () => editor.insertHr(),
  'undo': () => editor.undo(),
  'redo': () => editor.redo(),
};

for (const btn of document.querySelectorAll('[data-cmd]')) {
  btn.addEventListener('click', () => commands[btn.dataset.cmd]?.());
}

function updateThemeButton() {
  const dark = currentTheme() === 'dark';
  $('#btn-theme').setAttribute('aria-pressed', String(dark));
  $('#btn-theme').title = dark ? 'Switch to light theme' : 'Switch to dark theme';
}
updateThemeButton();

/* ---------------------------------------------------- global shortcuts */

window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 's') { e.preventDefault(); doSave(e.shiftKey); }
  else if (key === 'o') { e.preventDefault(); doOpen(); }
  else if (key === 'n' && e.altKey) { e.preventDefault(); doNew(); }
  else if (key === 'p' && !e.shiftKey) { e.preventDefault(); openExportDialog(); }
});

window.addEventListener('beforeunload', (e) => {
  if (isDirty() && !state.autosave) e.preventDefault();
});

/* ---------------------------------------------------------- drag & drop */

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const item = e.dataTransfer?.items?.[0];
  if (!item || item.kind !== 'file') return;
  const fileLike = 'getAsFileSystemHandle' in item
    ? await item.getAsFileSystemHandle()
    : item.getAsFile();
  const probeName = fileLike?.name ?? '';
  if (!isMarkdownName(probeName)) { toast('Only .md files can be opened'); return; }
  if (!(await guardUnsaved())) return;
  const { handle, name, text } = await openDropped(fileLike);
  loadDocument(text, name, handle);
  toast(`Opened ${name}`);
});

/* -------------------------------------------------------- autosave toggle */

const autosaveToggle = $('#autosave-toggle');
autosaveToggle.checked = state.autosave;
autosaveToggle.addEventListener('change', () => {
  state.autosave = autosaveToggle.checked;
  localStorage.setItem('mdpad.autosave', state.autosave ? 'on' : 'off');
  if (state.autosave) scheduleDraft();
});

/* ------------------------------------------------------------- PWA bits */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Update ready — reload to apply', 6000);
          }
        });
      });
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });
}

// Files opened from the OS via the PWA file handler.
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    const fileHandle = params.files?.[0];
    if (!fileHandle) return;
    const { handle, name, text } = await openDropped(fileHandle);
    loadDocument(text, name, handle);
  });
}

const updateOnlineBadge = () => {
  $('#status-net').textContent = navigator.onLine ? '' : 'Offline — all features available';
};
window.addEventListener('online', updateOnlineBadge);
window.addEventListener('offline', updateOnlineBadge);

/* --------------------------------------------------------------- boot */

(function boot() {
  const draft = loadDraft();
  if (draft && (draft.dirty || draft.content)) {
    state.fileName = draft.fileName || 'untitled.md';
    state.lastSaved = draft.dirty ? null : draft.content;
    editor.setValue(draft.content);
    $('#status-msg').textContent = 'Restored previous session';
  } else {
    editor.setValue(WELCOME);
  }
  if (!supportsFSAccess) {
    $('#btn-save').title = 'Downloads a copy (this browser cannot save in place)';
  }
  setView('preview'); // always open in reading mode; switch to Edit/Split from the toolbar
  const split = parseFloat(localStorage.getItem('mdpad.split') ?? '0.5');
  if (!Number.isNaN(split)) main.style.setProperty('--split', `${split * 100}%`);
  onEdited();
  renderPreviewNow(); // first paint shouldn't wait for the debounce
  updateOnlineBadge();
})();
