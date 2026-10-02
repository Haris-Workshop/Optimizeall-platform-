import clsx from 'clsx';
import { ArrowRight, Check } from 'lucide-react';
import { useEffect, useId, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ButtonLink } from '@/components/ui';
import { initials } from '@/lib/format/text';
import { Breadcrumbs, type Crumb } from '../site/components';
import { prefersReducedMotion } from '../site/motion';
import '../site/marketing.css';
import '../site/company-pages.css';

/**
 * Building blocks for the company, insights and conversion pages (about, team, careers, blog, contact, booking, quote,
 * partners), in the visual language of the home page (site/home.css): a dark navy stage for the hero and the closing
 * call to action, light editorial chapters between them, hairline dividers and amber only as an accent. Styles live in
 * site/company-pages.css (`oa-co-*`). Decorative art is CSS and inline SVG only, always aria-hidden.
 */

/** A small deterministic hash (FNV-1a) so generated art is stable for a given slug or name. */
export function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The page's opening stage: breadcrumbs, eyebrow, the page's only h1, lead, actions, and an optional aside. */
export function CoHero({
  eyebrow,
  title,
  lead,
  actions,
  breadcrumbs,
  aside,
  meta,
  size = 'default',
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  aside?: ReactNode;
  meta?: ReactNode;
  size?: 'default' | 'compact';
  className?: string;
}) {
  return (
    <header className={clsx('oa-co-hero', `oa-co-hero--${size}`, className)}>
      <div className="oa-co-hero__stage">
        <div className="oa-co-hero__backdrop" aria-hidden="true" />
        <div className={clsx('container oa-co-hero__inner', aside && 'oa-co-hero__inner--split')}>
          <div className="oa-co-hero__copy">
            {breadcrumbs && <Breadcrumbs items={breadcrumbs} tone="tight" />}
            {eyebrow && (
              <p className="oa-co-hero__eyebrow">
                <span className="oa-co-hero__dot" aria-hidden="true" />
                {eyebrow}
              </p>
            )}
            <h1 className="oa-co-hero__title">{title}</h1>
            {lead && <p className="oa-co-hero__lead">{lead}</p>}
            {actions && <div className="oa-co-hero__actions">{actions}</div>}
            {meta && <div className="oa-co-hero__meta">{meta}</div>}
          </div>
          {aside && <div className="oa-co-hero__aside">{aside}</div>}
        </div>
      </div>
    </header>
  );
}

/** A content chapter: eyebrow, h2, intro and actions, labelled by its heading. */
export function CoSection({
  id,
  className,
  eyebrow,
  title,
  intro,
  actions,
  children,
  layout = 'stacked',
  tone,
  headingLevel = 2,
}: {
  id?: string;
  className?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  layout?: 'stacked' | 'split';
  tone?: 'muted';
  headingLevel?: 2 | 3;
}) {
  const headingId = useId();
  const H = `h${headingLevel}` as 'h2';
  return (
    <section id={id} className={clsx('oa-co-section', tone && `oa-co-section--${tone}`, className)} aria-labelledby={headingId}>
      <div className={clsx('container', layout === 'split' && 'oa-co-split')}>
        <div className="oa-co-head" data-reveal="">
          <div className="oa-co-head__text">
            {eyebrow && <p className="oa-co-eyebrow">{eyebrow}</p>}
            <H id={headingId} className="oa-co-title">
              {title}
            </H>
            {intro && <p className="oa-co-intro">{intro}</p>}
          </div>
          {actions && <div className="oa-co-head__actions">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

export interface CoLink {
  to: string;
  label: string;
}

/** The closing call to action: a dark stage with an h2, text, two actions and optional reassurance points. */
export function CoCta({
  eyebrow,
  title,
  text,
  primary,
  secondary,
  points,
  children,
}: {
  eyebrow?: string;
  title: string;
  text?: string | null;
  primary?: CoLink | null;
  secondary?: CoLink | null;
  points?: string[];
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <section className="oa-co-cta" aria-labelledby={id}>
      <div className="oa-co-cta__stage">
        <div className="oa-co-hero__backdrop oa-co-cta__backdrop" aria-hidden="true" />
        <div className="container oa-co-cta__inner" data-reveal="">
          <div className="oa-co-cta__copy">
            {eyebrow && <p className="oa-co-eyebrow">{eyebrow}</p>}
            <h2 id={id} className="oa-co-cta__title">
              {title}
            </h2>
            {text && <p className="oa-co-cta__text">{text}</p>}
          </div>
          <div className="oa-co-cta__side">
            {(primary || secondary) && (
              <div className="oa-co-hero__actions">
                {primary && (
                  <ButtonLink to={primary.to} variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                    {primary.label}
                  </ButtonLink>
                )}
                {secondary && (
                  <ButtonLink to={secondary.to} variant="secondary" size="lg">
                    {secondary.label}
                  </ButtonLink>
                )}
              </div>
            )}
            {points && points.length > 0 && <CheckList items={points} className="oa-co-cta__points" />}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/** A list of reassurance points with amber ticks. */
export function CheckList({ items, className, label }: { items: string[]; className?: string; label?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={clsx('oa-co-checks', className)} aria-label={label}>
      {items.map((item) => (
        <li key={item}>
          <Check aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps on a hairline rule (process, hiring, what happens next). */
export function StepList({ steps, className, headingLevel = 3 }: { steps: { title: string; text: string }[]; className?: string; headingLevel?: 3 | 4 }) {
  const H = `h${headingLevel}` as 'h3';
  return (
    <ol className={clsx('oa-co-steps', className)} data-reveal="stagger">
      {steps.map((step, i) => (
        <li key={step.title} className="oa-co-step">
          <span className="oa-co-step__num tabular" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div>
            <H className="oa-co-step__title">{step.title}</H>
            {step.text && <p className="oa-co-step__text">{step.text}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const COVER_PATTERNS = ['rings', 'bars', 'grid', 'arc'] as const;

/**
 * A generated article cover for posts without an image: a navy field with an amber glow, one of four line patterns and
 * the first letter of the topic, all derived from the slug so each post keeps its own cover. Decorative (aria-hidden).
 */
export function CoverArt({ seed, label, className }: { seed: string; label?: string | null; className?: string }) {
  const h = hashSeed(seed);
  const pattern = COVER_PATTERNS[h % COVER_PATTERNS.length];
  const style = {
    '--cv-x': `${15 + (h % 70)}%`,
    '--cv-y': `${(h >> 3) % 40}%`,
    '--cv-angle': `${120 + ((h >> 5) % 90)}deg`,
  } as CSSProperties;
  const letter = (label ?? '').trim().slice(0, 1).toUpperCase();
  return (
    <div className={clsx('oa-co-cover', `oa-co-cover--${pattern}`, `oa-co-cover--hue${(h >> 7) % 3}`, className)} style={style} aria-hidden="true">
      <svg className="oa-co-cover__art" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" focusable="false">
        {pattern === 'rings' && [40, 80, 120, 160, 200].map((r) => <circle key={r} cx="300" cy="190" r={r} />)}
        {pattern === 'bars' &&
          Array.from({ length: 9 }, (_, i) => {
            const height = 30 + (((h >> (i % 24)) & 0x3f) + i * 14) % 150;
            return <rect key={i} x={40 + i * 38} y={230 - height} width="16" height={height} rx="3" />;
          })}
        {pattern === 'grid' &&
          Array.from({ length: 6 }, (_, row) =>
            Array.from({ length: 10 }, (_, col) => <circle key={`${row}-${col}`} cx={30 + col * 38} cy={30 + row * 38} r={(row + col + h) % 5 === 0 ? 4 : 1.6} />),
          )}
        {pattern === 'arc' && (
          <>
            <path d="M -20 230 C 90 210 160 120 420 40" />
            <path d="M -20 250 C 120 230 200 170 420 100" />
            <path d="M -20 200 C 60 190 140 80 420 -10" />
          </>
        )}
      </svg>
      {letter && <span className="oa-co-cover__letter">{letter}</span>}
    </div>
  );
}

/** A portrait stand-in for people without a photo: initials on a generated gradient. Decorative. */
export function Monogram({ name, className }: { name: string; className?: string }) {
  const h = hashSeed(name);
  return (
    <span className={clsx('oa-co-monogram', className)} style={{ '--mg-angle': `${110 + (h % 120)}deg`, '--mg-x': `${20 + (h % 60)}%` } as CSSProperties} aria-hidden="true">
      <span>{initials(name)}</span>
    </span>
  );
}

/** A thin reading-progress bar for long articles; purely visual (the scrollbar remains the accessible position). */
export function ReadingProgress({ target }: { target: RefObject<HTMLElement> }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = target.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      const read = Math.min(Math.max(-rect.top + window.innerHeight * 0.2, 0), Math.max(total, 1));
      setProgress(total > 0 ? read / total : 0);
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
  return (
    <div className="oa-co-progress" aria-hidden="true">
      <span style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

/** The id of the heading currently being read (the last one scrolled past), for highlighting the table of contents. */
export function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || ids.length === 0) return;
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const firstVisible = ids.find((id) => visible.has(id));
        if (firstVisible) setActive(firstVisible);
        else {
          // Between headings: the last heading above the viewport is the current section.
          const above = elements.filter((el) => el.getBoundingClientRect().top < 0);
          if (above.length > 0) setActive(above[above.length - 1].id);
        }
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the ids
  }, [key]);
  return active;
}

/** Smooth-scrolls to an in-page anchor (instant for reduced motion) and moves focus to it for keyboard users. */
export function scrollToAnchor(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  history.replaceState(null, '', `#${id}`);
}
