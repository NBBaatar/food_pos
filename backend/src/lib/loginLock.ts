/** Нэвтрэх оролдлогын түгжээ — 5 удаа буруу оролдвол 15 минут түгжинэ */

export const MAX_FAILED_LOGINS = 5;
export const LOGIN_LOCK_MS = 15 * 60_000;

export interface FailedLoginState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/** Түгжээ одоо ч хүчинтэй эсэх */
export function isLocked(lockedUntil: Date | null, now: Date = new Date()): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * Дараагийн бүртгэлийн төлөв. Хязгаарт хүрвэл түгжиж, тоог тэглэнэ
 * (түгжээ дууссаны дараа шинэ 5 оролдлого).
 */
export function onFailedLogin(previousAttempts: number, now: Date = new Date()): FailedLoginState {
  const attempts = previousAttempts + 1;
  if (attempts >= MAX_FAILED_LOGINS) {
    return { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS) };
  }
  return { failedLoginAttempts: attempts, lockedUntil: null };
}
