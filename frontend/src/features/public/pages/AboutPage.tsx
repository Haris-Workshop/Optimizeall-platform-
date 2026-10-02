import { ArrowRight } from 'lucide-react';
import { useRef, type CSSProperties } from 'react';
import { LogoMark } from '@/components/brand/Logo';
import { ButtonLink } from '@/components/ui';
import { NotFound } from '@/features/public/NotFound';
import { isApiError } from '@/lib/api/errors';
import { isInternalHref } from '@/lib/safeHref';
import { type PageBlock, type PublicPage, type SiteLink, usePage } from '../site/api';
import { Blocks, type BlockContext } from '../site/Blocks';
import { PublicQueryState } from '../site/components';
import { headFromSeo, useDocumentHead } from '../site/head';
import { SiteIcon } from '../site/icons';
import { Markdown } from '../site/Markdown';
import { useInViewClass, useReveal } from '../site/motion';
import { TrustGrid } from '../site/Showcase';
import { CoCta, CoHero, CoSection } from './companyKit';

/**
 * /about, built on the "about" CMS page: every word is one of the page's blocks (which the server also renders for
 * search engines, in the same order — backend SeoPageResolver.CmsPageAsync). The hero, story (rich text), values
 * (features grid) and closing call to action get the editorial layout of the company pages; any other block type an
 * editor adds (services, testimonials, FAQ, video…) renders through the shared block renderer. The trust grid sits just
 * before the closing call to action.
 */

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const cta = (v: unknown): SiteLink | null => {
  const l = v as SiteLink | null | undefined;
  return l && text(l.label) && text(l.url) && isInternalHref(l.url) ? l : null;
};
interface Feature {
  title: string;
  text: string;
  icon: string | null;
}
const features = (v: unknown): Feature[] => (Array.isArray(v) ? (v as Feature[]).filter((f) => f && text(f.title)) : []);

/** The hero art: the brand mark at the centre of the company's values (from the page's first features grid). */
function Constellation({ labels }: { labels: string[] }) {
  const ref = useInViewClass<HTMLDivElement>();
  const nodes = labels.slice(0, 4);
  const positions = [
    { x: 50, y: 9 },
    { x: 90, y: 50 },
    { x: 50, y: 91 },
    { x: 10, y: 50 },
  ];
  return (
    <div ref={ref} className="oa-co-constellation" aria-hidden="true">
      <svg viewBox="0 0 400 400" focusable="false">
        <defs>
          <radialGradient id="oa-co-const-core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fcb31e" stopOpacity="0.2" />
            <stop offset="0.6" stopColor="#4855a3" stopOpacity="0.1" />
            <stop offset="1" stopColor="#4855a3" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="198" fill="url(#oa-co-const-core)" />
        <circle className="oa-co-constellation__ring oa-co-constellation__ring--dash" cx="200" cy="200" r="190" />
        <circle className="oa-co-constellation__ring" cx="200" cy="200" r="164" />
        <circle className="oa-co-constellation__ring" cx="200" cy="200" r="100" />
        {nodes.map((_, i) => (
          <line key={i} className="oa-co-constellation__link" x1="200" y1="200" x2={positions[i].x * 4} y2={positions[i].y * 4} />
        ))}
        <g className="oa-co-constellation__spin">
          <path className="oa-co-constellation__arc" d="M 200 36 A 164 164 0 0 1 364 200" />
          <circle cx="364" cy="200" r="4" fill="#fcb31e" />
        </g>
      </svg>
      <div className="oa-co-constellation__core">
        <LogoMark size={56} title="" />
      </div>
      <ul className="oa-co-constellation__nodes">
        {nodes.map((label, i) => (
          <li key={label} style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%`, '--i': i } as CSSProperties}>
            <span className="oa-co-constellation__chip">
              <i />
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoryBlock({ block }: { block: PageBlock }) {
  return (
    <section className="oa-co-section oa-co-story-section">
      <div className="container oa-co-story">
        <div className="oa-co-story__label" aria-hidden="true">
          <span className="oa-co-story__mark" />
        </div>
        <div data-reveal="">
          <Markdown source={text(block.data.markdown)} />
        </div>
      </div>
    </section>
  );
}

function FeaturesBlock({ block }: { block: PageBlock }) {
  const items = features(block.data.items);
  const title = text(block.data.title) ?? 'Highlights';
  return (
    <CoSection title={title} intro={text(block.data.intro) ?? undefined} tone="muted">
      <ul className={`oa-co-features oa-co-features--${items.length % 3 === 0 ? 3 : items.length >= 4 ? 4 : 2}`} data-reveal="stagger">
        {items.map((item, i) => (
          <li key={item.title}>
            <div className="oa-co-feature">
              <div className="oa-co-feature__top">
                <span className="oa-co-feature__icon" aria-hidden="true">
                  <SiteIcon name={item.icon} />
                </span>
                <span className="oa-co-feature__index" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="oa-co-feature__title">{item.title}</h3>
              {text(item.text) && <p className="oa-co-feature__text">{item.text}</p>}
            </div>
          </li>
        ))}
      </ul>
    </CoSection>
  );
}

function CtaBlock({ block }: { block: PageBlock }) {
  const d = block.data;
  const primary = cta(d.primary);
  const secondary = cta(d.secondary);
  return (
    <CoCta
      title={text(d.title) ?? 'Get in touch'}
      text={text(d.text)}
      primary={primary ? { to: primary.url, label: primary.label } : null}
      secondary={secondary ? { to: secondary.url, label: secondary.label } : null}
    />
  );
}

function AboutBody({ page }: { page: PublicPage }) {
  const hero = page.blocks[0]?.type === 'hero' ? page.blocks[0] : undefined;
  const rest = hero ? page.blocks.slice(1) : page.blocks;
  const closing = rest.length > 0 && rest[rest.length - 1].type === 'cta' ? rest[rest.length - 1] : undefined;
  const body = closing ? rest.slice(0, -1) : rest;
  const d = hero?.data ?? {};
  const primary = cta(d.primaryCta);
  const secondary = cta(d.secondaryCta);
  const values = features(page.blocks.find((b) => b.type === 'featuresGrid')?.data.items).map((f) => f.title);
  const context: BlockContext = {
    testimonials: page.testimonials,
    caseStudies: page.caseStudies,
    serviceCategories: page.serviceCategories,
    trustLogos: page.trustLogos,
    pageTitle: page.title,
  };
  return (
    <>
      <CoHero
        eyebrow={text(d.eyebrow) ?? undefined}
        title={text(d.title) ?? page.title}
        lead={text(d.subtitle) ?? page.summary ?? undefined}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: page.title }]}
        actions={
          primary || secondary ? (
            <>
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
            </>
          ) : undefined
        }
        aside={values.length >= 2 ? <Constellation labels={values} /> : undefined}
      />
      {body.map((block) => {
        switch (block.type) {
          case 'richText':
            return <StoryBlock key={block.id} block={block} />;
          case 'featuresGrid':
            return <FeaturesBlock key={block.id} block={block} />;
          case 'cta':
            return <CtaBlock key={block.id} block={block} />;
          default:
            return (
              <div key={block.id} className="oa-co-cmsblock">
                <Blocks blocks={[block]} context={context} />
              </div>
            );
        }
      })}
      <div className="oa-co-cmsblock">
        <TrustGrid />
      </div>
      {closing && <CtaBlock block={closing} />}
    </>
  );
}

/** /about: the company page. */
export function AboutPage() {
  const { data: page, isLoading, error } = usePage('about');
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead(page ? headFromSeo(page.seo, page.jsonLd) : { title: null });

  if (isApiError(error) && error.status === 404) return <NotFound siteLinks />;
  return (
    <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="Page not found">
      {page && (
        <div ref={root} className="oa-co-page oa-page">
          <AboutBody page={page} />
        </div>
      )}
    </PublicQueryState>
  );
}
