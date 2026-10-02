#!/usr/bin/env node
// Bundle budgets for the production build (run after `npm run build`; CI fails the frontend job when one is exceeded).
//
// What a first visit to any public page downloads before the app can render is the entry: the module script, its
// modulepreloads and the render-blocking stylesheet listed in dist/index.html (the same tags the seoShell plugin puts
// into dist/__shell/head.html). Everything else is a lazy chunk, loaded by the route that needs it. Sizes are gzip
// (level 9, close to what nginx's gzip_comp_level 5 sends), in KiB.
//
// Raising a budget is a deliberate decision: prefer code-splitting the new code (lazyPage / route `lazy`) instead.
//
// Usage: node scripts/check-bundle-budget.mjs [distDir]      (default: dist)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGETS_KIB = {
  /** Entry JavaScript: the module script + every modulepreload in index.html (React, router, query, app shell). */
  initialJs: 170,
  /** Render-blocking CSS of the entry (design tokens, base styles, website chrome). */
  initialCss: 30,
  /** Any single lazily loaded JavaScript chunk (a page or a portal area). */
  lazyChunk: 25,
  /** Any single lazily loaded stylesheet. */
  lazyCss: 12,
  /** All JavaScript in the build (every portal included): catches accidental heavy dependencies. */
  totalJs: 1150,
};

const dist = resolve(process.argv[2] ?? 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length / 1024;
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]+)"`))?.[1];

const tags = html.match(/<(script|link)\b[^>]*>/g) ?? [];
const initialJs = new Set();
const initialCss = new Set();
for (const tag of tags) {
  if (tag.startsWith('<script') && attr(tag, 'type') === 'module' && attr(tag, 'src')) initialJs.add(attr(tag, 'src'));
  if (tag.startsWith('<link') && attr(tag, 'rel') === 'modulepreload') initialJs.add(attr(tag, 'href'));
  if (tag.startsWith('<link') && attr(tag, 'rel') === 'stylesheet') initialCss.add(attr(tag, 'href'));
}
if (initialJs.size === 0) {
  console.error(`No module script found in ${join(dist, 'index.html')}: build the frontend first.`);
  process.exit(2);
}

const assets = readdirSync(join(dist, 'assets')).filter((f) => statSync(join(dist, 'assets', f)).isFile());
const rel = (href) => href.replace(/^\//, '');
const initialJsFiles = [...initialJs].map(rel);
const initialCssFiles = [...initialCss].map(rel);
const lazyJs = assets.map((f) => `assets/${f}`).filter((f) => f.endsWith('.js') && !initialJsFiles.includes(f));
const lazyCss = assets.map((f) => `assets/${f}`).filter((f) => f.endsWith('.css') && !initialCssFiles.includes(f));

const sum = (files) => files.reduce((total, f) => total + gz(f), 0);
const largest = (files) => files.map((f) => [f, gz(f)]).sort((a, b) => b[1] - a[1])[0] ?? ['(none)', 0];

const [bigJs, bigJsSize] = largest(lazyJs);
const [bigCss, bigCssSize] = largest(lazyCss);
const results = [
  ['initialJs', sum(initialJsFiles), initialJsFiles.join(', ')],
  ['initialCss', sum(initialCssFiles), initialCssFiles.join(', ')],
  ['lazyChunk', bigJsSize, `largest: ${bigJs}`],
  ['lazyCss', bigCssSize, `largest: ${bigCss}`],
  ['totalJs', sum([...initialJsFiles, ...lazyJs]), `${initialJsFiles.length + lazyJs.length} files`],
];

let failed = false;
for (const [name, size, detail] of results) {
  const budget = BUDGETS_KIB[name];
  const ok = size <= budget;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(10)} ${size.toFixed(1).padStart(7)} KiB gzip / budget ${budget} KiB  (${detail})`);
}
if (failed) {
  console.error('\nBundle budget exceeded. Code-split the new code (lazyPage / route `lazy`) or, if the growth is intended, ' +
    'raise the budget in frontend/scripts/check-bundle-budget.mjs in the same change.');
  process.exit(1);
}
