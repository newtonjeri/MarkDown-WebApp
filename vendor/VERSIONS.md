# Vendored dependencies

All third-party code is vendored (no CDN, no runtime downloads) so the app is
fully offline and reproducible. Fetched from the npm registry on 2026-07-14.

| Package | Version | Files | License |
| ------- | ------- | ----- | ------- |
| [marked](https://github.com/markedjs/marked) | 18.0.6 | `marked.umd.js` | MIT |
| [dompurify](https://github.com/cure53/DOMPurify) | 3.4.12 | `purify.min.js` | Apache-2.0 OR MPL-2.0 |
| [@highlightjs/cdn-assets](https://github.com/highlightjs/highlight.js) | 11.11.1 | `highlight.min.js` (common languages), `hljs-github-light.min.css` (from `styles/github.min.css`), `hljs-github-dark.min.css` (from `styles/github-dark.min.css`) | BSD-3-Clause |
| [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) | 5.9.0 | `github-markdown-light.css`, `github-markdown-dark.css` | MIT |
| [gemoji](https://github.com/wooorm/gemoji) | 8.1.0 | compiled into `../js/emoji-map.js` (shortcode → emoji table) | MIT |

To upgrade: download the new package tarball from
`https://registry.npmjs.org/<name>/latest` → `dist.tarball`, replace the file,
and bump `VERSION` in `../sw.js`.
