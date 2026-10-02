import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import { contentSecurityPolicy } from '../../src/app/csp';
import type { Credentials } from '../journeys/support/fixtures';
import { guardCsp } from '../support/csp';
import { accounts, landing, raw, signIn } from './support/auth';

/**
 * Security headers. The API sets its own (nosniff, DENY framing, a deny-all CSP, no-store); the SPA's come from nginx
 * (frontend/nginx/snippets/security-headers.conf). `vite preview` sends the same Content-Security-Policy (seoShell.ts,
 * src/app/csp.ts) but not the other headers, so the suite adds those to every document, runs the app's pages under the
 * served policy failing on any violation (e2e/support/csp.ts), and checks that framing the app is refused.
 */
const NGINX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'nginx');
const snippet = readFileSync(join(NGINX, 'snippets', 'security-headers.conf'), 'utf8');
const header = (name: string) => {
  const m = snippet.match(new RegExp(`add_header ${name} "([^"]+)" always;`));
  if (!m) throw new Error(`${name} missing from security-headers.conf`);
  // As nginx sends it on plain http with no extra hosts and no style hashes (the app shell).
  return m[1]!
    .replace('$oa_img_src_extra', '')
    .replace('$oa_media_src_extra', '')
    .replace('$oa_style_hashes', '')
    .replace('$oa_csp_upgrade', '');
};
const SPA_HEADERS = {
  'content-security-policy': header('Content-Security-Policy'),
  'x-frame-options': header('X-Frame-Options'),
  'x-content-type-options': header('X-Content-Type-Options'),
  'referrer-policy': header('Referrer-Policy'),
};

/**
 * Serves the app's documents with the production headers (the served CSP is kept: it carries each page's style hashes)
 * and records CSP violations.
 */
async function underProductionHeaders(page: Page) {
  const { 'content-security-policy': _policy, ...others } = SPA_HEADERS;
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    expect(response.headers()['content-security-policy'], `${route.request().url()} has no CSP`).toBeTruthy();
    return route.fulfill({ response, headers: { ...response.headers(), ...others } });
  });
  const csp = await guardCsp(page.context());
  return {
    async expectNone(where: string) {
      csp.expectNone(where);
    },
  };
}

test('the API answers with nosniff, DENY framing, a deny-all CSP and no-store', async () => {
  for (const path of ['/auth/providers', '/auth/me', '/public/site']) {
    const res = await raw('GET', path);
    expect(res.headers.get('x-content-type-options'), path).toBe('nosniff');
    expect(res.headers.get('x-frame-options'), path).toBe('DENY');
    expect(res.headers.get('content-security-policy'), path).toContain("frame-ancestors 'none'");
    expect(res.headers.get('content-security-policy'), path).toContain("default-src 'none'");
    expect(res.headers.get('cache-control'), path).toBe('no-store');
    expect(res.headers.get('referrer-policy'), path).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('server') ?? '', path).not.toMatch(/\d/); // no version banner
  }
  // Errors do not leak internals either.
  const notFound = await raw('GET', `/me/support/tickets/${'0'.repeat(8)}-0000-0000-0000-000000000000`);
  expect(notFound.status).toBe(401);
  expect(JSON.stringify(notFound.json ?? {})).not.toMatch(/Exception|StackTrace|at OptimizeAll/);
});

test('the web server sends the strict policy on the app shell (no inline styles or scripts)', async ({ request }) => {
  for (const path of ['/login', '/app', '/admin']) {
    const res = await request.get(path);
    // Only the <style> elements of the document itself are allowed, by hash (none in the app shell nginx serves here).
    const styles = [...(await res.text()).matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(
      (m) => `'sha256-${createHash('sha256').update(m[1]!, 'utf8').digest('base64')}'`,
    );
    expect(res.headers()['content-security-policy'], path).toBe(contentSecurityPolicy({ styleHashes: styles.join(' ') }));
  }
  expect(SPA_HEADERS['content-security-policy']).toBe(contentSecurityPolicy());
});

test('nginx sends the SPA headers from every static location', () => {
  const conf = readFileSync(join(NGINX, 'default.conf.template'), 'utf8');
  for (const location of ['location /assets/', 'location = /index.html', 'location / {']) {
    const block = conf.slice(conf.indexOf(location));
    expect(block.slice(0, block.indexOf('\n    }')), location).toContain('security-headers.conf');
  }
  expect(SPA_HEADERS['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(SPA_HEADERS['content-security-policy']).toContain("script-src 'self'");
  expect(SPA_HEADERS['content-security-policy']).not.toContain('unsafe-eval');
  expect(SPA_HEADERS['content-security-policy']).not.toContain('unsafe-inline');
  expect(SPA_HEADERS['x-frame-options']).toBe('DENY');
});

const tour: { who: Credentials | null; landing: RegExp | null; paths: string[] }[] = [
  {
    who: null,
    landing: null,
    paths: ['/', '/login', '/register', '/forgot-password', '/reset-password?token=x'],
  },
  {
    who: accounts.participant,
    landing: landing.participant,
    paths: ['/app', '/app/campaigns', '/app/earnings', '/app/profile/security'],
  },
  { who: accounts.admin, landing: landing.admin, paths: ['/admin', '/admin/users', '/admin/audit'] },
  { who: accounts.am, landing: landing.agency, paths: ['/agency', '/agency/crm/deals'] },
  { who: accounts.nimbusApprover, landing: landing.client, paths: ['/client'] },
];

for (const stop of tour) {
  test(`the app runs under the production CSP: ${stop.who?.email ?? 'public pages'}`, async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const csp = await underProductionHeaders(page);
    if (stop.who) await signIn(page, stop.who, stop.landing!);
    for (const path of stop.paths) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await csp.expectNone(path);
    }
    await context.close();
  });
}

test('another site cannot frame the app (clickjacking)', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await underProductionHeaders(page);
  // A page on a different origin (127.0.0.1 vs localhost) that frames the sign-in page.
  const appUrl = new URL('/login', test.info().project.use.baseURL!).toString();
  await page.route('http://127.0.0.1:1/evil', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<h1>evil</h1><iframe id="f" src="${appUrl}"></iframe>`,
    }),
  );
  await page.goto('http://127.0.0.1:1/evil');
  await page.waitForTimeout(2_000);
  const framed = page.frames().find((f) => f !== page.mainFrame());
  // The frame never renders the app: no sign-in form inside it.
  const inside = framed
    ? await framed
        .locator('form')
        .count()
        .catch(() => 0)
    : 0;
  expect(inside).toBe(0);
  await context.close();
});
