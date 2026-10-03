import { ArrowUpRight } from 'lucide-react';
import { type RefObject, type ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/components/ui/buttonStyles';
import { siteDate } from '../site/format';
import type { PartnerCard } from './api';
import { partnerLogoSources } from './logoSources';
import { SPONSORED_REL, visitHref } from './partnerLinks';
import type { PartnerSlotName } from './slots';

/**
 * The building blocks every partner placement shares: the sponsored outbound link, the logo, the offer note and the
 * brand theme class. The cards themselves are in PartnerCards.tsx, the slot dispatch in PartnerSlot.tsx.
 */

/**
 * An outbound link to a partner. Every such link is a partnership link, so it always carries `rel="sponsored noopener"`
 * and opens in a new tab (Google's link-spam policy); it goes through the click counter, which adds the UTM tags.
 * Renders nothing while the partner has no website.
 */
export function SponsoredLink({
  partner,
  slot,
  children,
  variant,
  size = 'md',
  className,
}: {
  partner: Pick<PartnerCard, 'visitUrl' | 'name'>;
  slot: PartnerSlotName;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { pathname } = useLocation();
  const href = visitHref(partner.visitUrl, slot, pathname);
  if (!href) return null;
  return (
    <a href={href} rel={SPONSORED_REL} target="_blank" className={variant ? buttonClasses(variant, size, { className }) : className}>
      {children}
      <ArrowUpRight aria-hidden="true" width={16} height={16} />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

/** The partners whose brand colours are defined in partnerCards.css (class names, so no inline styles are needed). */
const THEMED = new Set(['pci-ai', 'certuvo']);

/** The class that sets a partner's brand colours on a card (a neutral theme for other partners). */
export function themeClass(slug: string): string {
  return THEMED.has(slug) ? `partner-theme--${slug}` : 'partner-theme--default';
}

export function PartnerLogo({ partner, size = 56 }: { partner: Pick<PartnerCard, 'logoUrl' | 'name'>; size?: number }) {
  return (
    <span className={`partner-logo partner-logo--${[48, 56, 72, 96, 152].includes(size) ? size : 56}`}>
      <img
        src={partner.logoUrl}
        {...partnerLogoSources(partner.logoUrl, size)}
        alt={`${partner.name} logo`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

/** A partner logo sized by class (`sm` 44px, `md` 56px, `lg` 72px): the logo of the new cards, with no inline style. */
export function PartnerMark({ partner, size = 'md' }: { partner: Pick<PartnerCard, 'logoUrl' | 'name'>; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 44 : size === 'md' ? 56 : 72;
  return (
    <span className={`partner-logo partner-mark partner-mark--${size}`}>
      <img
        src={partner.logoUrl}
        {...partnerLogoSources(partner.logoUrl, px)}
        alt={`${partner.name} logo`}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

export function PartnerOfferNote({ partner }: { partner: PartnerCard }) {
  if (!partner.offer) return null;
  return (
    <p className="partner-offer">
      <span>{partner.offer.text}</span>
      {partner.offer.code && (
        <>
          {' '}
          — code <code className="partner-offer__code">{partner.offer.code}</code>
        </>
      )}
      {partner.offer.expiresAt && (
        <span className="partner-offer__until"> (until {siteDate(partner.offer.expiresAt)})</span>
      )}
    </p>
  );
}

/**
 * True once the element is within a screen or so of the viewport (immediately on the server and where
 * IntersectionObserver is missing). Below-the-fold placements fetch their data only then, so they never compete with
 * the page's first paint; their markup never depends on this value, so hydration is unaffected.
 */
export function useNearViewport(ref: RefObject<Element>): boolean {
  const [near, setNear] = useState(() => typeof window === 'undefined' || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, ref]);
  return near;
}
