import type { NextFunction, Request, Response } from 'express';
import { one } from '../db/pool';
import { AppError } from '../lib/errors';
import { hashToken, safeEqualHex } from '../lib/tokens';
import { authenticate } from './auth';

interface DeviceRow {
  id: string;
  code: string;
  name: string;
  apiKeyHash: string | null;
}

export async function authenticateOrDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawKey = req.headers['x-device-key'];
  if (typeof rawKey === 'string' && rawKey.length > 0) {
    const deviceCode = (req.body as { deviceCode?: unknown } | undefined)?.deviceCode;
    if (typeof deviceCode !== 'string' || deviceCode.length === 0) {
      throw new AppError(400, 'Төхөөрөмжийн код (deviceCode) шаардлагатай', 'NO_DEVICE_CODE');
    }

    const device = await one<DeviceRow>(
      `SELECT id, code, name, api_key_hash AS "apiKeyHash"
         FROM devices WHERE code = $1 AND status = 'ACTIVE'`,
      [deviceCode],
    );

    if (!device || !device.apiKeyHash || !safeEqualHex(device.apiKeyHash, hashToken(rawKey))) {
      throw new AppError(401, 'Төхөөрөмжийн түлхүүр буруу байна', 'BAD_DEVICE_KEY');
    }

    req.device = { id: device.id, code: device.code, name: device.name };
    next();
    return;
  }

  await authenticate(req, res, next);
}
