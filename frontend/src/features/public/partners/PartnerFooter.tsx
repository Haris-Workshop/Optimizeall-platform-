import { type ReactNode, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { type PartnerCard, usePartners } from './api';
import { useImpression } from './tracking';
import './partners.css';

// The footer line is on every public page, so it lives apart from the cards (PartnerCards.tsx) and the slot dispatch
// (PartnerSlot.tsx): the always-loaded website frame must not pull the card code in.

function FooterPartner({ partner, children }: { partner: PartnerCard; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { pathname } = useLocation();
  useImpression(ref, { partner: partner.slug, slot: 'footer.partners', path: pathname });
  return <span ref={ref}>{children}</span>;
}

/** Footer: "Optimize All is the official marketing partner of PCI AI and Certuvo." (internal profile links). */
export function PartnerFooterLine({ partners }: { partners: PartnerCard[] }) {
  if (partners.length === 0) return null;
  return (
    <p className="site-footer__partners" data-partner-slot="footer.partners">
      Optimize All is the official marketing partner of{' '}
      {partners.map((p, i) => (
        <FooterPartner key={p.slug} partner={p}>
          {i === 0 ? null : i === partners.length - 1 ? ' and ' : ', '}
          <Link to={p.profilePath}>{p.name}</Link>
        </FooterPartner>
      ))}
      .
    </p>
  );
}

/** The footer partner placement (the `footer.partners` list slot). */
export function PartnerFooter() {
  const { data } = usePartners();
  return <PartnerFooterLine partners={(data?.partners ?? []).filter((p) => p.slots.includes('footer.partners'))} />;
}
