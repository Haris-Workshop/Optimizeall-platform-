import type { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { markClientNavigation } from '@/lib/ssr';
import { AppProviders } from './app/providers';
import { createAppRouter } from './app/router';

function createRouter() {
  const router = createAppRouter();
  const initial = router.state.location;
  const unsubscribe = router.subscribe((state) => {
    if (state.location === initial) return;
    markClientNavigation();
    unsubscribe();
  });
  return router;
}

/** The app. `queryClient` comes from src/main.tsx when the page was rendered on the server (seeded with its data). */
export function App({ queryClient }: { queryClient?: QueryClient }) {
  const [router] = useState(createRouter);
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppProviders>
  );
}
