import type { Grouping } from '@shared/meal';
import type {
  AttendanceRow,
  DepartmentReportRow,
  DetailedReportRow,
  IntegrityReport,
  LocationReportRow,
  PeriodBreakdown,
  ReportBucketRow,
} from '@shared/types';
import { env } from '../../config/env';
import { query } from '../../db/pool';
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
  locationId?: string;
  /** Зөвхөн дэлгэрэнгүй тайланд: туслан гүйцэтгэгч компани */
  companyId?: string;
  /** Зөвхөн дэлгэрэнгүй тайланд: ажилтны нэр, код эсвэл картын UID-аар хайх */
  search?: string;
  includeVoided?: boolean;
}

const filterSql = `
  AND ($6::text IS NULL OR m.period_id = (SELECT id FROM meal_periods WHERE code::text = $6::text))
  AND ($7::uuid IS NULL OR m.user_id = $7::uuid)
  AND ($8::uuid IS NULL OR m.user_id IN (SELECT id FROM users WHERE department_id = $8::uuid))
  AND ($9::uuid IS NULL OR EXISTS (
    SELECT 1 FROM scan_events se WHERE se.id = m.scan_event_id AND se.location_id = $9::uuid
  ))
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

  return query<ReportBucketRow>(sql, [
    TRUNC_UNIT[groupBy],
    filters.from,
    filters.to,
    STEP[groupBy],
    filters.includeVoided ?? false,
    filters.period ?? null,
    filters.userId ?? null,
    filters.departmentId ?? null,
    filters.locationId ?? null,
  ]);
}

interface TotalsRow {
  total: number;
  uniqueUsers: number;
}

async function totals(filters: ReportFilters): Promise<TotalsRow> {
  const rows = await query<TotalsRow>(
    `
    SELECT COUNT(m.id)::int AS total, COUNT(DISTINCT m.user_id)::int AS "uniqueUsers"
    FROM meal_records m
    LEFT JOIN scan_events se ON se.id = m.scan_event_id
    WHERE m.business_date BETWEEN $1::date AND $2::date
      AND ($3::boolean OR m.voided_at IS NULL)
      AND ($4::text IS NULL OR m.period_id = (SELECT id FROM meal_periods WHERE code::text = $4::text))
      AND ($5::uuid IS NULL OR m.user_id = $5::uuid)
      AND ($6::uuid IS NULL OR m.user_id IN (SELECT id FROM users WHERE department_id = $6::uuid))
      AND ($7::uuid IS NULL OR se.location_id = $7::uuid)
    `,
    [
      filters.from,
      filters.to,
      filters.includeVoided ?? false,
      filters.period ?? null,
      filters.userId ?? null,
      filters.departmentId ?? null,
      filters.locationId ?? null,
    ],
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
    // Нийт дүнг ч мөн өнөөдрөөр хязгаарлана — дундажтай ижил муж байх ёстой
    totals({ ...filters, to: cappedTo }),
    totals({ ...filters, from: previousFrom, to: previousTo }),
    query<{ code: string; count: number }>(
      `
      SELECT p.code::text AS code, COUNT(m.id)::int AS count
      FROM meal_records m
      JOIN meal_periods p ON p.id = m.period_id
      LEFT JOIN scan_events se ON se.id = m.scan_event_id
      WHERE m.business_date BETWEEN $1::date AND $2::date
        AND ($3::boolean OR m.voided_at IS NULL)
        AND ($4::uuid IS NULL OR m.user_id = $4::uuid)
        AND ($5::uuid IS NULL OR m.user_id IN (SELECT id FROM users WHERE department_id = $5::uuid))
        AND ($6::text IS NULL OR p.code::text = $6::text)
        AND ($7::uuid IS NULL OR se.location_id = $7::uuid)
      GROUP BY p.code
      `,
      [
        filters.from,
        cappedTo,
        filters.includeVoided ?? false,
        filters.userId ?? null,
        filters.departmentId ?? null,
        filters.period ?? null,
        filters.locationId ?? null,
      ],
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
  return query<AttendanceRow>(
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
     -- Хоолны цагийн шүүлтүүрийг JOIN дээр тавина: ийм хоол идээгүй
     -- хэрэглэгч тайлангаас бүрэн алга болохгүй, 0-тэй мөрөөр үлдэнэ
     AND ($5::text IS NULL OR m.period_id = (SELECT id FROM meal_periods WHERE code::text = $5::text))
     AND ($7::uuid IS NULL OR m.scan_event_id IN (SELECT id FROM scan_events WHERE location_id = $7::uuid))
    LEFT JOIN meal_periods p ON p.id = m.period_id
    WHERE u.deleted_at IS NULL
      AND ($4::uuid IS NULL OR u.department_id = $4::uuid)
      AND ($6::uuid IS NULL OR u.id = $6::uuid)
    GROUP BY u.id, u.employee_no, u.last_name, u.first_name, d.name
    ORDER BY total DESC, u.last_name ASC
    LIMIT 1000
    `,
    [
      filters.from,
      filters.to,
      filters.includeVoided ?? false,
      filters.departmentId ?? null,
      filters.period ?? null,
      filters.userId ?? null,
      filters.locationId ?? null,
    ],
  );
}

export async function byDepartment(filters: ReportFilters): Promise<DepartmentReportRow[]> {
  return query<DepartmentReportRow>(
    `
    SELECT
      d.id::text AS "departmentId",
      COALESCE(d.name, 'Хэлтэсгүй') AS "departmentName",
      COUNT(DISTINCT u.id)::int AS holders,
      COUNT(m.id)::int AS meals,
      CASE
        WHEN COUNT(DISTINCT u.id) = 0 THEN 0
        ELSE ROUND(COUNT(m.id)::numeric / COUNT(DISTINCT u.id), 1)::float8
      END AS "avgPerHolder"
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN meal_records m
      ON m.user_id = u.id
     AND m.business_date BETWEEN $1::date AND $2::date
     AND ($3::boolean OR m.voided_at IS NULL)
     AND ($5::text IS NULL OR m.period_id = (SELECT id FROM meal_periods WHERE code::text = $5::text))
     AND ($7::uuid IS NULL OR m.scan_event_id IN (SELECT id FROM scan_events WHERE location_id = $7::uuid))
    WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE'
      AND ($4::uuid IS NULL OR u.department_id = $4::uuid)
      AND ($6::uuid IS NULL OR u.id = $6::uuid)
    GROUP BY d.id, d.name
    ORDER BY meals DESC
    `,
    [
      filters.from,
      filters.to,
      filters.includeVoided ?? false,
      filters.departmentId ?? null,
      filters.period ?? null,
      filters.userId ?? null,
      filters.locationId ?? null,
    ],
  );
}

export async function byLocation(filters: ReportFilters): Promise<LocationReportRow[]> {
  return query<LocationReportRow>(
    `
    SELECT
      l.id::text AS "locationId",
      COALESCE(l.name, 'Байршилгүй') AS "locationName",
      COUNT(m.id)::int AS meals,
      COUNT(DISTINCT m.user_id)::int AS "uniqueUsers"
    FROM meal_records m
    LEFT JOIN scan_events se ON se.id = m.scan_event_id
    LEFT JOIN locations l ON l.id = se.location_id
    WHERE m.business_date BETWEEN $1::date AND $2::date
      AND ($3::boolean OR m.voided_at IS NULL)
      AND ($4::text IS NULL OR m.period_id = (SELECT id FROM meal_periods WHERE code::text = $4::text))
      AND ($5::uuid IS NULL OR m.user_id = $5::uuid)
      AND ($6::uuid IS NULL OR m.user_id IN (SELECT id FROM users WHERE department_id = $6::uuid))
      AND ($7::uuid IS NULL OR se.location_id = $7::uuid)
    GROUP BY l.id, l.name
    ORDER BY meals DESC
    `,
    [
      filters.from,
      filters.to,
      filters.includeVoided ?? false,
      filters.period ?? null,
      filters.userId ?? null,
      filters.departmentId ?? null,
      filters.locationId ?? null,
    ],
  );
}

interface DetailedRowDb {
  userId: string;
  employeeNo: string;
  userName: string;
  companyName: string | null;
  departmentName: string | null;
  unit: string | null;
  position: string | null;
  accBreakfast: number;
  accLunch: number;
  accDinner: number;
  accNight: number;
  accTotal: number;
  mealDays: number;
  attBreakfast: number;
  attLunch: number;
  attDinner: number;
  attNight: number;
  attTotal: number;
  firstScanAt: Date | null;
  lastScanAt: Date | null;
}

function breakdown(breakfast: number, lunch: number, dinner: number, night: number, total: number): PeriodBreakdown {
  return { BREAKFAST: breakfast, LUNCH: lunch, DINNER: dinner, NIGHT: night, total };
}

/**
 * Ажилтан бүрийн дэлгэрэнгүй тайлан: хүлээн авсан хоол (хоолны төрлөөр),
 * уншилтын оролдлого, хоол авсан өдөр, эхний/сүүлийн уншилт.
 * Компани, хэлтэс, байршил, хоол, огноо болон нэр/код/картаар шүүнэ.
 */
export async function detailed(filters: ReportFilters): Promise<DetailedReportRow[]> {
  const rows = await query<DetailedRowDb>(
    `
    WITH scan_agg AS (
      SELECT s.user_id,
             COUNT(*) FILTER (WHERE p.code = 'BREAKFAST')::int AS att_breakfast,
             COUNT(*) FILTER (WHERE p.code = 'LUNCH')::int AS att_lunch,
             COUNT(*) FILTER (WHERE p.code = 'DINNER')::int AS att_dinner,
             COUNT(*) FILTER (WHERE p.code = 'NIGHT')::int AS att_night,
             COUNT(*)::int AS att_total,
             MIN(s.scanned_at) AS first_scan_at,
             MAX(s.scanned_at) AS last_scan_at
        FROM scan_events s
        LEFT JOIN meal_periods p ON p.id = s.period_id
       WHERE s.business_date BETWEEN $1::date AND $2::date
         AND s.user_id IS NOT NULL
         AND ($5::text IS NULL OR p.code::text = $5::text)
         AND ($6::uuid IS NULL OR s.location_id = $6::uuid)
       GROUP BY s.user_id
    ), meal_agg AS (
      SELECT m.user_id,
             COUNT(*) FILTER (WHERE p.code = 'BREAKFAST')::int AS acc_breakfast,
             COUNT(*) FILTER (WHERE p.code = 'LUNCH')::int AS acc_lunch,
             COUNT(*) FILTER (WHERE p.code = 'DINNER')::int AS acc_dinner,
             COUNT(*) FILTER (WHERE p.code = 'NIGHT')::int AS acc_night,
             COUNT(*)::int AS acc_total,
             COUNT(DISTINCT m.business_date)::int AS meal_days
        FROM meal_records m
        JOIN meal_periods p ON p.id = m.period_id
       WHERE m.business_date BETWEEN $1::date AND $2::date
         AND ($3::boolean OR m.voided_at IS NULL)
         AND ($5::text IS NULL OR p.code::text = $5::text)
         AND ($6::uuid IS NULL OR m.scan_event_id IN (
           SELECT id FROM scan_events WHERE location_id = $6::uuid
         ))
       GROUP BY m.user_id
    )
    SELECT
      u.id::text AS "userId",
      u.employee_no AS "employeeNo",
      u.last_name || ' ' || u.first_name AS "userName",
      co.name AS "companyName",
      d.name AS "departmentName",
      u.unit,
      u.position,
      COALESCE(ma.acc_breakfast, 0)::int AS "accBreakfast",
      COALESCE(ma.acc_lunch, 0)::int AS "accLunch",
      COALESCE(ma.acc_dinner, 0)::int AS "accDinner",
      COALESCE(ma.acc_night, 0)::int AS "accNight",
      COALESCE(ma.acc_total, 0)::int AS "accTotal",
      COALESCE(ma.meal_days, 0)::int AS "mealDays",
      COALESCE(sa.att_breakfast, 0)::int AS "attBreakfast",
      COALESCE(sa.att_lunch, 0)::int AS "attLunch",
      COALESCE(sa.att_dinner, 0)::int AS "attDinner",
      COALESCE(sa.att_night, 0)::int AS "attNight",
      COALESCE(sa.att_total, 0)::int AS "attTotal",
      sa.first_scan_at AS "firstScanAt",
      sa.last_scan_at AS "lastScanAt"
    FROM users u
    LEFT JOIN companies co ON co.id = u.company_id
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN scan_agg sa ON sa.user_id = u.id
    LEFT JOIN meal_agg ma ON ma.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND ($4::uuid IS NULL OR u.id = $4::uuid)
      AND ($7::uuid IS NULL OR u.department_id = $7::uuid)
      AND ($8::uuid IS NULL OR u.company_id = $8::uuid)
      AND ($9::text IS NULL
           OR u.last_name ILIKE $9
           OR u.first_name ILIKE $9
           OR u.employee_no ILIKE $9
           OR (u.last_name || ' ' || u.first_name) ILIKE $9
           OR (u.first_name || ' ' || u.last_name) ILIKE $9
           OR EXISTS (SELECT 1 FROM cards c JOIN card_assignments ca ON ca.card_id = c.id
                       WHERE ca.user_id = u.id AND ca.released_at IS NULL AND c.uid ILIKE $9))
    ORDER BY "accTotal" DESC, u.last_name ASC, u.first_name ASC
    LIMIT 5000
    `,
    [
      filters.from,
      filters.to,
      filters.includeVoided ?? false,
      filters.userId ?? null,
      filters.period ?? null,
      filters.locationId ?? null,
      filters.departmentId ?? null,
      filters.companyId ?? null,
      filters.search ? `%${filters.search}%` : null,
    ],
  );

  return rows.map((row) => ({
    userId: row.userId,
    employeeNo: row.employeeNo,
    userName: row.userName,
    companyName: row.companyName,
    departmentName: row.departmentName,
    unit: row.unit,
    position: row.position,
    accepted: breakdown(row.accBreakfast, row.accLunch, row.accDinner, row.accNight, row.accTotal),
    attempts: breakdown(row.attBreakfast, row.attLunch, row.attDinner, row.attNight, row.attTotal),
    mealDays: row.mealDays,
    firstScanAt: row.firstScanAt?.toISOString() ?? null,
    lastScanAt: row.lastScanAt?.toISOString() ?? null,
  }));
}

export interface DetailedScanRow {
  businessDate: string;
  scannedAt: Date;
  employeeNo: string | null;
  userName: string | null;
  companyName: string | null;
  departmentName: string | null;
  periodCode: string | null;
  cardUid: string;
  decision: string;
  reason: string | null;
  locationName: string | null;
}

/** Шүүлтэд тохирох бүх уншилтын оролдлого — Excel-ийн «Уншилтүүд» хуудсанд */
export async function detailedScans(filters: ReportFilters): Promise<DetailedScanRow[]> {
  return query<DetailedScanRow>(
    `
    SELECT to_char(s.business_date, 'YYYY-MM-DD') AS "businessDate",
           s.scanned_at AS "scannedAt",
           u.employee_no AS "employeeNo",
           CASE WHEN u.id IS NULL THEN NULL ELSE u.last_name || ' ' || u.first_name END AS "userName",
           co.name AS "companyName",
           d.name AS "departmentName",
           p.code::text AS "periodCode",
           s.card_uid AS "cardUid",
           s.decision::text AS "decision",
           s.reason,
           l.name AS "locationName"
      FROM scan_events s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN companies co ON co.id = u.company_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN meal_periods p ON p.id = s.period_id
      LEFT JOIN locations l ON l.id = s.location_id
     WHERE s.business_date BETWEEN $1::date AND $2::date
       AND ($3::text IS NULL OR p.code::text = $3::text)
       AND ($4::uuid IS NULL OR s.location_id = $4::uuid)
       AND ($5::uuid IS NULL OR s.user_id = $5::uuid)
       AND ($6::uuid IS NULL OR u.department_id = $6::uuid)
       AND ($7::uuid IS NULL OR u.company_id = $7::uuid)
       AND ($8::text IS NULL
            OR u.last_name ILIKE $8
            OR u.first_name ILIKE $8
            OR u.employee_no ILIKE $8
            OR (u.last_name || ' ' || u.first_name) ILIKE $8
            OR (u.first_name || ' ' || u.last_name) ILIKE $8
            OR s.card_uid ILIKE $8)
     ORDER BY s.scanned_at ASC
     LIMIT 100000
    `,
    [
      filters.from,
      filters.to,
      filters.period ?? null,
      filters.locationId ?? null,
      filters.userId ?? null,
      filters.departmentId ?? null,
      filters.companyId ?? null,
      filters.search ? `%${filters.search}%` : null,
    ],
  );
}

export async function integrity(): Promise<IntegrityReport> {
  const rows = await query<Omit<IntegrityReport, 'generatedAt'>>(`
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
