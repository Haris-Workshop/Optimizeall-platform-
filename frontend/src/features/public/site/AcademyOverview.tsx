import { useId } from 'react';
import { useOptionalPage } from './api';
import { Blocks } from './Blocks';
import { useSiteCopy } from './copy';

/**
 * The bottom of the /learn hub (the academy's one front page; the old /academy overview redirects here): "from first
 * lesson to certificate" as four editorial steps, then the blocks of the `academy` CMS page after its hero (features,
 * FAQ, closing call to action). The hub already has its own live figures, subjects, paths, certificates and catalogue,
 * and its own h1, so none of those repeat here. The CMS part renders nothing for a page that doesn't exist.
 * Reveal-on-scroll comes from the hub's root (AcademyPages.tsx).
 */
export function AcademyHubExtras() {
  const { data: page } = useOptionalPage('academy');
  const copy = useSiteCopy();
  const headingId = useId();
  const blocks = page ? (page.blocks[0]?.type === 'hero' ? page.blocks.slice(1) : page.blocks) : [];
  return (
    <div className="oa-page">
      <section className="ax-section ax-section--tint ax-steps-section" aria-labelledby={headingId}>
        <div className="container">
          <div className="ax-head" data-reveal="">
            <div className="ax-head__text">
              <p className="ax-eyebrow">{copy.text('home.learnSteps.eyebrow')}</p>
              <h2 id={headingId} className="ax-title">
                {copy.text('home.learnSteps.title')}
              </h2>
            </div>
          </div>
          <ol className="ax-steps" data-reveal="stagger">
            {copy.pairs('home.learnSteps.steps').map((step, i) => (
              <li key={step.title} className="ax-steps__item">
                <span className="ax-steps__num tabular" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="ax-steps__title">{step.title}</h3>
                <p className="ax-steps__text">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      {page && blocks.length > 0 && (
        <Blocks
          blocks={blocks}
          context={{
            testimonials: page.testimonials,
            caseStudies: page.caseStudies,
            serviceCategories: page.serviceCategories,
            trustLogos: page.trustLogos,
            pageTitle: page.title,
          }}
        />
      )}
    </div>
  );
}
