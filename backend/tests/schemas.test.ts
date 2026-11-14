import { describe, expect, it } from 'vitest';
import { listScansQuerySchema, reportQuerySchema } from '@shared/schemas';

describe('огнооны шалгалт', () => {
  it('байхгүй огноог татгалзана', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-02-31' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ to: '2026-13-01' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ from: '2025-02-29' }).success).toBe(false);
  });

  it('өндөр жилийн 2 сарын 29-ийг хүлээн авна', () => {
    expect(reportQuerySchema.safeParse({ from: '2024-02-29' }).success).toBe(true);
  });

  it('эхлэх огноо дуусахаас хойш байвал татгалзана', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-11-10', to: '2026-11-01' }).success).toBe(false);
    expect(listScansQuerySchema.safeParse({ from: '2026-11-10', to: '2026-11-01' }).success).toBe(false);
  });

  it('зөв хүрээг хүлээн авна', () => {
    expect(reportQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-10' }).success).toBe(true);
  });
});
