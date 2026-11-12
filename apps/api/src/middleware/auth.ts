import type { NextFunction, Request, Response } from 'express';
import { permissionsForRole, type Permission, type Role } from '@shared/permissions';
import { one } from '../db/pool';
import { AppError } from '../lib/errors';
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
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) throw new AppError(401, 'Нэвтрэх шаардлагатай', 'NO_TOKEN');

  const payload = verifyAccessToken(token);
  if (!payload) throw new AppError(401, 'Токен хүчингүй эсвэл хугацаа дууссан', 'BAD_TOKEN');

  const user = await one<AuthRow>(
    'SELECT id, role, status FROM users WHERE id = $1::uuid AND deleted_at IS NULL',
    [payload.sub],
  );
  if (!user) throw new AppError(401, 'Хэрэглэгч олдсонгүй', 'NO_USER');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Хэрэглэгч идэвхгүй байна', 'INACTIVE');

  req.auth = { id: user.id, role: user.role, permissions: permissionsForRole(user.role) };
  next();
}
