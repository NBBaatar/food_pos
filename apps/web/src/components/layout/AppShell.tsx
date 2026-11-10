import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanLine,
  Settings,
  Users,
  X,
} from 'lucide-react';
import type { Permission } from '@shared/permissions';
import { ROLE_LABELS } from '@shared/permissions';
import { formatDate } from '@shared/format';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  anyOf?: Permission[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Самбар', icon: LayoutDashboard, permission: 'report:read' },
  { to: '/kiosk', label: 'Уншигч', icon: ScanLine },
  { to: '/reports', label: 'Тайлан', icon: BarChart3, permission: 'report:read' },
  { to: '/scans', label: 'Уншилт', icon: Activity, permission: 'scan:read' },
  { to: '/users', label: 'Хэрэглэгч', icon: Users, permission: 'user:read' },
  { to: '/cards', label: 'Карт', icon: CreditCard, permission: 'card:read' },
  {
    to: '/settings',
    label: 'Тохиргоо',
    icon: Settings,
    anyOf: ['period:manage', 'device:manage', 'audit:read'],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const { can, user } = useAuth();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => {
        if (!user && item.to !== '/kiosk') return false;
        if (item.permission) return can(item.permission);
        if (item.anyOf) return item.anyOf.some((permission) => can(permission));
        return true;
      }).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
              isActive
                ? 'border border-white/10 bg-white/[0.08] text-foreground shadow-sm'
                : 'border border-transparent text-muted-foreground hover:bg-white/[0.05] hover:text-foreground',
            )
          }
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Brand(): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="grid size-10 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-glow">
        <ScanLine className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold tracking-tight">
          Food <span className="gold-text">POS</span>
        </p>
        <p className="text-[11px] text-muted-foreground">Хоолны бүртгэл</p>
      </div>
    </div>
  );
}

export function AppShell(): JSX.Element {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col justify-between border-r border-white/[0.07] bg-white/[0.02] px-4 py-6 backdrop-blur-2xl lg:flex">
        <div>
          <Brand />
          <div className="mt-8">
            <NavList />
          </div>
        </div>
        <div className="space-y-3">
          <Separator />
          <div className="flex items-center gap-3 px-1">
            <span className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-semibold uppercase">
              {user ? `${user.lastName.slice(0, 1)}${user.firstName.slice(0, 1)}` : '—'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {user ? `${user.lastName} ${user.firstName}` : 'Зочин'}
              </p>
              <p className="text-[11px] text-muted-foreground">{user ? ROLE_LABELS[user.role] : 'Нэвтрээгүй'}</p>
            </div>
          </div>
          {user ? (
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
              <LogOut className="size-4" />
              Гарах
            </Button>
          ) : (
            <Button variant="secondary" size="sm" className="w-full" onClick={() => navigate('/login')}>
              Нэвтрэх
            </Button>
          )}
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Хаах"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col gap-6 border-r border-white/10 bg-[hsl(240_16%_6%)]/97 px-4 py-6">
            <div className="flex items-center justify-between">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <NavList onNavigate={() => setMobileOpen(false)} />
            {user ? (
              <Button variant="secondary" size="sm" className="mt-auto gap-2" onClick={handleLogout}>
                <LogOut className="size-4" />
                Гарах
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-white/[0.06] bg-background/60 px-4 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <p className="text-xs text-muted-foreground">
              Бизнес өдөр · <span className="tabular text-foreground">{formatDate(new Date())}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {user ? ROLE_LABELS[user.role] : 'Зочин'}
            </span>
            {user ? (
              <span className="grid size-8 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-[11px] font-semibold uppercase">
                {user.lastName.slice(0, 1)}
                {user.firstName.slice(0, 1)}
              </span>
            ) : null}
          </div>
        </header>
        <main className="px-4 pb-20 pt-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
