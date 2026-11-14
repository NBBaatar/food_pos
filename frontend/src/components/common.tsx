import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { DECISION_LABELS, PERIOD_COLORS, PERIOD_LABELS, type PeriodCode, type ScanDecision } from '@shared/meal';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, formatNumber } from '@shared/format';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  accent?: boolean;
}): JSX.Element {
  return (
    <Card className="group p-5 transition-colors hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className={cn('mt-2 text-3xl font-semibold tabular', accent && 'gold-text')}>
            {typeof value === 'number' ? formatNumber(value) : value}
          </p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? (
          <span className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-primary/90">{icon}</span>
        ) : null}
      </div>
    </Card>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-muted-foreground">
        <Inbox className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-rose-200">
        <AlertTriangle className="size-5" />
      </span>
      <p className="text-sm font-medium">Алдаа гарлаа</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

export function LoadingBlock({ label = 'Ачаалж байна…' }: { label?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function PeriodBadge({ code }: { code: PeriodCode | null }): JSX.Element {
  if (!code) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="size-2 rounded-full" style={{ backgroundColor: PERIOD_COLORS[code] }} />
      {PERIOD_LABELS[code]}
    </span>
  );
}

const DECISION_VARIANTS: Record<ScanDecision, 'success' | 'warning' | 'danger' | 'info' | 'outline'> = {
  ACCEPTED: 'success',
  ALREADY_SCANNED: 'warning',
  UNKNOWN_CARD: 'danger',
  BLOCKED_CARD: 'danger',
  INACTIVE_USER: 'danger',
  OUT_OF_WINDOW: 'info',
  NO_ACTIVE_CARD: 'warning',
  WRONG_LOCATION: 'danger',
};

export function DecisionBadge({ decision }: { decision: ScanDecision }): JSX.Element {
  return <Badge variant={DECISION_VARIANTS[decision] ?? 'outline'}>{DECISION_LABELS[decision] ?? decision}</Badge>;
}

export function MetaRow({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function Timestamp({ value }: { value: string | null }): JSX.Element {
  return <span className="tabular text-xs text-muted-foreground">{formatDateTime(value)}</span>;
}
