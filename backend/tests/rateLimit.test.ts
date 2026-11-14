import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit, resetRateLimits } from '../src/middleware/rateLimit';

function makeReq(ip = '10.0.0.1', deviceCode?: string): Request {
  return { ip, body: deviceCode ? { deviceCode } : {} } as unknown as Request;
}

function makeRes(): Response & { statusCode?: number; payload?: unknown; headers: Record<string, string> } {
  const res = {
    headers: {} as Record<string, string>,
    statusCode: undefined as number | undefined,
    payload: undefined as unknown,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.payload = body;
      return res;
    },
  };
  return res as unknown as Response & { statusCode?: number; payload?: unknown; headers: Record<string, string> };
}

describe('rate limit', () => {
  beforeEach(() => resetRateLimits());

  it('хязгаар хүртэл нэвтрүүлж, дараа нь 429 буцаана', () => {
    const limiter = rateLimit({ name: 'test', windowMs: 60_000, max: 2 });
    const next = vi.fn() as unknown as NextFunction;

    for (let i = 0; i < 2; i += 1) {
      const res = makeRes();
      limiter(makeReq(), res, next);
      expect(res.statusCode).toBeUndefined();
    }
    expect(next).toHaveBeenCalledTimes(2);

    const blocked = makeRes();
    limiter(makeReq(), blocked, next);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBeDefined();
    expect((blocked.payload as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('өөр IP-г тусад нь тоолно', () => {
    const limiter = rateLimit({ name: 'test-ip', windowMs: 60_000, max: 1 });
    const next = vi.fn() as unknown as NextFunction;

    limiter(makeReq('10.0.0.1'), makeRes(), next);
    const second = makeRes();
    limiter(makeReq('10.0.0.2'), second, next);
    expect(second.statusCode).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('төхөөрөмжийн кодаар ялгаж болно', () => {
    const limiter = rateLimit({
      name: 'test-device',
      windowMs: 60_000,
      max: 1,
      key: (req) => String((req.body as { deviceCode?: string }).deviceCode ?? req.ip),
    });
    const next = vi.fn() as unknown as NextFunction;

    limiter(makeReq('10.0.0.1', 'KIOSK-01'), makeRes(), next);
    const otherDevice = makeRes();
    limiter(makeReq('10.0.0.1', 'KIOSK-02'), otherDevice, next);
    expect(otherDevice.statusCode).toBeUndefined();

    const sameDevice = makeRes();
    limiter(makeReq('10.0.0.1', 'KIOSK-01'), sameDevice, next);
    expect(sameDevice.statusCode).toBe(429);
  });
});
