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
    </div>
  );
}
