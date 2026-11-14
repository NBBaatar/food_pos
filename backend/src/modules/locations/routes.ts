import { Router } from 'express';
import { createLocationSchema, updateLocationSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { execute, one, query } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/sql';
import { parseBody, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();

interface LocationRow {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
}

const LOCATION_SELECT = `
  SELECT id, name, status, created_at AS "createdAt"
    FROM locations
`;

function toLocation(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Kiosk, тайлан болон админы тохиргоонд зориулсан нээлттэй жагсаалт (status-тайгаа) */
router.get('/', async (_req, res) => {
  const rows = await query<LocationRow>(`${LOCATION_SELECT} ORDER BY name ASC`);
  res.json({ items: rows.map(toLocation) });
});

router.post('/', authenticate, requirePermission(PERMISSIONS.DEVICE_MANAGE), async (req, res) => {
  const input = parseBody(createLocationSchema, req);
  try {
    const location = await one<LocationRow>(
      `INSERT INTO locations (name) VALUES ($1)
       RETURNING id, name, status, created_at AS "createdAt"`,
      [input.name],
    );
    if (!location) throw new AppError(500, 'Байршил үүссэнгүй', 'CREATE_FAILED');

    await writeAudit({
      actorId: req.auth!.id,
      action: 'location.create',
      entity: 'location',
      entityId: location.id,
      after: { name: location.name },
      req,
    });
    res.status(201).json({ location: toLocation(location) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм нэртэй байршил байна', 'DUPLICATE_LOCATION');
    }
    throw error;
  }
});

router.patch('/:id', authenticate, requirePermission(PERMISSIONS.DEVICE_MANAGE), async (req, res) => {
  const id = pathId(req.params.id);
  const input = parseBody(updateLocationSchema, req);
  const before = await one<LocationRow>(`${LOCATION_SELECT} WHERE id = $1::uuid`, [id]);
  if (!before) throw new AppError(404, 'Байршил олдсонгүй', 'NOT_FOUND');

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
  }
  if (input.status !== undefined) {
    params.push(input.status);
    sets.push(`status = $${params.length}`);
  }
  if (sets.length === 0) throw new AppError(400, 'Өөрчлөх талбар байхгүй', 'NO_CHANGES');

  params.push(id);
  try {
    const updated = await one<LocationRow>(
      `UPDATE locations SET ${sets.join(', ')} WHERE id = $${params.length}::uuid
       RETURNING id, name, status, created_at AS "createdAt"`,
      params,
    );
    if (!updated) throw new AppError(404, 'Байршил олдсонгүй', 'NOT_FOUND');

    await writeAudit({
      actorId: req.auth!.id,
      action: 'location.update',
      entity: 'location',
      entityId: id,
      before: { name: before.name, status: before.status },
      after: { name: updated.name, status: updated.status },
      req,
    });
    res.json({ location: toLocation(updated) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм нэртэй байршил байна', 'DUPLICATE_LOCATION');
    }
    throw error;
  }
});

export default router;
