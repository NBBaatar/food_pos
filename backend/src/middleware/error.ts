import type { ErrorRequestHandler, RequestHandler } from 'express';
import { isProd } from '../config/env';
import { AppError } from '../lib/errors';
import { isUniqueViolation } from '../lib/sql';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { message: 'Хаяг олдсонгүй', code: 'NOT_FOUND' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code ?? 'APP_ERROR' } });
    return;
  }

  if (isUniqueViolation(err)) {
    res.status(409).json({ error: { message: 'Ийм утга аль хэдийн бүртгэгдсэн байна', code: 'CONFLICT' } });
    return;
  }

  // Гадаад түлхүүрийн зөрчил (жишээ: байхгүй хэлтэс)
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23503') {
    res.status(400).json({ error: { message: 'Холбосон бичлэг олдсонгүй', code: 'FK_VIOLATION' } });
    return;
  }

  if (!isProd) console.error('[api]', err);
  res.status(500).json({
    error: {
      message: isProd ? 'Серверийн алдаа гарлаа' : `Серверийн алдаа: ${(err as Error)?.message ?? 'unknown'}`,
      code: 'INTERNAL',
    },
  });
};
