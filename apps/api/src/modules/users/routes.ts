import { Router } from 'express';
import { createUserSchema, listQuerySchema, updateUserSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { toUserListItem } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { generatePassword, hashPassword } from '../../lib/password';
import { addDaysIso, businessDateFor } from '../../lib/time';
import { parseBody, parseQuery, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { env } from '../../config/env';

const router = Router();
router.use(authenticate);

const userInclude = {
  department: true,
  assignments: { where: { releasedAt: null }, include: { card: true } },
} satisfies Prisma.UserInclude;

router.get('/', requirePermission(PERMISSIONS.USER_READ), async (req, res) => {
  const query = parseQuery(listQuerySchema, req);
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { employeeNo: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({ items: users.map(toUserListItem), page: query.page, pageSize: query.pageSize, total });
});

router.post('/', requirePermission(PERMISSIONS.USER_CREATE), async (req, res) => {
  const input = parseBody(createUserSchema, req);
  const actor = req.auth!;

  // Хэрэглэгч түвшин зөвхөн энгийн хэрэглэгч нэмнэ; ADMIN эрхийг зөвхөн ADMIN олгоно.
  if (actor.role === 'USER' && input.role !== 'USER') {
    throw new AppError(403, 'Зөвхөн хэрэглэгч нэмэх эрхтэй', 'FORBIDDEN');
  }
  if (input.role === 'ADMIN' && actor.role !== 'ADMIN') {
    throw new AppError(403, 'Админ эрх олгох эрх хүрэхгүй', 'FORBIDDEN');
  }

  const email = input.email.toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { employeeNo: input.employeeNo }] },
    select: { id: true, email: true, employeeNo: true },
  });
  if (existing) {
    throw new AppError(409, 'Ийм и-мэйл эсвэл ажилтны дугаар бүртгэгдсэн байна', 'DUPLICATE_USER');
  }

  const temporaryPassword = input.password ?? generatePassword(10);
  const passwordHash = await hashPassword(temporaryPassword);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        employeeNo: input.employeeNo,
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phone: input.phone || null,
        passwordHash,
        role: input.role,
        status: 'ACTIVE',
        mustChangePassword: !input.password,
        departmentId: input.departmentId ?? null,
      },
      include: userInclude,
    });

    if (input.cardUid) {
      const uid = input.cardUid.trim().toUpperCase();
      const card = await tx.card.upsert({
        where: { uid },
        update: {},
        create: { uid, label: `${input.lastName} ${input.firstName}` },
      });
      if (card.status !== 'ACTIVE') {
        throw new AppError(400, 'Карт идэвхгүй байна. Өөр карт сонгоно уу.', 'CARD_BLOCKED');
      }
      await tx.cardAssignment.updateMany({
        where: { OR: [{ cardId: card.id }, { userId: user.id }], releasedAt: null },
        data: { releasedAt: new Date() },
      });
      await tx.cardAssignment.create({
        data: { cardId: card.id, userId: user.id, assignedById: actor.id },
      });
    }

    return tx.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
  });

  await writeAudit({
    actorId: actor.id,
    action: 'user.create',
    entity: 'user',
    entityId: created.id,
    after: { employeeNo: created.employeeNo, role: created.role },
    req,
  });

  res.status(201).json({
    user: toUserListItem(created),
    temporaryPassword: input.password ? undefined : temporaryPassword,
  });
});

router.get('/:id', requirePermission(PERMISSIONS.USER_READ), async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: pathId(req.params.id), deletedAt: null },
    include: {
      department: true,
      assignments: { where: { releasedAt: null }, include: { card: true } },
    },
  });
  if (!user) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

  const today = businessDateFor(new Date(), env.DAY_START_HOUR);
  const from = addDaysIso(today, -29);

  const [byPeriod, recentScans, cards] = await Promise.all([
    prisma.mealRecord.groupBy({
      by: ['periodId'],
      where: {
        userId: user.id,
        voidedAt: null,
        businessDate: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${today}T00:00:00.000Z`) },
      },
      _count: { _all: true },
    }),
    prisma.scanEvent.findMany({
      where: { userId: user.id },
      include: { period: true },
      orderBy: { receivedAt: 'desc' },
      take: 8,
    }),
    prisma.cardAssignment.findMany({
      where: { userId: user.id },
      include: { card: true },
      orderBy: { assignedAt: 'desc' },
    }),
  ]);

  const periods = await prisma.mealPeriod.findMany();
  const periodById = new Map(periods.map((p) => [p.id, p.code]));

  res.json({
    user: toUserListItem(user),
    stats: {
      last30Days: byPeriod.reduce((sum, row) => sum + row._count._all, 0),
      byPeriod: byPeriod.map((row) => ({
        periodCode: periodById.get(row.periodId) ?? null,
        count: row._count._all,
      })),
    },
    cards: cards.map((assignment) => ({
      id: assignment.card.id,
      uid: assignment.card.uid,
      status: assignment.card.status,
      assignedAt: assignment.assignedAt.toISOString(),
      releasedAt: assignment.releasedAt ? assignment.releasedAt.toISOString() : null,
    })),
    recentScans: recentScans.map((scan) => ({
      id: scan.id.toString(),
      decision: scan.decision,
      scannedAt: scan.scannedAt.toISOString(),
      businessDate: scan.businessDate.toISOString().slice(0, 10),
      periodCode: scan.period?.code ?? null,
    })),
  });
});

router.patch('/:id', requirePermission(PERMISSIONS.USER_UPDATE), async (req, res) => {
  const input = parseBody(updateUserSchema, req);
  const actor = req.auth!;
  const target = await prisma.user.findFirst({ where: { id: pathId(req.params.id), deletedAt: null } });
  if (!target) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

  if (actor.role !== 'ADMIN' && (target.role === 'ADMIN' || input.role === 'ADMIN')) {
    throw new AppError(403, 'Админ хэрэглэгчийг засах эрх хүрэхгүй', 'FORBIDDEN');
  }
  if (input.role && target.id === actor.id) {
    throw new AppError(400, 'Өөрийн эрхийг өөрчлөх боломжгүй', 'SELF_ROLE');
  }

  const data: Prisma.UserUpdateInput = {
    ...(input.firstName ? { firstName: input.firstName } : {}),
    ...(input.lastName ? { lastName: input.lastName } : {}),
    ...(input.email ? { email: input.email.toLowerCase() } : {}),
    ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.departmentId !== undefined
      ? input.departmentId
        ? { department: { connect: { id: input.departmentId } } }
        : { department: { disconnect: true } }
      : {}),
    ...(input.password
      ? { passwordHash: await hashPassword(input.password), mustChangePassword: false }
      : {}),
  };

  const updated = await prisma.user.update({ where: { id: target.id }, data, include: userInclude });

  await writeAudit({
    actorId: actor.id,
    action: 'user.update',
    entity: 'user',
    entityId: target.id,
    before: { role: target.role, status: target.status, email: target.email },
    after: { role: updated.role, status: updated.status, email: updated.email },
    req,
  });

  res.json({ user: toUserListItem(updated) });
});

router.patch('/:id/status', requirePermission(PERMISSIONS.USER_DEACTIVATE), async (req, res) => {
  const actor = req.auth!;
  const target = await prisma.user.findFirst({ where: { id: pathId(req.params.id), deletedAt: null } });
  if (!target) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');
  if (target.id === actor.id) throw new AppError(400, 'Өөрийгөө идэвхгүй болгох боломжгүй', 'SELF');
  if (target.role === 'ADMIN' && actor.role !== 'ADMIN') {
    throw new AppError(403, 'Админыг идэвхгүй болгох эрх хүрэхгүй', 'FORBIDDEN');
  }

  const nextStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { status: nextStatus },
    include: userInclude,
  });

  if (nextStatus === 'INACTIVE') {
    await prisma.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await writeAudit({
    actorId: actor.id,
    action: nextStatus === 'INACTIVE' ? 'user.deactivate' : 'user.activate',
    entity: 'user',
    entityId: target.id,
    before: { status: target.status },
    after: { status: nextStatus },
    req,
  });

  res.json({ user: toUserListItem(updated) });
});

router.post('/:id/reset-password', requirePermission(PERMISSIONS.USER_UPDATE), async (req, res) => {
  const actor = req.auth!;
  const target = await prisma.user.findFirst({ where: { id: pathId(req.params.id), deletedAt: null } });
  if (!target) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');
  if (target.role === 'ADMIN' && actor.role !== 'ADMIN') {
    throw new AppError(403, 'Админы нууц үгийг сэргээх эрх хүрэхгүй', 'FORBIDDEN');
  }

  const temporaryPassword = generatePassword(10);
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
  });
  await prisma.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit({ actorId: actor.id, action: 'user.reset_password', entity: 'user', entityId: target.id, req });

  res.json({ temporaryPassword });
});

export default router;
