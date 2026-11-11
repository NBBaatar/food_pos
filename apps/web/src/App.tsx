import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/lib/auth';
import { LoginPage } from '@/pages/LoginPage';

// Хүнд хуудсуудыг эрэлтээр ачаалж, эхний bundle-ыг жижиг байлгана
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ScansPage = lazy(() => import('@/pages/ScansPage').then((m) => ({ default: m.ScansPage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const CardsPage = lazy(() => import('@/pages/CardsPage').then((m) => ({ default: m.CardsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const KioskPage = lazy(() => import('@/pages/KioskPage').then((m) => ({ default: m.KioskPage })));

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
    <Suspense fallback={<Splash />}>
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
    </Suspense>
  );
}
