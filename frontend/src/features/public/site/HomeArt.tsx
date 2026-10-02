import type { CSSProperties } from 'react';
import { LogoMark } from '@/components/brand/Logo';
import { SiteIcon } from './icons';
import { useInViewClass } from './motion';
import './marketing.css';
import './home.css';

/**
 * Decorative art for the home page, drawn with HTML, CSS and inline SVG only (no images, CSP-safe). Everything here is
 * aria-hidden: the words that matter are in the page copy. Looping motion runs only while the art is on screen
 * (`is-inview`) and is switched off entirely for reduced motion (home.css).
 */

export interface OrbitChannel {
  name: string;
  icon: string | null;
}

const ORBIT = 200; // SVG centre (viewBox 0 0 400 400)
const NODE_RADIUS = 138;

/**
 * The hero's "one accountable team" orbit: the agency's service lines (from the API) sit on a ring around the brand
 * mark, and signals travel along the spokes into the centre. No figures, no claims: shape only.
 */
export function GrowthOrbit({ channels }: { channels: OrbitChannel[] }) {
  const ref = useInViewClass<HTMLDivElement>();
  const nodes = channels.slice(0, 6);
  const angle = (i: number) => -90 + (i * 360) / Math.max(nodes.length, 1);
  return (
    <div ref={ref} className="oa-orbit" aria-hidden="true">
      <svg className="oa-orbit__rings" viewBox="0 0 400 400" focusable="false">
        <defs>
          <radialGradient id="oa-orbit-core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fcb31e" stopOpacity="0.22" />
            <stop offset="0.55" stopColor="#4855a3" stopOpacity="0.12" />
            <stop offset="1" stopColor="#4855a3" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={ORBIT} cy={ORBIT} r="196" fill="url(#oa-orbit-core)" />
        <circle className="oa-orbit__ring oa-orbit__ring--dashed" cx={ORBIT} cy={ORBIT} r="190" />
        <circle className="oa-orbit__ring" cx={ORBIT} cy={ORBIT} r={NODE_RADIUS} />
        <circle className="oa-orbit__ring oa-orbit__ring--inner" cx={ORBIT} cy={ORBIT} r="84" />
        {nodes.map((n, i) => {
          const a = (angle(i) * Math.PI) / 180;
          const x = ORBIT + NODE_RADIUS * Math.cos(a);
          const y = ORBIT + NODE_RADIUS * Math.sin(a);
          return (
            <g key={n.name}>
              <line className="oa-orbit__spoke" x1={x} y1={y} x2={ORBIT} y2={ORBIT} />
              <line className="oa-orbit__signal" x1={x} y1={y} x2={ORBIT} y2={ORBIT} pathLength={1} style={{ '--i': i } as CSSProperties} />
            </g>
          );
        })}
      </svg>
      <div className="oa-orbit__sweep" />
      <div className="oa-orbit__hub">
        <span className="oa-orbit__ping" />
        <LogoMark size={64} title="" />
      </div>
      <ul className="oa-orbit__nodes">
        {nodes.map((n, i) => (
          <li key={n.name} style={{ '--a': `${angle(i)}deg`, '--i': i } as CSSProperties}>
            <span className="oa-orbit__chip">
              <SiteIcon name={n.icon} />
              <span className="oa-orbit__label">{n.name}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="oa-orbit__card">
        <div className="oa-orbit__card-head">
          <i />
          <b />
        </div>
        <svg viewBox="0 0 160 56" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="oa-orbit-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fcb31e" stopOpacity="0.35" />
              <stop offset="1" stopColor="#fcb31e" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 48 C18 46 28 40 44 38 S72 30 88 26 S120 18 136 12 S152 6 160 4 V56 H0Z" fill="url(#oa-orbit-area)" />
          <path className="oa-orbit__trend" pathLength={1} d="M0 48 C18 46 28 40 44 38 S72 30 88 26 S120 18 136 12 S152 6 160 4" />
        </svg>
        <div className="oa-orbit__card-bars">
          {[42, 58, 50, 72, 64, 86].map((h, i) => (
            <span key={i} style={{ '--h': `${h}%`, '--i': i } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Academy card art: a certificate with the brand hexagon and a lesson-progress meter. */
export function AcademyArt() {
  return (
    <div className="oa-prod-art oa-prod-art--academy" aria-hidden="true">
      <div className="oa-prod-art__sheet">
        <svg className="oa-prod-art__hex" viewBox="0 0 64 72" focusable="false">
          <path d="M32 2 60 18v36L32 70 4 54V18Z" fill="#1f2659" stroke="#fcb31e" strokeWidth="3" />
          <path d="m22 36 7 7 14-15" fill="none" stroke="#fcb31e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <i className="oa-prod-art__line oa-prod-art__line--title" />
        <i className="oa-prod-art__line" />
        <i className="oa-prod-art__line oa-prod-art__line--short" />
        <span className="oa-prod-art__meter">
          <span />
        </span>
      </div>
    </div>
  );
}

/** Creators card art: an approved post and a payout row. */
export function CreatorsArt() {
  return (
    <div className="oa-prod-art oa-prod-art--creators" aria-hidden="true">
      <div className="oa-prod-art__post">
        <span className="oa-prod-art__avatar" />
        <i className="oa-prod-art__line oa-prod-art__line--title" />
        <span className="oa-prod-art__media" />
        <span className="oa-prod-art__badge">
          <svg viewBox="0 0 16 16" focusable="false">
            <path d="m4 8.5 2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <div className="oa-prod-art__payout">
        <span className="oa-prod-art__coin" />
        <i className="oa-prod-art__line" />
      </div>
    </div>
  );
}
