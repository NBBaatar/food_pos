import { Router } from 'express';
import { assignCardSchema, blockCardSchema, createCardSchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { z } from 'zod';
import { execute, one, query, withTransaction } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { toCardListItem, type CardRow } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { isUniqueViolation, limitOffset, param } from '../../lib/sql';
import { parseBody, parseQuery, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

const CARD_SELECT = `
  SELECT c.id, c.uid, c.label, c.status,
         h.user_id AS "holderId",
         CASE WHEN h.user_id IS NULL THEN NULL ELSE h.last_name || ' ' || h.first_name END AS "holderName",
         h.assigned_at AS "assignedAt",
         c.created_at AS "createdAt"
    FROM cards c
    LEFT JOIN LATERAL (
      SELECT u.id AS user_id, u.first_name, u.last_name, ca.assigned_at
        FROM card_assignments ca
        JOIN users u ON u.id = ca.user_id
       WHERE ca.card_id = c.id AND ca.released_at IS NULL
       LIMIT 1
    ) h ON true
`;

const listSchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['ACTIVE', 'BLOCKED', 'LOST']).optional(),
  assigned: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

async function findCardById(id: string): Promise<CardRow | null> {
  return one<CardRow>(`${CARD_SELECT} WHERE c.id = $1::uuid`, [id]);
}

router.get('/', requirePermission(PERMISSIONS.CARD_READ), async (req, res) => {
  const input = parseQuery(listSchema, req);
  const params: unknown[] = [];
  const where: string[] = [];

  if (input.status) where.push(`c.status = ${param(params, input.status)}`);
  if (input.assigned === 'true') {
    where.push('EXISTS (SELECT 1 FROM card_assignments ca WHERE ca.card_id = c.id AND ca.released_at IS NULL)');
  }
  if (input.assigned === 'false') {
    where.push('NOT EXISTS (SELECT 1 FROM card_assignments ca WHERE ca.card_id = c.id AND ca.released_at IS NULL)');
  }
  if (input.search) {
    const like = param(params, `%${input.search}%`);
    where.push(`(c.uid ILIKE ${like} OR c.label ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM card_assignments ca JOIN users u ON u.id = ca.user_id
         WHERE ca.card_id = c.id AND ca.released_at IS NULL
           AND (u.first_name ILIKE ${like} OR u.last_name ILIKE ${like} OR u.employee_no ILIKE ${like})
      ))`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [totalRow, cards] = await Promise.all([
    one<{ total: number }>(`SELECT COUNT(*)::int AS total FROM cards c ${whereSql}`, params),
    query<CardRow>(
      `${CARD_SELECT} ${whereSql} ORDER BY c.created_at DESC, c.id DESC ${limitOffset(input.page, input.pageSize)}`,
      params,
    ),
  ]);

  res.json({
    items: cards.map(toCardListItem),
    page: input.page,
    pageSize: input.pageSize,
    total: totalRow?.total ?? 0,
  });
});

router.post('/', requirePermission(PERMISSIONS.CARD_MANAGE), async (req, res) => {
  const input = parseBody(createCardSchema, req);
  const uid = input.uid.trim().toUpperCase();

  try {
    const cardId = await withTransaction(async (client) => {
      const created = await client.query<{ id: string }>(
        'INSERT INTO cards (uid, label) VALUES ($1, $2) RETURNING id',
        [uid, input.label || null],
      );
      const id = created.rows[0]!.id;

      if (input.userId) {
        const user = await client.query('SELECT id FROM users WHERE id = $1::uuid AND deleted_at IS NULL', [
          input.userId,
        ]);
        if (user.rowCount === 0) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NO_USER');
        await client.query(
          `UPDATE card_assignments SET released_at = now()
            WHERE released_at IS NULL AND (card_id = $1::uuid OR user_id = $2::uuid)`,
          [id, input.userId],
        );
        await client.query(
          `INSERT INTO card_assignments (card_id, user_id, assigned_by_id)
           VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          [id, input.userId, req.auth!.id],
        );
      }
      return id;
    });

    const card = await findCardById(cardId);
    if (!card) throw new AppError(500, 'Карт үүссэнгүй', 'CREATE_FAILED');

    await writeAudit({
      actorId: req.auth!.id,
      action: 'card.create',
      entity: 'card',
      entityId: card.id,
      after: { uid: card.uid },
      req,
    });

    res.status(201).json({ card: toCardListItem(card) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Энэ UID-тай карт бүртгэгдсэн байна', 'DUPLICATE_CARD');
    }
    throw error;
  }
});

router.post('/:id/assign', requirePermission(PERMISSIONS.CARD_MANAGE), async (req, res) => {
  const { userId } = parseBody(assignCardSchema, req);
  const card = await one<{ id: string; status: string }>('SELECT id, status FROM cards WHERE id = $1::uuid', [
    pathId(req.params.id),
  ]);
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');
  if (card.status !== 'ACTIVE') throw new AppError(400, 'Карт идэвхгүй байна', 'CARD_BLOCKED');

  const user = await one('SELECT id FROM users WHERE id = $1::uuid AND deleted_at IS NULL', [userId]);
  if (!user) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NO_USER');

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE card_assignments SET released_at = now()
        WHERE released_at IS NULL AND (card_id = $1::uuid OR user_id = $2::uuid)`,
      [card.id, userId],
    );
    await client.query(
      `INSERT INTO card_assignments (card_id, user_id, assigned_by_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid)`,
      [card.id, userId, req.auth!.id],
    );
  });

  const updated = await findCardById(card.id);
  if (!updated) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');

  await writeAudit({
    actorId: req.auth!.id,
    action: 'card.assign',
    entity: 'card',
    entityId: card.id,
    after: { userId },
    req,
  });

  res.json({ card: toCardListItem(updated) });
});

router.post('/:id/release', requirePermission(PERMISSIONS.CARD_MANAGE), async (req, res) => {
  const card = await one('SELECT id FROM cards WHERE id = $1::uuid', [pathId(req.params.id)]);
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');

  await execute('UPDATE card_assignments SET released_at = now() WHERE card_id = $1::uuid AND released_at IS NULL', [
    pathId(req.params.id),
  ]);
  await writeAudit({
    actorId: req.auth!.id,
    action: 'card.release',
    entity: 'card',
    entityId: pathId(req.params.id),
    req,
  });

  res.json({ ok: true });
});

router.post('/:id/block', requirePermission(PERMISSIONS.CARD_BLOCK), async (req, res) => {
  const input = parseBody(blockCardSchema, req);
  const card = await one<{ id: string; status: string }>('SELECT id, status FROM cards WHERE id = $1::uuid', [
    pathId(req.params.id),
  ]);
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');
  if (card.status === 'BLOCKED') throw new AppError(400, 'Карт аль хэдийн идэвхгүй байна', 'ALREADY_BLOCKED');

  await execute(
    `UPDATE cards
        SET status = 'BLOCKED', blocked_at = now(), blocked_by_id = $2::uuid, block_reason = $3, updated_at = now()
      WHERE id = $1::uuid`,
    [card.id, req.auth!.id, input.reason || null],
  );

  const updated = await findCardById(card.id);
  if (!updated) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');

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
  const card = await one<{ id: string; status: string }>('SELECT id, status FROM cards WHERE id = $1::uuid', [
    pathId(req.params.id),
  ]);
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');
  if (card.status === 'ACTIVE') throw new AppError(400, 'Карт идэвхтэй байна', 'ALREADY_ACTIVE');

  await execute(
    `UPDATE cards
        SET status = 'ACTIVE', blocked_at = NULL, blocked_by_id = NULL, block_reason = NULL, updated_at = now()
      WHERE id = $1::uuid`,
    [card.id],
  );

  const updated = await findCardById(card.id);
  if (!updated) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');

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
  const card = await one<{ id: string; uid: string; status: string; label: string | null }>(
    'SELECT id, uid, status, label FROM cards WHERE id = $1::uuid',
    [pathId(req.params.id)],
  );
  if (!card) throw new AppError(404, 'Карт олдсонгүй', 'NOT_FOUND');

  const [assignments, scans] = await Promise.all([
    query<{
      id: string;
      userName: string;
      employeeNo: string;
      assignedAt: Date;
      releasedAt: Date | null;
    }>(
      `SELECT ca.id, u.last_name || ' ' || u.first_name AS "userName", u.employee_no AS "employeeNo",
              ca.assigned_at AS "assignedAt", ca.released_at AS "releasedAt"
         FROM card_assignments ca
         JOIN users u ON u.id = ca.user_id
        WHERE ca.card_id = $1::uuid
        ORDER BY ca.assigned_at DESC, ca.id DESC
        LIMIT 20`,
      [card.id],
    ),
    query<{
      id: string;
      decision: string;
      periodCode: string | null;
      businessDate: string;
      scannedAt: Date;
      userName: string | null;
    }>(
      `SELECT s.id::text AS id, s.decision, p.code AS "periodCode",
              to_char(s.business_date, 'YYYY-MM-DD') AS "businessDate",
              s.scanned_at AS "scannedAt",
              CASE WHEN u.id IS NULL THEN NULL ELSE u.last_name || ' ' || u.first_name END AS "userName"
         FROM scan_events s
         LEFT JOIN meal_periods p ON p.id = s.period_id
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.card_id = $1::uuid
        ORDER BY s.received_at DESC, s.id DESC
        LIMIT 20`,
      [card.id],
    ),
  ]);

  res.json({
    card: { id: card.id, uid: card.uid, status: card.status, label: card.label },
    assignments: assignments.map((a) => ({
      id: a.id,
      userName: a.userName,
      employeeNo: a.employeeNo,
      assignedAt: a.assignedAt.toISOString(),
      releasedAt: a.releasedAt ? a.releasedAt.toISOString() : null,
    })),
    scans: scans.map((s) => ({
      id: s.id,
      decision: s.decision,
      periodCode: s.periodCode,
      businessDate: s.businessDate,
      scannedAt: s.scannedAt.toISOString(),
      userName: s.userName,
    })),
  });
});

export default router;
