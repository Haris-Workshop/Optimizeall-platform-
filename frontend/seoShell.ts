import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';
import {
  DOCUMENT_HEADERS,
  extractShell,
  fillShell,
  isDocumentRequest,
  type Shell,
} from './src/app/seoShellCore';
import { contentSecurityPolicy, STYLE_HASHES_HEADER } from './src/app/csp';
import type { Manifest, Renderer } from './src/app/ssrDocument';

type ServerRenderer = { renderer: Renderer; manifest: Manifest };

/**
 * Server-rendered public pages in the Vite build, dev server and preview server (docs/SEO_CRO.md § Rendering).
 *
 * - `vite build`: writes `dist/__shell/head.html` and `dist/__shell/body.html` (the built index.html without its default
 *   SEO tags). nginx includes them into the API's documents with SSI (nginx/default.conf.template).
 * - `vite` / `vite preview`: page requests are rendered by the API (`/_document{path}`) and the shell is filled in here,
 *   exactly as nginx does in production. If the API is unreachable the request falls through to the plain SPA shell.
 * - `vite preview` also renders public pages with the built server renderer (dist-ssr/entry-server.js), as the
 *   production SSR server does (server/ssr-server.mjs). The dev server keeps the API's plain copy and renders in the
 *   browser.
 * - `vite preview` sends the production Content-Security-Policy (src/app/csp.ts) on everything but the proxied API,
 *   with the style hashes of each document, as nginx does: the e2e suites run the app under the real policy. (The dev
 *   server does not: Vite injects its styles as inline <style> elements.)
 */
export function seoShell(apiTarget: string): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  let ssrBuild = false;

  async function render(
    req: IncomingMessage,
    res: ServerResponse,
    next: Connect.NextFunction,
    shell: () => Promise<Shell>,
    ssr?: () => Promise<ServerRenderer | null>,
    csp = false,
  ) {
    if (!isDocumentRequest(req.method, req.url)) return next();
    const headers = { 'user-agent': String(req.headers['user-agent'] ?? ''), 'x-forwarded-proto': 'http' };
    let upstream: Response;
    try {
      upstream = await fetch(`${apiTarget}/_document${req.url ?? '/'}`, {
        method: req.method,
        redirect: 'manual',
        headers: { accept: 'text/html', ...headers },
      });
    } catch {
      return next();
    }
    if (upstream.status === 502 || upstream.status === 504) return next();
    for (const name of DOCUMENT_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.statusCode = upstream.status;
    if (upstream.status >= 300 && upstream.status < 400) return res.end();
    let document = await upstream.text();
    const styleHashes = [upstream.headers.get(STYLE_HASHES_HEADER) ?? ''];
    const server = upstream.status === 200 && req.method === 'GET' && ssr ? await ssr() : null;
    if (server) {
      const result = await server.renderer
        .renderDocument({
          url: req.url ?? '/',
          document,
          manifest: server.manifest,
          apiOrigin: apiTarget,
          headers,
          origin: `http://${req.headers.host ?? 'localhost'}`,
        })
        .catch((error: unknown) => ({ rendered: false as const, reason: String(error) }));
      if (result.rendered) {
        document = result.html;
        styleHashes.push(...result.styleHashes);
      } else if (result.reason.startsWith('Error')) console.warn(`[ssr] ${req.url}: ${result.reason}`);
    }
    if (csp) res.setHeader('content-security-policy', contentSecurityPolicy({ styleHashes: styleHashes.filter(Boolean).join(' ') }));
    const html = fillShell(document, await shell());
    res.setHeader('content-length', Buffer.byteLength(html));
    res.end(req.method === 'HEAD' ? undefined : html);
  }

  return {
    name: 'optimizeall-seo-shell',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
      ssrBuild = Boolean(config.build.ssr);
    },
    configureServer(server: ViteDevServer) {
      const shell = async () => {
        const raw = readFileSync(join(root, 'index.html'), 'utf8');
        return extractShell(await server.transformIndexHtml('/', raw));
      };
      server.middlewares.use((req, res, next) => void render(req, res, next, shell).catch(next));
    },
    configurePreviewServer(server: PreviewServer) {
      const shell = async () => ({
        head: readFileSync(join(outDir, '__shell', 'head.html'), 'utf8'),
        body: readFileSync(join(outDir, '__shell', 'body.html'), 'utf8'),
      });
      // The server renderer and the client manifest, when the build has them (npm run build). Loaded once.
      const ssrEntry = resolve(root, 'dist-ssr', 'entry-server.js');
      const manifestFile = join(outDir, '.vite', 'manifest.json');
      let loaded: Promise<ServerRenderer | null> | null = null;
      const ssr = () =>
        (loaded ??=
          existsSync(ssrEntry) && existsSync(manifestFile)
            ? (import(pathToFileURL(ssrEntry).href) as Promise<Renderer>).then((renderer) => ({
                renderer,
                manifest: JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest,
              }))
            : Promise.resolve(null));
      // Every response but the proxied API's gets the production CSP; documents get their style hashes in render().
      server.middlewares.use((req, res, next) => {
        if (!/^\/(api|t|e|health)(\/|$)/.test(req.url ?? '/')) res.setHeader('content-security-policy', contentSecurityPolicy());
        next();
      });
      server.middlewares.use((req, res, next) => void render(req, res, next, shell, ssr, true).catch(next));
    },
    // Preload the Latin subsets of the self-hosted fonts: Inter (body text) and Inter Tight (headings, so every page's
    // h1, its largest contentful paint). They are then ready before the app's first render, so text never re-wraps when
    // a font swaps in (a layout shift on the hero headline), and the headline's font does not wait for the stylesheet
    // to be parsed. The files are the ones the build actually emits for the axis sets src/main.tsx imports (currently
    // `@fontsource-variable/inter/opsz.css` → inter-latin-opsz-normal and `@fontsource-variable/inter-tight/wght.css`
    // → inter-tight-latin-wght-normal); the Latin-extended and italic files are not preloaded.
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        html = linkAppChunk(html, ctx.bundle);
        const files = Object.keys(ctx.bundle ?? {});
        const fonts = [
          files.find((f) => /(^|\/)inter-latin-[a-z]+-normal-[^/]+\.woff2$/.test(f)),
          files.find((f) => /(^|\/)inter-tight-latin-[a-z]+-normal-[^/]+\.woff2$/.test(f)),
        ].filter((f): f is string => Boolean(f));
        if (fonts.length === 0) return html;
        const links = fonts.map((f) => `  <link rel="preload" as="font" type="font/woff2" href="/${f}" crossorigin />\n`).join('');
        return html.replace('</head>', `${links}  </head>`);
      },
    },
    writeBundle() {
      if (ssrBuild) return;
      const shell = extractShell(readFileSync(join(outDir, 'index.html'), 'utf8'));
      mkdirSync(join(outDir, '__shell'), { recursive: true });
      writeFileSync(join(outDir, '__shell', 'head.html'), shell.head + '\n');
      writeFileSync(join(outDir, '__shell', 'body.html'), shell.body + '\n');
    },
  };
}

type Bundle = NonNullable<Parameters<Extract<NonNullable<Plugin['transformIndexHtml']>, { handler: unknown }>['handler']>[1]['bundle']>;

/**
 * The entry (src/main.tsx) only decides when the app starts; the app itself is the dynamically imported src/start.tsx.
 * Its stylesheets are the site's base styles, so they block the first paint like the entry's and are linked in
 * index.html (and so in the shell of server-rendered pages). Its scripts are not: they are fetched once the page has
 * been painted (main.tsx), so nothing but HTML, CSS and fonts competes with the first paint.
 */
function linkAppChunk(html: string, bundle: Bundle | undefined): string {
  if (!bundle) return html;
  const start = Object.values(bundle).find(
    (c) => c.type === 'chunk' && c.moduleIds.some((id) => id.replace(/\\/g, '/').endsWith('/src/start.tsx')),
  );
  if (!start || start.type !== 'chunk') return html;
  const css: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string) => {
    const chunk = bundle[file];
    if (seen.has(file) || !chunk || chunk.type !== 'chunk' || chunk.isEntry) return;
    seen.add(file);
    chunk.imports.forEach(visit);
    for (const c of chunk.viteMetadata?.importedCss ?? []) if (!css.includes(c)) css.push(c);
  };
  visit(start.fileName);
  const links = css.map((f) => `  <link rel="stylesheet" crossorigin href="/${f}">\n`).join('');
  return html.replace('</head>', `${links}  </head>`);
}

/**
 * Server build only: every dynamic `import('…')` in src/ reports the module it loads to the renderer
 * (`globalThis.__oaSsrImport`, src/entry-server.tsx), keyed like Vite's client manifest (`src/…/Page.tsx`). The renderer
 * then links the stylesheets and chunks of exactly the route modules a page used, so the server-rendered page is styled
 * before any JavaScript runs.
 */
export function ssrTrackImports(): Plugin {
  let root = process.cwd();
  const pattern = /\bimport\(\s*(['"])([^'"]+)\1\s*\)/g;
  return {
    name: 'optimizeall-ssr-track-imports',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      root = config.root;
    },
    async transform(code, id) {
      if (!id.startsWith(join(root, 'src') + sep) || !code.includes('import(')) return null;
      const found = [...code.matchAll(pattern)];
      if (found.length === 0) return null;
      let out = '';
      let at = 0;
      for (const match of found) {
        const resolved = await this.resolve(match[2], id);
        const key = resolved ? relative(root, resolved.id.split('?')[0]).split(sep).join('/') : null;
        out += code.slice(at, match.index);
        out += key ? `globalThis.__oaSsrImport(${match[0]}, ${JSON.stringify(key)})` : match[0];
        at = match.index + match[0].length;
      }
      return { code: out + code.slice(at), map: null };
    },
  };
}
