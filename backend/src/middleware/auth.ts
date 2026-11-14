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
  mustChangePassword: boolean;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) throw new AppError(401, 'Нэвтрэх шаардлагатай', 'NO_TOKEN');

  const payload = verifyAccessToken(token);
  if (!payload) throw new AppError(401, 'Токен хүчингүй эсвэл хугацаа дууссан', 'BAD_TOKEN');

  const user = await one<AuthRow>(
    `SELECT id, role, status, can_login AS "canLogin",
            must_change_password AS "mustChangePassword"
       FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
    [payload.sub],
  );
  if (!user) throw new AppError(401, 'Хэрэглэгч олдсонгүй', 'NO_USER');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Хэрэглэгч идэвхгүй байна', 'INACTIVE');
  if (!user.canLogin) throw new AppError(403, 'Энэ хэрэглэгч системд нэвтрэх эрхгүй байна', 'NO_LOGIN_ACCESS');

  // Түр нууц үгээр нэвтэрсэн бол зөвхөн профайл/мэдээлэл/гаралтын endpoint-ууд нээлттэй.
  // Эс бөгөөс "түр нууц үг" хэзээ ч солигдохгүй сул тал үлдэнэ.
  if (user.mustChangePassword) {
    const allowed =
      (req.baseUrl.endsWith('/auth') && ['/profile', '/me', '/logout'].includes(req.path)) ||
      req.path === '/profile';
    if (!allowed) {
      throw new AppError(403, 'Эхлээд нууц үгээ солино уу', 'MUST_CHANGE_PASSWORD');
    }
  }

  req.auth = {
    id: user.id,
    role: user.role,
    permissions: await permissionsForUser(user.id, user.role),
  };
  next();
}
