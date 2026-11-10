import { permissionsForRole, type Role } from '@shared/permissions';
import type { PeriodCode, ScanDecision } from '@shared/meal';
import type { AuthUser, CardListItem, ScanRow, UserListItem } from '@shared/types';

interface UserCore {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: Role;
  status: 'ACTIVE' | 'INACTIVE';
  departmentId: string | null;
  department?: { name: string } | null;
  createdAt: Date;
  assignments?: { card: { uid: string; status: string } }[];
}

export function toAuthUser(user: UserCore): AuthUser {
  return {
    id: user.id,
    employeeNo: user.employeeNo,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    status: user.status,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
    permissions: permissionsForRole(user.role),
  };
}

export function toUserListItem(user: UserCore): UserListItem {
  const active = user.assignments?.[0];
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
    departmentName: user.department?.name ?? null,
    cardUid: active?.card.uid ?? null,
    cardStatus: (active?.card.status as UserListItem['cardStatus']) ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

interface CardCore {
  id: string;
  uid: string;
  label: string | null;
  status: string;
  createdAt: Date;
  assignments?: { assignedAt: Date; user: { firstName: string; lastName: string } }[];
}

export function toCardListItem(card: CardCore): CardListItem {
  const active = card.assignments?.[0];
  return {
    id: card.id,
    uid: card.uid,
    label: card.label,
    status: card.status as CardListItem['status'],
    holderId: active ? (active.user as unknown as { id: string }).id ?? null : null,
    holderName: active ? `${active.user.lastName} ${active.user.firstName}` : null,
    assignedAt: active ? active.assignedAt.toISOString() : null,
    createdAt: card.createdAt.toISOString(),
  };
}

interface ScanCore {
  id: bigint;
  cardUid: string;
  cardId: string | null;
  userId: string | null;
  businessDate: Date;
  scannedAt: Date;
  receivedAt: Date;
  decision: ScanDecision;
  reason: string | null;
  clockSkewMs: number | null;
  user?: { firstName: string; lastName: string; employeeNo: string } | null;
  period?: { code: PeriodCode } | null;
  device?: { name: string } | null;
  meal?: { id: bigint; voidedAt: Date | null } | null;
}

export function toScanRow(scan: ScanCore): ScanRow {
  return {
    id: scan.id.toString(),
    mealId: scan.meal ? scan.meal.id.toString() : null,
    voidedAt: scan.meal?.voidedAt ? scan.meal.voidedAt.toISOString() : null,
    cardUid: scan.cardUid,
    cardId: scan.cardId,
    userId: scan.userId,
    userName: scan.user ? `${scan.user.lastName} ${scan.user.firstName}` : null,
    employeeNo: scan.user?.employeeNo ?? null,
    periodCode: scan.period?.code ?? null,
    businessDate: scan.businessDate.toISOString().slice(0, 10),
    scannedAt: scan.scannedAt.toISOString(),
    receivedAt: scan.receivedAt.toISOString(),
    decision: scan.decision,
    reason: scan.reason,
    deviceName: scan.device?.name ?? null,
    clockSkewMs: scan.clockSkewMs,
  };
}

export function fullName(user: { lastName: string; firstName: string }): string {
  return `${user.lastName} ${user.firstName}`.trim();
}
