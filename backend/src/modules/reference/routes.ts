import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@shared/permissions';
import { one, query } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/sql';
import { parseBody, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

const TABLES = {
  units: { table: 'units', label: 'Нэгж', entity: 'unit' },
  positions: { table: 'positions', label: 'Албан тушаал', entity: 'position' },
} as const;

type Kind = keyof typeof TABLES;

function resolveKind(raw: string): (typeof TABLES)[Kind] {
  if (raw !== 'units' && raw !== 'positions') {
    throw new AppError(404, 'Лавлах төрөл олдсонгүй', 'NOT_FOUND');
  }
  return TABLES[raw];
}

const nameSchema = z.object({
  name: z.string().trim().min(1, 'Нэр шаардлагатай').max(80),
});

router.get('/:kind', requirePermission(PERMISSIONS.USER_READ), async (req, res) => {
  const kind = resolveKind(String(req.params.kind));
  const items = await query<{ id: string; name: string; createdAt: Date }>(
    `SELECT id, name, created_at AS "createdAt" FROM ${kind.table} ORDER BY name ASC`,
  );
  res.json({ items });
});

router.post('/:kind', async (req, res) => {
  if (req.auth!.role !== 'ADMIN') throw new AppError(403, 'Зөвхөн админ лавлах нэмнэ', 'FORBIDDEN');
  const kind = resolveKind(String(req.params.kind));
  const input = parseBody(nameSchema, req);

  try {
    const item = await one<{ id: string; name: string; createdAt: Date }>(
      `INSERT INTO ${kind.table} (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"`,
      [input.name],
    );
    await writeAudit({
      actorId: req.auth!.id,
      action: `${kind.entity}.create`,
      entity: kind.entity,
      entityId: item?.id,
      after: { name: input.name },
      req,
    });
    res.status(201).json({ item });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, `Ийм ${kind.label.toLowerCase()} бүртгэгдсэн байна`, 'DUPLICATE_REFERENCE');
    }
    throw error;
  }
});

router.patch('/:kind/:id', async (req, res) => {
  if (req.auth!.role !== 'ADMIN') throw new AppError(403, 'Зөвхөн админ лавлах засна', 'FORBIDDEN');
  const kind = resolveKind(String(req.params.kind));
  const id = pathId(req.params.id);
  const input = parseBody(nameSchema, req);
  const before = await one<{ id: string; name: string }>(`SELECT id, name FROM ${kind.table} WHERE id = $1::uuid`, [
    id,
  ]);
  if (!before) throw new AppError(404, `${kind.label} олдсонгүй`, 'NOT_FOUND');

  try {
    const item = await one<{ id: string; name: string; createdAt: Date }>(
      `UPDATE ${kind.table} SET name = $1 WHERE id = $2::uuid RETURNING id, name, created_at AS "createdAt"`,
      [input.name, id],
    );
    await writeAudit({
      actorId: req.auth!.id,
      action: `${kind.entity}.update`,
      entity: kind.entity,
      entityId: id,
      before: { name: before.name },
      after: { name: input.name },
      req,
    });
    res.json({ item });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, `Ийм ${kind.label.toLowerCase()} бүртгэгдсэн байна`, 'DUPLICATE_REFERENCE');
    }
    throw error;
  }
});

router.delete('/:kind/:id', async (req, res) => {
  if (req.auth!.role !== 'ADMIN') throw new AppError(403, 'Зөвхөн админ лавлах устгана', 'FORBIDDEN');
  const kind = resolveKind(String(req.params.kind));
  const id = pathId(req.params.id);
  const before = await one<{ id: string; name: string }>(`SELECT id, name FROM ${kind.table} WHERE id = $1::uuid`, [
    id,
  ]);
  if (!before) throw new AppError(404, `${kind.label} олдсонгүй`, 'NOT_FOUND');

  await query(`DELETE FROM ${kind.table} WHERE id = $1::uuid`, [id]);
  await writeAudit({
    actorId: req.auth!.id,
    action: `${kind.entity}.delete`,
    entity: kind.entity,
    entityId: id,
    before: { name: before.name },
    req,
  });
  res.status(204).end();
});

export default router;
