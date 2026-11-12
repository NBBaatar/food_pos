import { Router } from 'express';
import { createDeviceSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { execute, one, query } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/sql';
import { createApiKey } from '../../lib/tokens';
import { parseBody, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

interface DeviceRow {
  id: string;
  code: string;
  name: string;
  location: string | null;
  status: string;
  lastSeenAt: Date | null;
  createdAt: Date;
}

const DEVICE_SELECT = `
  SELECT id, code, name, location, status, last_seen_at AS "lastSeenAt", created_at AS "createdAt"
    FROM devices
`;

function toDevice(device: DeviceRow) {
  return {
    id: device.id,
    code: device.code,
    name: device.name,
    location: device.location,
    status: device.status,
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
    createdAt: device.createdAt.toISOString(),
  };
}

router.get('/', requirePermission(PERMISSIONS.DEVICE_MANAGE), async (_req, res) => {
  const devices = await query<DeviceRow>(`${DEVICE_SELECT} ORDER BY created_at ASC`);
  res.json({ items: devices.map(toDevice) });
});

router.post('/', requirePermission(PERMISSIONS.DEVICE_MANAGE), async (req, res) => {
  const input = parseBody(createDeviceSchema, req);
  const { key, hash } = createApiKey();

  try {
    const device = await one<DeviceRow>(
      `INSERT INTO devices (code, name, location, api_key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, name, location, status, last_seen_at AS "lastSeenAt", created_at AS "createdAt"`,
      [input.code, input.name, input.location || null, hash],
    );
    if (!device) throw new AppError(500, 'Төхөөрөмж үүссэнгүй', 'CREATE_FAILED');

    await writeAudit({
      actorId: req.auth!.id,
      action: 'device.create',
      entity: 'device',
      entityId: device.id,
      after: { code: device.code, name: device.name },
      req,
    });

    // apiKey зөвхөн нэг удаа буцаана
    res.status(201).json({ device: toDevice(device), apiKey: key });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм кодтой төхөөрөмж байна', 'DUPLICATE_DEVICE');
    }
    throw error;
  }
});

router.post('/:id/rotate-key', requirePermission(PERMISSIONS.DEVICE_MANAGE), async (req, res) => {
  const id = pathId(req.params.id);
  const device = await one<{ id: string }>('SELECT id FROM devices WHERE id = $1::uuid', [id]);
  if (!device) throw new AppError(404, 'Төхөөрөмж олдсонгүй', 'NOT_FOUND');

  const { key, hash } = createApiKey();
  await execute('UPDATE devices SET api_key_hash = $2 WHERE id = $1::uuid', [device.id, hash]);
  await writeAudit({ actorId: req.auth!.id, action: 'device.rotate_key', entity: 'device', entityId: device.id, req });

  res.json({ id: device.id, apiKey: key });
});

export default router;
