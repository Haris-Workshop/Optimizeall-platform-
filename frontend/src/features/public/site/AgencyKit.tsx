import clsx from 'clsx';
import { ArrowRight, ArrowUpRight, Check, Plus } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/ui';
import { siteMoney } from '@/features/public/site/format';
import type { BillingPeriod, CaseStudyCard, FaqEntry, HomeStat, Metric, Price, PublicPackage, ServiceCard } from './api';
import { Breadcrumbs, type Crumb } from './components';
import { useSiteCopy } from './copy';
import { SiteIcon } from './icons';
import { Markdown } from './Markdown';
import { trackGlow } from './motion';
import './marketing.css';
import './agency-pages.css';

/**
 * Building blocks of the agency pages (services, industries, case studies, pricing), in the visual language of the home
 * page: a dark cinematic hero stage, light editorial chapters with hairline dividers, one dark "proof" chapter for
 * results, and a dark closing call to action that books a consultation. Words come from the API or the editable page
 * copy; figures only from the API, always labelled measured or estimated. Styles: agency-pages.css (`oa-a-*`).
 */

const SUFFIX: Record<BillingPeriod, string> = { OneTime: 'one-time', Monthly: '/ month', Quarterly: '/ quarter', Yearly: '/ year' };

/** "$1,500" (whole amounts drop ".00"; amounts with cents keep them). */
export function money(amount: number, currency: string): string {
  const text = siteMoney(amount, currency, { currencyDisplay: 'narrowSymbol' });
  return Number.isInteger(amount) ? text.replace(/[.,]00(?=\D*$)/, '') : text;
}

export function periodSuffix(period: BillingPeriod): string {
  return SUFFIX[period];
}

/** The lowest fixed-price package (custom quotes have no price), or null. */
export function lowestPrice(packages: PublicPackage[]): Price | null {
  const priced = packages.filter((p) => p.price !== null && !p.isCustomQuote);
  if (priced.length === 0) return null;
  const min = priced.reduce((a, b) => ((b.price ?? 0) < (a.price ?? 0) ? b : a));
  return { amount: min.price!, currency: min.currency, billingPeriod: min.billingPeriod };
}

// ---------------------------------------------------------------- Page shell

/** The cinematic page hero: a dark stage with a faint grid and amber/indigo glow, copy on the left, art or facts on the right. */
export function AgencyHero({
  crumbs,
  eyebrow,
  title,
  lead,
  actions,
  meta,
  aside,
  tone = 'default',
}: {
  crumbs: Crumb[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  tone?: 'default' | 'compact';
}) {
  return (
    <header className={clsx('oa-a-hero', tone === 'compact' && 'oa-a-hero--compact')}>
      <div className="oa-a-stage">
        <div className="oa-a-stage__backdrop" aria-hidden="true" />
        <div className={clsx('container oa-a-hero__inner', aside && 'oa-a-hero__inner--split')}>
          <div className="oa-a-hero__copy">
            <Breadcrumbs items={crumbs} />
            {eyebrow && (
              <p className="oa-a-hero__eyebrow">
                <span className="oa-a-hero__dot" aria-hidden="true" />
                {eyebrow}
              </p>
            )}
            <h1 className="oa-a-hero__title">{title}</h1>
            {lead && <p className="oa-a-hero__lead">{lead}</p>}
            {actions && <div className="oa-a-actions">{actions}</div>}
            {meta}
          </div>
          {aside && <div className="oa-a-hero__aside">{aside}</div>}
        </div>
      </div>
    </header>
  );
}

/** A chapter of the page: eyebrow, h2, intro and actions (a named region), then its content. */
export function AgencySection({
  id,
  className,
  eyebrow,
  title,
  intro,
  actions,
  children,
  layout = 'stacked',
  tone,
}: {
  id?: string;
  className?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  layout?: 'stacked' | 'split';
  tone?: 'tint' | 'dark';
}) {
  const headingId = useId();
  const body = (
    <section id={id} className={clsx('oa-a-section', tone && `oa-a-section--${tone}`, className)} aria-labelledby={headingId}>
      <div className={clsx('container', layout === 'split' && 'oa-a-split')}>
        <div className="oa-a-head" data-reveal="">
          <div className="oa-a-head__text">
            {eyebrow && <p className="oa-a-eyebrow">{eyebrow}</p>}
            <h2 id={headingId} className="oa-a-title">
              {title}
            </h2>
            {intro && <p className="oa-a-intro">{intro}</p>}
          </div>
          {actions && <div className="oa-a-head__actions">{actions}</div>}
        </div>
        <div className="oa-a-section__body">{children}</div>
      </div>
    </section>
  );
  return tone === 'dark' ? <div className="oa-a-dark">{body}</div> : body;
}

/** The closing call to action: a dark stage that books a consultation, with a second, lighter action. */
export function ClosingCta({
  title,
  text,
  secondary,
  aside,
}: {
  title: string;
  text?: string;
  secondary?: { label: string; to: string };
  aside?: ReactNode;
}) {
  const copy = useSiteCopy();
  const id = useId();
  const second = secondary ?? { label: copy.text('agency.cta.secondary'), to: copy.text('agency.cta.secondaryUrl') };
  return (
    <section className="oa-a-cta" aria-labelledby={id}>
      <div className="oa-a-stage oa-a-stage--cta">
        <div className="oa-a-stage__backdrop" aria-hidden="true" />
        <div className={clsx('container oa-a-cta__inner', aside && 'oa-a-cta__inner--split')}>
          <div className="oa-a-cta__copy" data-reveal="">
            <p className="oa-a-eyebrow">{copy.text('agency.cta.eyebrow')}</p>
            <h2 id={id} className="oa-a-cta__title">
              {title}
            </h2>
            {text && <p className="oa-a-cta__text">{text}</p>}
            <div className="oa-a-actions">
              <ButtonLink to={copy.text('agency.cta.primaryUrl')} variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                {copy.text('agency.cta.primary')}
              </ButtonLink>
              <ButtonLink to={second.to} variant="secondary" size="lg">
                {second.label}
              </ButtonLink>
            </div>
            <ul className="oa-a-points">
              {copy.list('agency.cta.points').map((p) => (
                <li key={p}>
                  <Check aria-hidden="true" /> {p}
                </li>
              ))}
            </ul>
          </div>
          {aside}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- In-page navigation

export interface TocItem {
  id: string;
  label: string;
}

/**
 * "On this page": a sticky bar of anchor links that marks the section in view (`aria-current="location"`). The bar
 * scrolls sideways on its own when it is wider than the screen; the page never does.
 */
export function OnThisPage({ items, label, action }: { items: TocItem[]; label?: string; action?: ReactNode }) {
  const copy = useSiteCopy();
  const [current, setCurrent] = useState<string | null>(null);
  const ids = items.map((i) => i.id).join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const targets = ids
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (targets.length === 0) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        const first = targets.find((t) => visible.has(t.id));
        setCurrent(first ? first.id : null);
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [ids]);

  if (items.length < 2) return null;
  return (
    <div className="oa-a-toc">
      <div className="container oa-a-toc__inner">
        <nav aria-label={label ?? copy.text('agency.onThisPage')} className="oa-a-toc__nav">
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} aria-current={current === item.id ? 'location' : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {action && <div className="oa-a-toc__action">{action}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Figures and cards

/** A labelled figure: value (≈ when estimated), label, Measured/Estimated tag and its context. */
export function Figure({ metric, size = 'md' }: { metric: Metric | HomeStat; size?: 'sm' | 'md' | 'lg' }) {
  const copy = useSiteCopy();
  const estimated = metric.measurement === 'Estimated';
  return (
    <div className={clsx('oa-a-fig', `oa-a-fig--${size}`)}>
      <p className="oa-a-fig__value tabular">
        {estimated && (
          <span className="oa-a-fig__approx" aria-hidden="true">
            ≈
          </span>
        )}
        <span>{metric.value}</span>
      </p>
      <p className="oa-a-fig__label">{metric.label}</p>
      <p className="oa-a-fig__meta">
        <span className={clsx('oa-a-tag', estimated ? 'oa-a-tag--estimated' : 'oa-a-tag--measured')}>
          {estimated ? copy.text('agency.estimated') : copy.text('agency.measured')}
        </span>
        {metric.context && <span className="oa-a-fig__context">{metric.context}</span>}
      </p>
    </div>
  );
}

/** A case study card: client, title (the whole card links), summary, services and its headline figures. */
export function CaseCard({
  study,
  lead = false,
  headingLevel = 3,
  tone = 'dark',
}: {
  study: CaseStudyCard;
  lead?: boolean;
  headingLevel?: 2 | 3;
  tone?: 'dark' | 'light';
}) {
  const H = `h${headingLevel}` as 'h2' | 'h3';
  const metrics = study.highlights.slice(0, lead ? 3 : 2);
  return (
    <article className={clsx('oa-a-case', lead && 'oa-a-case--lead', `oa-a-case--${tone}`)} data-glow="">
      {study.coverImageUrl && (
        <img className="oa-a-case__image" src={study.coverImageUrl} alt="" loading="lazy" decoding="async" width={960} height={540} />
      )}
      <div className="oa-a-case__body">
        <p className="oa-a-case__client">
          {study.clientName}
          {study.industryName && <span> · {study.industryName}</span>}
        </p>
        <H className="oa-a-case__title">
          <Link to={`/case-studies/${study.slug}`} className="oa-a-stretch">
            {study.title}
          </Link>
        </H>
        <p className="oa-a-case__summary">{study.summary}</p>
        {study.serviceNames.length > 0 && (
          <ul className="oa-a-case__services">
            {study.serviceNames.slice(0, lead ? 4 : 3).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>
      {metrics.length > 0 && (
        <div className="oa-a-case__metrics">
          {metrics.map((m) => (
            <Figure key={m.label} metric={m} size={lead ? 'lg' : 'sm'} />
          ))}
        </div>
      )}
      <span className="oa-a-case__go" aria-hidden="true">
        <ArrowUpRight />
      </span>
    </article>
  );
}

/** Case study cards: the first one leads (full width) when there are three or more. */
export function CaseGrid({ items, headingLevel = 3, tone = 'dark', label }: { items: CaseStudyCard[]; headingLevel?: 2 | 3; tone?: 'dark' | 'light'; label?: string }) {
  const leadFirst = items.length !== 2;
  return (
    <ul className={clsx('oa-a-cases', leadFirst && 'oa-a-cases--lead')} data-reveal="stagger" onPointerMove={trackGlow} aria-label={label}>
      {items.map((c, i) => (
        <li key={c.slug}>
          <CaseCard study={c} lead={leadFirst && i === 0} headingLevel={headingLevel} tone={tone} />
        </li>
      ))}
    </ul>
  );
}

/** A service as an index row: icon, name (links), tagline, starting price and an arrow. */
export function ServiceRow({ service, headingLevel = 3, index }: { service: ServiceCard; headingLevel?: 3 | 4; index?: number }) {
  const copy = useSiteCopy();
  const H = `h${headingLevel}` as 'h3' | 'h4';
  const price = service.startingPrice;
  return (
    <article className="oa-a-row">
      {index !== undefined ? (
        <span className="oa-a-row__index tabular" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      ) : (
        <span className="oa-a-row__icon" aria-hidden="true">
          <SiteIcon name={service.icon} />
        </span>
      )}
      <div className="oa-a-row__main">
        <H className="oa-a-row__title">
          <Link to={`/services/${service.slug}`} className="oa-a-stretch">
            {service.name}
          </Link>
        </H>
        <p className="oa-a-row__text">{service.tagline}</p>
      </div>
      {price && (
        <p className="oa-a-row__price">
          <span>{copy.text('agency.from')}</span> <strong className="tabular">{money(price.amount, price.currency)}</strong> <span>{periodSuffix(price.billingPeriod)}</span>
        </p>
      )}
      <ArrowUpRight className="oa-a-row__go" aria-hidden="true" />
    </article>
  );
}

export function ServiceRows({ items, headingLevel = 3, numbered = false }: { items: ServiceCard[]; headingLevel?: 3 | 4; numbered?: boolean }) {
  return (
    <ul className="oa-a-rows" data-reveal="stagger">
      {items.map((s, i) => (
        <li key={s.slug}>
          <ServiceRow service={s} headingLevel={headingLevel} index={numbered ? i : undefined} />
        </li>
      ))}
    </ul>
  );
}

/** A package as a pricing tier: name, description, price, setup fee, features and a quote link. */
export function TierCard({ pkg, serviceSlug, serviceName }: { pkg: PublicPackage; serviceSlug: string; serviceName?: string }) {
  const copy = useSiteCopy();
  const headingId = useId();
  const quote = pkg.isCustomQuote || pkg.price === null;
  const href = `/get-a-quote?${new URLSearchParams({ service: serviceSlug, package: pkg.id }).toString()}`;
  return (
    <article className={clsx('oa-a-tier', pkg.isMostPopular && 'oa-a-tier--popular')} aria-labelledby={headingId}>
      <div className="oa-a-tier__head">
        <h3 id={headingId} className="oa-a-tier__name">
          {serviceName && <span className="visually-hidden">{serviceName}: </span>}
          {pkg.name}
        </h3>
        {pkg.isMostPopular && <p className="oa-a-tier__badge">{copy.text('agency.mostPopular')}</p>}
      </div>
      {pkg.description && <p className="oa-a-tier__desc">{pkg.description}</p>}
      <p className="oa-a-tier__price">
        {quote ? (
          <span className="oa-a-tier__amount oa-a-tier__amount--quote">{copy.text('agency.customQuote')}</span>
        ) : (
          <>
            <span className="oa-a-tier__amount tabular">{money(pkg.price!, pkg.currency)}</span> <span className="oa-a-tier__period">{periodSuffix(pkg.billingPeriod)}</span>
          </>
        )}
      </p>
      {pkg.setupFee !== null && pkg.setupFee > 0 && <p className="oa-a-tier__setup">{copy.text('agency.tier.setup', { amount: money(pkg.setupFee, pkg.currency) })}</p>}
      {pkg.features.length > 0 && (
        <ul className="oa-a-tier__features">
          {pkg.features.map((f) => (
            <li key={f}>
              <Check aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      )}
      <ButtonLink to={href} variant={pkg.isMostPopular ? 'highlight' : 'secondary'} fullWidth className="oa-a-tier__cta">
        {quote ? copy.text('agency.tier.quoteCta') : copy.text('agency.tier.cta')}
        <span className="visually-hidden">
          {' '}
          with {serviceName ? `${serviceName} ` : ''}
          {pkg.name}
        </span>
      </ButtonLink>
    </article>
  );
}

export function TierGrid({ packages, serviceSlug, serviceName }: { packages: PublicPackage[]; serviceSlug: string; serviceName?: string }) {
  return (
    <div className={clsx('oa-a-tiers', `oa-a-tiers--${Math.min(packages.length, 4)}`)} data-reveal="stagger">
      {packages.map((p) => (
        <TierCard key={p.id} pkg={p} serviceSlug={serviceSlug} serviceName={serviceName} />
      ))}
    </div>
  );
}

/** Numbered steps on a rail: across the page on wide screens, down it on narrow ones. */
export function StepRail({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className={clsx('oa-a-rail', `oa-a-rail--${Math.min(steps.length, 5)}`)} data-reveal="stagger">
      {steps.map((step, i) => (
        <li key={step.title} className="oa-a-rail__step">
          <span className="oa-a-rail__num tabular" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3 className="oa-a-rail__title">{step.title}</h3>
          <p className="oa-a-rail__text">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Numbered statements on a hairline grid (problems solved, challenges). */
export function NumberedGrid({ items }: { items: string[] }) {
  return (
    <ol className="oa-a-numbered" data-reveal="stagger">
      {items.map((text, i) => (
        <li key={text}>
          <span className="oa-a-numbered__num tabular" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <p>{text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Questions and answers (answers are Markdown), as native disclosure widgets. */
export function FaqAccordion({ items }: { items: FaqEntry[] }) {
  return (
    <div className="oa-a-faq">
      {items.map((item) => (
        <details key={item.question} className="oa-a-faq__item">
          <summary>
            <span>{item.question}</span>
            <Plus aria-hidden="true" className="oa-a-faq__icon" />
          </summary>
          <Markdown source={item.answer} className="oa-a-faq__answer" />
        </details>
      ))}
    </div>
  );
}

/** Pairs ("Title | Text") from the page copy as a hairline list of short statements. */
export function PointGrid({ items }: { items: { title: string; text: string }[] }) {
  return (
    <ul className="oa-a-pointgrid" data-reveal="stagger">
      {items.map((p, i) => (
        <li key={p.title}>
          <span className="oa-a-pointgrid__num tabular" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3 className="oa-a-pointgrid__title">{p.title}</h3>
          <p className="oa-a-pointgrid__text">{p.text}</p>
        </li>
      ))}
    </ul>
  );
}
