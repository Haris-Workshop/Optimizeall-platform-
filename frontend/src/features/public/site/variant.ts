/**
 * The public site is one company with two separate products. The agency (Optimize All) is the default frame; the free
 * academy and the creator programme are labelled separate products with their own mini header and footer.
 */
export type ChromeVariant = 'agency' | 'academy' | 'creators';

const first = (pathname: string) => pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase() ?? '';

/** The header/footer/title variant for a route: academy (/learn, /verify, /academy), creators (/creators, /join, /c, /faq), else agency. */
export function chromeVariant(pathname: string): ChromeVariant {
  switch (first(pathname)) {
    case 'learn':
    case 'verify':
    case 'academy':
      return 'academy';
    case 'creators':
    case 'join':
    case 'c':
    case 'faq':
      return 'creators';
    default:
      return 'agency';
  }
}

/** Page-title suffix per section ("%s" is the page title). The agency's comes from the CMS site settings when set. */
export const TITLE_TEMPLATES: Record<ChromeVariant, string> = {
  agency: '%s | Optimize All',
  academy: '%s | Optimize All Academy',
  creators: '%s | Optimize All Creators',
};

/** Title used when a page sets none. */
export const DEFAULT_TITLES: Record<ChromeVariant, string> = {
  agency: 'Optimize All',
  academy: 'Optimize All Academy',
  creators: 'Optimize All Creators',
};

/** Where each section's breadcrumb trail starts (the agency's is the home page, labelled "Home"). */
export const SECTION_ROOT: Record<Exclude<ChromeVariant, 'agency'>, { label: string; to: string }> = {
  academy: { label: 'Academy', to: '/learn' },
  creators: { label: 'Creators', to: '/creators' },
};
