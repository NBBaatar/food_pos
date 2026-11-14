import { Router } from 'express';
import { brandingSchema } from '@shared/schemas';
import type { Branding } from '@shared/types';
import { PERMISSIONS } from '@shared/permissions';
import { one } from '../../db/pool';
import { writeAudit } from '../../lib/audit';
import { parseBody } from '../../lib/validate';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';

const router = Router();

const DEFAULT_BRANDING: Branding = {
  companyName: 'Food POS',
  footerText: 'Хоолны бүртгэлийн систем',
  copyright: `© ${new Date().getFullYear()} Food POS`,
  logoUrl: null,
};

async function getBranding(): Promise<Branding> {
  const row = await one<{ value: Partial<Branding> }>(
    `SELECT value FROM settings WHERE key = 'branding'`,
  );
  return {
    companyName: row?.value.companyName ?? DEFAULT_BRANDING.companyName,
    footerText: row?.value.footerText ?? DEFAULT_BRANDING.footerText,
    copyright: row?.value.copyright ?? DEFAULT_BRANDING.copyright,
    logoUrl: row?.value.logoUrl ?? null,
  };
}

/** Нийтэд нээлтэй — footer болон логог бүх хуудсанд харуулна */
router.get('/branding', async (_req, res) => {
  res.json(await getBranding());
});

router.put(
  '/branding',
  authenticate,
  requirePermission(PERMISSIONS.BRANDING_MANAGE),
  async (req, res) => {
    const input = parseBody(brandingSchema, req);
    const before = await getBranding();
    const value: Branding = {
      companyName: input.companyName,
      footerText: input.footerText,
      copyright: input.copyright,
      logoUrl: input.logoUrl || null,
    };

    await one(
      `INSERT INTO settings (key, value) VALUES ('branding', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING key`,
      [JSON.stringify(value)],
    );

    await writeAudit({
      actorId: req.auth!.id,
      action: 'branding.update',
      entity: 'settings',
      entityId: 'branding',
      before,
      after: { ...value, logoUrl: value.logoUrl ? '[logo]' : null },
      req,
    });

    res.json(value);
  },
);

export default router;
