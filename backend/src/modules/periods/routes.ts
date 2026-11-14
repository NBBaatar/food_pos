import { Router } from 'express';
import { updatePeriodSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { execute, one, query } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { minutesOfDay, windowsOverlap } from '../../lib/time';
import { parseBody, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

interface PeriodRow {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  isActive: boolean;
  sortOrder: number;
}

const PERIOD_SELECT = `
  SELECT id, code, name, start_time AS "startTime", end_time AS "endTime",
         crosses_midnight AS "crossesMidnight", is_active AS "isActive", sort_order AS "sortOrder"
    FROM meal_periods
`;

router.get('/', async (_req, res) => {
  const periods = await query<PeriodRow>(`${PERIOD_SELECT} ORDER BY sort_order ASC`);
  res.json({ items: periods });
});

router.patch('/:id', requirePermission(PERMISSIONS.PERIOD_MANAGE), async (req, res) => {
  const input = parseBody(updatePeriodSchema, req);
  const period = await one<PeriodRow>(`${PERIOD_SELECT} WHERE id = $1::uuid`, [pathId(req.params.id)]);
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
    const others = await query<PeriodRow>(`${PERIOD_SELECT} WHERE id <> $1::uuid AND is_active = true`, [period.id]);
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

  const updated = await one<PeriodRow>(
    `UPDATE meal_periods
        SET name = $2, start_time = $3, end_time = $4, crosses_midnight = $5, is_active = $6
      WHERE id = $1::uuid
      RETURNING id, code, name, start_time AS "startTime", end_time AS "endTime",
                crosses_midnight AS "crossesMidnight", is_active AS "isActive", sort_order AS "sortOrder"`,
    [period.id, input.name ?? period.name, startTime, endTime, crossesMidnight, willBeActive],
  );

  await writeAudit({
    actorId: req.auth!.id,
    action: 'period.update',
    entity: 'meal_period',
    entityId: period.id,
    before: { startTime: period.startTime, endTime: period.endTime, crossesMidnight: period.crossesMidnight },
    after: { startTime, endTime, crossesMidnight },
    req,
  });

  res.json({ period: updated });
});

export default router;
