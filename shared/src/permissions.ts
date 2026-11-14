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
  SCAN_CREATE: 'scan:create',
  SCAN_CORRECT: 'scan:correct',
  REPORT_READ: 'report:read',
  REPORT_EXPORT: 'report:export',
  PERIOD_MANAGE: 'period:manage',
  DEVICE_MANAGE: 'device:manage',
  BRANDING_MANAGE: 'branding:manage',
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
  'scan:create': 'Уншилт бүртгэх',
  'scan:correct': 'Уншилт залруулах',
  'report:read': 'Тайлан харах',
  'report:export': 'Тайлан экспортлох',
  'period:manage': 'Хоолны цаг тохируулах',
  'device:manage': 'Төхөөрөмж удирдах',
  'branding:manage': 'Лого, footer тохируулах',
  'audit:read': 'Аудит лог харах',
};

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export interface PermissionOverride {
  permission: Permission;
  allow: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DEACTIVATE,
    PERMISSIONS.CARD_READ,
    PERMISSIONS.CARD_MANAGE,
    PERMISSIONS.CARD_BLOCK,
    PERMISSIONS.SCAN_READ,
    PERMISSIONS.SCAN_CREATE,
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

/**
 * Рольоос өгөгдсөн үндсэн эрх дээр хэрэглэгчийн override-уудыг хэрэглэнэ.
 * ADMIN нь супер хэрэглэгч тул override хүлээж авахгүй.
 */
export function applyPermissionOverrides(
  role: Role,
  overrides: readonly { permission: string; allow: boolean }[],
): Permission[] {
  const base = new Set<string>(permissionsForRole(role));
  if (role !== 'ADMIN') {
    for (const override of overrides) {
      if (!ALL_PERMISSIONS.includes(override.permission as Permission)) continue;
      if (override.allow) base.add(override.permission);
      else base.delete(override.permission);
    }
  }
  return ALL_PERMISSIONS.filter((permission) => base.has(permission));
}

export function can(permissions: readonly string[], permission: Permission): boolean {
  return permissions.includes(permission);
}
