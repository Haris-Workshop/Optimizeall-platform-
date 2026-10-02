import { expect, test } from '@playwright/test';
import { ApiSession } from '../journeys/support/api';
import { BASE, locs, SSR } from './support/seo';

/**
 * What editors change in Agency → Website → SEO (robots.txt, Sitemaps, llms.txt) and Site settings (page layout) is what
 * crawlers get from the web server at once: robots.txt additions, a sitemap exclusion (also gone from llms.txt), an
 * llms.txt section and the academy guide switch, the home sections' order and an edited button link in the
 * server-rendered HTML — which the app then hydrates without errors. Everything is restored afterwards.
 */

const ADMIN = { email: 'admin@demo.optimizeall.app', password: 'Demo#2026!pass' };
const FILES = '/agency/website/seo/files';

interface Files {
  concurrencyStamp: string;
}

interface SettingsEnvelope {
  settings: Record<string, unknown> & {
    layouts: { home: { key: string; visible: boolean }[]; creators: unknown[] };
  };
  concurrencyStamp: string;
}

interface CopyCatalog {
  groups: { entries: { key: string; concurrencyStamp: string | null }[] }[];
}

test.describe.serial('editable discovery files and page structure', () => {
  let admin: ApiSession;
  const id = `e2e${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    admin = await ApiSession.login(ADMIN.email, ADMIN.password);
  });

  test('robots.txt additions are served at once and removed again', async ({ request }) => {
    let files = await admin.get<Files>(FILES);
    files = await admin.put<Files>(`${FILES}/robots`, {
      extraRules: [`Disallow: /drafts-${id}/`],
      extraText: `# Partner crawler\nUser-agent: ExampleBot-${id}\nDisallow: /private/`,
      extraSitemaps: ['https://cdn.example.com/sitemap.xml'],
      concurrencyStamp: files.concurrencyStamp,
    });
    try {
      const robots = await (await request.get('/robots.txt')).text();
      expect(robots).toContain(`Disallow: /drafts-${id}/\n`);
      expect(robots).toContain(`User-agent: ExampleBot-${id}\nDisallow: /private/\n`);
      expect(robots).toContain('Sitemap: https://cdn.example.com/sitemap.xml\n');
      // The generated private-area rules are untouched.
      expect(robots).toContain('Disallow: /api/\n');
    } finally {
      await admin.put(`${FILES}/robots`, { concurrencyStamp: files.concurrencyStamp });
    }
    expect(await (await request.get('/robots.txt')).text()).not.toContain(id);
  });

  test('an excluded address leaves the sitemap and llms.txt; included again it comes back', async ({
    request,
  }) => {
    const files = await admin.get<Files>(FILES);
    const pages = async () => locs(await (await request.get('/sitemaps/pages.xml')).text());
    expect(await pages()).toContain(`${BASE}/team`);
    const after = await admin.post<Files>(`${FILES}/sitemap/urls`, {
      path: '/team',
      excluded: true,
      concurrencyStamp: files.concurrencyStamp,
    });
    try {
      expect(await pages()).not.toContain(`${BASE}/team`);
      expect(await (await request.get('/llms.txt')).text()).not.toContain('/team.md)');
      // The page itself stays public and indexable.
      expect((await request.get('/team')).status()).toBe(200);
    } finally {
      await admin.post<Files>(`${FILES}/sitemap/urls`, {
        path: '/team',
        excluded: false,
        concurrencyStamp: after.concurrencyStamp,
      });
    }
    expect(await pages()).toContain(`${BASE}/team`);
  });

  test('llms.txt: a custom section and the academy guide switch', async ({ request }) => {
    const files = await admin.get<Files>(FILES);
    const saved = await admin.put<Files>(`${FILES}/llms`, {
      customSections: [
        { title: `Working with us ${id}`, body: 'Every engagement starts with a free audit.' },
      ],
      academyGuideEnabled: false,
      concurrencyStamp: files.concurrencyStamp,
    });
    try {
      const llms = await (await request.get('/llms.txt')).text();
      expect(llms).toContain(`## Working with us ${id}\n\nEvery engagement starts with a free audit.\n`);
      expect(llms).not.toContain('/llms/academy.txt');
      expect((await request.get('/llms/academy.txt')).status()).toBe(404);
    } finally {
      await admin.put(`${FILES}/llms`, { concurrencyStamp: saved.concurrencyStamp });
    }
    expect((await request.get('/llms/academy.txt')).status()).toBe(200);
  });

  test('home layout and an edited button link reach the server-rendered page, which hydrates cleanly', async ({
    page,
    request,
  }) => {
    const current = await admin.get<SettingsEnvelope>('/agency/website/settings');
    const original = current.settings;
    const home = [
      { key: 'newsletter', visible: true },
      ...original.layouts.home.filter((s) => s.key !== 'newsletter'),
    ].map((s) => (s.key === 'testimonials' ? { ...s, visible: false } : s));
    await admin.put<SettingsEnvelope>('/agency/website/settings', {
      settings: { ...original, layouts: { ...original.layouts, home } },
      concurrencyStamp: current.concurrencyStamp,
    });
    await admin.put('/agency/website/copy', {
      changes: [{ key: 'home.hero.primaryCtaUrl', value: '/contact', concurrencyStamp: null }],
    });
    try {
      const html = await (await request.get('/')).text();
      const newsletter = html.indexOf('Get marketing insights in your inbox');
      const services = html.indexOf('Every channel, one accountable team');
      expect(newsletter).toBeGreaterThan(0);
      expect(newsletter).toBeLessThan(services);
      expect(html).toContain('href="/contact"');
      if (SSR) expect(html).toContain('class="oa-h-newsletter');

      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/');
      await expect(page.locator('html[data-app-ready]')).toHaveCount(1, { timeout: 30_000 });
      const titles = await page.getByRole('heading', { level: 2 }).allTextContents();
      expect(titles.indexOf('Get marketing insights in your inbox')).toBeLessThan(
        titles.indexOf('Every channel, one accountable team'),
      );
      await expect(
        page
          .getByRole('main')
          .getByRole('link', { name: /Book a consultation/ })
          .first(),
      ).toHaveAttribute('href', '/contact');
      expect(errors, 'no hydration or console errors').toEqual([]);
    } finally {
      const now = await admin.get<SettingsEnvelope>('/agency/website/settings');
      await admin.put('/agency/website/settings', {
        settings: original,
        concurrencyStamp: now.concurrencyStamp,
      });
      const copy = await admin.get<CopyCatalog>('/agency/website/copy');
      const entry = copy.groups.flatMap((g) => g.entries).find((e) => e.key === 'home.hero.primaryCtaUrl')!;
      await admin.put('/agency/website/copy', {
        changes: [{ key: entry.key, value: null, concurrencyStamp: entry.concurrencyStamp }],
      });
    }
    expect(await (await request.get('/')).text()).toContain('href="/book-a-consultation"');
  });
});
