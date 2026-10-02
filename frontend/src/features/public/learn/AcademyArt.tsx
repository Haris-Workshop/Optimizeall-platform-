import type { CSSProperties } from 'react';
import { BadgeImage, LinkedInIcon } from '@/features/learning/components/CourseCard';
import { useInViewClass } from '../site/motion';
import { CertificatePlaque } from './AcademyParts';

/**
 * The academy hub's hero art: a certificate of achievement, a lesson in progress and the badges of the newest courses
 * (real badge images from the catalogue) drifting around it. Decorative (aria-hidden); loops only while on screen and
 * never for reduced motion (academy-pages.css).
 */
export function AcademyHeroArt({ badges }: { badges: string[] }) {
  const ref = useInViewClass<HTMLDivElement>();
  return (
    <div ref={ref} className="ax-art" aria-hidden="true">
      <div className="ax-art__halo" />
      <svg className="ax-art__rings" viewBox="0 0 400 400" focusable="false">
        <circle cx="200" cy="200" r="190" className="ax-art__ring ax-art__ring--dashed" />
        <circle cx="200" cy="200" r="140" className="ax-art__ring" />
      </svg>
      <CertificatePlaque badgeUrl={badges[0]} className="ax-art__plaque" />
      <div className="ax-art__lesson">
        <span className="ax-art__lesson-head">
          <i className="ax-art__play" />
          <b />
        </span>
        <span className="ax-art__meter">
          <span />
        </span>
        <ul>
          {[0, 1, 2].map((i) => (
            <li key={i} className={i < 2 ? 'is-done' : undefined} style={{ '--i': i } as CSSProperties}>
              <i />
              <b />
            </li>
          ))}
        </ul>
      </div>
      <div className="ax-art__chip ax-art__chip--verified">
        <svg viewBox="0 0 16 16" focusable="false">
          <path d="m4 8.5 2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Verified
      </div>
      <div className="ax-art__chip ax-art__chip--linkedin">
        <LinkedInIcon /> Add to profile
      </div>
      {badges.slice(1, 4).map((src, i) => (
        <span key={src} className={`ax-art__badge ax-art__badge--${i + 1}`}>
          <BadgeImage src={src} size={64} />
        </span>
      ))}
    </div>
  );
}
