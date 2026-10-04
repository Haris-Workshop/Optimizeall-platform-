import clsx from 'clsx';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { defaultLandingPath } from '@/app/portals';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ButtonLink } from '@/components/ui';
import { useAuth } from '@/lib/auth/useAuth';
import { isExternalHref, isInternalHref } from '@/lib/safeHref';
import { type MenuCategory, type MenuItem, useSite } from './api';
import { useSiteCopy } from './copy';
import { DEFAULT_PRODUCT_LINKS, DEFAULT_SECONDARY_LINK, productChrome, SiteLogo } from './layout';
import { SiteIcon } from './icons';
import { MobileMenu } from './MobileMenu';
import type { ChromeVariant } from './variant';

/**
 * Agency navigation shown until (or if) the site settings can't be loaded. Mirrors SiteSettingsService.Defaults.
 * The academy and the creator programme are separate products reached by one quiet link each (header, drawer, footer),
 * not menu items: Services (mega) | Industries | Case studies | Insights | Partners | About.
 */
export const FALLBACK_MENU: MenuItem[] = [
  { label: 'Services', url: '/services', description: null, children: [] },
  { label: 'Industries', url: '/industries', description: null, children: null },
  { label: 'Case studies', url: '/case-studies', description: null, children: null },
  { label: 'Insights', url: '/blog', description: null, children: null },
  { label: 'Partners', url: '/partners', description: null, children: null },
  {
    label: 'About',
    url: '/about',
    description: null,
    children: [
      { label: 'About us', url: '/about', description: 'Who we are and what we stand for.', children: null },
      { label: 'How we work', url: '/how-we-work', description: 'Audit, strategy, execution, reporting.', children: null },
      { label: 'Team', url: '/team', description: 'The people behind your results.', children: null },
      { label: 'Careers', url: '/careers', description: 'Join the team.', children: null },
      { label: 'Contact', url: '/contact', description: 'Talk to us.', children: null },
    ],
  },
];

/** Hints shown under the sibling products in the mobile menu (by link target). */
const PRODUCT_HINTS: Record<string, string> = { '/learn': 'Free courses', '/creators': 'Earn from campaigns' };

/** The agency's one primary call to action. */
export const AGENCY_CTA = { label: 'Book a consultation', url: '/book-a-consultation' };
export const ACADEMY_CTA = { label: 'Start learning free', url: '/learn' };
export const CREATORS_CTA = { label: 'Create a creator account', url: '/register?audience=creator' };

/** Academy navigation: Courses | Learning paths | Certificates | Verify a certificate (defaults; Site settings → Academy & Creators). */
export const ACADEMY_NAV: { label: string; url: string }[] = [
  { label: 'Courses', url: '/learn' },
  { label: 'Learning paths', url: '/learn/paths' },
  { label: 'Certificates', url: '/learn#certificates' },
  { label: 'Verify a certificate', url: '/verify' },
];

/** Creators navigation (the FAQ is its own page; the anchors are sections of the /creators landing page). */
export const CREATORS_NAV: { label: string; url: string }[] = [
  { label: 'How it works', url: '/creators#how-it-works' },
  { label: 'FAQ', url: '/creators/faq' },
  { label: 'Campaign rules', url: '/creators#rules' },
];

/**
 * The CMS menu as the agency header shows it. Stored menus from before the academy became a separate product may still
 * list it (an Academy group, /learn, /academy) or the creator programme under About: those never belong in the agency nav.
 */
export function agencyMenu(menu: MenuItem[]): MenuItem[] {
  const separate = (url: string | null) => !!url && /^\/(academy|learn|creators)(\/|\?|#|$)/.test(url);
  return menu
    .filter((item) => !separate(item.url))
    .map((item) => (item.children ? { ...item, children: item.children.filter((c) => !separate(c.url)) } : item));
}

/** The header call to action from the site settings, unless it is a leftover pointing at another product. */
export function agencyCta(cta: { label: string; url: string } | null | undefined) {
  return cta && isInternalHref(cta.url) && !/^\/(learn|academy|creators|free-audit)(\/|\?|#|$)/.test(cta.url) ? cta : AGENCY_CTA;
}

function focusables(panel: HTMLElement | null): HTMLElement[] {
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>('a[href]')) : [];
}

/**
 * A disclosure-style dropdown (WAI-ARIA "disclosure navigation"): the trigger is a button with aria-expanded; Enter,
 * Space or ArrowDown opens and focuses the first link; arrow keys, Home and End move between links; Escape closes and
 * returns focus to the trigger; tabbing out closes it.
 */
function Dropdown({
  label,
  wide,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusFirstOnOpen = useRef(false);

  useEffect(() => {
    if (open && focusFirstOnOpen.current) {
      focusFirstOnOpen.current = false;
      focusables(panelRef.current)[0]?.focus();
    }
  }, [open]);

  const close = (restoreFocus: boolean) => {
    onOpenChange(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || ((e.key === 'Enter' || e.key === ' ') && !open)) {
      e.preventDefault();
      focusFirstOnOpen.current = true;
      if (open) focusables(panelRef.current)[0]?.focus();
      else onOpenChange(true);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      close(true);
    }
  };

  // Arrow keys, Home/End and Escape inside the open panel (a native listener: the panel is not itself interactive).
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const links = focusables(panel);
      const index = links.indexOf(document.activeElement as HTMLElement);
      const move = (to: number) => {
        e.preventDefault();
        links[(to + links.length) % links.length]?.focus();
      };
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current(true);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') move(index + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') move(index - 1);
      else if (e.key === 'Home') move(0);
      else if (e.key === 'End') move(links.length - 1);
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="site-nav__item"
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) onOpenChange(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={clsx('public-header__link site-nav__trigger', open && 'is-open')}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        onKeyDown={onTriggerKeyDown}
      >
        {label}
        <ChevronDown aria-hidden="true" className="site-nav__chevron" />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        className={clsx('site-nav__panel', wide && 'site-nav__panel--mega')}
        hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The services mega-menu: every service line with its services, beside a dark "start here" card (free audit, all
 * services, pricing). Words on the card come from the editable page copy (`shared.header.mega*`).
 */
function ServicesMega({ categories, onNavigate }: { categories: MenuCategory[]; onNavigate: () => void }) {
  const copy = useSiteCopy();
  if (categories.length === 0)
    return (
      <Link to="/services" className="site-mega__all" onClick={onNavigate}>
        Explore all services <ArrowRight aria-hidden="true" />
      </Link>
    );
  return (
    <div className="site-mega">
      <div className="site-mega__grid">
        {categories.map((category) => (
          <div key={category.slug} className="site-mega__col">
            <p className="site-mega__heading">
              <span className="site-mega__icon" aria-hidden="true">
                <SiteIcon name={category.icon} />
              </span>
              {category.name}
            </p>
            <ul>
              {category.services.map((service) => (
                <li key={service.slug}>
                  <Link to={`/services/${service.slug}`} onClick={onNavigate} className="site-mega__link">
                    {service.name}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="site-mega__feature">
        <p className="site-mega__eyebrow">{copy.text('shared.header.megaEyebrow')}</p>
        <p className="site-mega__title">{copy.text('shared.header.megaTitle')}</p>
        <p className="site-mega__text">{copy.text('shared.header.megaText')}</p>
        <ul className="site-mega__more">
          <li>
            <Link to="/services" onClick={onNavigate} className="site-mega__all">
              All services <ArrowUpRight aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link to="/pricing" onClick={onNavigate} className="site-mega__all">
              Pricing <ArrowUpRight aria-hidden="true" />
            </Link>
          </li>
        </ul>
        <Link to="/free-audit" onClick={onNavigate} className="site-mega__cta">
          {copy.text('shared.header.megaCta')} <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function MenuLink({ item, className, onClick }: { item: MenuItem; className?: string; onClick?: () => void }) {
  if (!item.url) return <span className={className}>{item.label}</span>;
  if (isInternalHref(item.url))
    return (
      <NavLink to={item.url} className={className} onClick={onClick} end={item.url === '/'}>
        {item.label}
      </NavLink>
    );
  // Only http(s) addresses become links: a stored javascript:/data: value renders as plain text (the API refuses them too).
  if (!isExternalHref(item.url)) return <span className={className}>{item.label}</span>;
  return (
    <a href={item.url} className={className} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {item.label}
    </a>
  );
}


/** A top-level link; hash links (/learn#certificates) never claim "current page". */
function NavItem({ url, label, className = 'public-header__link' }: { url: string; label: string; className?: string }) {
  if (url.includes('#') || url.includes('?'))
    return (
      <Link to={url} className={className}>
        {label}
      </Link>
    );
  return (
    <NavLink to={url} end className={className}>
      {label}
    </NavLink>
  );
}

/**
 * True once the page has scrolled past the top: the header then gains its frosted backdrop and hairline. Only paint
 * changes (the header keeps its height, so nothing below it shifts).
 */
function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [threshold]);
  return scrolled;
}

/**
 * The shared header frame: brand, a "Main" navigation, actions and the mobile menu. Each variant fills the slots, so
 * focus order is always brand, navigation, actions, menu button.
 */
function HeaderShell({
  variant,
  brand,
  nav,
  actions,
  drawer,
}: {
  variant: ChromeVariant;
  brand: ReactNode;
  nav: ReactNode;
  actions: ReactNode;
  /** The mobile menu's contents. */
  drawer: ReactNode;
}) {
  const scrolled = useScrolled();
  return (
    <header className={clsx('public-header site-header', `site-header--${variant}`)} data-scrolled={scrolled ? '' : undefined}>
      <div className="container public-header__inner">
        {brand}
        <nav aria-label="Main" className="public-header__nav site-nav">
          {nav}
        </nav>
        <div className="public-header__actions">
          {actions}
          <MobileMenu title="Menu" headerContent={<SiteLogo size={26} />}>
            <nav aria-label="Mobile" className="public-drawer site-drawer">
              {drawer}
            </nav>
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}

function SignInAction({ to, label }: { to: string; label: string }) {
  return (
    <div className="public-header__auth">
      <ButtonLink to={to} variant="ghost" size="sm">
        {label}
      </ButtonLink>
    </div>
  );
}

/** Where "Sign in" becomes a dashboard link once signed in. */
function useAccountLink(preferred?: { path: string; label: string }) {
  const { status, user } = useAuth();
  if (status === 'authenticated' && user) {
    if (preferred) {
      const path = defaultLandingPath(user.permissions, preferred.path);
      if (path === preferred.path) return { signedIn: true, to: path, label: preferred.label };
    }
    return { signedIn: true, to: defaultLandingPath(user.permissions), label: 'Go to dashboard' };
  }
  return { signedIn: false, to: '/login', label: 'Sign in' };
}

/** Plain secondary links at the end of the mobile sheet (not buttons). */
function DrawerLinks({ links, title }: { links: { label: string; url: string; hint?: string }[]; title: string }) {
  return (
    <div className="site-drawer__more">
      <p className="site-drawer__label">{title}</p>
      <ul>
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.url} className="site-drawer__sublink">
              {l.label}
              {l.hint && <span className="site-drawer__hint"> {l.hint}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- agency

function AgencyHeader() {
  const { data: site } = useSite();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menu = agencyMenu(site?.header.menu?.length ? site.header.menu : FALLBACK_MENU);
  const categories = site?.serviceMenu ?? [];
  const cta = agencyCta(site?.header.cta);
  // The quiet link next to the button (Site settings → Navigation); only same-site links (the Link router).
  const quiet = site?.header.secondaryLink && isInternalHref(site.header.secondaryLink.url) ? site.header.secondaryLink : DEFAULT_SECONDARY_LINK;
  const productLinks = site?.footer.productLinks ?? DEFAULT_PRODUCT_LINKS;
  const copy = useSiteCopy();
  const account = useAccountLink();
  const closeAll = useCallback(() => setOpenMenu(null), []);
  useEffect(() => setOpenMenu(null), [location.pathname]);

  const isMega = (item: MenuItem) => item.url === '/services';
  const hasMenu = (item: MenuItem) => isMega(item) || (item.children?.length ?? 0) > 0;

  return (
    <HeaderShell
      variant="agency"
      brand={
        <Link to="/" className="public-header__brand" aria-label="Optimize All home">
          <SiteLogo size={30} />
        </Link>
      }
      nav={
        <ul>
          {menu.map((item) => (
            <li key={item.label}>
              {hasMenu(item) ? (
                <Dropdown
                  label={item.label}
                  wide={isMega(item)}
                  open={openMenu === item.label}
                  onOpenChange={(open) => setOpenMenu(open ? item.label : null)}
                >
                  {isMega(item) ? (
                    <ServicesMega categories={categories} onNavigate={closeAll} />
                  ) : (
                    <ul className="site-nav__list">
                      {item.children!.map((child) => (
                        <li key={child.label} className="site-nav__entry">
                          <MenuLink item={child} className="site-nav__sublink" onClick={closeAll} />
                          {child.description && <span className="site-nav__desc">{child.description}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Dropdown>
              ) : (
                <MenuLink item={item} className="public-header__link" />
              )}
            </li>
          ))}
        </ul>
      }
      actions={
        <>
          <ThemeToggle />
          <Link to={quiet.url} className="site-header__product">
            {quiet.label}
          </Link>
          <SignInAction to={account.to} label={account.label} />
          <ButtonLink to={cta.url} variant="highlight" size="sm" className="site-header__cta">
            {cta.label}
          </ButtonLink>
        </>
      }
      drawer={
        <>
          <ul>
            {menu.map((item) =>
              hasMenu(item) ? (
                <li key={item.label}>
                  <details className="site-drawer__group">
                    <summary className="public-drawer__link">{item.label}</summary>
                    <ul>
                      {isMega(item) ? (
                        <>
                          <li>
                            <Link to="/services" className="site-drawer__sublink">
                              All services
                            </Link>
                          </li>
                          {categories.map((c) => (
                            <li key={c.slug}>
                              <span className="site-drawer__label">{c.name}</span>
                              <ul>
                                {c.services.map((s) => (
                                  <li key={s.slug}>
                                    <Link to={`/services/${s.slug}`} className="site-drawer__sublink">
                                      {s.name}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </>
                      ) : (
                        item.children!.map((child) => (
                          <li key={child.label}>
                            <MenuLink item={child} className="site-drawer__sublink" />
                          </li>
                        ))
                      )}
                    </ul>
                  </details>
                </li>
              ) : (
                <li key={item.label}>
                  <MenuLink item={item} className="public-drawer__link" />
                </li>
              ),
            )}
          </ul>
          <div className="public-drawer__actions">
            <ButtonLink to={cta.url} variant="highlight" fullWidth>
              {cta.label}
            </ButtonLink>
            <ButtonLink to={account.to} variant="secondary" fullWidth>
              {account.label}
            </ButtonLink>
          </div>
          <DrawerLinks
            title={copy.text('shared.header.productsTitle')}
            links={productLinks.filter((l) => isInternalHref(l.url)).map((l) => ({ ...l, hint: PRODUCT_HINTS[l.url] }))}
          />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------- academy

function AcademyHeader() {
  const { data: site } = useSite();
  const { nav, cta } = productChrome(site, 'academy');
  const siteName = site?.siteName ?? 'Optimize All';
  const account = useAccountLink({ path: '/app/learning', label: 'My learning' });
  return (
    <HeaderShell
      variant="academy"
      brand={
        <Link to="/learn" className="public-header__brand site-header__product-brand" aria-label="Optimize All Academy home">
          <SiteLogo size={30} />{' '}
          <span className="site-header__wordmark">Academy</span>
        </Link>
      }
      nav={
        <ul>
          {nav.map((item) => (
            <li key={item.label}>
              <NavItem url={item.url} label={item.label} />
            </li>
          ))}
        </ul>
      }
      actions={
        <>
          <ThemeToggle />
          <Link to="/" className="site-header__product">
            <ArrowLeft aria-hidden="true" className="site-header__back" />
            {siteName}
          </Link>
          <SignInAction to={account.to} label={account.label} />
          <ButtonLink to={cta.url} variant="highlight" size="sm" className="site-header__cta">
            {cta.label}
          </ButtonLink>
        </>
      }
      drawer={
        <>
          <ul>
            {nav.map((item) => (
              <li key={item.label}>
                <NavItem url={item.url} label={item.label} className="public-drawer__link" />
              </li>
            ))}
          </ul>
          <div className="public-drawer__actions">
            <ButtonLink to={cta.url} variant="highlight" fullWidth>
              {cta.label}
            </ButtonLink>
            <ButtonLink to={account.to} variant="secondary" fullWidth>
              {account.label}
            </ButtonLink>
          </div>
          <DrawerLinks title={siteName} links={[{ label: `← ${siteName}`, url: '/', hint: 'Marketing agency' }]} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------- creators

function CreatorsHeader() {
  const { data: site } = useSite();
  const copy = useSiteCopy();
  const { nav, cta } = productChrome(site, 'creators');
  const siteName = site?.siteName ?? 'Optimize All';
  const creatorSignIn = copy.text('shared.header.creatorSignIn');
  const account = useAccountLink();
  return (
    <HeaderShell
      variant="creators"
      brand={
        <Link to="/creators" className="public-header__brand site-header__product-brand" aria-label="Optimize All Creators home">
          <SiteLogo size={30} />{' '}
          <span className="site-header__wordmark">Creators</span>
        </Link>
      }
      nav={
        <ul>
          {nav.map((item) => (
            <li key={item.label}>
              <NavItem url={item.url} label={item.label} />
            </li>
          ))}
        </ul>
      }
      actions={
        <>
          <ThemeToggle />
          <Link to="/" className="site-header__product">
            <ArrowLeft aria-hidden="true" className="site-header__back" />
            {siteName}
          </Link>
          <SignInAction to={account.to} label={account.signedIn ? account.label : creatorSignIn} />
          {!account.signedIn && (
            <ButtonLink to={cta.url} variant="highlight" size="sm" className="site-header__cta">
              {cta.label}
            </ButtonLink>
          )}
        </>
      }
      drawer={
        <>
          <ul>
            {nav.map((item) => (
              <li key={item.label}>
                <NavItem url={item.url} label={item.label} className="public-drawer__link" />
              </li>
            ))}
          </ul>
          <div className="public-drawer__actions">
            {account.signedIn ? (
              <ButtonLink to={account.to} variant="highlight" fullWidth>
                {account.label}
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to={cta.url} variant="highlight" fullWidth>
                  {cta.label}
                </ButtonLink>
                <ButtonLink to={account.to} variant="secondary" fullWidth>
                  {creatorSignIn}
                </ButtonLink>
              </>
            )}
          </div>
          <DrawerLinks title={siteName} links={[{ label: `← ${siteName}`, url: '/', hint: 'Marketing agency' }]} />
        </>
      }
    />
  );
}

/** The site header for a route's variant (see ./variant.ts). */
export function SiteHeader({ variant = 'agency' }: { variant?: ChromeVariant }) {
  if (variant === 'academy') return <AcademyHeader />;
  if (variant === 'creators') return <CreatorsHeader />;
  return <AgencyHeader />;
}
