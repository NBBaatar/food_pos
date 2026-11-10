import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/lib/auth';
import { CardsPage } from '@/pages/CardsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { KioskPage } from '@/pages/KioskPage';
import { LoginPage } from '@/pages/LoginPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ScansPage } from '@/pages/ScansPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UsersPage } from '@/pages/UsersPage';

function Splash(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Ачаалж байна…
    </div>
  );
}

function RequireAuth(): JSX.Element {
  const { user, booting } = useAuth();
  if (booting) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function App(): JSX.Element {
  const { booting, user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={booting ? <Splash /> : user ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route element={<AppShell />}>
        <Route path="/kiosk" element={<KioskPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<DashboardPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/scans" element={<ScansPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
