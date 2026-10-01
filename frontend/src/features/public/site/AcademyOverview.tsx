import { useRef } from 'react';
import { useOptionalPage } from './api';
import { useAcademyOverview } from './academy';
import { Blocks } from './Blocks';
import { Section } from './components';
import { useSiteCopy } from './copy';
import { useReveal } from './motion';
import { AcademyStats, Timeline } from './Showcase';

/**
 * What used to be the /academy overview page, for the bottom of the /learn hub (which is now the academy's one front
 * page): the live figures (courses, lessons, subjects, price) from the public learning API, "from first lesson to
 * certificate" and the blocks of the `academy` CMS page after its hero (features, FAQ, closing call to action). The
 * hub already has its own subjects, paths, certificates and catalog, and its own h1, so none of those repeat here.
 * Renders nothing for a CMS page that doesn't exist.
 */
export function AcademyHubExtras() {
  const { data: page } = useOptionalPage('academy');
  const academy = useAcademyOverview();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const blocks = page ? (page.blocks[0]?.type === 'hero' ? page.blocks.slice(1) : page.blocks) : [];
  return (
    <div ref={root} className="oa-page">
      <section className="site-section oa-academy-live" aria-label="The academy in numbers">
        <div className="container">
          <AcademyStats data={academy.data} isLoading={academy.isLoading} />
        </div>
      </section>
      <Section eyebrow={copy.text('home.learnSteps.eyebrow')} title={copy.text('home.learnSteps.title')} tone="muted">
        <Timeline steps={copy.pairs('home.learnSteps.steps')} />
      </Section>
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
