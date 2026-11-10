import { TIMEZONE, type PeriodCode } from '@shared/meal';

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, fmt);
  return fmt;
}

export function toLocalParts(date: Date, timeZone = TIMEZONE): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const read = (type: string): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Бизнес өдөр: локал цагаас dayStartHour-ыг хасна.
 * 04:00 тохиргоотой үед 01:30-ийн уншилт өмнөх өдөрт хамаарна.
 */
export function businessDateFor(date: Date, dayStartHour = 4, timeZone = TIMEZONE): string {
  const p = toLocalParts(date, timeZone);
  const wallClock = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const shifted = new Date(wallClock - dayStartHour * 3_600_000);
  return isoFromParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDaysIso(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Хоёр ISO огнооны хоорондох өдрийн тоо (inclusive) */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = isoToDate(toIso).getTime() - isoToDate(fromIso).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface PeriodWindow {
  code: PeriodCode;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isActive: boolean;
}

/** HH:mm цонхонд тухайн өдрийн минут багтах эсэх (00:00-ийг давахыг дэмжинэ) */
export function matchesPeriod(period: Pick<PeriodWindow, 'startTime' | 'endTime' | 'crossesMidnight'>, minutes: number): boolean {
  const start = minutesOfDay(period.startTime);
  const end = minutesOfDay(period.endTime);
  if (period.crossesMidnight) {
    return minutes >= start || minutes < end;
  }
  return minutes >= start && minutes < end;
}

/** Тухайн агшинд тохирох идэвхтэй хоолны цонх */
export function findPeriod<T extends PeriodWindow>(periods: T[], at: Date, timeZone = TIMEZONE): T | undefined {
  const p = toLocalParts(at, timeZone);
  const minutes = p.hour * 60 + p.minute;
  return periods.find((period) => period.isActive && matchesPeriod(period, minutes));
}

export function localClock(at: Date, timeZone = TIMEZONE): string {
  const p = toLocalParts(at, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
