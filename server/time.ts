/**
 * One timezone for every date bucket.
 *
 * Sessions are stored as noon-anchored epoch milliseconds, and MongoDB buckets
 * them with `$dateToString ... timezone`. Anything on the JS side that derives a
 * month key must use the SAME zone, or the two disagree — on Vercel the server
 * runs in UTC, so between 18:30 and midnight IST on the last day of a month the
 * server's local month is still the previous one, and the current month would
 * silently vanish from the chart.
 */

export const STATS_TIMEZONE = process.env.STATS_TIMEZONE || 'Asia/Kolkata';

/** "2026-08" for the given instant, in the stats timezone. */
export function monthKeyOf(timestamp: number = Date.now()): string {
  return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: STATS_TIMEZONE }).slice(0, 7);
}

/** The last `count` month keys ending with the current one, oldest first. */
export function recentMonthKeys(count: number): string[] {
  const [year, month] = monthKeyOf().split('-').map(Number);
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

/** Mongo expression that buckets a session's `date` into a "YYYY-MM" key. */
export const MONTH_KEY_EXPRESSION = {
  $dateToString: { format: '%Y-%m', date: { $toDate: '$date' }, timezone: STATS_TIMEZONE },
} as const;
