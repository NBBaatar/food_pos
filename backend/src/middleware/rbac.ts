import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@shared/permissions';
import { AppError } from '../lib/errors';

export function requirePermission(...needed: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const granted = req.auth?.permissions ?? [];
    const missing = needed.filter((permission) => !granted.includes(permission));
    if (missing.length > 0) {
      throw new AppError(403, 'Энэ үйлдлийг хийх эрх хүрэхгүй', 'FORBIDDEN');
    }
    next();
  };
}
