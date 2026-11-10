import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@shared/permissions';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { parseBody } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.USER_READ), async (_req, res) => {
  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true } } },
  });
  res.json({
    items: departments.map((d) => ({ id: d.id, name: d.name, code: d.code, userCount: d._count.users })),
  });
});

const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(20).optional().or(z.literal('')),
});

router.post('/', async (req, res) => {
  if (req.auth!.role !== 'ADMIN') throw new AppError(403, 'Зөвхөн админ хэлтэс нэмнэ', 'FORBIDDEN');
  const input = parseBody(createDepartmentSchema, req);
  const department = await prisma.department.create({
    data: { name: input.name, code: input.code || null },
  });
  await writeAudit({
    actorId: req.auth!.id,
    action: 'department.create',
    entity: 'department',
    entityId: department.id,
    after: { name: department.name },
    req,
  });
  res.status(201).json({ department });
});

export default router;
