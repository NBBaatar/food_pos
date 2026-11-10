import { integrity } from '../modules/reports/service';

const INTERVAL_MS = 6 * 60 * 60 * 1000;

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
    return;
  }
  console.log(`[reconcile] ok — ${report.mealRecords} бүртгэл, зөрүүгүй`);
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
