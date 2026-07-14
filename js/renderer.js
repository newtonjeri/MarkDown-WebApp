// renderer.js — GitHub-flavored Markdown → sanitized HTML.
// Uses globals from vendor scripts: marked (UMD), DOMPurify, hljs.
import { EMOJI } from './emoji-map.js';

/* ---------------------------------------------------------------- slugger */

// GitHub-style heading slugs: lowercase, drop punctuation, spaces → dashes,
// deduplicate with -1, -2… suffixes. Reset once per document render.
export function createSlugger() {
  const seen = new Map();
  return (text) => {
    // Mirrors github-slugger: lowercase, strip disallowed chars, then map
    // EVERY whitespace char to a dash (GitHub does not collapse runs).
    let slug = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
      .replace(/\s/g, '-');
    if (seen.has(slug)) {
      const n = seen.get(slug);
      seen.set(slug, n + 1);
      slug = `${slug}-${n}`;
    } else {
      seen.set(slug, 1);
    }
    return slug;
  };
}

/* ------------------------------------------------------------ marked setup */

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// :shortcode: → unicode emoji, GitHub alias table (skipped inside code spans
// automatically because it is a marked inline tokenizer, not a text pass).
const emojiExtension = {
  name: 'emoji',
  level: 'inline',
  start(src) { return src.indexOf(':'); },
  tokenizer(src) {
    const match = /^:([a-zA-Z0-9_+-]+):/.exec(src);
    if (match && Object.prototype.hasOwnProperty.call(EMOJI, match[1])) {
      return { type: 'emoji', raw: match[0], emoji: EMOJI[match[1]] };
    }
    return undefined;
  },
  renderer(token) {
    return `<span class="emoji" aria-label="${escapeHtml(token.raw)}">${token.emoji}</span>`;
  },
};

let slug = createSlugger();

// Strip tags and decode entities so "A &amp; B" slugs like GitHub's "A & B".
function htmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent ?? '';
}

const renderer = {
  heading({ tokens, depth }) {
    const html = this.parser.parseInline(tokens);
    const id = slug(htmlToText(html));
    return `<h${depth} id="${id}">${html}</h${depth}>\n`;
  },
  code({ text, lang }) {
    const language = (lang || '').match(/^\S*/)?.[0].toLowerCase() ?? '';
    let body;
    let cls = 'hljs';
    if (language && window.hljs?.getLanguage(language)) {
      body = window.hljs.highlight(text, { language, ignoreIllegals: true }).value;
      cls += ` language-${escapeHtml(language)}`;
    } else {
      body = escapeHtml(text);
      if (language) cls += ` language-${escapeHtml(language)}`;
    }
    return `<pre><code class="${cls}">${body}\n</code></pre>\n`;
  },
};

let configured = false;
function ensureConfigured() {
  if (configured) return;
  window.marked.use({
    gfm: true,
    breaks: false, // .md files on GitHub do not treat single newlines as <br>
    extensions: [emojiExtension],
    renderer,
  });
  configured = true;
}

/* ------------------------------------------------------------- sanitizing */

const PURIFY_OPTS = {
  ADD_ATTR: ['align'], // legacy table alignment GitHub still honors
  FORBID_TAGS: ['style', 'form'],
  // <input> stays allowed so GFM task-list checkboxes survive; the hook
  // below removes every input that is not a disabled checkbox.
};

let hooksInstalled = false;
function installPurifyHooks() {
  if (hooksInstalled) return;
  window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'INPUT') {
      // Only disabled checkboxes (task lists) are allowed through.
      if (node.getAttribute('type') !== 'checkbox') node.remove();
      else node.setAttribute('disabled', '');
    }
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      const href = node.getAttribute('href');
      if (!href.startsWith('#')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });
  hooksInstalled = true;
}

/* -------------------------------------------------------------- post-pass */

// Add GitHub's task-list classes so github-markdown-css styles them.
function decorateTaskLists(root) {
  for (const input of root.querySelectorAll('li > input[type="checkbox"]')) {
    input.classList.add('task-list-item-checkbox');
    const li = input.closest('li');
    li.classList.add('task-list-item');
    li.parentElement?.classList.add('contains-task-list');
  }
}

/* ------------------------------------------------------------- public API */

/** Render markdown to a sanitized HTML string (GitHub-flavored). */
export function renderMarkdown(markdown) {
  ensureConfigured();
  installPurifyHooks();
  slug = createSlugger();
  const raw = window.marked.parse(markdown ?? '');
  const clean = window.DOMPurify.sanitize(raw, PURIFY_OPTS);
  const tpl = document.createElement('template');
  tpl.innerHTML = clean;
  decorateTaskLists(tpl.content);
  return tpl.innerHTML;
}

// Plain text of a heading's inline tokens (links keep their label, emoji
// resolve to the glyph, images contribute nothing) — matches what the
// heading renderer slugs, so TOC ids line up with rendered ids.
function flattenInline(tokens) {
  let out = '';
  for (const t of tokens ?? []) {
    if (t.type === 'image') continue;
    if (t.type === 'emoji') out += t.emoji;
    else if (t.type === 'codespan' || t.type === 'escape') out += t.text;
    else if (t.tokens) out += flattenInline(t.tokens);
    else if (typeof t.text === 'string') out += t.text;
  }
  return out;
}

/** Extract [{depth, text, id}] for headings, ids matching the render. */
export function extractToc(markdown, maxDepth = 3) {
  ensureConfigured();
  const localSlug = createSlugger();
  const toc = [];
  const walk = (tokens) => {
    for (const token of tokens) {
      if (token.type === 'heading') {
        const text = flattenInline(token.tokens).trim();
        const id = localSlug(text);
        if (token.depth <= maxDepth) toc.push({ depth: token.depth, text, id });
      } else if (token.type === 'blockquote' && token.tokens) {
        // Headings inside blockquotes still get ids; keep sluggers in sync.
        walk(token.tokens);
      }
    }
  };
  walk(window.marked.lexer(markdown ?? ''));
  return toc;
}

/** Document statistics for the status bar. */
export function countStats(markdown) {
  const text = markdown ?? '';
  const words = (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  return { words, chars: text.length, lines: text ? text.split('\n').length : 0 };
}
