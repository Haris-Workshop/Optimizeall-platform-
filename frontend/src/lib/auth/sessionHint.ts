/**
 * Whether the silent session restore (POST /auth/refresh) is worth trying on this page load.
 *
 * The refresh cookie is HttpOnly and scoped to /api/v1/auth, so the app cannot see it. Next to it the API sets
 * `oa_signed_in=1` (backend Modules/Auth/AuthCookies.cs, SessionHint): readable, site-wide, no secret, same lifetime,
 * removed on sign-out. Without it, a visitor of the public website has no session to restore, and the refresh call would
 * only answer 401 (a console error and a wasted request on every page view).
 *
 * Signed-in areas and the sign-in pages always try: a session created before the hint existed still restores there
 * (and the refresh sets the hint for next time).
 */
export const SESSION_HINT_COOKIE = 'oa_signed_in';

const ALWAYS_RESTORE = /^\/(app|admin|agency|client|review|finance|manage|login|register|auth)(\/|$)/;

export function hasSessionHint(): boolean {
  if (typeof document === 'undefined') return true;
  return document.cookie.split(';').some((part) => part.trim().startsWith(`${SESSION_HINT_COOKIE}=`));
}

export function shouldRestoreSession(pathname: string): boolean {
  return hasSessionHint() || ALWAYS_RESTORE.test(pathname);
}
