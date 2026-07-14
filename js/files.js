// files.js — open/save .md files. Uses the File System Access API where
// available (Chrome/Edge); falls back to <input type=file> + download links
// elsewhere (Firefox/Safari). Also persists an unsaved draft to localStorage.

export const supportsFSAccess =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;

const MD_TYPES = [
  {
    description: 'Markdown files',
    accept: { 'text/markdown': ['.md', '.markdown'] },
  },
];

/** Result shape used by open/save: {handle, name, text}. handle may be null. */

export async function openFile() {
  if (supportsFSAccess) {
    const [handle] = await window.showOpenFilePicker({
      types: MD_TYPES,
      excludeAcceptAllOption: false,
      multiple: false,
    });
    const file = await handle.getFile();
    return { handle, name: file.name, text: await file.text() };
  }
  return openFileViaInput();
}

function openFileViaInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,text/markdown';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return reject(new DOMException('No file chosen', 'AbortError'));
      resolve({ handle: null, name: file.name, text: await file.text() });
    });
    // If the picker is dismissed, surface it as an abort like the FS API does.
    input.addEventListener('cancel', () =>
      reject(new DOMException('The user aborted a request.', 'AbortError')));
    input.click();
  });
}

/** Open a dropped/launched File or FileSystemFileHandle. */
export async function openDropped(item) {
  if (item && typeof item.getFile === 'function') {
    const file = await item.getFile();
    return { handle: item, name: file.name, text: await file.text() };
  }
  return { handle: null, name: item.name, text: await item.text() };
}

export function isMarkdownName(name) {
  return /\.(md|markdown|mdown|txt)$/i.test(name ?? '');
}

async function verifyWritePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

/**
 * Save text. Reuses `handle` when possible, otherwise prompts (FS API) or
 * downloads (fallback). Returns {handle, name, viaDownload}.
 */
export async function saveFile(text, handle, suggestedName = 'untitled.md') {
  if (supportsFSAccess) {
    let target = handle;
    if (target && !(await verifyWritePermission(target))) target = null;
    if (!target) {
      target = await window.showSaveFilePicker({
        types: MD_TYPES,
        suggestedName,
      });
    }
    const writable = await target.createWritable();
    await writable.write(text);
    await writable.close();
    return { handle: target, name: target.name, viaDownload: false };
  }
  downloadText(text, suggestedName);
  return { handle: null, name: suggestedName, viaDownload: true };
}

/** Force a "save as": always prompt for a new location/name. */
export async function saveFileAs(text, suggestedName = 'untitled.md') {
  return saveFile(text, null, suggestedName);
}

function downloadText(text, name) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* -------------------------------------------------------------- draft store */

const DRAFT_KEY = 'mdpad.draft.v1';

export function saveDraft({ content, fileName, dirty }) {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ content, fileName, dirty, savedAt: Date.now() }),
    );
  } catch {
    /* quota exceeded or storage disabled — autosave is best-effort */
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return typeof draft?.content === 'string' ? draft : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}
