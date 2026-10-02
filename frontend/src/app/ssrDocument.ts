/**
 * Server-side rendering of public pages (docs/SEO_CRO.md § Rendering): pure string helpers shared by the renderer
 * (src/entry-server.tsx), the production SSR server (server/ssr-server.mjs) and `vite preview` (seoShell.ts), so they
 * are unit-tested without a server.
 *
 * The API's document (`/_document{path}`) carries the SEO head and a plain, crawlable copy of the page in
 * `<div id="root"><div id="oa-ssr" …>…</div></div>`. When the React app could render the page on the server, that copy
 * is replaced by the app's own markup (the designed page, which the browser hydrates), the page's stylesheets and
 * scripts are linked in the head, and the data the page was rendered with is embedded as JSON, so the first paint needs
 * no JavaScript and hydration needs no API round trip.
 */

import { SHELL_BODY_INCLUDE, SHELL_HEAD_INCLUDE } from './seoShellCore';

/** Attribute on `#root` when it holds the app's server-rendered markup: the client hydrates instead of rendering. */
export const SSR_ROOT_ATTR = 'data-oa-hydrate';
/**
 * Attribute on `#root` listing the page's route chunks (space separated): src/main.tsx preloads them together with the
 * app once the page has been painted (they are not fetched before: nothing but HTML, CSS and fonts competes with the
 * first paint).
 */
export const SSR_MODULES_ATTR = 'data-oa-modules';
/** id of the `<script type="application/json">` holding the dehydrated React Query cache. */
export const SSR_STATE_ID = 'oa-query-state';

export interface RenderInput {
  /** Path and query string of the page, e.g. `/blog?page=2`. */
  url: string;
  /**
   * The API's document for the URL (status 200). May be a promise: the renderer starts on the page's data while the
   * document is still on its way; null means there is no document to render into (any other status).
   */
  document: string | Promise<string | null>;
  /** Vite's client build manifest (dist/.vite/manifest.json). */
  manifest: Manifest;
  /** Where the API listens, e.g. http://127.0.0.1:5080 (no trailing slash). */
  apiOrigin: string;
  /** Headers for the renderer's API requests: the visitor's X-Forwarded-*, User-Agent, Accept-Language. */
  headers: Record<string, string>;
  /** The public origin of the page (for the router's Request), e.g. https://optimizeall.com. */
  origin: string;
}

export type RenderResult =
  | { rendered: true; html: string; passes: number; ms: number; renderMs: number[] }
  | { rendered: false; reason: string };

/** What the server build (dist-ssr/entry-server.js) exports. */
export interface Renderer {
  renderDocument(input: RenderInput): Promise<RenderResult>;
}

/** A chunk of Vite's build manifest (`dist/.vite/manifest.json`). */
export interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}
export type Manifest = Record<string, ManifestChunk>;

export interface PageAssets {
  /** Stylesheets of the page's chunks that the entry does not already load (render-blocking, in order). */
  css: string[];
  /** JavaScript chunks of the page (preloaded by src/main.tsx after the first paint, see SSR_MODULES_ATTR). */
  js: string[];
}

/**
 * The stylesheets and scripts the page's modules need beyond the entry's: `modules` are manifest keys (source paths
 * relative to the project root, e.g. `src/features/public/pages/HomePage.tsx`) of the lazily loaded route modules the
 * server rendered. Their static imports are followed; what the entry (index.html) loads itself is skipped.
 */
export function pageAssets(manifest: Manifest, modules: Iterable<string>, base = '/'): PageAssets {
  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
  const inEntry = new Set<string>();
  const walkEntry = (key: string) => {
    if (inEntry.has(key) || !manifest[key]) return;
    inEntry.add(key);
    manifest[key].imports?.forEach(walkEntry);
  };
  if (entryKey) {
    walkEntry(entryKey);
    // The app chunk the entry starts (src/start.tsx) is linked by the shell too (seoShell.ts, linkAppChunk).
    manifest[entryKey].dynamicImports?.forEach(walkEntry);
  }
  const entryCss = new Set([...inEntry].flatMap((k) => manifest[k].css ?? []));

  const seen = new Set<string>();
  const css: string[] = [];
  const js: string[] = [];
  const visit = (key: string) => {
    if (seen.has(key) || inEntry.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) return;
    seen.add(key);
    // Dependencies first: shared component styles come before the page's own (same order as Vite's loader).
    chunk.imports?.forEach(visit);
    for (const file of chunk.css ?? []) if (!entryCss.has(file) && !css.includes(base + file)) css.push(base + file);
    js.push(base + chunk.file);
  };
  for (const module of modules) visit(module);
  return { css, js };
}

/** JSON for an inline `<script type="application/json">`: `<`, `>`, `&` and line separators escaped (never ends the element). */
export function serializeState(state: unknown): string {
  return JSON.stringify(state)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export interface RenderedPage {
  /** The app's markup for `#root`. */
  html: string;
  /** Dehydrated React Query state. */
  state: unknown;
  assets: PageAssets;
}

const ROOT_OPEN = '<div id="root">';

/**
 * Puts the rendered page into the API's document: the app's markup replaces the plain server copy inside `#root`
 * (marked for hydration, with the page's chunks to preload), the page's stylesheets follow the shell's head include
 * (after the app's stylesheets, so page styles still override them), and the query state goes right after `#root`. Returns null when the
 * document does not have the expected shape (it is then served unchanged).
 */
export function injectRenderedPage(document: string, page: RenderedPage): string | null {
  const headAt = document.indexOf(SHELL_HEAD_INCLUDE);
  const rootAt = document.indexOf(ROOT_OPEN);
  const bodyAt = document.indexOf(SHELL_BODY_INCLUDE);
  if (headAt < 0 || rootAt < headAt || bodyAt < rootAt) return null;
  // #root's end: the last </div> before the shell's body include.
  const rootClose = document.lastIndexOf('</div>', bodyAt);
  if (rootClose < rootAt) return null;

  const links = page.assets.css.map((href) => `<link rel="stylesheet" crossorigin href="${escapeAttr(href)}">`).join('\n');
  const modules = page.assets.js.length ? ` ${SSR_MODULES_ATTR}="${escapeAttr(page.assets.js.join(' '))}"` : '';
  const headEnd = headAt + SHELL_HEAD_INCLUDE.length;
  return (
    document.slice(0, headEnd) +
    (links ? `\n${links}` : '') +
    document.slice(headEnd, rootAt) +
    `<div id="root" ${SSR_ROOT_ATTR}${modules}>` +
    page.html +
    '</div>\n' +
    `<script type="application/json" id="${SSR_STATE_ID}">${serializeState(page.state)}</script>` +
    document.slice(rootClose + '</div>'.length)
  );
}
