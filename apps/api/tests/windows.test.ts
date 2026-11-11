import { describe, expect, it } from 'vitest';
import { windowSegments, windowsOverlap } from '../src/lib/time';

const day = (startTime: string, endTime: string) => ({ startTime, endTime, crossesMidnight: false });
const night = (startTime: string, endTime: string) => ({ startTime, endTime, crossesMidnight: true });

describe('хоолны цонхны давхцал', () => {
  it('энгийн цонхыг 00:00-д таслахгүй', () => {
    expect(windowSegments(day('11:00', '15:00'))).toEqual([[660, 900]]);
  });

  it('шөнийн цонхыг хоёр хэсэгт хуваана', () => {
    expect(windowSegments(night('22:00', '02:00'))).toEqual([
      [1320, 1440],
      [0, 120],
    ]);
  });

  it('давхцаагүй цонхнууд', () => {
    expect(windowsOverlap(day('06:00', '10:00'), day('11:00', '15:00'))).toBe(false);
    expect(windowsOverlap(day('17:00', '21:00'), night('22:00', '02:00'))).toBe(false);
  });

  it('хилд хүрэхдээ давхцахгүй (эхлэх = дуусах)', () => {
    expect(windowsOverlap(day('06:00', '10:00'), day('10:00', '14:00'))).toBe(false);
  });

  it('давхцсан цонхнуудыг илрүүлнэ', () => {
    expect(windowsOverlap(day('06:00', '12:00'), day('11:00', '15:00'))).toBe(true);
  });

  it('шөнийн цонхтой давхцлыг илрүүлнэ', () => {
    expect(windowsOverlap(night('22:00', '02:00'), day('01:00', '05:00'))).toBe(true);
    expect(windowsOverlap(night('22:00', '02:00'), day('03:00', '06:00'))).toBe(false);
  });

  it('бүрэн агуулагдах цонхыг давхцал гэж үзнэ', () => {
    expect(windowsOverlap(day('11:00', '15:00'), day('12:00', '13:00'))).toBe(true);
  });
});
