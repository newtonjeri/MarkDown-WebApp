// tests.js — unit tests for MarkPad's core logic. Runs in any browser;
// under `firefox --headless` (with browser.dom.window.dump.enabled) results
// also stream to stdout via dump().

import { renderMarkdown, extractToc, countStats, createSlugger } from '../js/renderer.js';
import { continueList, toggleWrap, lineBlock, transformLines, lineOps } from '../js/editor.js';
import { highlightLines } from '../js/mdhighlight.js';
import { EMOJI } from '../js/emoji-map.js';
import { isMarkdownName } from '../js/files.js';

const results = [];
const out = (msg) => {
  if (typeof dump === 'function') dump(msg + '\n');
  console.log(msg);
};

function t(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err: String(err?.message ?? err) });
  }
}

const eq = (got, want, label = '') => {
  if (got !== want) throw new Error(`${label} expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};
const ok = (cond, label = 'condition') => { if (!cond) throw new Error(`${label} is falsy`); };
const has = (haystack, needle) => {
  if (!haystack.includes(needle)) throw new Error(`missing ${JSON.stringify(needle)} in ${JSON.stringify(haystack.slice(0, 300))}`);
};
const lacks = (haystack, needle) => {
  if (haystack.includes(needle)) throw new Error(`should NOT contain ${JSON.stringify(needle)}`);
};

/* ------------------------------------------------------------- renderer */

t('heading renders with GitHub slug id', () => {
  has(renderMarkdown('# Hello World'), '<h1 id="hello-world">Hello World</h1>');
});

t('duplicate headings get -1 suffix', () => {
  const html = renderMarkdown('# Dup\n\n# Dup');
  has(html, 'id="dup"');
  has(html, 'id="dup-1"');
});

t('slug: punctuation dropped, spaces kept as dashes (a--b like GitHub)', () => {
  const s = createSlugger();
  eq(s('A & B'), 'a--b');
  eq(s('Hello, World!'), 'hello-world');
});

t('heading with entity slugs like GitHub', () => {
  has(renderMarkdown('# A & B'), 'id="a--b"');
});

t('bold / italic / strikethrough', () => {
  const html = renderMarkdown('**b** *i* ~~s~~');
  has(html, '<strong>b</strong>');
  has(html, '<em>i</em>');
  has(html, '<del>s</del>');
});

t('GFM table', () => {
  const html = renderMarkdown('| A | B |\n| - | - |\n| 1 | 2 |');
  has(html, '<table>');
  has(html, '<th>A</th>');
  has(html, '<td>2</td>');
});

t('task list gets GitHub classes and disabled checkboxes', () => {
  const html = renderMarkdown('- [x] done\n- [ ] todo');
  has(html, 'contains-task-list');
  has(html, 'task-list-item');
  has(html, 'type="checkbox"');
  has(html, 'disabled');
  has(html, 'checked');
});

t('fenced code with known language is highlighted', () => {
  const html = renderMarkdown('```js\nconst x = 1;\n```');
  has(html, 'language-js');
  has(html, 'hljs-keyword');
});

t('fenced code with unknown language stays escaped, no crash', () => {
  const html = renderMarkdown('```nosuchlang\n<b>&\n```');
  has(html, '&lt;b&gt;');
  lacks(html, '<b>&');
});

t('emoji shortcodes resolve; unknown ones stay literal', () => {
  const html = renderMarkdown('go :rocket: but :notarealemoji: stays');
  has(html, '🚀');
  has(html, ':notarealemoji:');
});

t('emoji inside code spans are NOT converted', () => {
  const html = renderMarkdown('`:rocket:`');
  has(html, ':rocket:');
  lacks(html, '🚀');
});

t('autolink (GFM)', () => {
  has(renderMarkdown('see https://example.com ok'), '<a');
});

t('sanitizer strips <script>', () => {
  lacks(renderMarkdown('hello <script>alert(1)</script>'), '<script');
});

t('sanitizer strips event handlers', () => {
  lacks(renderMarkdown('<img src="x.png" onerror="alert(1)">'), 'onerror');
});

t('sanitizer neutralizes javascript: links', () => {
  lacks(renderMarkdown('[x](javascript:alert(1))'), 'javascript:');
});

t('non-checkbox inputs are removed', () => {
  lacks(renderMarkdown('<input type="text" value="hi">'), '<input type="text"');
});

t('external links open in new tab with rel', () => {
  const html = renderMarkdown('[x](https://example.com)');
  has(html, 'target="_blank"');
  has(html, 'noopener');
});

t('anchor links do not get target=_blank', () => {
  const html = renderMarkdown('# H\n\n[go](#h)');
  const anchor = html.split('<a').filter((c) => c.includes('href="#h"'))[0] ?? '';
  lacks(anchor.split('>')[0], 'target=');
});

t('extractToc ids match rendered heading ids', () => {
  const md = '# One\n\n## Two & Co\n\n### [Linked](https://x.y)\n\n#### too deep\n\n## Two & Co';
  const toc = extractToc(md, 3);
  const html = renderMarkdown(md);
  eq(toc.length, 4, 'toc entries');
  for (const item of toc) has(html, `id="${item.id}"`);
  eq(toc[1].id, 'two--co');
  eq(toc[3].id, 'two--co-1');
  eq(toc[2].text, 'Linked');
});

t('countStats counts words and lines', () => {
  const s = countStats('one two\nthree');
  eq(s.words, 3);
  eq(s.lines, 2);
});

/* --------------------------------------------------------------- editor */

t('continueList: bullet', () => {
  eq(continueList('- item').prefix, '- ');
  eq(continueList('  * item').prefix, '  * ');
});

t('continueList: ordered increments', () => {
  eq(continueList('3. x').prefix, '4. ');
  eq(continueList('9) y').prefix, '10) ');
});

t('continueList: task resets to unchecked', () => {
  eq(continueList('- [x] done').prefix, '- [ ] ');
});

t('continueList: quote continues', () => {
  eq(continueList('> quoted').prefix, '> ');
});

t('continueList: empty item signals removal', () => {
  eq(continueList('- ').type, 'empty');
  eq(continueList('2. ').type, 'empty');
  eq(continueList('- [ ] ').type, 'empty');
});

t('continueList: plain indent carries over; plain text does not', () => {
  eq(continueList('    code').prefix, '    ');
  eq(continueList('plain'), null);
});

t('toggleWrap wraps and positions selection inside', () => {
  const r = toggleWrap('bold', 0, 4, '**');
  eq(r.text, '**bold**');
  eq(r.selStart, 2);
  eq(r.selEnd, 6);
});

t('toggleWrap unwraps when selection includes markers', () => {
  const r = toggleWrap('**bold**', 0, 8, '**');
  eq(r.text, 'bold');
});

t('toggleWrap unwraps when markers surround selection', () => {
  const r = toggleWrap('a **bold** z', 4, 8, '**');
  eq(r.replaceStart, 2);
  eq(r.replaceEnd, 10);
  eq(r.text, 'bold');
});

t('lineBlock expands to whole lines', () => {
  const v = 'aaa\nbbb\nccc';
  const b = lineBlock(v, 5, 6); // inside "bbb"
  eq(v.slice(b.from, b.to), 'bbb');
});

t('heading op toggles', () => {
  eq(lineOps.heading(2)('text', 0, 4).text, '## text');
  eq(lineOps.heading(2)('## text', 0, 7).text, 'text');
  eq(lineOps.heading(1)('## text', 0, 7).text, '# text');
});

t('bullet op adds and removes', () => {
  eq(lineOps.bullet('a\nb', 0, 3).text, '- a\n- b');
  eq(lineOps.bullet('- a\n- b', 0, 7).text, 'a\nb');
});

t('ordered op numbers sequentially', () => {
  eq(lineOps.ordered('a\nb\nc', 0, 5).text, '1. a\n2. b\n3. c');
});

t('task op converts bullets too', () => {
  eq(lineOps.task('- a', 0, 3).text, '- [ ] a');
  eq(lineOps.task('- [ ] a', 0, 7).text, 'a');
});

t('quote op toggles', () => {
  eq(lineOps.quote('a', 0, 1).text, '> a');
  eq(lineOps.quote('> a', 0, 3).text, 'a');
});

t('indent/outdent', () => {
  eq(lineOps.indent('a\nb', 0, 3).text, '  a\n  b');
  eq(lineOps.outdent('  a\n  b', 0, 6).text, 'a\nb');
});

t('transformLines keeps untouched surroundings', () => {
  const r = transformLines('x\ny\nz', 2, 3, (l) => `[${l}]`);
  eq(r.text, '[y]');
  eq(r.replaceStart, 2);
  eq(r.replaceEnd, 3);
});

/* ------------------------------------------------------- mdhighlight */

t('mdhighlight: fence state spans lines', () => {
  const lines = highlightLines('```js\nconst x = 1\n```\nplain');
  has(lines[0], 'tok-fence');
  has(lines[1], 'tok-codeblock');
  has(lines[2], 'tok-fence');
  lacks(lines[3], 'tok-codeblock');
});

t('mdhighlight: heading and list markers', () => {
  const lines = highlightLines('# Title\n- item');
  has(lines[0], 'tok-heading');
  has(lines[1], 'tok-marker');
});

t('mdhighlight: escapes HTML', () => {
  const lines = highlightLines('<b>&amp;</b>');
  has(lines[0], '&lt;b&gt;');
  lacks(lines[0], '<b>');
});

t('mdhighlight: literal " 0 " survives codespan stashing', () => {
  const lines = highlightLines('a `c` 0 b');
  has(lines[0], 'tok-codespan');
  has(lines[0], ' 0 b');
});

t('mdhighlight: one entry per line, blank lines included', () => {
  eq(highlightLines('a\n\nb').length, 3);
});

/* ------------------------------------------------------------- misc */

t('emoji map is populated with GitHub aliases', () => {
  ok(Object.keys(EMOJI).length > 1500, 'size');
  eq(EMOJI['+1'], '👍');
  eq(EMOJI['tada'], '🎉');
});

t('isMarkdownName accepts .md variants only', () => {
  ok(isMarkdownName('a.md'));
  ok(isMarkdownName('b.markdown'));
  ok(!isMarkdownName('c.pdf'));
});

/* ------------------------------------------------------------- report */

const ul = document.getElementById('results');
let passed = 0;
for (const r of results) {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = r.ok ? `✓ ${r.name}` : `✗ ${r.name} — ${r.err}`;
  ul.appendChild(li);
  if (r.ok) passed += 1;
  else out(`FAIL: ${r.name} — ${r.err}`);
}
const summary = `TESTS: ${passed}/${results.length} passed`;
document.getElementById('summary').textContent = summary;
document.getElementById('summary').className = passed === results.length ? 'pass' : 'fail';
out(summary);
