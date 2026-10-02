import { useSyncExternalStore } from 'react';
import { SSR_ROOT_ATTR } from '@/app/ssrDocument';

/**
 * Helpers for code that runs both in the browser and in the server renderer (src/entry-server.tsx, public pages only).
 *
 * The first client render of a server-rendered page must produce exactly the server's markup (hydration). Anything that
 * depends on the browser — storage, media queries, clipboard support — is therefore read after hydration with
 * {@link useHydrated}, never in a render or a useState initializer.
 */

let serverOrigin: (() => string) | null = null;

/** Server renderer only: where {@link pageOrigin} comes from while rendering a request. */
export function setServerOrigin(origin: (() => string) | null): void {
  serverOrigin = origin;
}

/** The page's origin (`https://host`): `location.origin` in the browser, the request's public origin on the server. */
export function pageOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return serverOrigin?.() ?? '';
}

const noop = () => () => undefined;

/**
 * False on the server and during hydration, true afterwards (and on client-rendered pages from the first render). For
 * browser-only UI: React renders the server's markup first, then re-renders with the browser's values.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** Whether this page load started from server-rendered markup (src/main.tsx hydrates it). */
const bootedFromServer =
  typeof document !== 'undefined' && document.getElementById('root')?.hasAttribute(SSR_ROOT_ATTR) === true;
let navigated = false;

/** Called on the first client-side navigation (src/App.tsx): later pages are rendered in the browser. */
export function markClientNavigation(): void {
  navigated = true;
}

/**
 * True while the visitor is on the page the server rendered (before any client-side navigation). Its content was on
 * screen before the app started, so entrance effects (reveal on scroll, count-ups) must not hide or reset what is
 * already visible.
 */
export function onServerRenderedPage(): boolean {
  return bootedFromServer && !navigated;
}

/** Whether an element is (partly) inside the viewport right now. */
export function inViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}
