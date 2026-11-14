import type { PeriodCode, ScanDecision } from './meal';
import type { Permission, PermissionOverride, Role } from './permissions';

export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type CardStatus = 'ACTIVE' | 'BLOCKED' | 'LOST';

export interface AuthUser {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  departmentId: string | null;
  departmentName: string | null;
  unit: string | null;
  position: string | null;
  photoUrl: string | null;
  permissions: Permission[];
  /** Түр нууц үгээр нэвтэрсэн — профайлд нууц үг солих хүртэл бусад API хаалттай */
  mustChangePassword: boolean;
}

export interface UserPermissions {
  role: Role;
  permissions: Permission[];
  overrides: PermissionOverride[];
}

export interface UserListItem {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  canLogin: boolean;
  departmentId: string | null;
  departmentName: string | null;
  companyId: string | null;
  companyName: string | null;
  unit: string | null;
  position: string | null;
  photoUrl: string | null;
  /** Карт уншуулж болох байршлууд; хоосон = бүх байршилд зөвшөөрнө */
  locationIds: string[];
  cardUid: string | null;
  cardStatus: CardStatus | null;
  createdAt: string;
}

export interface CardListItem {
  id: string;
  uid: string;
  label: string | null;
  status: CardStatus;
  holderId: string | null;
  holderName: string | null;
  assignedAt: string | null;
  createdAt: string;
}

export interface Branding {
  companyName: string;
  footerText: string;
  copyright: string;
  logoUrl: string | null;
}

export interface CompanyItem {
  id: string;
  name: string;
  userCount: number;
  createdAt: string;
}

export interface LocationItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface ScanRow {
  id: string;
  mealId: string | null;
  voidedAt: string | null;
  cardUid: string;
  cardId: string | null;
  userId: string | null;
  userName: string | null;
  employeeNo: string | null;
  photoUrl: string | null;
  departmentName: string | null;
  companyName: string | null;
  periodCode: PeriodCode | null;
  businessDate: string;
  scannedAt: string;
  receivedAt: string;
  decision: ScanDecision;
  reason: string | null;
  deviceName: string | null;
  locationId: string | null;
  locationName: string | null;
  clockSkewMs: number | null;
}

export interface MealRecordRow {
  id: string;
  userId: string;
  userName: string;
  employeeNo: string;
  cardUid: string;
  periodCode: PeriodCode;
  businessDate: string;
  scannedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface ReportBucketRow {
  bucket: string;
  BREAKFAST: number;
  LUNCH: number;
  DINNER: number;
  NIGHT: number;
  total: number;
  uniqueUsers: number;
}

export interface ReportSummary {
  from: string;
  to: string;
  days: number;
  total: number;
  uniqueUsers: number;
  byPeriod: Record<PeriodCode, number>;
  avgPerDay: number;
  previous: { total: number; from: string; to: string };
  changePercent: number | null;
}

export interface AttendanceRow {
  userId: string;
  employeeNo: string;
  userName: string;
  departmentName: string | null;
  BREAKFAST: number;
  LUNCH: number;
  DINNER: number;
  NIGHT: number;
  total: number;
  lastMealDate: string | null;
}

export interface DepartmentReportRow {
  departmentId: string | null;
  departmentName: string;
  holders: number;
  meals: number;
  avgPerHolder: number;
}

export interface LocationReportRow {
  locationId: string | null;
  locationName: string;
  meals: number;
  uniqueUsers: number;
}

export interface PeriodBreakdown {
  BREAKFAST: number;
  LUNCH: number;
  DINNER: number;
  NIGHT: number;
  total: number;
}

/** Ажилтан бүрийн хүлээн авсан хоол ба уншилтын оролдлогын дэлгэрэнгүй мөр */
export interface DetailedReportRow {
  userId: string;
  employeeNo: string;
  userName: string;
  companyName: string | null;
  departmentName: string | null;
  unit: string | null;
  position: string | null;
  /** Бүртгэгдсэн (хүлээн авсан) хоол — хоолны төрлөөр */
  accepted: PeriodBreakdown;
  /** Бүх уншилтын оролдлого (давхар, цонхны гадна, танихгүй карт г.м.) — хоолны төрлөөр */
  attempts: PeriodBreakdown;
  /** Хоол авсан өдрийн тоо */
  mealDays: number;
  firstScanAt: string | null;
  lastScanAt: string | null;
}

/** Дэлгэрэнгүй тайлангийн байршил тус бүрийн задаргаа */
export interface DetailedLocationRow {
  locationId: string | null;
  locationName: string;
  accepted: PeriodBreakdown;
  attempts: PeriodBreakdown;
}

export interface DetailedReport {
  from: string;
  to: string;
  rows: DetailedReportRow[];
  totals: { users: number; accepted: PeriodBreakdown; attempts: PeriodBreakdown };
  byLocation: DetailedLocationRow[];
}

export interface IntegrityReport {
  generatedAt: string;
  scanAccepted: number;
  mealRecords: number;
  missingRecords: number;
  orphanRecords: number;
  duplicateAttempts: number;
  clockSkewHigh: number;
  unknownCards: number;
  outOfWindow: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ScanResult {
  decision: ScanDecision;
  message: string;
  businessDate: string;
  scannedAt: string;
  periodCode: PeriodCode | null;
  userName: string | null;
  employeeNo: string | null;
  departmentName: string | null;
  companyName: string | null;
  unit: string | null;
  position: string | null;
  photoUrl: string | null;
  cardUid: string;
  /** Давхардсан үед өмнөх уншилтын байршил болон цаг */
  previousLocationId?: string | null;
  previousLocationName?: string | null;
  previousScannedAt?: string | null;
}
