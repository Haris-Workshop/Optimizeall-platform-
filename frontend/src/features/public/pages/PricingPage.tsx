import { ArrowRight } from 'lucide-react';
import { memo, useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink, EmptyState } from '@/components/ui';
import { usePage, usePricing, type Pricing } from '../site/api';
import { TierArt } from '../site/AgencyArt';
import { AgencyHero, AgencySection, ClosingCta, OnThisPage, PointGrid, TierGrid, type TocItem } from '../site/AgencyKit';
import { Blocks } from '../site/Blocks';
import { useSiteCopy } from '../site/copy';
import { PublicQueryState } from '../site/components';
import { useDocumentHead } from '../site/head';
import { SiteIcon } from '../site/icons';
import { useReveal } from '../site/motion';

type Mode = 'recurring' | 'oneTime';

/**
 * One service's packages: the service beside its tiers, with a link to what the service includes. Memoized: the
 * toggle's immediate render (before the deferred mode catches up) skips the unchanged price list.
 */
const ServicePricing = memo(function ServicePricing({ entry, lineAnchor }: { entry: Pricing['services'][number]; lineAnchor: boolean }) {
  const copy = useSiteCopy();
  const headingId = useId();
  const { service, packages } = entry;
  return (
    <section id={lineAnchor ? `line-${service.categorySlug}` : `price-${service.slug}`} className="oa-a-pricing" aria-labelledby={headingId}>
      <div className="container oa-a-pricing__inner">
        <div className="oa-a-pricing__head" data-reveal="">
          <span className="oa-a-pricing__icon" aria-hidden="true">
            <SiteIcon name={service.icon} />
          </span>
          <p className="oa-a-pricing__line">{service.categoryName}</p>
          <h2 id={headingId} className="oa-a-pricing__title">
            {service.name}
          </h2>
          <p className="oa-a-pricing__text">{service.tagline}</p>
          <Link to={`/services/${service.slug}#pricing`} className="oa-a-textlink">
            {copy.text('pricing.service.link', { name: service.name })} <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <TierGrid packages={packages} serviceSlug={service.slug} serviceName={service.name} />
      </div>
    </section>
  );
});

/**
 * /pricing — every service's packages, switchable between monthly retainers and one-time projects, with a jump bar to
 * each service, how pricing works, the CMS "pricing" page's blocks (its FAQ last) and the consultation call to action.
 * The server-rendered HTML (backend SeoPageResolver.PricingAsync) follows the same order and words.
 */
export function PricingPage() {
  const { data, isLoading, error } = usePricing();
  const page = usePage('pricing');
  const [mode, setMode] = useState<Mode>('recurring');
  // The toggle answers at once; the price list (dozens of services) re-renders with the new mode in a non-blocking
  // render React can interrupt, so a tap on a slow phone paints immediately (interaction latency, INP).
  const shownMode = useDeferredValue(mode);
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead({ title: copy.text('pricing.seo.title'), description: copy.text('pricing.seo.description') });
  const toggleId = useId();

  const services = useMemo(
    () =>
      (data?.services ?? [])
        .map((s) => ({
          ...s,
          packages: s.packages.filter((p) => (shownMode === 'oneTime' ? p.billingPeriod === 'OneTime' : p.billingPeriod !== 'OneTime')),
        }))
        .filter((s) => s.packages.length > 0),
    [data, shownMode],
  );

  // The jump bar lists the service lines; each points at its first service.
  const lines: TocItem[] = [];
  for (const { service } of services)
    if (!lines.some((l) => l.id === `line-${service.categorySlug}`)) lines.push({ id: `line-${service.categorySlug}`, label: service.categoryName });

  return (
    <div ref={root} className="oa-ap">
      <AgencyHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Pricing' }]}
        eyebrow={copy.text('pricing.hero.eyebrow')}
        title={copy.text('pricing.hero.title')}
        lead={copy.text('pricing.hero.lead')}
        actions={
          <>
            <ButtonLink to="/book-a-consultation" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
              {copy.text('agency.cta.primary')}
            </ButtonLink>
            <ButtonLink to="/get-a-quote" variant="secondary" size="lg">
              {copy.text('pricing.hero.secondaryCta')}
            </ButtonLink>
          </>
        }
        aside={<TierArt />}
      />
      {page.data && <Blocks blocks={page.data.blocks.filter((b) => b.type !== 'faq')} />}

      <div className="oa-a-filterbar oa-a-filterbar--pricing">
        <div className="container oa-a-billing">
          <span id={toggleId} className="oa-a-chips__label">
            {copy.text('pricing.toggle.label')}
          </span>
          <div className="oa-a-segment" role="group" aria-labelledby={toggleId}>
            <button type="button" aria-pressed={mode === 'recurring'} onClick={() => setMode('recurring')}>
              {copy.text('pricing.toggle.recurring')}
            </button>
            <button type="button" aria-pressed={mode === 'oneTime'} onClick={() => setMode('oneTime')}>
              {copy.text('pricing.toggle.oneTime')}
            </button>
          </div>
        </div>
      </div>
      <OnThisPage items={lines} label={copy.text('pricing.jump.label')} />

      <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="Pricing unavailable">
        {services.length === 0 && (
          <div className="container oa-a-section">
            <EmptyState title={copy.text('pricing.empty')} headingLevel={2} />
          </div>
        )}
        <div className="oa-a-pricelist">
          {services.map((entry, i) => (
            <ServicePricing
              key={entry.service.slug}
              entry={entry}
              lineAnchor={i === 0 || services[i - 1]!.service.categorySlug !== entry.service.categorySlug}
            />
          ))}
        </div>
      </PublicQueryState>

      <AgencySection tone="tint" eyebrow={copy.text('pricing.how.eyebrow')} title={copy.text('pricing.how.title')} layout="split">
        <PointGrid items={copy.pairs('pricing.how.points')} />
      </AgencySection>

      {page.data && <Blocks blocks={page.data.blocks.filter((b) => b.type === 'faq')} />}
      <ClosingCta
        title={copy.text('pricing.cta.title')}
        text={copy.text('pricing.cta.text')}
        secondary={{ label: copy.text('pricing.hero.secondaryCta'), to: '/get-a-quote' }}
      />
    </div>
  );
}
