import { Check, Info } from 'lucide-react';
import { useId, useRef, type CSSProperties } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ButtonLink, Skeleton } from '@/components/ui';
import { isInternalHref } from '@/lib/safeHref';
import { PublicQueryState } from '../site/components';
import { headFromSeo, useDocumentHead } from '../site/head';
import { Markdown } from '../site/Markdown';
import { useReveal } from '../site/motion';
import { CoCta, CoHero, CoSection } from '../pages/companyKit';
import { type PartnerCard, type PartnerOffering, type PartnerProfile, usePartner, usePartners } from './api';
import { PartnerLogo, PartnerOfferNote, SponsoredLink } from './PartnerSlot';
import { useImpression } from './tracking';
import './partners.css';

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

const accent = (color: string | null): CSSProperties | undefined => (color ? ({ '--partner-accent': color } as CSSProperties) : undefined);

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
    <article ref={ref} className="partner-card" style={accent(partner.brandColor)}>
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
    </article>
  );
}

/** The directory hero's art: the partners' logos on a glass panel (decorative; the names are in the list below). */
function LogoConstellation({ partners }: { partners: PartnerCard[] }) {
  return (
    <div className="oa-co-glass partner-hero-logos" aria-hidden="true">
      {partners.slice(0, 4).map((p) => (
        <span key={p.slug} className="partner-hero-logos__item" style={accent(p.brandColor)}>
          <img src={p.logoUrl} alt="" width={96} height={96} loading="lazy" decoding="async" />
        </span>
      ))}
    </div>
  );
}

/** /partners — every active partner with the partnership statement. */
export function PartnersPage() {
  const { data, isLoading, error } = usePartners();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const partners = data?.partners ?? [];
  const names = partners.map((p) => p.name);
  useDocumentHead(
    data ? headFromSeo(data.seo, data.jsonLd) : { title: 'Our partners', description: 'Organizations Optimize All is the official marketing partner of.' },
  );
  return (
    <div ref={root} className="oa-co-page">
      <CoHero
        eyebrow="Partners"
        title="Our partners"
        lead={
          names.length > 0
            ? `Optimize All is the official marketing partner of ${joinNames(names)}. Each is an independent platform; here is what they offer.`
            : 'Organizations Optimize All is the official marketing partner of.'
        }
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Partners' }]}
        aside={partners.length > 0 ? <LogoConstellation partners={partners} /> : undefined}
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
  const cards = partner.offerings.filter((o) => o.summary || o.facts.length > 0);
  const chips = partner.offerings.filter((o) => !o.summary && o.facts.length === 0);
  if (partner.offerings.length === 0) return null;
  return (
    <CoSection tone="muted" eyebrow="Offerings" title={`What ${partner.name} offers`}>
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
  useImpression(ref, p ? { partner: p.slug, slot: 'partners.profile', path: pathname } : null);
  useReveal(ref);

  return (
    <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="We couldn't find that partner">
      {p && (
        <div ref={ref} className="oa-co-page">
          <CoHero
            eyebrow="Official marketing partner"
            title={p.name}
            lead={p.tagline}
            breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Partners', to: '/partners' }, { label: p.name }]}
            actions={
              <>
                <SponsoredLink partner={p} slot="partners.profile" variant="highlight" size="lg">
                  Visit {p.websiteHost}
                </SponsoredLink>
                <ButtonLink to="/partners" variant="secondary" size="lg">
                  All partners
                </ButtonLink>
              </>
            }
            aside={
              <div className="partner-hero-card" style={accent(p.brandColor)}>
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
                        Get the offer
                      </SponsoredLink>
                    </div>
                  )}
                </aside>
              )}
            </div>
          </div>

          <Offerings partner={p} />

          {p.related.length > 0 && (
            <CoSection title="Related partners">
              <ul className="partner-grid">
                {p.related.map((r) => (
                  <li key={r.slug}>
                    <article className="partner-card partner-card--compact" style={accent(r.brandColor)}>
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
            <CoCta eyebrow="Official marketing partner" title={`Learn more at ${p.websiteHost}`}>
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
