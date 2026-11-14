import { Router } from 'express';
import type { Response } from 'express';
import { loginSchema, updateProfileSchema } from '@shared/schemas';
import { isProd } from '../../config/env';
import { execute, one } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { toAuthUser, type UserRow } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { isLocked, onFailedLogin } from '../../lib/loginLock';
import { hashPassword, verifyPassword } from '../../lib/password';
import { permissionsForUser } from '../../lib/permissions';
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
         u.email, u.phone, u.role, u.status, u.can_login AS "canLogin", u.department_id AS "departmentId",
         d.name AS "departmentName", u.unit, u.position, u.photo_url AS "photoUrl",
         u.must_change_password AS "mustChangePassword",
         NULL::text AS "cardUid", NULL::text AS "cardStatus",
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
  const user = await one<
    UserRow & { passwordHash: string; failedLoginAttempts: number; lockedUntil: Date | null }
  >(
    `SELECT u.id, u.employee_no AS "employeeNo", u.first_name AS "firstName", u.last_name AS "lastName",
            u.email, u.phone, u.role, u.status, u.can_login AS "canLogin", u.department_id AS "departmentId",
            d.name AS "departmentName", u.unit, u.position, u.photo_url AS "photoUrl",
            u.must_change_password AS "mustChangePassword",
            NULL::text AS "cardUid", NULL::text AS "cardStatus",
            u.created_at AS "createdAt", u.password_hash AS "passwordHash",
            u.failed_login_attempts AS "failedLoginAttempts", u.locked_until AS "lockedUntil"
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
    [email.toLowerCase()],
  );

  // Түгжигдсэн бол нууц үгийг шалгахгүй
  if (user && isLocked(user.lockedUntil)) {
    throw new AppError(
      429,
      'Хэт олон буруу оролдлогын улмаас түр түгжигдлээ. 15 минутын дараа дахин оролдоно уу.',
      'ACCOUNT_LOCKED',
    );
  }

  if (!user) {
    // И-мэйл байхгүй үед ч ижил зарцуулалттай scrypt хийж, хэрэглэгчийг
    // цаг хугацаагаар таних (timing) боломжийг хаана
    await hashPassword(password);
    throw new AppError(401, 'И-мэйл эсвэл нууц үг буруу', 'BAD_CREDENTIALS');
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const state = onFailedLogin(user.failedLoginAttempts);
    await execute(
      `UPDATE users
          SET failed_login_attempts = $2, locked_until = $3, updated_at = now()
        WHERE id = $1::uuid`,
      [user.id, state.failedLoginAttempts, state.lockedUntil],
    );
    await writeAudit({
      actorId: user.id,
      action: 'auth.login_failed',
      entity: 'user',
      entityId: user.id,
      after: { failedLoginAttempts: state.failedLoginAttempts, locked: state.lockedUntil !== null },
      req,
    });
    throw new AppError(401, 'И-мэйл эсвэл нууц үг буруу', 'BAD_CREDENTIALS');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, 'Хэрэглэгч идэвхгүй байна. Админтай холбогдоно уу.', 'INACTIVE');
  }
  if (!user.canLogin) {
    throw new AppError(403, 'Энэ хэрэглэгч системд нэвтрэх эрхгүй байна.', 'NO_LOGIN_ACCESS');
  }

  await execute(
    `UPDATE users
        SET last_login_at = now(), failed_login_attempts = 0, locked_until = NULL
      WHERE id = $1::uuid`,
    [user.id],
  );
  await issueSession(res, user, { ip: req.ip, userAgent: req.headers['user-agent'] });
  await writeAudit({ actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, req });

  res.json({
    accessToken: signAccessToken(user.id, user.role),
    user: toAuthUser(user, await permissionsForUser(user.id, user.role)),
  });
});

router.post('/refresh', async (req, res) => {
  const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  if (!raw) throw new AppError(401, 'Сессийн токен олдсонгүй', 'NO_REFRESH');

  const stored = await one<UserRow & { tokenId: string; revokedAt: Date | null; expiresAt: Date }>(
    `SELECT u.id, u.employee_no AS "employeeNo", u.first_name AS "firstName", u.last_name AS "lastName",
            u.email, u.phone, u.role, u.status, u.can_login AS "canLogin", u.department_id AS "departmentId",
            d.name AS "departmentName", u.unit, u.position, u.photo_url AS "photoUrl",
            u.must_change_password AS "mustChangePassword",
            NULL::text AS "cardUid", NULL::text AS "cardStatus",
            u.created_at AS "createdAt",
            rt.id AS "tokenId", rt.revoked_at AS "revokedAt", rt.expires_at AS "expiresAt"
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       LEFT JOIN departments d ON d.id = u.department_id
      WHERE rt.token_hash = $1`,
    [hashToken(raw)],
  );

  if (!stored) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw new AppError(401, 'Сессийн хугацаа дууссан. Дахин нэвтэрнэ үү.', 'REFRESH_EXPIRED');
  }
  if (stored.revokedAt) {
    // Хэд хэдэн tab зэрэг refresh хийхэд нэг нь хуучин токеныг эргүүлж, нөгөө нь
    // 401 авдаг. Энэ үед cookie-г устгавал эхний tab-ийн олгосон ШИНЭ токен
    // устаж бүх tab гарч ирнэ — тиймээс зөвхөн 401 буцааж, cookie-г үлдээнэ.
    throw new AppError(401, 'Сессийн токен хүчингүй болсон байна', 'REFRESH_REVOKED');
  }
  if (stored.expiresAt.getTime() < Date.now()) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw new AppError(401, 'Сессийн хугацаа дууссан. Дахин нэвтэрнэ үү.', 'REFRESH_EXPIRED');
  }
  if (stored.status !== 'ACTIVE') {
    throw new AppError(403, 'Хэрэглэгч идэвхгүй байна', 'INACTIVE');
  }
  if (!stored.canLogin) {
    throw new AppError(403, 'Энэ хэрэглэгч системд нэвтрэх эрхгүй байна', 'NO_LOGIN_ACCESS');
  }

  // Rotation: хуучин токеныг хүчингүй болгоно
  await execute('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1::uuid', [stored.tokenId]);
  await issueSession(res, stored, { ip: req.ip, userAgent: req.headers['user-agent'] });

  res.json({
    accessToken: signAccessToken(stored.id, stored.role),
    user: toAuthUser(stored, await permissionsForUser(stored.id, stored.role)),
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

router.patch('/profile', authenticate, async (req, res) => {
  const input = parseBody(updateProfileSchema, req);
  const current = await one<{ passwordHash: string }>(
    'SELECT password_hash AS "passwordHash" FROM users WHERE id = $1::uuid AND deleted_at IS NULL',
    [req.auth!.id],
  );
  if (!current) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

  if (input.newPassword) {
    const valid = await verifyPassword(input.currentPassword ?? '', current.passwordHash);
    if (!valid) throw new AppError(400, 'Одоогийн нууц үг буруу байна', 'BAD_CURRENT_PASSWORD');
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.firstName !== undefined) {
    values.push(input.firstName);
    sets.push(`first_name = $${values.length}`);
  }
  if (input.lastName !== undefined) {
    values.push(input.lastName);
    sets.push(`last_name = $${values.length}`);
  }
  if (input.phone !== undefined) {
    values.push(input.phone || null);
    sets.push(`phone = $${values.length}`);
  }
  if (input.unit !== undefined) {
    if (input.unit) await execute('INSERT INTO units (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [input.unit]);
    values.push(input.unit || null);
    sets.push(`unit = $${values.length}`);
  }
  if (input.position !== undefined) {
    if (input.position) {
      await execute('INSERT INTO positions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [input.position]);
    }
    values.push(input.position || null);
    sets.push(`position = $${values.length}`);
  }
  if (input.photoUrl !== undefined) {
    values.push(input.photoUrl || null);
    sets.push(`photo_url = $${values.length}`);
  }
  if (input.newPassword) {
    values.push(await hashPassword(input.newPassword));
    sets.push(`password_hash = $${values.length}`);
    sets.push('must_change_password = false');
  }
  if (sets.length === 0) throw new AppError(400, 'Өөрчлөх талбар байхгүй', 'NO_CHANGES');

  values.push(req.auth!.id);
  await execute(
    `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}::uuid`,
    values,
  );

  const updated = await one<UserRow>(
    `${USER_SELECT} WHERE u.id = $1::uuid AND u.deleted_at IS NULL`,
    [req.auth!.id],
  );
  if (!updated) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

  if (input.newPassword) {
    // Нууц үг солигдсон тул бусад төхөөрөмжийн сессийг хааж, энэ төхөөрөмжид шинэ токен олгоно
    await execute('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL', [
      req.auth!.id,
    ]);
    await issueSession(res, updated, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  await writeAudit({
    actorId: req.auth!.id,
    action: 'profile.update',
    entity: 'user',
    entityId: req.auth!.id,
    after: {
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
      unit: updated.unit,
      position: updated.position,
      photoChanged: input.photoUrl !== undefined,
      passwordChanged: Boolean(input.newPassword),
    },
    req,
  });

  res.json({ user: toAuthUser(updated, await permissionsForUser(updated.id, updated.role)) });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await one<UserRow>(
    `${USER_SELECT} WHERE u.id = $1::uuid AND u.deleted_at IS NULL`,
    [req.auth!.id],
  );
  if (!user) throw new AppError(401, 'Хэрэглэгч олдсонгүй', 'NO_USER');
  res.json({ user: toAuthUser(user, req.auth!.permissions) });
});

export default router;
