import { describe, expect, it } from 'vitest';
import {
  applyPermissionOverrides,
  can,
  PERMISSIONS,
  permissionsForRole,
} from '@shared/permissions';

describe('scan:create эрх', () => {
  it('энгийн хэрэглэгч хоолны бүртгэл үүсгэх эрхгүй', () => {
    expect(can(permissionsForRole('USER'), PERMISSIONS.SCAN_CREATE)).toBe(false);
  });

  it('менежер болон админ бүртгэх эрхтэй', () => {
    expect(can(permissionsForRole('MANAGER'), PERMISSIONS.SCAN_CREATE)).toBe(true);
    expect(can(permissionsForRole('ADMIN'), PERMISSIONS.SCAN_CREATE)).toBe(true);
  });
});

describe('эрхийн override', () => {
  it('рольд байхгүй эрхийг нэмнэ', () => {
    const permissions = applyPermissionOverrides('USER', [
      { permission: PERMISSIONS.AUDIT_READ, allow: true },
    ]);
    expect(permissions).toContain(PERMISSIONS.AUDIT_READ);
  });

  it('рольд байгаа эрхийг хасна', () => {
    const permissions = applyPermissionOverrides('MANAGER', [
      { permission: PERMISSIONS.SCAN_CREATE, allow: false },
    ]);
    expect(permissions).not.toContain(PERMISSIONS.SCAN_CREATE);
    expect(permissions).toContain(PERMISSIONS.REPORT_READ);
  });

  it('давхардсан override-д сүүлийн утга хүчинтэй', () => {
    const permissions = applyPermissionOverrides('USER', [
      { permission: PERMISSIONS.AUDIT_READ, allow: true },
      { permission: PERMISSIONS.AUDIT_READ, allow: false },
    ]);
    expect(permissions).not.toContain(PERMISSIONS.AUDIT_READ);
  });

  it('танигдахгүй эрхийг үл тоомсорлоно', () => {
    const permissions = applyPermissionOverrides('USER', [{ permission: 'unknown:permission', allow: true }]);
    expect(permissions).toEqual(permissionsForRole('USER'));
  });

  it('ADMIN-д override үйлчлэхгүй (супер хэрэглэгч)', () => {
    const permissions = applyPermissionOverrides('ADMIN', [
      { permission: PERMISSIONS.AUDIT_READ, allow: false },
    ]);
    expect(permissions).toEqual(permissionsForRole('ADMIN'));
  });
});
