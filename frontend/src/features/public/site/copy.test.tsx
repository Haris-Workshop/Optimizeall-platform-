import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, mockFetch, problem } from '@/test/fetchMock';
import { renderWithApp } from '@/test/render';
import { LandingPage } from '../LandingPage';
import { COPY_DEFAULTS, type CopyCatalogGroup, makeSiteCopy, splitPairs } from './copy';
import catalog from './siteCopy.json';

const COPY_GROUPS = catalog.groups as CopyCatalogGroup[];

/** Every `copy.text/list/pairs('key')` call in the app, found in the source files. */
const sources = import.meta.glob(['/src/features/**/*.tsx', '!/src/features/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('site copy', () => {
  it('uses only keys that exist in the catalog', () => {
    const used = new Set<string>();
    for (const source of Object.values(sources))
      for (const match of source.matchAll(/copy\.(?:text|list|pairs)\('([^']+)'/g)) used.add(match[1]);
    expect(used.size).toBeGreaterThan(150);
    const unknown = [...used].filter((key) => !(key in COPY_DEFAULTS));
    expect(unknown).toEqual([]);
  });

  it('has unique keys, known types and a default for each', () => {
    const keys = COPY_GROUPS.flatMap((g) => g.entries.map((e) => e.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const group of COPY_GROUPS)
      for (const entry of group.entries) {
        expect(['text', 'textarea', 'list', 'pairs', 'link']).toContain(entry.type);
        expect(entry.default.trim()).not.toBe('');
        // A link is a same-site path or an https address (the API rejects anything else).
        if (entry.type === 'link') expect(entry.default).toMatch(/^(\/(?!\/)\S*|https:\/\/\S+)$/);
        if (entry.type === 'pairs') expect(splitPairs(entry.default).every((p) => p.title && p.text)).toBe(true);
      }
  });

  it('applies overrides and fills placeholders', () => {
    const copy = makeSiteCopy({ 'shared.footer.copyright': '© {year} Acme Ltd' });
    expect(copy.text('shared.footer.copyright', { year: 2030 })).toBe('© 2030 Acme Ltd');
    expect(copy.text('home.hero.eyebrow')).toBe('Full-service digital marketing agency');
    expect(copy.list('home.hero.proof')).toEqual(['No long lock-ins', 'Your accounts, your data', 'Senior strategists on every account']);
    // The home page's closing call to action books a consultation, like the hero.
    expect(copy.text('home.cta.primary')).toBe(copy.text('home.hero.primaryCta'));
    expect(copy.list('home.cta.points')).toHaveLength(3);
    expect(makeSiteCopy({ 'home.more.creators.text': 'Get paid to post.' }).text('home.more.creators.text')).toBe('Get paid to post.');
    // The services menu's feature card links to the free audit with the same words the menu always used.
    expect(copy.text('shared.header.megaCta')).toBe('Get a free marketing audit');
    // The website 404's links heading matches the server-rendered 404 ("Helpful links").
    expect(copy.text('shared.page404.linksTitle')).toBe('Helpful links');
    // The academy hub's h1 (title + highlighted part) keeps the words the SEO title and the journeys look for.
    expect(`${copy.text('academy.hero.title')} ${copy.text('academy.hero.titleAccent')}`).toBe('Free courses. Real skills. Verified certificates.');
    // Creators earnings: stages from post to payout, and no promised figures.
    expect(copy.pairs('creators.earn.stages')).toHaveLength(4);
    expect(copy.text('creators.earn.note')).toMatch(/never promise/);
  });

  it('renders the shipped wording when overrides cannot be loaded, and editor overrides once they are', async () => {
    mockFetch({
      'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired'),
      'GET /content/copy': () =>
        json(200, {
          values: {
            'creators.hero.title': 'Earn from the brands',
            'creators.how.steps': 'Join | Sign up in minutes.\nShare | Post the approved content.',
          },
          updatedAt: '2026-09-23T10:00:00Z',
        }),
    });
    renderWithApp(<LandingPage />, { route: '/creators', path: '/creators' });
    expect(await screen.findByRole('heading', { level: 1, name: /Earn from the brands/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Step 1: Join' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Step 2: Share' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Step 3/ })).not.toBeInTheDocument();
    // Untouched keys keep their defaults.
    expect(screen.getByRole('heading', { name: 'Fair for you, honest with your audience' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Know the reward before you post' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Reward shown up front' })).toBeInTheDocument();
  });
});
