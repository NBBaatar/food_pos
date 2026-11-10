import { Router } from 'express';
import { createDeviceSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { createApiKey } from '../../lib/tokens';
import { parseBody, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

function toDevice(device: {
  id: string;
  code: string;
  name: string;
  location: string | null;
  status: string;
  lastSeenAt: Date | null;
  createdAt: Date;
}) {
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
  const devices = await prisma.device.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ items: devices.map(toDevice) });
});

router.post('/', requirePermission(PERMISSIONS.DEVICE_MANAGE), async (req, res) => {
  const input = parseBody(createDeviceSchema, req);
  const duplicate = await prisma.device.findUnique({ where: { code: input.code }, select: { id: true } });
  if (duplicate) throw new AppError(409, 'Ийм кодтой төхөөрөмж байна', 'DUPLICATE_DEVICE');

  const { key, hash } = createApiKey();
  const device = await prisma.device.create({
    data: {
      code: input.code,
      name: input.name,
      location: input.location || null,
      apiKeyHash: hash,
    },
  });

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
});

router.post('/:id/rotate-key', requirePermission(PERMISSIONS.DEVICE_MANAGE), async (req, res) => {
  const device = await prisma.device.findUnique({ where: { id: pathId(req.params.id) } });
  if (!device) throw new AppError(404, 'Төхөөрөмж олдсонгүй', 'NOT_FOUND');

  const { key, hash } = createApiKey();
  await prisma.device.update({ where: { id: device.id }, data: { apiKeyHash: hash } });
  await writeAudit({ actorId: req.auth!.id, action: 'device.rotate_key', entity: 'device', entityId: device.id, req });

  res.json({ id: device.id, apiKey: key });
});

export default router;
