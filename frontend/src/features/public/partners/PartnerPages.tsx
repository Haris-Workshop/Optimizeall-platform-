import { Check, Info } from 'lucide-react';
import { useId, useRef } from 'react';
import clsx from 'clsx';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ButtonLink, Skeleton } from '@/components/ui';
import { isInternalHref } from '@/lib/safeHref';
import { PublicQueryState } from '../site/components';
import { useSiteCopy } from '../site/copy';
import { headFromSeo, useDocumentHead } from '../site/head';
import { Markdown } from '../site/Markdown';
import { useReveal } from '../site/motion';
import { CoCta, CoHero, CoSection } from '../pages/companyKit';
import { type PartnerCard, type PartnerOffering, type PartnerProfile, usePartner, usePartners } from './api';
import { PartnerLogo, PartnerOfferNote, SponsoredLink } from './PartnerSlot';
import { PartnerShare } from './PartnerShare';
import { themeClass } from './PartnerParts';
import { useImpression } from './tracking';
import './partners.css';
import { partnerLogoSources } from './logoSources';

/**
 * The partner directory (/partners) and each partner's profile (/partners/:slug), in the company pages' visual
 * language. Every outbound link is a sponsored partner link (SponsoredLink), every page shows the partnership
 * disclosure as visible text, and the words about each partner come from the API (the server renders the same content:
 * backend SeoPageResolver.Partners).
 */

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}


/** The disclosure shown on every partner page (visible text, not hidden in markup). */
function Disclosure({ name }: { name?: string }) {
  return (
    <div className="partner-disclosure" role="note">
      <Info aria-hidden="true" width={20} height={20} />
      <p>
        {name ? `${name} is an independent platform, separate from Optimize All. ` : 'Our partners are independent platforms. '}
        Optimize All is {name ? 'its' : 'their'} official marketing partner, so links to {name ? `${name}'s` : 'partner'} website are partner
        links and are marked as sponsored.
      </p>
    </div>
  );
}

function DirectoryCard({ partner }: { partner: PartnerCard }) {
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useImpression(ref, { partner: partner.slug, slot: 'partners.directory', path: pathname });
  return (
    <article ref={ref} className={clsx('partner-card', themeClass(partner.slug))}>
      <div className="partner-card__head">
        <PartnerLogo partner={partner} size={72} />
      </div>
      <h2 className="partner-card__title">
        <Link to={partner.profilePath}>{partner.name}</Link>
      </h2>
      <p className="partner-card__tagline">{partner.tagline}</p>
      <p className="partner-card__label">{partner.relationshipLabel}.</p>
      <PartnerOfferNote partner={partner} />
      <div className="partner-card__actions">
        <ButtonLink to={partner.profilePath} variant="secondary" size="sm">
          About {partner.name}
        </ButtonLink>
        <SponsoredLink partner={partner} slot="partners.directory" variant="ghost" size="sm">
          Visit {partner.websiteHost}
        </SponsoredLink>
      </div>
      <PartnerShare partner={partner} layout="menu" />
    </article>
  );
}

/** The directory hero's art: the partners' logos on a glass panel (decorative; the names are in the list below). */
function LogoConstellation({ partners }: { partners: PartnerCard[] }) {
  return (
    <div className="oa-co-glass partner-hero-logos" aria-hidden="true">
      {partners.slice(0, 4).map((p) => (
        <span key={p.slug} className={clsx('partner-hero-logos__item', themeClass(p.slug))}>
          <img src={p.logoUrl} {...partnerLogoSources(p.logoUrl, 96)} alt="" width={96} height={96} loading="lazy" decoding="async" />
        </span>
      ))}
    </div>
  );
}

/** LogoConstellation's room while the partners load, so the hero does not grow when they arrive. */
function LogoConstellationPlaceholder() {
  return (
    <div className="oa-co-glass partner-hero-logos" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} className="partner-hero-logos__item partner-hero-logos__item--pending" />
      ))}
    </div>
  );
}

/** /partners — every active partner with the partnership statement. */
export function PartnersPage() {
  const { data, isLoading, error } = usePartners();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const partners = data?.partners ?? [];
  const names = partners.map((p) => p.name);
  useDocumentHead(
    data ? headFromSeo(data.seo, data.jsonLd) : { title: copy.text('partners.index.title'), description: copy.text('partners.index.leadEmpty') },
  );
  return (
    <div ref={root} className="oa-co-page">
      <CoHero
        eyebrow={copy.text('partners.index.eyebrow')}
        title={copy.text('partners.index.title')}
        lead={names.length > 0 ? copy.text('partners.index.lead', { names: joinNames(names) }) : copy.text('partners.index.leadEmpty')}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Partners' }]}
        aside={
          isLoading ? <LogoConstellationPlaceholder /> : partners.length > 0 ? <LogoConstellation partners={partners} /> : undefined
        }
      />
      <div className="oa-co-section">
        <div className="container">
          <PublicQueryState error={error} isLoading={false} notFoundTitle="Partners are not available right now">
            {isLoading ? (
              <div className="partner-grid">
                <Skeleton height={300} />
                <Skeleton height={300} />
              </div>
            ) : (
              <ul className="partner-grid" data-reveal="stagger">
                {partners.map((p) => (
                  <li key={p.slug}>
                    <DirectoryCard partner={p} />
                  </li>
                ))}
              </ul>
            )}
            <div className="partner-disclosure-wrap">
              <Disclosure />
            </div>
          </PublicQueryState>
        </div>
      </div>
    </div>
  );
}

function OfferingCard({ item, index }: { item: PartnerOffering; index: number }) {
  return (
    <li className="partner-offering" id={item.anchor ?? undefined}>
      <span className="partner-offering__index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3>{item.link && isInternalHref(item.link) ? <Link to={item.link}>{item.title}</Link> : item.title}</h3>
      {item.summary && <p>{item.summary}</p>}
      {item.facts.length > 0 && (
        <ul className="partner-offering__facts" aria-label={`${item.title}: key facts`}>
          {item.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Offerings({ partner }: { partner: PartnerProfile }) {
  const copy = useSiteCopy();
  const cards = partner.offerings.filter((o) => o.summary || o.facts.length > 0);
  const chips = partner.offerings.filter((o) => !o.summary && o.facts.length === 0);
  if (partner.offerings.length === 0) return null;
  return (
    <CoSection tone="muted" eyebrow={copy.text('partners.profile.offeringsEyebrow')} title={`What ${partner.name} offers`}>
      {cards.length > 0 && (
        <ul className="partner-offerings" data-reveal="stagger">
          {cards.map((o, i) => (
            <OfferingCard key={o.anchor ?? o.title} item={o} index={i} />
          ))}
        </ul>
      )}
      {chips.length > 0 && (
        <div className="partner-chips">
          <h3>{cards.length > 0 ? 'Also' : 'Covers'}</h3>
          <ul className="oa-co-chips">
            {chips.map((o) => (
              <li key={o.anchor ?? o.title} id={o.anchor ?? undefined} className="oa-co-chip">
                {o.link && isInternalHref(o.link) ? <Link to={o.link}>{o.title}</Link> : o.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </CoSection>
  );
}

/** /partners/:slug — an indexable, content-rich profile of one partner (JSON-LD Organization + WebPage from the API). */
export function PartnerProfilePage() {
  const { slug = '' } = useParams();
  const { data: p, isLoading, error } = usePartner(slug);
  useDocumentHead(p ? headFromSeo(p.seo, p.jsonLd) : { title: 'Partner' });
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const aboutId = useId();
  const glanceId = useId();
  const copy = useSiteCopy();
  useImpression(ref, p ? { partner: p.slug, slot: 'partners.profile', path: pathname } : null);
  useReveal(ref);

  return (
    <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="We couldn't find that partner" backTo={{ to: '/partners', label: 'See all partners' }}>
      {p && (
        <div ref={ref} className="oa-co-page">
          <CoHero
            eyebrow={copy.text('partners.profile.eyebrow')}
            title={p.name}
            lead={p.tagline}
            breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Partners', to: '/partners' }, { label: p.name }]}
            actions={
              <>
                <SponsoredLink partner={p} slot="partners.profile" variant="highlight" size="lg">
                  Visit {p.websiteHost}
                </SponsoredLink>
                <ButtonLink to="/partners" variant="secondary" size="lg">
                  {copy.text('partners.profile.allPartners')}
                </ButtonLink>
                <PartnerShare partner={{ slug: p.slug, name: p.name, tagline: p.tagline, profilePath: `/partners/${p.slug}` }} className="partner-hero-share" />
              </>
            }
            aside={
              <div className={clsx('partner-hero-card', themeClass(p.slug))}>
                <PartnerLogo partner={p} size={152} />
                <p>{p.relationshipLabel}.</p>
              </div>
            }
          />

          <div className="oa-co-section">
            <div className="container partner-profile">
              <div className="partner-profile__main">
                <Disclosure name={p.name} />
                {p.descriptionMarkdown && (
                  <section aria-labelledby={aboutId} className="partner-profile__about">
                    <h2 id={aboutId} className="oa-co-subtitle">
                      About {p.name}
                    </h2>
                    <Markdown source={p.descriptionMarkdown} minLevel={3} />
                  </section>
                )}
              </div>
              {(p.highlights.length > 0 || p.offer) && (
                <aside className="partner-profile__aside" aria-labelledby={glanceId}>
                  <div className="oa-co-panel">
                    <h2 id={glanceId} className="oa-co-panel__title">
                      {p.name} at a glance
                    </h2>
                    {p.highlights.length > 0 && (
                      <ul className="oa-co-checks">
                        {p.highlights.map((h) => (
                          <li key={h}>
                            <Check aria-hidden="true" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {p.offer && (
                    <div className="partner-offer-box">
                      <PartnerOfferNote partner={{ ...p, profilePath: '', slots: [] }} />
                      <SponsoredLink partner={p} slot="partners.profile" variant="secondary" size="sm">
                        {copy.text('partners.profile.offerCta')}
                      </SponsoredLink>
                    </div>
                  )}
                </aside>
              )}
            </div>
          </div>

          <Offerings partner={p} />

          {p.related.length > 0 && (
            <CoSection title={copy.text('partners.profile.related')}>
              <ul className="partner-grid">
                {p.related.map((r) => (
                  <li key={r.slug}>
                    <article className={clsx('partner-card partner-card--compact', themeClass(r.slug))}>
                      <div className="partner-card__head">
                        <PartnerLogo partner={r} size={56} />
                        <h3 className="partner-card__title">
                          <Link to={r.profilePath}>{r.name}</Link>
                        </h3>
                      </div>
                      <p className="partner-card__tagline">{r.tagline}</p>
                    </article>
                  </li>
                ))}
              </ul>
            </CoSection>
          )}

          {p.visitUrl && (
            <CoCta eyebrow={copy.text('partners.profile.eyebrow')} title={`Learn more at ${p.websiteHost}`}>
              <div className="oa-co-hero__actions">
                <SponsoredLink partner={p} slot="partners.profile" variant="highlight" size="lg">
                  Visit {p.websiteHost}
                </SponsoredLink>
              </div>
            </CoCta>
          )}
        </div>
      )}
    </PublicQueryState>
  );
}
