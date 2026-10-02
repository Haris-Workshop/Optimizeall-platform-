import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BRAND_TAGLINE, Logo } from '@/components/brand/Logo';
import { isExternalHref, isInternalHref } from '@/lib/safeHref';
import { type SiteLink, useSite } from './api';
import { useSiteCopy } from './copy';
import { PartnerSlot } from '../partners/PartnerSlot';
import { NewsletterSignup } from './NewsletterSignup';
import type { ChromeVariant } from './variant';

/** Agency footer columns shown until (or if) the site settings can't be loaded. Mirrors SiteSettingsService.Defaults. */
const FALLBACK_COLUMNS: { title: string; links: SiteLink[] }[] = [
  {
    title: 'Services',
    links: [
      { label: 'All services', url: '/services' },
      { label: 'Industries', url: '/industries' },
      { label: 'Case studies', url: '/case-studies' },
      { label: 'Pricing', url: '/pricing' },
      { label: 'Free marketing audit', url: '/free-audit' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About us', url: '/about' },
      { label: 'How we work', url: '/how-we-work' },
      { label: 'Team', url: '/team' },
      { label: 'Careers', url: '/careers' },
      { label: 'Insights', url: '/blog' },
      { label: 'Partners', url: '/partners' },
      { label: 'Contact', url: '/contact' },
    ],
  },
];

/** The other two products, one small link each. */
const MORE_FROM_OPTIMIZE_ALL: SiteLink[] = [
  { label: 'Optimize All Academy', url: '/learn' },
  { label: 'Optimize All Creators', url: '/creators' },
];

/** One sign-in group, labelled by audience. All three open /login; the audience only chooses the page's wording. */
const SIGN_IN_LINKS: SiteLink[] = [
  { label: 'Client login', url: '/login' },
  { label: 'Creator sign in', url: '/login?audience=creator' },
  { label: 'Academy sign in', url: '/login?audience=learner' },
];

const FALLBACK_LEGAL: SiteLink[] = [
  { label: 'Privacy policy', url: '/privacy-policy' },
  { label: 'Terms of service', url: '/terms-of-service' },
  { label: 'Cookie policy', url: '/cookie-policy' },
];

export function FooterLink({ link }: { link: SiteLink }) {
  if (isInternalHref(link.url)) return <Link to={link.url}>{link.label}</Link>;
  if (isExternalHref(link.url))
    return (
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        {link.label}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    );
  return <span>{link.label}</span>;
}

/** Links footer groups are made of. */
function LinkGroup({ title, links }: { title: string; links: SiteLink[] }) {
  return (
    <div>
      <h2 className="public-footer__heading">{title}</h2>
      <ul>
        {links.map((link) => (
          <li key={link.label + link.url}>
            <FooterLink link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legal row shared by every footer: copyright, policy links, cookie settings and (agency) social profiles. */
function LegalRow({ onCookieSettings, social = false }: { onCookieSettings: () => void; social?: boolean }) {
  const { data: site } = useSite();
  const copy = useSiteCopy();
  const legal = site?.footer.legalLinks.length ? site.footer.legalLinks : FALLBACK_LEGAL;
  return (
    <div className="container public-footer__legal site-footer__legal">
      <p>{copy.text('shared.footer.copyright', { year: new Date().getFullYear() })}</p>
      <ul>
        {legal.map((link) => (
          <li key={link.url}>
            <FooterLink link={link} />
          </li>
        ))}
        <li>
          <button type="button" className="site-linkbutton" onClick={onCookieSettings}>
            Cookie settings
          </button>
        </li>
        {social &&
          site?.social.map((s) => (
            <li key={s.url}>
              <FooterLink link={{ label: s.platform, url: s.url }} />
            </li>
          ))}
        {/* Machine-readable versions of the site, for crawlers and AI assistants (files, not app routes). */}
        <li>
          <a href="/sitemap.xml">Sitemap</a>
        </li>
        {site?.llmsTxt && (
          <li>
            <a href="/llms.txt">llms.txt</a>
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * The academy's and the creator programme's mini footer: a few product links, the legal row and one line saying who
 * runs it, with a single link back to the agency. No agency service columns.
 */
function ProductFooter({
  product,
  name,
  homeUrl,
  links,
  note,
  noteLink,
  onCookieSettings,
}: {
  product: ChromeVariant;
  name: string;
  homeUrl: string;
  links: SiteLink[];
  note: string;
  noteLink: SiteLink;
  onCookieSettings: () => void;
}) {
  return (
    <footer className={`public-footer site-footer site-footer--${product}`}>
      <div className="site-footer__stage">
        <div className="site-footer__backdrop" aria-hidden="true" />
        <div className="container site-footer__mini">
          <div className="site-footer__mini-brand">
            <Link to={homeUrl} className="public-header__brand site-header__product-brand" aria-label={`${name} home`}>
              <Logo size={28} title="" />{' '}
              <span className="site-header__wordmark">{product === 'academy' ? 'Academy' : 'Creators'}</span>
            </Link>
            <p className="site-footer__note">
              {note}{' '}
              <Link to={noteLink.url} className="site-footer__note-link">
                {noteLink.label} <ArrowRight aria-hidden="true" />
              </Link>
            </p>
          </div>
          <nav aria-label="Footer" className="site-footer__mini-nav">
            <ul>
              {links.map((link) => (
                <li key={link.label}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <LegalRow onCookieSettings={onCookieSettings} />
      </div>
    </footer>
  );
}

/**
 * The site footer for a route's variant. Agency: CMS-driven blurb, link columns, contact details, a small "More from
 * Optimize All" group, one "Sign in" group, newsletter, legal links and social profiles.
 */
export function SiteFooter({ onCookieSettings, variant = 'agency' }: { onCookieSettings: () => void; variant?: ChromeVariant }) {
  const { data: site } = useSite();
  const copy = useSiteCopy();
  if (variant === 'academy')
    return (
      <ProductFooter
        product="academy"
        name="Optimize All Academy"
        homeUrl="/learn"
        links={[
          { label: 'Courses', url: '/learn' },
          { label: 'Learning paths', url: '/learn/paths' },
          { label: 'Certificates', url: '/learn#certificates' },
          { label: 'Verify a certificate', url: '/verify' },
        ]}
        note="Optimize All Academy is run by Optimize All, a marketing agency."
        noteLink={{ label: 'Work with us', url: '/services' }}
        onCookieSettings={onCookieSettings}
      />
    );
  if (variant === 'creators')
    return (
      <ProductFooter
        product="creators"
        name="Optimize All Creators"
        homeUrl="/creators"
        links={[
          { label: 'How it works', url: '/creators#how-it-works' },
          { label: 'FAQ', url: '/creators/faq' },
          { label: 'Campaign rules', url: '/creators#rules' },
          { label: 'Create a creator account', url: '/register?audience=creator' },
          { label: 'Creator sign in', url: '/login?audience=creator' },
        ]}
        note="Optimize All Creators is run by Optimize All, a marketing agency."
        noteLink={{ label: 'Visit Optimize All', url: '/' }}
        onCookieSettings={onCookieSettings}
      />
    );

  const columns = (site?.footer.columns.length ? site.footer.columns : FALLBACK_COLUMNS).filter(
    // Stored footers from before the academy became its own product may still lead with an Academy column.
    (column) => column.title.toLowerCase() !== 'academy',
  );
  const contact = site?.contact;

  return (
    <footer className="public-footer site-footer site-footer--agency">
      <div className="site-footer__stage">
        <div className="site-footer__backdrop" aria-hidden="true" />
        <section className="container site-footer__lead" aria-labelledby="footer-newsletter">
          <div className="site-footer__lead-copy">
            <h2 id="footer-newsletter" className="site-footer__lead-title">
              {copy.text('shared.footer.newsletterTitle')}
            </h2>
            <p className="site-footer__lead-text">{copy.text('shared.footer.newsletterText')}</p>
          </div>
          <div className="site-footer__newsletter">
            <NewsletterSignup source="footer" compact />
          </div>
        </section>
        <div className="container site-footer__top">
          <div className="site-footer__brand">
            <Logo size={30} title={`Optimize All — ${BRAND_TAGLINE}`} />
            <p className="site-footer__blurb">
              {site?.footer.blurb ??
                'A full-service digital marketing agency: strategy, search, paid media, content, creative and web, run as one accountable team.'}
            </p>
            <PartnerSlot slot="footer.partners" />
            {contact && (
              <ul className="site-footer__contact">
                {contact.email && (
                  <li>
                    <Mail aria-hidden="true" />
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  </li>
                )}
                {contact.phone && (
                  <li>
                    <Phone aria-hidden="true" />
                    <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>{contact.phone}</a>
                  </li>
                )}
                {contact.whatsApp && (
                  <li>
                    <MessageCircle aria-hidden="true" />
                    <a href={`https://wa.me/${contact.whatsApp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                      WhatsApp<span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                  </li>
                )}
                {contact.address && (
                  <li>
                    <MapPin aria-hidden="true" />
                    <span>{contact.address}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
          <nav aria-label="Footer" className="site-footer__nav">
            {columns.map((column) => (
              <LinkGroup key={column.title} title={column.title} links={column.links} />
            ))}
            <LinkGroup title="More from Optimize All" links={MORE_FROM_OPTIMIZE_ALL} />
            <LinkGroup title="Sign in" links={SIGN_IN_LINKS} />
          </nav>
        </div>
        <LegalRow onCookieSettings={onCookieSettings} social />
        <p className="site-footer__wordmark" aria-hidden="true">
          Optimize All
        </p>
      </div>
    </footer>
  );
}
