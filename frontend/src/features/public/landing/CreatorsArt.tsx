import { BadgeCheck, CalendarClock, FileCheck2, ShieldCheck, UserCheck, Wallet } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useInViewClass } from '../site/motion';

/**
 * The Creators hero card: the post's journey to a payout (submitted → reviewed by a person → approved → in the next
 * payout). States only, no amounts. Decorative
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
