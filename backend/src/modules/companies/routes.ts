import { Router } from 'express';
import { createCompanySchema, updateCompanySchema } from '@shared/schemas';
import { PERMISSIONS } from '@shared/permissions';
import { one, query } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/sql';
import { parseBody, pathId } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();

interface CompanyRow {
  id: string;
  name: string;
  userCount: number;
  createdAt: Date;
}

const COMPANY_SELECT = `
  SELECT co.id,
         co.name,
         co.created_at AS "createdAt",
         (SELECT COUNT(*)::int FROM users u WHERE u.company_id = co.id AND u.deleted_at IS NULL) AS "userCount"
    FROM companies co
`;

function toCompany(row: CompanyRow) {
  return {
    id: row.id,
    name: row.name,
    userCount: row.userCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Хэрэглэгч бүртгэх форм болон тохиргоонд зориулсан жагсаалт */
router.get('/', authenticate, requirePermission(PERMISSIONS.USER_READ), async (_req, res) => {
  const rows = await query<CompanyRow>(`${COMPANY_SELECT} ORDER BY co.name ASC`);
  res.json({ items: rows.map(toCompany) });
});

router.post('/', authenticate, requirePermission(PERMISSIONS.USER_CREATE), async (req, res) => {
  const input = parseBody(createCompanySchema, req);
  try {
    const company = await one<CompanyRow>(
      `INSERT INTO companies (name) VALUES ($1)
       RETURNING id, name, created_at AS "createdAt", 0::int AS "userCount"`,
      [input.name],
    );
    if (!company) throw new AppError(500, 'Компани үүссэнгүй', 'CREATE_FAILED');

    await writeAudit({
      actorId: req.auth!.id,
      action: 'company.create',
      entity: 'company',
      entityId: company.id,
      after: { name: company.name },
      req,
    });
    res.status(201).json({ company: toCompany(company) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм нэртэй компани бүртгэгдсэн байна', 'DUPLICATE_COMPANY');
    }
    throw error;
  }
});

router.patch('/:id', authenticate, requirePermission(PERMISSIONS.USER_UPDATE), async (req, res) => {
  const id = pathId(req.params.id);
  const input = parseBody(updateCompanySchema, req);
  const before = await one<CompanyRow>(`${COMPANY_SELECT} WHERE co.id = $1::uuid`, [id]);
  if (!before) throw new AppError(404, 'Компани олдсонгүй', 'NOT_FOUND');
  if (input.name === undefined) throw new AppError(400, 'Өөрчлөх талбар байхгүй', 'NO_CHANGES');

  try {
    const updated = await one<CompanyRow>(
      `UPDATE companies SET name = $1 WHERE id = $2::uuid
       RETURNING id, name, created_at AS "createdAt",
         (SELECT COUNT(*)::int FROM users u WHERE u.company_id = $2::uuid AND u.deleted_at IS NULL) AS "userCount"`,
      [input.name, id],
    );
    if (!updated) throw new AppError(404, 'Компани олдсонгүй', 'NOT_FOUND');

    await writeAudit({
      actorId: req.auth!.id,
      action: 'company.update',
      entity: 'company',
      entityId: id,
      before: { name: before.name },
      after: { name: updated.name },
      req,
    });
    res.json({ company: toCompany(updated) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'Ийм нэртэй компани бүртгэгдсэн байна', 'DUPLICATE_COMPANY');
    }
    throw error;
  }
});

export default router;
