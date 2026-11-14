import type { NextFunction, Request, Response } from 'express';
import type { Permission, Role } from '@shared/permissions';
import { one } from '../db/pool';
import { AppError } from '../lib/errors';
import { permissionsForUser } from '../lib/permissions';
import { verifyAccessToken } from '../lib/tokens';

export interface AuthContext {
  id: string;
  role: Role;
  permissions: Permission[];
}

interface AuthRow {
  id: string;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  canLogin: boolean;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) throw new AppError(401, 'Нэвтрэх шаардлагатай', 'NO_TOKEN');

  const payload = verifyAccessToken(token);
  if (!payload) throw new AppError(401, 'Токен хүчингүй эсвэл хугацаа дууссан', 'BAD_TOKEN');

  const user = await one<AuthRow>(
    'SELECT id, role, status, can_login AS "canLogin" FROM users WHERE id = $1::uuid AND deleted_at IS NULL',
    [payload.sub],
  );
  if (!user) throw new AppError(401, 'Хэрэглэгч олдсонгүй', 'NO_USER');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Хэрэглэгч идэвхгүй байна', 'INACTIVE');
  if (!user.canLogin) throw new AppError(403, 'Энэ хэрэглэгч системд нэвтрэх эрхгүй байна', 'NO_LOGIN_ACCESS');

  req.auth = {
    id: user.id,
    role: user.role,
    permissions: await permissionsForUser(user.id, user.role),
  };
  next();
}
