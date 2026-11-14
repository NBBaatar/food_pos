import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@shared/permissions';
import { execute, one, query } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/sql';
import { parseBody, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.USER_READ), async (_req, res) => {
  const departments = await query<{ id: string; name: string; code: string | null; userCount: number }>(
    `SELECT d.id, d.name, d.code, COUNT(u.id)::int AS "userCount"
       FROM departments d
       LEFT JOIN users u ON u.department_id = d.id AND u.deleted_at IS NULL
      GROUP BY d.id, d.name, d.code
      ORDER BY d.name ASC`,
  );
  res.json({ items: departments });
});

const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(20).optional().or(z.literal('')),
});

const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  code: z.string().trim().max(20).optional().or(z.literal('')),
});

router.post('/', async (req, res) => {
  if (req.auth!.role !== 'ADMIN') throw new AppError(403, 'Зөвхөн админ хэлтэс нэмнэ', 'FORBIDDEN');
  const input = parseBody(createDepartmentSchema, req);

  try {
    const department = await one<{ id: string; name: string; code: string | null }>(
      'INSERT INTO departments (name, code) VALUES ($1, $2) RETURNING id, name, code',
      [input.name, input.code || null],
    );
    if (!department) throw new AppError(500, 'Хэлтэс үүссэнгүй', 'CREATE_FAILED');

    await writeAudit({
      actorId: req.auth!.id,
      action: 'department.create',
      entity: 'department',
      entityId: department.id,
      after: { name: department.name },
      req,
    });

    res.status(201).json({ department });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм нэр эсвэл кодтой хэлтэс байна', 'DUPLICATE_DEPARTMENT');
    }
    throw error;
  }
});

router.patch('/:id', async (req, res) => {
  if (req.auth!.role !== 'ADMIN') throw new AppError(403, 'Зөвхөн админ хэлтэс засна', 'FORBIDDEN');
  const id = pathId(req.params.id);
  const input = parseBody(updateDepartmentSchema, req);
  const before = await one<{ id: string; name: string; code: string | null }>(
    'SELECT id, name, code FROM departments WHERE id = $1::uuid',
    [id],
  );
  if (!before) throw new AppError(404, 'Хэлтэс олдсонгүй', 'NOT_FOUND');

  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) {
    values.push(input.name);
    sets.push(`name = $${values.length}`);
  }
  if (input.code !== undefined) {
    values.push(input.code || null);
    sets.push(`code = $${values.length}`);
  }
  if (sets.length === 0) throw new AppError(400, 'Өөрчлөх талбар байхгүй', 'NO_CHANGES');

  values.push(id);
  try {
    const department = await one<{ id: string; name: string; code: string | null }>(
      `UPDATE departments SET ${sets.join(', ')} WHERE id = $${values.length}::uuid RETURNING id, name, code`,
      values,
    );

    await writeAudit({
      actorId: req.auth!.id,
      action: 'department.update',
      entity: 'department',
      entityId: id,
      before: { name: before.name, code: before.code },
      after: { name: department?.name, code: department?.code },
      req,
    });

    res.json({ department });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм нэр эсвэл кодтой хэлтэс байна', 'DUPLICATE_DEPARTMENT');
    }
    throw error;
  }
});

router.delete('/:id', async (req, res) => {
  if (req.auth!.role !== 'ADMIN') throw new AppError(403, 'Зөвхөн админ хэлтэс устгана', 'FORBIDDEN');
  const id = pathId(req.params.id);
  const department = await one<{ id: string; name: string; code: string | null; userCount: number }>(
    `SELECT d.id, d.name, d.code, COUNT(u.id)::int AS "userCount"
       FROM departments d
       LEFT JOIN users u ON u.department_id = d.id AND u.deleted_at IS NULL
      WHERE d.id = $1::uuid
      GROUP BY d.id, d.name, d.code`,
    [id],
  );
  if (!department) throw new AppError(404, 'Хэлтэс олдсонгүй', 'NOT_FOUND');
  if (department.userCount > 0) {
    throw new AppError(400, 'Хэлтэст хэрэглэгч байна. Эхлээд хэрэглэгчдийг өөр хэлтэст шилжүүлнэ үү.', 'DEPARTMENT_IN_USE');
  }

  await execute('DELETE FROM departments WHERE id = $1::uuid', [id]);
  await writeAudit({
    actorId: req.auth!.id,
    action: 'department.delete',
    entity: 'department',
    entityId: id,
    before: { name: department.name, code: department.code },
    req,
  });

  res.status(204).end();
});

export default router;
