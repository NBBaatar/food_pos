import type { PeriodCode, ScanDecision } from './meal';
import type { Permission, Role } from './permissions';

export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type CardStatus = 'ACTIVE' | 'BLOCKED' | 'LOST';

export interface AuthUser {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  status: UserStatus;
  departmentId: string | null;
  departmentName: string | null;
  permissions: Permission[];
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
  departmentId: string | null;
  departmentName: string | null;
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

export interface ScanRow {
  id: string;
  mealId: string | null;
  voidedAt: string | null;
  cardUid: string;
  cardId: string | null;
  userId: string | null;
  userName: string | null;
  employeeNo: string | null;
  periodCode: PeriodCode | null;
  businessDate: string;
  scannedAt: string;
  receivedAt: string;
  decision: ScanDecision;
  reason: string | null;
  deviceName: string | null;
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
  cardUid: string;
}
