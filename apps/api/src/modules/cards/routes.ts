import { Router } from 'express';
import { assignCardSchema, blockCardSchema, createCardSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { toCardListItem } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { parseBody, parseQuery, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

const cardInclude = {
  assignments: {
    where: { releasedAt: null },
    include: { user: { select: { id: true, firstName: true, lastName: true, employeeNo: true } } },
  },
} satisfies Prisma.CardInclude;

const listSchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['ACTIVE', 'BLOCKED', 'LOST']).optional(),
  assigned: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

router.get('/', requirePermission(PERMISSIONS.CARD_READ), async (req, res) => {
  const query = parseQuery(listSchema, req);
  const where: Prisma.CardWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { uid: { contains: query.search, mode: 'insensitive' } },
            { label: { contains: query.search, mode: 'insensitive' } },
            { assignments: { some: { releasedAt: null, user: { OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { employeeNo: { contains: query.search, mode: 'insensitive' } },
            ] } } } },
          ],
        }
      : {}),
    ...(query.assigned === 'true' ? { assignments: { some: { releasedAt: null } } } : {}),
    ...(query.assigned === 'false' ? { assignments: { none: { releasedAt: null } } } : {}),
  };

  const [total, cards] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.findMany({
      where,
      include: cardInclude,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({ items: cards.map(toCardListItem), page: query.page, pageSize: query.pageSize, total });
});

router.post('/', requirePermission(PERMISSIONS.CARD_MANAGE), async (req, res) => {
  const input = parseBody(createCardSchema, req);
  const uid = input.uid.trim().toUpperCase();

  const duplicate = await prisma.card.findFirst({ where: { uid }, select: { id: true } });
  if (duplicate) throw new AppError(409, 'Энэ UID-тай карт бүртгэгдсэн байна', 'DUPLICATE_CARD');

  const card = await prisma.$transaction(async (tx) => {
    const created = await tx.card.create({ data: { uid, label: input.label || null } });
    if (input.userId) {
      const user = await tx.user.findFirst({ where: { id: input.userId, deletedAt: null } });
      if (!user) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NO_USER');
      await tx.cardAssignment.updateMany({
        where: { OR: [{ cardId: created.id }, { userId: user.id }], releasedAt: null },
        data: { releasedAt: new Date() },
      });
      await tx.cardAssignment.create({
        data: { cardId: created.id, userId: user.id, assignedById: req.auth!.id },
      });
    }
    return tx.card.findUniqueOrThrow({ where: { id: created.id }, include: cardInclude });
  });

  await writeAudit({
    actorId: req.auth!.id,
    action: 'card.create',
    entity: 'card',
    entityId: card.id,
    after: { uid: card.uid },
    req,
  });

  res.status(201).json({ card: toCardListItem(card) });
});

router.post('/:id/assign', requirePermission(PERMISSIONS.CARD_MANAGE), async (req, res) => {
  const { userId } = parseBody(assignCardSchema, req);
  const card = await prisma.card.findUnique({ where: { id: pathId(req.params.id) } });
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');
  if (card.status !== 'ACTIVE') throw new AppError(400, 'Карт идэвхгүй байна', 'CARD_BLOCKED');

  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NO_USER');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.cardAssignment.updateMany({
      where: { OR: [{ cardId: card.id }, { userId: user.id }], releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await tx.cardAssignment.create({
      data: { cardId: card.id, userId: user.id, assignedById: req.auth!.id },
    });
    return tx.card.findUniqueOrThrow({ where: { id: card.id }, include: cardInclude });
  });

  await writeAudit({
    actorId: req.auth!.id,
    action: 'card.assign',
    entity: 'card',
    entityId: card.id,
    after: { userId: user.id },
    req,
  });

  res.json({ card: toCardListItem(updated) });
});

router.post('/:id/release', requirePermission(PERMISSIONS.CARD_MANAGE), async (req, res) => {
  const card = await prisma.card.findUnique({ where: { id: pathId(req.params.id) } });
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');

  await prisma.cardAssignment.updateMany({
    where: { cardId: card.id, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  await writeAudit({ actorId: req.auth!.id, action: 'card.release', entity: 'card', entityId: card.id, req });

  res.json({ ok: true });
});

router.post('/:id/block', requirePermission(PERMISSIONS.CARD_BLOCK), async (req, res) => {
  const input = parseBody(blockCardSchema, req);
  const card = await prisma.card.findUnique({ where: { id: pathId(req.params.id) } });
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');
  if (card.status === 'BLOCKED') throw new AppError(400, 'Карт аль хэдийн идэвхгүй байна', 'ALREADY_BLOCKED');

  const updated = await prisma.card.update({
    where: { id: card.id },
    data: {
      status: 'BLOCKED',
      blockedAt: new Date(),
      blockedById: req.auth!.id,
      blockReason: input.reason || null,
    },
    include: cardInclude,
  });

  await writeAudit({
    actorId: req.auth!.id,
    action: 'card.block',
    entity: 'card',
    entityId: card.id,
    before: { status: card.status },
    after: { status: 'BLOCKED', reason: input.reason ?? null },
    req,
  });

  res.json({ card: toCardListItem(updated) });
});

router.post('/:id/unblock', requirePermission(PERMISSIONS.CARD_MANAGE), async (req, res) => {
  const card = await prisma.card.findUnique({ where: { id: pathId(req.params.id) } });
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');
  if (card.status === 'ACTIVE') throw new AppError(400, 'Карт идэвхтэй байна', 'ALREADY_ACTIVE');

  const updated = await prisma.card.update({
    where: { id: card.id },
    data: { status: 'ACTIVE', blockedAt: null, blockedById: null, blockReason: null },
    include: cardInclude,
  });

  await writeAudit({
    actorId: req.auth!.id,
    action: 'card.unblock',
    entity: 'card',
    entityId: card.id,
    before: { status: card.status },
    after: { status: 'ACTIVE' },
    req,
  });

  res.json({ card: toCardListItem(updated) });
});

router.get('/:id/history', requirePermission(PERMISSIONS.CARD_READ), async (req, res) => {
  const card = await prisma.card.findUnique({ where: { id: pathId(req.params.id) } });
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');

  const [assignments, scans] = await Promise.all([
    prisma.cardAssignment.findMany({
      where: { cardId: card.id },
      include: { user: { select: { firstName: true, lastName: true, employeeNo: true } } },
      orderBy: { assignedAt: 'desc' },
      take: 20,
    }),
    prisma.scanEvent.findMany({
      where: { cardId: card.id },
      orderBy: { receivedAt: 'desc' },
      take: 20,
      include: { period: true, user: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  res.json({
    card: { id: card.id, uid: card.uid, status: card.status, label: card.label },
    assignments: assignments.map((a) => ({
      id: a.id,
      userName: `${a.user.lastName} ${a.user.firstName}`,
      employeeNo: a.user.employeeNo,
      assignedAt: a.assignedAt.toISOString(),
      releasedAt: a.releasedAt ? a.releasedAt.toISOString() : null,
    })),
    scans: scans.map((s) => ({
      id: s.id.toString(),
      decision: s.decision,
      periodCode: s.period?.code ?? null,
      businessDate: s.businessDate.toISOString().slice(0, 10),
      scannedAt: s.scannedAt.toISOString(),
      userName: s.user ? `${s.user.lastName} ${s.user.firstName}` : null,
    })),
  });
});

export default router;
