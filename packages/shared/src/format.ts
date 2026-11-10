import { TIMEZONE } from './meal';

const dateFmt = new Intl.DateTimeFormat('mn-MN', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeFmt = new Intl.DateTimeFormat('mn-MN', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** ISO мөр → "2026.11.10" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return dateFmt.format(d).replace(/\//g, '.');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return dateTimeFmt.format(d).replace(/\//g, '.');
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('mn-MN').format(value);
}

/** Сүүлийн 7 хоног / сар гэх мэт хурдан сонголтын огнооны хүрээ (YYYY-MM-DD) */
export function rangeForDays(days: number, end = new Date()): { from: string; to: string } {
  const to = new Date(end);
  const from = new Date(end);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: toISODate(from), to: toISODate(to) };
}

export function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
