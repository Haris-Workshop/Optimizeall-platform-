import type { CSSProperties } from 'react';
import { LogoMark } from '@/components/brand/Logo';
import { SiteIcon } from './icons';
import { useInViewClass } from './motion';

/**
 * Decorative hero art for the agency pages, drawn with HTML, CSS and inline SVG only (no images, CSP-safe). All of it
 * is aria-hidden and carries no figures or claims: shapes and the icons of the agency's own service lines
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
