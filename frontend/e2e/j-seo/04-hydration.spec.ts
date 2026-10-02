import { expect, test, type Page } from '@playwright/test';
import { parseHead, PUBLIC_PAGES, SSR } from './support/seo';

/**
 * The React app takes over the server-rendered page: public website pages arrive as the designed page rendered by the
 * app on the server, which the browser hydrates in place (no second render, no flash, no hydration mismatch); the head keeps exactly one title/description/canonical/robots and never duplicates
 * JSON-LD, the server's values match what the app writes, and client-side navigation replaces the page's metadata.
 */
async function headCounts(page: Page) {
  return page.evaluate(() => ({
    description: document.head.querySelectorAll('meta[name="description"]').length,
    canonical: document.head.querySelectorAll('link[rel="canonical"]').length,
    robots: document.head.querySelectorAll('meta[name="robots"]').length,
    ogTitle: document.head.querySelectorAll('meta[property="og:title"]').length,
    titles: document.head.querySelectorAll('title').length,
    jsonLdTypes: Array.from(document.head.querySelectorAll('script[type="application/ld+json"]')).map(
      (s) => (JSON.parse(s.textContent ?? '{}') as { '@type': string })['@type'],
    ),
    ssr: document.querySelectorAll('#oa-ssr').length,
    canonicalHref: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    description0: document.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
  }));
}

test.describe('the app boots over the server-rendered HTML', () => {
  for (const path of ['/', '/services/seo', '/pricing', '/about', '/blog']) {
    test(`${path}: no duplicate head tags, server and app agree`, async ({ page, request }) => {
      const server = parseHead(await (await request.get(path)).text());
      const errors: string[] = [];
      // No console errors at all: an anonymous visitor (no session hint cookie, src/lib/auth/sessionHint.ts) does not
      // even probe POST /auth/refresh, so there is no expected 401 either.
      const refreshes: string[] = [];
      page.on('request', (r) => {
        if (r.url().endsWith('/api/v1/auth/refresh')) refreshes.push(r.url());
      });
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // Give the head manager its data (site settings, page payload).
      await expect.poll(async () => (await headCounts(page)).ssr).toBe(0);
      await expect.poll(async () => page.title()).toBe(server.title!.replace(/&amp;/g, '&'));
      const counts = await headCounts(page);
      expect(counts).toMatchObject({ description: 1, canonical: 1, robots: 1, ogTitle: 1, titles: 1 });
      expect(new Set(counts.jsonLdTypes).size, `duplicate JSON-LD: ${counts.jsonLdTypes.join(', ')}`).toBe(
        counts.jsonLdTypes.length,
      );
      expect(counts.jsonLdTypes.length).toBe(server.jsonLdCount);
      expect(counts.canonicalHref).toBe(server.canonical);
      expect(counts.description0).toBe(server.description!.replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
      expect(errors, errors.join('\n')).toEqual([]);
      expect(refreshes, 'anonymous visitors do not probe the session').toEqual([]);
    });
  }

  test('client-side navigation replaces the title, canonical and structured data', async ({ page }) => {
    await page.goto('/services/seo');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(async () => (await headCounts(page)).jsonLdTypes).toContain('Service');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Case studies', exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/case-studies$/);
    await expect.poll(() => page.title()).toBe('Case Studies: Measured Marketing Results | Optimize All');
    await expect.poll(async () => (await headCounts(page)).canonicalHref).toMatch(/\/case-studies$/);
    const counts = await headCounts(page);
    expect(counts.jsonLdTypes).not.toContain('Service');
    expect(counts).toMatchObject({ description: 1, canonical: 1, robots: 1 });
  });

  test('the designed page is on screen before any JavaScript, and the app hydrates it in place', async ({ page }) => {
    test.skip(!SSR, 'server rendering is off (E2E_SSR=0)');
    // Hold back the app bundle: what is on screen is the server's HTML alone.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/index-[^/]+\.js$|\/src\/main\.tsx$/, async (route) => {
      await held;
      await route.continue();
    });
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    // Module scripts are deferred, so DOMContentLoaded waits for the held bundle: wait for the response only.
    await page.goto('/services', { waitUntil: 'commit' });
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(page.locator('#root[data-oa-hydrate] main#main')).toBeVisible();
    await expect(page.locator('#oa-ssr')).toHaveCount(0);
    await page.evaluate(() => ((window as unknown as { __h1: Element | null }).__h1 = document.querySelector('h1')));
    release();
    // Hydrated in place: the server's elements were kept, not re-created.
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => page.evaluate(() => document.querySelector('h1') === (window as unknown as { __h1: Element | null }).__h1))
      .toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  for (const path of [...PUBLIC_PAGES, '/learn/paths']) {
    test(`${path}: hydrates without mismatches`, async ({ page }) => {
      test.skip(!SSR, 'server rendering is off (E2E_SSR=0)');
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || /hydrat/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        new MutationObserver((_, observer) => {
          const h1 = document.querySelector('#root h1');
          if (!h1) return;
          (window as unknown as { __h1: Element }).__h1 = h1;
          observer.disconnect();
        }).observe(document, { childList: true, subtree: true });
      });
      await page.goto(path);
      await expect(page.locator('#root[data-oa-hydrate]')).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      // A mismatch makes React throw the server's markup away and render again: the h1 would be a new element.
      expect(await page.evaluate(() => document.querySelector('#root h1') === (window as unknown as { __h1?: Element }).__h1)).toBe(true);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
});
