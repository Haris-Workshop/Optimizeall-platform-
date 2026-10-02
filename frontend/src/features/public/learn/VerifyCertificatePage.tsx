import clsx from 'clsx';
import { BadgeCheck, CheckCircle2, Download, FileCheck2, Share2, ShieldCheck, XCircle } from 'lucide-react';
import { useId } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LogoMark } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import { DateTime } from '@/components/ui/DateTime';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCertificateVerification } from '@/features/learning/api';
import { WorkWithUsCard } from '@/features/learning/components/WorkWithUsCard';
import { BadgeImage } from '@/features/learning/components/CourseCard';
import { LearnSlot } from '@/features/learning/components/LearnSlot';
import '@/features/learning/learning.css';
import { useDocumentHead } from '../site/head';
import '../site/academy-pages.css';

/**
 * Public certificate verification (/verify/certificates/:id). In production the web server serves the API's
 * server-rendered page at this address (Open Graph tags for LinkedIn and crawlers); this SPA page renders the same
 * verification for in-app navigation and local development.
 *
 * Laid out like an official record: a status banner (valid / revoked), the certificate itself on paper (light in both
 * themes) and the verification record beside it (issuer, dates, credential ID, the documents to download).
 */
export function VerifyCertificatePage() {
  const { id = '' } = useParams();
  const q = useCertificateVerification(id);
  const v = q.data;
  const recordId = useId();
  useDocumentHead(
    v
      ? { title: v.seo.title, description: v.seo.description, canonical: v.seo.canonicalPath, noIndex: v.seo.noIndex, jsonLd: v.jsonLd }
      : { title: 'Certificate verification', noIndex: true },
  );
  return (
    <div className="ax ax-verify container">
      {q.isPending && (
        <div aria-busy="true">
          <span className="visually-hidden" role="status">
            Checking the certificate…
          </span>
          <Skeleton height={420} radius="var(--radius-2xl)" />
        </div>
      )}
      {q.isError && (
        <Card flat>
          <ErrorState error={q.error} headingLevel={1} title="We couldn’t find this certificate" action={<Link to="/learn">Explore free courses</Link>} />
        </Card>
      )}
      {v && (
        <>
          <p className={clsx('ax-verify__status', v.isValid ? 'ax-verify__status--ok' : 'ax-verify__status--bad')} role="status" data-testid="verify-status">
            {v.isValid ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
            {v.isValid ? 'Valid certificate' : 'Revoked — this certificate is no longer valid'}
            <span className="ax-verify__status-note">Checked live against the Optimize All Academy records</span>
          </p>
          <div className="ax-verify__grid">
            <article className={clsx('ax-sheet', !v.isValid && 'is-revoked')} aria-labelledby="verify-title">
              <svg className="ax-sheet__frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <rect x="0.5" y="0.5" width="99" height="99" rx="1.5" fill="none" stroke="currentColor" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="ax-sheet__head">
                <span className="ax-sheet__issuer">
                  <LogoMark size={32} title="" /> {v.issuerName}
                </span>
                <BadgeImage src={v.links.badgeImageUrl} alt={`${v.badgeName} badge`} size={96} />
              </div>
              <p className="ax-sheet__kicker">Certificate of achievement</p>
              <h1 id="verify-title" className="ax-sheet__name">
                {v.holderName}
              </h1>
              <p className="ax-sheet__lead">
                earned the <strong>{v.badgeName}</strong> credential for completing <Link to={`/learn/${v.courseSlug}`}>{v.courseTitle}</Link> and passing its
                final assessment.
              </p>
              <div className="ax-sheet__foot">
                <div className="ax-sheet__sign">
                  <svg viewBox="0 0 160 40" aria-hidden="true" focusable="false">
                    <path d="M4 30c12-18 22-20 25-10s-8 15 3 8 18-21 26-13-5 15 8 10 20-15 29-10 10 8 23 3 18-8 31-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <hr />
                  <span>
                    <strong>{v.issuerName}</strong>
                  </span>
                  <span>
                    Issued <DateTime value={v.issuedAt} format="date" />
                  </span>
                </div>
              </div>
            </article>

            <aside className="ax-record" aria-labelledby={recordId}>
              <h2 id={recordId} className="ax-record__title">
                <ShieldCheck aria-hidden="true" /> Verification record
              </h2>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{v.isValid ? 'Valid' : 'Revoked'}</dd>
                </div>
                <div>
                  <dt>Issued by</dt>
                  <dd>{v.issuerName}</dd>
                </div>
                <div>
                  <dt>Issue date</dt>
                  <dd>
                    <DateTime value={v.issuedAt} format="date" />
                  </dd>
                </div>
                <div>
                  <dt>Credential ID</dt>
                  <dd>
                    <code>{v.verificationCode}</code>
                  </dd>
                </div>
                {v.revokedAt && (
                  <div>
                    <dt>Revoked on</dt>
                    <dd>
                      <DateTime value={v.revokedAt} format="date" />
                    </dd>
                  </div>
                )}
              </dl>
              {v.isValid && (
                <div className="ax-record__actions">
                  <a className="ui-button ui-button--primary ui-button--md" href={v.links.pdfUrl} download>
                    <Download aria-hidden="true" /> Download certificate (PDF)
                  </a>
                  <a className="ui-button ui-button--secondary ui-button--md" href={v.links.linkedInShareUrl} target="_blank" rel="noopener noreferrer">
                    <Share2 aria-hidden="true" /> Share on LinkedIn<span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                  <a className="ui-button ui-button--ghost ui-button--md" href={v.links.openBadgeAssertionUrl} target="_blank" rel="noopener noreferrer">
                    <BadgeCheck aria-hidden="true" /> Open Badge (JSON)<span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                </div>
              )}
            </aside>
          </div>

          {(v.skills.length > 0 || v.badgeDescription) && (
            <div className="ax-verify__more">
              {v.badgeDescription && (
                <section aria-labelledby="verify-demonstrated">
                  <h2 id="verify-demonstrated">What the holder demonstrated</h2>
                  <p>{v.badgeDescription}</p>
                </section>
              )}
              {v.skills.length > 0 && (
                <section aria-labelledby="verify-skills">
                  <h2 id="verify-skills">Skills</h2>
                  <ul className="ax-chips ax-chips--plain">
                    {v.skills.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          <p className="ax-verify__how">
            <FileCheck2 aria-hidden="true" className="lx-inline-icon" /> <strong>How verification works.</strong> This page is generated from the
            Academy’s records each time it is opened, so it always shows the certificate’s current status. Anyone can check a credential ID on{' '}
            <Link to="/verify">the certificate verification page</Link>.
          </p>
          {/* Partner slot (public verification page). */}
          <LearnSlot slot="learn.certificate" keywords={[...v.skills, v.courseTitle]} categories={[]} />
          <WorkWithUsCard />
        </>
      )}
    </div>
  );
}
