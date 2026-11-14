import { z } from 'zod';
import { GROUPINGS, PERIOD_CODES, SCAN_DECISIONS } from './meal';
import { PERMISSIONS, ROLES } from './permissions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const email = z.string().trim().min(3).max(160).regex(EMAIL_RE, 'И-мэйл буруу байна');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо YYYY-MM-DD байх ёстой');
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const imageDataUrl = z
  .string()
  .max(1_500_000, 'Зураг хэт том байна')
  .refine((value) => IMAGE_DATA_URL_RE.test(value), 'Зураг PNG, JPEG, WebP, GIF эсвэл SVG байх ёстой');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Нууц үг шаардлагатай').max(200),
});

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().regex(PHONE_RE, 'Утасны дугаар буруу').optional().or(z.literal('')),
    unit: z.string().trim().max(80).optional().or(z.literal('')),
    position: z.string().trim().max(80).optional().or(z.literal('')),
    photoUrl: imageDataUrl.nullable().optional(),
    currentPassword: z.string().max(200).optional(),
    newPassword: z.string().min(8, 'Шинэ нууц үг 8+ тэмдэгт').max(200).optional(),
  })
  .refine((value) => !value.newPassword || Boolean(value.currentPassword), {
    message: 'Одоогийн нууц үг шаардлагатай',
    path: ['currentPassword'],
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createUserSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Ажилтны дугаар шаардлагатай').max(32),
  firstName: z.string().trim().min(1, 'Нэр шаардлагатай').max(80),
  lastName: z.string().trim().min(1, 'Овог шаардлагатай').max(80),
  email,
  phone: z.string().trim().regex(PHONE_RE, 'Утасны дугаар буруу').optional().or(z.literal('')),
  password: z.string().min(8, 'Нууц үг 8+ тэмдэгт').max(200).optional(),
  canLogin: z.boolean().default(true),
  role: z.enum(ROLES).default('USER'),
  departmentId: z.string().uuid().nullish(),
  companyId: z.string().uuid().nullish(),
  unit: z.string().trim().max(80).optional().or(z.literal('')),
  position: z.string().trim().max(80).optional().or(z.literal('')),
  photoUrl: imageDataUrl.nullable().optional(),
  cardUid: z.string().trim().min(4, 'Картын UID шаардлагатай').max(64),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  email: email.optional(),
  phone: z.string().trim().regex(PHONE_RE).optional().or(z.literal('')),
  role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  canLogin: z.boolean().optional(),
  departmentId: z.string().uuid().nullish(),
  companyId: z.string().uuid().nullish(),
  unit: z.string().trim().max(80).optional().or(z.literal('')),
  position: z.string().trim().max(80).optional().or(z.literal('')),
  photoUrl: imageDataUrl.nullable().optional(),
  password: z.string().min(8).max(200).optional(),
});

export const updateUserPermissionsSchema = z.object({
  overrides: z
    .array(
      z.object({
        permission: z
          .string()
          .refine(
            (value) => (Object.values(PERMISSIONS) as string[]).includes(value),
            'Эрх буруу байна',
          ),
        allow: z.boolean(),
      }),
    )
    .max(50),
});
export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;

export const createCardSchema = z.object({
  uid: z.string().trim().min(4, 'Картын UID хэт богино').max(64),
  label: z.string().trim().max(80).optional().or(z.literal('')),
  userId: z.string().uuid().nullish(),
});

export const assignCardSchema = z.object({
  userId: z.string().uuid(),
});

export const blockCardSchema = z.object({
  reason: z.string().trim().max(200).optional().or(z.literal('')),
});

export const scanSchema = z.object({
  cardUid: z.string().trim().min(4, 'Картын UID шаардлагатай').max(64),
  scannedAt: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
  locationId: z.string().uuid('Байршил сонгоно уу'),
  deviceCode: z.string().trim().max(64).optional(),
  source: z.enum(['KIOSK', 'READER_AGENT', 'MANUAL']).default('KIOSK'),
});
export type ScanInput = z.infer<typeof scanSchema>;

export const voidScanSchema = z.object({
  reason: z.string().trim().min(3, 'Шалтгаан бичнэ үү').max(200),
});

export const reportQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  groupBy: z.enum(GROUPINGS).default('day'),
  period: z.enum(PERIOD_CODES).optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  includeVoided: z.enum(['true', 'false']).default('false'),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const updatePeriodSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  startTime: z.string().regex(TIME_RE, 'Цаг HH:mm байх ёстой').optional(),
  endTime: z.string().regex(TIME_RE, 'Цаг HH:mm байх ёстой').optional(),
  crossesMidnight: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const brandingSchema = z.object({
  companyName: z.string().trim().max(120).default('Food POS'),
  footerText: z.string().trim().max(300).default(''),
  copyright: z.string().trim().max(200).default(''),
  logoUrl: z
    .string()
    .max(1_500_000)
    .nullable()
    .default(null)
    .refine(
      (value) => !value || /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(value),
      'Лого нь PNG, JPEG, WebP, GIF эсвэл SVG зураг байх ёстой',
    ),
});
export type BrandingInput = z.infer<typeof brandingSchema>;

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, 'Байршлын нэр шаардлагатай').max(80),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, 'Компанийн нэр шаардлагатай').max(120),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

export const recentScansQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const createDeviceSchema = z.object({
  code: z.string().trim().min(2).max(64),
  name: z.string().trim().min(1).max(80),
  location: z.string().trim().max(120).optional().or(z.literal('')),
});

export const listScansQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  decision: z.enum(SCAN_DECISIONS).optional(),
  userId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  period: z.enum(PERIOD_CODES).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  access: z.enum(['LOGIN', 'CARD']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
