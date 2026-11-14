import type { Permission, Role } from '@shared/permissions';
import type { PeriodCode, ScanDecision } from '@shared/meal';
import type { AuthUser, CardListItem, ScanRow, UserListItem } from '@shared/types';

export interface UserRow {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  canLogin: boolean;
  departmentId: string | null;
  departmentName: string | null;
  companyId: string | null;
  companyName: string | null;
  unit: string | null;
  position: string | null;
  photoUrl: string | null;
  /** Зөвшөөрөгдсөн байршлын id-ууд; хоосон = бүх байршил */
  locationIds: string[] | null;
  mustChangePassword: boolean;
  cardUid: string | null;
  cardStatus: string | null;
  createdAt: Date;
}

export function toAuthUser(user: UserRow, permissions: Permission[]): AuthUser {
  return {
    id: user.id,
    employeeNo: user.employeeNo,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    status: user.status,
    departmentId: user.departmentId,
    departmentName: user.departmentName ?? null,
    unit: user.unit ?? null,
    position: user.position ?? null,
    photoUrl: user.photoUrl ?? null,
    permissions,
    mustChangePassword: user.mustChangePassword,
  };
}

export function toUserListItem(user: UserRow): UserListItem {
  return {
    id: user.id,
    employeeNo: user.employeeNo,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    status: user.status,
    canLogin: user.canLogin,
    departmentId: user.departmentId,
    departmentName: user.departmentName ?? null,
    companyId: user.companyId ?? null,
    companyName: user.companyName ?? null,
    unit: user.unit ?? null,
    position: user.position ?? null,
    photoUrl: user.photoUrl ?? null,
    locationIds: user.locationIds ?? [],
    cardUid: user.cardUid ?? null,
    cardStatus: (user.cardStatus as UserListItem['cardStatus']) ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface CardRow {
  id: string;
  uid: string;
  label: string | null;
  status: string;
  holderId: string | null;
  holderName: string | null;
  assignedAt: Date | null;
  createdAt: Date;
}

export function toCardListItem(card: CardRow): CardListItem {
  return {
    id: card.id,
    uid: card.uid,
    label: card.label,
    status: card.status as CardListItem['status'],
    holderId: card.holderId ?? null,
    holderName: card.holderName ?? null,
    assignedAt: card.assignedAt ? card.assignedAt.toISOString() : null,
    createdAt: card.createdAt.toISOString(),
  };
}

export interface ScanRowDb {
  id: string;
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
  scannedAt: Date;
  receivedAt: Date;
  decision: ScanDecision;
  reason: string | null;
  deviceName: string | null;
  locationId: string | null;
  locationName: string | null;
  clockSkewMs: number | null;
  mealId: string | null;
  voidedAt: Date | null;
}

export function toScanRow(scan: ScanRowDb): ScanRow {
  return {
    id: scan.id,
    mealId: scan.mealId,
    voidedAt: scan.voidedAt ? scan.voidedAt.toISOString() : null,
    cardUid: scan.cardUid,
    cardId: scan.cardId,
    userId: scan.userId,
    userName: scan.userName,
    employeeNo: scan.employeeNo,
    photoUrl: scan.photoUrl ?? null,
    departmentName: scan.departmentName ?? null,
    companyName: scan.companyName ?? null,
    periodCode: scan.periodCode,
    businessDate: scan.businessDate,
    scannedAt: scan.scannedAt.toISOString(),
    receivedAt: scan.receivedAt.toISOString(),
    decision: scan.decision,
    reason: scan.reason,
    deviceName: scan.deviceName,
    locationId: scan.locationId,
    locationName: scan.locationName,
    clockSkewMs: scan.clockSkewMs,
  };
}

export function fullName(user: { lastName: string; firstName: string }): string {
  return `${user.lastName} ${user.firstName}`.trim();
}
