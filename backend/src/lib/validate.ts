import type { Request } from 'express';
import type { ZodType } from 'zod';
import { AppError, zodMessage } from './errors';

export function parseBody<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw new AppError(400, zodMessage(result.error), 'VALIDATION');
  return result.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Express 5 path параметр нь string | string[] байж болно */
export function rawPathParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) throw new AppError(400, 'ID шаардлагатай', 'BAD_ID');
  return raw;
}

/**
 * UUID path параметр. Буруу хэлбэрийг эндээс 400-аар татгалзана —
 * өөрөөр Postgres-ийн "invalid input syntax for uuid" 500 болно.
 */
export function pathId(value: string | string[] | undefined): string {
  const raw = rawPathParam(value);
  if (!UUID_RE.test(raw)) throw new AppError(400, 'ID буруу хэлбэртэй байна', 'BAD_ID');
  return raw;
}

export function parseQuery<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) throw new AppError(400, zodMessage(result.error), 'VALIDATION');
  return result.data;
}
