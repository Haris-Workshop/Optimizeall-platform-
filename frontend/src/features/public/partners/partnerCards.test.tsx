import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, problem } from '@/test/fetchMock';
import { renderWithApp } from '@/test/render';
import * as fx from '../testFixtures';
import type { PartnerCard } from './api';
import { PartnerAd, PartnerBand } from './PartnerCards';
import { PartnerShare } from './PartnerShare';
import { shareHref, taggedShareUrl, type ShareMessage } from './partnerShare';
import { PARTNER_SLOTS, slotVariant } from './slots';
import { PartnerSlot } from './PartnerSlot';
import { resetImpressionTracking } from './tracking';

const pci: PartnerCard = {
  slug: 'pci-ai',
  name: 'PCI AI',
  logoUrl: '/partners/pci-ai.png',
  tagline: 'The credential for the people who control projects',
  relationshipLabel: 'Optimize All is the official marketing partner of PCI AI',
  brandColor: '#14285A',
  websiteHost: 'pciai.org',
  visitUrl: '/api/v1/public/partners/pci-ai/visit',
  profilePath: '/partners/pci-ai',
  slots: ['home.band', 'blog.end', 'learn.hub'],
  offer: null,
};
const certuvo: PartnerCard = {
  ...pci,
  slug: 'certuvo',
  name: 'Certuvo',
  logoUrl: '/partners/certuvo.jpg',
  tagline: 'Pass your next exam with total confidence',
  relationshipLabel: 'Optimize All is the official marketing partner of Certuvo',
  websiteHost: 'certuvo.com',
  visitUrl: '/api/v1/public/partners/certuvo/visit',
  profilePath: '/partners/certuvo',
};

beforeEach(() => resetImpressionTracking());
afterEach(() => vi.unstubAllGlobals());

const routes = {
  'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired'),
  'GET /public/site': () => json(200, fx.site),
};

describe('slots and variants', () => {
  it('has at most one hero-size slot per page type and gives every slot a known variant', () => {
    const heroes = PARTNER_SLOTS.filter((s) => slotVariant(s.name) === 'hero').map((s) => s.name);
    expect(heroes).toEqual(['home.band', 'learn.hub']); // the home page and the academy hub: never both on one page
    expect(slotVariant('blog.end')).toBe('kit');
    expect(slotVariant('blog.index')).toBe('bar');
    expect(slotVariant('blog.inline')).toBe('inline');
  });
});

describe('sponsored cards', () => {
  it.each(['hero', 'kit', 'bar', 'inline'] as const)('the %s card carries the visible disclosure and sponsored, tracked links', (variant) => {
    const slot = { hero: 'learn.hub', kit: 'blog.end', bar: 'blog.index', inline: 'service.detail' }[variant] as 'learn.hub';
    renderWithApp(<PartnerAd partner={certuvo} slot={slot} />, { route: '/blog/x', path: '/blog/:slug' });
    const unit = screen.getByRole('complementary', { name: 'Sponsored: Certuvo' });
    expect(unit).toHaveAttribute('data-partner-slot', slot);
    expect(within(unit).getByText('Sponsored', { exact: true })).toBeInTheDocument();
    expect(unit).toHaveTextContent('Optimize All is the official marketing partner of Certuvo.');
    const out = unit.querySelector('a[href*="/visit"]')!;
    expect(out).toHaveAttribute('rel', 'sponsored noopener');
    expect(out).toHaveAttribute('target', '_blank');
    expect(out.getAttribute('href')).toBe(`/api/v1/public/partners/certuvo/visit?slot=${slot}&path=%2Fblog%2Fx`);
    expect(unit.querySelector('[style]')).toBeNull(); // no inline styles in the public cards
  });

  it('the kit cards use the partners’ own words: "Study kit" for Certuvo, "Project controls toolkit" for PCI AI', () => {
    const { unmount } = renderWithApp(<PartnerAd partner={certuvo} slot="blog.end" />);
    expect(screen.getByText('Study kit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore Certuvo exam prep/ })).toBeInTheDocument();
    expect(screen.getByText('Preparation for CIA, CISA, CMA, CPA, CFA, PMP, NCLEX-RN and NCLEX-PN')).toBeInTheDocument();
    unmount();
    renderWithApp(<PartnerAd partner={pci} slot="blog.end" />);
    expect(screen.getByText('Project controls toolkit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore PCI AI certifications/ })).toBeInTheDocument();
  });

  it('hides every outbound link while a partner has no website, keeping the disclosure', () => {
    renderWithApp(<PartnerAd partner={{ ...certuvo, websiteHost: null, visitUrl: null }} slot="blog.end" />);
    expect(document.querySelector('a[href*="/visit"]')).toBeNull();
    expect(screen.getByText('Sponsored', { exact: true })).toBeInTheDocument();
  });

  it('the home band shows a card per partner under one heading with the disclosure', () => {
    renderWithApp(<PartnerBand partners={[pci, certuvo]} />);
    const band = screen.getByRole('region', { name: 'Resources from our partners' });
    expect(within(band).getAllByRole('article')).toHaveLength(2);
    expect(band).toHaveTextContent('Optimize All is the official marketing partner of PCI AI and Certuvo.');
    expect(within(band).getAllByText('Sponsored', { exact: true }).length).toBeGreaterThanOrEqual(3);
    expect(within(band).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Project controls certification from PCI AI',
      'Exam preparation from Certuvo',
    ]);
    for (const a of band.querySelectorAll('a[href*="/visit"]')) expect(a).toHaveAttribute('rel', 'sponsored noopener');
  });

  it('a unit holds its room while the placement loads, then renders the card', async () => {
    mockFetch({ ...routes, 'GET /public/partners/placement': () => json(200, { slot: 'blog.end', partner: certuvo }) });
    const { container } = renderWithApp(<PartnerSlot slot="blog.end" keywords={['cpa']} categories={['accounting']} />, { route: '/blog/x' });
    expect(container.querySelector('.partner-reserve--kit')).not.toBeNull();
    expect(await screen.findByRole('complementary', { name: 'Sponsored: Certuvo' })).toBeInTheDocument();
    expect(container.querySelector('.partner-reserve')).toBeNull();
  });
});

describe('sharing', () => {
  const message: ShareMessage = {
    url: 'https://optimizeall.example/partners/pci-ai',
    text: 'PCI AI: certifications',
    subject: 'PCI AI: worth a look',
    body: (u) => `Take a look: ${u}`,
    content: 'pci-ai',
  };

  it('tags the shared page with UTM parameters and keeps tags already on it', () => {
    expect(taggedShareUrl(message.url, 'linkedin', 'pci-ai')).toBe(
      'https://optimizeall.example/partners/pci-ai?utm_source=linkedin&utm_medium=social&utm_campaign=partner-share&utm_content=pci-ai',
    );
    expect(taggedShareUrl('https://x.test/p?utm_source=news', 'copy', 'a')).toBe(
      'https://x.test/p?utm_source=news&utm_medium=referral&utm_campaign=partner-share&utm_content=a',
    );
  });

  it('builds plain share URLs', () => {
    const tagged = encodeURIComponent(taggedShareUrl(message.url, 'linkedin', 'pci-ai'));
    expect(shareHref('linkedin', message)).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${tagged}`);
    expect(shareHref('x', message)).toContain('https://twitter.com/intent/tweet?url=');
    expect(shareHref('whatsapp', message)).toContain('https://wa.me/?text=');
    expect(decodeURIComponent(shareHref('email', message))).toContain('Take a look: https://optimizeall.example/partners/pci-ai?utm_source=email');
  });

  it('renders share links that open in a new tab, a tell-a-colleague link and a copy button', async () => {
    mockFetch({ ...routes });
    const writeText = vi.fn((_text: string) => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderWithApp(<PartnerShare partner={pci} />);
    const group = await screen.findByRole('group', { name: 'Share PCI AI' });
    const linkedin = within(group).getByRole('link', { name: /LinkedIn/ });
    expect(linkedin).toHaveAttribute('target', '_blank');
    expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer');
    expect(linkedin.getAttribute('href')).toContain('linkedin.com/sharing');
    expect(within(group).getByRole('link', { name: /Tell a colleague/ }).getAttribute('href')).toMatch(/^mailto:\?subject=/);
    await userEvent.click(await within(group).findByRole('button', { name: /Copy link/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]![0]).toMatch(/\/partners\/pci-ai\?utm_source=copy&utm_medium=referral&utm_campaign=partner-share/);
    expect(await within(group).findByRole('button', { name: /Link copied/ })).toBeInTheDocument();
  });

  it('offers the system share sheet where the browser has one', async () => {
    mockFetch({ ...routes });
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share });
    renderWithApp(<PartnerShare partner={pci} />);
    await userEvent.click(await screen.findByRole('button', { name: /Share…/ }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'PCI AI', url: expect.stringContaining('utm_source=native') }));
  });
});
