import { expect, test, type Locator, type Page } from '@playwright/test';
import { watchErrors } from '../agency/support/agency';

/**
 * The premium sponsored placements and the sharing around them (Baseline + Demo seed): the home band (the home page's one
 * hero-size placement), the article end card ("Project controls toolkit" / "Study kit"), the slim bars on the blog hub and
 * the services overview, the academy hub's hero card; on every one the visible disclosure and sponsored, tracked links.
 * Then the share links (UTM-tagged canonical page, copy link, tell a colleague), the generated partner share image and the
 * /go/… short links that count a click and redirect with UTM tags.
 */

async function expectDisclosedAndSponsored(unit: Locator, partnerNames: string) {
  await expect(unit.getByText('Sponsored', { exact: true }).first()).toBeVisible();
  await expect(unit).toContainText(`Optimize All is the official marketing partner of ${partnerNames}`);
  const links = unit.locator('a[href*="/api/v1/public/partners/"][href*="/visit"]');
  expect(await links.count(), 'at least one outbound partner link').toBeGreaterThan(0);
  for (let i = 0; i < (await links.count()); i++) {
    await expect(links.nth(i)).toHaveAttribute('rel', 'sponsored noopener');
    await expect(links.nth(i)).toHaveAttribute('target', '_blank');
  }
}

/** Scrolls to a below-the-fold placement: it asks the API only when about to be seen. */
async function reveal(page: Page, selector: string): Promise<Locator> {
  const unit = page.locator(selector).first();
  await unit.scrollIntoViewIfNeeded();
  await expect(unit).toBeVisible();
  return unit;
}

test('the home page shows one premium partner band with both partners, disclosed and sponsored', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const band = page.getByRole('region', { name: 'Resources from our partners' });
  await band.scrollIntoViewIfNeeded();
  await expect(band).toBeVisible();
  await expect(band.getByRole('article')).toHaveCount(2);
  await expect(band.getByText('Project controls toolkit')).toBeVisible();
  await expect(band.getByText('Study kit')).toBeVisible();
  await expectDisclosedAndSponsored(band, 'PCI AI and Certuvo');
  await expect(band.getByRole('link', { name: /Explore PCI AI certifications/ })).toHaveAttribute(
    'href',
    '/api/v1/public/partners/pci-ai/visit?slot=home.band&path=%2F',
  );
  // One hero-size placement on the page, and no inline styles in the cards (strict CSP).
  await expect(page.locator('[data-variant="hero"]')).toHaveCount(2); // the band's two cards
  await expect(page.locator('[data-partner-slot="learn.hub"]')).toHaveCount(0);
  expect(await band.locator('[style]').count()).toBe(0);
  errors.expectClean('home band');
});

test('the article end card is the resource card; the blog hub and the services overview carry a slim bar', async ({ page }) => {
  const errors = watchErrors(page);
  const blog = await (await page.request.get('/api/v1/public/blog')).json();
  await page.goto(`/blog/${blog.items[0].slug}`);
  const end = await reveal(page, '[data-partner-slot="blog.end"]');
  await expect(end).toHaveAttribute('data-variant', 'kit');
  await expectDisclosedAndSponsored(end, '');
  await expect(end.getByRole('group', { name: /^Share / })).toBeVisible();

  await page.goto('/blog');
  const bar = await reveal(page, '[data-partner-slot="blog.index"]');
  await expect(bar).toHaveAttribute('data-variant', 'bar');
  await expectDisclosedAndSponsored(bar, '');

  await page.goto('/services');
  const services = await reveal(page, '[data-partner-slot="services.index"]');
  await expect(services).toHaveAttribute('data-variant', 'bar');
  await expectDisclosedAndSponsored(services, '');
  errors.expectClean('end card and bars');
});

test('the academy hub has one hero card', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/learn');
  const hero = await reveal(page, '[data-partner-slot="learn.hub"]');
  await expect(hero).toHaveAttribute('data-variant', 'hero');
  await expectDisclosedAndSponsored(hero, '');
  await expect(page.locator('[data-variant="hero"]')).toHaveCount(1);
  errors.expectClean('academy hub');
});

test('partner pages share a UTM-tagged canonical link: networks, tell a colleague, copy link', async ({ page, context }) => {
  const errors = watchErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/partners/certuvo');
  const share = page.getByRole('group', { name: 'Share Certuvo' });
  await expect(share).toBeVisible();
  const linkedin = share.getByRole('link', { name: /LinkedIn/ });
  await expect(linkedin).toHaveAttribute('target', '_blank');
  const href = (await linkedin.getAttribute('href'))!;
  expect(href).toContain('https://www.linkedin.com/sharing/share-offsite/?url=');
  const shared = new URL(decodeURIComponent(href.split('url=')[1]!));
  expect(shared.pathname).toBe('/partners/certuvo'); // the profile page, never a redirect
  expect(Object.fromEntries(shared.searchParams)).toEqual({
    utm_source: 'linkedin',
    utm_medium: 'social',
    utm_campaign: 'partner-share',
    utm_content: 'certuvo',
  });
  expect(await share.getByRole('link', { name: /^X/ }).getAttribute('href')).toContain('https://twitter.com/intent/tweet?url=');
  expect(await share.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toContain('https://wa.me/?text=');
  expect(await share.getByRole('link', { name: 'Tell a colleague' }).getAttribute('href')).toMatch(/^mailto:\?subject=/);
  await share.getByRole('button', { name: 'Copy link' }).click();
  await expect(share.getByRole('button', { name: 'Link copied' })).toBeVisible();
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.pathname).toBe('/partners/certuvo');
  expect(copied.searchParams.get('utm_source')).toBe('copy');
  errors.expectClean('share');
});

test('a partner page has its own Open Graph and Twitter share image: a generated, branded PNG', async ({ page }) => {
  await page.goto('/partners/pci-ai');
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toMatch(/\/og\/partners\/pci-ai\.png\?v=[0-9a-f]{12}$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const png = await page.request.get(new URL(og!).pathname + new URL(og!).search);
  expect(png.status()).toBe(200);
  expect(png.headers()['content-type']).toBe('image/png');
  expect((await png.body()).length).toBeGreaterThan(5000);
});

test('/go/pciai and /go/certuvo count a click and redirect with UTM tags; anything else is a 404', async ({ page }) => {
  const pci = await page.request.get('/go/pciai', { maxRedirects: 0 });
  expect(pci.status()).toBe(302);
  expect(pci.headers()['location']).toBe('https://pciai.org/?utm_source=optimizeall&utm_medium=partner&utm_campaign=go.link');
  expect(pci.headers()['cache-control']).toContain('no-store');
  expect(pci.headers()['x-robots-tag']).toContain('noindex');
  const certuvo = await page.request.get('/go/certuvo', { maxRedirects: 0 });
  expect(certuvo.status()).toBe(302);
  expect(certuvo.headers()['location']).toMatch(/^https:\/\/certuvo\.com\/\?utm_source=optimizeall&utm_medium=partner&utm_campaign=go\.link$/);
  expect((await page.request.get('/go/nobody', { maxRedirects: 0 })).status()).toBe(404);
  // robots.txt keeps crawlers out of the redirects.
  expect(await (await page.request.get('/robots.txt')).text()).toContain('Disallow: /go/');
});
