import { formatDate } from '@/lib/format/dates';
import { currencyMinorUnits, formatMoney, type FormatMoneyOptions } from '@/lib/format/money';

/**
 * Dates and prices on the public website. The site is English and rendered on the server as well as in the browser
 * (src/entry-server.tsx): both must write exactly the same text, so the site uses one fixed locale and time zone
 * rather than the visitor's (portals keep the visitor's, src/lib/format). Publication dates are calendar days, the
 * same for every visitor and the same as in the page's structured data.
 *
 * The site's formats are written here directly (the same text Intl writes for en-US, checked by format.test.ts):
 * creating the first Intl formatter of a page loads the browser's locale, currency and time-zone data, ~10 ms of main
 * thread on a fast machine and several times that on a phone, in the middle of hydration. Anything outside the plain
 * cases (an unusual currency or option, an out-of-range value) still goes through Intl.
 */
export const SITE_LOCALE = 'en-US';
export const SITE_TIME_ZONE = 'UTC';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 23, 2026". */
export function siteDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 1000 || year > 9999)
    return formatDate(value, { locale: SITE_LOCALE, timeZone: SITE_TIME_ZONE });
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${year}`;
}

/** "12,345" (en-US grouping) for an integer; anything else through Intl. */
export function siteNumber(value: number): string {
  if (!Number.isSafeInteger(value)) return value.toLocaleString(SITE_LOCALE);
  return (value < 0 ? '-' : '') + group(String(Math.abs(value)));
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** en-US narrow currency symbols (what Intl writes with currencyDisplay: 'narrowSymbol'). */
const NARROW_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  CAD: '$',
  AUD: '$',
  NZD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  INR: '₹',
};

/**
 * `value` rounded half away from zero to `digits` decimals, like Intl: from the number's shortest decimal form
 * ("1.005", not the binary 1.00499…), so 1.005 → "1.01". Null for values written in exponent form.
 */
function fixed(value: number, digits: number): string | null {
  const text = String(Math.abs(value));
  if (text.includes('e')) return null;
  const [whole, fraction = ''] = text.split('.');
  let units = BigInt(whole + fraction.slice(0, digits).padEnd(digits, '0'));
  if (fraction.length > digits && fraction[digits]! >= '5') units += 1n;
  const all = units.toString().padStart(digits + 1, '0');
  return digits === 0 ? all : `${all.slice(0, -digits)}.${all.slice(-digits)}`;
}

/** A price in the site's locale ("$1,200.00"). */
export function siteMoney(amount: number | string, currency: string, options: FormatMoneyOptions = {}): string {
  const value = typeof amount === 'number' ? amount : Number(amount);
  const code = currency.toUpperCase();
  const symbol = NARROW_SYMBOLS[code];
  const plain = Object.keys(options).every((k) => k === 'currencyDisplay') && options.currencyDisplay === 'narrowSymbol';
  if (symbol && plain && Number.isFinite(value) && value >= 0 && !Object.is(value, -0)) {
    const text = fixed(value, currencyMinorUnits(code));
    if (text !== null) {
      const [whole, cents] = text.split('.');
      return `${symbol}${group(whole!)}${cents === undefined ? '' : `.${cents}`}`;
    }
  }
  return formatMoney(amount, currency, { locale: SITE_LOCALE, ...options });
}
