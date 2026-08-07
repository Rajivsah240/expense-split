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

export type StatsPeriod = 'today' | 'this-week' | 'this-month' | 'ytd' | 'day' | 'week' | 'month' | 'year';

export interface StatsRange {
  kind: StatsPeriod;
  from: string;
  to: string;
  label: string;
  bucket: 'day' | 'month';
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const YEAR_KEY = /^\d{4}$/;

/** "2026-08-06" for the given instant in the configured statistics timezone. */
export function dateKeyOf(timestamp: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STATS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function validDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validMonthKey(value: string): boolean {
  if (!MONTH_KEY.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function validYearKey(value: string): boolean {
  return YEAR_KEY.test(value) && Number(value) >= 1;
}

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

function monthEnd(key: string): string {
  const [year, month] = key.slice(0, 7).split('-').map(Number);
  const date = new Date(Date.UTC(year, month, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

function weekStart(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}

function displayDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function rangeLabel(from: string, to: string): string {
  return from === to ? displayDate(from) : `${displayDate(from)} – ${displayDate(to)}`;
}

/** Resolve a user-facing calendar period without relying on the function host timezone. */
export function resolveStatsRange(
  requested: string | undefined,
  anchor: string | undefined,
  now: number = Date.now()
): StatsRange {
  const today = dateKeyOf(now);
  const kind: StatsPeriod =
    requested === 'today' ||
    requested === 'this-week' ||
    requested === 'this-month' ||
    requested === 'ytd' ||
    requested === 'day' ||
    requested === 'week' ||
    requested === 'month' ||
    requested === 'year'
      ? requested
      : 'this-month';

  if (kind === 'today') return { kind, from: today, to: today, label: 'Today', bucket: 'day' };

  if (kind === 'this-week') {
    const from = weekStart(today);
    return { kind, from, to: today, label: 'This week', bucket: 'day' };
  }

  if (kind === 'this-month') {
    const from = monthStart(today);
    return { kind, from, to: today, label: 'This month', bucket: 'day' };
  }

  if (kind === 'ytd') {
    const from = `${today.slice(0, 4)}-01-01`;
    return { kind, from, to: today, label: 'Year to date', bucket: 'month' };
  }

  if (kind === 'day') {
    const date = anchor && validDateKey(anchor) ? anchor : today;
    return { kind, from: date, to: date, label: displayDate(date), bucket: 'day' };
  }

  if (kind === 'week') {
    const date = anchor && validDateKey(anchor) ? anchor : today;
    const from = weekStart(date);
    const to = addDays(from, 6);
    return { kind, from, to, label: rangeLabel(from, to), bucket: 'day' };
  }

  if (kind === 'month') {
    const month = anchor && validMonthKey(anchor) ? anchor : today.slice(0, 7);
    const from = monthStart(month);
    return {
      kind,
      from,
      to: monthEnd(month),
      label: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      bucket: 'day',
    };
  }

  const year = anchor && validYearKey(anchor) ? anchor : today.slice(0, 4);
  return { kind, from: `${year}-01-01`, to: `${year}-12-31`, label: year, bucket: 'month' };
}

export function statsTimelineKeys(range: StatsRange): string[] {
  if (range.bucket === 'day') {
    const keys: string[] = [];
    for (let key = range.from; key <= range.to; key = addDays(key, 1)) keys.push(key);
    return keys;
  }

  const keys: string[] = [];
  const [firstYear, firstMonth] = range.from.slice(0, 7).split('-').map(Number);
  const [lastYear, lastMonth] = range.to.slice(0, 7).split('-').map(Number);
  for (let year = firstYear, month = firstMonth; year < lastYear || (year === lastYear && month <= lastMonth); ) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return keys;
}

export function statsTimelineLabel(key: string, bucket: StatsRange['bucket']): string {
  if (bucket === 'month') return monthLabel(key);
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "2026-08" for the given instant, in the stats timezone. */
export function monthKeyOf(timestamp: number = Date.now()): string {
  return dateKeyOf(timestamp).slice(0, 7);
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

/** Mongo expression that buckets a session's `date` into a "YYYY-MM-DD" key. */
export const DAY_KEY_EXPRESSION = {
  $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$date' }, timezone: STATS_TIMEZONE },
} as const;
