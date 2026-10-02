import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CREATORS_SECTIONS, DEFAULT_PRODUCTS, HOME_SECTIONS } from '@/features/public/site/layout';
import { json, makeUser, mockFetch, session } from '@/test/fetchMock';
import { axeViolations, renderWithApp } from '@/test/render';
import type { SiteSettings } from '../api';
import { SiteSettingsPage } from './SettingsAdmin';

const staff = makeUser({ id: 'staff-1', roles: ['Admin'], permissions: ['site.manage'], displayName: 'Web Editor' });

const settings: SiteSettings = {
  siteName: 'Optimize All',
  tagline: 'Discover the world of solution',
  header: { menu: [], cta: { label: 'Book a consultation', url: '/book-a-consultation' }, secondaryLink: { label: 'Free Academy', url: '/learn' } },
  footer: { blurb: null, columns: [], legalLinks: [], productLinks: [{ label: 'Optimize All Academy', url: '/learn' }], signInLinks: [] },
  contact: { email: null, phone: null, whatsApp: null, address: null, hours: null },
  social: [],
  trustLogos: [],
  announcement: { enabled: false, text: null, linkLabel: null, linkUrl: null },
  seo: { siteUrl: null, titleTemplate: '%s | Optimize All', defaultTitle: 'Optimize All', defaultDescription: null, defaultOgImageUrl: null, twitterHandle: null },
  organization: { legalName: null, logoUrl: null, foundingYear: null, streetAddress: null, locality: null, region: null, postalCode: null, countryCode: null, areaServed: [] },
  analytics: { ga4MeasurementId: null, gtmContainerId: null, metaPixelId: null },
  homeStats: [],
  brand: { logoUrl: null, logoDarkUrl: null, faviconUrl: null },
  layouts: { home: HOME_SECTIONS.map((key) => ({ key, visible: true })), creators: CREATORS_SECTIONS.map((key) => ({ key, visible: true })) },
  products: DEFAULT_PRODUCTS,
};

describe('Site settings → structure', () => {
  it('reorders and hides home sections, edits the Academy menu and saves them with the settings', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'POST /auth/refresh': () => json(200, session(staff)),
      'GET /agency/website/settings': () => json(200, { settings, updatedAt: '2026-10-01T10:00:00Z', concurrencyStamp: 'stamp-1', defaults: settings }),
      'PUT /agency/website/settings': (req) => json(200, { ...(req.body as object), updatedAt: '2026-10-02T10:00:00Z', concurrencyStamp: 'stamp-2', defaults: settings }),
    });
    const { container } = renderWithApp(<SiteSettingsPage />, { route: '/agency/website/settings' });

    await user.click(await screen.findByRole('tab', { name: 'Page layout' }));
    const home = screen.getByRole('list', { name: 'Home page sections' });
    expect(await axeViolations(container)).toEqual([]);
    await user.click(within(home).getByRole('button', { name: 'Move Newsletter up' }));
    await user.click(within(home).getByRole('switch', { name: /Testimonials/ }));

    await user.click(screen.getByRole('tab', { name: 'Academy & Creators' }));
    const label = screen.getAllByLabelText(/^Label/)[0];
    await user.clear(label);
    await user.type(label, 'All courses');

    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Site settings saved');
    const body = calls.find((c) => c.method === 'PUT')?.body as { settings: SiteSettings; concurrencyStamp: string };
    expect(body.concurrencyStamp).toBe('stamp-1');
    const keys = body.settings.layouts!.home.map((s) => s.key);
    expect(keys.indexOf('newsletter')).toBe(keys.indexOf('cta') - 1);
    expect(body.settings.layouts!.home.find((s) => s.key === 'testimonials')?.visible).toBe(false);
    expect(body.settings.products!.academy.nav[0].label).toBe('All courses');
  });

  it('brand: shows the uploaders and the quiet header link', async () => {
    const user = userEvent.setup();
    mockFetch({
      'POST /auth/refresh': () => json(200, session(staff)),
      'GET /agency/website/settings': () => json(200, { settings, updatedAt: '2026-10-01T10:00:00Z', concurrencyStamp: 'stamp-1', defaults: settings }),
    });
    renderWithApp(<SiteSettingsPage />, { route: '/agency/website/settings' });
    await user.click(await screen.findByRole('tab', { name: 'Brand' }));
    expect(screen.getByLabelText(/^Browser icon \(favicon\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Navigation' }));
    expect(screen.getByRole('group', { name: 'Quiet link next to the button' })).toBeInTheDocument();
  });
});
