import { hydrate, type DehydratedState } from '@tanstack/react-query';
import { startTransition, StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { matchRoutes } from 'react-router-dom';
import { App } from './App';
import { serverRenderedRouteTree } from './app/router';
import { SSR_STATE_ID } from './app/ssrDocument';
import { createQueryClient } from './lib/api/query';

/**
 * Public pages arrive rendered by the server (src/entry-server.tsx) with the data they were rendered with. The route
 * modules of the current URL are loaded first (the router would otherwise render nothing while they load, which does
 * not match the server's markup), then React hydrates the existing DOM. Hydration runs as a transition, so React
 * yields to the browser between components instead of blocking the main thread for the whole page.
 */
async function hydrateServerPage(container: HTMLElement) {
  const queryClient = createQueryClient();
  const stateScript = document.getElementById(SSR_STATE_ID);
  if (stateScript?.textContent) hydrate(queryClient, JSON.parse(stateScript.textContent) as DehydratedState);
  const matches = matchRoutes(serverRenderedRouteTree(), window.location) ?? [];
  await Promise.all(
    matches.map(async ({ route }) => {
      if (typeof route.lazy !== 'function') return;
      const loaded = await route.lazy();
      Object.assign(route, loaded, { lazy: undefined });
    }),
  );
  startTransition(() => {
    hydrateRoot(
      container,
      <StrictMode>
        <App queryClient={queryClient} />
      </StrictMode>,
    );
  });
}

/** Starts the app in `root`: hydrates a server-rendered page, renders anything else. */
export function start(root: HTMLElement, serverRendered: boolean) {
  if (serverRendered) {
    void hydrateServerPage(root);
    return;
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
