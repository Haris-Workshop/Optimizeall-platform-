import { ArrowRight, ArrowUpRight, Quote } from 'lucide-react';
import { useId, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ButtonLink, EmptyState, FormField, Select, Skeleton } from '@/components/ui';
import { useCaseStudies, useCaseStudy, useIndustries, useIndustry, useServices, type CaseStudyCard, type PublicCaseStudy } from '../site/api';
import { MonogramArt, SectorArt } from '../site/AgencyArt';
import { AgencyHero, AgencySection, CaseGrid, ClosingCta, Figure, NumberedGrid, ServiceRows, type TocItem } from '../site/AgencyKit';
import { formatPublished, PublicQueryState } from '../site/components';
import { headFromSeo, useDocumentHead } from '../site/head';
import { SiteIcon } from '../site/icons';
import { Markdown } from '../site/Markdown';
import { useReveal } from '../site/motion';
import { useSiteCopy } from '../site/copy';
import { PartnerSlot } from '../partners/PartnerSlot';

/**
 * Industries (/industries, /industries/:slug) and case studies (/case-studies, /case-studies/:slug), in the agency
 * pages' visual language (site/AgencyKit.tsx). Figures come only from the API and say whether they were measured or
 * estimated. The server-rendered HTML (backend SeoPageResolver: IndustriesAsync, IndustryAsync, CaseStudiesAsync,
 * CaseStudyAsync) follows the same order and words.
 */

/** /industries */
export function IndustriesPage() {
  const { data, isLoading, error } = useIndustries();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead({ title: copy.text('industries.seo.title'), description: copy.text('industries.seo.description') });
  const items = data ?? [];
  const listId = useId();
  return (
    <div ref={root} className="oa-ap">
      <AgencyHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Industries' }]}
        eyebrow={copy.text('industries.hero.eyebrow')}
        title={copy.text('industries.hero.title')}
        lead={copy.text('industries.hero.lead')}
        actions={
          <>
            <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
              {copy.text('agency.cta.primary')}
            </ButtonLink>
            <ButtonLink to="/case-studies" variant="secondary" size="lg">
              {copy.text('industries.hero.secondaryCta')}
            </ButtonLink>
          </>
        }
        // The art keeps its room while the sectors load (its fixed aspect ratio), so the page does not jump when they arrive.
        aside={
          isLoading || items.length > 0 ? <SectorArt sectors={items.map((i) => ({ name: i.name, icon: i.icon }))} /> : undefined
        }
      />
      <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="Industries unavailable">
        <section className="oa-a-section" aria-labelledby={listId}>
          <div className="container">
            <div className="oa-a-head" data-reveal="">
              <div className="oa-a-head__text">
                <p className="oa-a-eyebrow">{copy.text('industries.list.eyebrow')}</p>
                <h2 id={listId} className="oa-a-title">
                  {copy.text('industries.list.title')}
                </h2>
                <p className="oa-a-intro">{copy.text('industries.list.intro')}</p>
              </div>
            </div>
            <ul className="oa-a-sectors" data-reveal="stagger">
              {items.map((i, n) => (
                <li key={i.slug}>
                  <article className="oa-a-sector">
                    <span className="oa-a-sector__index tabular" aria-hidden="true">
                      {String(n + 1).padStart(2, '0')}
                    </span>
                    <span className="oa-a-sector__icon" aria-hidden="true">
                      <SiteIcon name={i.icon} />
                    </span>
                    <h3 className="oa-a-sector__name">
                      <Link to={`/industries/${i.slug}`} className="oa-a-stretch">
                        {i.name}
                      </Link>
                    </h3>
                    <p className="oa-a-sector__summary">{i.summary}</p>
                    <ArrowUpRight className="oa-a-sector__go" aria-hidden="true" />
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </PublicQueryState>
      <AgencySection
        tone="tint"
        eyebrow={copy.text('industries.approach.eyebrow')}
        title={copy.text('industries.approach.title')}
        intro={copy.text('industries.approach.intro')}
        layout="split"
      >
        <ol className="oa-a-pointgrid" data-reveal="stagger">
          {copy.pairs('industries.approach.points').map((p, i) => (
            <li key={p.title}>
              <span className="oa-a-pointgrid__num tabular" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="oa-a-pointgrid__title">{p.title}</h3>
              <p className="oa-a-pointgrid__text">{p.text}</p>
            </li>
          ))}
        </ol>
      </AgencySection>
      <ClosingCta title={copy.text('shared.cta.title')} text={copy.text('shared.cta.text')} />
    </div>
  );
}

/** /industries/:slug */
export function IndustryDetailPage() {
  const { slug = '' } = useParams();
  const { data: i, isLoading, error } = useIndustry(slug);
  const all = useIndustries();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead(i ? headFromSeo(i.seo, i.jsonLd) : { title: 'Industry' });
  return (
    <div ref={root} className="oa-ap">
      <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="We couldn't find that industry">
        {i && (
          <>
            <AgencyHero
              crumbs={[{ label: 'Home', to: '/' }, { label: 'Industries', to: '/industries' }, { label: i.name }]}
              eyebrow={copy.text('industries.hero.eyebrow')}
              title={copy.text('industries.detail.title', { name: i.name })}
              lead={i.summary}
              actions={
                <>
                  <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                    {copy.text('agency.cta.primary')}
                  </ButtonLink>
                  {i.caseStudies.length > 0 && (
                    <ButtonLink to="#results" variant="secondary" size="lg">
                      {copy.text('industries.detail.resultsCta')}
                    </ButtonLink>
                  )}
                </>
              }
              aside={
                i.heroImageUrl ? (
                  <img className="oa-a-hero__image" src={i.heroImageUrl} alt="" width={640} height={480} decoding="async" />
                ) : (
                  <SectorArt sectors={(all.data ?? []).map((x) => ({ name: x.name, icon: x.icon }))} focus={{ name: i.name, icon: i.icon }} />
                )
              }
            />
            {i.bodyMarkdown && (
              <div className="oa-a-section oa-a-overview">
                <div className="container oa-a-split">
                  <p className="oa-a-eyebrow oa-a-overview__label">{copy.text('industries.detail.overviewLabel')}</p>
                  <div className="oa-a-prose oa-a-prose--lead">
                    <Markdown source={i.bodyMarkdown} />
                  </div>
                </div>
              </div>
            )}
            {i.challenges.length > 0 && (
              <AgencySection tone="tint" eyebrow={i.name} title={copy.text('industries.detail.challengesTitle')}>
                <NumberedGrid items={i.challenges} />
              </AgencySection>
            )}
            {i.services.length > 0 && (
              <AgencySection
                title={copy.text('industries.detail.servicesTitle')}
                intro={copy.text('industries.detail.servicesIntro', { name: i.name })}
                layout="split"
              >
                <ServiceRows items={i.services} />
              </AgencySection>
            )}
            {i.caseStudies.length > 0 && (
              <AgencySection
                id="results"
                tone="dark"
                eyebrow={copy.text('services.detail.resultsEyebrow')}
                title={copy.text('industries.detail.caseStudiesTitle', { name: i.name })}
                actions={
                  <ButtonLink to={`/case-studies?industry=${encodeURIComponent(i.slug)}`} variant="secondary" trailingIcon={<ArrowRight />}>
                    {copy.text('services.detail.allCaseStudies')}
                  </ButtonLink>
                }
              >
                <CaseGrid items={i.caseStudies} />
              </AgencySection>
            )}
            <ClosingCta title={copy.text('industries.detail.ctaTitle', { name: i.name.toLowerCase() })} text={copy.text('shared.cta.text')} />
          </>
        )}
      </PublicQueryState>
    </div>
  );
}

/** The case studies hero's side panel: one headline figure from each of the first few studies (all from the API). */
function ProofLedger({ items }: { items: CaseStudyCard[] }) {
  const copy = useSiteCopy();
  const headingId = useId();
  const rows = items.filter((c) => c.highlights.length > 0).slice(0, 3);
  if (rows.length === 0) return null;
  return (
    <aside className="oa-a-panel oa-a-ledger" aria-labelledby={headingId}>
      <h2 id={headingId} className="oa-a-panel__kicker">
        {copy.text('caseStudies.hero.ledgerTitle')}
      </h2>
      <ul>
        {rows.map((c) => (
          <li key={c.slug}>
            <Figure metric={c.highlights[0]} size="md" />
            <p className="oa-a-ledger__client">{c.clientName}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** ProofLedger's room while the case studies load (three blank rows), so the hero does not grow when they arrive. */
function ProofLedgerPlaceholder() {
  return (
    <div className="oa-a-panel oa-a-ledger" aria-hidden="true">
      <p className="oa-a-panel__kicker">{'\u00a0'}</p>
      <ul>
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i}>
            <Skeleton height={44} width="45%" />
            <Skeleton height={14} width="70%" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** /case-studies — filter by service and industry (kept in the URL). */
export function CaseStudiesPage() {
  const [params, setParams] = useSearchParams();
  const service = params.get('service') ?? '';
  const industry = params.get('industry') ?? '';
  const { data, isLoading, error } = useCaseStudies({ service: service || undefined, industry: industry || undefined });
  const all = useCaseStudies({});
  const services = useServices();
  const industries = useIndustries();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  // Filtered views are noindex (links followed) with the unfiltered list as canonical, as the server renders them.
  useDocumentHead({
    title: copy.text('caseStudies.seo.title'),
    description: copy.text('caseStudies.seo.description'),
    canonical: '/case-studies',
    noIndex: Boolean(service || industry),
    follow: true,
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const listId = useId();
  const items = data ?? [];

  return (
    <div ref={root} className="oa-ap">
      <AgencyHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Case studies' }]}
        eyebrow={copy.text('caseStudies.hero.eyebrow')}
        title={copy.text('caseStudies.hero.title')}
        lead={copy.text('caseStudies.hero.lead')}
        actions={
          <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
            {copy.text('agency.cta.primary')}
          </ButtonLink>
        }
        aside={
          all.isLoading ? (
            <ProofLedgerPlaceholder />
          ) : all.data && all.data.some((c) => c.highlights.length > 0) ? (
            <ProofLedger items={all.data} />
          ) : undefined
        }
      />
      <div className="oa-a-filterbar">
        <div className="container oa-a-filters" role="search" aria-label={copy.text('caseStudies.filter.label')}>
          <FormField label={copy.text('caseStudies.filter.service')}>
            <Select
              value={service}
              onChange={(e) => update('service', e.target.value)}
              placeholder={copy.text('caseStudies.filter.allServices')}
              options={(services.data ?? []).map((g) => ({ label: g.name, options: g.services.map((s) => ({ value: s.slug, label: s.name })) }))}
            />
          </FormField>
          <FormField label={copy.text('caseStudies.filter.industry')}>
            <Select
              value={industry}
              onChange={(e) => update('industry', e.target.value)}
              placeholder={copy.text('caseStudies.filter.allIndustries')}
              options={(industries.data ?? []).map((i) => ({ value: i.slug, label: i.name }))}
            />
          </FormField>
          {data && (
            <p className="oa-a-filters__count" role="status">
              {copy.text('caseStudies.filter.count', { count: items.length })}
            </p>
          )}
        </div>
      </div>
      <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="Case studies unavailable">
        <section className="oa-a-section oa-a-caselist" aria-labelledby={listId}>
          <div className="container">
            <h2 id={listId} className="visually-hidden">
              {copy.text('caseStudies.hero.eyebrow')}
            </h2>
            {data && items.length === 0 ? (
              <EmptyState title={copy.text('caseStudies.empty.title')} headingLevel={3} description={copy.text('caseStudies.empty.description')} />
            ) : (
              <CaseGrid items={items} headingLevel={3} tone="light" label={copy.text('caseStudies.hero.eyebrow')} />
            )}
          </div>
        </section>
      </PublicQueryState>
      <ClosingCta title={copy.text('shared.cta.title')} text={copy.text('shared.cta.text')} />
    </div>
  );
}

/** The case study hero's side: the cover image, or the headline result, or the client's monogram. */
function CaseHeroAside({ c }: { c: PublicCaseStudy }) {
  if (c.coverImageUrl) return <img className="oa-a-hero__image" src={c.coverImageUrl} alt="" width={640} height={480} decoding="async" />;
  return <MonogramArt name={c.clientName} />;
}

/**
 * /case-studies/:slug — hero → results band (each figure measured or estimated) → the story (challenge, strategy,
 * execution) beside a sticky contents rail → the client's words → gallery → services used → more case studies → call
 * to action.
 */
export function CaseStudyDetailPage() {
  const { slug = '' } = useParams();
  const { data: c, isLoading, error } = useCaseStudy(slug);
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead(c ? headFromSeo(c.seo, c.jsonLd, 'article') : { title: 'Case study' });
  const hasEstimate = c?.metrics.some((m) => m.measurement === 'Estimated');
  const resultsId = useId();

  const parts = c
    ? [
        { id: 'challenge', title: copy.text('caseStudies.detail.challengeTitle'), md: c.challengeMarkdown },
        { id: 'strategy', title: copy.text('caseStudies.detail.strategyTitle'), md: c.strategyMarkdown },
        { id: 'execution', title: copy.text('caseStudies.detail.executionTitle'), md: c.executionMarkdown },
      ].filter((p): p is { id: string; title: string; md: string } => !!p.md)
    : [];
  const toc: TocItem[] = [
    ...(c && c.metrics.length > 0 ? [{ id: 'results', label: copy.text('caseStudies.detail.resultsTitle') }] : []),
    ...parts.map((p) => ({ id: p.id, label: p.title })),
    ...(c?.testimonialQuote ? [{ id: 'in-their-words', label: copy.text('caseStudies.detail.quoteTitle') }] : []),
  ];

  return (
    <div ref={root} className="oa-ap">
      <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="We couldn't find that case study">
        {c && (
          <>
            <AgencyHero
              crumbs={[{ label: 'Home', to: '/' }, { label: 'Case studies', to: '/case-studies' }, { label: c.title }]}
              eyebrow={[c.clientName, c.industryName].filter(Boolean).join(' · ')}
              title={c.title}
              lead={c.summary}
              meta={
                <dl className="oa-a-facts">
                  <div>
                    <dt>{copy.text('caseStudies.detail.clientLabel')}</dt>
                    <dd>{c.clientName}</dd>
                  </div>
                  {c.industryName && (
                    <div>
                      <dt>{copy.text('caseStudies.detail.industryLabel')}</dt>
                      <dd>{c.industrySlug ? <Link to={`/industries/${c.industrySlug}`}>{c.industryName}</Link> : c.industryName}</dd>
                    </div>
                  )}
                  {c.services.length > 0 && (
                    <div>
                      <dt>{copy.text('caseStudies.detail.servicesLabel')}</dt>
                      <dd>{c.services.map((s) => s.name).join(', ')}</dd>
                    </div>
                  )}
                  {c.publishedAt && (
                    <div>
                      <dt>{copy.text('caseStudies.detail.publishedLabel')}</dt>
                      <dd>
                        <time dateTime={c.publishedAt}>{formatPublished(c.publishedAt)}</time>
                      </dd>
                    </div>
                  )}
                </dl>
              }
              aside={<CaseHeroAside c={c} />}
            />

            {c.metrics.length > 0 && (
              <section id="results" className="oa-a-results" aria-labelledby={resultsId}>
                <div className="oa-a-dark">
                  <div className="container oa-a-results__inner">
                    <div className="oa-a-results__head" data-reveal="">
                      <p className="oa-a-eyebrow">{c.clientName}</p>
                      <h2 id={resultsId} className="oa-a-title">
                        {copy.text('caseStudies.detail.resultsTitle')}
                      </h2>
                      {hasEstimate && <p className="oa-a-intro">{copy.text('caseStudies.detail.estimateNote')}</p>}
                    </div>
                    <ul className={`oa-a-figs oa-a-figs--${Math.min(c.metrics.length, 4)}`} data-reveal="stagger">
                      {c.metrics.map((m) => (
                        <li key={m.label}>
                          <Figure metric={m} size="lg" />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {(parts.length > 0 || c.testimonialQuote) && (
              <div className="oa-a-section oa-a-story">
                <div className="container oa-a-story__inner">
                  <aside className="oa-a-story__rail">
                    {toc.length > 1 && (
                      <nav aria-label={copy.text('agency.onThisPage')} className="oa-a-rail-nav">
                        <p className="oa-a-eyebrow">{copy.text('agency.onThisPage')}</p>
                        <ol>
                          {toc.map((t) => (
                            <li key={t.id}>
                              <a href={`#${t.id}`}>{t.label}</a>
                            </li>
                          ))}
                        </ol>
                      </nav>
                    )}
                  </aside>
                  <div className="oa-a-story__body">
                    {parts.map((p, n) => (
                      <section key={p.id} id={p.id} className="oa-a-chapter" aria-labelledby={`${p.id}-title`}>
                        <p className="oa-a-chapter__num tabular" aria-hidden="true">
                          {String(n + 1).padStart(2, '0')}
                        </p>
                        <h2 id={`${p.id}-title`} className="oa-a-chapter__title">
                          {p.title}
                        </h2>
                        <div className="oa-a-prose">
                          <Markdown source={p.md} minLevel={3} />
                        </div>
                      </section>
                    ))}
                    {c.testimonialQuote && (
                      <section id="in-their-words" className="oa-a-chapter" aria-labelledby="in-their-words-title">
                        <h2 id="in-their-words-title" className="visually-hidden">
                          {copy.text('caseStudies.detail.quoteTitle')}
                        </h2>
                        <figure className="oa-a-pullquote">
                          <Quote aria-hidden="true" />
                          <blockquote>
                            <p>{c.testimonialQuote}</p>
                          </blockquote>
                          {c.testimonialAuthor && (
                            <figcaption>
                              <strong>{c.testimonialAuthor}</strong>
                              {c.testimonialRole && <span>{c.testimonialRole}</span>}
                            </figcaption>
                          )}
                        </figure>
                      </section>
                    )}
                    <PartnerSlot
                      slot="case-study.detail"
                      keywords={[c.industryName, ...c.services.map((s) => s.name)].filter((k): k is string => !!k)}
                      categories={[c.industrySlug, ...c.services.map((s) => s.slug)].filter((k): k is string => !!k)}
                    />
                  </div>
                </div>
              </div>
            )}

            {c.galleryImageUrls.length > 0 && (
              <AgencySection tone="tint" title={copy.text('caseStudies.detail.galleryTitle')}>
                <div className="oa-a-gallery">
                  {c.galleryImageUrls.map((url, index) => (
                    <img key={url} src={url} alt={`${c.title} — gallery ${index + 1} of ${c.galleryImageUrls.length}`} loading="lazy" decoding="async" width={440} height={330} />
                  ))}
                </div>
              </AgencySection>
            )}

            {c.services.length > 0 && (
              <AgencySection title={copy.text('caseStudies.detail.servicesTitle')} layout="split">
                <ServiceRows items={c.services} />
              </AgencySection>
            )}

            {c.related.length > 0 && (
              <AgencySection
                tone="dark"
                title={copy.text('caseStudies.detail.moreTitle')}
                actions={
                  <ButtonLink to="/case-studies" variant="secondary" trailingIcon={<ArrowRight />}>
                    {copy.text('services.detail.allCaseStudies')}
                  </ButtonLink>
                }
              >
                <CaseGrid items={c.related} />
              </AgencySection>
            )}
            <ClosingCta title={copy.text('caseStudies.detail.ctaTitle')} text={copy.text('caseStudies.detail.ctaText')} />
          </>
        )}
      </PublicQueryState>
    </div>
  );
}
