import { Router } from 'express';
import { createUserSchema, listQuerySchema, updateUserPermissionsSchema, updateUserSchema } from '@shared/schemas';
import {
  applyPermissionOverrides,
  PERMISSIONS,
  permissionsForRole,
  type Permission,
  type PermissionOverride,
  type Role,
} from '@shared/permissions';
import { env } from '../../config/env';
import { execute, one, query, withTransaction } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { toUserListItem, type UserRow } from '../../lib/dto';
import { AppError } from '../../lib/errors';
import { generatePassword, hashPassword } from '../../lib/password';
import { loadPermissionOverrides } from '../../lib/permissions';
import { isUniqueViolation, limitOffset, param } from '../../lib/sql';
import { addDaysIso, businessDateFor } from '../../lib/time';
import { parseBody, parseQuery, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();
router.use(authenticate);

const USER_FROM = `
  FROM users u
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN companies co ON co.id = u.company_id
  LEFT JOIN LATERAL (
    SELECT c.uid, c.status
      FROM card_assignments ca
      JOIN cards c ON c.id = ca.card_id
     WHERE ca.user_id = u.id AND ca.released_at IS NULL
     LIMIT 1
  ) c ON true
`;

const USER_COLUMNS = `
  u.id, u.employee_no AS "employeeNo", u.first_name AS "firstName", u.last_name AS "lastName",
  u.email, u.phone, u.role, u.status, u.can_login AS "canLogin", u.department_id AS "departmentId", d.name AS "departmentName",
  u.unit, u.position, u.photo_url AS "photoUrl",
  u.company_id AS "companyId", co.name AS "companyName",
  c.uid AS "cardUid", c.status AS "cardStatus", u.created_at AS "createdAt"
`;

async function findUserById(id: string): Promise<UserRow | null> {
  return one<UserRow>(`SELECT ${USER_COLUMNS} ${USER_FROM} WHERE u.id = $1::uuid AND u.deleted_at IS NULL`, [id]);
}

router.get('/', requirePermission(PERMISSIONS.USER_READ), async (req, res) => {
  const input = parseQuery(listQuerySchema, req);
  const params: unknown[] = [];
  const where = ['u.deleted_at IS NULL'];

  if (input.role) where.push(`u.role = ${param(params, input.role)}`);
  if (input.status) where.push(`u.status = ${param(params, input.status)}`);
  if (input.access) where.push(`u.can_login = ${input.access === 'LOGIN'}`);
  if (input.search) {
    const like = param(params, `%${input.search}%`);
    where.push(
      `(u.first_name ILIKE ${like} OR u.last_name ILIKE ${like} OR u.employee_no ILIKE ${like} OR u.email ILIKE ${like})`,
    );
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [totalRow, users] = await Promise.all([
    one<{ total: number }>(`SELECT COUNT(*)::int AS total FROM users u ${whereSql}`, params),
    query<UserRow>(
      `SELECT ${USER_COLUMNS} ${USER_FROM} ${whereSql}
        ORDER BY u.last_name ASC, u.first_name ASC
        ${limitOffset(input.page, input.pageSize)}`,
      params,
    ),
  ]);

  res.json({
    items: users.map(toUserListItem),
    page: input.page,
    pageSize: input.pageSize,
    total: totalRow?.total ?? 0,
  });
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
  const temporaryPassword = input.password ?? generatePassword(10);
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const created = await withTransaction(async (client) => {
      if (input.unit) {
        await client.query('INSERT INTO units (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [input.unit]);
      }
      if (input.position) {
        await client.query('INSERT INTO positions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [input.position]);
      }
      if (input.companyId) {
        const company = await client.query('SELECT 1 FROM companies WHERE id = $1::uuid', [input.companyId]);
        if ((company.rowCount ?? 0) === 0) {
          throw new AppError(400, 'Туслан гүйцэтгэгч компани олдсонгүй', 'INVALID_COMPANY');
        }
      }

      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users
           (employee_no, first_name, last_name, email, phone, password_hash, role, status,
            must_change_password, department_id, unit, position, photo_url, can_login, company_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9::uuid, $10, $11, $12, $13, $14::uuid)
         RETURNING id`,
        [
          input.employeeNo,
          input.firstName,
          input.lastName,
          email,
          input.phone || null,
          passwordHash,
          input.role,
          input.canLogin && !input.password,
          input.departmentId ?? null,
          input.unit || null,
          input.position || null,
          input.photoUrl || null,
          input.canLogin,
          input.companyId ?? null,
        ],
      );
      const userId = userResult.rows[0]!.id;

      if (input.cardUid) {
        const uid = input.cardUid.trim().toUpperCase();
        const card = await client.query<{ id: string; status: string }>(
          `INSERT INTO cards (uid, label) VALUES ($1, $2)
           ON CONFLICT (uid) DO UPDATE SET uid = EXCLUDED.uid
           RETURNING id, status`,
          [uid, `${input.lastName} ${input.firstName}`],
        );
        const cardRow = card.rows[0]!;
        if (cardRow.status !== 'ACTIVE') {
          throw new AppError(400, 'Карт идэвхгүй байна. Өөр карт сонгоно уу.', 'CARD_BLOCKED');
        }
        await client.query(
          `UPDATE card_assignments SET released_at = now()
            WHERE released_at IS NULL AND (card_id = $1::uuid OR user_id = $2::uuid)`,
          [cardRow.id, userId],
        );
        await client.query(
          `INSERT INTO card_assignments (card_id, user_id, assigned_by_id)
           VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          [cardRow.id, userId, actor.id],
        );
      }

      return userId;
    });

    const user = await findUserById(created);
    if (!user) throw new AppError(500, 'Хэрэглэгч үүссэнгүй', 'CREATE_FAILED');

    await writeAudit({
      actorId: actor.id,
      action: 'user.create',
      entity: 'user',
      entityId: user.id,
      after: { employeeNo: user.employeeNo, role: user.role },
      req,
    });

    res.status(201).json({
      user: toUserListItem(user),
      temporaryPassword: input.canLogin && !input.password ? temporaryPassword : undefined,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм и-мэйл эсвэл ажилтны дугаар бүртгэгдсэн байна', 'DUPLICATE_USER');
    }
    throw error;
  }
});

router.get('/:id', requirePermission(PERMISSIONS.USER_READ), async (req, res) => {
  const user = await findUserById(pathId(req.params.id));
  if (!user) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

  const today = businessDateFor(new Date(), env.DAY_START_HOUR);
  const from = addDaysIso(today, -29);

  const [byPeriod, recentScans, cards] = await Promise.all([
    query<{ periodCode: string | null; count: number }>(
      `SELECT p.code AS "periodCode", COUNT(m.id)::int AS count
         FROM meal_records m
         JOIN meal_periods p ON p.id = m.period_id
        WHERE m.user_id = $1::uuid AND m.voided_at IS NULL
          AND m.business_date BETWEEN $2::date AND $3::date
        GROUP BY p.code`,
      [user.id, from, today],
    ),
    query<{
      id: string;
      decision: string;
      scannedAt: Date;
      businessDate: string;
      periodCode: string | null;
    }>(
      `SELECT s.id::text AS id, s.decision, s.scanned_at AS "scannedAt",
              to_char(s.business_date, 'YYYY-MM-DD') AS "businessDate", p.code AS "periodCode"
         FROM scan_events s
         LEFT JOIN meal_periods p ON p.id = s.period_id
        WHERE s.user_id = $1::uuid
        ORDER BY s.received_at DESC
        LIMIT 8`,
      [user.id],
    ),
    query<{
      id: string;
      uid: string;
      status: string;
      assignedAt: Date;
      releasedAt: Date | null;
    }>(
      `SELECT c.id, c.uid, c.status, ca.assigned_at AS "assignedAt", ca.released_at AS "releasedAt"
         FROM card_assignments ca
         JOIN cards c ON c.id = ca.card_id
        WHERE ca.user_id = $1::uuid
        ORDER BY ca.assigned_at DESC`,
      [user.id],
    ),
  ]);

  res.json({
    user: toUserListItem(user),
    stats: {
      last30Days: byPeriod.reduce((sum, row) => sum + row.count, 0),
      byPeriod: byPeriod.map((row) => ({ periodCode: row.periodCode, count: row.count })),
    },
    cards: cards.map((card) => ({
      id: card.id,
      uid: card.uid,
      status: card.status,
      assignedAt: card.assignedAt.toISOString(),
      releasedAt: card.releasedAt ? card.releasedAt.toISOString() : null,
    })),
    recentScans: recentScans.map((scan) => ({
      id: scan.id,
      decision: scan.decision,
      scannedAt: scan.scannedAt.toISOString(),
      businessDate: scan.businessDate,
      periodCode: scan.periodCode,
    })),
  });
});

/** Хэрэглэгчийн үндсэн эрх + override-ууд (UI-д checkbox-оор харуулна) */
router.get('/:id/permissions', requirePermission(PERMISSIONS.USER_READ), async (req, res) => {
  const target = await one<{ id: string; role: Role }>(
    'SELECT id, role FROM users WHERE id = $1::uuid AND deleted_at IS NULL',
    [pathId(req.params.id)],
  );
  if (!target) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

  const overrides = target.role === 'ADMIN' ? [] : await loadPermissionOverrides(target.id);
  res.json({
    role: target.role,
    permissions: applyPermissionOverrides(target.role, overrides),
    overrides,
  });
});

/**
 * Override-уудыг бүхэлд нь солино. Зөвхөн ADMIN — эс бөгөөс MANAGER
 * өөртөө/бусдад нэмэлт эрх олгож эрх ахиулах боломжтой.
 */
router.put('/:id/permissions', requirePermission(PERMISSIONS.USER_UPDATE), async (req, res) => {
  const actor = req.auth!;
  if (actor.role !== 'ADMIN') {
    throw new AppError(403, 'Эрх өөрчлөх эрх зөвхөн админд байна', 'FORBIDDEN');
  }

  const input = parseBody(updateUserPermissionsSchema, req);
  const target = await one<{ id: string; role: Role }>(
    'SELECT id, role FROM users WHERE id = $1::uuid AND deleted_at IS NULL',
    [pathId(req.params.id)],
  );
  if (!target) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');
  if (target.role === 'ADMIN') {
    throw new AppError(400, 'Админ бүх эрхтэй тул эрх өөрчлөх боломжгүй', 'ADMIN_SUPERUSER');
  }

  // Давхардлыг арилгаж, рольоос ялгаагүй (no-op) override-ыг хасна
  const byPermission = new Map<string, boolean>();
  for (const override of input.overrides) byPermission.set(override.permission, override.allow);
  const defaults = new Set<string>(permissionsForRole(target.role));
  const overrides: PermissionOverride[] = [...byPermission.entries()]
    .filter(([permission, allow]) => defaults.has(permission) !== allow)
    .map(([permission, allow]) => ({ permission: permission as Permission, allow }));

  const before = await loadPermissionOverrides(target.id);
  await withTransaction(async (client) => {
    await client.query('DELETE FROM user_permissions WHERE user_id = $1::uuid', [target.id]);
    for (const override of overrides) {
      await client.query(
        `INSERT INTO user_permissions (user_id, permission_code, allow, updated_at)
         VALUES ($1::uuid, $2, $3, now())`,
        [target.id, override.permission, override.allow],
      );
    }
  });

  await writeAudit({
    actorId: actor.id,
    action: 'user.permissions',
    entity: 'user',
    entityId: target.id,
    before: { overrides: before },
    after: { overrides },
    req,
  });

  res.json({
    role: target.role,
    permissions: applyPermissionOverrides(target.role, overrides),
    overrides,
  });
});

router.patch('/:id', requirePermission(PERMISSIONS.USER_UPDATE), async (req, res) => {
  const input = parseBody(updateUserSchema, req);
  const actor = req.auth!;
  const target = await one<{ id: string; role: string; status: string; email: string }>(
    'SELECT id, role, status, email FROM users WHERE id = $1::uuid AND deleted_at IS NULL',
    [pathId(req.params.id)],
  );
  if (!target) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

  if (actor.role !== 'ADMIN' && (target.role === 'ADMIN' || input.role === 'ADMIN')) {
    throw new AppError(403, 'Админ хэрэглэгчийг засах эрх хүрэхгүй', 'FORBIDDEN');
  }
  if (input.role && target.id === actor.id) {
    throw new AppError(400, 'Өөрийн эрхийг өөрчлөх боломжгүй', 'SELF_ROLE');
  }

  const params: unknown[] = [];
  const sets: string[] = [];
  if (input.firstName) sets.push(`first_name = ${param(params, input.firstName)}`);
  if (input.lastName) sets.push(`last_name = ${param(params, input.lastName)}`);
  if (input.email) sets.push(`email = ${param(params, input.email.toLowerCase())}`);
  if (input.phone !== undefined) sets.push(`phone = ${param(params, input.phone || null)}`);
  if (input.role) sets.push(`role = ${param(params, input.role)}`);
  if (input.status) sets.push(`status = ${param(params, input.status)}`);
  if (input.canLogin !== undefined) sets.push(`can_login = ${param(params, input.canLogin)}`);
  if (input.departmentId !== undefined) {
    sets.push(`department_id = ${param(params, input.departmentId || null)}::uuid`);
  }
  if (input.companyId !== undefined) {
    if (input.companyId) {
      const company = await one('SELECT 1 FROM companies WHERE id = $1::uuid', [input.companyId]);
      if (!company) throw new AppError(400, 'Туслан гүйцэтгэгч компани олдсонгүй', 'INVALID_COMPANY');
    }
    sets.push(`company_id = ${param(params, input.companyId || null)}::uuid`);
  }
  if (input.unit !== undefined) {
    if (input.unit) await execute('INSERT INTO units (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [input.unit]);
    sets.push(`unit = ${param(params, input.unit || null)}`);
  }
  if (input.position !== undefined) {
    if (input.position) {
      await execute('INSERT INTO positions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [input.position]);
    }
    sets.push(`position = ${param(params, input.position || null)}`);
  }
  if (input.photoUrl !== undefined) sets.push(`photo_url = ${param(params, input.photoUrl || null)}`);
  if (input.password) {
    sets.push(`password_hash = ${param(params, await hashPassword(input.password))}`);
    sets.push('must_change_password = false');
  }
  if (sets.length === 0) throw new AppError(400, 'Өөрчлөх талбар байхгүй', 'NO_CHANGES');

  sets.push('updated_at = now()');
  const targetParam = param(params, target.id);

  try {
    await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ${targetParam}::uuid`, params);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм и-мэйл бүртгэгдсэн байна', 'DUPLICATE_EMAIL');
    }
    throw error;
  }

  if (input.canLogin === false) {
    await execute('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL', [
      target.id,
    ]);
  }

  const updated = await findUserById(target.id);
  if (!updated) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

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
  const target = await one<{ id: string; role: string; status: 'ACTIVE' | 'INACTIVE' }>(
    'SELECT id, role, status FROM users WHERE id = $1::uuid AND deleted_at IS NULL',
    [pathId(req.params.id)],
  );
  if (!target) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');
  if (target.id === actor.id) throw new AppError(400, 'Өөрийгөө идэвхгүй болгох боломжгүй', 'SELF');
  if (target.role === 'ADMIN' && actor.role !== 'ADMIN') {
    throw new AppError(403, 'Админыг идэвхгүй болгох эрх хүрэхгүй', 'FORBIDDEN');
  }

  const nextStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  await execute('UPDATE users SET status = $1, updated_at = now() WHERE id = $2::uuid', [nextStatus, target.id]);

  if (nextStatus === 'INACTIVE') {
    await execute('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL', [
      target.id,
    ]);
  }

  const updated = await findUserById(target.id);
  if (!updated) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');

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
  const target = await one<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE id = $1::uuid AND deleted_at IS NULL',
    [pathId(req.params.id)],
  );
  if (!target) throw new AppError(404, 'Хэрэглэгч олдсонгүй', 'NOT_FOUND');
  if (target.role === 'ADMIN' && actor.role !== 'ADMIN') {
    throw new AppError(403, 'Админы нууц үгийг сэргээх эрх хүрэхгүй', 'FORBIDDEN');
  }

  const temporaryPassword = generatePassword(10);
  await execute(
    `UPDATE users SET password_hash = $1, must_change_password = true, updated_at = now()
      WHERE id = $2::uuid`,
    [await hashPassword(temporaryPassword), target.id],
  );
  await execute('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL', [
    target.id,
  ]);
  await writeAudit({ actorId: actor.id, action: 'user.reset_password', entity: 'user', entityId: target.id, req });

  res.json({ temporaryPassword });
});

export default router;
