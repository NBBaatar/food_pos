import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { isProd } from '../config/env';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { message: 'Хаяг олдсонгүй', code: 'NOT_FOUND' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code ?? 'APP_ERROR' } });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: { message: 'Ийм утга аль хэдийн бүртгэгдсэн байна', code: 'CONFLICT' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { message: 'Бичлэг олдсонгүй', code: 'NOT_FOUND' } });
      return;
    }
  }

  if (!isProd) console.error('[api]', err);
  res.status(500).json({
    error: {
      message: isProd ? 'Серверийн алдаа гарлаа' : `Серверийн алдаа: ${(err as Error)?.message ?? 'unknown'}`,
      code: 'INTERNAL',
    },
  });
};
