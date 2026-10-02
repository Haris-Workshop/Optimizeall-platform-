import { BadgeCheck, CalendarClock, FileCheck2, ShieldCheck, UserCheck, Wallet } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useInViewClass } from '../site/motion';

/**
 * The Creators hero art: a sponsored post on a phone (with its disclosure label) and the post's journey to a payout
 * (submitted → reviewed by a person → approved → in the next payout). Shapes and states only, no amounts. Decorative
 * (aria-hidden); loops only while on screen and never for reduced motion (LandingPage.css).
 */
export function CreatorsHeroArt({ payoutSchedule }: { payoutSchedule: string }) {
  const ref = useInViewClass<HTMLDivElement>();
  const steps = [
    { icon: FileCheck2, label: 'Post submitted', state: 'Proof received' },
    { icon: UserCheck, label: 'Human review', state: 'Checked' },
    { icon: BadgeCheck, label: 'Approved', state: 'Earnings added' },
  ];
  return (
    <div ref={ref} className="cr-art" aria-hidden="true">
      <div className="cr-art__glow" />
      <div className="cr-art__phone">
        <div className="cr-art__notch" />
        <div className="cr-art__post-head">
          <span className="cr-art__avatar" />
          <span className="cr-art__who">
            <b />
            <span className="cr-art__paid">Paid partnership</span>
          </span>
        </div>
        <div className="cr-art__media">
          <span className="cr-art__shape cr-art__shape--sun" />
          <span className="cr-art__shape cr-art__shape--hill" />
          <span className="cr-art__shape cr-art__shape--hill2" />
        </div>
        <div className="cr-art__actions">
          <i />
          <i />
          <i />
        </div>
        <div className="cr-art__caption">
          <b />
          <b className="cr-art__caption-short" />
          <span className="cr-art__tag" />
        </div>
      </div>
      <div className="cr-art__journey">
        <p className="cr-art__journey-title">
          <ShieldCheck /> From post to payout
        </p>
        <ol>
          {steps.map(({ icon: Icon, label, state }, i) => (
            <li key={label} style={{ '--i': i } as CSSProperties}>
              <span className="cr-art__step-icon">
                <Icon />
              </span>
              <span className="cr-art__step-label">{label}</span>
              <span className="cr-art__step-state">{state}</span>
            </li>
          ))}
        </ol>
        <div className="cr-art__payout">
          <span className="cr-art__payout-icon">
            <Wallet />
          </span>
          <span>
            <span className="cr-art__payout-kicker">Next payout</span>
            <span className="cr-art__payout-when">{payoutSchedule}</span>
          </span>
          <CalendarClock className="cr-art__payout-cal" />
        </div>
      </div>
    </div>
  );
}
