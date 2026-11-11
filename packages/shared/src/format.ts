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

const isoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
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

/**
 * Тухайн агшны «локал» огноо (YYYY-MM-DD) — Улаанбаатарын цагаар.
 * UTC-ээс шууд авах нь 00:00–08:00 хооронд өмнөх өдрийг буцаадаг тул
 * тайлангийн анхдагч хүрээг эндээс тооцно.
 */
export function toISODate(d: Date = new Date()): string {
  return isoFmt.format(d);
}

/** ISO огноонд хоног нэмэх/хасах (UTC дээр ажиллана, DST-гүй) */
export function addDaysIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Сүүлийн N хоногийн хүрээ, локал (Улаанбаатар) өдрөөр */
export function rangeForDays(days: number, end: Date = new Date()): { from: string; to: string } {
  const to = toISODate(end);
  return { from: addDaysIsoDate(to, -(days - 1)), to };
}
