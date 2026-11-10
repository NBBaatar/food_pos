import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '@shared/permissions';

export interface AccessPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(userId: string, role: Role): string {
  const options: SignOptions = { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || !payload.sub) return null;
    return { sub: String(payload.sub), role: payload.role as Role };
  } catch {
    return null;
  }
}

export function createRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  return { token, hash: hashToken(token), expiresAt };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createApiKey(): { key: string; hash: string } {
  const key = `fp_${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashToken(key) };
}
