import type { Request, RequestHandler } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Лог/түлхүүрт ашиглах нэр */
  name: string;
  windowMs: number;
  max: number;
  /** Анхдагчаар IP; төхөөрөмж/хэрэглэгчээр ялгах бол өгнө */
  key?: (req: Request) => string;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/** Хугацаа дууссан бакетуудыг цэвэрлэнэ (санах ой хязгаартай байлгах) */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

const sweeper = setInterval(() => sweep(Date.now()), 60_000);
sweeper.unref();

/**
 * Санах ойн sliding-window хязгаарлагч. Нэг процесс дээр ажиллана —
 * олон instance-тай бол Redis рүү шилжүүлэх шаардлагатай.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > MAX_BUCKETS) sweep(now);

    const identity = options.key?.(req) ?? req.ip ?? 'unknown';
    const id = `${options.name}:${identity}`;
    const existing = buckets.get(id);

    if (!existing || existing.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: {
          message: `Хэт олон хүсэлт илгээгдлээ. ${retryAfter} секундын дараа дахин оролдоно уу.`,
          code: 'RATE_LIMITED',
        },
      });
      return;
    }

    next();
  };
}

/** Тестэд төлөвийг цэвэрлэх */
export function resetRateLimits(): void {
  buckets.clear();
}
