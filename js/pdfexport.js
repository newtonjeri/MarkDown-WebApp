// pdfexport.js — PDF export via the browser's print-to-PDF engine. This is
// the only fully-offline path that produces vector (selectable-text) PDFs
// with real page breaks in every modern browser; html2canvas-style exporters
// rasterize text and cannot honor @page sizes.
//
// Strategy: render the document into #print-root, force the light GitHub
// theme, inject an @page rule for the chosen size/margins, call
// window.print(), then restore everything.

import { renderMarkdown, extractToc } from './renderer.js';
import { applyTheme, currentTheme } from './theme.js';

const MARGINS = { narrow: '12mm', normal: '20mm', wide: '28mm' };

let printRoot;
let pageStyle;

function ensureNodes() {
  printRoot ??= document.getElementById('print-root');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'print-page-style';
    document.head.appendChild(pageStyle);
  }
}

function buildTocHtml(markdown) {
  const toc = extractToc(markdown, 3);
  if (!toc.length) return '';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const items = toc
    .map((h) => `<li class="toc-depth-${h.depth}"><a href="#${h.id}">${esc(h.text)}</a></li>`)
    .join('');
  return `<nav class="pdf-toc" aria-label="Table of contents">
    <h1 class="pdf-toc-title">Contents</h1><ul>${items}</ul></nav>`;
}

/**
 * Populate #print-root and set the @page rule.
 * @param {string} markdown
 * @param {{pageSize?:'A4'|'Letter', margin?:'narrow'|'normal'|'wide',
 *          includeToc?:boolean}} opts
 */
export function preparePrintRoot(markdown, opts = {}) {
  ensureNodes();
  const { pageSize = 'A4', margin = 'normal', includeToc = false } = opts;
  pageStyle.textContent = `@page { size: ${pageSize}; margin: ${MARGINS[margin] ?? MARGINS.normal}; }`;
  const toc = includeToc ? buildTocHtml(markdown) : '';
  printRoot.innerHTML = toc + renderMarkdown(markdown);
}

async function waitForImages(root, capMs = 1500) {
  const pending = [...root.querySelectorAll('img')]
    .filter((img) => !img.complete)
    .map((img) => new Promise((res) => {
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    }));
  if (!pending.length) return;
  await Promise.race([
    Promise.all(pending),
    new Promise((res) => setTimeout(res, capMs)),
  ]);
}

let restoreState = null;

function enterPrintMode(title) {
  if (restoreState) return;
  restoreState = { theme: currentTheme(), title: document.title };
  applyTheme('light'); // PDFs always use the light GitHub palette
  if (title) {
    // The document title becomes the suggested PDF filename.
    document.title = title.replace(/\.(md|markdown)$/i, '');
  }
}

function exitPrintMode() {
  if (!restoreState) return;
  applyTheme(restoreState.theme);
  document.title = restoreState.title;
  restoreState = null;
  if (printRoot) printRoot.innerHTML = '';
  if (pageStyle) pageStyle.textContent = '';
}

/** Full export flow. Resolves after the print dialog has been handed off. */
export async function exportPdf(markdown, title, opts) {
  ensureNodes();
  preparePrintRoot(markdown, opts);
  enterPrintMode(title);
  await waitForImages(printRoot);
  window.print();
  // afterprint restores; this is a safety net for browsers that miss it.
  // (print() blocks in Chrome/Firefox, so this fires after the dialog closes.)
  setTimeout(exitPrintMode, 2500);
}

/**
 * Make plain Ctrl+P / menu-print behave like "export with defaults", and
 * guarantee cleanup after any print.
 */
export function initPrintHooks(getMarkdown, getTitle) {
  window.addEventListener('beforeprint', () => {
    ensureNodes();
    if (!printRoot.innerHTML) {
      preparePrintRoot(getMarkdown(), {});
      enterPrintMode(getTitle());
    }
  });
  window.addEventListener('afterprint', exitPrintMode);
}
