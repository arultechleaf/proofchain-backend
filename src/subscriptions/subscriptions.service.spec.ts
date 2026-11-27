import { addDuration, finalPriceOf } from './subscriptions.service';

describe('subscription pricing', () => {
  it('takes the discount off the price, rounded to paise', () => {
    expect(finalPriceOf(999, 0)).toBe(999);
    expect(finalPriceOf(2999, 10)).toBe(2699.1);
    expect(finalPriceOf(9999, 15)).toBe(8499.15);
    expect(finalPriceOf(15000, 20)).toBe(12000);
    expect(finalPriceOf(30000, 25)).toBe(22500);
    expect(finalPriceOf(500, 100)).toBe(0);
  });
});

describe('subscription end date', () => {
  const at = (iso: string) => new Date(iso);

  it('adds days', () => {
    expect(addDuration(at('2026-11-27T06:00:00Z'), 30, 'DAYS').toISOString()).toBe('2026-12-27T06:00:00.000Z');
  });

  it('adds months and keeps the day, clamped to short months', () => {
    expect(addDuration(at('2026-11-27T06:00:00Z'), 3, 'MONTHS').toISOString()).toBe('2027-02-27T06:00:00.000Z');
    expect(addDuration(at('2026-01-31T06:00:00Z'), 1, 'MONTHS').toISOString()).toBe('2026-02-28T06:00:00.000Z');
  });

  it('adds years, including from 29 February', () => {
    expect(addDuration(at('2026-11-27T06:00:00Z'), 2, 'YEARS').toISOString()).toBe('2028-11-27T06:00:00.000Z');
    expect(addDuration(at('2028-02-29T06:00:00Z'), 1, 'YEARS').toISOString()).toBe('2029-02-28T06:00:00.000Z');
  });
});
