import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIODS } from '@shared/meal';
import { addDaysIso, businessDateFor, daysBetween, findPeriod, matchesPeriod, minutesOfDay } from '../src/lib/time';

const TZ = 'Asia/Ulaanbaatar';

/** Улаанбаатар нь UTC+8 (DST-гүй) — локал цагийг UTC Date болгоно */
function ub(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 8 * 3_600_000);
}

const periods = DEFAULT_PERIODS.map((period, index) => ({
  ...period,
  id: `p${index}`,
  isActive: true,
  sortOrder: index,
}));

describe('бизнес өдөр', () => {
  it('04:00-аас өмнөх уншилт өмнөх өдөрт хамаарна', () => {
    expect(businessDateFor(ub(2026, 11, 10, 1, 30), 4, TZ)).toBe('2026-11-09');
  });

  it('04:00-аас хойшхи уншилт тухайн өдөрт хамаарна', () => {
    expect(businessDateFor(ub(2026, 11, 10, 4, 0), 4, TZ)).toBe('2026-11-10');
    expect(businessDateFor(ub(2026, 11, 10, 23, 59), 4, TZ)).toBe('2026-11-10');
  });

  it('шөнийн 23:30 ба дараа өдрийн 01:30 ижил бизнес өдөр', () => {
    const late = businessDateFor(ub(2026, 11, 10, 23, 30), 4, TZ);
    const early = businessDateFor(ub(2026, 11, 11, 1, 30), 4, TZ);
    expect(late).toBe('2026-11-10');
    expect(early).toBe(late);
  });
});

describe('хоолны цонх', () => {
  it('23:30 нь шөнийн цонхонд багтана', () => {
    expect(findPeriod(periods, ub(2026, 11, 10, 23, 30), TZ)?.code).toBe('NIGHT');
  });

  it('01:30 нь шөнийн цонхонд багтана', () => {
    expect(findPeriod(periods, ub(2026, 11, 11, 1, 30), TZ)?.code).toBe('NIGHT');
  });

  it('15:30 нь аль ч цонхонд багтахгүй', () => {
    expect(findPeriod(periods, ub(2026, 11, 10, 15, 30), TZ)).toBeUndefined();
  });

  it('цонхны хил: эхлэх минутад багтаж, дуусах минутад багтахгүй', () => {
    const lunch = periods.find((period) => period.code === 'LUNCH')!;
    expect(matchesPeriod(lunch, minutesOfDay(lunch.startTime))).toBe(true);
    expect(matchesPeriod(lunch, minutesOfDay(lunch.endTime))).toBe(false);
  });

  it('идэвхгүй цонхыг алгасна', () => {
    const inactive = periods.map((period) =>
      period.code === 'LUNCH' ? { ...period, isActive: false } : period,
    );
    expect(findPeriod(inactive, ub(2026, 11, 10, 12, 0), TZ)?.code).toBeUndefined();
  });
});

describe('огнооны туслах', () => {
  it('сар/жилийн хилийг зөв гүйцээнэ', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('өдрийн тоо inclusive', () => {
    expect(daysBetween('2026-11-01', '2026-11-10')).toBe(10);
    expect(daysBetween('2026-11-10', '2026-11-10')).toBe(1);
  });
});
