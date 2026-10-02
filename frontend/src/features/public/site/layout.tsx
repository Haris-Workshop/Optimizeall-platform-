import { useEffect } from 'react';
import { Logo } from '@/components/brand/Logo';
import { type PageSection, type ProductChrome, type PublicSite, type SiteLink, useSite } from './api';

/**
 * Site-settings driven structure of the public site (Agency → Website → Site settings): the section order of the home
 * and creators pages, the sibling products' header and footer, the footer's product and sign-in groups and the brand
 * assets. Every default below mirrors SiteSettingsService (backend) so the site looks the same while the settings load
 * or predate these options; the server render and hydration read the same `/public/site` data.
 */

export const HOME_SECTIONS = [
  'logos',
  'partners',
  'services',
  'proof',
  'process',
  'industries',
  'testimonials',
  'insights',
  'band',
  'more',
  'cta',
  'newsletter',
] as const;
export type HomeSectionKey = (typeof HOME_SECTIONS)[number];

export const CREATORS_SECTIONS = ['how', 'earnings', 'rules', 'faq', 'cta'] as const;
export type CreatorsSectionKey = (typeof CREATORS_SECTIONS)[number];

/** The stored order (unknown and repeated keys dropped) with sections added since appended, shown. */
export function mergeSections<K extends string>(stored: PageSection[] | null | undefined, keys: readonly K[]): { key: K; visible: boolean }[] {
  const result: { key: K; visible: boolean }[] = [];
  for (const s of stored ?? []) {
    if ((keys as readonly string[]).includes(s.key) && !result.some((r) => r.key === s.key)) result.push({ key: s.key as K, visible: s.visible });
  }
  for (const key of keys) if (!result.some((r) => r.key === key)) result.push({ key, visible: true });
  return result;
}

/** The visible sections of a page, in order. */
export function useSections(page: 'home'): HomeSectionKey[];
export function useSections(page: 'creators'): CreatorsSectionKey[];
export function useSections(page: 'home' | 'creators'): string[] {
  const { data: site } = useSite();
  const keys = page === 'home' ? HOME_SECTIONS : CREATORS_SECTIONS;
  return mergeSections(site?.layouts?.[page], keys)
    .filter((s) => s.visible)
    .map((s) => s.key);
}

export const DEFAULT_SECONDARY_LINK: SiteLink = { label: 'Free Academy', url: '/learn' };

export const DEFAULT_PRODUCT_LINKS: SiteLink[] = [
  { label: 'Optimize All Academy', url: '/learn' },
  { label: 'Optimize All Creators', url: '/creators' },
];

export const DEFAULT_SIGN_IN_LINKS: SiteLink[] = [
  { label: 'Client login', url: '/login' },
  { label: 'Creator sign in', url: '/login?audience=creator' },
  { label: 'Academy sign in', url: '/login?audience=learner' },
];

const ACADEMY_LINKS: SiteLink[] = [
  { label: 'Courses', url: '/learn' },
  { label: 'Learning paths', url: '/learn/paths' },
  { label: 'Certificates', url: '/learn#certificates' },
  { label: 'Verify a certificate', url: '/verify' },
];

export const DEFAULT_PRODUCTS: { academy: ProductChrome; creators: ProductChrome } = {
  academy: {
    nav: ACADEMY_LINKS,
    cta: { label: 'Start learning free', url: '/learn' },
    footerLinks: ACADEMY_LINKS,
    footerNote: 'Optimize All Academy is run by Optimize All, a marketing agency.',
    footerNoteLink: { label: 'Work with us', url: '/services' },
  },
  creators: {
    nav: [
      { label: 'How it works', url: '/creators#how-it-works' },
      { label: 'FAQ', url: '/creators/faq' },
      { label: 'Campaign rules', url: '/creators#rules' },
    ],
    cta: { label: 'Create a creator account', url: '/register?audience=creator' },
    footerLinks: [
      { label: 'How it works', url: '/creators#how-it-works' },
      { label: 'FAQ', url: '/creators/faq' },
      { label: 'Campaign rules', url: '/creators#rules' },
      { label: 'Create a creator account', url: '/register?audience=creator' },
      { label: 'Creator sign in', url: '/login?audience=creator' },
    ],
    footerNote: 'Optimize All Creators is run by Optimize All, a marketing agency.',
    footerNoteLink: { label: 'Visit Optimize All', url: '/' },
  },
};

/** The header and footer of a sibling product (settings, else the defaults). */
export function productChrome(site: PublicSite | undefined, product: 'academy' | 'creators'): ProductChrome {
  return site?.products?.[product] ?? DEFAULT_PRODUCTS[product];
}

/**
 * The site's logo: the uploaded one (with its dark-background version when there is one) or the built-in Optimize All
 * logo. Sized by the `height` attribute (no inline styles); the width follows the image.
 */
export function SiteLogo({ size = 30, title = '' }: { size?: number; title?: string }) {
  const { data: site } = useSite();
  const brand = site?.brand;
  if (!brand?.logoUrl) return <Logo size={size} title={title} />;
  return (
    <span className="site-brand-logo">
      <img
        className={brand.logoDarkUrl ? 'site-brand-logo__img site-brand-logo__img--light site-brand-logo__img--has-dark' : 'site-brand-logo__img'}
        src={brand.logoUrl}
        alt={title}
        height={size}
        decoding="async"
      />
      {brand.logoDarkUrl && (
        <img className="site-brand-logo__img site-brand-logo__img--dark" src={brand.logoDarkUrl} alt={title} height={size} decoding="async" />
      )}
    </span>
  );
}

/**
 * Points the browser icon at the uploaded favicon (Site settings → Brand). The server-rendered document already carries
 * it (SeoDocumentWriter); this keeps client-rendered pages in step. Nothing changes without an uploaded icon.
 */
export function useBrandFavicon() {
  const { data: site } = useSite();
  const href = site?.brand?.faviconUrl ?? null;
  useEffect(() => {
    if (!href || typeof document === 'undefined') return;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][data-oa-brand]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.setAttribute('data-oa-brand', '');
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== href) link.href = href;
  }, [href]);
}
