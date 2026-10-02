// Server renderer for the public website (docs/SEO_CRO.md § Rendering). Runs next to nginx in the web image
// (nginx/40-optimizeall-ssr.sh) and locally in scripts/serve-web-nginx.sh. Plain Node, no dependencies: the renderer is
// the self-contained `vite build --ssr` bundle (dist-ssr/entry-server.js).
//
// nginx's @document location sends every page request here as /_document{path}?{query} (with the visitor's
// X-Forwarded-* headers). This server asks the API for the same /_document URL — the page's status, redirects and SEO
// head stay the API's — and, for a 200 public website page, renders the React app into the document
// (src/entry-server.tsx). Everything else (301/404/410, errors, portals) passes through unchanged, and when rendering
// fails the API's document is sent as it is (the browser then renders the page, as before SSR). If this server is not
// running at all, nginx asks the API directly (@document_api).
//
// Environment:
//   SSR_PORT      port to listen on (default 3000, 127.0.0.1 only unless SSR_HOST is set)
//   API_UPSTREAM  API base URL (default http://api:8080; API_HOSTPORT=host:port takes precedence, as in the envsh)
//   SSR_DIST      the client build (for .vite/manifest.json; default ../dist next to this file, or /usr/share/nginx/html)
//   SSR_ENTRY     the server build (default ../dist-ssr/entry-server.js next to this file)
//   SSR_LOG       "1" logs every render with its timing
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.SSR_PORT ?? 3000);
const host = process.env.SSR_HOST ?? '127.0.0.1';
const api = (process.env.API_HOSTPORT ? `http://${process.env.API_HOSTPORT}` : (process.env.API_UPSTREAM ?? 'http://api:8080')).replace(/\/+$/, '');
const dist = process.env.SSR_DIST ?? [resolve(here, '../dist'), '/usr/share/nginx/html'].find((d) => existsSync(join(d, '.vite', 'manifest.json')));
const entry = process.env.SSR_ENTRY ?? resolve(here, '../dist-ssr/entry-server.js');
const verbose = process.env.SSR_LOG === '1';

if (!dist || !existsSync(join(dist, '.vite', 'manifest.json'))) throw new Error(`ssr: no client build manifest (SSR_DIST=${dist})`);
const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));
const { renderDocument } = await import(pathToFileURL(entry).href);

/** Request headers passed on to the API (the document and the renderer's data requests). */
const FORWARD = ['x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-real-ip', 'user-agent', 'accept-language'];
/** Lists the CSP hashes of the document's inline <style> elements (same name as STYLE_HASHES_HEADER in src/app/csp.ts). */
const STYLE_HASHES_HEADER = 'x-oa-style-hashes';
/** Response headers of the API that are not passed back (the body is re-encoded here). */
const DROP = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive']);

function forwarded(req) {
  const headers = {};
  for (const name of FORWARD) {
    const value = req.headers[name];
    if (typeof value === 'string' && value) headers[name] = value;
  }
  return headers;
}

/** The page's public origin, as the visitor used it (nginx sets X-Forwarded-Proto/Host). */
function publicOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim() || 'http';
  const hostHeader = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
  return `${proto === 'https' ? 'https' : 'http'}://${hostHeader}`;
}

function problem(res, status, detail) {
  res.writeHead(status, { 'content-type': 'application/problem+json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ type: 'about:blank', title: 'Service unavailable', status, detail }));
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';
  if (url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok\n');
  }
  if (!url.startsWith('/_document') || (req.method !== 'GET' && req.method !== 'HEAD')) return problem(res, 400, 'Not a document request.');
  const pageUrl = url.slice('/_document'.length) || '/';
  const headers = forwarded(req);
  // The API's document and the renderer start together: the renderer can fetch the page's data meanwhile.
  const upstreamP = fetch(api + url, {
    method: req.method,
    redirect: 'manual',
    headers: { ...headers, accept: 'text/html' },
    signal: AbortSignal.timeout(30_000),
  });
  const bodyP = upstreamP.then(async (r) => Buffer.from(await r.arrayBuffer()));
  const rendering =
    req.method === 'GET'
      ? renderDocument({
          url: pageUrl,
          document: Promise.all([upstreamP, bodyP]).then(
            ([r, body]) => (r.status === 200 && (r.headers.get('content-type') ?? '').includes('text/html') ? body.toString('utf8') : null),
            () => null,
          ),
          manifest,
          apiOrigin: api,
          headers,
          origin: publicOrigin(req),
        }).catch((error) => ({ rendered: false, reason: `Error: ${error?.stack ?? error}` }))
      : null;
  let upstream;
  let body;
  try {
    upstream = await upstreamP;
    body = await bodyP;
  } catch (error) {
    // The API is unreachable: nginx answers with the app shell and 503 (never this server's own 502).
    if (verbose) console.error(`ssr: API unreachable for ${pageUrl}: ${error}`);
    return problem(res, 503, 'The API is not reachable.');
  }
  const out = {};
  upstream.headers.forEach((value, name) => {
    if (!DROP.has(name)) out[name] = value;
  });
  const result = rendering ? await rendering : null;
  if (result?.rendered) {
    body = Buffer.from(result.html, 'utf8');
    // The CSP hashes of the document's <style> elements: the API's own plus the page's inline-style block (nginx puts
    // them into style-src and hides the header; src/app/csp.ts).
    const hashes = [out[STYLE_HASHES_HEADER], ...result.styleHashes].filter(Boolean).join(' ');
    if (hashes) out[STYLE_HASHES_HEADER] = hashes;
    if (verbose) console.log(`ssr: ${pageUrl} rendered in ${result.ms} ms (${result.passes} passes, ${result.renderMs.join('+')} ms rendering)`);
  } else if (result && (result.reason.startsWith('Error') || verbose)) {
    console.error(`ssr: ${pageUrl} not rendered: ${result.reason}`);
  }
  if (req.method !== 'HEAD') out['content-length'] = String(body.length);
  res.writeHead(upstream.status, out);
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.keepAliveTimeout = 65_000;
server.listen(port, host, () => console.log(`ssr: listening on ${host}:${port} (API ${api}, build ${dist})`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
