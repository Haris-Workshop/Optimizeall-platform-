import { createHash } from 'node:crypto';
import { contentSecurityPolicy } from '../../src/app/csp';
import { expect, guardCsp, test } from '../support/csp';
import { BASE, noJsPage, PRIVATE_PAGES, PUBLIC_PAGES, sitemapUrls, SSR } from './support/seo';

/**
 * The strict Content-Security-Policy on the public site (docs/SECURITY.md § Content-Security-Policy): scripts and
 * styles from the site's own files only. Server-rendered pages carry no style attributes; their only inline `<style>`
 * elements are the API's plain-copy styles and the renderer's inline-style block, each allowed by a hash the response
 * lists — exactly those, so the header is the expected policy byte for byte. With or without JavaScript nothing is
 * refused, and once the app hydrates the inline styles are element styles again (set through the CSSOM).
 */
const hash = (css: string) => `'sha256-${createHash('sha256').update(css, 'utf8').digest('base64')}'`;
const inlineStyles = (html: string) => [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map((m) => m[1]!);

/** Public pages plus a sample of every sitemap's pages (blog posts, services, courses, lessons, partners, CMS pages). */
async function pages(request: Parameters<typeof sitemapUrls>[0]): Promise<string[]> {
  const fromSitemaps = (await sitemapUrls(request)).map((u) => new URL(u).pathname);
  const byPrefix = new Map<string, string[]>();
  for (const path of fromSitemaps) {
    const prefix = path.split('/').slice(0, 2).join('/');
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), path]);
  }
  const sample = [...byPrefix.values()].flatMap((list) => list.slice(0, 4).concat(list.slice(-2)));
  return [...new Set([...PUBLIC_PAGES, ...sample])];
}

test('every page sends the strict policy with exactly the hashes of its inline styles, and no style attributes', async ({ request }) => {
  test.setTimeout(300_000);
  const all = await pages(request);
  let hashed = 0;
  for (const path of [...all, ...PRIVATE_PAGES, '/this-page-does-not-exist']) {
    const res = await request.get(BASE + path, { maxRedirects: 0 });
    const html = await res.text();
    const styles = inlineStyles(html);
    hashed += styles.length;
    const policy = res.headers()['content-security-policy'];
    expect.soft(policy, `${path}: CSP`).toBe(contentSecurityPolicy({ styleHashes: styles.map(hash).join(' ') }));
    expect.soft(policy, path).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes/);
    expect.soft(html, `${path}: style attribute in the server HTML`).not.toMatch(/<[a-zA-Z][^>]*\sstyle=["']/);
    expect.soft(res.headers()['x-oa-style-hashes'], `${path}: internal header leaked`).toBeUndefined();
  }
  // Public pages do have inline styles (the API's plain-copy block, the renderer's block): the hashes are exercised.
  expect(hashed).toBeGreaterThanOrEqual(all.length);
});

test('server-rendered pages apply their inline styles without JavaScript, under the policy', async ({ browser }) => {
  test.skip(!SSR, 'E2E_SSR=0: the pages are not server-rendered');
  test.setTimeout(300_000);
  const page = await noJsPage(browser);
  const csp = await guardCsp(page.context());
  let styled = 0;
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    const check = await page.evaluate(() => {
      const sheet = (document.getElementById('oa-ssr-styles') as HTMLStyleElement | null)?.sheet ?? null;
      const rules = sheet ? (Array.from(sheet.cssRules) as CSSStyleRule[]) : [];
      const problems: string[] = [];
      const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-oa-style]'));
      for (const el of elements) {
        const value = el.getAttribute('data-oa-style')!;
        if (rules.filter((r) => el.matches(r.selectorText)).length !== 1) problems.push(`no single rule for "${value}"`);
        // Custom properties come out exactly as written: the element has the attribute's values.
        const declared = document.createElement('div').style;
        declared.cssText = value;
        for (const name of Array.from(declared).filter((n) => n.startsWith('--')))
          if (getComputedStyle(el).getPropertyValue(name).trim() !== declared.getPropertyValue(name).trim())
            problems.push(`${name} of "${value}" not applied`);
      }
      return { elements: elements.length, rules: rules.length, blocked: elements.length > 0 && sheet === null, problems };
    });
    expect.soft(check.blocked, `${path}: the inline-style block was refused`).toBe(false);
    expect.soft(check.problems, path).toEqual([]);
    styled += check.elements;
    csp.expectNone(`${path} (no JavaScript)`, { soft: true });
  }
  expect(styled, 'the pages have server-rendered inline styles').toBeGreaterThan(0);
  await page.context().close();
});

test('after hydration the inline styles are element styles and the block is gone', async ({ page }) => {
  test.skip(!SSR, 'E2E_SSR=0: the pages are not server-rendered');
  test.setTimeout(300_000);
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    await page.locator('html[data-app-ready]').waitFor({ timeout: 30_000 });
    const after = await page.evaluate(() => ({
      left: document.querySelectorAll('[data-oa-style]').length,
      block: document.getElementById('oa-ssr-styles') !== null,
    }));
    expect.soft(after, path).toEqual({ left: 0, block: false });
  }
  // The auto fixture (support/csp.ts) fails the test on any violation, with or without the steps above.
});
