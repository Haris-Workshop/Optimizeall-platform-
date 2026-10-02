import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';
import {
  DOCUMENT_HEADERS,
  extractShell,
  fillShell,
  isDocumentRequest,
  type Shell,
} from './src/app/seoShellCore';

/**
 * Server-rendered public pages in the Vite build, dev server and preview server (docs/SEO_CRO.md § Rendering).
 *
 * - `vite build`: writes `dist/__shell/head.html` and `dist/__shell/body.html` (the built index.html without its default
 *   SEO tags). nginx includes them into the API's documents with SSI (nginx/default.conf.template).
 * - `vite` / `vite preview`: page requests are rendered by the API (`/_document{path}`) and the shell is filled in here,
 *   exactly as nginx does in production. If the API is unreachable the request falls through to the plain SPA shell.
 */
export function seoShell(apiTarget: string): Plugin {
  let outDir = 'dist';
  let root = process.cwd();

  async function render(
    req: IncomingMessage,
    res: ServerResponse,
    next: Connect.NextFunction,
    shell: () => Promise<Shell>,
  ) {
    if (!isDocumentRequest(req.method, req.url)) return next();
    let upstream: Response;
    try {
      upstream = await fetch(`${apiTarget}/_document${req.url ?? '/'}`, {
        method: req.method,
        redirect: 'manual',
        headers: {
          accept: 'text/html',
          'user-agent': String(req.headers['user-agent'] ?? ''),
          'x-forwarded-proto': 'http',
        },
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
    const html = fillShell(await upstream.text(), await shell());
    res.setHeader('content-length', Buffer.byteLength(html));
    res.end(req.method === 'HEAD' ? undefined : html);
  }

  return {
    name: 'optimizeall-seo-shell',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
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
      server.middlewares.use((req, res, next) => void render(req, res, next, shell).catch(next));
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
      const shell = extractShell(readFileSync(join(outDir, 'index.html'), 'utf8'));
      mkdirSync(join(outDir, '__shell'), { recursive: true });
      writeFileSync(join(outDir, '__shell', 'head.html'), shell.head + '\n');
      writeFileSync(join(outDir, '__shell', 'body.html'), shell.body + '\n');
    },
  };
}
