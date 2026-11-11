import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { AppError } from '../lib/errors';
import { hashToken, safeEqualHex } from '../lib/tokens';
import { authenticate } from './auth';

export async function authenticateOrDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawKey = req.headers['x-device-key'];
  if (typeof rawKey === 'string' && rawKey.length > 0) {
    const deviceCode = (req.body as { deviceCode?: unknown } | undefined)?.deviceCode;
    if (typeof deviceCode !== 'string' || deviceCode.length === 0) {
      throw new AppError(400, 'Төхөөрөмжийн код (deviceCode) шаардлагатай', 'NO_DEVICE_CODE');
    }

    const device = await prisma.device.findFirst({
      where: { code: deviceCode, status: 'ACTIVE' },
      select: { id: true, code: true, name: true, apiKeyHash: true },
    });

    if (!device || !device.apiKeyHash || !safeEqualHex(device.apiKeyHash, hashToken(rawKey))) {
      throw new AppError(401, 'Төхөөрөмжийн түлхүүр буруу байна', 'BAD_DEVICE_KEY');
    }

    req.device = { id: device.id, code: device.code, name: device.name };
    next();
    return;
  }

  await authenticate(req, res, next);
}
