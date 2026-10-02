import clsx from 'clsx';
import { ArrowLeft, CalendarDays, Clock3, Link2, Rss, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Input, Pagination, Skeleton } from '@/components/ui';
import { siteDate } from '@/features/public/site/format';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { isExternalHref } from '@/lib/safeHref';
import { useHydrated } from '@/lib/ssr';
import { type PostCard, type PublicPost, useBlog, usePost, useSite } from '../site/api';
import { useSiteCopy } from '../site/copy';
import { PublicQueryState } from '../site/components';
import { absoluteUrl, headFromSeo, useDocumentHead } from '../site/head';
import { extractHeadings, Markdown } from '../site/Markdown';
import { useReveal } from '../site/motion';
import { NewsletterSignup } from '../site/NewsletterSignup';
import { PartnerSlot } from '../partners/PartnerSlot';
import { CoCta, CoHero, CoSection, CoverArt, Monogram, ReadingProgress, scrollToAnchor, useActiveHeading } from './companyKit';

/**
 * The blog: an editorial index (lead story, topic filters, search, tags) and the article page (reading progress, table
 * of contents that follows the reader, author and date, share links, related articles). Posts without a cover image get
 * a generated cover. Words come from the editable page copy (`blog.*`); the server-rendered HTML follows the same
 * headings (backend SeoPageResolver.BlogAsync / PostAsync).
 */

/** A post in a list: cover (or generated cover), topic, date, title, excerpt and reading time. */
export function PostTile({ post, headingLevel = 2, lead = false, label }: { post: PostCard; headingLevel?: 2 | 3; lead?: boolean; label?: string }) {
  const H = `h${headingLevel}` as 'h2';
  const category = post.categories[0]?.name;
  return (
    <article className={clsx('oa-co-tile', lead && 'oa-co-tile--lead')}>
      <div className="oa-co-tile__media">
        {post.coverImageUrl ? (
          <img
            src={post.coverImageUrl}
            alt={post.coverImageAlt ?? ''}
            loading={lead ? 'eager' : 'lazy'}
            decoding="async"
            width={lead ? 1200 : 640}
            height={lead ? 675 : 400}
          />
        ) : (
          <CoverArt seed={post.slug} label={category ?? post.title} />
        )}
      </div>
      <div className="oa-co-tile__body">
        {label && <span className="oa-co-tile__label">{label}</span>}
        <p className="oa-co-kicker">
          {category && <span className="oa-co-kicker__cat">{category}</span>}
          {category && post.publishedAt && <span className="oa-co-kicker__sep" aria-hidden="true" />}
          {post.publishedAt && <time dateTime={post.publishedAt}>{siteDate(post.publishedAt)}</time>}
        </p>
        <H className="oa-co-tile__title">
          <Link to={`/blog/${post.slug}`} className="oa-co-stretch">
            {post.title}
          </Link>
        </H>
        <p className="oa-co-tile__excerpt">{post.excerpt}</p>
        <p className="oa-co-tile__by">
          {post.authorName && <span>{post.authorName}</span>}
          {post.authorName && <span className="oa-co-kicker__sep" aria-hidden="true" />}
          <span>{post.readingMinutes} min read</span>
        </p>
      </div>
    </article>
  );
}

/** /blog — the archive, each topic (`?category=`), tags, search and pagination, all kept in the URL. */
export function BlogPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const category = params.get('category') ?? undefined;
  const tag = params.get('tag') ?? undefined;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebouncedValue(search, 300);
  const { data, isLoading, error } = useBlog({ page, category, tag, search: debounced || undefined });
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  useReveal(root);
  // Same rules as the server-rendered page (SeoPageResolver.BlogAsync): each archive page and each category is its own
  // canonical URL; tag filters and searches are noindex (links still followed) and point at /blog.
  const categoryInfo = category ? data?.categories.find((c) => c.slug === category) : undefined;
  const paged = page > 1 ? `page=${page}` : '';
  useDocumentHead(
    tag || debounced
      ? { title: copy.text('blog.seo.title'), description: copy.text('blog.seo.description'), canonical: '/blog', noIndex: true, follow: true }
      : categoryInfo
        ? {
            title: `${categoryInfo.name} articles`,
            description: categoryInfo.description || copy.text('blog.seo.description'),
            canonical: `/blog?category=${encodeURIComponent(categoryInfo.slug)}${paged ? `&${paged}` : ''}`,
          }
        : {
            title: page > 1 ? `${copy.text('blog.seo.title')} — page ${page}` : copy.text('blog.seo.title'),
            description: copy.text('blog.seo.description'),
            canonical: paged ? `/blog?${paged}` : '/blog',
          },
  );

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  const items = data?.items ?? [];
  // The newest article leads the unfiltered first page; filtered views and later pages are a plain grid.
  const withLead = page === 1 && !category && !tag && !debounced && items.length >= 4;
  const [leadPost, rest] = withLead ? [items[0], items.slice(1)] : [undefined, items];

  return (
    <div ref={root} className="oa-co-page">
      <CoHero
        eyebrow={categoryInfo ? copy.text('blog.topic.eyebrow') : copy.text('blog.hero.eyebrow')}
        title={categoryInfo ? `${categoryInfo.name} articles` : copy.text('blog.hero.title')}
        lead={categoryInfo ? categoryInfo.description || copy.text('blog.hero.lead') : copy.text('blog.hero.lead')}
        breadcrumbs={
          categoryInfo
            ? [{ label: 'Home', to: '/' }, { label: 'Blog', to: '/blog' }, { label: `${categoryInfo.name} articles` }]
            : [{ label: 'Home', to: '/' }, { label: 'Blog' }]
        }
        meta={
          <a className="oa-co-arrowlink oa-co-rss" href="/api/v1/public/blog/rss.xml">
            <Rss aria-hidden="true" /> RSS feed
          </a>
        }
      />
      <div className="container">
        <div className="oa-co-blogbar">
          {data && data.categories.length > 0 ? (
            <nav aria-label="Blog categories">
              <ul className="oa-co-topics">
                <li>
                  <button type="button" className="oa-co-topic" aria-pressed={!category} onClick={() => update({ category: undefined })}>
                    {copy.text('blog.topics.all')}
                  </button>
                </li>
                {data.categories.map((c) => (
                  <li key={c.slug}>
                    <button type="button" className="oa-co-topic" aria-pressed={category === c.slug} onClick={() => update({ category: c.slug })}>
                      {c.name} <span className="oa-co-topic__count">{c.postCount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <span />
          )}
          <form role="search" aria-label="Search the blog" className="oa-co-search" onSubmit={(e) => e.preventDefault()}>
            <label className="visually-hidden" htmlFor="blog-search">
              {copy.text('blog.search.label')}
            </label>
            <Search aria-hidden="true" />
            <Input
              id="blog-search"
              type="search"
              placeholder={copy.text('blog.search.label')}
              value={search}
              aria-controls={resultsId}
              onChange={(e) => {
                setSearch(e.target.value);
                update({ q: e.target.value || undefined });
              }}
            />
          </form>
        </div>
        {tag && (
          <p className="oa-co-filter">
            <span>
              Showing posts tagged <strong>#{tag}</strong>.
            </span>
            <button type="button" onClick={() => update({ tag: undefined })}>
              <X aria-hidden="true" /> Clear tag
            </button>
          </p>
        )}
      </div>
      <PublicQueryState error={error} isLoading={false} notFoundTitle="Blog unavailable">
        <div className="container oa-co-blogbody" id={resultsId}>
          {isLoading && !data ? (
            <ul className="oa-co-posts">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i}>
                  <Skeleton height={360} />
                </li>
              ))}
            </ul>
          ) : data && items.length === 0 ? (
            <div className="oa-co-empty">
              <h2>{copy.text('blog.empty.title')}</h2>
              <p>{copy.text('blog.empty.description')}</p>
            </div>
          ) : (
            <>
              {leadPost && <PostTile post={leadPost} lead label={copy.text('blog.latest.label')} />}
              <ul className="oa-co-posts" data-reveal="stagger">
                {rest.map((p) => (
                  <li key={p.slug}>
                    <PostTile post={p} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {/* One slim sponsored bar after the list on the hub and the category pages (not on tag filters or searches). */}
          {data && items.length > 0 && !tag && !debounced && (
            <PartnerSlot slot="blog.index" keywords={categoryInfo ? [categoryInfo.name] : []} categories={category ? [category] : []} />
          )}
          {data && data.total > data.pageSize && (
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={(p) => update({ page: String(p) })}
              label="Blog pages"
            />
          )}
          {data && data.tags.length > 0 && (
            <nav aria-labelledby={`${resultsId}-tags`} className="oa-co-tags">
              <h2 id={`${resultsId}-tags`}>{copy.text('blog.tags.title')}</h2>
              <ul className="oa-co-topics oa-co-topics--wrap">
                {data.tags.map((t) => (
                  <li key={t.tag}>
                    <button type="button" className="oa-co-topic" aria-pressed={tag === t.tag} onClick={() => update({ tag: t.tag })}>
                      #{t.tag}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </PublicQueryState>
      <CoSection tone="muted" layout="split" title={copy.text('blog.newsletter.title')} intro={copy.text('blog.newsletter.text')}>
        <div className="oa-co-newsletter">
          <NewsletterSignup source="blog" />
        </div>
      </CoSection>
    </div>
  );
}

function Byline({ post }: { post: PublicPost }) {
  const a = post.author;
  return (
    <span className="oa-co-metaline">
      {a && (
        <span className="oa-co-byline">
          {a.photoUrl ? <img src={a.photoUrl} alt="" width={40} height={40} /> : <Monogram name={a.name} />}
          <span>
            <span className="oa-co-byline__name">By {a.name}</span>
            {a.role && <span className="oa-co-byline__role">{a.role}</span>}
          </span>
        </span>
      )}
      {post.publishedAt && (
        <span>
          <CalendarDays aria-hidden="true" />
          <time dateTime={post.publishedAt}>{siteDate(post.publishedAt)}</time>
        </span>
      )}
      <span>
        <Clock3 aria-hidden="true" /> {post.readingMinutes} min read
      </span>
    </span>
  );
}

function ShareLinks({ post, url, className }: { post: PublicPost; url: string; className?: string }) {
  const copy = useSiteCopy();
  const [copied, setCopied] = useState(false);
  const share = [
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(url)}` },
  ];
  // Browser support is known only after hydration (the server renders the list without the button).
  const hydrated = useHydrated();
  const canCopy = hydrated && !!navigator.clipboard && !!url;
  return (
    <div className={clsx('oa-co-share', className)}>
      <p className="oa-co-railtitle">{copy.text('blog.detail.shareTitle')}</p>
      <ul>
        {share.map((s) => (
          <li key={s.label}>
            <a href={s.href} target={s.label === 'Email' ? undefined : '_blank'} rel="noopener noreferrer">
              {s.label}
              {s.label !== 'Email' && <span className="visually-hidden"> (opens in a new tab)</span>}
            </a>
          </li>
        ))}
        {canCopy && (
          <li>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              <span className="oa-co-share__copy">
                <Link2 aria-hidden="true" width={14} height={14} /> {copied ? 'Copied' : 'Copy link'}
              </span>
            </button>
          </li>
        )}
      </ul>
      <span className="visually-hidden" role="status">
        {copied ? 'Link copied to the clipboard' : ''}
      </span>
    </div>
  );
}

/** "On this page": the article's headings; the one being read is marked as the current location. */
function TableOfContents({ headings }: { headings: { id: string; text: string; level: number }[] }) {
  const copy = useSiteCopy();
  const titleId = useId();
  const listId = useId();
  const active = useActiveHeading(headings.map((h) => h.id));
  // Narrow screens (the contents sit above the article): collapsed until opened. Wide screens (a side rail): always
  // open, by CSS — so the server-rendered markup is right at every width and nothing moves when the page hydrates.
  const [open, setOpen] = useState(false);
  const onClick = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    scrollToAnchor(id);
  };
  const title = copy.text('blog.detail.tocTitle');
  return (
    <nav className="oa-co-toc" aria-labelledby={titleId} data-open={open ? '' : undefined}>
      <p id={titleId} className="oa-co-railtitle oa-co-toc__title">
        {title}
      </p>
      <button type="button" className="oa-co-toc__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        <span className="oa-co-railtitle">{title}</span>
      </button>
      <ol id={listId}>
        {headings.map((h) => (
          <li key={h.id} className={h.level > 2 ? 'is-sub' : undefined}>
            <a href={`#${h.id}`} aria-current={active === h.id ? 'location' : undefined} onClick={(e) => onClick(e, h.id)}>
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** /blog/:slug — the article with reading progress, table of contents, share links, author box and related posts. */
export function BlogPostPage() {
  const { slug = '' } = useParams();
  const { data: post, isLoading, error } = usePost(slug);
  const { data: site } = useSite();
  const copy = useSiteCopy();
  const articleRef = useRef<HTMLElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead(post ? headFromSeo(post.seo, post.jsonLd, 'article') : { title: 'Blog' });
  const headings = useMemo(() => (post ? extractHeadings(post.bodyMarkdown) : []), [post]);
  const url = post ? absoluteUrl(`/blog/${post.slug}`, site?.seo.siteUrl) ?? '' : '';
  // A deep link to a heading (#section) lands on it once the article has rendered.
  useEffect(() => {
    if (!post || !window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [post]);
  const authorLinks = post?.author?.socialLinks.filter((l) => isExternalHref(l.url)) ?? [];

  return (
    <PublicQueryState error={error} isLoading={isLoading} notFoundTitle="We couldn't find that article">
      {post && (
        <div ref={root} className="oa-co-page">
          <ReadingProgress target={articleRef} />
          <CoHero
            size="compact"
            className="oa-co-hero--article"
            eyebrow={post.categories.map((c) => c.name).join(' · ') || copy.text('blog.hero.eyebrow')}
            title={post.title}
            lead={post.excerpt}
            breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Blog', to: '/blog' }, { label: post.title }]}
            meta={<Byline post={post} />}
          />
          <div className="container oa-co-articlecover">
            {post.coverImageUrl ? (
              <img src={post.coverImageUrl} alt={post.coverImageAlt ?? ''} width={1200} height={514} decoding="async" />
            ) : (
              <CoverArt seed={post.slug} label={post.categories[0]?.name ?? post.title} />
            )}
          </div>
          <div className="container oa-co-article">
            <article ref={articleRef} className="oa-co-article__main" aria-label={post.title}>
              <Markdown
                source={post.bodyMarkdown}
                interlude={<PartnerSlot slot="blog.inline" keywords={post.tags} categories={post.categories.map((c) => c.slug)} />}
              />
              {(post.tags.length > 0 || post.categories.length > 0) && (
                <ul className="oa-co-chips oa-co-article__tags" aria-label="Topics and tags">
                  {post.categories.map((c) => (
                    <li key={c.slug}>
                      <Link className="oa-co-chip" to={`/blog?category=${encodeURIComponent(c.slug)}`}>
                        {c.name}
                      </Link>
                    </li>
                  ))}
                  {post.tags.map((t) => (
                    <li key={t}>
                      <Link className="oa-co-chip" to={`/blog?tag=${encodeURIComponent(t)}`}>
                        #{t}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <ShareLinks post={post} url={url} className="oa-co-share--inline" />
              <PartnerSlot slot="blog.end" keywords={post.tags} categories={post.categories.map((c) => c.slug)} />
              {post.author && (
                <aside className="oa-co-author" aria-label="About the author">
                  {post.author.photoUrl ? (
                    <img src={post.author.photoUrl} alt="" width={64} height={64} loading="lazy" />
                  ) : (
                    <Monogram name={post.author.name} />
                  )}
                  <div>
                    <p className="oa-co-author__label">{copy.text('blog.detail.authorLabel')}</p>
                    <p className="oa-co-author__name">{post.author.name}</p>
                    {post.author.role && <p className="oa-co-author__role">{post.author.role}</p>}
                    {post.author.bio && <p className="oa-co-author__bio">{post.author.bio}</p>}
                    {authorLinks.length > 0 && (
                      <ul className="oa-co-member__links">
                        {authorLinks.map((l) => (
                          <li key={l.url}>
                            <a href={l.url} target="_blank" rel="noopener noreferrer">
                              {l.label}
                              <span className="visually-hidden"> (opens in a new tab)</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </aside>
              )}
              <p className="oa-co-article__back">
                <Link to="/blog" className="oa-co-arrowlink">
                  <ArrowLeft aria-hidden="true" /> {copy.text('blog.detail.backLink')}
                </Link>
              </p>
            </article>
            {(headings.length > 1 || url) && (
              <aside className="oa-co-article__rail" aria-label="Article tools">
                {headings.length > 1 && <TableOfContents headings={headings} />}
                <ShareLinks post={post} url={url} />
              </aside>
            )}
          </div>
          {post.related.length > 0 && (
            <CoSection tone="muted" eyebrow={copy.text('blog.hero.eyebrow')} title={copy.text('blog.detail.relatedTitle')}>
              <ul className="oa-co-posts" data-reveal="stagger">
                {post.related.map((r) => (
                  <li key={r.slug}>
                    <PostTile post={r} headingLevel={3} />
                  </li>
                ))}
              </ul>
            </CoSection>
          )}
          <CoCta
            title={copy.text('shared.cta.title')}
            text={copy.text('shared.cta.text')}
            primary={{ to: '/free-audit', label: copy.text('shared.cta.primary') }}
            secondary={{ to: '/book-a-consultation', label: copy.text('shared.cta.secondary') }}
          />
        </div>
      )}
    </PublicQueryState>
  );
}
