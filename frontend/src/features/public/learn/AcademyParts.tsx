import clsx from 'clsx';
import { ArrowRight, Award, Clock, Layers, Route } from 'lucide-react';
import { useEffect, useId, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '@/components/brand/Logo';
import { ProgressRing } from '@/components/ui/Progress';
import { formatHours, type PathCard as PathCardData, type PathProgress } from '@/features/learning/api';
import { BadgeImage, categoryClass, LevelTag } from '@/features/learning/components/CourseCard';
import { BadgeStack } from '@/features/learning/components/PathViews';
import '../site/marketing.css';
import '../site/academy-pages.css';

/**
 * Building blocks of the public academy's pages (/learn, its course, lesson and path pages, certificate verification):
 * the dark "stage" hero panel, an editorial section head, the certificate plaque art and the learning path card. The
 * visual language follows the agency home page (site/home.css): display type with tight tracking, hairline dividers,
 * a dark navy stage with a faint grid and amber/indigo glow (`color-scheme: dark`, so every design token keeps AA
 * contrast inside it in both themes), amber only as an accent. Art is CSS/inline SVG and aria-hidden.
 */

/** The dark hero panel. `compact` for index pages; children are the container's content. */
export function AcademyStage({
  children,
  className,
  compact = false,
  labelledBy,
  as: Tag = 'header',
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  labelledBy?: string;
  as?: 'header' | 'section' | 'div';
}) {
  return (
    <Tag className={clsx('ax-stage', compact && 'ax-stage--compact', className)} aria-labelledby={labelledBy}>
      <div className="ax-stage__panel">
        <div className="ax-stage__backdrop" aria-hidden="true" />
        <div className="container ax-stage__inner">{children}</div>
      </div>
    </Tag>
  );
}

/** An editorial section: eyebrow, h2, optional intro and action, labelled by its heading. */
export function AcademySection({
  id,
  className,
  eyebrow,
  title,
  intro,
  action,
  children,
  center = false,
  sectionRef,
}: {
  id?: string;
  className?: string;
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  center?: boolean;
  sectionRef?: RefObject<HTMLElement>;
}) {
  const headingId = useId();
  return (
    <section id={id} ref={sectionRef} className={clsx('ax-section', className)} aria-labelledby={headingId}>
      <div className="container">
        <div className={clsx('ax-head', center && 'ax-head--center')} data-reveal="">
          <div className="ax-head__text">
            {eyebrow && <p className="ax-eyebrow">{eyebrow}</p>}
            <h2 id={headingId} className="ax-title">
              {title}
            </h2>
            {intro && <p className="ax-intro">{intro}</p>}
          </div>
          {action && <div className="ax-head__action">{action}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Pill eyebrow with an amber dot, for the stage. */
export function StageEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="ax-pill">
      <span className="ax-pill__dot" aria-hidden="true" />
      {children}
    </p>
  );
}

/**
 * A certificate of achievement as art: paper sheet with a guilloche border, the Academy mark, the course badge (when
 * known) and placeholder lines. `name` and `course` are shown as on a real certificate ("Your name" for a preview).
 */
export function CertificatePlaque({
  badgeUrl,
  course,
  name = 'Your name',
  className,
  size = 'md',
}: {
  badgeUrl?: string | null;
  course?: string;
  name?: string;
  className?: string;
  size?: 'md' | 'lg';
}) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={clsx('ax-plaque', `ax-plaque--${size}`, className)} aria-hidden="true">
      <svg className="ax-plaque__guilloche" viewBox="0 0 400 280" preserveAspectRatio="none" focusable="false">
        <defs>
          <pattern id={`ax-g-${id}`} width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 7 Q3.5 0 7 7 T14 7" fill="none" stroke="currentColor" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect x="6" y="6" width="388" height="268" rx="10" fill="none" stroke={`url(#ax-g-${id})`} strokeWidth="10" />
        <rect x="16" y="16" width="368" height="248" rx="6" fill="none" stroke="currentColor" strokeWidth="0.75" />
      </svg>
      <div className="ax-plaque__body">
        <div className="ax-plaque__top">
          <LogoMark size={26} title="" />
          <span className="ax-plaque__issuer">Optimize All Academy</span>
        </div>
        <span className="ax-plaque__kicker">Certificate of achievement</span>
        <span className="ax-plaque__name">{name}</span>
        <span className="ax-plaque__for">has completed the course and passed its final assessment</span>
        {course ? <span className="ax-plaque__course">{course}</span> : <i className="ax-plaque__line ax-plaque__line--course" />}
        <div className="ax-plaque__foot">
          <span className="ax-plaque__sign">
            <svg viewBox="0 0 120 30" focusable="false">
              <path d="M4 22c10-14 18-16 20-8s-6 12 2 6 14-16 20-10-4 12 6 8 16-12 22-8 8 6 18 2 14-6 24-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <i />
          </span>
          <span className="ax-plaque__seal">
            {badgeUrl ? (
              <BadgeImage src={badgeUrl} size={size === 'lg' ? 84 : 64} />
            ) : (
              <svg viewBox="0 0 64 72" focusable="false">
                <path d="M32 2 60 18v36L32 70 4 54V18Z" fill="#1f2659" stroke="#fcb31e" strokeWidth="3" />
                <path d="m22 36 7 7 14-15" fill="none" stroke="#fcb31e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The dominant category of a path (its first course's), for the tint. */
function pathTint(path: PathCardData): string {
  return path.categories[0] ? categoryClass(path.categories[0]) : 'lx-cat--platform';
}

/** A learning path card: tinted art band with its badge stack, title, subtitle, facts and progress. */
export function AcademyPathCard({
  path,
  to,
  headingLevel = 3,
  progress,
  index = 0,
}: {
  path: PathCardData;
  to: string;
  headingLevel?: 2 | 3;
  progress?: PathProgress | null;
  index?: number;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className={clsx('ax-path', pathTint(path))} style={{ '--n': index } as CSSProperties}>
      <div className="ax-path__art" aria-hidden="true">
        <span className="ax-path__kicker">
          <Route /> Learning path
        </span>
        <svg className="ax-path__route" viewBox="0 0 240 60" preserveAspectRatio="none" focusable="false">
          <path d="M6 48 C60 48 60 14 120 14 S180 46 234 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" />
        </svg>
        <BadgeStack badges={path.badges} size={48} />
      </div>
      <div className="ax-path__body">
        <Heading className="ax-path__title">
          <Link to={to} className="ax-stretch">
            {path.title}
          </Link>
        </Heading>
        <p className="ax-path__subtitle">{path.subtitle}</p>
        <ul className="ax-path__meta" aria-label="Path details">
          <li>
            <LevelTag level={path.level} />
          </li>
          <li>
            <Layers aria-hidden="true" /> {path.courseCount} courses
          </li>
          <li>
            <Clock aria-hidden="true" /> {formatHours(path.totalMinutes)}
          </li>
          <li>
            <Award aria-hidden="true" /> {path.badges.length} badges
          </li>
        </ul>
      </div>
      <div className="ax-path__foot">
        {progress?.started ? (
          <>
            <ProgressRing value={progress.progressPercent} label={`${path.title}: ${progress.progressPercent}% complete`} size={36} strokeWidth={4} />
            <span>
              {progress.completedCourses} of {progress.courseCount} courses completed
            </span>
          </>
        ) : (
          <span>
            <span className="ax-free">Free</span> A certificate for every course
          </span>
        )}
        <ArrowRight aria-hidden="true" className="ax-path__go" />
      </div>
    </article>
  );
}

/** Live academy figures for the hero: only figures that have loaded are shown (never a made-up number). */
export function StageFigures({ items, label }: { items: { value: string; label: string }[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <dl className="ax-figures" aria-label={label}>
      {items.map((f) => (
        <div key={f.label} className="ax-figures__item">
          <dt>{f.label}</dt>
          <dd className="tabular">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Reading progress (0–1) of an element: how far its bottom has scrolled past the viewport. */
export function useReadingProgress(target: RefObject<HTMLElement>): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      setProgress(total <= 0 ? (rect.top < 0 ? 1 : 0) : Math.min(1, Math.max(0, -rect.top / total)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target]);
  return progress;
}
