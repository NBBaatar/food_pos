import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// .env нь repo-ийн үндэс дээр байна (npm -w нь cwd-г apps/api болгодог).
for (const candidate of ['.env', '../../.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    loadEnv({ path, quiet: true });
    break;
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL шаардлагатай'),
  PORT: z.coerce.number().int().default(4000),
  NODE_ENV: z.string().default('development'),
  APP_TIMEZONE: z.string().default('Asia/Ulaanbaatar'),
  DAY_START_HOUR: z.coerce.number().int().min(0).max(12).default(4),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET 16+ тэмдэгт байх ёстой'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  /** Proxy-н ард ажиллаж байгаа бол: "1" (hop тоо) эсвэл "true". Хоосон = итгэхгүй. */
  TRUST_PROXY: z.string().default(''),
  SEED_DEVICE_KEY: z.string().min(8).default('kiosk-dev-key-change-me'),
});

export const env = envSchema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
