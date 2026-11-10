import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@shared/permissions';
import { prisma } from '../../db/prisma';
import { parseQuery } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
  entity: z.string().trim().max(40).optional(),
});

router.get('/', requirePermission(PERMISSIONS.AUDIT_READ), async (req, res) => {
  const query = parseQuery(querySchema, req);
  const where = query.entity ? { entity: query.entity } : {};

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({
    items: logs.map((log) => ({
      id: log.id.toString(),
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      actorName: log.actor ? `${log.actor.lastName} ${log.actor.firstName}` : 'Систем',
      actorEmail: log.actor?.email ?? null,
      before: log.before,
      after: log.after,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  });
});

export default router;
