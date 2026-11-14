import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, LayoutDashboard, Loader2, LogIn, MapPin, ShieldAlert, XCircle } from 'lucide-react';
import type { ScanResult } from '@shared/types';
import { DECISION_LABELS, PERIOD_LABELS } from '@shared/meal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { recentScansApi, locationsApi, submitScan } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const STORAGE_LOCATION = 'fp.locationId';
/** Үр дүнгийн card хэдэн секунд харагдах вэ */
const RESULT_VISIBLE_MS = 8_000;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatPreviousScanTime(iso: string): string {
  return new Date(iso).toLocaleString('mn-MN', {
    timeZone: 'Asia/Ulaanbaatar',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RESULT_STYLE: Record<string, { ring: string; text: string; icon: typeof CheckCircle2 }> = {
  ACCEPTED: { ring: 'border-emerald-400/40 bg-emerald-400/10', text: 'text-emerald-200', icon: CheckCircle2 },
  ALREADY_SCANNED: { ring: 'border-amber-400/40 bg-amber-400/10', text: 'text-amber-200', icon: ShieldAlert },
  UNKNOWN_CARD: { ring: 'border-rose-400/40 bg-rose-400/10', text: 'text-rose-200', icon: XCircle },
  BLOCKED_CARD: { ring: 'border-rose-400/40 bg-rose-400/10', text: 'text-rose-200', icon: XCircle },
  INACTIVE_USER: { ring: 'border-rose-400/40 bg-rose-400/10', text: 'text-rose-200', icon: XCircle },
  OUT_OF_WINDOW: { ring: 'border-sky-400/40 bg-sky-400/10', text: 'text-sky-200', icon: ShieldAlert },
  NO_ACTIVE_CARD: { ring: 'border-amber-400/40 bg-amber-400/10', text: 'text-amber-200', icon: ShieldAlert },
  WRONG_LOCATION: { ring: 'border-rose-400/40 bg-rose-400/10', text: 'text-rose-200', icon: XCircle },
};

export function KioskPage(): JSX.Element {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cardUid, setCardUid] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState<string>('');
  const [locationId, setLocationId] = useState<string>(() => localStorage.getItem(STORAGE_LOCATION) ?? '');
  const [pendingLocationId, setPendingLocationId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Картын талбарт фокусгүй үед хуудасны түвшинд хураасан UID */
  const bufferRef = useRef('');

  const locations = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list });
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.status === 'ACTIVE');

  const activeLocationId = activeLocations.some((location) => location.id === locationId)
    ? locationId
    : (activeLocations[0]?.id ?? '');

  useEffect(() => {
    if (activeLocationId && activeLocationId !== locationId) {
      setLocationId(activeLocationId);
      localStorage.setItem(STORAGE_LOCATION, activeLocationId);
    }
  }, [activeLocationId, locationId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), RESULT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    const tick = (): void =>
      setClock(
        new Date().toLocaleTimeString('mn-MN', {
          timeZone: 'Asia/Ulaanbaatar',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const recent = useQuery({
    queryKey: ['scans', 'recent', activeLocationId],
    queryFn: () => recentScansApi.list(activeLocationId, 10),
    enabled: Boolean(activeLocationId),
    refetchInterval: 3000,
  });

  const submitCard = useCallback(
    async (rawUid: string): Promise<void> => {
      const uid = rawUid.trim();
      if (!uid || busy || pendingLocationId) return;
      if (!activeLocationId) {
        setError('Эхлээд байршлаа сонгоно уу.');
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const response = await submitScan({ cardUid: uid.toUpperCase(), locationId: activeLocationId });
        setResult(response);
        await queryClient.invalidateQueries({ queryKey: ['scans', 'recent', activeLocationId] });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Уншилт илгээх боломжгүй');
        setResult(null);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [activeLocationId, busy, pendingLocationId, queryClient],
  );

  const scan = (event: React.FormEvent): void => {
    event.preventDefault();
    const uid = cardUid.trim();
    if (!uid || busy) return;
    setCardUid('');
    bufferRef.current = '';
    void submitCard(uid);
  };

  // RFID уншигч нь keyboard төхөөрөмж мэт ажилладаг тул фокус аль компонент дээр
  // байгаагаас үл хамааран хуудасны түвшинд уншилтыг барих шаардлагатай.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Байршил солих баталгаажуулалтын цонх нээлттэй үед уншилт хүлээж авахгүй
      if (pendingLocationId) return;

      const target = event.target as HTMLElement | null;
      // Картын талбарт фокус байвал input-ийн өөрийн урсгал ажиллана
      if (target && target === inputRef.current) return;
      // Хэрэглэгч өөр текст оруулах талбарт бичиж байгаа бол саад болохгүй
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'Enter') {
        const uid = bufferRef.current.trim();
        if (!uid) return;
        event.preventDefault();
        bufferRef.current = '';
        setCardUid('');
        void submitCard(uid);
        return;
      }
      if (event.key === 'Backspace') {
        bufferRef.current = bufferRef.current.slice(0, -1);
        setCardUid(bufferRef.current);
        return;
      }
      if (event.key.length === 1) {
        bufferRef.current += event.key;
        setCardUid(bufferRef.current);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [submitCard, pendingLocationId]);

  const style = result ? (RESULT_STYLE[result.decision] ?? RESULT_STYLE.UNKNOWN_CARD!) : null;
  const ResultIcon = style?.icon ?? CreditCard;
  const selectedLocation = activeLocations.find((location) => location.id === activeLocationId) ?? null;
  const pendingLocationName = activeLocations.find((location) => location.id === pendingLocationId)?.name ?? '';

  const confirmLocationChange = (): void => {
    if (!pendingLocationId) return;
    setLocationId(pendingLocationId);
    localStorage.setItem(STORAGE_LOCATION, pendingLocationId);
    setResult(null);
    setError(null);
    setPendingLocationId(null);
    inputRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-6xl animate-fade-up py-2">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Уншигчийн терминал</h1>
          <p className="text-sm text-muted-foreground">
            Байршлаа сонгоод картаа уншуулахад тухайн цагийн хоол автоматаар бүртгэгдэнэ.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-sm tabular">
            {clock || '--:--:--'}
          </span>
          {!user ? (
            <Button variant="secondary" size="sm" className="gap-2" onClick={() => navigate('/login')}>
              <LogIn className="size-4" />
              Нэвтрэх
            </Button>
          ) : can('report:read') ? (
            <Button variant="secondary" size="sm" className="gap-2" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard className="size-4" />
              Самбар
            </Button>
          ) : null}
        </div>
      </div>

      {/* Тунгалаг + blur гадаргуу нь fixed фонтой хослоход анивчдаг тул
          уншилтын байршлын картыг тэгш (solid) гадаргуугаар харуулна. */}
      <Card className="mb-4 border-white/10 bg-[hsl(240_16%_8%)] p-4 backdrop-blur-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="size-4 text-primary" />
            Уншилтын байршил
          </div>
          {locations.isLoading ? (
            <span className="text-xs text-muted-foreground">Ачаалж байна…</span>
          ) : activeLocations.length > 0 ? (
            <Select
              value={activeLocationId}
              onValueChange={(value) => {
                if (value === activeLocationId) return;
                setPendingLocationId(value);
              }}
            >
              <SelectTrigger className="w-full sm:w-[320px]">
                <SelectValue placeholder="Байршил сонгох" />
              </SelectTrigger>
              <SelectContent>
                {activeLocations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-rose-200">
              Идэвхтэй байршил байхгүй. Админаас «Тохиргоо → Байршил» хэсэгт нэмнэ үү.
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <Card className={cn('noise relative p-6 transition-colors sm:p-8', style?.ring)}>
        <div className="flex flex-col items-center text-center">
          <span className="relative grid size-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.05]">
            <ResultIcon className={cn('size-7', style?.text ?? 'text-primary')} />
            {result?.decision === 'ACCEPTED' ? (
              <span className="absolute inset-0 animate-pulse-ring rounded-2xl border border-emerald-300/40" />
            ) : null}
          </span>

          <p className={cn('mt-4 text-lg font-semibold', style?.text ?? 'text-muted-foreground')}>
            {result ? DECISION_LABELS[result.decision] : 'Карт уншихад бэлэн'}
          </p>
          <p className="mt-1 min-h-[20px] max-w-md text-sm text-muted-foreground">
            {result
              ? result.message
              : selectedLocation
                ? `${selectedLocation.name} — картаа уншигч дээр тавина уу.`
                : 'Байршил сонгосны дараа картаа уншуулна уу.'}
          </p>

          {result?.decision === 'ALREADY_SCANNED' && result.previousLocationName ? (
            <div className="mt-3 flex max-w-md items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-left text-xs text-amber-100">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Та «{result.previousLocationName}» байршилд
                {result.previousScannedAt ? ` ${formatPreviousScanTime(result.previousScannedAt)} цагт` : ''} уншуулсан
                байна.
              </p>
            </div>
          ) : null}

          {result?.userName ? (
            <div className="mt-5 flex w-full max-w-md items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
                {result.photoUrl ? (
                  <img src={result.photoUrl} alt={result.userName} className="size-full object-cover" />
                ) : (
                  <span className="text-xl font-semibold text-muted-foreground">{initials(result.userName)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{result.userName}</p>
                <p className="text-xs text-muted-foreground">{result.employeeNo ?? '—'}</p>
                {result.companyName ? (
                  <p className="truncate text-xs text-muted-foreground">{result.companyName}</p>
                ) : null}
                <dl className="mt-2 space-y-0.5 text-xs">
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-muted-foreground">Хэлтэс:</dt>
                    <dd className="truncate">{result.departmentName ?? '—'}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-muted-foreground">Нэгж:</dt>
                    <dd className="truncate">{result.unit ?? '—'}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-muted-foreground">Албан тушаал:</dt>
                    <dd className="truncate">{result.position ?? '—'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          {result ? (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                {result.periodCode ? <span>{PERIOD_LABELS[result.periodCode]}</span> : null}
                <span>· {result.businessDate}</span>
                {!result.userName ? <span className="font-mono">· {result.cardUid}</span> : null}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground/70">
                Үр дүн {RESULT_VISIBLE_MS / 1000} секундын дараа автоматаар цэвэрлэгдэнэ.
              </p>
            </>
          ) : null}

          <form onSubmit={scan} className="mt-7 w-full max-w-md">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={cardUid}
                onChange={(event) => setCardUid(event.target.value)}
                placeholder="Картын UID (жишээ: 04A1B2C300)"
                className="h-12 text-base"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={!activeLocationId}
              />
              <Button type="submit" size="lg" className="shrink-0" disabled={busy || !activeLocationId}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                Уншуулах
              </Button>
            </div>
            {error ? (
              <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </Card>

      <Card className="h-fit">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium">Сүүлийн 10 уншилт</p>
            <p className="text-[11px] text-muted-foreground">
              {selectedLocation ? `${selectedLocation.name} · 3 секунд тутам шинэчлэгдэнэ` : 'Байршил сонгоно уу'}
            </p>
          </div>
          {user ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/scans">Бүртгэл</Link>
            </Button>
          ) : null}
        </div>
        {!activeLocationId ? (
          <p className="px-5 pb-5 text-xs text-muted-foreground">Байршил сонгосны дараа уншилтууд харагдана.</p>
        ) : recent.isLoading ? (
          <p className="px-5 pb-5 text-xs text-muted-foreground">Ачаалж байна…</p>
        ) : recent.isError ? (
          <p className="px-5 pb-5 text-xs text-rose-200">Сүүлийн уншилтыг ачаалж чадсангүй.</p>
        ) : recent.data && recent.data.items.length > 0 ? (
          <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {recent.data.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] text-xs font-semibold text-muted-foreground">
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt="" className="size-full object-cover" />
                  ) : item.userName ? (
                    initials(item.userName)
                  ) : (
                    <CreditCard className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium">{item.userName ?? 'Тодорхойгүй карт'}</p>
                    <span
                      className={cn(
                        'shrink-0 text-xs',
                        RESULT_STYLE[item.decision]?.text ?? 'text-muted-foreground',
                      )}
                    >
                      {DECISION_LABELS[item.decision]}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.employeeNo ? <span className="mr-1.5">{item.employeeNo}</span> : null}
                    <span className="font-mono">{item.cardUid}</span>
                  </p>
                  {item.companyName || item.departmentName ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {item.companyName ?? item.departmentName}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground/80">
                    {new Date(item.scannedAt).toLocaleString('mn-MN', {
                      timeZone: 'Asia/Ulaanbaatar',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                    {item.locationName ? ` · ${item.locationName}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-xs text-muted-foreground">Энэ байршилд одоогоор уншилт хийгдээгүй.</p>
        )}
      </Card>
      </div>

      <Dialog
        open={Boolean(pendingLocationId)}
        onOpenChange={(open) => {
          if (!open) setPendingLocationId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Байршил солих уу?</DialogTitle>
            <DialogDescription>
              Уншилтын байршлыг «{pendingLocationName}» болгож солиход итгэлтэй байна уу? Сольсны дараа картын
              уншилт энэ байршилд бүртгэгдэнэ.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingLocationId(null)}>
              Цуцлах
            </Button>
            <Button onClick={confirmLocationChange}>Тийм, солих</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
