import { ArrowRight, CalendarRange, Hash, LinkIcon, Megaphone, ShieldCheck, Upload, Wallet } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink, DateTime, Money, Skeleton, SkeletonText } from '@/components/ui';
import { PlatformIcon, platformLabel } from '@/features/participant/components/Platform';
import { StatusPage } from '../StatusPage';
import { useSiteCopy } from '../site/copy';
import { useReveal } from '../site/motion';
import type { LandingCategory, RewardTeaser } from './landingApi';
import '../site/marketing.css';
import '../LandingPage.css';
import './LandingView.css';

export interface LandingViewProps {
  eyebrow: string;
  headline: string;
  body: string;
  heroImageUrl?: string | null;
  cta: { to: string; label: string };
  secondaryCta?: { to: string; label: string };
  reward?: RewardTeaser | null;
  platforms?: string[];
  startsAt?: string;
  endsAt?: string;
  submissionDeadline?: string;
  category?: LandingCategory | null;
  /** Campaign-specific disclosure text participants must include. */
  disclosure?: string | null;
  children?: ReactNode;
}

const STEP_ICONS = [Megaphone, Upload, Wallet];

/**
 * Shared layout of the public invitation (/join/:code) and campaign (/c/:slug) landing pages, in the Creators visual
 * language (LandingPage.css): a dark stage with the headline, the campaign's own words and calls to action beside a
 * "ticket" with its facts (reward per approved post, platforms, dates, category — all from the API, nothing invented),
 * then the content to share, how taking part works and the disclosure rules.
 */
export function LandingView(props: LandingViewProps) {
  const { eyebrow, headline, body, heroImageUrl, cta, secondaryCta, reward, platforms = [], category } = props;
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const hasFacts = !!reward || platforms.length > 0 || !!(props.startsAt && props.endsAt) || !!category;
  return (
    <div ref={root} className="cr cr-landing">
      <section className="cr-stage" aria-labelledby="landing-headline">
        <div className="cr-stage__panel">
          <div className="cr-stage__backdrop" aria-hidden="true" />
          <div className="container cr-landing__inner">
            <div className="cr-landing__copy">
              <p className="cr-pill">
                <Megaphone aria-hidden="true" />
                {eyebrow}
              </p>
              <h1 id="landing-headline" className="cr-display cr-landing__title">
                {headline}
              </h1>
              <p className="cr-lead">{body}</p>
              <div className="cr-actions">
                <ButtonLink to={cta.to} variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                  {cta.label}
                </ButtonLink>
                {secondaryCta && (
                  <ButtonLink to={secondaryCta.to} variant="secondary" size="lg">
                    {secondaryCta.label}
                  </ButtonLink>
                )}
              </div>
            </div>
            <div className="cr-landing__side">
              {heroImageUrl && (
                <div className="cr-landing__visual">
                  <img src={heroImageUrl} alt="" className="cr-landing__image" />
                </div>
              )}
              {hasFacts ? (
                <section className="cr-ticket" aria-labelledby="landing-details-title">
                  <h2 id="landing-details-title" className="cr-ticket__title">
                    Campaign details
                  </h2>
                  <dl className="cr-ticket__facts">
                    {reward && (
                      <div className="cr-ticket__fact cr-ticket__fact--reward">
                        <dt>
                          <Wallet aria-hidden="true" />
                          Reward per approved post
                        </dt>
                        <dd>
                          <span className="cr-ticket__from">From</span> <Money amount={reward.baseAmount} currency={reward.currency} />
                        </dd>
                      </div>
                    )}
                    {platforms.length > 0 && (
                      <div className="cr-ticket__fact">
                        <dt>
                          <LinkIcon aria-hidden="true" />
                          Platforms
                        </dt>
                        <dd>
                          <ul className="cr-ticket__platforms">
                            {platforms.map((p) => (
                              <li key={p}>
                                <PlatformIcon platform={p} />
                                {platformLabel(p)}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                    {props.startsAt && props.endsAt && (
                      <div className="cr-ticket__fact">
                        <dt>
                          <CalendarRange aria-hidden="true" />
                          Runs
                        </dt>
                        <dd>
                          <DateTime value={props.startsAt} format="date" /> – <DateTime value={props.endsAt} format="date" />
                          {props.submissionDeadline && (
                            <span className="cr-ticket__muted">
                              {' '}
                              (submit by <DateTime value={props.submissionDeadline} format="date" />)
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                    {category && (
                      <div className="cr-ticket__fact">
                        <dt>
                          <Hash aria-hidden="true" />
                          Category
                        </dt>
                        <dd>{category.name}</dd>
                      </div>
                    )}
                  </dl>
                </section>
              ) : (
                !heroImageUrl && (
                  <div className="cr-ticket cr-ticket--welcome" aria-hidden="true">
                    <ShieldCheck />
                    <span>{copy.list('creators.hero.trust').join(' · ')}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container cr-landing__body">
        {props.children}

        <section className="cr-landing__how" aria-labelledby="landing-how-title">
          <h2 id="landing-how-title" className="cr-title cr-title--sm" data-reveal="">
            {copy.text('creators.landing.howTitle')}
          </h2>
          <ol className="cr-steps cr-steps--compact" data-reveal="stagger">
            {copy.pairs('creators.how.steps').map(({ title, text }, index) => {
              const Icon = STEP_ICONS[index % STEP_ICONS.length];
              return (
                <li key={title} className="cr-step">
                  <div className="cr-step__top">
                    <span className="cr-step__num tabular" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="cr-step__icon" aria-hidden="true">
                      <Icon />
                    </span>
                  </div>
                  <h3 className="cr-step__title">{title}</h3>
                  <p className="cr-step__text">{text}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="cr-disclosure" aria-labelledby="landing-disclosure-title" data-reveal="">
          <span className="cr-disclosure__icon" aria-hidden="true">
            <ShieldCheck />
          </span>
          <div>
            <h2 id="landing-disclosure-title" className="cr-disclosure__title">
              Paid posts are always disclosed
            </h2>
            <p>
              Every post you’re paid for must be clearly labelled as an ad, using the platform’s paid-partnership label or the disclosure text of the
              campaign. Rewards are paid only for approved posts from established accounts.
            </p>
            {props.disclosure && (
              <p className="cr-disclosure__campaign">
                Disclosure for this campaign: <strong className="cr-disclosure__text">{props.disclosure}</strong>
              </p>
            )}
          </div>
        </aside>

        <p className="cr-landing__more">
          <Link to="/creators" className="cr-arrowlink">
            {copy.text('creators.landing.more')} <ArrowRight aria-hidden="true" />
          </Link>
        </p>
      </div>
    </div>
  );
}

export function LandingSkeleton() {
  return (
    <div className="container cr-landing__loading" aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading…
      </span>
      <Skeleton height={40} width="70%" />
      <SkeletonText lines={3} />
      <Skeleton height={48} width={200} />
    </div>
  );
}

/** Friendly 404 for expired, used-up or unknown invitation links and unpublished campaigns. */
export function LandingUnavailable({ kind }: { kind: 'invitation' | 'campaign' }) {
  return (
    <StatusPage
      code="404"
      icon={<LinkIcon />}
      title={kind === 'invitation' ? 'This invitation is no longer available' : 'This campaign isn’t available'}
      description={
        kind === 'invitation'
          ? 'The link may have expired or reached its limit. You can still join Optimize All and browse the campaigns you qualify for.'
          : 'It may have ended, be invite-only or not be published yet. You can still join Optimize All and browse the campaigns you qualify for.'
      }
      actions={
        <>
          <ButtonLink to="/register">Create an account</ButtonLink>
          <ButtonLink to="/creators" variant="secondary">
            How Optimize All Creators works
          </ButtonLink>
        </>
      }
    />
  );
}
