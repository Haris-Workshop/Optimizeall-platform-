import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import type { CourseCategory } from '@/features/learning/api';
import './marketing.css';

/**
 * Decorative illustrations for the marketing pages, drawn with HTML, CSS and inline SVG only (no images, CSP-safe).
 * Everything here is aria-hidden: the words that matter are in the page copy. Motion lives in marketing.css, runs only
 * while the art is on screen (`is-inview`) and is switched off entirely for reduced motion.
 */

/** Small abstract illustration for a course subject (AI, Marketing, SEO, Sales, Business, Design, Data, Platform). */
export function CategoryArt({ category, className }: { category: CourseCategory; className?: string }) {
  const art: Record<CourseCategory, ReactNode> = {
    Ai: (
      <>
        <g className="oa-art__lines">
          <path d="M20 44 48 20 76 44 48 58Z M20 44 76 44 M48 20 48 58" />
        </g>
        {[
          [20, 44],
          [48, 20],
          [76, 44],
          [48, 58],
        ].map(([cx, cy], i) => (
          <circle key={i} className="oa-art__node" cx={cx} cy={cy} r="5" style={{ '--i': i } as CSSProperties} />
        ))}
        <path className="oa-art__spark" d="M48 33 50.5 39.5 57 42 50.5 44.5 48 51 45.5 44.5 39 42 45.5 39.5Z" />
      </>
    ),
    Marketing: (
      <>
        <path className="oa-art__fill" d="M22 30h10l22-12v36L32 42H22Z" />
        <path className="oa-art__stroke" d="M60 26c4 3 4 13 0 16M66 20c8 6 8 22 0 28" />
        <path className="oa-art__stroke oa-art__soft" d="M30 42l4 14h7l-3-13" />
      </>
    ),
    Seo: (
      <>
        {[46, 36, 28, 20].map((y, i) => (
          <rect key={i} className="oa-art__bar" x={14 + i * 12} y={y} width="8" height={60 - y} rx="2" style={{ '--i': i } as CSSProperties} />
        ))}
        <circle className="oa-art__stroke" cx="66" cy="28" r="12" />
        <path className="oa-art__stroke" d="m75 37 9 9" />
      </>
    ),
    Sales: (
      <>
        <path className="oa-art__fill oa-art__soft" d="M14 16h68l-24 22v18l-20 6V38Z" />
        <path className="oa-art__stroke" d="M14 16h68l-24 22v18l-20 6V38Z" />
        <path className="oa-art__stroke" d="m62 58 10-10 6 6 8-10" />
      </>
    ),
    Business: (
      <>
        <rect className="oa-art__fill oa-art__soft" x="18" y="24" width="26" height="36" rx="3" />
        <rect className="oa-art__fill" x="50" y="12" width="28" height="48" rx="3" />
        <path className="oa-art__win" d="M56 20h6M66 20h6M56 30h6M66 30h6M56 40h6M66 40h6M24 32h6M34 32h4M24 42h6M34 42h4" />
      </>
    ),
    Design: (
      <>
        <circle className="oa-art__fill oa-art__soft" cx="34" cy="34" r="18" />
        <rect className="oa-art__fill" x="44" y="26" width="28" height="28" rx="4" transform="rotate(12 58 40)" />
        <path className="oa-art__stroke" d="M18 60c14-4 26-22 50-40" />
      </>
    ),
    Data: (
      <>
        <circle className="oa-art__fill oa-art__soft" cx="30" cy="36" r="18" />
        <path className="oa-art__fill" d="M30 36V18a18 18 0 0 1 17 12Z" />
        {[30, 20, 38].map((h, i) => (
          <rect key={i} className="oa-art__bar" x={56 + i * 10} y={60 - h} width="7" height={h} rx="2" style={{ '--i': i } as CSSProperties} />
        ))}
      </>
    ),
    Platform: (
      <>
        <circle className="oa-art__stroke" cx="38" cy="36" r="16" />
        <circle className="oa-art__stroke oa-art__accent" cx="56" cy="36" r="16" />
        <circle className="oa-art__node" cx="47" cy="36" r="4" />
      </>
    ),
  };
  return (
    <svg className={clsx('oa-art', className)} viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      {art[category]}
    </svg>
  );
}

