import clsx from 'clsx';
import {
  Accessibility,
  BadgeCheck,
  Clock,
  Database,
  Eye,
  Lock,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import '@/features/learning/learning.css';
import { useSiteCopy } from './copy';
import { useInViewClass } from './motion';
import './marketing.css';

/**
 * Marketing sections shared by the marketing pages: the "how it works" timeline and the trust grid. Every word comes
 * from the editable page copy.
 */

/** A numbered timeline whose progress line and step markers loop gently while it is on screen. */
export function Timeline({ steps, className }: { steps: { title: string; text: string }[]; className?: string }) {
  const ref = useInViewClass<HTMLOListElement>();
  return (
    <ol ref={ref} className={clsx('oa-timeline', className)} style={{ '--n': steps.length } as CSSProperties} data-reveal="stagger">
      {steps.map((step, i) => (
        <li key={step.title} className="oa-timeline__step" style={{ '--i': i } as CSSProperties}>
          <span className="oa-timeline__dot" aria-hidden="true">
            {i + 1}
          </span>
          <h3 className="oa-timeline__title">{step.title}</h3>
          <p className="oa-timeline__text">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

const TRUST_ICONS = [Lock, Accessibility, ShieldCheck, BadgeCheck, Scale, Database, Eye, Clock];

/** Trust and compliance: true statements only, from the page copy, with the policy pages one click away. */
export function TrustGrid() {
  const copy = useSiteCopy();
  return (
    <section className="site-section site-section--muted oa-trust" aria-labelledby="trust-title">
      <div className="container">
        <div className="site-section__head">
          <div>
            <p className="eyebrow">{copy.text('home.trust.eyebrow')}</p>
            <h2 id="trust-title" className="site-section__title">
              {copy.text('home.trust.title')}
            </h2>
            <p className="site-section__intro">{copy.text('home.trust.intro')}</p>
          </div>
        </div>
        <ul className="oa-trust__grid" data-reveal="stagger">
          {copy.pairs('home.trust.items').map((item, i) => {
            const Icon = TRUST_ICONS[i % TRUST_ICONS.length];
            return (
              <li key={item.title} className="oa-trust__item">
                <span className="oa-tile" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            );
          })}
        </ul>
        <p className="oa-trust__links">
          <Link to="/privacy-policy">Privacy policy</Link>
          <Link to="/accessibility">Accessibility statement</Link>
          <Link to="/cookie-policy">Cookie policy</Link>
          <Link to="/terms-of-service">Terms of service</Link>
        </p>
      </div>
    </section>
  );
}
