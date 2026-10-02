/**
 * Server renderer for the public website (docs/SEO_CRO.md § Rendering). Built with `vite build --ssr` into
 * `dist-ssr/entry-server.js` and used by server/ssr-server.mjs (production, behind nginx) and `vite preview`.
 *
 * {@link renderDocument} takes the API's document for a URL (status, SEO head, plain crawlable copy) and, for public
 * website routes, renders the React app into it: the designed page is in the first HTML response, so the first paint
 * needs no JavaScript, and the client hydrates it (src/main.tsx) with the same data, embedded as JSON.
 *
 * Data: the app's own queries (React Query) run on the server through the API client with the visitor's forwarded
 * headers. The page is rendered until no new query appears (dependent queries take another pass); failed queries are
 * left pending, so the client fetches them exactly as it does today.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { dehydrate, QueryClient, type Query, type QueryFunction, type QueryKey } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router-dom/server';
import { AppProviders } from './app/providers';
import { routerFuture, routes } from './app/router';
import { extractInlineStyles, injectRenderedPage, pageAssets, type RenderInput, type RenderResult } from './app/ssrDocument';
import { setTransport } from './lib/api/client';
import { isApiError } from './lib/api/errors';
import { setServerOrigin } from './lib/ssr';

interface RequestContext {
  /** Manifest keys of the route modules loaded for this request (see the ssrTrackImports plugin in vite.config.ts). */
  modules: Set<string>;
  apiOrigin: string;
  headers: Record<string, string>;
  /** The page's public origin (absolute URLs in the markup). */
  origin: string;
}

const requests = new AsyncLocalStorage<RequestContext>();

// Dynamic imports in the server build report the module they load (vite.config.ts, ssrTrackImports).
(globalThis as { __oaSsrImport?: <T>(load: Promise<T>, id: string) => Promise<T> }).__oaSsrImport = (load, id) => {
  requests.getStore()?.modules.add(id);
  return load;
};

// Every API request made while rendering goes to the API directly, as the visitor (forwarded headers, no cookies).
setTransport((url, init) => {
  const ctx = requests.getStore();
  if (!ctx) return Promise.reject(new Error('API request outside a server render'));
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(ctx.headers)) headers.set(name, value);
  return fetch(ctx.apiOrigin + url, { method: init.method, headers, body: init.body, signal: AbortSignal.timeout(5_000) });
});

setServerOrigin(() => requests.getStore()?.origin ?? '');

/** Most render passes per page: the first finds the page's queries, the next ones their dependent queries. */
const MAX_PASSES = 4;

function isEnabled(query: Query): boolean {
  const enabled = (query.options as { enabled?: boolean | ((q: Query) => boolean) }).enabled;
  return typeof enabled === 'function' ? enabled(query) : enabled !== false;
}

/**
 * Renders the app for a public website URL into the API's document. Only routes marked `handle.ssr` (the public
 * website, router.tsx) are rendered; anything else, a redirect or a render error leaves the document as it is.
 */
export async function renderDocument(input: RenderInput): Promise<RenderResult> {
  try {
    return await render(input);
  } catch (error) {
    return { rendered: false, reason: error instanceof Error ? `Error: ${error.stack ?? error.message}` : String(error) };
  }
}

/**
 * The queries each recently rendered URL needed (key and fetch function, which only depend on the URL). The next
 * request for the URL starts them right away, so the page usually renders in one pass instead of two. Bounded LRU.
 */
interface KnownQuery {
  queryKey: QueryKey;
  queryFn: QueryFunction;
}
const knownQueries = new Map<string, KnownQuery[]>();
const KNOWN_URLS = 500;

function remember(url: string, queries: KnownQuery[]) {
  knownQueries.delete(url);
  knownQueries.set(url, queries);
  if (knownQueries.size > KNOWN_URLS) knownQueries.delete(knownQueries.keys().next().value as string);
}

async function render(input: RenderInput): Promise<RenderResult> {
  const started = performance.now();
  const ctx: RequestContext = { modules: new Set(), apiOrigin: input.apiOrigin, headers: input.headers, origin: input.origin };
  return requests.run(ctx, async (): Promise<RenderResult> => {
    const handler = createStaticHandler(routes, { future: routerFuture });
    const context = await handler.query(new Request(input.origin + input.url));
    if (context instanceof Response) return { rendered: false, reason: `router answered ${context.status}` };
    if (context.statusCode !== 200 || context.errors) return { rendered: false, reason: `router status ${context.statusCode}` };
    const leaf = context.matches.at(-1)?.route;
    if (!(leaf?.handle as { ssr?: boolean } | undefined)?.ssr) return { rendered: false, reason: 'not a server-rendered route' };

    const router = createStaticRouter(handler.dataRoutes, context, { future: routerFuture });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity } },
    });
    const app = () =>
      renderToString(
        <StrictMode>
          <AppProviders queryClient={queryClient}>
            <StaticRouterProvider router={router} context={context} hydrate={false} />
          </AppProviders>
        </StrictMode>,
      );

    const attempted = new Set<string>();
    /** A request that failed for a passing reason (rate limit, server error, network): the page is not rendered. */
    let unavailable: string | null = null;
    const fetchAll = (queries: Query[]) =>
      Promise.all(
        queries.map(async (query) => {
          attempted.add(query.queryHash);
          try {
            await query.fetch();
          } catch (error) {
            // A 4xx answer is part of the page (the client gets the same): the query is dropped, comes back pending on
            // the next pass and the client loads it. Anything else would render loading states in place of content, so
            // the API's plain, complete copy is served instead (crawlers never get a half-rendered page).
            if (!isApiError(error) || error.status === 0 || error.status === 429 || error.status >= 500)
              unavailable ??= `${JSON.stringify(query.queryKey)}: ${isApiError(error) ? error.status : String(error)}`;
            queryClient.getQueryCache().remove(query);
          }
        }),
      );
    // What this URL needed last time is fetched right away, while the API's document is still on its way.
    const known = knownQueries.get(input.url) ?? [];
    const prefetched = fetchAll(
      known.map(({ queryKey, queryFn }) =>
        queryClient.getQueryCache().build(queryClient, queryClient.defaultQueryOptions({ queryKey, queryFn })),
      ),
    );
    // Nothing is rendered for a page the API does not answer with 200 (404, 410, redirects, errors).
    const document = await input.document;
    if (document === null) return { rendered: false, reason: 'no document' };
    await prefetched;
    if (unavailable) return { rendered: false, reason: `data unavailable (${unavailable})` };

    let html = '';
    let passes = 0;
    const renderMs: number[] = [];
    for (;;) {
      const t = performance.now();
      html = app();
      renderMs.push(Math.round(performance.now() - t));
      passes++;
      const pending = queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.status === 'pending' && q.state.fetchStatus === 'idle' && !attempted.has(q.queryHash) && isEnabled(q));
      if (pending.length === 0 || passes >= MAX_PASSES) break;
      await fetchAll(pending);
      if (unavailable) return { rendered: false, reason: `data unavailable (${unavailable})` };
    }
    const queries = queryClient.getQueryCache().getAll();
    remember(
      input.url,
      queries
        .filter((q) => q.state.status === 'success' && typeof q.options.queryFn === 'function')
        .map((q) => ({ queryKey: q.queryKey, queryFn: q.options.queryFn as QueryFunction })),
    );
    // The strict CSP blocks style attributes: the markup's inline styles go into one <style> element, allowed by its hash.
    const styles = extractInlineStyles(html);
    const out = injectRenderedPage(document, {
      html: styles.html,
      css: styles.css,
      state: dehydrate(queryClient),
      assets: pageAssets(input.manifest, ctx.modules),
    });
    queryClient.clear();
    if (out === null) return { rendered: false, reason: 'unexpected document shape' };
    const styleHashes = styles.css ? [`'sha256-${createHash('sha256').update(styles.css, 'utf8').digest('base64')}'`] : [];
    return { rendered: true, html: out, styleHashes, passes, ms: Math.round(performance.now() - started), renderMs };
  });
}
