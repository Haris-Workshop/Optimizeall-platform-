import clsx from 'clsx';
import { Link2, Mail, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useHydrated } from '@/lib/ssr';
import { absoluteUrl } from '../site/head';
import { useSite } from '../site/api';
import { useSiteCopy } from '../site/copy';
import type { PartnerCard } from './api';
import { shareHref, taggedShareUrl, type ShareMessage } from './partnerShare';

/**
 * Share a partner: LinkedIn, X, WhatsApp, email ("Tell a colleague"), copy link and, where the browser has it, the
 * system share sheet. The shared page is the partner's profile on this site with UTM tags. `row` lists the links; `menu`
 * folds them into a native <details> (no JavaScript needed) for the compact cards. Everything is plain links and buttons.
 */
export function PartnerShare({
  partner,
  layout = 'row',
  className,
}: {
  partner: Pick<PartnerCard, 'slug' | 'name' | 'tagline' | 'profilePath'>;
  layout?: 'row' | 'menu';
  className?: string;
}) {
  const copy = useSiteCopy();
  const { data: site } = useSite();
  const hydrated = useHydrated();
  const [copied, setCopied] = useState(false);
  const url = absoluteUrl(partner.profilePath, site?.seo.siteUrl);
  if (!url) return null;

  const message: ShareMessage = {
    url,
    text: copy.text('partners.share.text', { name: partner.name, tagline: partner.tagline }),
    subject: copy.text('partners.share.emailSubject', { name: partner.name }),
    body: (tagged) => copy.text('partners.share.emailBody', { url: tagged }),
    content: partner.slug,
  };
  const canNative = hydrated && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const canCopy = hydrated && typeof navigator !== 'undefined' && !!navigator.clipboard;

  const links = (
    <ul className="partner-share__list">
      {(['linkedin', 'x', 'whatsapp'] as const).map((n) => (
        <li key={n}>
          <a className="partner-share__item" href={shareHref(n, message)} target="_blank" rel="noopener noreferrer">
            {n === 'linkedin' ? 'LinkedIn' : n === 'x' ? 'X' : 'WhatsApp'}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
      <li>
        <a className="partner-share__item partner-share__item--tell" href={shareHref('email', message)}>
          <Mail aria-hidden="true" width={14} height={14} /> {copy.text('partners.share.tell')}
        </a>
      </li>
      {canCopy && (
        <li>
          <button
            type="button"
            className="partner-share__item"
            onClick={() => {
              void navigator.clipboard.writeText(taggedShareUrl(url, 'copy', partner.slug)).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            <Link2 aria-hidden="true" width={14} height={14} /> {copied ? copy.text('partners.share.copied') : copy.text('partners.share.copy')}
          </button>
        </li>
      )}
      {canNative && (
        <li>
          <button
            type="button"
            className="partner-share__item"
            onClick={() => {
              void navigator
                .share({ title: partner.name, text: message.text, url: taggedShareUrl(url, 'native', partner.slug) })
                .catch(() => undefined);
            }}
          >
            <Share2 aria-hidden="true" width={14} height={14} /> {copy.text('partners.share.native')}
          </button>
        </li>
      )}
    </ul>
  );
  const status = (
    <span className="visually-hidden" role="status">
      {copied ? copy.text('partners.share.copied') : ''}
    </span>
  );

  if (layout === 'menu') {
    return (
      <details className={clsx('partner-share partner-share--menu', className)}>
        <summary className="partner-share__summary">
          <Share2 aria-hidden="true" width={14} height={14} /> {copy.text('partners.share.title')}
          <span className="visually-hidden"> {partner.name}</span>
        </summary>
        {links}
        {status}
      </details>
    );
  }
  return (
    <div className={clsx('partner-share', className)} role="group" aria-label={`${copy.text('partners.share.title')} ${partner.name}`}>
      <span className="partner-share__title" aria-hidden="true">
        {copy.text('partners.share.title')}
      </span>
      {links}
      {status}
    </div>
  );
}
