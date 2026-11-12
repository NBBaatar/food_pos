import { Router } from 'express';
import type { Response } from 'express';
import { loginSchema } from '@shared/schemas';
import { isProd } from '../../config/env';
import { execute, one } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { toAuthUser, type UserRow } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { verifyPassword } from '../../lib/password';
import { createRefreshToken, hashToken, signAccessToken } from '../../lib/tokens';
import { parseBody } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';

const router = Router();

const REFRESH_COOKIE = 'fp_rt';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/api/v1/auth',
};

const USER_SELECT = `
  SELECT u.id, u.employee_no AS "employeeNo", u.first_name AS "firstName", u.last_name AS "lastName",
         u.email, u.phone, u.role, u.status, u.department_id AS "departmentId",
         d.name AS "departmentName", NULL::text AS "cardUid", NULL::text AS "cardStatus",
         u.created_at AS "createdAt"
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
`;

async function issueSession(
  res: Response,
  user: { id: string; role: 'ADMIN' | 'MANAGER' | 'USER' },
  meta: { ip?: string; userAgent?: string },
): Promise<void> {
  const refresh = createRefreshToken();
  await execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1::uuid, $2, $3, $4, $5)`,
    [user.id, refresh.hash, refresh.expiresAt, meta.ip ?? null, meta.userAgent ?? null],
  );
  res.cookie(REFRESH_COOKIE, refresh.token, { ...cookieOptions, expires: refresh.expiresAt });
}

router.post('/login', async (req, res) => {
  const { email, password } = parseBody(loginSchema, req);
  const user = await one<UserRow & { passwordHash: string }>(
    `SELECT u.id, u.employee_no AS "employeeNo", u.first_name AS "firstName", u.last_name AS "lastName",
            u.email, u.phone, u.role, u.status, u.department_id AS "departmentId",
            d.name AS "departmentName", NULL::text AS "cardUid", NULL::text AS "cardStatus",
            u.created_at AS "createdAt", u.password_hash AS "passwordHash"
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
    [email.toLowerCase()],
  );

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'И-мэйл эсвэл нууц үг буруу', 'BAD_CREDENTIALS');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, 'Хэрэглэгч идэвхгүй байна. Админтай холбогдоно уу.', 'INACTIVE');
  }

  await execute('UPDATE users SET last_login_at = now() WHERE id = $1::uuid', [user.id]);
  await issueSession(res, user, { ip: req.ip, userAgent: req.headers['user-agent'] });
  await writeAudit({ actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, req });

  res.json({
    accessToken: signAccessToken(user.id, user.role),
    user: toAuthUser(user),
  });
});

router.post('/refresh', async (req, res) => {
  const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  if (!raw) throw new AppError(401, 'Сессийн токен олдсонгүй', 'NO_REFRESH');

  const stored = await one<UserRow & { tokenId: string; revokedAt: Date | null; expiresAt: Date }>(
    `SELECT u.id, u.employee_no AS "employeeNo", u.first_name AS "firstName", u.last_name AS "lastName",
            u.email, u.phone, u.role, u.status, u.department_id AS "departmentId",
            d.name AS "departmentName", NULL::text AS "cardUid", NULL::text AS "cardStatus",
            u.created_at AS "createdAt",
            rt.id AS "tokenId", rt.revoked_at AS "revokedAt", rt.expires_at AS "expiresAt"
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE rt.token_hash = $1`,
    [hashToken(raw)],
  );

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw new AppError(401, 'Сессийн хугацаа дууссан. Дахин нэвтэрнэ үү.', 'REFRESH_EXPIRED');
  }
  if (stored.status !== 'ACTIVE') {
    throw new AppError(403, 'Хэрэглэгч идэвхгүй байна', 'INACTIVE');
  }

  // Rotation: хуучин токеныг хүчингүй болгоно
  await execute('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1::uuid', [stored.tokenId]);
  await issueSession(res, stored, { ip: req.ip, userAgent: req.headers['user-agent'] });

  res.json({
    accessToken: signAccessToken(stored.id, stored.role),
    user: toAuthUser(stored),
  });
});

router.post('/logout', async (req, res) => {
  const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  if (raw) {
    await execute(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [hashToken(raw)],
    );
  }
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});

router.get('/me', authenticate, async (req, res) => {
  const user = await one<UserRow>(
    `${USER_SELECT} WHERE u.id = $1::uuid AND u.deleted_at IS NULL`,
    [req.auth!.id],
  );
  if (!user) throw new AppError(401, 'Хэрэглэгч олдсонгүй', 'NO_USER');
  res.json({ user: toAuthUser(user) });
});

export default router;
