import { ArrowRight, BadgeCheck, CalendarClock, Check, Eye, Hash, Megaphone, ReceiptText, Upload, UserCheck, Wallet } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { CreatorsHeroArt } from './landing/CreatorsArt';
import { useSiteCopy } from './site/copy';
import { useDocumentHead } from './site/head';
import { useReveal } from './site/motion';
import './site/marketing.css';
import './LandingPage.css';

/** Icons for the editable steps, earnings stages and rules (by position; extra items reuse them in order). */
const STEP_ICONS = [Megaphone, Upload, Wallet];
const EARN_ICONS = [ReceiptText, UserCheck, CalendarClock, BadgeCheck];
const RULE_ICONS = [UserCheck, Hash, Eye, CalendarClock];

/**
 * Optimize All Creators (/creators): the creator programme's front page. A dark hero stage (value proposition, account
 * and how-it-works calls to action, trust points, the post-to-payout art), the three steps, how earnings work (no
 * figures: every campaign states its own reward), the rules, the most asked questions and a closing call to action.
 * Every word is editable page copy (`creators.*`); the server-rendered page (SeoPageResolver.CreatorsPage) follows the
 * same order.
 */
export function LandingPage() {
  const { hash } = useLocation();
  const copy = useSiteCopy();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useDocumentHead({ title: copy.text('creators.seo.title'), description: copy.text('creators.seo.description') });

  // Router links to /creators#section: scroll to the section and move focus there for keyboard users.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
    }
  }, [hash]);

  return (
    <div ref={root} className="cr">
      <section className="cr-stage cr-hero" aria-labelledby="hero-title">
        <div className="cr-stage__panel">
          <div className="cr-stage__backdrop" aria-hidden="true" />
          <div className="container cr-hero__inner">
            <div className="cr-hero__copy">
              <p className="cr-pill">
                <span className="cr-pill__dot" aria-hidden="true" />
                {copy.text('creators.hero.eyebrow')}
              </p>
              <h1 id="hero-title" className="cr-display">
                {copy.text('creators.hero.title')} <span className="cr-accent">{copy.text('creators.hero.titleAccent')}</span>
              </h1>
              <p className="cr-lead">{copy.text('creators.hero.lead')}</p>
              <div className="cr-actions">
                <ButtonLink to="/register?audience=creator" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                  {copy.text('creators.hero.primaryCta')}
                </ButtonLink>
                <ButtonLink to="/creators#how-it-works" variant="secondary" size="lg">
                  {copy.text('creators.hero.secondaryCta')}
                </ButtonLink>
              </div>
              <ul className="cr-trust">
                {copy.list('creators.hero.trust').map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="cr-hero__visual">
              <CreatorsHeroArt payoutSchedule={copy.text('creators.hero.payoutSchedule')} />
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" tabIndex={-1} className="cr-section" aria-labelledby="how-title">
        <div className="container">
          <div className="cr-head" data-reveal="">
            <p className="cr-eyebrow">{copy.text('creators.how.eyebrow')}</p>
            <h2 id="how-title" className="cr-title">
              {copy.text('creators.how.title')}
            </h2>
          </div>
          <ol className="cr-steps" data-reveal="stagger">
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
                  <h3 className="cr-step__title">
                    <span className="visually-hidden">Step {index + 1}: </span>
                    {title}
                  </h3>
                  <p className="cr-step__text">{text}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section id="earnings" className="cr-section cr-section--tint" aria-labelledby="earn-title">
        <div className="container cr-split">
          <div className="cr-head cr-head--side" data-reveal="">
            <p className="cr-eyebrow">{copy.text('creators.earn.eyebrow')}</p>
            <h2 id="earn-title" className="cr-title">
              {copy.text('creators.earn.title')}
            </h2>
            <p className="cr-intro">{copy.text('creators.earn.intro')}</p>
            <p className="cr-note">{copy.text('creators.earn.note')}</p>
          </div>
          <ol className="cr-ledger" data-reveal="stagger">
            {copy.pairs('creators.earn.stages').map(({ title, text }, index) => {
              const Icon = EARN_ICONS[index % EARN_ICONS.length];
              return (
                <li key={title} className="cr-ledger__item">
                  <span className="cr-ledger__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <div>
                    <h3 className="cr-ledger__title">{title}</h3>
                    <p className="cr-ledger__text">{text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section id="rules" tabIndex={-1} className="cr-chapter" aria-labelledby="rules-title">
        <div className="cr-stage__panel">
          <div className="cr-stage__backdrop" aria-hidden="true" />
          <div className="container cr-chapter__inner">
            <div className="cr-head" data-reveal="">
              <p className="cr-eyebrow">{copy.text('creators.rules.eyebrow')}</p>
              <h2 id="rules-title" className="cr-title">
                {copy.text('creators.rules.title')}
              </h2>
              <p className="cr-intro">{copy.text('creators.rules.lead')}</p>
            </div>
            <ul className="cr-rules" data-reveal="stagger">
              {copy.pairs('creators.rules.items').map(({ title, text }, index) => {
                const Icon = RULE_ICONS[index % RULE_ICONS.length];
                return (
                  <li key={title} className="cr-rule">
                    <span className="cr-rule__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <h3 className="cr-rule__title">{title}</h3>
                    <p className="cr-rule__text">{text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <section className="cr-section" aria-labelledby="faq-title">
        <div className="container cr-split">
          <div className="cr-head cr-head--side" data-reveal="">
            <p className="cr-eyebrow">{copy.text('creators.faq.eyebrow')}</p>
            <h2 id="faq-title" className="cr-title">
              {copy.text('creators.faq.title')}
            </h2>
            <p className="cr-intro">{copy.text('creators.faq.lead')}</p>
            <ButtonLink to="/creators/faq" variant="secondary" trailingIcon={<ArrowRight />} className="cr-head__button">
              {copy.text('creators.faq.cta')}
            </ButtonLink>
          </div>
          <dl className="cr-faq" data-reveal="stagger">
            {copy.pairs('creators.faq.items').map((item) => (
              <div key={item.title} className="cr-faq__item">
                <dt>{item.title}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="cr-stage cr-cta" aria-labelledby="cta-title">
        <div className="cr-stage__panel">
          <div className="cr-stage__backdrop" aria-hidden="true" />
          <div className="container cr-cta__inner" data-reveal="">
            <h2 id="cta-title" className="cr-cta__title">
              {copy.text('creators.cta.title')}
            </h2>
            <p className="cr-cta__text">{copy.text('creators.cta.text')}</p>
            <div className="cr-actions cr-actions--center">
              <ButtonLink to="/register?audience=creator" variant="highlight" size="lg" trailingIcon={<ArrowRight />}>
                {copy.text('creators.cta.button')}
              </ButtonLink>
              <ButtonLink to="/login" variant="secondary" size="lg">
                {copy.text('creators.cta.secondary')}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
