import { Router } from 'express';
import ExcelJS from 'exceljs';
import { reportQuerySchema, type ReportQuery } from '@shared/schemas';
import {
  DECISION_LABELS,
  PERIOD_FULL_LABELS,
  PERIOD_LABELS,
  PERIOD_CODES,
  type Grouping,
  type ScanDecision,
} from '@shared/meal';
import type { PeriodBreakdown } from '@shared/types';
import { PERMISSIONS } from '@shared/permissions';
import { env } from '../../config/env';
import { one, query } from '../../db/pool';
import { addDaysIso, businessDateFor } from '../../lib/time';
import { AppError } from '../../lib/errors';
import { parseQuery } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import {
  attendance,
  byDepartment,
  byLocation,
  DETAILED_SCAN_LIMIT,
  detailed,
  detailedByLocation,
  detailedScans,
  integrity,
  mealCounts,
  summary,
  type ReportFilters,
} from './service';

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
    companyId: query.companyId,
    search: query.search,
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

const emptyBreakdown = (): PeriodBreakdown => ({ BREAKFAST: 0, LUNCH: 0, DINNER: 0, NIGHT: 0, total: 0 });

/**
 * Ажилтан/компани/хэлтэс/байршил/хоол/огноогоор шүүсэн дэлгэрэнгүй тайлан:
 * хүлээн авсан хоол, уншилтын оролдлого, хоол авсан өдөр, эхний/сүүлийн уншилт.
 */
router.get('/detailed', requirePermission(PERMISSIONS.REPORT_READ), async (req, res) => {
  const input = parseQuery(reportQuerySchema, req);
  const filters = toFilters(input);
  const [rows, byLocationRows] = await Promise.all([detailed(filters), detailedByLocation(filters)]);

  const totals = rows.reduce(
    (acc, row) => {
      for (const code of PERIOD_CODES) {
        acc.accepted[code] += row.accepted[code];
        acc.attempts[code] += row.attempts[code];
      }
      acc.accepted.total += row.accepted.total;
      acc.attempts.total += row.attempts.total;
      return acc;
    },
    { users: rows.filter((row) => row.accepted.total > 0 || row.attempts.total > 0).length, accepted: emptyBreakdown(), attempts: emptyBreakdown() },
  );

  res.json({ ...filters, rows, totals, byLocation: byLocationRows });
});

async function nameById(table: 'companies' | 'departments' | 'locations', id?: string): Promise<string | null> {
  if (!id) return null;
  const row = await one<{ name: string }>(`SELECT name FROM ${table} WHERE id = $1::uuid`, [id]);
  return row?.name ?? null;
}

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 30;
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: env.APP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: env.APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Дэлгэрэнгүй тайлангийн Excel: шүүлт, ажилтнууд, бүх уншилтын оролдлого */
router.get('/export-detailed', requirePermission(PERMISSIONS.REPORT_EXPORT), async (req, res) => {
  const input = parseQuery(reportQuerySchema, req);
  const filters = toFilters(input);

  const [rows, scans, byLocationRows, companyName, departmentName, locationName] = await Promise.all([
    detailed(filters),
    detailedScans(filters),
    detailedByLocation(filters),
    nameById('companies', filters.companyId),
    nameById('departments', filters.departmentId),
    nameById('locations', filters.locationId),
  ]);
  const scanTotal = scans[0]?.totalCount ?? scans.length;
  const scansTruncated = scanTotal > scans.length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Food POS';
  workbook.created = new Date();

  const filterSheet = workbook.addWorksheet('Шүүлт');
  filterSheet.columns = [
    { header: 'Параметр', key: 'label', width: 28 },
    { header: 'Утга', key: 'value', width: 52 },
  ];
  filterSheet.addRows([
    { label: 'Эхлэх огноо', value: filters.from },
    { label: 'Дуусах огноо', value: filters.to },
    { label: 'Туслан гүйцэтгэгч', value: companyName ?? 'Бүгд' },
    { label: 'Хэлтэс', value: departmentName ?? 'Бүгд' },
    { label: 'Байршил', value: locationName ?? 'Бүгд' },
    { label: 'Хоол', value: filters.period ? PERIOD_LABELS[filters.period as keyof typeof PERIOD_LABELS] : 'Бүх хоол' },
    { label: 'Хайлт (нэр/код/карт)', value: filters.search ?? '—' },
    { label: 'Цуцлагдсаныг тооцсон', value: filters.includeVoided ? 'Тийм' : 'Үгүй' },
    { label: 'Нийт ажилтан (мөр)', value: String(rows.length) },
    { label: 'Нийт уншилт (мөр)', value: String(scanTotal) },
    ...(scansTruncated
      ? [
          {
            label: 'Анхааруулга',
            value: `Уншилтийн жагсаалт нэг хуудаст багтах дээд хязгаар (${DETAILED_SCAN_LIMIT}) хүрсэн тул эхний ${scans.length} мөр экспортлогдлоо.`,
          },
        ]
      : []),
  ]);
  styleHeader(filterSheet);

  const people = workbook.addWorksheet('Ажилтнууд', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  people.columns = [
    { header: 'Ажилтны код', key: 'employeeNo', width: 16 },
    { header: 'Ажилтны нэр', key: 'userName', width: 26 },
    { header: 'Туслан гүйцэтгэгч', key: 'companyName', width: 26 },
    { header: 'Хэлтэс', key: 'departmentName', width: 22 },
    { header: 'Нэгж', key: 'unit', width: 20 },
    { header: 'Албан тушаал', key: 'position', width: 20 },
    { header: `${PERIOD_FULL_LABELS.BREAKFAST} (хүлээн авсан)`, key: 'accBreakfast', width: 14 },
    { header: `${PERIOD_FULL_LABELS.LUNCH} (хүлээн авсан)`, key: 'accLunch', width: 14 },
    { header: `${PERIOD_FULL_LABELS.DINNER} (хүлээн авсан)`, key: 'accDinner', width: 14 },
    { header: `${PERIOD_FULL_LABELS.NIGHT} (хүлээн авсан)`, key: 'accNight', width: 14 },
    { header: 'Нийт хүлээн авсан', key: 'accTotal', width: 16 },
    { header: 'Өглөө (оролдлого)', key: 'attBreakfast', width: 14 },
    { header: 'Өдөр (оролдлого)', key: 'attLunch', width: 14 },
    { header: 'Орой (оролдлого)', key: 'attDinner', width: 14 },
    { header: 'Шөнө (оролдлого)', key: 'attNight', width: 14 },
    { header: 'Нийт оролдлого', key: 'attTotal', width: 16 },
    { header: 'Хоол авсан өдөр', key: 'mealDays', width: 14 },
    { header: 'Эхний уншилт', key: 'firstScanAt', width: 22 },
    { header: 'Сүүлийн уншилт', key: 'lastScanAt', width: 22 },
  ];
  people.addRows(
    rows.map((row) => ({
      employeeNo: row.employeeNo,
      userName: row.userName,
      companyName: row.companyName ?? '—',
      departmentName: row.departmentName ?? '—',
      unit: row.unit ?? '—',
      position: row.position ?? '—',
      accBreakfast: row.accepted.BREAKFAST,
      accLunch: row.accepted.LUNCH,
      accDinner: row.accepted.DINNER,
      accNight: row.accepted.NIGHT,
      accTotal: row.accepted.total,
      attBreakfast: row.attempts.BREAKFAST,
      attLunch: row.attempts.LUNCH,
      attDinner: row.attempts.DINNER,
      attNight: row.attempts.NIGHT,
      attTotal: row.attempts.total,
      mealDays: row.mealDays,
      firstScanAt: row.firstScanAt ? dateTimeFormatter.format(new Date(row.firstScanAt)) : '—',
      lastScanAt: row.lastScanAt ? dateTimeFormatter.format(new Date(row.lastScanAt)) : '—',
    })),
  );
  styleHeader(people);
  people.autoFilter = 'A1:S1';
  people.eachRow((row, index) => {
    if (index === 1) return;
    row.alignment = { vertical: 'middle' };
    row.eachCell((cell, col) => {
      if (col >= 7 && col <= 17) cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
  });

  const locationSheet = workbook.addWorksheet('Байршил', { views: [{ state: 'frozen', ySplit: 1 }] });
  locationSheet.columns = [
    { header: 'Байршил', key: 'locationName', width: 26 },
    { header: `${PERIOD_FULL_LABELS.BREAKFAST} (хүлээн авсан)`, key: 'accBreakfast', width: 14 },
    { header: `${PERIOD_FULL_LABELS.LUNCH} (хүлээн авсан)`, key: 'accLunch', width: 14 },
    { header: `${PERIOD_FULL_LABELS.DINNER} (хүлээн авсан)`, key: 'accDinner', width: 14 },
    { header: `${PERIOD_FULL_LABELS.NIGHT} (хүлээн авсан)`, key: 'accNight', width: 14 },
    { header: 'Нийт хүлээн авсан', key: 'accTotal', width: 16 },
    { header: 'Өглөө (оролдлого)', key: 'attBreakfast', width: 14 },
    { header: 'Өдөр (оролдлого)', key: 'attLunch', width: 14 },
    { header: 'Орой (оролдлого)', key: 'attDinner', width: 14 },
    { header: 'Шөнө (оролдлого)', key: 'attNight', width: 14 },
    { header: 'Нийт оролдлого', key: 'attTotal', width: 16 },
  ];
  locationSheet.addRows(
    byLocationRows.map((row) => ({
      locationName: row.locationName,
      accBreakfast: row.accepted.BREAKFAST,
      accLunch: row.accepted.LUNCH,
      accDinner: row.accepted.DINNER,
      accNight: row.accepted.NIGHT,
      accTotal: row.accepted.total,
      attBreakfast: row.attempts.BREAKFAST,
      attLunch: row.attempts.LUNCH,
      attDinner: row.attempts.DINNER,
      attNight: row.attempts.NIGHT,
      attTotal: row.attempts.total,
    })),
  );
  styleHeader(locationSheet);
  locationSheet.autoFilter = 'A1:K1';
  locationSheet.eachRow((row, index) => {
    if (index === 1) return;
    row.eachCell((cell, col) => {
      if (col >= 2) cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
  });

  const scanSheet = workbook.addWorksheet('Уншилтууд', { views: [{ state: 'frozen', ySplit: 1 }] });
  scanSheet.columns = [
    { header: 'Огноо', key: 'businessDate', width: 13 },
    { header: 'Цаг', key: 'time', width: 11 },
    { header: 'Ажилтны код', key: 'employeeNo', width: 16 },
    { header: 'Ажилтны нэр', key: 'userName', width: 26 },
    { header: 'Туслан гүйцэтгэгч', key: 'companyName', width: 26 },
    { header: 'Хэлтэс', key: 'departmentName', width: 22 },
    { header: 'Хоол', key: 'periodCode', width: 14 },
    { header: 'Картын UID', key: 'cardUid', width: 20 },
    { header: 'Шийдвэр', key: 'decision', width: 22 },
    { header: 'Шалтгаан', key: 'reason', width: 30 },
    { header: 'Байршил', key: 'locationName', width: 24 },
    { header: 'Цуцлагдсан', key: 'voided', width: 12 },
  ];
  scanSheet.addRows(
    scans.map((scan) => ({
      businessDate: scan.businessDate,
      time: timeFormatter.format(scan.scannedAt),
      employeeNo: scan.employeeNo ?? '—',
      userName: scan.userName ?? '—',
      companyName: scan.companyName ?? '—',
      departmentName: scan.departmentName ?? '—',
      periodCode: scan.periodCode ? PERIOD_LABELS[scan.periodCode as keyof typeof PERIOD_LABELS] : '—',
      cardUid: scan.cardUid,
      decision: DECISION_LABELS[scan.decision as ScanDecision] ?? scan.decision,
      reason: scan.reason ?? '',
      locationName: scan.locationName ?? '—',
      voided: scan.voidedAt ? 'Тийм' : '',
    })),
  );
  styleHeader(scanSheet);
  scanSheet.autoFilter = 'A1:L1';

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `detailed-report-${filters.from}_${filters.to}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

export default router;
