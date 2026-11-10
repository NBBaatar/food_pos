import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { DECISION_LABELS, PERIOD_CODES, PERIOD_LABELS, SCAN_DECISIONS } from '@shared/meal';
import { PERMISSIONS } from '@shared/permissions';
import type { ScanRow } from '@shared/types';
import { formatDateTime, rangeForDays } from '@shared/format';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DecisionBadge, EmptyState, ErrorState, LoadingBlock, PageHeader, PeriodBadge } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { scansApi } from '@/lib/api';

const initialRange = rangeForDays(7);

export function ScansPage(): JSX.Element {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [decision, setDecision] = useState('all');
  const [period, setPeriod] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [voidTarget, setVoidTarget] = useState<ScanRow | null>(null);
  const [reason, setReason] = useState('');

  const params = useMemo(
    () => ({
      from,
      to,
      decision: decision === 'all' ? undefined : decision,
      period: period === 'all' ? undefined : period,
      search: search.trim() || undefined,
      page,
      pageSize: 25,
    }),
    [from, to, decision, period, search, page],
  );

  const scans = useQuery({ queryKey: ['scans', params], queryFn: () => scansApi.list(params) });

  useEffect(() => {
    setPage(1);
  }, [from, to, decision, period, search]);

  const voidMutation = useMutation({
    mutationFn: () => scansApi.void(voidTarget!.id, reason.trim()),
    onSuccess: async () => {
      toast.success('Бүртгэл цуцлагдлаа');
      setVoidTarget(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['scans'] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totalPages = scans.data ? Math.max(1, Math.ceil(scans.data.total / scans.data.pageSize)) : 1;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Уншилт"
        description="Бүх картын уншилтын түүх, шийдвэр, залруулга."
        actions={
          <Badge variant="outline" className="h-8">
            {scans.data ? `${scans.data.total} уншилт` : '—'}
          </Badge>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label>Эхлэх</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Дуусах</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Шийдвэр</Label>
            <Select value={decision} onValueChange={setDecision}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Бүгд</SelectItem>
                {SCAN_DECISIONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {DECISION_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Хоол</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Бүгд</SelectItem>
                {PERIOD_CODES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {PERIOD_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Хайлт</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="нэр / UID"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {scans.isLoading ? (
          <LoadingBlock />
        ) : scans.isError ? (
          <ErrorState message={(scans.error as Error).message} />
        ) : scans.data && scans.data.items.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Цаг</TableHead>
                  <TableHead>Хэрэглэгч</TableHead>
                  <TableHead>Карт</TableHead>
                  <TableHead>Хоол</TableHead>
                  <TableHead>Шийдвэр</TableHead>
                  <TableHead>Төхөөрөмж</TableHead>
                  <TableHead className="text-right">Үйлдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scans.data.items.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell>
                      <p className="tabular text-xs">{formatDateTime(scan.scannedAt)}</p>
                      <p className="text-[11px] text-muted-foreground">{scan.businessDate}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{scan.userName ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{scan.employeeNo ?? ''}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{scan.cardUid}</TableCell>
                    <TableCell>
                      <PeriodBadge code={scan.periodCode} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <DecisionBadge decision={scan.decision} />
                        {scan.voidedAt ? <span className="text-[11px] text-rose-300">цуцлагдсан</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{scan.deviceName ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {can(PERMISSIONS.SCAN_CORRECT) && scan.decision === 'ACCEPTED' && !scan.voidedAt ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Цуцлах"
                          onClick={() => {
                            setVoidTarget(scan);
                            setReason('');
                          }}
                        >
                          <Undo2 className="size-4 text-rose-300" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-xs text-muted-foreground">
              <span>
                Хуудас {scans.data.page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Өмнөх
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Дараах
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="Уншилт олдсонгүй" description="Огноо эсвэл шүүлтүүрээ өөрчилж үзнэ үү." />
        )}
      </Card>

      <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Бүртгэл цуцлах</DialogTitle>
            <DialogDescription>
              Уншилт устгагдахгүй — зөвхөн хоолны бүртгэл хүчингүй болж, аудит логт үлдэнэ.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs">
            <p>{voidTarget?.userName}</p>
            <p className="font-mono text-muted-foreground">{voidTarget?.cardUid}</p>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label>Шалтгаан</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="жишээ: буруу карт уншигдсан"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidTarget(null)}>
              Болих
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || voidMutation.isPending}
              onClick={() => voidMutation.mutate()}
            >
              Цуцлах
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
