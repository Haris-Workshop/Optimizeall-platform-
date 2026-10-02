import clsx from 'clsx';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink, Skeleton } from '@/components/ui';
import { formatDate } from '@/lib/format/dates';
import type { CaseStudyCard, HomeStat, Metric, PostCard, PricingTeaser } from '../site/api';
import { useHome } from '../site/api';
import { useSiteCopy } from '../site/copy';
import { LogoCloud } from '../site/Blocks';
import { PriceText, TestimonialCarousel } from '../site/components';
import { headFromSeo, useDocumentHead } from '../site/head';
import { AcademyArt, CreatorsArt, GrowthOrbit } from '../site/HomeArt';
import { SiteIcon } from '../site/icons';
import { trackGlow, useReveal } from '../site/motion';
import { NewsletterSignup } from '../site/NewsletterSignup';
import { PartnerSlot } from '../partners/PartnerSlot';

/**
 * Home: the agency's front page. Optimize All is a marketing agency; the Academy (/learn) and Creators (/creators) are
 * sibling products with their own sites, introduced once near the end.
 *
 * Order: cinematic hero (value proposition, "Book a consultation", "See our work", proof points, service orbit) →
 * client logos and partners → services → results (labelled figures) and case studies → process → industries →
 * testimonials → insights → "More from Optimize All" (Academy, Creators) → closing consultation call to action with the
 * pricing teaser → newsletter. Figures come from the API (labelled measured or estimated), words from the editable page
 * copy (`home.*`); nothing here is invented. The server-rendered HTML follows the same order
 * (backend SeoPageResolver.HomeAsync).
 */

/** A home section: eyebrow, h2, optional intro and actions; labelled by its heading (a named region). */
function HomeSection({
  id,
  className,
  eyebrow,
  title,
  intro,
  actions,
  children,
  layout = 'stacked',
  center = false,
}: {
  id?: string;
  className?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  actions?: ReactNode;
  children: ReactNode;
  layout?: 'stacked' | 'split';
  center?: boolean;
}) {
  const headingId = useId();
  return (
    <section id={id} className={clsx('oa-h-section', className)} aria-labelledby={headingId}>
      <div className={clsx('container', layout === 'split' && 'oa-h-split')}>
        <div className={clsx('oa-h-head', center && 'oa-h-head--center')} data-reveal="">
          <div className="oa-h-head__text">
            {eyebrow && <p className="oa-h-eyebrow">{eyebrow}</p>}
            <h2 id={headingId} className="oa-h-title">
              {title}
            </h2>
            {intro && <p className="oa-h-intro">{intro}</p>}
          </div>
          {actions && <div className="oa-h-head__actions">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** A labelled figure: value (≈ when estimated), label, Measured/Estimated tag and its context. */
function Figure({ metric, size = 'md' }: { metric: Metric | HomeStat; size?: 'md' | 'lg' }) {
  const estimated = metric.measurement === 'Estimated';
  return (
    <div className={clsx('oa-h-fig', `oa-h-fig--${size}`)}>
      <p className="oa-h-fig__value tabular">
        {estimated && (
          <span className="oa-h-fig__approx" aria-hidden="true">
            ≈
          </span>
        )}
        <span>{metric.value}</span>
      </p>
      <p className="oa-h-fig__label">{metric.label}</p>
      <p className="oa-h-fig__meta">
        <span className={clsx('oa-h-tag', estimated ? 'oa-h-tag--estimated' : 'oa-h-tag--measured')}>{estimated ? 'Estimated' : 'Measured'}</span>
        {metric.context && <span className="oa-h-fig__context">{metric.context}</span>}
      </p>
    </div>
  );
}

function CaseCard({ study, lead }: { study: CaseStudyCard; lead: boolean }) {
  const metrics = study.highlights.slice(0, lead ? 3 : 1);
  return (
    <article className={clsx('oa-h-case', lead && 'oa-h-case--lead')} data-glow="">
      {study.coverImageUrl && lead && (
        <img className="oa-h-case__image" src={study.coverImageUrl} alt="" loading="lazy" decoding="async" width={960} height={540} />
      )}
      <div className="oa-h-case__body">
        <p className="oa-h-case__client">
          {study.clientName}
          {study.industryName && <span> · {study.industryName}</span>}
        </p>
        <h3 className="oa-h-case__title">
          <Link to={`/case-studies/${study.slug}`} className="oa-h-stretch">
            {study.title}
          </Link>
        </h3>
        <p className="oa-h-case__summary">{study.summary}</p>
        {lead && study.serviceNames.length > 0 && (
          <ul className="oa-h-case__services">
            {study.serviceNames.slice(0, 4).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>
      {metrics.length > 0 && (
        <div className="oa-h-case__metrics">
          {metrics.map((m) => (
            <Figure key={m.label} metric={m} size={lead ? 'lg' : 'md'} />
          ))}
        </div>
      )}
      <span className="oa-h-case__go" aria-hidden="true">
        <ArrowUpRight />
      </span>
    </article>
  );
}

function InsightCard({ post, index }: { post: PostCard; index: number }) {
  const category = post.categories[0]?.name;
  return (
    <article className="oa-h-post" style={{ '--n': index } as CSSProperties}>
      {post.coverImageUrl ? (
        <img className="oa-h-post__cover" src={post.coverImageUrl} alt={post.coverImageAlt ?? ''} loading="lazy" decoding="async" width={640} height={400} />
      ) : (
        <div className="oa-h-post__cover oa-h-post__cover--art" aria-hidden="true">
          <span>{(category ?? post.title).slice(0, 1)}</span>
        </div>
      )}
      <div className="oa-h-post__body">
        {category && <p className="oa-h-post__category">{category}</p>}
        <h3 className="oa-h-post__title">
          <Link to={`/blog/${post.slug}`} className="oa-h-stretch">
            {post.title}
          </Link>
        </h3>
        <p className="oa-h-post__excerpt">{post.excerpt}</p>
        <p className="oa-h-post__meta">
          {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
          {post.publishedAt && ' · '}
          {post.readingMinutes} min read
        </p>
      </div>
    </article>
  );
}

function PricingNote({ items }: { items: PricingTeaser[] }) {
  const copy = useSiteCopy();
  const headingId = useId();
  return (
    <aside className="oa-h-cta__pricing" aria-labelledby={headingId}>
      <p className="oa-h-eyebrow">{copy.text('home.pricing.eyebrow')}</p>
      <h3 id={headingId} className="oa-h-cta__pricing-title">
        {copy.text('home.pricing.title')}
      </h3>
      <p className="oa-h-cta__pricing-intro">{copy.text('home.pricing.intro')}</p>
      <ul className="oa-h-cta__prices">
        {items.map(({ package: pkg, serviceName }) => (
          <li key={pkg.id}>
            <span>
              <span className="oa-h-cta__price-service">{serviceName}</span>
              <span className="oa-h-cta__price-package">{pkg.name}</span>
            </span>
            <span className="oa-h-cta__price">
              {pkg.price === null || pkg.isCustomQuote ? (
                'Custom quote'
              ) : (
                <PriceText price={{ amount: pkg.price, currency: pkg.currency, billingPeriod: pkg.billingPeriod }} />
              )}
            </span>
          </li>
        ))}
      </ul>
      <Link to="/pricing" className="oa-h-arrowlink">
        {copy.text('home.pricing.cta')} <ArrowRight aria-hidden="true" />
      </Link>
    </aside>
  );
}

export function HomePage() {
  const { data, isLoading } = useHome();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead(
    data ? headFromSeo({ ...data.seo, title: '' }, data.jsonLd) : { title: null, description: copy.text('home.seo.description') },
  );
  const categories = data?.serviceCategories ?? [];
  const cases = data?.featuredCaseStudies ?? [];
  const ctaId = useId();
  const moreId = useId();

  return (
    <div ref={root} className="oa-home">
      {/* ------------------------------------------------------------ Hero */}
      <header className="oa-h-hero">
        <div className="oa-h-hero__stage">
          <div className="oa-h-hero__backdrop" aria-hidden="true" />
          <div className="container oa-h-hero__inner">
            <div className="oa-h-hero__copy">
              <p className="oa-h-hero__eyebrow">
                <span className="oa-h-hero__dot" aria-hidden="true" />
                {copy.text('home.hero.eyebrow')}
              </p>
              <h1 className="oa-h-hero__title">
                {copy.text('home.hero.title')} <span className="oa-h-hero__highlight">{copy.text('home.hero.titleHighlight')}</span>
              </h1>
              <p className="oa-h-hero__lead">{copy.text('home.hero.lead')}</p>
              <div className="oa-h-hero__actions">
                <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                  {copy.text('home.hero.primaryCta')}
                </ButtonLink>
                <ButtonLink to="/case-studies" variant="secondary" size="lg">
                  {copy.text('home.hero.secondaryCta')}
                </ButtonLink>
              </div>
              <ul className="oa-h-hero__proof">
                {copy.list('home.hero.proof').map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="oa-h-hero__visual">
              <GrowthOrbit channels={categories.map((c) => ({ name: c.name, icon: c.icon }))} />
            </div>
          </div>
        </div>
      </header>

      {data && data.trustLogos.length > 0 && (
        <div className="oa-h-logos">
          <div className="container">
            <LogoCloud logos={data.trustLogos} title={copy.text('home.logos.title')} />
          </div>
        </div>
      )}

      <PartnerSlot slot="home.partners" />

      {/* ------------------------------------------------------------ Services */}
      <HomeSection
        id="services"
        eyebrow={copy.text('home.services.eyebrow')}
        title={copy.text('home.services.title')}
        intro={copy.text('home.services.intro')}
        actions={
          <ButtonLink to="/services" variant="secondary" trailingIcon={<ArrowRight />}>
            {copy.text('home.services.cta')}
          </ButtonLink>
        }
      >
        {isLoading ? (
          <div className="oa-h-services">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={220} />
            ))}
          </div>
        ) : (
          <ul className="oa-h-services" data-reveal="stagger" onPointerMove={trackGlow}>
            {categories.map((group, i) => (
              <li key={group.slug}>
                <article className="oa-h-service" data-glow="">
                  <div className="oa-h-service__top">
                    <span className="oa-h-service__icon" aria-hidden="true">
                      <SiteIcon name={group.icon} />
                    </span>
                    <span className="oa-h-service__index" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="oa-h-service__title">
                    <Link to={`/services?category=${encodeURIComponent(group.slug)}`}>{group.name}</Link>
                  </h3>
                  {group.description && <p className="oa-h-service__text">{group.description}</p>}
                  <ul className="oa-h-service__links">
                    {group.services.slice(0, i < 2 ? 6 : 4).map((s) => (
                      <li key={s.slug}>
                        <Link to={`/services/${s.slug}`}>
                          {s.name}
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ul>
        )}
      </HomeSection>

      {/* ------------------------------------------------------------ Results and case studies (one dark chapter) */}
      {data && (data.stats.length > 0 || cases.length > 0) && (
        <div className="oa-h-proof">
          {data.stats.length > 0 && (
            <HomeSection
              className="oa-h-results"
              eyebrow={copy.text('home.results.eyebrow')}
              title={copy.text('home.results.title')}
              intro={copy.text('home.results.intro')}
              layout="split"
            >
              <ul className="oa-h-stats" data-reveal="stagger">
                {data.stats.map((s) => (
                  <li key={s.label}>
                    <Figure metric={s} size="lg" />
                  </li>
                ))}
              </ul>
            </HomeSection>
          )}
          {cases.length > 0 && (
            <HomeSection
              className="oa-h-cases"
              eyebrow={copy.text('home.caseStudies.eyebrow')}
              title={copy.text('home.caseStudies.title')}
              intro={copy.text('home.caseStudies.intro')}
              actions={
                <ButtonLink to="/case-studies" variant="secondary" trailingIcon={<ArrowRight />}>
                  {copy.text('home.caseStudies.cta')}
                </ButtonLink>
              }
            >
              <ul className={clsx('oa-h-caselist', `oa-h-caselist--${Math.min(cases.length, 3)}`)} data-reveal="stagger" onPointerMove={trackGlow}>
                {cases.map((c, i) => (
                  <li key={c.slug}>
                    <CaseCard study={c} lead={i === 0} />
                  </li>
                ))}
              </ul>
            </HomeSection>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ Process */}
      <HomeSection
        id="how-we-work"
        className="oa-h-process"
        eyebrow={copy.text('home.process.eyebrow')}
        title={copy.text('home.process.title')}
        intro={copy.text('home.process.intro')}
        layout="split"
        actions={
          <ButtonLink to="/how-we-work" variant="secondary" trailingIcon={<ArrowRight />}>
            {copy.text('home.process.cta')}
          </ButtonLink>
        }
      >
        <ol className="oa-h-steps" data-reveal="stagger">
          {copy.pairs('home.process.steps').map((step, i) => (
            <li key={step.title} className="oa-h-step">
              <span className="oa-h-step__num tabular" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="oa-h-step__title">{step.title}</h3>
                <p className="oa-h-step__text">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </HomeSection>

      {/* ------------------------------------------------------------ Industries */}
      {data && data.industries.length > 0 && (
        <HomeSection
          className="oa-h-industries"
          eyebrow={copy.text('home.industries.eyebrow')}
          title={copy.text('home.industries.title')}
          intro={copy.text('home.industries.intro')}
          actions={
            <ButtonLink to="/industries" variant="secondary" trailingIcon={<ArrowRight />}>
              {copy.text('home.industries.cta')}
            </ButtonLink>
          }
        >
          <ul className="oa-h-industry-list" data-reveal="stagger">
            {data.industries.slice(0, 6).map((industry) => (
              <li key={industry.slug}>
                <article className="oa-h-industry">
                  <span className="oa-h-industry__icon" aria-hidden="true">
                    <SiteIcon name={industry.icon} />
                  </span>
                  <div>
                    <h3 className="oa-h-industry__name">
                      <Link to={`/industries/${industry.slug}`} className="oa-h-stretch">
                        {industry.name}
                      </Link>
                    </h3>
                    <p className="oa-h-industry__summary">{industry.summary}</p>
                  </div>
                  <ArrowUpRight className="oa-h-industry__go" aria-hidden="true" />
                </article>
              </li>
            ))}
          </ul>
        </HomeSection>
      )}

      {/* ------------------------------------------------------------ Testimonials */}
      {data && data.testimonials.length > 0 && (
        <HomeSection className="oa-h-voices" center eyebrow={copy.text('home.testimonials.eyebrow')} title={copy.text('home.testimonials.title')}>
          <div className="oa-h-voices__stage" data-reveal="">
            <TestimonialCarousel items={data.testimonials} />
          </div>
        </HomeSection>
      )}

      {/* ------------------------------------------------------------ Insights */}
      {data && data.latestPosts.length > 0 && (
        <HomeSection
          className="oa-h-insights"
          eyebrow={copy.text('home.blog.eyebrow')}
          title={copy.text('home.blog.title')}
          intro={copy.text('home.blog.intro')}
          actions={
            <ButtonLink to="/blog" variant="secondary" trailingIcon={<ArrowRight />}>
              {copy.text('home.blog.cta')}
            </ButtonLink>
          }
        >
          <ul className="oa-h-posts" data-reveal="stagger">
            {data.latestPosts.map((p, i) => (
              <li key={p.slug}>
                <InsightCard post={p} index={i} />
              </li>
            ))}
          </ul>
        </HomeSection>
      )}

      {/* ------------------------------------------------------------ Sibling products */}
      <section className="oa-h-section oa-h-more" aria-labelledby={moreId}>
        <div className="container">
          <div className="oa-h-head oa-h-head--center" data-reveal="">
            <div className="oa-h-head__text">
              <h2 id={moreId} className="oa-h-title">
                {copy.text('home.more.title')}
              </h2>
              <p className="oa-h-intro">{copy.text('home.more.intro')}</p>
            </div>
          </div>
          <ul className="oa-h-products" data-reveal="stagger">
            <li>
              <article className="oa-h-product oa-h-product--academy">
                <AcademyArt />
                <div className="oa-h-product__body">
                  <p className="oa-h-product__kicker">{copy.text('home.more.academy.kicker')}</p>
                  <h3 className="oa-h-product__title">
                    <Link to="/learn" className="oa-h-stretch">
                      {copy.text('home.more.academy.title')}
                    </Link>
                  </h3>
                  <p className="oa-h-product__text">{copy.text('home.more.academy.text')}</p>
                </div>
                <span className="oa-h-product__go" aria-hidden="true">
                  <ArrowUpRight />
                </span>
              </article>
            </li>
            <li>
              <article className="oa-h-product oa-h-product--creators">
                <CreatorsArt />
                <div className="oa-h-product__body">
                  <p className="oa-h-product__kicker">{copy.text('home.more.creators.kicker')}</p>
                  <h3 className="oa-h-product__title">
                    <Link to="/creators" className="oa-h-stretch">
                      {copy.text('home.more.creators.title')}
                    </Link>
                  </h3>
                  <p className="oa-h-product__text">{copy.text('home.more.creators.text')}</p>
                </div>
                <span className="oa-h-product__go" aria-hidden="true">
                  <ArrowUpRight />
                </span>
              </article>
            </li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------ Closing call to action */}
      <section className="oa-h-cta" aria-labelledby={ctaId}>
        <div className="oa-h-cta__stage">
          <div className="oa-h-cta__backdrop" aria-hidden="true" />
          <div className="container oa-h-cta__inner">
            <div className="oa-h-cta__copy" data-reveal="">
              <p className="oa-h-eyebrow">{copy.text('home.cta.eyebrow')}</p>
              <h2 id={ctaId} className="oa-h-cta__title">
                {copy.text('home.cta.title')}
              </h2>
              <p className="oa-h-cta__text">{copy.text('home.cta.text')}</p>
              <div className="oa-h-hero__actions">
                <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                  {copy.text('home.cta.primary')}
                </ButtonLink>
                <ButtonLink to="/free-audit" variant="secondary" size="lg">
                  {copy.text('home.cta.secondary')}
                </ButtonLink>
              </div>
              <ul className="oa-h-cta__points">
                {copy.list('home.cta.points').map((p) => (
                  <li key={p}>
                    <Check aria-hidden="true" /> {p}
                  </li>
                ))}
              </ul>
            </div>
            {data && data.pricingTeaser.length > 0 && <PricingNote items={data.pricingTeaser} />}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Newsletter */}
      <HomeSection className="oa-h-newsletter" title={copy.text('home.newsletter.title')} intro={copy.text('home.newsletter.intro')} layout="split">
        <div className="oa-h-newsletter__form">
          <NewsletterSignup source="home" />
        </div>
      </HomeSection>
    </div>
  );
}
