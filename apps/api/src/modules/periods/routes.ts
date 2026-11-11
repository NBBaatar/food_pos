import { Router } from 'express';
import { updatePeriodSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { minutesOfDay, windowsOverlap } from '../../lib/time';
import { parseBody, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res) => {
  const periods = await prisma.mealPeriod.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({
    items: periods.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      crossesMidnight: p.crossesMidnight,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    })),
  });
});

router.patch('/:id', requirePermission(PERMISSIONS.PERIOD_MANAGE), async (req, res) => {
  const input = parseBody(updatePeriodSchema, req);
  const period = await prisma.mealPeriod.findUnique({ where: { id: pathId(req.params.id) } });
  if (!period) throw new AppError(404, 'Хоолны цонх олдсонгүй', 'NOT_FOUND');

  const startTime = input.startTime ?? period.startTime;
  const endTime = input.endTime ?? period.endTime;
  const crossesMidnight = input.crossesMidnight ?? period.crossesMidnight;

  if (startTime === endTime) {
    throw new AppError(400, 'Эхлэх ба дуусах цаг ижил байж болохгүй', 'BAD_WINDOW');
  }
  if (!crossesMidnight && minutesOfDay(startTime) > minutesOfDay(endTime)) {
    throw new AppError(400, '00:00-ийг давах цонхыг "шөнийн" гэж тэмдэглэнэ үү', 'BAD_WINDOW');
  }
  if (crossesMidnight && minutesOfDay(startTime) < minutesOfDay(endTime)) {
    throw new AppError(400, '"Шөнийн" цонх 22:00 → 02:00 гэх мэт 00:00-ийг давах ёстой', 'BAD_WINDOW');
  }

  // Давхцсан цонх нь нэг уншилтыг хоёр хоол болгож, тайланг буруу болгоно.
  const willBeActive = input.isActive ?? period.isActive;
  if (willBeActive) {
    const others = await prisma.mealPeriod.findMany({ where: { id: { not: period.id }, isActive: true } });
    const candidate = { startTime, endTime, crossesMidnight };
    const clash = others.find((other) => windowsOverlap(candidate, other));
    if (clash) {
      throw new AppError(
        409,
        `«${clash.name}» цонхтой давхцаж байна (${clash.startTime}–${clash.endTime}). Өөр цаг сонгоно уу.`,
        'WINDOW_OVERLAP',
      );
    }
  }

  const updated = await prisma.mealPeriod.update({
    where: { id: period.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      startTime,
      endTime,
      crossesMidnight,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await writeAudit({
    actorId: req.auth!.id,
    action: 'period.update',
    entity: 'meal_period',
    entityId: period.id,
    before: { startTime: period.startTime, endTime: period.endTime, crossesMidnight: period.crossesMidnight },
    after: { startTime: updated.startTime, endTime: updated.endTime, crossesMidnight: updated.crossesMidnight },
    req,
  });

  res.json({ period: updated });
});

export default router;
