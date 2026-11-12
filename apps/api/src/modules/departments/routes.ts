import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@shared/permissions';
import { one, query } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/sql';
import { parseBody } from '../../lib/validate';
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

export default router;
