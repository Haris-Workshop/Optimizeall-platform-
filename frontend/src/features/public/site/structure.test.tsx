import { screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Outlet } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { json, mockFetch, problem } from '@/test/fetchMock';
import { renderWithApp } from '@/test/render';
import { LandingPage } from '../LandingPage';
import { HomePage } from '../pages/HomePage';
import * as fx from '../testFixtures';
import type { PublicSite } from './api';
import { CREATORS_SECTIONS, HOME_SECTIONS, mergeSections } from './layout';
import { SiteChrome } from './SiteChrome';

/** Site settings driven structure: page layout, CTA links, product chrome, footer groups, brand assets. */

function render(page: ReactElement, { route = '/', site = fx.site, copy = {} as Record<string, string> } = {}) {
  mockFetch({
    'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired'),
    'GET /public/site': () => json(200, site),
    'GET /public/home': () => json(200, fx.home),
    'GET /public/services': () => json(200, fx.serviceGroups),
    'GET /content/copy': () => json(200, { values: copy, updatedAt: null }),
  });
  return renderWithApp(<p>unused</p>, {
    route,
    path: '/__unused',
    routes: [{ element: <SiteChrome><Outlet /></SiteChrome>, children: [{ path: route, element: page }] }],
  });
}

const h2s = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('page layout', () => {
  it('merges stored sections with the catalog (unknown and repeated keys dropped, new ones appended)', () => {
    const merged = mergeSections(
      [
        { key: 'cta', visible: false },
        { key: 'nope', visible: true },
        { key: 'cta', visible: true },
      ],
      HOME_SECTIONS,
    );
    expect(merged[0]).toEqual({ key: 'cta', visible: false });
    expect(merged.map((s) => s.key)).toEqual(['cta', ...HOME_SECTIONS.filter((k) => k !== 'cta')]);
  });

  it('home: hides and reorders sections and follows the edited button links', async () => {
    const home = [
      { key: 'newsletter', visible: true },
      { key: 'process', visible: false },
      ...HOME_SECTIONS.filter((k) => k !== 'newsletter' && k !== 'process').map((key) => ({ key, visible: true })),
    ];
    render(<HomePage />, {
      site: { ...fx.site, layouts: { home, creators: CREATORS_SECTIONS.map((key) => ({ key, visible: true })) } },
      copy: { 'home.hero.primaryCtaUrl': '/contact', 'home.process.title': 'Our process' },
    });
    // The settings and the page texts arrive after the first render (which uses the shipped defaults).
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Book a consultation/ }).map((l) => l.getAttribute('href'))).toContain('/contact'));
    await waitFor(() => expect(h2s()).not.toContain('A process built for accountability'));
    const titles = h2s();
    expect(titles).not.toContain('Our process');
    // The newsletter now comes before the services section.
    const newsletter = titles.indexOf('Get marketing insights in your inbox');
    const services = titles.indexOf('Every channel, one accountable team');
    expect(newsletter).toBeGreaterThanOrEqual(0);
    expect(services).toBeGreaterThan(newsletter);
  });

  it('creators: hidden sections leave the page', async () => {
    render(<LandingPage />, {
      route: '/creators',
      site: {
        ...fx.site,
        layouts: { home: HOME_SECTIONS.map((key) => ({ key, visible: true })), creators: [{ key: 'faq', visible: false }] },
      },
    });
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(document.getElementById('faq-title')).toBeNull());
    expect(document.getElementById('how-it-works')).not.toBeNull();
  });
});

describe('chrome from site settings', () => {
  const custom: PublicSite = {
    ...fx.site,
    header: { ...fx.site.header, secondaryLink: { label: 'Free courses', url: '/learn/paths' } },
    footer: {
      ...fx.site.footer,
      productLinks: [{ label: 'Our academy', url: '/learn' }],
      signInLinks: [{ label: 'Customer portal', url: '/login' }],
    },
    brand: { logoUrl: '/api/v1/files/logo', logoDarkUrl: null, faviconUrl: '/api/v1/files/icon' },
    products: {
      academy: {
        nav: [{ label: 'All courses', url: '/learn' }],
        cta: { label: 'Join free', url: '/register?audience=learner' },
        footerLinks: [{ label: 'Paths', url: '/learn/paths' }],
        footerNote: 'Run by the agency.',
        footerNoteLink: null,
      },
      creators: {
        nav: [{ label: 'Steps', url: '/creators#how-it-works' }],
        cta: { label: 'Apply', url: '/register?audience=creator' },
        footerLinks: [],
        footerNote: null,
        footerNoteLink: null,
      },
    },
  };

  it('agency: quiet link, footer groups, uploaded logo and favicon', async () => {
    const { container } = render(<h1>Page</h1>, { site: custom });
    const banner = screen.getByRole('banner');
    expect(await within(banner).findByRole('link', { name: 'Free courses' })).toHaveAttribute('href', '/learn/paths');
    const foot = screen.getByRole('contentinfo');
    expect(within(foot).getByRole('link', { name: 'Our academy' })).toBeInTheDocument();
    expect(within(foot).getByRole('link', { name: 'Customer portal' })).toBeInTheDocument();
    expect(container.querySelector('img.site-brand-logo__img')).toHaveAttribute('src', '/api/v1/files/logo');
    await waitFor(() => expect(document.head.querySelector('link[rel="icon"][data-oa-brand]')).toHaveAttribute('href', '/api/v1/files/icon'));
  });

  it('academy: menu, button and footer note come from the settings', async () => {
    render(<h1>Learn</h1>, { route: '/learn', site: custom });
    const banner = screen.getByRole('banner');
    expect(await within(banner).findByRole('link', { name: 'All courses' })).toHaveAttribute('href', '/learn');
    expect(within(banner).getByRole('link', { name: 'Join free' })).toHaveAttribute('href', '/register?audience=learner');
    expect(within(banner).queryByRole('link', { name: 'Learning paths' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByText(/Run by the agency\./)).toBeInTheDocument();
  });
});
