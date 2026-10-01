import { ArrowRight, CheckCircle2, GraduationCap, Wallet } from 'lucide-react';
import { useRef, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink, Skeleton } from '@/components/ui';
import { useHome } from '../site/api';
import { AgencyVisual } from '../site/art';
import { useSiteCopy } from '../site/copy';
import { LogoCloud, StatsGrid } from '../site/Blocks';
import { CaseStudyCard, PackageCard, PostCard, Section, TestimonialCarousel } from '../site/components';
import { headFromSeo, useDocumentHead } from '../site/head';
import { SiteIcon } from '../site/icons';
import { trackGlow, useReveal } from '../site/motion';
import { NewsletterSignup } from '../site/NewsletterSignup';
import { Timeline, TrustGrid } from '../site/Showcase';
import { PartnerSlot } from '../partners/PartnerSlot';

/**
 * Home: the agency's front page (Optimize All is a marketing agency; the academy and the creator programme are separate
 * products with their own sites). Hero (value proposition, "Book a consultation", "See our work") → client logos and
 * partners → services bento → results → case studies → process → industries → testimonials → pricing → trust → blog →
 * one compact "More from Optimize All" band (Academy, Creators) → newsletter. Figures come from the API (labelled
 * measured or estimated), words from the page copy; nothing here is invented.
 */
/** The compact band linking to the two other products: one card each, nothing more. */
function MoreFromOptimizeAll() {
  const copy = useSiteCopy();
  return (
    <section className="site-section site-section--tight oa-more" aria-labelledby="more-title">
      <div className="container">
        <h2 id="more-title" className="oa-more__title">
          {copy.text('home.more.title')}
        </h2>
        <ul className="oa-more__cards">
          <li>
            <Link to="/learn" className="oa-more__card">
              <GraduationCap aria-hidden="true" />
              <span className="oa-more__kicker">{copy.text('home.more.academy.kicker')}</span>
              <span className="oa-more__label">{copy.text('home.more.academy.title')}</span>
              <ArrowRight aria-hidden="true" className="oa-more__arrow" />
            </Link>
          </li>
          <li>
            <Link to="/creators" className="oa-more__card">
              <Wallet aria-hidden="true" />
              <span className="oa-more__kicker">{copy.text('home.more.creators.kicker')}</span>
              <span className="oa-more__label">{copy.text('home.more.creators.title')}</span>
              <ArrowRight aria-hidden="true" className="oa-more__arrow" />
            </Link>
          </li>
        </ul>
      </div>
    </section>
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

  return (
    <div ref={root} className="oa-home">
      <header className="site-hero site-home-hero oa-hero">
        <div className="container site-hero__inner oa-hero__inner">
          <div className="site-hero__copy oa-hero__copy">
            <p className="site-hero__eyebrow">{copy.text('home.hero.eyebrow')}</p>
            <h1 className="site-hero__title">
              {copy.text('home.hero.title')} <span className="site-hero__highlight">{copy.text('home.hero.titleHighlight')}</span>
            </h1>
            <p className="site-hero__lead">{copy.text('home.hero.lead')}</p>
            <div className="site-hero__actions">
              <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                {copy.text('home.hero.primaryCta')}
              </ButtonLink>
              <ButtonLink to="/case-studies" variant="secondary" size="lg">
                {copy.text('home.hero.secondaryCta')}
              </ButtonLink>
            </div>
            <ul className="site-hero__proof">
              {copy.list('home.hero.proof').map((item) => (
                <li key={item}>
                  <CheckCircle2 aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="site-hero__aside oa-hero__aside">
            <AgencyVisual />
          </div>
        </div>
      </header>

      {data && data.trustLogos.length > 0 && (
        <div className="site-section site-section--tight">
          <div className="container">
            <LogoCloud logos={data.trustLogos} title={copy.text('home.logos.title')} />
          </div>
        </div>
      )}

      <PartnerSlot slot="home.partners" />

      <Section
        id="services"
        eyebrow={copy.text('home.services.eyebrow')}
        title={copy.text('home.services.title')}
        intro={copy.text('home.services.intro')}
        actions={
          <ButtonLink to="/services" variant="secondary">
            {copy.text('home.services.cta')}
          </ButtonLink>
        }
      >
        {isLoading ? (
          <div className="oa-bento">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={180} />
            ))}
          </div>
        ) : (
          <ul className="oa-bento" data-reveal="stagger" onPointerMove={trackGlow}>
            {categories.map((group, i) => (
              <li key={group.slug} className="oa-bento__item" data-glow="" style={{ '--i': i } as CSSProperties}>
                <article className="oa-bento__card">
                  <span className="oa-tile" aria-hidden="true">
                    <SiteIcon name={group.icon} />
                  </span>
                  <h3 className="oa-bento__title">
                    <Link to={`/services?category=${encodeURIComponent(group.slug)}`} className="site-card__link">
                      {group.name}
                    </Link>
                  </h3>
                  {group.description && <p className="oa-bento__text">{group.description}</p>}
                  <ul className="site-chips">
                    {group.services.slice(0, i < 2 ? 6 : 4).map((s) => (
                      <li key={s.slug}>
                        <Link to={`/services/${s.slug}`} className="site-chip">
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data && data.stats.length > 0 && (
        <Section eyebrow={copy.text('home.results.eyebrow')} title={copy.text('home.results.title')} tone="muted" intro={copy.text('home.results.intro')}>
          <StatsGrid items={data.stats} />
        </Section>
      )}

      {data && data.featuredCaseStudies.length > 0 && (
        <Section
          eyebrow={copy.text('home.caseStudies.eyebrow')}
          title={copy.text('home.caseStudies.title')}
          actions={
            <ButtonLink to="/case-studies" variant="secondary">
              {copy.text('home.caseStudies.cta')}
            </ButtonLink>
          }
        >
          <ul className="site-grid site-grid--3" data-reveal="stagger">
            {data.featuredCaseStudies.map((c) => (
              <li key={c.slug}>
                <CaseStudyCard study={c} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        id="how-we-work"
        eyebrow={copy.text('home.process.eyebrow')}
        title={copy.text('home.process.title')}
        tone="muted"
        actions={
          <ButtonLink to="/how-we-work" variant="secondary">
            {copy.text('home.process.cta')}
          </ButtonLink>
        }
      >
        <Timeline steps={copy.pairs('home.process.steps')} className="oa-timeline--agency" />
      </Section>

      {data && data.industries.length > 0 && (
        <Section
          eyebrow={copy.text('home.industries.eyebrow')}
          title={copy.text('home.industries.title')}
          actions={
            <ButtonLink to="/industries" variant="secondary">
              {copy.text('home.industries.cta')}
            </ButtonLink>
          }
        >
          <ul className="site-grid site-grid--3" data-reveal="stagger">
            {data.industries.slice(0, 6).map((industry) => (
              <li key={industry.slug}>
                <article className="site-card">
                  <span className="site-card__icon">
                    <SiteIcon name={industry.icon} />
                  </span>
                  <h3 className="site-card__title">
                    <Link to={`/industries/${industry.slug}`} className="site-card__link">
                      {industry.name}
                    </Link>
                  </h3>
                  <p className="site-card__text">{industry.summary}</p>
                </article>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data && data.testimonials.length > 0 && (
        <Section eyebrow={copy.text('home.testimonials.eyebrow')} title={copy.text('home.testimonials.title')} tone="muted">
          <TestimonialCarousel items={data.testimonials} />
        </Section>
      )}

      {data && data.pricingTeaser.length > 0 && (
        <Section
          eyebrow={copy.text('home.pricing.eyebrow')}
          title={copy.text('home.pricing.title')}
          intro={copy.text('home.pricing.intro')}
          actions={
            <ButtonLink to="/pricing" variant="secondary">
              {copy.text('home.pricing.cta')}
            </ButtonLink>
          }
        >
          <div className="site-packages" data-reveal="stagger">
            {data.pricingTeaser.map((t) => (
              <PackageCard key={t.package.id} pkg={t.package} serviceName={t.serviceName} serviceSlug={t.serviceSlug} />
            ))}
          </div>
        </Section>
      )}

      <TrustGrid />

      {data && data.latestPosts.length > 0 && (
        <Section
          eyebrow={copy.text('home.blog.eyebrow')}
          title={copy.text('home.blog.title')}
          actions={
            <ButtonLink to="/blog" variant="secondary">
              {copy.text('home.blog.cta')}
            </ButtonLink>
          }
        >
          <ul className="site-grid site-grid--3" data-reveal="stagger">
            {data.latestPosts.map((p) => (
              <li key={p.slug}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <MoreFromOptimizeAll />

      <Section title={copy.text('home.newsletter.title')} intro={copy.text('home.newsletter.intro')}>
        <div className="site-narrow">
          <NewsletterSignup source="home" />
        </div>
      </Section>
    </div>
  );
}
