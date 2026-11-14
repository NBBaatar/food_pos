import {
  applyPermissionOverrides,
  permissionsForRole,
  type Permission,
  type PermissionOverride,
  type Role,
} from '@shared/permissions';
import { query } from '../db/pool';

/** DB-д хадгалагдсан хэрэглэгчийн эрхийн override-ууд */
export async function loadPermissionOverrides(userId: string): Promise<PermissionOverride[]> {
  return query<PermissionOverride>(
    `SELECT permission_code AS permission, allow
       FROM user_permissions
      WHERE user_id = $1::uuid
      ORDER BY permission_code`,
    [userId],
  );
}

/** Тухайн хүсэлтийн үед хүчинтэй эрхүүд — роль + override */
export async function permissionsForUser(userId: string, role: Role): Promise<Permission[]> {
  if (role === 'ADMIN') return permissionsForRole(role);
  return applyPermissionOverrides(role, await loadPermissionOverrides(userId));
}
