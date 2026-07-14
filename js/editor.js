// editor.js — Markdown source editor: a transparent <textarea> stacked on a
// highlighted mirror, plus a line-number gutter whose rows are measured from
// the mirror so soft-wrapped lines stay aligned.
//
// The pure text-transform helpers (continueList, toggleWrap, transformLines…)
// are exported for unit tests.

import { highlightLines } from './mdhighlight.js';

/* ----------------------------------------------------------- pure helpers */

/**
 * Given the line before the caret when Enter is pressed, decide how to
 * continue a list/quote.
 * @returns {{type:'continue', prefix:string} | {type:'empty'} | null}
 */
export function continueList(prevLine) {
  let m;
  if ((m = prevLine.match(/^(\s*)([-*+])(\s+)\[[ xX]\](\s+)(.*)$/))) {
    return m[5].trim() === ''
      ? { type: 'empty' }
      : { type: 'continue', prefix: `${m[1]}${m[2]} [ ] ` };
  }
  if ((m = prevLine.match(/^(\s*)([-*+])(\s+)(.*)$/))) {
    return m[4].trim() === ''
      ? { type: 'empty' }
      : { type: 'continue', prefix: `${m[1]}${m[2]} ` };
  }
  if ((m = prevLine.match(/^(\s*)(\d{1,9})([.)])(\s+)(.*)$/))) {
    return m[5].trim() === ''
      ? { type: 'empty' }
      : { type: 'continue', prefix: `${m[1]}${Number(m[2]) + 1}${m[3]} ` };
  }
  if ((m = prevLine.match(/^(\s{0,3}(?:>\s?)+)(.*)$/))) {
    return m[2].trim() === ''
      ? { type: 'empty' }
      : { type: 'continue', prefix: m[1] };
  }
  // Plain auto-indent: carry leading whitespace over.
  if ((m = prevLine.match(/^(\s+)\S/))) {
    return { type: 'continue', prefix: m[1] };
  }
  return null;
}

/**
 * Toggle an inline wrapper (e.g. "**") around [start,end) of value.
 * @returns {{text:string, replaceStart:number, replaceEnd:number,
 *            selStart:number, selEnd:number}}
 */
export function toggleWrap(value, start, end, marker) {
  const len = marker.length;
  const sel = value.slice(start, end);

  // Selection itself includes the markers: **bold** selected.
  if (sel.length >= 2 * len && sel.startsWith(marker) && sel.endsWith(marker)) {
    const inner = sel.slice(len, sel.length - len);
    return { text: inner, replaceStart: start, replaceEnd: end, selStart: start, selEnd: start + inner.length };
  }
  // Markers sit just outside the selection: **|bold|**.
  if (value.slice(start - len, start) === marker && value.slice(end, end + len) === marker) {
    return { text: sel, replaceStart: start - len, replaceEnd: end + len, selStart: start - len, selEnd: start - len + sel.length };
  }
  // Wrap.
  return {
    text: marker + sel + marker,
    replaceStart: start,
    replaceEnd: end,
    selStart: start + len,
    selEnd: start + len + sel.length,
  };
}

/** Expand [start,end) to cover whole lines; returns {from,to,lines}. */
export function lineBlock(value, start, end) {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  let to = value.indexOf('\n', Math.max(end - 1, start));
  if (to === -1) to = value.length;
  if (end > start && value[end - 1] === '\n' && end - 1 >= from) {
    to = end - 1; // don't swallow the line after a trailing-newline selection
  }
  return { from, to, lines: value.slice(from, to).split('\n') };
}

/**
 * Apply fn to every line in the selected block.
 * fn: (line, i, allLines) => string
 */
export function transformLines(value, start, end, fn) {
  const { from, to, lines } = lineBlock(value, start, end);
  const out = lines.map(fn).join('\n');
  return { text: out, replaceStart: from, replaceEnd: to, selStart: from, selEnd: from + out.length };
}

const BULLET_RE = /^(\s*)[-*+]\s+(?!\[[ xX]\]\s)(.*)$/;
const TASK_RE = /^(\s*)[-*+]\s+\[[ xX]\]\s+(.*)$/;
const ORDERED_RE = /^(\s*)\d{1,9}[.)]\s+(.*)$/;
const QUOTE_RE = /^(\s{0,3})>\s?(.*)$/;
const HEADING_RE = /^(\s{0,3})(#{1,6})\s+(.*)$/;

const stripListMarkers = (line) => {
  for (const re of [TASK_RE, BULLET_RE, ORDERED_RE]) {
    const m = line.match(re);
    if (m) return m[1] + m[2];
  }
  return line;
};

export const lineOps = {
  heading: (level) => (value, start, end) =>
    transformLines(value, start, end, (line) => {
      const m = line.match(HEADING_RE);
      const stripped = m ? m[1] + m[3] : line;
      if (m && m[2].length === level) return stripped; // toggle off
      if (stripped.trim() === '') return stripped;
      return '#'.repeat(level) + ' ' + stripped.replace(/^\s+/, '');
    }),

  bullet: (value, start, end) => {
    const { lines } = lineBlock(value, start, end);
    const allAre = lines.every((l) => BULLET_RE.test(l) || l.trim() === '');
    return transformLines(value, start, end, (line) => {
      if (line.trim() === '') return line;
      return allAre ? stripListMarkers(line) : stripListMarkers(line).replace(/^(\s*)/, '$1- ');
    });
  },

  ordered: (value, start, end) => {
    const { lines } = lineBlock(value, start, end);
    const allAre = lines.every((l) => ORDERED_RE.test(l) || l.trim() === '');
    let n = 0;
    return transformLines(value, start, end, (line) => {
      if (line.trim() === '') return line;
      if (allAre) return stripListMarkers(line);
      n += 1;
      return `${n}. ${stripListMarkers(line).replace(/^\s+/, '')}`;
    });
  },

  task: (value, start, end) => {
    const { lines } = lineBlock(value, start, end);
    const allAre = lines.every((l) => TASK_RE.test(l) || l.trim() === '');
    return transformLines(value, start, end, (line) => {
      if (line.trim() === '') return line;
      return allAre ? stripListMarkers(line) : `- [ ] ${stripListMarkers(line).replace(/^\s+/, '')}`;
    });
  },

  quote: (value, start, end) => {
    const { lines } = lineBlock(value, start, end);
    const allAre = lines.every((l) => QUOTE_RE.test(l) || l.trim() === '');
    return transformLines(value, start, end, (line) => {
      if (allAre) {
        const m = line.match(QUOTE_RE);
        return m ? m[1] + m[2] : line;
      }
      return '> ' + line;
    });
  },

  indent: (value, start, end) =>
    transformLines(value, start, end, (line) => (line === '' ? line : '  ' + line)),

  outdent: (value, start, end) =>
    transformLines(value, start, end, (line) => line.replace(/^( {1,2}|\t)/, '')),
};

/* --------------------------------------------------------------- editor UI */

const MEASURE_LIMIT = 10_000; // above this, gutter uses uniform row heights

export class Editor {
  /**
   * @param {HTMLElement} root empty container
   * @param {{onChange?:Function, onScroll?:Function, onCursor?:Function}} cb
   */
  constructor(root, cb = {}) {
    this.cb = cb;
    root.classList.add('editor');
    root.innerHTML = `
      <div class="ed-gutter" aria-hidden="true"><div class="ed-gutter-inner"></div></div>
      <div class="ed-body">
        <div class="ed-hl" aria-hidden="true"><div class="ed-hl-inner"></div></div>
        <textarea class="ed-input" wrap="soft" spellcheck="false" autocapitalize="off"
          autocomplete="off" autocorrect="off" aria-label="Markdown source"></textarea>
      </div>`;
    this.gutterInner = root.querySelector('.ed-gutter-inner');
    this.hlInner = root.querySelector('.ed-hl-inner');
    this.ta = root.querySelector('.ed-input');

    this._raf = 0;
    this._tabEscape = false; // Esc pressed → next Tab moves focus (WCAG 2.1.2)

    this.ta.addEventListener('input', () => {
      this._scheduleRender();
      this.cb.onChange?.(this.ta.value);
      this._emitCursor();
    });
    this.ta.addEventListener('scroll', () => this._syncScroll(), { passive: true });
    this.ta.addEventListener('keydown', (e) => this._onKeydown(e));
    for (const ev of ['keyup', 'click', 'focus']) {
      this.ta.addEventListener(ev, () => this._emitCursor());
    }

    // Re-measure wrapped heights when the pane resizes.
    this._ro = new ResizeObserver(() => this._scheduleRender());
    this._ro.observe(root.querySelector('.ed-body'));
  }

  getValue() { return this.ta.value; }

  setValue(text, { keepUndo = false } = {}) {
    if (keepUndo && this._execCommandWorks()) {
      this.ta.focus();
      this.ta.setSelectionRange(0, this.ta.value.length);
      document.execCommand('insertText', false, text);
    } else {
      this.ta.value = text;
    }
    this.ta.setSelectionRange(0, 0);
    this.ta.scrollTop = 0;
    this._render(); // synchronous: new content must never flash blank
    this._emitCursor();
  }

  focus() { this.ta.focus(); }

  getScrollInfo() {
    const max = this.ta.scrollHeight - this.ta.clientHeight;
    return { fraction: max > 0 ? this.ta.scrollTop / max : 0, max };
  }

  setScrollFraction(f) {
    const max = this.ta.scrollHeight - this.ta.clientHeight;
    this.ta.scrollTop = f * max;
  }

  getCursor() {
    const upTo = this.ta.value.slice(0, this.ta.selectionStart);
    const line = (upTo.match(/\n/g) || []).length + 1;
    const col = upTo.length - (upTo.lastIndexOf('\n') + 1) + 1;
    return { line, col, selection: this.ta.selectionEnd - this.ta.selectionStart };
  }

  /* --------------------------------------------------- editing operations */

  _execCommandWorks() {
    return typeof document.execCommand === 'function';
  }

  // Replace [start,end) with text, preserving native undo where possible.
  replaceRange(text, start, end, selStart = null, selEnd = null) {
    this.ta.focus();
    this.ta.setSelectionRange(start, end);
    let ok = false;
    if (this._execCommandWorks()) {
      try {
        ok = text === ''
          ? document.execCommand('delete')
          : document.execCommand('insertText', false, text);
      } catch { ok = false; }
    }
    if (!ok) {
      this.ta.setRangeText(text, start, end, 'end');
      this.ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    if (selStart !== null) {
      this.ta.setSelectionRange(selStart, selEnd ?? selStart);
    }
  }

  applyWrap(marker) {
    const { selectionStart: s, selectionEnd: e } = this.ta;
    const r = toggleWrap(this.ta.value, s, e, marker);
    this.replaceRange(r.text, r.replaceStart, r.replaceEnd, r.selStart, r.selEnd);
  }

  applyLineOp(op) {
    const { selectionStart: s, selectionEnd: e } = this.ta;
    const r = op(this.ta.value, s, e);
    if (r.text === this.ta.value.slice(r.replaceStart, r.replaceEnd)) return;
    this.replaceRange(r.text, r.replaceStart, r.replaceEnd, r.selStart, r.selEnd);
  }

  insertLink(isImage = false) {
    const { selectionStart: s, selectionEnd: e } = this.ta;
    const sel = this.ta.value.slice(s, e);
    const bang = isImage ? '!' : '';
    if (sel) {
      const text = `${bang}[${sel}](url)`;
      this.replaceRange(text, s, e, s + bang.length + sel.length + 3, s + bang.length + sel.length + 6);
    } else {
      const label = isImage ? 'alt text' : 'link text';
      const text = `${bang}[${label}](url)`;
      this.replaceRange(text, s, e, s + bang.length + 1, s + bang.length + 1 + label.length);
    }
  }

  insertCodeBlock() {
    const { selectionStart: s, selectionEnd: e } = this.ta;
    const sel = this.ta.value.slice(s, e);
    const nlBefore = s === 0 || this.ta.value[s - 1] === '\n' ? '' : '\n';
    const body = sel || 'code';
    const text = `${nlBefore}\`\`\`\n${body}\n\`\`\`\n`;
    const bodyStart = s + nlBefore.length + 4;
    this.replaceRange(text, s, e, bodyStart, bodyStart + body.length);
  }

  insertTable() {
    const { selectionStart: s } = this.ta;
    const nlBefore = s === 0 || this.ta.value[s - 1] === '\n' ? '' : '\n';
    const table =
      `${nlBefore}| Column 1 | Column 2 | Column 3 |\n` +
      `| -------- | -------- | -------- |\n` +
      `| Cell     | Cell     | Cell     |\n`;
    this.replaceRange(table, s, this.ta.selectionEnd, s + nlBefore.length + 2, s + nlBefore.length + 10);
  }

  insertHr() {
    const { selectionStart: s } = this.ta;
    const nlBefore = s === 0 || this.ta.value[s - 1] === '\n' ? '' : '\n';
    this.replaceRange(`${nlBefore}\n---\n\n`, s, this.ta.selectionEnd);
  }

  undo() { this.ta.focus(); document.execCommand('undo'); }
  redo() { this.ta.focus(); document.execCommand('redo'); }

  /* ------------------------------------------------------------ keyboard */

  _onKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      this._tabEscape = true; // let the next Tab move focus out
      return;
    }

    if (e.key === 'Tab' && !mod && !e.altKey) {
      if (this._tabEscape) { this._tabEscape = false; return; }
      e.preventDefault();
      const { selectionStart: s, selectionEnd: e2 } = this.ta;
      const multiline = this.ta.value.slice(s, e2).includes('\n');
      if (e.shiftKey) {
        this.applyLineOp(lineOps.outdent);
      } else if (multiline) {
        this.applyLineOp(lineOps.indent);
      } else {
        this.replaceRange('  ', s, e2);
      }
      return;
    }
    this._tabEscape = false;

    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.isComposing) {
      const { selectionStart: s, selectionEnd: e2 } = this.ta;
      if (s !== e2) return; // let default replace the selection
      const lineStart = this.ta.value.lastIndexOf('\n', s - 1) + 1;
      const prevLine = this.ta.value.slice(lineStart, s);
      const cont = continueList(prevLine);
      if (!cont) return;
      e.preventDefault();
      if (cont.type === 'empty') {
        // Enter on an empty list item clears the marker (GitHub behavior).
        this.replaceRange('', lineStart, s);
      } else {
        this.replaceRange('\n' + cont.prefix, s, e2);
      }
      return;
    }

    if (!mod) return;
    // Shifted digit keys report layout symbols in e.key; use e.code for them.
    const key = e.code?.startsWith('Digit')
      ? e.code.slice(5)
      : e.key.toLowerCase();
    const combo = `${e.shiftKey ? 'shift+' : ''}${key}`;
    const actions = {
      'b': () => this.applyWrap('**'),
      'i': () => this.applyWrap('*'),
      'e': () => this.applyWrap('`'),
      'shift+x': () => this.applyWrap('~~'),
      'k': () => this.insertLink(false),
      'shift+7': () => this.applyLineOp(lineOps.ordered),
      'shift+8': () => this.applyLineOp(lineOps.bullet),
      'shift+9': () => this.applyLineOp(lineOps.quote),
    };
    if (actions[combo]) {
      e.preventDefault();
      actions[combo]();
    }
  }

  /* ----------------------------------------------------------- rendering */

  _scheduleRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._render();
    });
  }

  _render() {
    const lineHtml = highlightLines(this.ta.value);
    this.hlInner.innerHTML =
      lineHtml.map((h) => `<div class="ed-line">${h || ''}</div>`).join('');

    const n = lineHtml.length;
    const measure = n <= MEASURE_LIMIT;
    const rows = new Array(n);
    if (measure) {
      const kids = this.hlInner.children;
      for (let i = 0; i < n; i++) {
        rows[i] = `<div class="ed-ln" style="height:${kids[i].offsetHeight}px">${i + 1}</div>`;
      }
    } else {
      for (let i = 0; i < n; i++) rows[i] = `<div class="ed-ln">${i + 1}</div>`;
    }
    this.gutterInner.innerHTML = rows.join('');
    this._syncScroll();
  }

  _syncScroll() {
    const y = this.ta.scrollTop;
    this.hlInner.style.transform = `translateY(${-y}px)`;
    this.gutterInner.style.transform = `translateY(${-y}px)`;
    this.cb.onScroll?.(this.getScrollInfo());
  }

  _emitCursor() {
    if (!this.cb.onCursor) return;
    clearTimeout(this._cursorT);
    this._cursorT = setTimeout(() => this.cb.onCursor(this.getCursor()), 60);
  }
}
