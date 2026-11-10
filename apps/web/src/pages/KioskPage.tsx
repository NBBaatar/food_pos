import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CreditCard, Loader2, Settings2, ShieldAlert, XCircle } from 'lucide-react';
import type { ScanResult } from '@shared/types';
import { DECISION_LABELS, PERIOD_LABELS } from '@shared/meal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitScan } from '@/lib/api';
import { cn } from '@/lib/utils';

const STORAGE_CODE = 'fp.deviceCode';
const STORAGE_KEY = 'fp.deviceKey';

const RESULT_STYLE: Record<string, { ring: string; text: string; icon: typeof CheckCircle2 }> = {
  ACCEPTED: { ring: 'border-emerald-400/40 bg-emerald-400/10', text: 'text-emerald-200', icon: CheckCircle2 },
  ALREADY_SCANNED: { ring: 'border-amber-400/40 bg-amber-400/10', text: 'text-amber-200', icon: ShieldAlert },
  UNKNOWN_CARD: { ring: 'border-rose-400/40 bg-rose-400/10', text: 'text-rose-200', icon: XCircle },
  BLOCKED_CARD: { ring: 'border-rose-400/40 bg-rose-400/10', text: 'text-rose-200', icon: XCircle },
  INACTIVE_USER: { ring: 'border-rose-400/40 bg-rose-400/10', text: 'text-rose-200', icon: XCircle },
  OUT_OF_WINDOW: { ring: 'border-sky-400/40 bg-sky-400/10', text: 'text-sky-200', icon: ShieldAlert },
  NO_ACTIVE_CARD: { ring: 'border-amber-400/40 bg-amber-400/10', text: 'text-amber-200', icon: ShieldAlert },
};

export function KioskPage(): JSX.Element {
  const [cardUid, setCardUid] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [clock, setClock] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [deviceCode, setDeviceCode] = useState('KIOSK-01');
  const [deviceKey, setDeviceKey] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDeviceCode(localStorage.getItem(STORAGE_CODE) ?? 'KIOSK-01');
    setDeviceKey(localStorage.getItem(STORAGE_KEY) ?? '');
    inputRef.current?.focus();
  }, []);

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

  const saveSettings = (): void => {
    localStorage.setItem(STORAGE_CODE, deviceCode.trim());
    localStorage.setItem(STORAGE_KEY, deviceKey.trim());
    setShowSettings(false);
    inputRef.current?.focus();
  };

  const scan = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const uid = cardUid.trim();
    if (!uid || busy) return;
    if (!deviceKey.trim()) {
      setError('Төхөөрөмжийн түлхүүр тохируулаагүй байна. Тохиргоо хэсэгт оруулна уу.');
      setShowSettings(true);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await submitScan({
        cardUid: uid.toUpperCase(),
        deviceCode: deviceCode.trim() || 'KIOSK-01',
        deviceKey: deviceKey.trim(),
      });
      setResult(response);
      setHistory((prev) => [response, ...prev].slice(0, 6));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Уншилт илгээх боломжгүй');
      setResult(null);
    } finally {
      setBusy(false);
      setCardUid('');
      inputRef.current?.focus();
    }
  };

  const style = result ? (RESULT_STYLE[result.decision] ?? RESULT_STYLE.UNKNOWN_CARD!) : null;
  const ResultIcon = style?.icon ?? CreditCard;

  return (
    <div className="mx-auto max-w-3xl animate-fade-up py-2">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Уншигчийн терминал</h1>
          <p className="text-sm text-muted-foreground">
            Картаа уншуулахад тухайн цагийн хоол автоматаар бүртгэгдэнэ.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-sm tabular">
            {clock || '--:--:--'}
          </span>
          <Button variant="secondary" size="sm" className="gap-2" onClick={() => setShowSettings((value) => !value)}>
            <Settings2 className="size-4" />
            Төхөөрөмж
          </Button>
        </div>
      </div>

      {showSettings ? (
        <Card className="mb-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="device-code">Төхөөрөмжийн код</Label>
              <Input
                id="device-code"
                value={deviceCode}
                onChange={(event) => setDeviceCode(event.target.value)}
                placeholder="KIOSK-01"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="device-key">Төхөөрөмжийн түлхүүр</Label>
              <Input
                id="device-key"
                type="password"
                value={deviceKey}
                onChange={(event) => setDeviceKey(event.target.value)}
                placeholder="kiosk-dev-key-change-me"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Түлхүүр нь зөвхөн энэ хөтөч дээр хадгалагдана (localStorage).
            </p>
            <Button size="sm" onClick={saveSettings}>
              Хадгалах
            </Button>
          </div>
        </Card>
      ) : null}

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
            {result ? result.message : 'Картаа уншигч дээр тавина уу.'}
          </p>

          {result ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              {result.userName ? <span className="text-foreground">{result.userName}</span> : null}
              {result.employeeNo ? <span>· {result.employeeNo}</span> : null}
              {result.periodCode ? <span>· {PERIOD_LABELS[result.periodCode]}</span> : null}
              <span>· {result.businessDate}</span>
            </div>
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
              />
              <Button type="submit" size="lg" className="shrink-0" disabled={busy}>
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

      <Card className="mt-4">
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm font-medium">Энэ терминалын сүүлийн уншилт</p>
          <Button asChild variant="ghost" size="sm">
            <Link to="/scans">Бүртгэл</Link>
          </Button>
        </div>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-xs text-muted-foreground">Одоогоор уншилт хийгдээгүй.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {history.map((item, index) => (
              <li key={`${item.cardUid}-${index}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {item.userName ?? 'Тодорхойгүй карт'}
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{item.cardUid}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(item.scannedAt).toLocaleTimeString('mn-MN', {
                      timeZone: 'Asia/Ulaanbaatar',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className={cn('text-xs', RESULT_STYLE[item.decision]?.text ?? 'text-muted-foreground')}>
                  {DECISION_LABELS[item.decision]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
