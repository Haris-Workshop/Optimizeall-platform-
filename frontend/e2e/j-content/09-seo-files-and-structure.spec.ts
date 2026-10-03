import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import {
  actor,
  anonGet,
  api,
  landing,
  openPublic,
  runId,
  state,
  toast,
  watchErrors,
} from './support/content';

/**
 * The website editor (site.manage from a custom role) edits what search engines and AI assistants read, and the site's
 * structure, through the admin:
 *   SEO → robots.txt: a rule with a live preview; a rule that closes the site needs the typed confirmation.
 *   SEO → Sitemaps: exclude an address from the table, then include it again.
 *   SEO → llms.txt: summary from the generated text, a custom section.
 *   Site settings → Page layout / Academy & Creators / Brand: move a home section, rename the Academy button.
 * Each change shows on the public site (server-rendered HTML and the hydrated page). Everything is restored.
 * Screenshots of the screens go to E2E_SHOTS_DIR when it is set.
 */

const SHOTS = process.env.E2E_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

interface Files {
  concurrencyStamp: string;
}

test.describe.serial('SEO files and site structure', () => {
  test.afterAll(async () => {
    // Restore the SEO files and settings whatever happened above.
    const editorApi = await api(state().editor);
    let files = await editorApi.get<Files>('/agency/website/seo/files');
    files = await editorApi.put<Files>('/agency/website/seo/files/robots', {
      concurrencyStamp: files.concurrencyStamp,
    });
    files = await editorApi.put<Files>('/agency/website/seo/files/sitemap', {
      concurrencyStamp: files.concurrencyStamp,
    });
    await editorApi.put('/agency/website/seo/files/llms', { concurrencyStamp: files.concurrencyStamp });
  });

  test('robots.txt, sitemaps and llms.txt are edited with previews and served at once', async ({
    browser,
  }) => {
    const id = runId();
    const editor = await actor(browser, state().editor, landing.agency);
    editor.setViewportSize({ width: 1440, height: 1000 });
    const errors = watchErrors(editor);
    errors.ignore(/HTTP 400 PUT \S+\/agency\/website\/seo\/files\/robots$/);

    // ---------------------------------------------------------------- robots.txt
    await editor.goto('/agency/website/seo?tab=robots');
    await expect(editor.getByRole('heading', { level: 1, name: 'SEO' })).toBeVisible();
    const preview = editor.getByRole('group', { name: 'robots.txt preview' });
    await expect(preview).toContainText('User-agent: *');
    await editor.getByLabel(/Rules for every crawler/).fill(`Disallow: /drafts-${id}/`);
    await expect(preview).toContainText(`Disallow: /drafts-${id}/`);
    await shot(editor, 'seo-robots');
    await editor.getByRole('button', { name: 'Save robots.txt' }).click();
    await expect(toast(editor, 'robots.txt saved')).toBeVisible();
    expect((await anonGet('/robots.txt')).text).toContain(`Disallow: /drafts-${id}/`);

    // Closing the whole site needs the typed confirmation; cancelling leaves the file as it was.
    await editor.getByLabel(/Rules for every crawler/).fill('Disallow: /');
    await expect(editor.getByText('This closes the whole site')).toBeVisible();
    await editor.getByRole('button', { name: 'Save robots.txt' }).click();
    const confirm = editor.getByRole('alertdialog', { name: 'Close the site to crawlers?' });
    await expect(confirm.getByRole('button', { name: 'Save anyway' })).toBeDisabled();
    await shot(editor, 'seo-robots-confirm');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    // Nothing was saved: the file still has the earlier rule, and the catch-all group still allows the site.
    expect((await anonGet('/robots.txt')).text).toContain(`Disallow: /drafts-${id}/`);
    await editor.getByRole('button', { name: 'Remove my additions' }).click();
    await editor.getByRole('button', { name: 'Save robots.txt' }).click();
    await expect(toast(editor, 'robots.txt saved')).toBeVisible();

    // ---------------------------------------------------------------- sitemaps
    await editor.getByRole('tab', { name: 'Sitemaps' }).click();
    await expect(editor.getByText('Submitting the sitemap')).toBeVisible();
    await editor.getByLabel('Search addresses and titles').fill('/team');
    const table = editor.getByRole('table', { name: 'Public addresses in the sitemaps' });
    await table.getByRole('button', { name: 'Exclude /team', exact: true }).click();
    await expect(toast(editor, 'Address left out of the sitemap')).toBeVisible();
    expect((await anonGet('/sitemaps/pages.xml')).text).not.toMatch(/\/team<\/loc>/);
    await editor.getByLabel('Search addresses and titles').fill('');
    await shot(editor, 'seo-sitemaps');
    await editor.getByLabel('Search addresses and titles').fill('/team');
    await table.getByRole('button', { name: 'Include /team', exact: true }).click();
    await expect(toast(editor, 'Address listed in the sitemap again')).toBeVisible();
    expect((await anonGet('/sitemaps/pages.xml')).text).toMatch(/\/team<\/loc>/);

    // ---------------------------------------------------------------- llms.txt
    await editor.getByRole('tab', { name: 'llms.txt' }).click();
    await expect(editor.getByRole('group', { name: 'llms.txt preview' })).toContainText(
      '## Machine-readable',
    );
    await editor.getByLabel(/^Summary/).fill(`The accountable growth agency (${id}).`);
    await editor.getByRole('button', { name: 'Add a section' }).click();
    await editor.getByLabel(/^Heading/).fill('How to work with us');
    await editor.getByLabel(/^Text \(Markdown\)/).fill('Every engagement starts with a free audit.');
    await editor.getByRole('button', { name: 'Save llms.txt' }).click();
    await expect(toast(editor, 'llms.txt saved')).toBeVisible();
    await expect(editor.getByRole('group', { name: 'llms.txt preview' })).toContainText(
      `> The accountable growth agency (${id}).`,
    );
    await shot(editor, 'seo-llms');
    const llms = (await anonGet('/llms.txt')).text;
    expect(llms).toContain(`> The accountable growth agency (${id}).`);
    expect(llms).toContain('## How to work with us\n\nEvery engagement starts with a free audit.');
    errors.expectClean('the SEO files');
    await editor.context().close();
  });

  test('page layout and the Academy menu are edited in Site settings and shown on the public site', async ({
    browser,
  }) => {
    const editor = await actor(browser, state().editor, landing.agency);
    editor.setViewportSize({ width: 1440, height: 1000 });
    const editorApi = await api(state().editor);
    const original = await editorApi.get<{ settings: Record<string, unknown>; concurrencyStamp: string }>(
      '/agency/website/settings',
    );
    const errors = watchErrors(editor);
    try {
      await editor.goto('/agency/website/settings');
      await expect(editor.getByRole('heading', { level: 1, name: 'Site settings' })).toBeVisible();
      await editor.getByRole('tab', { name: /^Brand/ }).click();
      await expect(editor.getByLabel(/^Browser icon \(favicon\)/)).toBeVisible();
      await shot(editor, 'settings-brand');

      await editor.getByRole('tab', { name: /^Page layout/ }).click();
      const home = editor.getByRole('list', { name: 'Home page sections' });
      // Newsletter to the top (10 steps up), testimonials hidden.
      for (let i = 0; i < 10; i++) await home.getByRole('button', { name: 'Move Newsletter up' }).click();
      await home.getByRole('switch', { name: /Testimonials/ }).click();
      await shot(editor, 'settings-page-layout');

      await editor.getByRole('tab', { name: /^Academy & Creators/ }).click();
      const academyButton = editor.getByRole('group', { name: 'Academy: header button' });
      await academyButton.getByLabel(/^Label/).fill('Start a free course');
      await shot(editor, 'settings-academy-creators');
      await editor.getByRole('button', { name: 'Save settings' }).click();
      await expect(toast(editor, 'Site settings saved')).toBeVisible();
      errors.expectClean('the site settings');

      // The server-rendered home page follows the new order; the app keeps it after hydration.
      const html = (await anonGet('/_document/')).text;
      expect(html.indexOf('Get marketing insights in your inbox')).toBeLessThan(
        html.indexOf('Every channel, one accountable team'),
      );
      const visitorPage = await openPublic(browser, '/');
      const h2 = await visitorPage.getByRole('heading', { level: 2 }).allTextContents();
      expect(h2.indexOf('Get marketing insights in your inbox')).toBeLessThan(
        h2.indexOf('Every channel, one accountable team'),
      );
      await visitorPage.goto('/learn');
      await expect(
        visitorPage.getByRole('banner').getByRole('link', { name: 'Start a free course' }).first(),
      ).toBeVisible();
      await visitorPage.context().close();
    } finally {
      const now = await editorApi.get<{ concurrencyStamp: string }>('/agency/website/settings');
      await editorApi.put('/agency/website/settings', {
        settings: original.settings,
        concurrencyStamp: now.concurrencyStamp,
      });
      await editor.context().close();
    }
  });

  test('page texts: a button link is a validated Link text', async ({ browser }) => {
    const editor = await actor(browser, state().editor, landing.agency);
    editor.setViewportSize({ width: 1440, height: 1000 });
    await editor.goto('/agency/website/copy');
    await editor.getByLabel('Search all texts').fill('primaryCtaUrl');
    await expect(editor.getByText('home.hero.primaryCtaUrl')).toBeVisible();
    await shot(editor, 'page-texts-link');
    await editor.context().close();
  });
});
