import { Router } from 'express';
import { listScansQuerySchema, scanSchema, voidScanSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { toScanRow } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { parseBody, parseQuery, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { authenticateOrDevice } from '../../middleware/deviceAuth';
import { requirePermission } from '../../middleware/rbac';
import { recordScan } from './decision';

const router = Router();

const scanInclude = {
  user: { select: { firstName: true, lastName: true, employeeNo: true } },
  period: true,
  device: true,
  meal: true,
} satisfies Prisma.ScanEventInclude;

function parseId(raw: string): bigint {
  if (!/^\d+$/.test(raw)) throw new AppError(400, 'Буруу ID', 'BAD_ID');
  return BigInt(raw);
}

/** Кiosk/уншигч: хэрэглэгчийн сесс эсвэл төхөөрөмжийн түлхүүрээр */
router.post('/', authenticateOrDevice, async (req, res) => {
  const input = parseBody(scanSchema, req);
  const result = await recordScan(input, {
    deviceId: req.device?.id ?? null,
    deviceCode: req.device?.code ?? null,
  });
  res.status(result.decision === 'ACCEPTED' ? 201 : 200).json(result);
});

router.get('/', authenticate, requirePermission(PERMISSIONS.SCAN_READ), async (req, res) => {
  const query = parseQuery(listScansQuerySchema, req);
  const where: Prisma.ScanEventWhereInput = {
    ...(query.from || query.to
      ? {
          businessDate: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
          },
        }
      : {}),
    ...(query.decision ? { decision: query.decision } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.period ? { period: { code: query.period } } : {}),
    ...(query.search
      ? {
          OR: [
            { cardUid: { contains: query.search, mode: 'insensitive' } },
            { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
            { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
            { user: { employeeNo: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, scans] = await Promise.all([
    prisma.scanEvent.count({ where }),
    prisma.scanEvent.findMany({
      where,
      include: scanInclude,
      orderBy: { receivedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({ items: scans.map(toScanRow), page: query.page, pageSize: query.pageSize, total });
});

/** Dashboard-ын шууд урсгал */
router.get('/recent', authenticate, requirePermission(PERMISSIONS.SCAN_READ), async (_req, res) => {
  const scans = await prisma.scanEvent.findMany({
    include: scanInclude,
    orderBy: { receivedAt: 'desc' },
    take: 12,
  });
  res.json({ items: scans.map(toScanRow) });
});

/** Менежер/админ: алдаатай уншилтыг цуцлах (устгахгүй, audit-тай) */
router.post('/:id/void', authenticate, requirePermission(PERMISSIONS.SCAN_CORRECT), async (req, res) => {
  const id = parseId(pathId(req.params.id));
  const { reason } = parseBody(voidScanSchema, req);

  const scan = await prisma.scanEvent.findUnique({ where: { id }, include: { meal: true } });
  if (!scan) throw new AppError(404, 'Уншилт олдсонгүй', 'NOT_FOUND');
  if (!scan.meal) throw new AppError(400, 'Зөвхөн хүлээн авсан уншилтыг цуцална', 'NOT_ACCEPTED');
  if (scan.meal.voidedAt) throw new AppError(400, 'Энэ бүртгэл аль хэдийн цуцлагдсан', 'ALREADY_VOIDED');

  const meal = await prisma.mealRecord.update({
    where: { id: scan.meal.id },
    data: { voidedAt: new Date(), voidedById: req.auth!.id, voidReason: reason },
  });

  await writeAudit({
    actorId: req.auth!.id,
    action: 'scan.void',
    entity: 'meal_record',
    entityId: meal.id.toString(),
    before: { voidedAt: null },
    after: { voidedAt: meal.voidedAt?.toISOString(), reason },
    req,
  });

  res.json({ ok: true, mealId: meal.id.toString() });
});

export default router;
