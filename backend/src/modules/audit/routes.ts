import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@shared/permissions';
import { one, query } from '../../db/pool';
import { limitOffset, param } from '../../lib/sql';
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

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: Date;
}

router.get('/', requirePermission(PERMISSIONS.AUDIT_READ), async (req, res) => {
  const input = parseQuery(querySchema, req);
  const params: unknown[] = [];
  const whereSql = input.entity ? `WHERE a.entity = ${param(params, input.entity)}` : '';

  const [totalRow, logs] = await Promise.all([
    one<{ total: number }>(`SELECT COUNT(*)::int AS total FROM audit_logs a ${whereSql}`, params),
    query<AuditRow>(
      `SELECT a.id::text AS id, a.action, a.entity, a.entity_id AS "entityId",
              CASE WHEN u.id IS NULL THEN NULL ELSE u.last_name || ' ' || u.first_name END AS "actorName",
              u.email AS "actorEmail",
              a.before, a.after, a.ip, a.created_at AS "createdAt"
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         ${whereSql}
         ORDER BY a.created_at DESC, a.id DESC
         ${limitOffset(input.page, input.pageSize)}`,
      params,
    ),
  ]);

  res.json({
    items: logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      actorName: log.actorName ?? 'Систем',
      actorEmail: log.actorEmail,
      before: log.before,
      after: log.after,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
    })),
    page: input.page,
    pageSize: input.pageSize,
    total: totalRow?.total ?? 0,
  });
});

export default router;
