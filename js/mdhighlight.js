// mdhighlight.js — lightweight Markdown *source* highlighter for the editor
// pane. Line-based with fenced-code state carried across lines; every logical
// line becomes one <div class="ed-line"> so the gutter can measure wrapped
// heights. Purely cosmetic — imperfect edge cases are acceptable here, the
// preview pane is the source of truth for rendering.

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Placeholders wrap stash indices in Unicode private-use chars so document
// text (e.g. a literal " 0 ") can never collide with them.
const PH_OPEN = '';
const PH_CLOSE = '';
const PH_RESTORE = /(\d+)/g;

// Inline spans. Inline code is captured first and protected from the other
// substitutions via the stash.
function inlineSpans(escaped) {
  const stash = [];
  let out = escaped.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (m) => {
    stash.push(`<span class="tok-codespan">${m}</span>`);
    return `${PH_OPEN}${stash.length - 1}${PH_CLOSE}`;
  });
  out = out
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<span class="tok-bold">$1$2$1</span>')
    .replace(/(^|[^*_\w])(\*|_)(?=\S)([^*_]*?\S)\2(?!\w)/g, '$1<span class="tok-italic">$2$3$2</span>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<span class="tok-strike">~~$1~~</span>')
    .replace(/!?\[([^\]\n]*)\]\(([^)\n]*)\)/g, (m, label, url) =>
      `<span class="tok-link-label">${m.startsWith('!') ? '!' : ''}[${label}]</span><span class="tok-link-url">(${url})</span>`)
    .replace(/:([a-zA-Z0-9_+-]+):/g, '<span class="tok-emoji">:$1:</span>');
  return out.replace(PH_RESTORE, (m, i) => stash[Number(i)]);
}

// Table rows already contain marker spans; run inline highlighting only on
// the text between them.
function inlineSpansBetweenPipes(escaped) {
  return escaped
    .split('|')
    .map((cell) => inlineSpans(cell))
    .join('<span class="tok-marker">|</span>');
}

/**
 * Highlight markdown source.
 * @param {string} text
 * @returns {string[]} one HTML string per input line (no wrapping element).
 */
export function highlightLines(text) {
  const lines = text.split('\n');
  const out = new Array(lines.length);
  let inFence = false;
  let fenceChar = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const escaped = esc(line);

    if (inFence) {
      const close = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fenceChar) {
        inFence = false;
        out[i] = `<span class="tok-fence">${escaped}</span>`;
      } else {
        out[i] = `<span class="tok-codeblock">${escaped}</span>`;
      }
      continue;
    }

    const open = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (open) {
      inFence = true;
      fenceChar = open[1][0];
      out[i] = `<span class="tok-fence">${escaped}</span>`;
      continue;
    }

    const heading = line.match(/^(\s{0,3})(#{1,6})(\s+)(.*)$/);
    if (heading) {
      const [, pad, hashes, gap, rest] = heading;
      out[i] =
        `${pad}<span class="tok-heading"><span class="tok-marker">${hashes}</span>${gap}${inlineSpans(esc(rest))}</span>`;
      continue;
    }

    if (/^\s{0,3}((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$/.test(line)) {
      out[i] = `<span class="tok-hr">${escaped}</span>`;
      continue;
    }

    const quote = line.match(/^(\s{0,3}(?:>\s?)+)(.*)$/);
    if (quote) {
      out[i] =
        `<span class="tok-quote"><span class="tok-marker">${esc(quote[1])}</span>${inlineSpans(esc(quote[2]))}</span>`;
      continue;
    }

    if (/^\s*\|/.test(line)) {
      out[i] = inlineSpansBetweenPipes(escaped);
      continue;
    }

    const list = line.match(/^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/);
    if (list) {
      const [, pad, marker, gap, task, rest] = list;
      const taskHtml = task ? `<span class="tok-task">${esc(task)}</span>` : '';
      out[i] =
        `${pad}<span class="tok-marker">${esc(marker)}</span>${gap}${taskHtml}${inlineSpans(esc(rest))}`;
      continue;
    }

    out[i] = inlineSpans(escaped);
  }
  return out;
}
