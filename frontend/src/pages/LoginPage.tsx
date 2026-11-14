import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ScanLine, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { BrandingIdentity, SiteFooter } from '@/components/layout/Branding';

export function LoginPage(): JSX.Element {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Нэвтрэх боломжгүй');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col px-4">
      <div className="absolute left-4 top-4 z-10 sm:left-8">
        <BrandingIdentity />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="absolute left-1/2 top-1/3 size-[520px] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl" />
      </div>

      <div className="flex flex-1 items-center justify-center py-10 pt-24">
        <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="hidden lg:block">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            RFID хоолны бүртгэл
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight">
            Хоол бүртгэлийн <span className="gold-text">нарийвчлал</span>,
            <br /> нэг уншилтаас эхэлнэ.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Өглөө, өдөр, орой, шөнийн хоолыг картаар бүртгэж, өдөр / 7 хоног / сар / улирал / жилээр
            найдвартай тайлан гаргана. Давхар уншилт, цагийн зөрүү, картын эрхийг систем өөрөө хянана.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { label: 'Давхардлаас хамгаалалт', value: 'SQL index' },
              { label: 'Бизнес өдөр', value: '04:00 →' },
              { label: 'Идемпотент уншилт', value: 'Upsert' },
            ].map((item) => (
              <div key={item.label} className="glass rounded-xl p-3">
                <p className="text-xs font-medium text-primary">{item.value}</p>
                <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="noise p-7 sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-glow">
              <ScanLine className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Food POS</p>
              <p className="text-xs text-muted-foreground">Системд нэвтрэх</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">И-мэйл</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="name@company.mn"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Нууц үг</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Нэвтрэх
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/" className="underline underline-offset-4 hover:text-foreground">
              ← Карт уншуулах хуудас руу буцах
            </Link>
          </p>
        </Card>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
