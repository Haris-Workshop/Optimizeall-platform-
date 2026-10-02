import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/format/dates';
import { formatMoney } from '@/lib/format/money';
import { siteDate, siteMoney, siteNumber } from './format';

/** The site's own formats must write exactly what Intl writes for en-US (the server and older pages used Intl). */
describe('site formats', () => {
  it('dates: "Sep 23, 2026" in UTC, the same as Intl', () => {
    const values = [
      '2026-09-23',
      '2026-01-01',
      '2026-12-31T23:59:59Z',
      '2026-03-01T00:30:00+02:00',
      '2024-02-29T12:00:00.000Z',
      0,
      Date.UTC(2031, 4, 9),
      new Date(Date.UTC(1999, 10, 5, 22)),
    ];
    for (let m = 0; m < 12; m++) values.push(`2026-${String(m + 1).padStart(2, '0')}-15`);
    for (const value of values) expect(siteDate(value)).toBe(formatDate(value, { locale: 'en-US', timeZone: 'UTC' }));
    expect(siteDate('not a date')).toBe('—');
  });

  it('prices with a narrow symbol, the same as Intl', () => {
    const amounts = [0, 1, 9.5, 12.34, 99.99, 100, 999.995, 1000, 1200, 1234.5, 1.005, 2.675, 0.125, 15000, 249999.99, 1234567.891, 1e21, -5];
    for (const currency of ['USD', 'usd', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'INR', 'CHF', 'KWD', 'XYZ'])
      for (const amount of amounts)
        expect(siteMoney(amount, currency, { currencyDisplay: 'narrowSymbol' }), `${amount} ${currency}`).toBe(
          formatMoney(amount, currency, { locale: 'en-US', currencyDisplay: 'narrowSymbol' }),
        );
    expect(siteMoney('1500', 'USD', { currencyDisplay: 'narrowSymbol' })).toBe('$1,500.00');
    // Other options keep going through Intl.
    expect(siteMoney(1500, 'USD')).toBe(formatMoney(1500, 'USD', { locale: 'en-US' }));
    expect(siteMoney(12500, 'USD', { compact: true })).toBe(formatMoney(12500, 'USD', { locale: 'en-US', compact: true }));
  });

  it('integers with en-US grouping', () => {
    for (const n of [0, 7, 999, 1000, 12345, 1234567, -4321, 2.5]) expect(siteNumber(n)).toBe(n.toLocaleString('en-US'));
  });
});
