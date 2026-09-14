let currentLocale = 'es';
let currentTimeZone: string | undefined;

export function configureDates(locale?: string, timeZone?: string) {
  currentLocale = locale || 'es';
  currentTimeZone = timeZone && timeZone !== 'UTC' ? timeZone : undefined;
}

/**
 * Parses a date-only value (YYYY-MM-DD) as a local calendar date.
 * `new Date('2026-09-13')` is UTC midnight and shows the previous day in
 * negative offsets (all of Latin America).
 */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }): string {
  if (!value) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isDateOnly ? parseDateOnly(value) : new Date(value);
  return new Intl.DateTimeFormat(currentLocale, { ...opts, ...(isDateOnly ? {} : { timeZone: currentTimeZone }) }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(currentLocale, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: currentTimeZone,
  }).format(new Date(value));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
];

export function formatRelative(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '—';
  const diff = (new Date(value).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'hace un momento';
  const rtf = new Intl.RelativeTimeFormat(currentLocale, { numeric: 'auto' });
  for (const [unit, seconds] of UNITS) {
    if (abs >= seconds || unit === 'minute') {
      return rtf.format(Math.round(diff / seconds), unit);
    }
  }
  return '';
}

/** Days from today to a date-only value (negative = overdue). */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const today = parseDateOnly(todayISO());
  return Math.round((parseDateOnly(value).getTime() - today.getTime()) / 86400000);
}

export function dueState(value: string | null | undefined, closed = false): 'none' | 'overdue' | 'soon' | 'ok' | 'done' {
  const d = daysUntil(value);
  if (d === null) return 'none';
  if (closed) return 'done';
  if (d < 0) return 'overdue';
  if (d <= 2) return 'soon';
  return 'ok';
}
