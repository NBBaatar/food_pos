import { describe, expect, it } from 'vitest';
import { LOGIN_LOCK_MS, MAX_FAILED_LOGINS, isLocked, onFailedLogin } from '../src/lib/loginLock';

describe('login lockout', () => {
  const now = new Date('2026-11-13T10:00:00.000Z');

  it('хязгаар хүртэл тоог нэмнэ, түгжихгүй', () => {
    let state = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_LOGINS; i += 1) {
      state = onFailedLogin(state.failedLoginAttempts, now);
      expect(state.failedLoginAttempts).toBe(i);
      expect(state.lockedUntil).toBeNull();
    }
  });

  it('5 дахь буруу оролдлогод 15 минут түгжинэ', () => {
    const state = onFailedLogin(MAX_FAILED_LOGINS - 1, now);
    expect(state.failedLoginAttempts).toBe(0);
    expect(state.lockedUntil?.toISOString()).toBe(new Date(now.getTime() + LOGIN_LOCK_MS).toISOString());
    expect(isLocked(state.lockedUntil, now)).toBe(true);
  });

  it('түгжээний хугацаа дууссаны дараа чөлөөлнө', () => {
    const lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MS);
    expect(isLocked(lockedUntil, new Date(lockedUntil.getTime() + 1))).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});
