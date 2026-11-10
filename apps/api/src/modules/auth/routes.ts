import { Router } from 'express';
import type { Response } from 'express';
import { loginSchema } from '@shared/schemas';
import { isProd } from '../../config/env';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { toAuthUser } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { verifyPassword } from '../../lib/password';
import { createRefreshToken, hashToken, signAccessToken, verifyAccessToken } from '../../lib/tokens';
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

async function issueSession(
  res: Response,
  user: { id: string; role: 'ADMIN' | 'MANAGER' | 'USER' },
  meta: { ip?: string; userAgent?: string },
): Promise<void> {
  const refresh = createRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  res.cookie(REFRESH_COOKIE, refresh.token, { ...cookieOptions, expires: refresh.expiresAt });
}

router.post('/login', async (req, res) => {
  const { email, password } = parseBody(loginSchema, req);
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    include: { department: true },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'И-мэйл эсвэл нууц үг буруу', 'BAD_CREDENTIALS');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, 'Хэрэглэгч идэвхгүй байна. Админтай холбогдоно уу.', 'INACTIVE');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
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

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { include: { department: true } } },
  });

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw new AppError(401, 'Сессийн хугацаа дууссан. Дахин нэвтэрнэ үү.', 'REFRESH_EXPIRED');
  }
  if (stored.user.status !== 'ACTIVE') {
    throw new AppError(403, 'Хэрэглэгч идэвхгүй байна', 'INACTIVE');
  }

  // Rotation: хуучин токеныг хүчингүй болгоно
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  await issueSession(res, stored.user, { ip: req.ip, userAgent: req.headers['user-agent'] });

  res.json({
    accessToken: signAccessToken(stored.user.id, stored.user.role),
    user: toAuthUser(stored.user),
  });
});

router.post('/logout', async (req, res) => {
  const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.auth!.id, deletedAt: null },
    include: { department: true },
  });
  if (!user) throw new AppError(401, 'Хэрэглэгч олдсонгүй', 'NO_USER');
  res.json({ user: toAuthUser(user) });
});

/** Токен хүчинтэй эсэхийг шалгах туслах (web boot дээр ашиглана) */
router.get('/verify', async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = token ? verifyAccessToken(token) : null;
  res.json({ valid: Boolean(payload) });
});

export default router;
