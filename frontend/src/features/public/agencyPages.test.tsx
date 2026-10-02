import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockFetch, problem } from '@/test/fetchMock';
import { axeViolations, renderWithApp } from '@/test/render';
import { CaseStudiesPage, CaseStudyDetailPage, IndustriesPage, IndustryDetailPage } from './pages/IndustryAndCasePages';
import { PricingPage } from './pages/PricingPage';
import { ServiceDetailPage, ServicesPage } from './pages/ServicePages';
import type { CaseStudyCard, PublicCaseStudy, PublicIndustry } from './site/api';
import * as fx from './testFixtures';

const anonymous = { 'POST /auth/refresh': () => problem(401, 'auth.session_expired', 'Expired') };
const notFound = () => problem(404, 'website.not_found', 'Not found');

const card: CaseStudyCard = {
  slug: 'northwind-seo',
  title: 'Tripling organic leads for Northwind',
  clientName: 'Northwind Dental',
  summary: 'Local SEO and content for a 12-clinic group.',
  industrySlug: 'healthcare',
  industryName: 'Healthcare',
  serviceSlugs: ['seo'],
  serviceNames: ['Search engine optimization'],
  coverImageUrl: null,
  highlights: [{ label: 'Organic leads', value: '+212%', measurement: 'Measured', context: 'in 9 months' }],
  isFeatured: true,
};

const study: PublicCaseStudy = {
  slug: card.slug,
  title: card.title,
  clientName: card.clientName,
  summary: card.summary,
  industrySlug: 'healthcare',
  industryName: 'Healthcare',
  services: [fx.serviceGroups[0]!.services[0]!],
  challengeMarkdown: 'Twelve clinics, one website and **no** local pages.',
  strategyMarkdown: 'A location page per clinic.',
  executionMarkdown: null,
  metrics: [
    { label: 'Organic leads', value: '+212%', measurement: 'Measured', context: 'GA4, 9 months' },
    { label: 'Revenue from organic', value: '$1.4M', measurement: 'Estimated', context: 'Projected' },
  ],
  testimonialQuote: 'They told us what was not working, too.',
  testimonialAuthor: 'Priya Shah',
  testimonialRole: 'CMO',
  coverImageUrl: null,
  galleryImageUrls: [],
  publishedAt: '2026-05-01T00:00:00Z',
  related: [],
  seo: { title: 'Northwind case study', description: 'Local SEO for a clinic group.', ogImageUrl: null, canonicalUrl: null, noIndex: false },
  jsonLd: [],
};

const industry: PublicIndustry = {
  slug: 'healthcare',
  name: 'Healthcare',
  summary: 'Compliant growth for clinics.',
  bodyMarkdown: 'Patients research carefully before they book.',
  challenges: ['Strict advertising rules', 'Long research journeys'],
  icon: 'heart-pulse',
  heroImageUrl: null,
  services: fx.serviceGroups[0]!.services,
  caseStudies: [card],
  seo: { title: 'Healthcare marketing', description: 'Compliant growth for clinics.', ogImageUrl: null, canonicalUrl: null, noIndex: false },
  jsonLd: [],
};

describe('agency pages', () => {
  it('/services: a chapter per service line with its services and starting prices, a filter and the consultation call to action', async () => {
    const user = userEvent.setup();
    mockFetch({ ...anonymous, 'GET /public/services': () => json(200, fx.serviceGroups), 'GET /public/redirects': notFound });
    const { container } = renderWithApp(<ServicesPage />, { route: '/services', path: '/services' });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    const line = await screen.findByRole('region', { name: 'Search' });
    expect(within(line).getByRole('link', { name: 'Search engine optimization' })).toHaveAttribute('href', '/services/seo');
    expect(within(line).getByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText('1 service lines · 2 services')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search', pressed: false }));
    expect(screen.getByRole('button', { name: 'Search', pressed: true })).toBeInTheDocument();
    const cta = screen.getByRole('region', { name: 'Not sure where to start?' });
    expect(within(cta).getByRole('link', { name: /Book a consultation/ })).toHaveAttribute('href', '/book-a-consultation');
    expect(within(cta).getByRole('link', { name: 'Get a free audit' })).toHaveAttribute('href', '/free-audit');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('/services/:slug: hero with the consultation first, an on-this-page bar, tiers and FAQ', async () => {
    mockFetch({ ...anonymous, 'GET /public/services/seo': () => json(200, fx.service) });
    const { container } = renderWithApp(<ServiceDetailPage />, { route: '/services/seo', path: '/services/:slug' });
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Search engine optimization' });
    const hero = h1.closest('header')!;
    const heroLinks = within(hero).getAllByRole('link').filter((a) => a.classList.contains('ui-button'));
    expect(heroLinks.map((a) => a.getAttribute('href'))).toEqual(['/book-a-consultation', '/get-a-quote?service=seo']);
    expect(within(hero).getByRole('complementary', { name: 'Results we move' })).toHaveTextContent('Organic sessions');
    expect(within(hero).getByText('$1,200')).toBeInTheDocument();

    const toc = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(toc).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#overview', '#problems', '#included', '#process', '#pricing', '#faq']);
    for (const id of ['overview', 'problems', 'included', 'process', 'pricing', 'faq']) expect(container.querySelector(`#${id}`)).not.toBeNull();

    const tier = screen.getByRole('article', { name: 'Growth' });
    expect(within(tier).getByText('Most popular')).toBeInTheDocument();
    expect(within(tier).getByRole('link', { name: /Get started/ })).toHaveAttribute('href', '/get-a-quote?service=seo&package=p1');
    expect(screen.getByText('How long does SEO take?')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "Let's talk about Search engine optimization" })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('/pricing: each service is a section of named tiers; the billing switch filters them', async () => {
    const user = userEvent.setup();
    mockFetch({ ...anonymous, 'GET /public/pricing': () => json(200, fx.pricing), 'GET /public/pages/pricing': notFound });
    const { container } = renderWithApp(<PricingPage />, { route: '/pricing', path: '/pricing' });
    const section = await screen.findByRole('region', { name: 'Search engine optimization' });
    const tier = within(section).getByRole('article', { name: /Growth/ });
    expect(tier).toHaveTextContent('$1,200');
    expect(within(section).getByRole('link', { name: /What’s included in Search engine optimization/ })).toHaveAttribute('href', '/services/seo#pricing');
    await user.click(screen.getByRole('button', { name: 'One-time projects' }));
    expect(screen.queryByRole('article', { name: /Growth/ })).not.toBeInTheDocument();
    expect(screen.getByText('No packages of this type yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Monthly retainers' }));
    expect(await screen.findByRole('article', { name: /Growth/ })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('/case-studies/:slug: a results band whose figures say measured or estimated, the story with contents, the client quote', async () => {
    mockFetch({ ...anonymous, 'GET /public/case-studies/northwind-seo': () => json(200, study) });
    const { container } = renderWithApp(<CaseStudyDetailPage />, { route: '/case-studies/northwind-seo', path: '/case-studies/:slug' });
    expect(await screen.findByRole('heading', { level: 1, name: study.title })).toBeInTheDocument();
    const results = screen.getByRole('region', { name: 'Results' });
    expect(within(results).getByText('+212%')).toBeInTheDocument();
    expect(within(results).getByText('Measured')).toBeInTheDocument();
    expect(within(results).getByText('Estimated')).toBeInTheDocument();
    expect(within(results).getByText(/Figures marked “Estimated”/)).toBeInTheDocument();
    const contents = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(contents).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#results', '#challenge', '#strategy', '#in-their-words']);
    expect(screen.getByRole('heading', { level: 2, name: 'The challenge' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Execution' })).not.toBeInTheDocument();
    expect(screen.getByText('They told us what was not working, too.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Healthcare' })).toHaveAttribute('href', '/industries/healthcare');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('/case-studies: a hero ledger of real headline figures and the filterable list', async () => {
    mockFetch({
      ...anonymous,
      'GET /public/case-studies': () => json(200, [card]),
      'GET /public/services': () => json(200, fx.serviceGroups),
      'GET /public/industries': () => json(200, fx.home.industries),
    });
    const { container } = renderWithApp(<CaseStudiesPage />, { route: '/case-studies', path: '/case-studies' });
    const ledger = await screen.findByRole('complementary', { name: 'Selected results' });
    expect(within(ledger).getByText('+212%')).toBeInTheDocument();
    expect(within(ledger).getByText('Northwind Dental')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: card.title })).toHaveAttribute('href', `/case-studies/${card.slug}`);
    expect(screen.getByRole('status')).toHaveTextContent('Case studies shown: 1');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('/industries and /industries/:slug', async () => {
    mockFetch({
      ...anonymous,
      'GET /public/industries': () => json(200, fx.home.industries),
      'GET /public/industries/healthcare': () => json(200, industry),
    });
    const list = renderWithApp(<IndustriesPage />, { route: '/industries', path: '/industries' });
    expect(await screen.findByRole('link', { name: 'Healthcare' })).toHaveAttribute('href', '/industries/healthcare');
    expect(await axeViolations(list.container)).toEqual([]);
    list.unmount();

    const detail = renderWithApp(<IndustryDetailPage />, { route: '/industries/healthcare', path: '/industries/:slug' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Digital marketing for Healthcare' })).toBeInTheDocument();
    expect(screen.getByText('Strict advertising rules')).toBeInTheDocument();
    const results = screen.getByRole('region', { name: 'Healthcare case studies' });
    expect(within(results).getByRole('link', { name: card.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the results' })).toHaveAttribute('href', '/industries/healthcare#results');
    expect(await axeViolations(detail.container)).toEqual([]);
  });
});
