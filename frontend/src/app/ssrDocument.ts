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
/**
 * Attribute that carries an element's inline style in server-rendered markup (in place of `style`, which the strict CSP
 * blocks in HTML): see {@link extractInlineStyles} and {@link restoreInlineStyles}.
 */
export const SSR_STYLE_ATTR = 'data-oa-style';
/** id of the `<style>` element that applies the {@link SSR_STYLE_ATTR} styles until the app starts. */
export const SSR_STYLE_ID = 'oa-ssr-styles';

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
  | {
      rendered: true;
      html: string;
      /** CSP sources (`'sha256-…'`) of the `<style>` elements the renderer added (X-OA-Style-Hashes, src/app/csp.ts). */
      styleHashes: string[];
      passes: number;
      ms: number;
      renderMs: number[];
    }
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

/** The characters React escapes in attribute values (escapeTextForBrowser), decoded. */
const decodeAttr = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * CSS text for a style attribute's value that can never leave its rule or the `<style>` element: braces, angle
 * brackets, backslashes, comment starts and line breaks become CSS escapes (the same characters inside strings and
 * identifiers; React's style values do not use them otherwise).
 */
const cssSafe = (value: string) =>
  value.replace(/[\\{}<>\r\n\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `).replace(/\/\*/g, '/\\2a ');

/**
 * The strict CSP blocks `style="…"` attributes in HTML. This moves the inline styles of React's server-rendered markup
 * into one `<style>` element, allowed by its hash (src/app/csp.ts): every `style` attribute becomes `data-oa-style`
 * with the same value, and each distinct value gets one rule that applies it to the elements carrying it. The rules
 * outrank class selectors (three `:not(#oa-x)`, an id no element has), as the attribute did, so the first paint is the
 * same. Once the app starts, {@link restoreInlineStyles} turns them back into real inline styles through the CSSOM
 * (which CSP allows) before React hydrates.
 *
 * React escapes `"` in text and attribute values, so ` style="` only ever starts an attribute in its markup.
 */
export function extractInlineStyles(html: string): { html: string; css: string } {
  const rules = new Map<string, string>();
  const out = html.replace(/(\s)style="([^"]*)"/g, (_match, space: string, escaped: string) => {
    const value = decodeAttr(escaped);
    if (!rules.has(value)) {
      const css = cssSafe(value);
      rules.set(value, `[${SSR_STYLE_ATTR}="${css.replace(/"/g, '\\22 ')}"]:not(#oa-x):not(#oa-x):not(#oa-x){${css}}`);
    }
    return `${space}${SSR_STYLE_ATTR}="${escaped}"`;
  });
  return { html: out, css: [...rules.values()].join('') };
}

/**
 * Browser, before hydrating a server-rendered page: the {@link SSR_STYLE_ATTR} values become inline styles again
 * (element.style, the CSSOM, which the CSP allows) and the server's style block goes, so the DOM is exactly what React
 * rendered and later style changes (removed properties too) apply as usual.
 */
export function restoreInlineStyles(root: ParentNode, doc: Document = document): void {
  root.querySelectorAll<HTMLElement | SVGElement>(`[${SSR_STYLE_ATTR}]`).forEach((el) => {
    el.style.cssText = el.getAttribute(SSR_STYLE_ATTR) ?? '';
    el.removeAttribute(SSR_STYLE_ATTR);
  });
  doc.getElementById(SSR_STYLE_ID)?.remove();
}

export interface RenderedPage {
  /** The app's markup for `#root`, inline styles moved out ({@link extractInlineStyles}). */
  html: string;
  /** The markup's inline-style rules, in a `<style>` element after the page's stylesheets. */
  css?: string;
  /** Dehydrated React Query state. */
  state: unknown;
  assets: PageAssets;
}

const ROOT_OPEN = '<div id="root">';

/**
 * Puts the rendered page into the API's document: the app's markup replaces the plain server copy inside `#root`
 * (marked for hydration, with the page's chunks to preload), the page's stylesheets follow the shell's head include
 * (after the app's stylesheets, so page styles still override them) with the markup's inline-style block, and the query
 * state goes right after `#root`. Returns null when the document does not have the expected shape (it is then served
 * unchanged).
 */
export function injectRenderedPage(document: string, page: RenderedPage): string | null {
  const headAt = document.indexOf(SHELL_HEAD_INCLUDE);
  const rootAt = document.indexOf(ROOT_OPEN);
  const bodyAt = document.indexOf(SHELL_BODY_INCLUDE);
  if (headAt < 0 || rootAt < headAt || bodyAt < rootAt) return null;
  // #root's end: the last </div> before the shell's body include.
  const rootClose = document.lastIndexOf('</div>', bodyAt);
  if (rootClose < rootAt) return null;

  const links = [
    ...page.assets.css.map((href) => `<link rel="stylesheet" crossorigin href="${escapeAttr(href)}">`),
    ...(page.css ? [`<style id="${SSR_STYLE_ID}">${page.css}</style>`] : []),
  ].join('\n');
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
