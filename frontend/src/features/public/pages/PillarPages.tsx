import { ArrowRight } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { ButtonLink } from '@/components/ui';
import { NotFound } from '@/features/public/NotFound';
import { isApiError } from '@/lib/api/errors';
import { isInternalHref } from '@/lib/safeHref';
import { type PageBlock, type PublicPage, type SiteLink, usePage } from '../site/api';
import { AgencyVisual } from '../site/art';
import { Blocks } from '../site/Blocks';
import { PublicQueryState } from '../site/components';
import { headFromSeo, useDocumentHead } from '../site/head';
import { useReveal } from '../site/motion';
import { TrustGrid } from '../site/Showcase';

/**
 * /about, built on a CMS page: its words (hero, features, FAQ, call to action) are the page's blocks, which the server
 * also renders for search engines. (The old /academy overview now redirects to /learn; its content lives in
 * site/AcademyOverview.tsx at the bottom of the hub.)
 */

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const cta = (v: unknown): SiteLink | null => {
  const l = v as SiteLink | null | undefined;
  return l && text(l.label) && text(l.url) && isInternalHref(l.url) ? l : null;
};

/** The CMS hero block with an illustration in place of an image. */
function PillarHero({ block, fallbackTitle, aside }: { block: PageBlock | undefined; fallbackTitle: string; aside: ReactNode }) {
  const d = block?.data ?? {};
  const primary = cta(d.primaryCta);
  const secondary = cta(d.secondaryCta);
  return (
    <header className="site-hero site-hero--block site-home-hero oa-hero">
      <div className="container site-hero__inner oa-hero__inner">
        <div className="site-hero__copy">
          {text(d.eyebrow) && <p className="site-hero__eyebrow">{text(d.eyebrow)}</p>}
          <h1 className="site-hero__title">{text(d.title) ?? fallbackTitle}</h1>
          {text(d.subtitle) && <p className="site-hero__lead">{text(d.subtitle)}</p>}
          {(primary || secondary) && (
            <div className="site-hero__actions">
              {primary && (
                <ButtonLink to={primary.url} variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                  {primary.label}
                </ButtonLink>
              )}
              {secondary && (
                <ButtonLink to={secondary.url} variant="secondary" size="lg">
                  {secondary.label}
                </ButtonLink>
              )}
            </div>
          )}
        </div>
        <div className="site-hero__aside oa-hero__aside">{aside}</div>
      </div>
    </header>
  );
}

/** The page's blocks after its hero; `beforeCta` renders just ahead of a closing call-to-action block. */
function RestBlocks({ page, beforeCta }: { page: PublicPage; beforeCta?: ReactNode }) {
  const blocks = page.blocks[0]?.type === 'hero' ? page.blocks.slice(1) : page.blocks;
  const closing = blocks.length > 0 && blocks[blocks.length - 1].type === 'cta' ? blocks.slice(-1) : [];
  const context = {
    testimonials: page.testimonials,
    caseStudies: page.caseStudies,
    serviceCategories: page.serviceCategories,
    trustLogos: page.trustLogos,
    pageTitle: page.title,
  };
  return (
    <>
      <Blocks blocks={closing.length ? blocks.slice(0, -1) : blocks} context={context} />
      {beforeCta}
      <Blocks blocks={closing} context={context} />
    </>
  );
}

/** /about: the company page — the CMS page with the agency illustration, the trust grid before its closing call to action. */
export function AboutPage() {
  const { data: page, isLoading, error } = usePage('about');
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead(page ? headFromSeo(page.seo, page.jsonLd) : { title: null });

  if (isApiError(error) && error.status === 404) return <NotFound siteLinks />;
  return (
    <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="Page not found">
      {page && (
        <div ref={root} className="oa-page">
          <PillarHero block={page.blocks[0]?.type === 'hero' ? page.blocks[0] : undefined} fallbackTitle={page.title} aside={<AgencyVisual />} />
          <RestBlocks page={page} beforeCta={<TrustGrid />} />
        </div>
      )}
    </PublicQueryState>
  );
}
