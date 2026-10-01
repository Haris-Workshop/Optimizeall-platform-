/**
 * What the person signed up for in this browser: the free academy ("learner") or earning from campaigns ("creator").
 * It is recorded at registration (the same value is also sent to the API as `audience`) and decides where a
 * learner-only account lands after sign-in (/app/learning, not the earner home with its onboarding steps).
 * Opening the earner home on purpose (e.g. "Earn with campaigns") clears a learner intent.
 * Storage can be blocked, so every access is guarded and a missing value simply means "no intent".
 */
export type SignupAudience = 'learner' | 'creator';

const KEY = 'oa.signup.intent';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function rememberSignupIntent(audience: SignupAudience, now = Date.now()): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ audience, at: now }));
  } catch {
    /* blocked storage: the account just lands on the default portal home */
  }
}

export function readSignupIntent(now = Date.now()): SignupAudience | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { audience?: unknown; at?: unknown };
    if (value.audience !== 'learner' && value.audience !== 'creator') return null;
    if (typeof value.at !== 'number' || now - value.at > TTL_MS || value.at > now + 60_000) return null;
    return value.audience;
  } catch {
    return null;
  }
}

export function clearSignupIntent(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
