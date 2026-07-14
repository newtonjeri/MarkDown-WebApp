// theme.js — light/dark theme. Follows the OS preference until the user
// explicitly toggles, then persists the choice. Swaps the vendored GitHub +
// highlight.js stylesheets via their <link disabled> pairs.

const KEY = 'mdpad.theme';

function systemTheme() {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  for (const link of document.querySelectorAll('link[data-theme-css]')) {
    link.disabled = link.dataset.themeCss !== theme;
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0d1117' : '#ffffff');
}

export function initTheme() {
  const stored = localStorage.getItem(KEY);
  applyTheme(stored === 'dark' || stored === 'light' ? stored : systemTheme());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(KEY)) applyTheme(e.matches ? 'dark' : 'light');
  });
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  applyTheme(next);
  return next;
}
