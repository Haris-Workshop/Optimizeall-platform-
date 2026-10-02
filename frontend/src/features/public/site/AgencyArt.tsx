import clsx from 'clsx';
import type { CSSProperties } from 'react';
import { LogoMark } from '@/components/brand/Logo';
import { SiteIcon } from './icons';
import { useInViewClass } from './motion';

/**
 * Decorative hero art for the agency pages, drawn with HTML, CSS and inline SVG only (no images, CSP-safe). All of it
 * is aria-hidden and carries no figures or claims: shapes and the icons of the agency's own service lines and sectors
 * (from the API). Loops run only while on screen (`is-inview`) and never for reduced motion (agency-pages.css).
 */

export interface ArtNode {
  name: string;
  icon: string | null;
}

/** /services: the service lines as a constellation of tiles around the brand mark, a signal crossing between them. */
export function CapabilityArt({ lines }: { lines: ArtNode[] }) {
  const ref = useInViewClass<HTMLDivElement>();
  const tiles = lines.slice(0, 8);
  return (
    <div ref={ref} className="oa-art-cap" aria-hidden="true">
      <svg className="oa-art-cap__grid" viewBox="0 0 400 400" focusable="false">
        <defs>
          <radialGradient id="oa-art-cap-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fcb31e" stopOpacity="0.2" />
            <stop offset="0.6" stopColor="#4855a3" stopOpacity="0.1" />
            <stop offset="1" stopColor="#4855a3" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="196" fill="url(#oa-art-cap-glow)" />
        <rect className="oa-art-cap__frame" x="26" y="26" width="348" height="348" rx="36" />
        <path className="oa-art-cap__cross" d="M200 26V374M26 200H374" />
        <path className="oa-art-cap__signal" d="M80 80 L200 200 L320 320" pathLength={1} />
        <path className="oa-art-cap__signal oa-art-cap__signal--b" d="M320 80 L200 200 L80 320" pathLength={1} />
      </svg>
      <ul className="oa-art-cap__tiles">
        {tiles.map((t, i) => (
          <li key={t.name} style={{ '--i': i } as CSSProperties}>
            <SiteIcon name={t.icon} />
            <span>{t.name}</span>
          </li>
        ))}
      </ul>
      <div className="oa-art-cap__hub">
        <LogoMark size={56} title="" />
      </div>
    </div>
  );
}

/** /industries and an industry page: the sector icon(s) on concentric rings. */
export function SectorArt({ sectors, focus }: { sectors: ArtNode[]; focus?: ArtNode }) {
  const ref = useInViewClass<HTMLDivElement>();
  const ring = sectors.filter((s) => s.name !== focus?.name).slice(0, 8);
  const angle = (i: number) => (-90 + (i * 360) / Math.max(ring.length, 1)) * (Math.PI / 180);
  return (
    <div ref={ref} className={clsx('oa-art-sector', focus && 'oa-art-sector--focus')} aria-hidden="true">
      <svg className="oa-art-sector__rings" viewBox="0 0 400 400" focusable="false">
        <circle className="oa-art-sector__ring oa-art-sector__ring--dash" cx="200" cy="200" r="188" />
        <circle className="oa-art-sector__ring" cx="200" cy="200" r="142" />
        <circle className="oa-art-sector__ring oa-art-sector__ring--amber" cx="200" cy="200" r="78" />
        <circle className="oa-art-sector__sweep" cx="200" cy="200" r="142" pathLength={1} />
      </svg>
      <ul className="oa-art-sector__nodes">
        {ring.map((s, i) => (
          <li
            key={s.name}
            style={{ '--x': `${50 + 35.5 * Math.cos(angle(i))}%`, '--y': `${50 + 35.5 * Math.sin(angle(i))}%`, '--i': i } as CSSProperties}
          >
            <SiteIcon name={s.icon} />
          </li>
        ))}
      </ul>
      <div className="oa-art-sector__core">{focus ? <SiteIcon name={focus.icon} /> : <LogoMark size={52} title="" />}</div>
    </div>
  );
}

/** /pricing: three ascending tiers, the middle one lit; no numbers. */
export function TierArt() {
  const ref = useInViewClass<HTMLDivElement>();
  return (
    <div ref={ref} className="oa-art-tiers" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={clsx('oa-art-tiers__card', i === 1 && 'is-lit')} style={{ '--i': i } as CSSProperties}>
          <span className="oa-art-tiers__line oa-art-tiers__line--title" />
          <span className="oa-art-tiers__price" />
          {Array.from({ length: 3 + i }, (_, j) => (
            <span key={j} className="oa-art-tiers__check">
              <i />
              <span className="oa-art-tiers__line" style={{ width: `${60 + ((j * 17) % 30)}%` }} />
            </span>
          ))}
          <span className="oa-art-tiers__button" />
        </div>
      ))}
    </div>
  );
}

/** A case study without a cover image: the client's initial on the dark stage. */
export function MonogramArt({ name }: { name: string }) {
  return (
    <div className="oa-art-mono" aria-hidden="true">
      <svg viewBox="0 0 400 300" focusable="false">
        <path className="oa-art-mono__curve" d="M0 250 C 90 240, 140 200, 200 150 S 320 60, 400 40" pathLength={1} />
      </svg>
      <span>{name.trim().slice(0, 1).toUpperCase()}</span>
    </div>
  );
}
