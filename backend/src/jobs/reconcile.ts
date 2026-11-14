import { execute } from '../db/pool';
import { integrity } from '../modules/reports/service';

const INTERVAL_MS = 6 * 60 * 60 * 1000;
const TOKEN_RETENTION_MS = 7 * 86_400_000;

/**
 * Тайлангийн нарийвчлалын хяналт: хүлээн авсан уншилт бүр meal_record-той
 * тохирч байх ёстой. Зөрүү гарвал лог руу анхааруулга бичнэ.
 */
export async function reconcileOnce(): Promise<void> {
  const report = await integrity();
  const problems = report.missingRecords + report.orphanRecords;
  if (problems > 0) {
    console.warn(
      `[reconcile] Зөрүү илэрлээ — scan=${report.scanAccepted}, meal=${report.mealRecords}, ` +
        `дутуу=${report.missingRecords}, илүү=${report.orphanRecords}`,
    );
  } else {
    console.log(`[reconcile] ok — ${report.mealRecords} бүртгэл, зөрүүгүй`);
  }

  // Хугацаа дууссан/хүчингүй болсон refresh токенуудыг цэвэрлэнэ
  const cutoff = new Date(Date.now() - TOKEN_RETENTION_MS);
  const removed = await execute(
    `DELETE FROM refresh_tokens
      WHERE (expires_at < $1 AND revoked_at IS NULL) OR revoked_at < $1`,
    [cutoff],
  );
  if (removed > 0) {
    console.log(`[reconcile] хуучин refresh token ${removed} устгалаа`);
  }
}

export function startScheduler(): () => void {
  const run = (): void => {
    void reconcileOnce().catch((error) => console.error('[reconcile] алдаа:', error));
  };
  run();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
