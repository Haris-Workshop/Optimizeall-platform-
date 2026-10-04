import { type ReactNode, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { type PartnerCard, usePartnerPlacement, usePartners } from './api';
import { PartnerAd, PartnerBand } from './PartnerCards';
import { PartnerFooterLine } from './PartnerFooter';
import { PartnerLogo, useNearViewport } from './PartnerParts';
import { slotKind, slotVariant, type PartnerListSlot, type PartnerUnitSlot } from './slots';
import { useImpression } from './tracking';
import './partners.css';

// The building blocks live in PartnerParts.tsx and the cards in PartnerCards.tsx; re-exported for existing imports.
export { PartnerLogo, PartnerOfferNote, SponsoredLink } from './PartnerParts';
export { PartnerAd } from './PartnerCards';

function StripLogo({ partner, slot }: { partner: PartnerCard; slot: PartnerListSlot }) {
  const ref = useRef<HTMLLIElement>(null);
  const { pathname } = useLocation();
  useImpression(ref, { partner: partner.slug, slot, path: pathname });
  return (
    <li ref={ref}>
      <Link to={partner.profilePath} className="partner-strip__item">
        <PartnerLogo partner={partner} size={48} />
        <span className="partner-strip__name">{partner.name}</span>
      </Link>
    </li>
  );
}

function names(partners: PartnerCard[]): ReactNode[] {
  return partners.flatMap((p, i) => [
    i === 0 ? null : i === partners.length - 1 ? ' and ' : ', ',
    <Link key={p.slug} to={p.profilePath}>
      {p.name}
    </Link>,
  ]);
}

/** Home page: "Official marketing partner of" logo strip plus the partnership statement. */
export function PartnerStrip({ partners, slot = 'home.partners' }: { partners: PartnerCard[]; slot?: PartnerListSlot }) {
  if (partners.length === 0) return null;
  return (
    <section className="partner-strip" aria-labelledby="partner-strip-title" data-partner-slot={slot}>
      <div className="container">
        <div className="partner-strip__inner">
        <div className="partner-strip__intro">
          <p className="eyebrow">Partners</p>
          <h2 id="partner-strip-title" className="partner-strip__title">
            Official marketing partner of
          </h2>
        </div>
        <ul className="partner-strip__logos">
          {partners.map((p) => (
            <StripLogo key={p.slug} partner={p} slot={slot} />
          ))}
        </ul>
        <p className="partner-strip__statement">
          Optimize All is the official marketing partner of {names(partners)}.{' '}
            <Link to="/partners" className="partner-strip__more">
              About our partners
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * One ad unit. Below the fold it asks the API only when it is about to be scrolled into view, and until the answer is
 * there it holds the card's room (class `partner-reserve--{variant}`), so nothing jumps when it arrives. The markup
 * comes from the query data alone, so the server's HTML and the hydrating client's agree.
 */
function UnitSlot({ slot, keywords, categories }: { slot: PartnerUnitSlot; keywords: string[]; categories: string[] }) {
  const { pathname } = useLocation();
  const holder = useRef<HTMLDivElement>(null);
  const near = useNearViewport(holder);
  const { data, isError } = usePartnerPlacement(slot, keywords, categories, pathname, near);
  if (data?.partner) return <PartnerAd partner={data.partner} slot={slot} />;
  if (isError || data) return null; // no partner for this slot and page: nothing to show
  return <div ref={holder} className={`partner-reserve partner-reserve--${slotVariant(slot)}`} aria-hidden="true" />;
}

function ListSlot({ slot }: { slot: PartnerListSlot }) {
  const { data, isPending } = usePartners();
  const partners = (data?.partners ?? []).filter((p) => p.slots.includes(slot));
  if (slot === 'footer.partners') return <PartnerFooterLine partners={partners} />;
  if (slot === 'home.band') {
    if (isPending) return <div className="partner-reserve partner-reserve--band" aria-hidden="true" />;
    return <PartnerBand partners={partners} slot={slot} />;
  }
  return <PartnerStrip partners={partners} slot={slot} />;
}

export interface PartnerSlotProps {
  /** A slot name from slots.ts (the `learn.*` slots are reserved for the academy). */
  slot: PartnerListSlot | PartnerUnitSlot;
  /** Page keywords: blog tags, the service name, course topics… */
  keywords?: string[];
  /** Page categories: blog category slugs, the service slug, the course category… */
  categories?: string[];
}

/**
 * A partner placement. List slots render every partner enabled for them; unit slots render at most one ad unit chosen by
 * the API from the page's keywords and categories (with rotation when nothing matches, and the slot's frequency cap),
 * labelled "Sponsored". Renders nothing when no partner is enabled, and every outbound link is `rel="sponsored noopener"`.
 *
 * @example <PartnerSlot slot="learn.course" keywords={course.tags} categories={[course.category]} />
 */
export function PartnerSlot({ slot, keywords = [], categories = [] }: PartnerSlotProps) {
  const kind = slotKind(slot);
  if (kind === 'List') return <ListSlot slot={slot as PartnerListSlot} />;
  if (kind === 'Unit') return <UnitSlot slot={slot as PartnerUnitSlot} keywords={keywords} categories={categories} />;
  return null;
}
