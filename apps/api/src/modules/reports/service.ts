import type { Grouping } from '@shared/meal';
import type { AttendanceRow, DepartmentReportRow, IntegrityReport, ReportBucketRow } from '@shared/types';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { addDaysIso, businessDateFor, daysBetween } from '../../lib/time';

const TRUNC_UNIT: Record<Grouping, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

const STEP: Record<Grouping, string> = {
  day: '1 day',
  week: '1 week',
  month: '1 month',
  quarter: '3 months',
  year: '1 year',
};

export interface ReportFilters {
  from: string;
  to: string;
  period?: string;
  userId?: string;
  departmentId?: string;
  includeVoided?: boolean;
}

const filterSql = `
  AND ($6::text IS NULL OR m.period_id = (SELECT id FROM meal_periods WHERE code::text = $6::text))
  AND ($7::uuid IS NULL OR m.user_id = $7::uuid)
  AND ($8::uuid IS NULL OR m.user_id IN (SELECT id FROM users WHERE department_id = $8::uuid))
`;

/**
 * Бакет бүрийн хоолны тоо. generate_series ашигласнаар хоолгүй өдөр/сар
 * тайланд 0-ээр гарч ирнэ (алга болохгүй).
 */
export async function mealCounts(groupBy: Grouping, filters: ReportFilters): Promise<ReportBucketRow[]> {
  const sql = `
    WITH series AS (
      SELECT gs::date AS bucket
      FROM generate_series(
        date_trunc($1::text, $2::date),
        date_trunc($1::text, $3::date),
        $4::text::interval
      ) AS gs
    )
    SELECT
      to_char(s.bucket, 'YYYY-MM-DD') AS bucket,
      COUNT(m.id) FILTER (WHERE p.code = 'BREAKFAST')::int AS "BREAKFAST",
      COUNT(m.id) FILTER (WHERE p.code = 'LUNCH')::int AS "LUNCH",
      COUNT(m.id) FILTER (WHERE p.code = 'DINNER')::int AS "DINNER",
      COUNT(m.id) FILTER (WHERE p.code = 'NIGHT')::int AS "NIGHT",
      COUNT(m.id)::int AS total,
      COUNT(DISTINCT m.user_id)::int AS "uniqueUsers"
    FROM series s
    LEFT JOIN meal_records m
      ON m.business_date >= GREATEST(s.bucket, $2::date)
     AND m.business_date < LEAST(s.bucket + $4::text::interval, $3::date + 1)
     AND ($5::boolean OR m.voided_at IS NULL)
     ${filterSql}
    LEFT JOIN meal_periods p ON p.id = m.period_id
    GROUP BY s.bucket
    ORDER BY s.bucket
  `;

  return prisma.$queryRawUnsafe<ReportBucketRow[]>(
    sql,
    TRUNC_UNIT[groupBy],
    filters.from,
    filters.to,
    STEP[groupBy],
    filters.includeVoided ?? false,
    filters.period ?? null,
    filters.userId ?? null,
    filters.departmentId ?? null,
  );
}

interface TotalsRow {
  total: number;
  uniqueUsers: number;
}

async function totals(filters: ReportFilters): Promise<TotalsRow> {
  const rows = await prisma.$queryRawUnsafe<TotalsRow[]>(
    `
    SELECT COUNT(m.id)::int AS total, COUNT(DISTINCT m.user_id)::int AS "uniqueUsers"
    FROM meal_records m
    WHERE m.business_date BETWEEN $1::date AND $2::date
      AND ($3::boolean OR m.voided_at IS NULL)
      AND ($4::text IS NULL OR m.period_id = (SELECT id FROM meal_periods WHERE code::text = $4::text))
      AND ($5::uuid IS NULL OR m.user_id = $5::uuid)
      AND ($6::uuid IS NULL OR m.user_id IN (SELECT id FROM users WHERE department_id = $6::uuid))
    `,
    filters.from,
    filters.to,
    filters.includeVoided ?? false,
    filters.period ?? null,
    filters.userId ?? null,
    filters.departmentId ?? null,
  );
  return rows[0] ?? { total: 0, uniqueUsers: 0 };
}

export async function summary(filters: ReportFilters) {
  // Ирээдүйн өдрүүдийг дундажид тооцохгүй (тайлан эхлэх өдрөөс өнөөдрийг хүртэл)
  const businessToday = businessDateFor(new Date(), env.DAY_START_HOUR, env.APP_TIMEZONE);
  const cappedTo = filters.to > businessToday ? businessToday : filters.to;
  const days = Math.max(1, daysBetween(filters.from, cappedTo));
  const previousTo = addDaysIso(filters.from, -1);
  const previousFrom = addDaysIso(previousTo, -(days - 1));

  const [current, previous, byPeriodRows] = await Promise.all([
    totals(filters),
    totals({ ...filters, from: previousFrom, to: previousTo }),
    prisma.$queryRawUnsafe<{ code: string; count: number }[]>(
      `
      SELECT p.code::text AS code, COUNT(m.id)::int AS count
      FROM meal_records m
      JOIN meal_periods p ON p.id = m.period_id
      WHERE m.business_date BETWEEN $1::date AND $2::date
        AND ($3::boolean OR m.voided_at IS NULL)
        AND ($4::uuid IS NULL OR m.user_id = $4::uuid)
        AND ($5::uuid IS NULL OR m.user_id IN (SELECT id FROM users WHERE department_id = $5::uuid))
      GROUP BY p.code
      `,
      filters.from,
      filters.to,
      filters.includeVoided ?? false,
      filters.userId ?? null,
      filters.departmentId ?? null,
    ),
  ]);

  const byPeriod = { BREAKFAST: 0, LUNCH: 0, DINNER: 0, NIGHT: 0 } as Record<string, number>;
  for (const row of byPeriodRows) byPeriod[row.code] = row.count;

  const changePercent =
    previous.total > 0 ? Number((((current.total - previous.total) / previous.total) * 100).toFixed(1)) : null;

  return {
    from: filters.from,
    to: filters.to,
    days,
    total: current.total,
    uniqueUsers: current.uniqueUsers,
    byPeriod,
    avgPerDay: days > 0 ? Number((current.total / days).toFixed(1)) : 0,
    previous: { total: previous.total, from: previousFrom, to: previousTo },
    changePercent,
  };
}

export async function attendance(filters: ReportFilters): Promise<AttendanceRow[]> {
  return prisma.$queryRawUnsafe<AttendanceRow[]>(
    `
    SELECT
      u.id::text AS "userId",
      u.employee_no AS "employeeNo",
      u.last_name || ' ' || u.first_name AS "userName",
      d.name AS "departmentName",
      COUNT(m.id) FILTER (WHERE p.code = 'BREAKFAST')::int AS "BREAKFAST",
      COUNT(m.id) FILTER (WHERE p.code = 'LUNCH')::int AS "LUNCH",
      COUNT(m.id) FILTER (WHERE p.code = 'DINNER')::int AS "DINNER",
      COUNT(m.id) FILTER (WHERE p.code = 'NIGHT')::int AS "NIGHT",
      COUNT(m.id)::int AS total,
      to_char(MAX(m.business_date), 'YYYY-MM-DD') AS "lastMealDate"
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN meal_records m
      ON m.user_id = u.id
     AND m.business_date BETWEEN $1::date AND $2::date
     AND ($3::boolean OR m.voided_at IS NULL)
    LEFT JOIN meal_periods p ON p.id = m.period_id
    WHERE u.deleted_at IS NULL
      AND ($4::uuid IS NULL OR u.department_id = $4::uuid)
      AND ($5::text IS NULL OR p.code::text = $5::text)
    GROUP BY u.id, u.employee_no, u.last_name, u.first_name, d.name
    ORDER BY total DESC, u.last_name ASC
    LIMIT 1000
    `,
    filters.from,
    filters.to,
    filters.includeVoided ?? false,
    filters.departmentId ?? null,
    filters.period ?? null,
  );
}

export async function byDepartment(filters: ReportFilters): Promise<DepartmentReportRow[]> {
  return prisma.$queryRawUnsafe<DepartmentReportRow[]>(
    `
    SELECT
      d.id::text AS "departmentId",
      COALESCE(d.name, 'Хэлтэсгүй') AS "departmentName",
      COUNT(DISTINCT u.id)::int AS holders,
      COUNT(m.id)::int AS meals
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN meal_records m
      ON m.user_id = u.id
     AND m.business_date BETWEEN $1::date AND $2::date
     AND ($3::boolean OR m.voided_at IS NULL)
    WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE'
    GROUP BY d.id, d.name
    ORDER BY meals DESC
    `,
    filters.from,
    filters.to,
    filters.includeVoided ?? false,
  );
}

export async function integrity(): Promise<IntegrityReport> {
  const rows = await prisma.$queryRawUnsafe<
    Omit<IntegrityReport, 'generatedAt'>[]
  >(`
    SELECT
      (SELECT COUNT(*) FROM scan_events WHERE decision = 'ACCEPTED')::int AS "scanAccepted",
      (SELECT COUNT(*) FROM meal_records)::int AS "mealRecords",
      (SELECT COUNT(*) FROM scan_events s
         LEFT JOIN meal_records m ON m.scan_event_id = s.id
        WHERE s.decision = 'ACCEPTED' AND m.id IS NULL)::int AS "missingRecords",
      (SELECT COUNT(*) FROM meal_records m
         LEFT JOIN scan_events s ON s.id = m.scan_event_id
        WHERE s.id IS NULL)::int AS "orphanRecords",
      (SELECT COUNT(*) FROM scan_events WHERE decision = 'ALREADY_SCANNED')::int AS "duplicateAttempts",
      (SELECT COUNT(*) FROM scan_events
        WHERE abs(COALESCE(clock_skew_ms, 0)) > 300000
          AND COALESCE((raw_payload ->> 'backfill')::boolean, false) = false)::int AS "clockSkewHigh",
      (SELECT COUNT(*) FROM scan_events WHERE decision = 'UNKNOWN_CARD')::int AS "unknownCards",
      (SELECT COUNT(*) FROM scan_events WHERE decision = 'OUT_OF_WINDOW')::int AS "outOfWindow"
  `);

  return { generatedAt: new Date().toISOString(), ...(rows[0] ?? defaultIntegrity()) };
}

function defaultIntegrity(): Omit<IntegrityReport, 'generatedAt'> {
  return {
    scanAccepted: 0,
    mealRecords: 0,
    missingRecords: 0,
    orphanRecords: 0,
    duplicateAttempts: 0,
    clockSkewHigh: 0,
    unknownCards: 0,
    outOfWindow: 0,
  };
}
