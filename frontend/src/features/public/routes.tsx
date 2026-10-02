import type { RouteObject } from 'react-router-dom';
import { FaqPage } from './FaqPage';
import { LandingPage } from './LandingPage';
import { StaticRedirect } from './site/redirects';

/**
 * Public agency website routes (children of PublicLayout; wired into app/router.tsx). Pages are lazy-loaded so the
 * portals don't pay for the marketing site and vice versa. The agency is the default frame; the academy (`/learn`,
 * `/verify`) and the creator programme (`/creators`, `/creators/faq`) are separate products with their own header and
 * footer (site/variant.ts). Retired addresses redirect: `/academy` → `/learn`, `/faq` → `/creators/faq`.
 * `/:slug` renders CMS pages (About, How we work, legal pages…) and 404s otherwise.
 */
export const publicRoutes: RouteObject[] = [
  { index: true, lazy: async () => ({ Component: (await import('./pages/HomePage')).HomePage }) },
  { path: 'creators', element: <LandingPage /> },
  { path: 'creators/faq', element: <FaqPage /> },
  { path: 'faq', element: <StaticRedirect to="/creators/faq" /> },
  { path: 'services', lazy: async () => ({ Component: (await import('./pages/ServicePages')).ServicesPage }) },
  { path: 'services/:slug', lazy: async () => ({ Component: (await import('./pages/ServicePages')).ServiceDetailPage }) },
  { path: 'industries', lazy: async () => ({ Component: (await import('./pages/IndustryAndCasePages')).IndustriesPage }) },
  { path: 'industries/:slug', lazy: async () => ({ Component: (await import('./pages/IndustryAndCasePages')).IndustryDetailPage }) },
  { path: 'case-studies', lazy: async () => ({ Component: (await import('./pages/IndustryAndCasePages')).CaseStudiesPage }) },
  { path: 'case-studies/:slug', lazy: async () => ({ Component: (await import('./pages/IndustryAndCasePages')).CaseStudyDetailPage }) },
  { path: 'pricing', lazy: async () => ({ Component: (await import('./pages/PricingPage')).PricingPage }) },
  { path: 'team', lazy: async () => ({ Component: (await import('./pages/TeamAndCareersPages')).TeamPage }) },
  { path: 'careers', lazy: async () => ({ Component: (await import('./pages/TeamAndCareersPages')).CareersPage }) },
  { path: 'careers/:slug', lazy: async () => ({ Component: (await import('./pages/TeamAndCareersPages')).JobDetailPage }) },
  { path: 'blog', lazy: async () => ({ Component: (await import('./pages/BlogPages')).BlogPage }) },
  { path: 'blog/:slug', lazy: async () => ({ Component: (await import('./pages/BlogPages')).BlogPostPage }) },
  { path: 'contact', lazy: async () => ({ Component: (await import('./pages/ContactPages')).ContactPage }) },
  { path: 'free-audit', lazy: async () => ({ Component: (await import('./pages/ContactPages')).FreeAuditPage }) },
  { path: 'get-a-quote', lazy: async () => ({ Component: (await import('./pages/QuotePage')).QuotePage }) },
  { path: 'book-a-consultation', lazy: async () => ({ Component: (await import('./pages/BookConsultationPage')).BookConsultationPage }) },
  { path: 'newsletter/confirm', lazy: async () => ({ Component: (await import('./pages/MiscPages')).NewsletterConfirmPage }) },
  { path: 'newsletter/unsubscribe', lazy: async () => ({ Component: (await import('./pages/MiscPages')).NewsletterUnsubscribePage }) },
  { path: 'search', lazy: async () => ({ Component: (await import('./pages/MiscPages')).SearchPage }) },
  // The academy overview moved into the /learn hub (its content sits at the bottom of the hub); About is a CMS page.
  { path: 'academy', element: <StaticRedirect to="/learn" /> },
  { path: 'about', lazy: async () => ({ Component: (await import('./pages/AboutPage')).AboutPage }) },
  { path: 'partners', lazy: async () => ({ Component: (await import('./partners/PartnerPages')).PartnersPage }) },
  { path: 'partners/:slug', lazy: async () => ({ Component: (await import('./partners/PartnerPages')).PartnerProfilePage }) },
  // Free academy (Learning module) and public certificate verification.
  { path: 'learn', lazy: async () => ({ Component: (await import('./learn/AcademyPages')).AcademyPage }) },
  { path: 'learn/paths', lazy: async () => ({ Component: (await import('./learn/AcademyPages')).AcademyPathsPage }) },
  { path: 'learn/paths/:pathSlug', lazy: async () => ({ Component: (await import('./learn/AcademyPages')).AcademyPathPage }) },
  { path: 'learn/:slug', lazy: async () => ({ Component: (await import('./learn/AcademyPages')).AcademyCoursePage }) },
  { path: 'learn/:slug/:lessonSlug', lazy: async () => ({ Component: (await import('./learn/AcademyPages')).AcademyLessonPage }) },
  { path: 'verify', lazy: async () => ({ Component: (await import('./pages/VerifyIndexPage')).VerifyIndexPage }) },
  { path: 'verify/certificates/:id', lazy: async () => ({ Component: (await import('./learn/VerifyCertificatePage')).VerifyCertificatePage }) },
  { path: ':slug', lazy: async () => ({ Component: (await import('./pages/CmsPage')).CmsPage }) },
];
