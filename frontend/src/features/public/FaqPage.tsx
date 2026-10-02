import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageCircleQuestion } from 'lucide-react';
import { useId } from 'react';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api/client';
import { normalizeFaqs } from './faqs';
import { PageHero } from './site/components';
import { useSiteCopy } from './site/copy';
import { useDocumentHead } from './site/head';
import './FaqPage.css';

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </>
  );
}

/** The help box beside (desktop) or under (phones) the questions: one way to reach a person. */
function HelpBox() {
  const copy = useSiteCopy();
  const id = useId();
  return (
    <section className="faq-help" aria-labelledby={id}>
      <h2 id={id} className="faq-help__title">
        {copy.text('faq.help.title')}
      </h2>
      <p className="faq-help__text">{copy.text('faq.help.text')}</p>
      <ButtonLink to="/login?audience=creator" variant="secondary" size="sm" trailingIcon={<ArrowRight />}>
        {copy.text('faq.help.cta')}
      </ButtonLink>
    </section>
  );
}

/**
 * Public creator FAQ (/creators/faq), grouped by category, from the content API: the page hero, then the questions
 * beside a sticky topics list and help box (stacked on phones).
 */
export function FaqPage() {
  const copy = useSiteCopy();
  const topicsId = useId();
  useDocumentHead({ title: copy.text('faq.seo.title'), description: copy.text('faq.seo.description') });

  const query = useQuery({
    queryKey: ['content', 'faqs'],
    queryFn: async () => normalizeFaqs(await api.get<unknown>('/content/faqs')),
    staleTime: 5 * 60_000,
  });

  const unavailable = query.isError || (query.isSuccess && query.data.length === 0);
  const groups = query.isSuccess ? query.data : [];

  return (
    <div className="faq-page">
      <PageHero
        breadcrumbs={[{ label: 'FAQ' }]}
        eyebrow={copy.text('faq.hero.eyebrow')}
        title={copy.text('faq.hero.title')}
        lead={copy.text('faq.hero.lead')}
      />

      <div className="container faq-page__body">
        {query.isPending && (
          <div className="faq-page__loading" aria-busy="true" aria-label="Loading questions">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} height={64} radius={12} />
            ))}
          </div>
        )}

        {unavailable && (
          <EmptyState
            icon={<MessageCircleQuestion />}
            title={copy.text('faq.empty.title')}
            description={copy.text('faq.empty.description')}
            action={
              <>
                <ButtonLink to="/creators#how-it-works">How it works</ButtonLink>
                <ButtonLink to="/creators#rules" variant="secondary">
                  Rules & trust
                </ButtonLink>
              </>
            }
          />
        )}

        {groups.length > 0 && (
          <div className="faq-page__layout">
            <div className="faq-page__aside">
              {groups.length > 1 && (
                <nav className="faq-topics" aria-labelledby={topicsId}>
                  <h2 id={topicsId} className="faq-topics__title">
                    {copy.text('faq.nav.label')}
                  </h2>
                  <ul>
                    {groups.map((group) => (
                      <li key={group.category}>
                        <a href={`#faq-${slug(group.category)}`}>
                          {group.category}
                          <span className="faq-topics__count tabular">{group.items.length}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <HelpBox />
            </div>
            <div className="faq-page__groups">
              {groups.map((group) => (
                <section key={group.category} className="faq-group" aria-labelledby={`faq-${slug(group.category)}`}>
                  <h2 id={`faq-${slug(group.category)}`} className="faq-group__title">
                    {group.category}
                  </h2>
                  <div className="faq-group__items">
                    {group.items.map((item) => (
                      <details key={item.id} className="faq-item">
                        <summary>
                          <span>{item.question}</span>
                        </summary>
                        <div className="faq-item__answer">
                          <Paragraphs text={item.answer} />
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
