import { LinkedInIcon } from '@/features/learning/components/CourseCard';
import { useInViewClass } from '../site/motion';
import { CertificatePlaque } from './AcademyParts';

/**
 * The academy hub's hero art: a certificate of achievement with the badge of the newest course, a "Verified" mark and the
 * "Add to profile" action. Decorative (aria-hidden); the rings turn only while on screen and never for reduced motion
 * (academy-pages.css).
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
      <div className="ax-art__chip ax-art__chip--verified">
        <svg viewBox="0 0 16 16" focusable="false">
          <path d="m4 8.5 2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Verified
      </div>
      <div className="ax-art__chip ax-art__chip--linkedin">
        <LinkedInIcon /> Add to profile
      </div>
    </div>
  );
}
