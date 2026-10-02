import { ArrowRight, ArrowUpRight, Compass } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { useSiteCopy } from './site/copy';
import { MovedOrNotFound } from './site/redirects';
import { StatusPage } from './StatusPage';

/**
 * Where visitors of a missing website page most likely wanted to go. The server-rendered 404 (backend
 * SeoPageResolver.NotFound) lists the same destinations; home and "Book a consultation" are the buttons above.
 */
const HELPFUL_LINKS = [
  { to: '/services', label: 'Services' },
  { to: '/case-studies', label: 'Case studies' },
  { to: '/industries', label: 'Industries' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/blog', label: 'Insights' },
  { to: '/contact', label: 'Contact us' },
  { to: '/learn', label: 'Free Academy' },
  { to: '/search', label: 'Search the site' },
];

/**
 * The 404 page. A public address that has moved (Website → Redirects) navigates to its new address instead.
 * `siteLinks` adds the website's most useful destinations (public website only, not the portals).
 */
export function NotFound({ siteLinks = false }: { siteLinks?: boolean }) {
  return (
    <MovedOrNotFound>
      <NotFoundPage siteLinks={siteLinks} />
    </MovedOrNotFound>
  );
}

function NotFoundPage({ siteLinks }: { siteLinks: boolean }) {
  const copy = useSiteCopy();
  const linksId = useId();
  return (
    <StatusPage
      code="404"
      icon={<Compass />}
      title={copy.text('shared.page404.title')}
      description={copy.text('shared.page404.description')}
      actions={
        siteLinks ? (
          <>
            <ButtonLink to="/" trailingIcon={<ArrowRight />}>
              Back to the home page
            </ButtonLink>
            <ButtonLink to="/book-a-consultation" variant="secondary">
              Book a consultation
            </ButtonLink>
          </>
        ) : (
          <>
            <ButtonLink to="/">Back to the home page</ButtonLink>
            <ButtonLink to="/creators/faq" variant="secondary">
              Read the FAQ
            </ButtonLink>
          </>
        )
      }
      footer={
        siteLinks && (
          <nav aria-labelledby={linksId} className="status-page__links">
            <h2 id={linksId} className="status-page__links-title">
              {copy.text('shared.page404.linksTitle')}
            </h2>
            <ul>
              {HELPFUL_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to}>
                    {l.label}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )
      }
    />
  );
}
