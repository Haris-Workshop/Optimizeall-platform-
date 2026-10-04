import { ArrowRight, Check } from 'lucide-react';
import { useId, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ui';
import { isExternalHref, isInternalHref } from '@/lib/safeHref';
import { useService, useServices, type PublicService, type ServiceCategoryGroup } from '../site/api';
import { CapabilityArt } from '../site/AgencyArt';
import {
  AgencyHero,
  AgencySection,
  CaseGrid,
  ClosingCta,
  FaqAccordion,
  lowestPrice,
  money,
  NumberedGrid,
  OnThisPage,
  periodSuffix,
  PointGrid,
  ServiceRows,
  StepRail,
  TierGrid,
  type TocItem,
} from '../site/AgencyKit';
import { useSiteCopy } from '../site/copy';
import { PublicQueryState, TestimonialCarousel } from '../site/components';
import { headFromSeo, useDocumentHead } from '../site/head';
import { SiteIcon } from '../site/icons';
import { Markdown } from '../site/Markdown';
import { useReveal } from '../site/motion';
import { RedirectIfMoved } from '../site/redirects';
import { PartnerSlot } from '../partners/PartnerSlot';

/**
 * /services: the agency's service lines as numbered chapters (filterable by line, `?category=`), each listing its
 * services with their starting prices; then how engagements work and the consultation call to action.
 * The server-rendered HTML (backend SeoPageResolver.ServicesAsync) follows the same order and words.
 */
export function ServicesPage() {
  const { data, isLoading, error } = useServices();
  const [params, setParams] = useSearchParams();
  const active = params.get('category');
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead({ title: copy.text('services.seo.title'), description: copy.text('services.seo.description') });
  const all = data ?? [];
  const groups = all.filter((g) => !active || g.slug === active);
  const serviceCount = all.reduce((n, g) => n + g.services.length, 0);
  // A service line that was renamed: follow its redirect to the new filter.
  const unknownCategory = !!active && !!data && !data.some((g) => g.slug === active);
  const filterId = useId();

  return (
    <div ref={root} className="oa-ap">
      <RedirectIfMoved when={unknownCategory} />
      <AgencyHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Services' }]}
        eyebrow={copy.text('services.hero.eyebrow')}
        title={copy.text('services.hero.title')}
        lead={copy.text('services.hero.lead')}
        actions={
          <>
            <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
              {copy.text('agency.cta.primary')}
            </ButtonLink>
            <ButtonLink to="/case-studies" variant="secondary" size="lg">
              {copy.text('services.hero.secondaryCta')}
            </ButtonLink>
          </>
        }
        // While the service lines load, the hero keeps the room of its final layout (the meta line and the art, whose
        // tiles fill in): growing it when the data arrived pushed the whole page down on phones (CLS 0.18).
        meta={
          isLoading ? (
            <p className="oa-a-hero__meta" aria-hidden="true">
              {'\u00a0'}
            </p>
          ) : (
            all.length > 0 && (
              <p className="oa-a-hero__meta">
                {copy.text('services.hero.meta', { lines: all.length, services: serviceCount })}
              </p>
            )
          )
        }
        aside={
          isLoading || all.length > 0 ? <CapabilityArt lines={all.map((g) => ({ name: g.name, icon: g.icon }))} /> : undefined
        }
      />

      <div className="oa-a-filterbar">
        <div className="container">
          <div role="group" aria-labelledby={filterId} className="oa-a-chips">
            <span id={filterId} className="oa-a-chips__label">
              {copy.text('services.filter.label')}
            </span>
            <button type="button" className="oa-a-chip" aria-pressed={!active} onClick={() => setParams({})}>
              {copy.text('services.filter.all')}
            </button>
            {all.map((g) => (
              <button key={g.slug} type="button" className="oa-a-chip" aria-pressed={active === g.slug} onClick={() => setParams({ category: g.slug })}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="Services unavailable">
        <div className="oa-a-lines">
          {groups.map((group) => {
            const index = all.indexOf(group);
            return <ServiceLine key={group.slug} group={group} index={index} />;
          })}
        </div>
      </PublicQueryState>
      {data && (
        <div className="container">
          <PartnerSlot slot="services.index" keywords={all.map((g) => g.name)} categories={all.map((g) => g.slug)} />
        </div>
      )}

      <AgencySection
        className="oa-a-approach"
        tone="tint"
        eyebrow={copy.text('services.approach.eyebrow')}
        title={copy.text('services.approach.title')}
        intro={copy.text('services.approach.intro')}
        layout="split"
      >
        <PointGrid items={copy.pairs('services.approach.points')} />
      </AgencySection>

      <ClosingCta title={copy.text('services.cta.title')} text={copy.text('services.cta.text')} />
    </div>
  );
}

function ServiceLine({ group, index }: { group: ServiceCategoryGroup; index: number }) {
  const copy = useSiteCopy();
  const headingId = useId();
  return (
    <section id={`line-${group.slug}`} className="oa-a-line" aria-labelledby={headingId}>
      <div className="container oa-a-line__inner">
        <div className="oa-a-line__head" data-reveal="">
          <div className="oa-a-line__mark">
            <span className="oa-a-line__index tabular" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="oa-a-line__icon" aria-hidden="true">
              <SiteIcon name={group.icon} />
            </span>
          </div>
          <h2 id={headingId} className="oa-a-line__title">
            {group.name}
          </h2>
          {group.description && <p className="oa-a-line__text">{group.description}</p>}
          <p className="oa-a-line__count">{copy.text('services.line.count', { count: group.services.length })}</p>
        </div>
        <ServiceRows items={group.services} />
      </div>
    </section>
  );
}

function ServiceCta({ label, url }: { label: string | null; url: string | null }) {
  if (!label || !url) return null;
  if (isInternalHref(url))
    return (
      <Link to={url} className="oa-a-textlink">
        {label} <ArrowRight aria-hidden="true" />
      </Link>
    );
  if (isExternalHref(url))
    return (
      <a className="oa-a-textlink" href={url} target="_blank" rel="noopener noreferrer">
        {label} <ArrowRight aria-hidden="true" />
      </a>
    );
  return null;
}

/** The hero's side panel: the results this service moves (its KPIs) and where pricing starts. */
function KpiPanel({ s }: { s: PublicService }) {
  const copy = useSiteCopy();
  const from = lowestPrice(s.packages);
  const headingId = useId();
  if (s.kpis.length === 0 && !from) return null;
  return (
    <aside className="oa-a-panel" aria-labelledby={headingId}>
      <div className="oa-a-panel__head">
        <span className="oa-a-panel__icon" aria-hidden="true">
          <SiteIcon name={s.icon} />
        </span>
        <h2 id={headingId} className="oa-a-panel__title">
          {copy.text('services.detail.kpisTitle')}
        </h2>
      </div>
      {s.kpis.length > 0 && (
        <ul className="oa-a-panel__list">
          {s.kpis.map((k) => (
            <li key={k}>
              <Check aria-hidden="true" />
              {k}
            </li>
          ))}
        </ul>
      )}
      {from && (
        <p className="oa-a-panel__price">
          <span>{copy.text('services.detail.startingFrom')}</span>
          <span>
            <strong className="tabular">{money(from.amount, from.currency)}</strong> {periodSuffix(from.billingPeriod)}
          </span>
        </p>
      )}
    </aside>
  );
}

/**
 * /services/:slug: cinematic hero (what the service moves, where pricing starts) → "on this page" bar → overview →
 * problems → what's included and tools → process rail → packages → results (case studies, a dark chapter) → client
 * words → FAQ (FAQPage JSON-LD comes from the API) → related services → consultation call to action.
 * The server-rendered HTML (backend SeoPageResolver.ServiceAsync) follows the same order and words.
 */
export function ServiceDetailPage() {
  const { slug = '' } = useParams();
  const { data: s, isLoading, error } = useService(slug);
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead(s ? headFromSeo(s.seo, s.jsonLd) : { title: 'Service' });

  const toc: TocItem[] = s
    ? [
        s.overviewMarkdown ? { id: 'overview', label: copy.text('services.detail.overviewLabel') } : null,
        s.problemsSolved.length > 0 ? { id: 'problems', label: copy.text('services.detail.problemsTitle') } : null,
        s.deliverables.length > 0 ? { id: 'included', label: copy.text('services.detail.includedTitle') } : null,
        s.processSteps.length > 0 ? { id: 'process', label: copy.text('services.detail.processTitle') } : null,
        s.packages.length > 0 ? { id: 'pricing', label: copy.text('services.detail.pricingTitle') } : null,
        s.caseStudies.length > 0 ? { id: 'results', label: copy.text('services.detail.caseStudiesTitle') } : null,
        s.faqs.length > 0 ? { id: 'faq', label: copy.text('services.detail.faqTitle') } : null,
      ].filter((x): x is TocItem => !!x)
    : [];

  return (
    <div ref={root} className="oa-ap">
      <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="We couldn't find that service" backTo={{ to: '/services', label: 'Browse all services' }}>
        {s && (
          <>
            <AgencyHero
              crumbs={[{ label: 'Home', to: '/' }, { label: 'Services', to: '/services' }, { label: s.name }]}
              eyebrow={s.categoryName}
              title={s.heroTitle ?? s.name}
              lead={s.heroBody ?? s.tagline}
              actions={
                <>
                  <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                    {copy.text('services.detail.callCta')}
                  </ButtonLink>
                  <ButtonLink to={`/get-a-quote?service=${encodeURIComponent(s.slug)}`} variant="secondary" size="lg">
                    {copy.text('services.detail.quoteCta')}
                  </ButtonLink>
                </>
              }
              meta={
                s.ctaLabel && s.ctaUrl ? (
                  <p className="oa-a-hero__more">
                    <ServiceCta label={s.ctaLabel} url={s.ctaUrl} />
                  </p>
                ) : undefined
              }
              aside={
                s.heroImageUrl ? (
                  <img className="oa-a-hero__image" src={s.heroImageUrl} alt="" width={640} height={480} decoding="async" />
                ) : (
                  <KpiPanel s={s} />
                )
              }
            />

            <OnThisPage
              items={toc}
              action={
                <ButtonLink to="/book-a-consultation" variant="highlight" size="sm">
                  {copy.text('services.detail.callCta')}
                </ButtonLink>
              }
            />

            {s.overviewMarkdown && (
              <div id="overview" className="oa-a-section oa-a-overview">
                <div className="container oa-a-split">
                  <p className="oa-a-eyebrow oa-a-overview__label">{copy.text('services.detail.overviewLabel')}</p>
                  <div className="oa-a-prose oa-a-prose--lead">
                    <Markdown source={s.overviewMarkdown} />
                  </div>
                </div>
              </div>
            )}

            <div className="container oa-a-narrow">
              <PartnerSlot slot="service.detail" keywords={[s.name, s.categoryName, ...s.tools]} categories={[s.slug, s.categorySlug]} />
            </div>

            {s.problemsSolved.length > 0 && (
              <AgencySection id="problems" tone="tint" eyebrow={s.name} title={copy.text('services.detail.problemsTitle')}>
                <NumberedGrid items={s.problemsSolved} />
              </AgencySection>
            )}

            {s.deliverables.length > 0 && (
              <AgencySection id="included" title={copy.text('services.detail.includedTitle')} layout="split">
                <ul className="oa-a-checks" data-reveal="stagger">
                  {s.deliverables.map((d) => (
                    <li key={d}>
                      <Check aria-hidden="true" />
                      {d}
                    </li>
                  ))}
                </ul>
                {s.tools.length > 0 && (
                  <div className="oa-a-tools">
                    <h3 className="oa-a-subtitle">{copy.text('services.detail.toolsTitle')}</h3>
                    <ul className="oa-a-tags">
                      {s.tools.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AgencySection>
            )}

            {s.processSteps.length > 0 && (
              <AgencySection id="process" tone="tint" title={copy.text('services.detail.processTitle')}>
                <StepRail steps={s.processSteps.map((p) => ({ title: p.title, text: p.description }))} />
              </AgencySection>
            )}

            {s.packages.length > 0 && (
              <AgencySection id="pricing" title={copy.text('services.detail.pricingTitle')} intro={copy.text('services.detail.pricingIntro')}>
                <TierGrid packages={s.packages} serviceSlug={s.slug} />
              </AgencySection>
            )}

            {s.caseStudies.length > 0 && (
              <AgencySection
                id="results"
                tone="dark"
                eyebrow={copy.text('services.detail.resultsEyebrow')}
                title={copy.text('services.detail.caseStudiesTitle')}
                actions={
                  <ButtonLink to={`/case-studies?service=${encodeURIComponent(s.slug)}`} variant="secondary" trailingIcon={<ArrowRight />}>
                    {copy.text('services.detail.allCaseStudies')}
                  </ButtonLink>
                }
              >
                <CaseGrid items={s.caseStudies} />
              </AgencySection>
            )}

            {s.testimonials.length > 0 && (
              <AgencySection className="oa-a-voices" title={copy.text('services.detail.testimonialsTitle')}>
                <div className="oa-a-voices__stage" data-reveal="">
                  <TestimonialCarousel items={s.testimonials} />
                </div>
              </AgencySection>
            )}

            {s.faqs.length > 0 && (
              <AgencySection id="faq" tone="tint" title={copy.text('services.detail.faqTitle')} layout="split">
                <FaqAccordion items={s.faqs} />
              </AgencySection>
            )}

            {s.relatedServices.length > 0 && (
              <AgencySection title={copy.text('services.detail.relatedTitle')}>
                <ServiceRows items={s.relatedServices} />
              </AgencySection>
            )}

            <ClosingCta
              title={copy.text('services.detail.ctaTitle', { name: s.name })}
              text={copy.text('services.detail.ctaText')}
              secondary={{ label: copy.text('services.detail.quoteCta'), to: `/get-a-quote?service=${encodeURIComponent(s.slug)}` }}
            />
          </>
        )}
      </PublicQueryState>
    </div>
  );
}
