import { Router } from 'express';
import { reportQuerySchema, type ReportQuery } from '@shared/schemas';
import { PERIOD_FULL_LABELS, PERIOD_CODES, type Grouping } from '@shared/meal';
import { PERMISSIONS } from '@shared/permissions';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { addDaysIso, businessDateFor } from '../../lib/time';
import { AppError } from '../../lib/errors';
import { parseQuery } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { attendance, byDepartment, integrity, mealCounts, summary, type ReportFilters } from './service';

const router = Router();
router.use(authenticate);

const businessToday = (): string => businessDateFor(new Date(), env.DAY_START_HOUR, env.APP_TIMEZONE);

function toFilters(query: ReportQuery): ReportFilters {
  const to = query.to ?? businessToday();
  const from = query.from ?? addDaysIso(to, -29);
  if (from > to) {
    throw new AppError(400, 'Эхлэх огноо дуусах огнооноос хойш байж болохгүй', 'BAD_RANGE');
  }
  return {
    from,
    to,
    period: query.period,
    userId: query.userId,
    departmentId: query.departmentId,
    includeVoided: query.includeVoided === 'true',
  };
}

router.get('/meal-counts', requirePermission(PERMISSIONS.REPORT_READ), async (req, res) => {
  const query = parseQuery(reportQuerySchema, req);
  const filters = toFilters(query);
  const rows = await mealCounts(query.groupBy, filters);
  const totals = rows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      BREAKFAST: acc.BREAKFAST + row.BREAKFAST,
      LUNCH: acc.LUNCH + row.LUNCH,
      DINNER: acc.DINNER + row.DINNER,
      NIGHT: acc.NIGHT + row.NIGHT,
    }),
    { total: 0, BREAKFAST: 0, LUNCH: 0, DINNER: 0, NIGHT: 0 },
  );
  res.json({ groupBy: query.groupBy, ...filters, rows, totals });
});

router.get('/summary', requirePermission(PERMISSIONS.REPORT_READ), async (req, res) => {
  const query = parseQuery(reportQuerySchema, req);
  res.json(await summary(toFilters(query)));
});

router.get('/attendance', requirePermission(PERMISSIONS.REPORT_READ), async (req, res) => {
  const query = parseQuery(reportQuerySchema, req);
  const filters = toFilters(query);
  res.json({ ...filters, rows: await attendance(filters) });
});

router.get('/by-department', requirePermission(PERMISSIONS.REPORT_READ), async (req, res) => {
  const query = parseQuery(reportQuerySchema, req);
  const filters = toFilters(query);
  res.json({ ...filters, rows: await byDepartment(filters) });
});

router.get('/integrity', requirePermission(PERMISSIONS.REPORT_READ), async (_req, res) => {
  res.json(await integrity());
});

/** Dashboard: өнөөдрийн байдал + 7 хоногийн чиг хандлага */
router.get('/today', requirePermission(PERMISSIONS.REPORT_READ), async (_req, res) => {
  const today = businessToday();
  const [rows, trend, periods, totals] = await Promise.all([
    prisma.$queryRawUnsafe<{ code: string; count: number }[]>(
      `
      SELECT p.code::text AS code, COUNT(m.id)::int AS count
      FROM meal_records m
      JOIN meal_periods p ON p.id = m.period_id
      WHERE m.business_date = $1::date AND m.voided_at IS NULL
      GROUP BY p.code
      `,
      today,
    ),
    mealCounts('day', { from: addDaysIso(today, -6), to: today }),
    prisma.mealPeriod.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.$queryRawUnsafe<{ total: number; holders: number }[]>(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS holders
         FROM meal_records WHERE business_date = $1::date AND voided_at IS NULL`,
      today,
    ),
  ]);

  const todayCounts = Object.fromEntries(PERIOD_CODES.map((code) => [code, 0])) as Record<string, number>;
  for (const row of rows) todayCounts[row.code] = row.count;

  res.json({
    businessDate: today,
    total: totals[0]?.total ?? 0,
    holders: totals[0]?.holders ?? 0,
    byPeriod: todayCounts,
    periods: periods.map((p) => ({
      code: p.code,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      crossesMidnight: p.crossesMidnight,
      isActive: p.isActive,
    })),
    trend,
  });
});

/** CSV экспорт (Excel-т зориулж BOM-той) */
router.get('/export', requirePermission(PERMISSIONS.REPORT_EXPORT), async (req, res) => {
  const query = parseQuery(reportQuerySchema, req);
  const filters = toFilters(query);
  const rows = await mealCounts(query.groupBy, filters);

  const header = ['Огноо', PERIOD_FULL_LABELS.BREAKFAST, PERIOD_FULL_LABELS.LUNCH, PERIOD_FULL_LABELS.DINNER, PERIOD_FULL_LABELS.NIGHT, 'Нийт', 'Хэрэглэгч'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([row.bucket, row.BREAKFAST, row.LUNCH, row.DINNER, row.NIGHT, row.total, row.uniqueUsers].join(','));
  }
  const totalRow = rows.reduce(
    (acc, row) => ({
      BREAKFAST: acc.BREAKFAST + row.BREAKFAST,
      LUNCH: acc.LUNCH + row.LUNCH,
      DINNER: acc.DINNER + row.DINNER,
      NIGHT: acc.NIGHT + row.NIGHT,
      total: acc.total + row.total,
    }),
    { BREAKFAST: 0, LUNCH: 0, DINNER: 0, NIGHT: 0, total: 0 },
  );
  lines.push(['НИЙТ', totalRow.BREAKFAST, totalRow.LUNCH, totalRow.DINNER, totalRow.NIGHT, totalRow.total, ''].join(','));

  const filename = `meal-report-${filters.from}_${filters.to}-${query.groupBy as Grouping}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${lines.join('\r\n')}`);
});

export default router;
