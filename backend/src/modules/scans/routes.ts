import { Router } from 'express';
import { listScansQuerySchema, recentScansQuerySchema, scanSchema, voidScanSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { execute, one, query } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { toScanRow, type ScanRowDb } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { limitOffset, param } from '../../lib/sql';
import { parseBody, parseQuery, rawPathParam } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { authenticateOrDevice } from '../../middleware/deviceAuth';
import { rateLimit } from '../../middleware/rateLimit';
import { requirePermission } from '../../middleware/rbac';
import { recordScan } from './decision';

const router = Router();

const SCAN_SELECT = `
  SELECT s.id::text AS id,
         s.card_uid AS "cardUid",
         s.card_id AS "cardId",
         s.user_id AS "userId",
         CASE WHEN u.id IS NULL THEN NULL ELSE u.last_name || ' ' || u.first_name END AS "userName",
         u.employee_no AS "employeeNo",
         u.photo_url AS "photoUrl",
         dept.name AS "departmentName",
         co.name AS "companyName",
         p.code AS "periodCode",
         to_char(s.business_date, 'YYYY-MM-DD') AS "businessDate",
         s.scanned_at AS "scannedAt",
         s.received_at AS "receivedAt",
         s.decision,
         s.reason,
         d.name AS "deviceName",
         l.id::text AS "locationId",
         l.name AS "locationName",
         s.clock_skew_ms AS "clockSkewMs",
         m.id::text AS "mealId",
         m.voided_at AS "voidedAt"
    FROM scan_events s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN departments dept ON dept.id = u.department_id
    LEFT JOIN companies co ON co.id = u.company_id
    LEFT JOIN meal_periods p ON p.id = s.period_id
    LEFT JOIN devices d ON d.id = s.device_id
    LEFT JOIN locations l ON l.id = s.location_id
    LEFT JOIN meal_records m ON m.scan_event_id = s.id
`;

function parseId(raw: string): string {
  // bigint мужаас хэтэрсэн тоо Postgres 500 үүсгэхээс сэргийлнэ (19 орон хүртэл)
  if (!/^\d{1,19}$/.test(raw) || BigInt(raw) > 9_223_372_036_854_775_807n) {
    throw new AppError(400, 'Буруу ID', 'BAD_ID');
  }
  return raw;
}

/**
 * Уншилтын хязгаар — баталгаажсан төхөөрөмж/хэрэглэгч тус бүрээр тоолно.
 * Body дахь deviceCode нь баталгаажаагүй тул түлхүүр болгон ашиглахгүй.
 */
const scanLimiter = rateLimit({
  name: 'scan-device',
  windowMs: 60_000,
  max: 240,
  key: (req) =>
    req.device ? `device:${req.device.id}` : req.auth ? `user:${req.auth.id}` : `ip:${req.ip ?? 'unknown'}`,
});

/** Kiosk: нээлттэй уншилт. Байршил заавал идэвхтэй байх ёстой. */
router.post('/', authenticateOrDevice, scanLimiter, async (req, res) => {
  const input = parseBody(scanSchema, req);
  const location = await one<{ id: string }>(
    `SELECT id::text AS id FROM locations WHERE id = $1::uuid AND status = 'ACTIVE'`,
    [input.locationId],
  );
  if (!location) throw new AppError(400, 'Идэвхтэй байршил сонгоно уу', 'INVALID_LOCATION');

  const result = await recordScan(input, {
    deviceId: req.device?.id ?? null,
    deviceCode: req.device?.code ?? null,
    locationId: location.id,
  });
  res.status(result.decision === 'ACCEPTED' ? 201 : 200).json(result);
});

router.get('/', authenticate, requirePermission(PERMISSIONS.SCAN_READ), async (req, res) => {
  const input = parseQuery(listScansQuerySchema, req);
  const params: unknown[] = [];
  const where: string[] = [];

  if (input.from || input.to) {
    if (input.from) where.push(`s.business_date >= ${param(params, input.from)}::date`);
    if (input.to) where.push(`s.business_date <= ${param(params, input.to)}::date`);
  }
  if (input.decision) where.push(`s.decision = ${param(params, input.decision)}`);
  if (input.userId) where.push(`s.user_id = ${param(params, input.userId)}::uuid`);
  if (input.departmentId) where.push(`u.department_id = ${param(params, input.departmentId)}::uuid`);
  if (input.locationId) where.push(`s.location_id = ${param(params, input.locationId)}::uuid`);
  if (input.period) where.push(`p.code = ${param(params, input.period)}`);
  if (input.search) {
    const like = param(params, `%${input.search}%`);
    where.push(`(s.card_uid ILIKE ${like}
      OR u.first_name ILIKE ${like} OR u.last_name ILIKE ${like} OR u.employee_no ILIKE ${like})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [totalRow, scans] = await Promise.all([
    one<{ total: number }>(
      `SELECT COUNT(*)::int AS total
         FROM scan_events s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN meal_periods p ON p.id = s.period_id
         ${whereSql}`,
      params,
    ),
    query<ScanRowDb>(
      `${SCAN_SELECT} ${whereSql} ORDER BY s.received_at DESC, s.id DESC ${limitOffset(input.page, input.pageSize)}`,
      params,
    ),
  ]);

  res.json({
    items: scans.map(toScanRow),
    page: input.page,
    pageSize: input.pageSize,
    total: totalRow?.total ?? 0,
  });
});

/** Kiosk-ийн сүүлийн уншилтууд — нээлттэй, байршлаар шүүнэ */
router.get('/recent', async (req, res) => {
  const input = parseQuery(recentScansQuerySchema, req);
  const params: unknown[] = [];
  const where = input.locationId
    ? `WHERE s.location_id = ${param(params, input.locationId)}::uuid`
    : '';
  params.push(input.limit);
  const scans = await query<ScanRowDb>(
    `${SCAN_SELECT} ${where} ORDER BY s.received_at DESC, s.id DESC LIMIT $${params.length}`,
    params,
  );
  res.json({ items: scans.map(toScanRow) });
});

/** Менежер/админ: алдаатай уншилтыг цуцлах (устгахгүй, audit-тай) */
router.post('/:id/void', authenticate, requirePermission(PERMISSIONS.SCAN_CORRECT), async (req, res) => {
  const id = parseId(rawPathParam(req.params.id));
  const { reason } = parseBody(voidScanSchema, req);

  const scan = await one<{ id: string; mealId: string | null; voidedAt: Date | null }>(
    `SELECT s.id::text AS id, m.id::text AS "mealId", m.voided_at AS "voidedAt"
       FROM scan_events s
       LEFT JOIN meal_records m ON m.scan_event_id = s.id
      WHERE s.id = $1::bigint`,
    [id],
  );
  if (!scan) throw new AppError(404, 'Уншилт олдсонгүй', 'NOT_FOUND');
  if (!scan.mealId) throw new AppError(400, 'Зөвхөн хүлээн авсан уншилтыг цуцална', 'NOT_ACCEPTED');
  if (scan.voidedAt) throw new AppError(400, 'Энэ бүртгэл аль хэдийн цуцлагдсан', 'ALREADY_VOIDED');

  const voidedAt = new Date();
  // Зэрэгцээ хоёр хүсэлт ижил бүртгэлийг цуцлахаас сэргийлж, өөрчлөгдсөн мөрийг шалгана
  const changed = await execute(
    `UPDATE meal_records
        SET voided_at = $2, voided_by_id = $3::uuid, void_reason = $4
      WHERE id = $1::bigint AND voided_at IS NULL`,
    [scan.mealId, voidedAt, req.auth!.id, reason],
  );
  if (changed === 0) throw new AppError(400, 'Энэ бүртгэл аль хэдийн цуцлагдсан', 'ALREADY_VOIDED');

  await writeAudit({
    actorId: req.auth!.id,
    action: 'scan.void',
    entity: 'meal_record',
    entityId: scan.mealId,
    before: { voidedAt: null },
    after: { voidedAt: voidedAt.toISOString(), reason },
    req,
  });

  res.json({ ok: true, mealId: scan.mealId });
});

export default router;
