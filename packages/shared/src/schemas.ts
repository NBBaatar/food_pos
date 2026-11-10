import { z } from 'zod';
import { GROUPINGS, PERIOD_CODES, SCAN_DECISIONS } from './meal';
import { ROLES } from './permissions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const email = z.string().trim().min(3).max(160).regex(EMAIL_RE, 'И-мэйл буруу байна');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо YYYY-MM-DD байх ёстой');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Нууц үг шаардлагатай').max(200),
});

export const createUserSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Ажилтны дугаар шаардлагатай').max(32),
  firstName: z.string().trim().min(1, 'Нэр шаардлагатай').max(80),
  lastName: z.string().trim().min(1, 'Овог шаардлагатай').max(80),
  email,
  phone: z.string().trim().regex(PHONE_RE, 'Утасны дугаар буруу').optional().or(z.literal('')),
  password: z.string().min(8, 'Нууц үг 8+ тэмдэгт').max(200).optional(),
  role: z.enum(ROLES).default('USER'),
  departmentId: z.string().uuid().nullish(),
  cardUid: z.string().trim().min(4).max(64).optional().or(z.literal('')),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  email: email.optional(),
  phone: z.string().trim().regex(PHONE_RE).optional().or(z.literal('')),
  role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  departmentId: z.string().uuid().nullish(),
  password: z.string().min(8).max(200).optional(),
});

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
  period: z.enum(PERIOD_CODES).optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
