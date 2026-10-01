import { safeNextPath } from '@/app/redirects';
import { pendingEnrolSlug } from '@/features/learning/enrolIntent';
import type { SignupAudience } from '@/lib/auth/signupIntent';

/** Who the registration page is speaking to. `generic` is the neutral "Create your account" (no audience sent). */
export type AuthAudience = SignupAudience | 'generic';

const CREATOR_PATH = /^\/(creators|join|c)(\/|\?|#|$)/;
const LEARNER_PATH = /^\/learn(\/|\?|#|$)/;

/**
 * Chooses the registration audience from the query string:
 * 1. an explicit `?audience=learner|creator`;
 * 2. a `next` inside the academy (/learn...) means learner;
 * 3. referral/invite codes, or a `next` from /creators, /join or /c means creator;
 * 4. a remembered "enrol in a course" intent means learner;
 * 5. otherwise generic.
 */
export function resolveAudience(params: URLSearchParams): AuthAudience {
  const explicit = params.get('audience');
  if (explicit === 'learner' || explicit === 'creator') return explicit;
  const next = safeNextPath(params.get('next'));
  if (next && LEARNER_PATH.test(next)) return 'learner';
  if (params.get('ref')?.trim() || params.get('invite')?.trim() || (next && CREATOR_PATH.test(next))) return 'creator';
  if (pendingEnrolSlug()) return 'learner';
  return 'generic';
}

export interface AudienceCopy {
  title: string;
  subtitle: string;
  benefits: string[];
  termsLabel: string;
  termsError: string;
  documentTitle: string;
}

export const AUDIENCE_COPY: Record<AuthAudience, AudienceCopy> = {
  learner: {
    title: 'Create your free learner account',
    subtitle: 'Save your progress, take the final assessments and earn certificates you can add to LinkedIn.',
    benefits: [
      'Every Academy course is free, forever',
      'Your progress is saved across devices',
      'Verifiable certificates and Open Badges',
    ],
    termsLabel: 'I accept the terms and privacy policy',
    termsError: 'You need to accept the terms and privacy policy to create an account.',
    documentTitle: 'Create your free learner account · Optimize All Academy',
  },
  creator: {
    title: 'Create your creator account',
    subtitle: 'Join campaigns, share from your own accounts and get paid for approved posts.',
    benefits: [
      'Browse paid campaigns that match your profile',
      'Share from accounts you already own',
      'Get paid for every approved post',
    ],
    termsLabel: 'I accept the participant rules',
    termsError: 'You need to accept the participant rules to create an account.',
    documentTitle: 'Create your creator account · Optimize All',
  },
  generic: {
    title: 'Create your account',
    subtitle: 'One account for the free Academy and for earning with campaigns.',
    benefits: [
      'Free courses with verifiable certificates',
      'Paid campaigns for creators, when you are ready',
    ],
    termsLabel: 'I accept the terms and privacy policy',
    termsError: 'You need to accept the terms and privacy policy to create an account.',
    documentTitle: 'Create your account · Optimize All',
  },
};
