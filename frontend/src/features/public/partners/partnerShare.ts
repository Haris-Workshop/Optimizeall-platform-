/**
 * Share links of the partner pages and cards: plain URLs of the networks' own share pages (no scripts, no cookies, no
 * third-party widgets) plus the Web Share API where the browser has it. The page that is shared is always the
 * partner's profile on this site, never a redirect, and carries UTM tags so shares are measurable in our analytics.
 */
export type ShareNetwork = 'linkedin' | 'x' | 'whatsapp' | 'email' | 'copy' | 'native';

export const SHARE_CAMPAIGN = 'partner-share';

const MEDIUM: Record<ShareNetwork, string> = {
  linkedin: 'social',
  x: 'social',
  whatsapp: 'social',
  native: 'social',
  email: 'email',
  copy: 'referral',
};

/** The page URL with the share's UTM tags (utm_* already on the URL are kept). */
export function taggedShareUrl(pageUrl: string, network: ShareNetwork, content: string): string {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return pageUrl;
  }
  const have = new Set([...url.searchParams.keys()].map((k) => k.toLowerCase()));
  const tags: [string, string][] = [
    ['utm_source', network],
    ['utm_medium', MEDIUM[network]],
    ['utm_campaign', SHARE_CAMPAIGN],
    ['utm_content', content],
  ];
  for (const [key, value] of tags) if (!have.has(key) && value) url.searchParams.append(key, value);
  return url.toString();
}

export interface ShareMessage {
  /** The page being shared (absolute, canonical, without tags). */
  url: string;
  /** Short message for X and WhatsApp. */
  text: string;
  /** Email subject and body (the body contains the tagged URL). */
  subject: string;
  body: (taggedUrl: string) => string;
  /** What is shared (a partner slug): utm_content. */
  content: string;
}

/** The href of a network's share page (`copy` and `native` have none: they are buttons). */
export function shareHref(network: Exclude<ShareNetwork, 'copy' | 'native'>, m: ShareMessage): string {
  const url = taggedShareUrl(m.url, network, m.content);
  const enc = encodeURIComponent;
  switch (network) {
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`;
    case 'x':
      return `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(m.text)}`;
    case 'whatsapp':
      return `https://wa.me/?text=${enc(`${m.text} ${url}`)}`;
    case 'email':
      return `mailto:?subject=${enc(m.subject)}&body=${enc(m.body(url))}`;
  }
}
