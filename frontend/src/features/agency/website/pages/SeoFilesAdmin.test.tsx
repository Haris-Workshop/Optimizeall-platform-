import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, makeUser, mockFetch, problem, session } from '@/test/fetchMock';
import { axeViolations, renderWithApp } from '@/test/render';
import { SeoAdminPage } from './SeoAdmin';
import type { SeoFiles, SitemapUrlRow } from './SeoFilesAdmin';

const staff = makeUser({
  id: 'staff-1',
  roles: ['Admin'],
  permissions: ['site.manage'],
  displayName: 'Web Editor',
});

const ROBOTS =
  '# robots.txt for https://www.optimizeall.com\nUser-agent: *\nAllow: /\n\nSitemap: https://www.optimizeall.com/sitemap.xml\n';

const files: SeoFiles = {
  robots: {
    extraRules: [],
    extraText: null,
    extraSitemaps: [],
    generated: ROBOTS,
    warnings: [],
    crawlerGroups: [
      {
        key: 'search',
        label: 'Search engines',
        description: '',
        allowedByDefault: true,
        allowed: true,
        userAgents: ['Googlebot'],
      },
      {
        key: 'scrapers',
        label: 'Aggressive scrapers',
        description: '',
        allowedByDefault: false,
        allowed: false,
        userAgents: ['Bytespider'],
      },
    ],
  },
  sitemap: {
    indexUrl: 'https://www.optimizeall.com/sitemap.xml',
    groups: [
      {
        name: 'pages',
        label: 'Pages (built-in, CMS and industry pages)',
        kind: 'urls',
        excluded: false,
        urlCount: 20,
        hiddenCount: 1,
        lastModified: '2026-09-30T10:00:00Z',
        defaults: null,
        files: [
          {
            name: 'pages',
            url: 'https://www.optimizeall.com/sitemaps/pages.xml',
            urlCount: 20,
            lastModified: null,
          },
        ],
      },
      {
        name: 'careers',
        label: 'Open jobs',
        kind: 'urls',
        excluded: false,
        urlCount: 2,
        hiddenCount: 0,
        lastModified: null,
        defaults: null,
        files: [
          {
            name: 'careers',
            url: 'https://www.optimizeall.com/sitemaps/careers.xml',
            urlCount: 2,
            lastModified: null,
          },
        ],
      },
    ],
    excludedGroups: [],
    excludedPaths: [],
    extraPaths: [],
    groupDefaults: {},
    listedUrls: 22,
    hiddenUrls: 1,
    generatedAt: '2026-10-02T10:00:00Z',
    lastModified: '2026-09-30T10:00:00Z',
    changeFrequencies: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'],
    indexNowEnabled: false,
  },
  llms: {
    enabled: true,
    summary: null,
    intro: null,
    defaultSummary: 'A digital marketing agency.',
    defaultIntro: 'Optimize All is a digital marketing agency.',
    sections: [
      { key: 'keyPages', label: 'Key pages', included: true },
      { key: 'services', label: 'Services', included: true },
    ],
    customSections: [],
    academyGuideEnabled: true,
  },
  siteUrl: 'https://www.optimizeall.com',
  updatedAt: '2026-10-01T10:00:00Z',
  concurrencyStamp: 'stamp-1',
};

const rows: SitemapUrlRow[] = [
  {
    path: '/about',
    url: 'https://www.optimizeall.com/about',
    group: 'pages',
    title: 'About',
    lastModified: null,
    hiddenBy: null,
    extra: false,
  },
  {
    path: '/services/seo',
    url: 'https://www.optimizeall.com/services/seo',
    group: 'services',
    title: 'SEO',
    lastModified: null,
    hiddenBy: 'page',
    extra: false,
  },
];

describe('Website → SEO → files', () => {
  it('previews robots.txt additions and asks before saving a rule that closes the site', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'POST /auth/refresh': () => json(200, session(staff)),
      'GET /agency/website/seo/files': () => json(200, files),
      'POST /agency/website/seo/files/robots/preview': (req) => {
        const rules = ((req.body as { extraRules?: string[] }).extraRules ?? []) as string[];
        return json(200, {
          text: ROBOTS + rules.join('\n'),
          warnings: rules.includes('Disallow: /')
            ? [{ code: 'disallowAll', message: "'Disallow: /' closes the whole site." }]
            : [],
          errors: {},
        });
      },
      'PUT /agency/website/seo/files/robots': (req) =>
        (req.body as { confirmDisallowAll: boolean }).confirmDisallowAll
          ? json(200, { ...files, concurrencyStamp: 'stamp-2' })
          : problem(400, 'seo.confirm_disallow_all', 'Confirm to save it.'),
    });
    const { container } = renderWithApp(<SeoAdminPage />, { route: '/agency/website/seo?tab=robots' });
    const rules = await screen.findByLabelText(/Rules for every crawler/);
    expect(await screen.findByLabelText('robots.txt preview')).toHaveTextContent('User-agent: *');
    expect(await axeViolations(container)).toEqual([]);

    await user.type(rules, 'Disallow: /');
    await waitFor(() => expect(screen.getByLabelText('robots.txt preview')).toHaveTextContent('Disallow: /'));
    expect(await screen.findByText('This closes the whole site')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save robots.txt' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Close the site to crawlers?' });
    const confirm = within(dialog).getByRole('button', { name: 'Save anyway' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'CLOSE SITE');
    await user.click(confirm);
    await screen.findByText('robots.txt saved');
    const puts = calls.filter((c) => c.method === 'PUT' && c.path === '/agency/website/seo/files/robots');
    expect(puts.at(-1)?.body).toMatchObject({
      extraRules: ['Disallow: /'],
      confirmDisallowAll: true,
      concurrencyStamp: 'stamp-1',
    });
  });

  it('shows the sitemap groups, leaves a group out and excludes one address', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'POST /auth/refresh': () => json(200, session(staff)),
      'GET /agency/website/seo/files': () => json(200, files),
      'GET /agency/website/seo/files/sitemap/urls': () => json(200, { rows, total: 2, truncated: false }),
      'POST /agency/website/seo/files/sitemap/urls': () =>
        json(200, { ...files, concurrencyStamp: 'stamp-2' }),
      'PUT /agency/website/seo/files/sitemap': () => json(200, { ...files, concurrencyStamp: 'stamp-3' }),
    });
    renderWithApp(<SeoAdminPage />, { route: '/agency/website/seo?tab=sitemaps' });
    expect(await screen.findByText('Submitting the sitemap')).toBeInTheDocument();
    const urlTable = await screen.findByRole('table', { name: 'Public addresses in the sitemaps' });
    expect(await within(urlTable).findByText('Hidden by the page’s setting')).toBeInTheDocument();
    await user.click(within(urlTable).getByRole('button', { name: 'Exclude /about' }));
    await screen.findByText('Address left out of the sitemap');
    expect(
      calls.find((c) => c.method === 'POST' && c.path === '/agency/website/seo/files/sitemap/urls')?.body,
    ).toEqual({
      path: '/about',
      excluded: true,
      concurrencyStamp: 'stamp-1',
    });

    await user.click(screen.getByRole('switch', { name: 'List Open jobs in sitemap.xml' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Change frequency of Open jobs' }),
      'weekly',
    );
    await user.click(screen.getByRole('button', { name: 'Save sitemap settings' }));
    await screen.findByText('Sitemap settings saved');
    expect(
      calls.find((c) => c.method === 'PUT' && c.path === '/agency/website/seo/files/sitemap')?.body,
    ).toMatchObject({
      excludedGroups: ['careers'],
      groupDefaults: { careers: { changeFrequency: 'weekly', priority: null } },
    });
  });

  it('edits llms.txt: introduction, sections and the academy guide', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'POST /auth/refresh': () => json(200, session(staff)),
      'GET /agency/website/seo/files': () => json(200, files),
      'GET /agency/website/seo/files/llms/preview': () =>
        new Response('# Optimize All\n\n> A digital marketing agency.\n', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      'PUT /agency/website/seo/files/llms': () => json(200, { ...files, concurrencyStamp: 'stamp-2' }),
    });
    renderWithApp(<SeoAdminPage />, { route: '/agency/website/seo?tab=llms' });
    expect(await screen.findByLabelText('llms.txt preview')).toHaveTextContent('# Optimize All');
    await user.click(screen.getByRole('button', { name: 'Start from the generated text' }));
    expect(screen.getByLabelText(/Introduction/)).toHaveValue('Optimize All is a digital marketing agency.');
    await user.click(screen.getByRole('checkbox', { name: 'Services' }));
    await user.click(screen.getByRole('switch', { name: /academy guide/ }));
    await user.click(screen.getByRole('button', { name: 'Add a section' }));
    await user.type(screen.getByLabelText(/Heading/), 'Pricing notes');
    await user.type(screen.getByLabelText(/Text \(Markdown\)/), 'Prices exclude VAT.');
    await user.click(screen.getByRole('button', { name: 'Save llms.txt' }));
    await screen.findByText('llms.txt saved');
    expect(
      calls.find((c) => c.method === 'PUT' && c.path === '/agency/website/seo/files/llms')?.body,
    ).toEqual({
      summary: null,
      intro: 'Optimize All is a digital marketing agency.',
      excludedSections: ['services'],
      customSections: [{ title: 'Pricing notes', body: 'Prices exclude VAT.' }],
      academyGuideEnabled: false,
      concurrencyStamp: 'stamp-1',
    });
  });
});
