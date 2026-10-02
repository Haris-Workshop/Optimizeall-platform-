import { type ComponentType, lazy, Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Code-splits a routed page: its module is downloaded the first time the page renders, so the public website and each
 * portal only load the code they use. Keeps `element: <Page />` route definitions (and the permission guards that wrap
 * them) unchanged.
 */
/** The props of a component type (pages that take props, e.g. `channel`, keep them through lazyPage). */
type PropsOf<C> = C extends ComponentType<infer P> ? P : Record<string, never>;

export function lazyPage<M, K extends keyof M & string>(load: () => Promise<M>, name: K): ComponentType<PropsOf<M[K]>> {
  type P = PropsOf<M[K]>;
  const LazyComponent = lazy(async () => ({ default: (await load())[name] as ComponentType<Record<string, unknown>> }));
  function LazyPage(props: P) {
    return (
      <Suspense
        fallback={
          <div className="lazy-page-loading">
            <Spinner label="Loading page" />
          </div>
        }
      >
        <LazyComponent {...(props as Record<string, unknown>)} />
      </Suspense>
    );
  }
  LazyPage.displayName = `LazyPage(${name})`;
  return LazyPage;
}
