import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanLine,
  Settings,
  UserRound,
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
import { BrandingIdentity, SiteFooter } from './Branding';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  anyOf?: Permission[];
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Самбар', icon: LayoutDashboard, permission: 'report:read' },
  { to: '/', label: 'Уншигч', icon: ScanLine },
  { to: '/reports', label: 'Тайлан', icon: BarChart3, permission: 'report:read' },
  { to: '/scans', label: 'Уншилт', icon: Activity, permission: 'scan:read' },
  { to: '/users', label: 'Хэрэглэгч', icon: Users, permission: 'user:read' },
  { to: '/cards', label: 'Карт', icon: CreditCard, permission: 'card:read' },
  { to: '/profile', label: 'Миний профайл', icon: UserRound },
  {
    to: '/settings',
    label: 'Тохиргоо',
    icon: Settings,
    anyOf: ['period:manage', 'device:manage', 'branding:manage', 'audit:read'],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const { can, user } = useAuth();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => {
        if (!user && item.to !== '/') return false;
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

export function AppShell(): JSX.Element {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Киоск (нүүр) хуудсанд sidebar хэрэггүй — бүтэн өргөнөөр харуулна
  const isKiosk = pathname === '/' || pathname === '/kiosk';

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      {!isKiosk ? (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col justify-between border-r border-white/[0.07] bg-white/[0.02] px-4 py-6 backdrop-blur-2xl lg:flex">
          <div>
            <BrandingIdentity className="px-1" />
            <div className="mt-8">
              <NavList />
            </div>
          </div>
          <div className="space-y-3">
            <Separator />
            <NavLink
              to={user ? '/profile' : '/login'}
              className="flex items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-white/[0.04]"
            >
              <span className="grid size-9 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] text-xs font-semibold uppercase">
                {user?.photoUrl ? (
                  <img src={user.photoUrl} alt="" className="size-full object-cover" />
                ) : user ? (
                  `${user.lastName.slice(0, 1)}${user.firstName.slice(0, 1)}`
                ) : (
                  '—'
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {user ? `${user.lastName} ${user.firstName}` : 'Зочин'}
                </p>
                <p className="text-[11px] text-muted-foreground">{user ? ROLE_LABELS[user.role] : 'Нэвтрээгүй'}</p>
              </div>
            </NavLink>
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
      ) : null}

      {/* Mobile drawer */}
      {!isKiosk && mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Хаах"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col gap-6 border-r border-white/10 bg-[hsl(240_16%_6%)]/97 px-4 py-6">
            <div className="flex items-center justify-between">
              <BrandingIdentity />
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
            ) : (
              <Button variant="secondary" size="sm" className="mt-auto" onClick={() => navigate('/login')}>
                Нэвтрэх
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <div className={cn('flex min-h-screen flex-col', !isKiosk && 'lg:pl-[264px]')}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-white/[0.06] bg-background/60 px-4 backdrop-blur-xl sm:gap-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {!isKiosk ? (
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
                <Menu className="size-5" />
              </Button>
            ) : null}
            <BrandingIdentity
              logoClassName="max-h-9 max-w-[96px] sm:max-h-11 sm:max-w-[180px]"
              nameClassName="text-sm sm:text-base"
              showSubtitle={false}
            />
            {isKiosk ? (
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5 shadow-sm sm:gap-3 sm:px-3.5">
                <CalendarDays className="size-4 text-primary" />
                <div className="leading-none">
                  <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Огноо</p>
                  <p className="mt-1 text-sm font-semibold tabular tracking-tight sm:text-lg">
                    {formatDate(new Date())}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <span className="hidden h-6 w-px shrink-0 bg-white/10 md:block" />
                <p className="hidden text-xs text-muted-foreground md:block">
                  Бизнес өдөр · <span className="tabular text-foreground">{formatDate(new Date())}</span>
                </p>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {user ? ROLE_LABELS[user.role] : 'Зочин'}
            </span>
            {user ? (
              <NavLink
                to="/profile"
                title="Миний профайл"
                className="grid size-8 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] text-[11px] font-semibold uppercase transition-colors hover:border-primary/40"
              >
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <>
                    {user.lastName.slice(0, 1)}
                    {user.firstName.slice(0, 1)}
                  </>
                )}
              </NavLink>
            ) : null}
          </div>
        </header>
        <main className="flex-1 px-4 pb-10 pt-6 lg:px-8">
          {user?.mustChangePassword ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
              <span>Түр нууц үгээр нэвтэрсэн байна. Үргэлжлүүлэхийн тулд нууц үгээ сольно уу.</span>
              <NavLink to="/profile" className="font-medium underline underline-offset-4">
                Профайл руу
              </NavLink>
            </div>
          ) : null}
          <Outlet />
        </main>
        <SiteFooter className="mt-auto" />
      </div>
    </div>
  );
}
