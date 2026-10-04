import { useEffect, useRef, useState } from 'react';
import { createBrowserRouter, Outlet, ScrollRestoration, useLocation, type RouteObject } from 'react-router-dom';
import { onServerRenderedPage } from '@/lib/ssr';
import { NotFound } from '@/features/public/NotFound';
import { RouteErrorPage } from '@/features/public/RouteErrorPage';
import { publicRoutes } from '@/features/public/routes';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { RedirectIfAuthenticated, RequireAuth, RequirePermission } from './guards';
import { lazyPage } from './lazyPage';
import { publicRoutes as billingPublicRoutes } from '@/features/agency/billing/publicRoutes';
import { publicRoutes as crmPublicRoutes } from '@/features/agency/crm/publicRoutes';
import { publicRoutes as emailPublicRoutes } from '@/features/agency/email/publicRoutes';
import { PublicLayout } from './layouts/PublicLayout';
import { portals } from './portals';
import type { PortalRouteHandle } from './portalTypes';

// Code-split: the public website's entry bundle carries neither the sign-in pages nor the portal shell (nor the CSS
// they import); each loads the first time it renders. The client bundle budget (scripts/check-bundle-budget.mjs) keeps
// it that way.
const AuthLayout = lazyPage(() => import('./layouts/AuthLayout'), 'AuthLayout');
const PortalLayout = lazyPage(() => import('./layouts/PortalLayout'), 'PortalLayout');
const LoginPage = lazyPage(() => import('@/features/auth/LoginPage'), 'LoginPage');
const RegisterPage = lazyPage(() => import('@/features/auth/RegisterPage'), 'RegisterPage');
const CheckEmailPage = lazyPage(() => import('@/features/auth/CheckEmailPage'), 'CheckEmailPage');
const VerifyEmailPage = lazyPage(() => import('@/features/auth/VerifyEmailPage'), 'VerifyEmailPage');
const ForgotPasswordPage = lazyPage(() => import('@/features/auth/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyPage(() => import('@/features/auth/ResetPasswordPage'), 'ResetPasswordPage');
const GoogleCallbackPage = lazyPage(
  () => import('@/features/auth/google/GoogleCallbackPage'),
  'GoogleCallbackPage',
);
const AccountSecurityPage = lazyPage(
  () => import('@/features/auth/AccountSecurityPage'),
  'AccountSecurityPage',
);
const AccountSecurityRedirect = lazyPage(
  () => import('@/features/auth/AccountSecurityPage'),
  'AccountSecurityRedirect',
);
const JoinPage = lazyPage(() => import('@/features/public/landing/JoinPage'), 'JoinPage');
const CampaignLandingPage = lazyPage(
  () => import('@/features/public/landing/CampaignLandingPage'),
  'CampaignLandingPage',
);

/** Client landing pages (/lp/:client/:slug) and embeddable forms (/f/:formId) render without the site chrome. */
const pagesPublicRoutes: RouteObject[] = [
  {
    path: 'lp/:client/:slug',
    lazy: async () => ({
      Component: (await import('@/features/agency/pages/publicRoutes')).PublicLandingPageView,
    }),
  },
  {
    path: 'f/:formId',
    lazy: async () => ({
      Component: (await import('@/features/agency/pages/publicRoutes')).EmbeddedFormPage,
    }),
  },
];

/** The design-system showcase ships in development and in builds with VITE_SHOW_DESIGN_SYSTEM=true (staging). */
export const showDesignSystem = import.meta.env.DEV || import.meta.env.VITE_SHOW_DESIGN_SYSTEM === 'true';

/** Marks a route (and its children) as rendered on the server: src/entry-server.tsx renders only these. */
function serverRendered(route: RouteObject): RouteObject {
  const marked = { ...route, handle: { ...(route.handle as object | undefined), ssr: true } } as RouteObject;
  if (route.children) marked.children = route.children.map(serverRendered);
  return marked;
}

/**
 * Scroll restoration, except on the page the server rendered: that page was on screen (and could be scrolled) before
 * the app started, and restoring would jump the visitor back to the top when it hydrates. It is enabled from the first
 * client-side navigation on.
 */
function AppScrollRestoration() {
  const location = useLocation();
  const initialKey = useRef(location.key);
  const [enabled, setEnabled] = useState(() => typeof document !== 'undefined' && !onServerRenderedPage());
  useEffect(() => {
    if (!enabled && location.key !== initialKey.current) setEnabled(true);
  }, [enabled, location.key]);
  return enabled ? <ScrollRestoration /> : null;
}

function RootRoute() {
  return (
    <AuthProvider>
      <AppScrollRestoration />
      <Outlet />
    </AuthProvider>
  );
}

/**
 * Wraps every portal route that declares `handle.requires` (at any depth) in RequirePermission, so deep links answer
 * 403 like the hidden nav implies. A parent's requirement covers its children (list + detail pages).
 *
 * Lazy routes (`lazy: () => ({ Component })`) cannot be wrapped in place: React Router renders a lazily loaded
 * `Component` instead of the route's `element`, which silently dropped the guard. The guard becomes the route's element
 * and the lazy page moves to an index child rendered in its Outlet.
 */
export function guardPortalRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.map((route): RouteObject => {
    const requires = (route.handle as PortalRouteHandle | undefined)?.requires;
    if (requires && route.lazy) {
      const { lazy, children, ...rest } = route;
      const guard = (
        <RequirePermission {...requires}>
          <Outlet />
        </RequirePermission>
      );
      if (route.index) return { element: guard, handle: route.handle, children: [{ index: true, lazy }] };
      return {
        ...rest,
        element: guard,
        children: [{ index: true, lazy }, ...(children ? guardPortalRoutes(children) : [])],
      } as RouteObject;
    }
    const element = requires ? (
      <RequirePermission {...requires}>{route.element ?? <Outlet />}</RequirePermission>
    ) : (
      route.element
    );
    if (route.index) return { ...route, element };
    return { ...route, element, children: route.children ? guardPortalRoutes(route.children) : undefined };
  });
}

export const routes: RouteObject[] = [
  {
    element: <RootRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          // Public agency website (home, services, blog, careers, forms, CMS pages…): features/public/routes.tsx. These
          // are rendered on the server too (src/entry-server.tsx) and hydrated in the browser.
          ...publicRoutes.map(serverRendered),
          // Invitation links (backend MarketingUrls.InvitationLink) and shareable public campaign pages.
          { path: 'join/:code', element: <JoinPage /> },
          { path: 'c/:slug', element: <CampaignLandingPage /> },
          // Tokenized proposal (/p/:token) and invoice (/i/:token) links sent to clients by email.
          ...crmPublicRoutes,
          ...billingPublicRoutes,
          // Unsubscribe, preference center, double opt-in and hosted sign-up links from marketing emails.
          ...emailPublicRoutes,
          ...(showDesignSystem
            ? [
                {
                  path: 'design-system',
                  lazy: async () => {
                    const { DesignSystemPage } = await import('@/features/design-system/DesignSystemPage');
                    return { Component: DesignSystemPage };
                  },
                },
              ]
            : []),
        ],
      },
      // Client landing pages (/lp/:client/:slug) and embeddable forms (/f/:formId) render without the site chrome.
      ...pagesPublicRoutes,
      {
        element: <AuthLayout />,
        children: [
          {
            path: 'login',
            element: (
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            ),
          },
          {
            path: 'register',
            element: (
              <RedirectIfAuthenticated>
                <RegisterPage />
              </RedirectIfAuthenticated>
            ),
          },
          { path: 'check-email', element: <CheckEmailPage /> },
          { path: 'verify-email', element: <VerifyEmailPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
          // Google OAuth redirect URI (AppLinks.GoogleCallback); also finishes linking from the profile.
          { path: 'auth/google/callback', element: <GoogleCallbackPage /> },
        ],
      },
      ...portals.map<RouteObject>((portal) => ({
        path: portal.basePath,
        element: (
          <RequireAuth>
            <RequirePermission {...portal.requires}>
              <PortalLayout portal={portal} />
            </RequirePermission>
          </RequireAuth>
        ),
        children: [
          ...guardPortalRoutes(portal.routes),
          // Every portal: the signed-in user's own password, two-step verification and Google connection.
          { path: 'account/security', element: <AccountSecurityPage /> },
          { path: '*', element: <NotFound /> },
        ],
      })),
      // AppLinks.AccountSecurity (security emails): forwards to the user's own portal's security page.
      {
        path: 'account/security',
        element: (
          <RequireAuth>
            <AccountSecurityRedirect />
          </RequireAuth>
        ),
      },
      {
        element: <PublicLayout />,
        children: [{ path: '*', element: <NotFound siteLinks /> }],
      },
    ],
  },
];

/**
 * The route tree cut down to the branches that lead to server-rendered routes (the same route objects). A page the
 * server rendered always matches one of them, and matching against these few dozen routes instead of every portal route
 * keeps that work out of the browser's startup (src/start.tsx).
 */
export function serverRenderedRouteTree(tree: RouteObject[] = routes): RouteObject[] {
  const keep: RouteObject[] = [];
  for (const route of tree) {
    if ((route.handle as { ssr?: boolean } | undefined)?.ssr) keep.push(route);
    else if (route.children) {
      const children = serverRenderedRouteTree(route.children);
      if (children.length > 0) keep.push({ ...route, children } as RouteObject);
    }
  }
  return keep;
}

export function createAppRouter() {
  return createBrowserRouter(routes);
}
