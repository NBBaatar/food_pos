export const ROLES = ['ADMIN', 'MANAGER', 'USER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Админ',
  MANAGER: 'Менежер',
  USER: 'Хэрэглэгч',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Бүрэн эрх — тохиргоо, эрх, аудит',
  MANAGER: 'Тайлан, уншилт ба хэрэглэгчийн мэдээлэл засварлах',
  USER: 'Хэрэглэгч нэмэх, картын эрх идэвхгүй болгох',
};

export const PERMISSIONS = {
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DEACTIVATE: 'user:deactivate',
  CARD_READ: 'card:read',
  CARD_MANAGE: 'card:manage',
  CARD_BLOCK: 'card:block',
  SCAN_READ: 'scan:read',
  SCAN_CORRECT: 'scan:correct',
  REPORT_READ: 'report:read',
  REPORT_EXPORT: 'report:export',
  PERIOD_MANAGE: 'period:manage',
  DEVICE_MANAGE: 'device:manage',
  AUDIT_READ: 'audit:read',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<string, string> = {
  'user:read': 'Хэрэглэгч харах',
  'user:create': 'Хэрэглэгч нэмэх',
  'user:update': 'Хэрэглэгч засах',
  'user:deactivate': 'Хэрэглэгч идэвхгүй болгох',
  'card:read': 'Карт харах',
  'card:manage': 'Карт нэмэх, оноох',
  'card:block': 'Картын эрх идэвхгүй болгох',
  'scan:read': 'Уншилт харах',
  'scan:correct': 'Уншилт залруулах',
  'report:read': 'Тайлан харах',
  'report:export': 'Тайлан экспортлох',
  'period:manage': 'Хоолны цаг тохируулах',
  'device:manage': 'Төхөөрөмж удирдах',
  'audit:read': 'Аудит лог харах',
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: Object.values(PERMISSIONS),
  MANAGER: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DEACTIVATE,
    PERMISSIONS.CARD_READ,
    PERMISSIONS.CARD_MANAGE,
    PERMISSIONS.CARD_BLOCK,
    PERMISSIONS.SCAN_READ,
    PERMISSIONS.SCAN_CORRECT,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.REPORT_EXPORT,
  ],
  USER: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.CARD_READ,
    PERMISSIONS.CARD_BLOCK,
  ],
};

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(permissions: readonly string[], permission: Permission): boolean {
  return permissions.includes(permission);
}
