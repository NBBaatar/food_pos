import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@shared/types';
import type { Permission } from '@shared/permissions';
import * as api from './api';

interface AuthState {
  user: AuthUser | null;
  booting: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let alive = true;
    void api
      .restoreSession()
      .then((restored) => {
        if (alive) setUser(restored);
      })
      .finally(() => {
        if (alive) setBooting(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await api.login(email, password);
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const restored = await api.restoreSession();
    setUser(restored);
  }, []);

  const can = useCallback(
    (permission: Permission) => (user ? user.permissions.includes(permission) : false),
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({ user, booting, login, logout, refreshUser, can }),
    [user, booting, login, logout, refreshUser, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth нь AuthProvider дотор ашиглагдана');
  return context;
}
