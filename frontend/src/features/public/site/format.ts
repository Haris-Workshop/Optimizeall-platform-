import { formatDate } from '@/lib/format/dates';
import { formatMoney, type FormatMoneyOptions } from '@/lib/format/money';

/**
 * Dates and prices on the public website. The site is English and rendered on the server as well as in the browser
 * (src/entry-server.tsx): both must write exactly the same text, so the site uses one fixed locale and time zone
 * rather than the visitor's (portals keep the visitor's, src/lib/format). Publication dates are calendar days, the
 * same for every visitor and the same as in the page's structured data.
 */
export const SITE_LOCALE = 'en-US';
export const SITE_TIME_ZONE = 'UTC';

/** "Sep 23, 2026". */
export function siteDate(value: string | number | Date): string {
  return formatDate(value, { locale: SITE_LOCALE, timeZone: SITE_TIME_ZONE });
}

/** A price in the site's locale ("$1,200.00"). */
export function siteMoney(amount: number | string, currency: string, options: FormatMoneyOptions = {}): string {
  return formatMoney(amount, currency, { locale: SITE_LOCALE, ...options });
}
