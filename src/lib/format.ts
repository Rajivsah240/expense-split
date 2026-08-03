import { formatMoney, toRupees } from '@shared/money';
import type { Paise } from '@shared/types';

export { formatMoney, toRupees };

/** Compact money for tight spots: ₹1.2k, ₹4.5L. */
export function formatMoneyShort(paise: Paise, currency = '₹'): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';
  if (rupees >= 10_000_000) return `${sign}${currency}${(rupees / 10_000_000).toFixed(1)}Cr`;
  if (rupees >= 100_000) return `${sign}${currency}${(rupees / 100_000).toFixed(1)}L`;
  if (rupees >= 1000) return `${sign}${currency}${(rupees / 1000).toFixed(rupees >= 10_000 ? 0 : 1)}k`;
  return formatMoney(paise, currency);
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "Today", "Yesterday", "Sat 2 Aug", then "2 Aug 2025" once the year turns. */
export function formatDayLabel(timestamp: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(timestamp);
  const diff = Math.round((today - day) / DAY);

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';

  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-IN', {
    weekday: diff < 7 && diff > 0 ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelative(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDayLabel(timestamp);
}

/** yyyy-MM-dd in local time, for <input type="date">. */
export function toDateInput(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  ['#eeecfe', '#4736d9'],
  ['#e6f7f0', '#0b7a55'],
  ['#fdf0e6', '#a75c09'],
  ['#e8f2fe', '#1a63c4'],
  ['#fdeaf3', '#b4247a'],
  ['#eaf6ea', '#2f7a35'],
  ['#f0ecfb', '#6135c0'],
  ['#e9f5f7', '#0a6a7c'],
];

/** Stable per-user colour, so the same person always looks the same. */
export function avatarColors(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  }
  const [bg, fg] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return { bg, fg };
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
