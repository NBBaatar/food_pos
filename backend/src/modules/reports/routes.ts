import { Router } from 'express';
import ExcelJS from 'exceljs';
import { reportQuerySchema, type ReportQuery } from '@shared/schemas';
import { PERIOD_FULL_LABELS, PERIOD_CODES, type Grouping } from '@shared/meal';
import { PERMISSIONS } from '@shared/permissions';
import { env } from '../../config/env';
import { query } from '../../db/pool';
import { addDaysIso, businessDateFor } from '../../lib/time';
import { AppError } from '../../lib/errors';
import { parseQuery } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { attendance, byDepartment, byLocation, integrity, mealCounts, summary, type ReportFilters } from './service';

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
    locationId: query.locationId,
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

router.get('/by-location', requirePermission(PERMISSIONS.REPORT_READ), async (req, res) => {
  const query = parseQuery(reportQuerySchema, req);
  const filters = toFilters(query);
  res.json({ ...filters, rows: await byLocation(filters) });
});

router.get('/integrity', requirePermission(PERMISSIONS.REPORT_READ), async (_req, res) => {
  res.json(await integrity());
});

/** Dashboard: өнөөдрийн байдал + 7 хоногийн чиг хандлага */
router.get('/today', requirePermission(PERMISSIONS.REPORT_READ), async (_req, res) => {
  const today = businessToday();
  const [rows, trend, periods, totals] = await Promise.all([
    query<{ code: string; count: number }>(
      `
      SELECT p.code::text AS code, COUNT(m.id)::int AS count
      FROM meal_records m
      JOIN meal_periods p ON p.id = m.period_id
      WHERE m.business_date = $1::date AND m.voided_at IS NULL
      GROUP BY p.code
      `,
      [today],
    ),
    mealCounts('day', { from: addDaysIso(today, -6), to: today }),
    query<{
      code: string;
      name: string;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
      isActive: boolean;
    }>(
      `SELECT code, name, start_time AS "startTime", end_time AS "endTime",
              crosses_midnight AS "crossesMidnight", is_active AS "isActive"
         FROM meal_periods ORDER BY sort_order ASC`,
    ),
    query<{ total: number; holders: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS holders
         FROM meal_records WHERE business_date = $1::date AND voided_at IS NULL`,
      [today],
    ),
  ]);

  const todayCounts = Object.fromEntries(PERIOD_CODES.map((code) => [code, 0])) as Record<string, number>;
  for (const row of rows) todayCounts[row.code] = row.count;

  res.json({
    businessDate: today,
    total: totals[0]?.total ?? 0,
    holders: totals[0]?.holders ?? 0,
    byPeriod: todayCounts,
    periods,
    trend,
  });
});

/** Excel (.xlsx) экспорт */
router.get('/export', requirePermission(PERMISSIONS.REPORT_EXPORT), async (req, res) => {
  const query = parseQuery(reportQuerySchema, req);
  const filters = toFilters(query);
  const rows = await mealCounts(query.groupBy, filters);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Food POS';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Тайлан', { views: [{ state: 'frozen', ySplit: 1 }] });

  sheet.columns = [
    { header: 'Огноо', key: 'bucket', width: 18 },
    { header: PERIOD_FULL_LABELS.BREAKFAST, key: 'BREAKFAST', width: 16 },
    { header: PERIOD_FULL_LABELS.LUNCH, key: 'LUNCH', width: 16 },
    { header: PERIOD_FULL_LABELS.DINNER, key: 'DINNER', width: 16 },
    { header: PERIOD_FULL_LABELS.NIGHT, key: 'NIGHT', width: 16 },
    { header: 'Нийт', key: 'total', width: 14 },
    { header: 'Хэрэглэгч', key: 'uniqueUsers', width: 14 },
  ];

  sheet.addRows(
    rows.map((row) => ({
      bucket: row.bucket,
      BREAKFAST: row.BREAKFAST,
      LUNCH: row.LUNCH,
      DINNER: row.DINNER,
      NIGHT: row.NIGHT,
      total: row.total,
      uniqueUsers: row.uniqueUsers,
    })),
  );

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
  const total = sheet.addRow({
    bucket: 'НИЙТ',
    BREAKFAST: totalRow.BREAKFAST,
    LUNCH: totalRow.LUNCH,
    DINNER: totalRow.DINNER,
    NIGHT: totalRow.NIGHT,
    total: totalRow.total,
    uniqueUsers: '',
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.height = 24;
  total.font = { bold: true };
  total.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  sheet.autoFilter = 'A1:G1';
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'middle' };
    row.eachCell((cell, index) => {
      if (index > 1) cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `meal-report-${filters.from}_${filters.to}-${query.groupBy as Grouping}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

export default router;
