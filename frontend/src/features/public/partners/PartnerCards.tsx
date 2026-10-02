import clsx from 'clsx';
import { Check } from 'lucide-react';
import { type ReactNode, useId, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { COPY_DEFAULTS, type SiteCopy, useSiteCopy } from '../site/copy';
import type { PartnerCard } from './api';
import { PartnerMark, PartnerOfferNote, SponsoredLink, themeClass } from './PartnerParts';
import { PartnerShare } from './PartnerShare';
import { slotVariant, type PartnerListSlot, type PartnerUnitSlot } from './slots';
import { useImpression } from './tracking';
import './partners.css';
import './partnerCards.css';

/**
 * The sponsored cards of the public site, one component per look (see `PartnerVariant` in slots.ts):
 *  - `hero`   a large card (academy hub); the home page's band is a row of them. At most one per page.
 *  - `kit`    the resource card: "Study kit" (Certuvo) / "Project controls toolkit" (PCI AI), at article ends and on courses.
 *  - `inline` the compact card inside articles and on service pages.
 *  - `bar`    one slim line (blog hub, services overview).
 * Every card shows the disclosure ("Sponsored · Optimize All is the official marketing partner of …"), every outbound link
 * is a SponsoredLink (rel="sponsored noopener", new tab, click counter with UTM tags), and the words come from the
 * partner record or the editable page copy (Website → Page copy → Partner placements). No inline styles: the brand
 * colours are classes (partnerCards.css).
 */

/** "Sponsored · Optimize All is the official marketing partner of PCI AI." (visible text on every card). */
export function Disclosure({ partner, className }: { partner: Pick<PartnerCard, 'relationshipLabel'>; className?: string }) {
  const copy = useSiteCopy();
  return (
    <p className={clsx('pcx__disclosure', className)}>
      <span className="partner-badge">{copy.text('partners.sponsored.label')}</span> <span aria-hidden="true">·</span>{' '}
      <span>{partner.relationshipLabel}.</span>
    </p>
  );
}

interface KitCopy {
  eyebrow: string;
  title: string;
  lead: string;
  items: string[];
  cta: string;
}

/** The words of a partner's resource card: its own copy keys when they exist, else the partner's tagline and highlights. */
export function kitCopy(copy: SiteCopy, partner: PartnerCard): KitCopy {
  const base = `partners.kit.${partner.slug}`;
  if (`${base}.title` in COPY_DEFAULTS) {
    return {
      eyebrow: copy.text(`${base}.eyebrow`),
      title: copy.text(`${base}.title`),
      lead: copy.text(`${base}.lead`),
      items: copy.list(`${base}.items`),
      cta: copy.text(`${base}.cta`),
    };
  }
  return {
    eyebrow: copy.text('partners.kit.default.eyebrow'),
    title: partner.name,
    lead: partner.tagline,
    items: [],
    cta: copy.text('partners.kit.default.cta', { host: partner.websiteHost ?? partner.name }),
  };
}

function Checklist({ items, label }: { items: string[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="pcx__list" aria-label={label}>
      {items.map((item) => (
        <li key={item}>
          <Check aria-hidden="true" width={16} height={16} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** The `hero`, `kit` and band cards: logo, label, headline, introduction, checklist, call to action, share row. */
function RichCard({
  partner,
  slot,
  variant,
  as: Tag = 'aside',
  titleTag: Title = 'p',
}: {
  partner: PartnerCard;
  slot: PartnerUnitSlot | PartnerListSlot;
  variant: 'hero' | 'kit';
  as?: 'aside' | 'article';
  titleTag?: 'p' | 'h3';
}) {
  const copy = useSiteCopy();
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const titleId = useId();
  useImpression(ref, { partner: partner.slug, slot, path: pathname });
  const kit = kitCopy(copy, partner);
  return (
    <Tag
      ref={ref as never}
      className={clsx('pcx', `pcx--${variant}`, themeClass(partner.slug))}
      aria-labelledby={Tag === 'article' ? titleId : undefined}
      aria-label={Tag === 'aside' ? `${copy.text('partners.sponsored.label')}: ${partner.name}` : undefined}
      data-partner-slot={slot}
      data-variant={variant}
    >
      <div className="pcx__head">
        <PartnerMark partner={partner} size={variant === 'hero' ? 'lg' : 'md'} />
        <div className="pcx__heading">
          <p className="pcx__eyebrow">{kit.eyebrow}</p>
          <Title id={titleId} className="pcx__title">
            {kit.title}
          </Title>
        </div>
      </div>
      <p className="pcx__lead">{kit.lead}</p>
      <Checklist items={kit.items} label={`${kit.eyebrow}: ${partner.name}`} />
      <PartnerOfferNote partner={partner} />
      <div className="pcx__actions">
        <SponsoredLink partner={partner} slot={slot} variant={variant === 'hero' ? 'highlight' : 'primary'} size={variant === 'hero' ? 'lg' : 'md'}>
          {kit.cta}
        </SponsoredLink>
        <Link to={partner.profilePath} className={buttonClasses('ghost', variant === 'hero' ? 'lg' : 'md')}>
          About {partner.name}
        </Link>
      </div>
      <PartnerShare partner={partner} className="pcx__share" />
      <Disclosure partner={partner} />
    </Tag>
  );
}

/** The slim bar: logo, one line, one button, share menu. */
function BarCard({ partner, slot }: { partner: PartnerCard; slot: PartnerUnitSlot }) {
  const copy = useSiteCopy();
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useImpression(ref, { partner: partner.slug, slot, path: pathname });
  return (
    <aside
      ref={ref}
      className={clsx('pcx pcx--bar', themeClass(partner.slug))}
      aria-label={`${copy.text('partners.sponsored.label')}: ${partner.name}`}
      data-partner-slot={slot}
      data-variant="bar"
    >
      <PartnerMark partner={partner} size="sm" />
      <div className="pcx__bar-text">
        <p className="pcx__bar-line">
          <span className="pcx__bar-label">{copy.text('partners.bar.label')}</span>
          <strong>{partner.name}</strong>
          <span className="pcx__bar-tagline"> — {partner.tagline}</span>
        </p>
        <Disclosure partner={partner} />
      </div>
      <div className="pcx__bar-actions">
        <SponsoredLink partner={partner} slot={slot} variant="secondary" size="sm">
          {copy.text('partners.bar.cta')}
          <span className="visually-hidden">: {partner.name}</span>
        </SponsoredLink>
        <PartnerShare partner={partner} layout="menu" />
      </div>
    </aside>
  );
}

/** The compact card (inside articles, service pages, case studies, academy lessons). */
function InlineCard({ partner, slot }: { partner: PartnerCard; slot: PartnerUnitSlot }) {
  const copy = useSiteCopy();
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useImpression(ref, { partner: partner.slug, slot, path: pathname });
  return (
    <aside
      ref={ref}
      className={clsx('partner-unit', themeClass(partner.slug))}
      aria-label={`${copy.text('partners.sponsored.label')}: ${partner.name}`}
      data-partner-slot={slot}
    >
      <p className="partner-unit__disclosure">
        <span className="partner-badge">{copy.text('partners.sponsored.label')}</span>
        <span className="partner-unit__kind">Partner</span>
      </p>
      <div className="partner-unit__body">
        <PartnerMark partner={partner} size="md" />
        <div className="partner-unit__text">
          <p className="partner-unit__name">{partner.name}</p>
          <p className="partner-unit__tagline">{partner.tagline}</p>
          <p className="partner-unit__relationship">{partner.relationshipLabel}.</p>
          <PartnerOfferNote partner={partner} />
        </div>
      </div>
      <div className="partner-unit__actions">
        <SponsoredLink partner={partner} slot={slot} variant="primary" size="sm">
          Visit {partner.websiteHost}
        </SponsoredLink>
        <Link to={partner.profilePath} className={buttonClasses('ghost', 'sm')}>
          About {partner.name}
        </Link>
        <PartnerShare partner={partner} layout="menu" />
      </div>
    </aside>
  );
}

/** One ad unit, labelled "Sponsored" (required disclosure), in the look of its slot. */
export function PartnerAd({ partner, slot }: { partner: PartnerCard; slot: PartnerUnitSlot }) {
  const variant = slotVariant(slot);
  if (variant === 'hero' || variant === 'kit') return <RichCard partner={partner} slot={slot} variant={variant} />;
  if (variant === 'bar') return <BarCard partner={partner} slot={slot} />;
  return <InlineCard partner={partner} slot={slot} />;
}

/**
 * Home page: a premium band with one resource card per partner — the page's only hero-size placement. The disclosure
 * is stated once for the band and again on each card.
 */
export function PartnerBand({ partners, slot = 'home.band' }: { partners: PartnerCard[]; slot?: PartnerListSlot }): ReactNode {
  const copy = useSiteCopy();
  const titleId = useId();
  if (partners.length === 0) return null;
  const names = partners.map((p) => p.name);
  const joined = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return (
    <section className="partner-band" aria-labelledby={titleId} data-partner-slot={slot}>
      <div className="container">
        <header className="partner-band__head">
          <p className="eyebrow">{copy.text('partners.band.eyebrow')}</p>
          <h2 id={titleId} className="partner-band__title">
            {copy.text('partners.band.title')}
          </h2>
          <p className="partner-band__intro">{copy.text('partners.band.intro')}</p>
          <p className="pcx__disclosure partner-band__disclosure">
            <span className="partner-badge">{copy.text('partners.sponsored.label')}</span> <span aria-hidden="true">·</span>{' '}
            <span>{copy.text('partners.band.disclosure', { names: joined })}</span>
          </p>
        </header>
        <ul className="partner-band__grid">
          {partners.map((p) => (
            <li key={p.slug}>
              <RichCard partner={p} slot={slot} variant="hero" as="article" titleTag="h3" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
