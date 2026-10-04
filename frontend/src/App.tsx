import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { markClientNavigation } from '@/lib/ssr';
import { AppProviders } from './app/providers';
import { createAppRouter } from './app/router';

type AppRouter = ReturnType<typeof createAppRouter>;

/** The app's browser router (src/start.tsx creates it ahead of hydrating a server-rendered page). */
export function createRouter(): AppRouter {
  const router = createAppRouter();
  const initial = router.state.location;
  const unsubscribe = router.subscribe((state) => {
    if (state.location === initial) return;
    markClientNavigation();
    unsubscribe();
  });
  return router;
}

/**
 * The app. `queryClient` and `router` come from src/start.tsx when the page was rendered on the server (the query
 * client seeded with the page's data).
 */
export function App({ queryClient, router: initialRouter }: { queryClient?: QueryClient; router?: AppRouter }) {
  const [router] = useState(() => initialRouter ?? createRouter());
  // The app is live (a server-rendered page is hydrated): `html[data-app-ready]`, for tests that interact right away.
  useEffect(() => document.documentElement.setAttribute('data-app-ready', ''), []);
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
