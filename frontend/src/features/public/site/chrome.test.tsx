import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from '@/app/router';
import { json, mockFetch, problem } from '@/test/fetchMock';
import { axeViolations, renderWithApp } from '@/test/render';
import { publicRoutes } from '../routes';
import * as fx from '../testFixtures';
import { VerifyIndexPage, certificateIdFrom } from '../pages/VerifyIndexPage';
import type { PublicSite } from './api';
import { Breadcrumbs } from './components';
import { agencyCta, agencyMenu, FALLBACK_MENU } from './SiteHeader';
import { SiteChrome } from './SiteChrome';
import { chromeVariant } from './variant';

/** The site with no stored menu, so the header shows the shipped FALLBACK_MENU and footer columns. */
const bare: PublicSite = { ...fx.site, header: { menu: [], cta: null }, footer: { blurb: null, columns: [], legalLinks: [] } };

function renderChrome(route: string, site: PublicSite = bare, withAuth = true) {
  mockFetch({
    'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired'),
    'GET /public/site': () => json(200, site),
    'GET /public/services': () => json(200, fx.serviceGroups),
  });
  return renderWithApp(<p>unused</p>, {
    route,
    path: '/__unused',
    withAuth,
    routes: [{ element: <SiteChrome><Outlet /></SiteChrome>, children: [{ path: '*', element: <h1>Page</h1> }] }],
  });
}

const header = () => screen.getByRole('banner');
const buttons = (root: HTMLElement, variant: string) => root.querySelectorAll(`.ui-button--${variant}`);
const footer = () => screen.getByRole('contentinfo');

describe('chromeVariant', () => {
  it.each([
    ['/', 'agency'],
    ['/services/seo', 'agency'],
    ['/blog/post', 'agency'],
    ['/partners', 'agency'],
    ['/learn', 'academy'],
    ['/learn/paths/ai', 'academy'],
    ['/learn/seo-basics/intro', 'academy'],
    ['/verify', 'academy'],
    ['/verify/certificates/abc', 'academy'],
    ['/academy', 'academy'],
    ['/creators', 'creators'],
    ['/creators/faq', 'creators'],
    ['/join/Ab12Cd34', 'creators'],
    ['/c/spring-launch', 'creators'],
    ['/faq', 'creators'],
    ['/learner-stories', 'agency'],
  ] as const)('%s is %s', (path, expected) => {
    expect(chromeVariant(path)).toBe(expected);
  });
});

describe('agency chrome (default)', () => {
  it('has the agency navigation, one amber call to action, a quiet Academy link and one Sign in', async () => {
    renderChrome('/');
    const nav = within(header()).getByRole('navigation', { name: 'Main' });
    for (const label of ['Services', 'Industries', 'Case studies', 'Insights', 'Partners', 'About'])
      expect(within(nav).getByText(label)).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/blog');
    expect(within(nav).getByRole('link', { name: 'Partners' })).toHaveAttribute('href', '/partners');
    expect(within(nav).queryByText('Academy')).not.toBeInTheDocument();
    // About holds the company pages.
    const about = within(nav).getByRole('button', { name: 'About' });
    const aboutPanel = document.getElementById(about.getAttribute('aria-controls')!)!;
    expect(within(aboutPanel).getAllByRole('link', { hidden: true }).map((a) => a.textContent)).toEqual(['About us', 'How we work', 'Team', 'Careers', 'Contact']);

    // Exactly one highlighted call to action; the old persistent buttons are gone.
    expect(buttons(header(), 'highlight')).toHaveLength(1);
    expect(within(header()).getByRole('link', { name: 'Book a consultation' })).toHaveAttribute('href', '/book-a-consultation');
    expect(within(header()).queryByRole('link', { name: /Get a free audit|Start learning free/ })).not.toBeInTheDocument();
    expect(within(header()).getAllByRole('link', { name: 'Sign in' })).toHaveLength(1);
    // "Free Academy" is a quiet text link, not a button.
    const academy = within(header()).getByRole('link', { name: 'Free Academy' });
    expect(academy).toHaveAttribute('href', '/learn');
    expect(academy.className).not.toMatch(/ui-button/);
  });

  it('ignores stored menu items and a call to action from before the academy became its own product', () => {
    const stored = [
      { label: 'Academy', url: '/academy', description: null, children: [{ label: 'All courses', url: '/learn', description: null, children: null }] },
      { label: 'Services', url: '/services', description: null, children: [] },
      { label: 'About', url: '/about', description: null, children: [{ label: 'Team', url: '/team', description: null, children: null }, { label: 'Creators', url: '/creators', description: null, children: null }] },
    ];
    expect(agencyMenu(stored).map((i) => i.label)).toEqual(['Services', 'About']);
    expect(agencyMenu(stored)[1].children!.map((c) => c.label)).toEqual(['Team']);
    expect(agencyCta({ label: 'Start learning free', url: '/learn' }).url).toBe('/book-a-consultation');
    expect(agencyCta({ label: 'Get a free audit', url: '/free-audit' }).url).toBe('/book-a-consultation');
    expect(agencyCta({ label: 'Get a quote', url: '/get-a-quote' }).url).toBe('/get-a-quote');
    expect(FALLBACK_MENU.map((i) => i.label)).toEqual(['Services', 'Industries', 'Case studies', 'Insights', 'Partners', 'About']);
  });

  it('mobile drawer: two buttons (Book a consultation, Sign in) and plain links to Academy and Creators', async () => {
    const user = userEvent.setup();
    renderChrome('/');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = await screen.findByRole('navigation', { name: 'Mobile' });
    expect(drawer.querySelectorAll('.ui-button')).toHaveLength(2);
    expect(buttons(drawer, 'highlight')).toHaveLength(1);
    expect(within(drawer).getByRole('link', { name: 'Book a consultation' })).toHaveAttribute('href', '/book-a-consultation');
    expect(within(drawer).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    const academy = within(drawer).getByRole('link', { name: /Optimize All Academy/ });
    const creators = within(drawer).getByRole('link', { name: /Optimize All Creators/ });
    expect(academy).toHaveAttribute('href', '/learn');
    expect(creators).toHaveAttribute('href', '/creators');
    expect(academy.className).not.toMatch(/ui-button/);
    expect(creators.className).not.toMatch(/ui-button/);
  });

  it('mobile menu: a modal sheet that closes on Escape, the close button and a link, and is shown again on the next tap', async () => {
    const user = userEvent.setup();
    renderChrome('/');
    const open = screen.getByRole('button', { name: 'Open menu' });
    await user.click(open);
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(sheet).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(open).toHaveFocus();
    // Rendered once: closing hides the sheet instead of removing it.
    expect(document.querySelector('.site-sheet')).toHaveAttribute('hidden');

    await user.click(open);
    await user.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();

    await user.click(open);
    await user.click(within(screen.getByRole('navigation', { name: 'Mobile' })).getByRole('link', { name: /Optimize All Academy/ }));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('footer: no Academy column; a "More from Optimize All" group and one "Sign in" group labelled by audience', () => {
    renderChrome('/');
    const f = footer();
    const heading = (name: string) => within(f).getByRole('heading', { name });
    expect(within(f).queryByRole('heading', { name: 'Academy' })).not.toBeInTheDocument();
    const more = heading('More from Optimize All').parentElement!;
    expect(within(more).getByRole('link', { name: 'Optimize All Academy' })).toHaveAttribute('href', '/learn');
    expect(within(more).getByRole('link', { name: 'Optimize All Creators' })).toHaveAttribute('href', '/creators');
    const signIn = heading('Sign in').parentElement!;
    expect(within(signIn).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Client login', '/login'],
      ['Creator sign in', '/login?audience=creator'],
      ['Academy sign in', '/login?audience=learner'],
    ]);
    expect(within(f).queryByText(/Learning paths|Certificates/)).not.toBeInTheDocument();
  });

  it('shows the announcement bar only on the agency site', async () => {
    const withBar: PublicSite = { ...bare, announcement: { enabled: true, text: 'Audits are open.', linkLabel: null, linkUrl: null } };
    const { unmount } = renderChrome('/services', withBar);
    expect(await screen.findByText('Audits are open.')).toBeInTheDocument();
    unmount();
    renderChrome('/learn', withBar);
    await waitFor(() => expect(screen.getByRole('banner')).toBeInTheDocument());
    expect(screen.queryByText('Audits are open.')).not.toBeInTheDocument();
  });
});

describe('academy chrome', () => {
  it.each(['/learn', '/learn/paths', '/learn/seo-basics', '/verify', '/verify/certificates/abc', '/academy'])('%s uses the academy header and footer', (route) => {
    renderChrome(route);
    const h = header();
    expect(within(h).getByRole('link', { name: 'Optimize All Academy home' })).toHaveAttribute('href', '/learn');
    expect(within(h).getByText('Academy')).toBeInTheDocument();
    const nav = within(h).getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Courses', '/learn'],
      ['Learning paths', '/learn/paths'],
      ['Certificates', '/learn#certificates'],
      ['Verify a certificate', '/verify'],
    ]);
    // A single call to action, a way back to the agency and Sign in; no agency menu.
    expect(buttons(h, 'highlight')).toHaveLength(1);
    expect(within(h).getByRole('link', { name: 'Start learning free' })).toHaveAttribute('href', '/learn');
    expect(within(h).getByRole('link', { name: 'Optimize All' })).toHaveAttribute('href', '/');
    expect(within(h).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(within(h).queryByRole('button', { name: 'Services' })).not.toBeInTheDocument();
    expect(within(h).queryByRole('link', { name: 'Book a consultation' })).not.toBeInTheDocument();

    const f = footer();
    expect(within(f).getByText(/Optimize All Academy is run by Optimize All, a marketing agency\./)).toBeInTheDocument();
    expect(within(f).getByRole('link', { name: /Work with us/ })).toHaveAttribute('href', '/services');
    for (const label of ['Courses', 'Learning paths', 'Certificates', 'Verify a certificate', 'Privacy policy'])
      expect(within(f).getByRole('link', { name: label })).toBeInTheDocument();
    // No agency service columns, newsletter or sign-in group.
    expect(within(f).queryByRole('heading', { name: /Services|Company|Sign in/ })).not.toBeInTheDocument();
    expect(within(f).queryByRole('link', { name: 'Case studies' })).not.toBeInTheDocument();
  });

  it('links a signed-out visitor to Sign in and keeps one primary call to action in the mobile drawer', async () => {
    const user = userEvent.setup();
    renderChrome('/learn');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = await screen.findByRole('navigation', { name: 'Mobile' });
    expect(drawer.querySelectorAll('.ui-button')).toHaveLength(2);
    expect(buttons(drawer, 'highlight')).toHaveLength(1);
    expect(within(drawer).getByRole('link', { name: 'Start learning free' })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /← Optimize All/ })).toHaveAttribute('href', '/');
  });
});

describe('creators chrome', () => {
  it.each(['/creators', '/creators/faq', '/join/Ab12Cd34', '/c/spring-launch', '/faq'])('%s uses the creators header and footer', (route) => {
    renderChrome(route);
    const h = header();
    expect(within(h).getByRole('link', { name: 'Optimize All Creators home' })).toHaveAttribute('href', '/creators');
    expect(within(h).getByText('Creators')).toBeInTheDocument();
    const nav = within(h).getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/creators#how-it-works');
    expect(within(nav).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/creators/faq');
    expect(buttons(h, 'highlight')).toHaveLength(1);
    expect(within(h).getByRole('link', { name: 'Create a creator account' })).toHaveAttribute('href', '/register?audience=creator');
    expect(within(h).getByRole('link', { name: 'Optimize All' })).toHaveAttribute('href', '/');
    expect(within(h).queryByRole('button', { name: 'Services' })).not.toBeInTheDocument();
    expect(within(footer()).getByText(/Optimize All Creators is run by Optimize All, a marketing agency\./)).toBeInTheDocument();
    expect(within(footer()).queryByRole('heading', { name: /Services|Company/ })).not.toBeInTheDocument();
  });
});

describe('landmarks and accessibility', () => {
  it.each(['/', '/learn', '/creators'])('%s: skip link, one banner, one main and one contentinfo, no axe violations', async (route) => {
    const { container } = renderChrome(route);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // Focus order inside the header: brand, then the navigation, then the actions.
    const links = within(header()).getAllByRole('link', { hidden: false });
    expect(links[0]).toHaveAttribute('aria-label', expect.stringContaining('Optimize All'));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('retired addresses and the new routes', () => {
  const redirect = (path: string) => publicRoutes.find((r) => r.path === path)!;

  it('/academy redirects to /learn and /faq to /creators/faq, keeping the query and the anchor', async () => {
    mockFetch({ 'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired') });
    const academy = renderWithApp(<p>unused</p>, {
      route: '/academy?utm_source=mail#certificates',
      path: '/__unused',
      withAuth: false,
      routes: [{ path: '/academy', element: redirect('academy').element }, { path: '/learn', element: <p>Learn hub</p> }],
    });
    expect(await screen.findByText('Learn hub')).toBeInTheDocument();
    expect(academy.router.state.location.pathname).toBe('/learn');
    expect(academy.router.state.location.search).toBe('?utm_source=mail');
    expect(academy.router.state.location.hash).toBe('#certificates');
    expect(academy.router.state.historyAction).toBe('REPLACE');
    academy.unmount();

    const faq = renderWithApp(<p>unused</p>, {
      route: '/faq',
      path: '/__unused',
      withAuth: false,
      routes: [{ path: '/faq', element: redirect('faq').element }, { path: '/creators/faq', element: <p>Creator FAQ</p> }],
    });
    expect(await screen.findByText('Creator FAQ')).toBeInTheDocument();
    expect(faq.router.state.location.pathname).toBe('/creators/faq');
  });

  it('keeps /creators, /creators/faq, /join/:code, /c/:slug and /verify as real routes', () => {
    for (const path of ['/creators', '/creators/faq', '/join/Ab12Cd34', '/c/spring-launch', '/verify', '/verify/certificates/abc', '/learn', '/learn/paths']) {
      const matches = matchRoutes(routes, path);
      expect(matches, path).not.toBeNull();
      expect(matches![matches!.length - 1].route.path, `${path} falls through to NotFound`).not.toBe('*');
    }
  });
});

describe('Breadcrumbs', () => {
  const trail = (route: string, items: { label: string; to?: string }[], section?: 'agency' | 'academy' | 'creators') => {
    mockFetch({ 'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired') });
    renderWithApp(<Breadcrumbs items={items} section={section} />, { route, withAuth: false });
    return within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
  };

  it('agency pages keep their Home crumb', () => {
    const nav = trail('/services/seo', [{ label: 'Home', to: '/' }, { label: 'Services', to: '/services' }, { label: 'SEO' }]);
    expect(nav.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Home', 'Services', 'SEO']);
    expect(nav.getByText('SEO')).toHaveAttribute('aria-current', 'page');
  });

  it('academy pages are rooted at Academy → /learn with no Home crumb, whether or not the caller passes Home', () => {
    const items = [{ label: 'Learning paths', to: '/learn/paths' }, { label: 'AI practitioner' }];
    const nav = trail('/learn/paths/ai', items);
    expect(nav.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Academy', 'Learning paths', 'AI practitioner']);
    expect(nav.getByRole('link', { name: 'Academy' })).toHaveAttribute('href', '/learn');
  });

  it('drops a leading Home and does not double the root', () => {
    const nav = trail('/learn/seo-basics', [{ label: 'Home', to: '/' }, { label: 'Academy', to: '/learn' }, { label: 'SEO Basics' }]);
    expect(nav.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Academy', 'SEO Basics']);
  });

  it('an explicit section wins over the route', () => {
    const nav = trail('/', [{ label: 'FAQ' }], 'creators');
    expect(nav.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Creators', 'FAQ']);
    expect(nav.getByRole('link', { name: 'Creators' })).toHaveAttribute('href', '/creators');
  });
});

describe('Verify a certificate (/verify)', () => {
  it('extracts the id from a pasted link or a bare id', () => {
    expect(certificateIdFrom('  abc-123 ')).toBe('abc-123');
    expect(certificateIdFrom('https://www.optimizeall.com/verify/certificates/abc-123?utm=x')).toBe('abc-123');
    expect(certificateIdFrom('/verify/certificates/abc-123')).toBe('abc-123');
    expect(certificateIdFrom('   ')).toBe('');
  });

  it('asks for an id, then opens the verification page', async () => {
    const user = userEvent.setup();
    mockFetch({ 'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired') });
    const { router } = renderWithApp(<VerifyIndexPage />, { route: '/verify', path: '/verify', withAuth: false });
    expect(screen.getByRole('heading', { level: 1, name: 'Verify a certificate' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verify certificate' }));
    expect(await screen.findByText(/Enter the certificate/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Credential ID or verification link'), 'https://x.test/verify/certificates/cert-9');
    await user.click(screen.getByRole('button', { name: 'Verify certificate' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/verify/certificates/cert-9'));
  });
});
