import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  GROUPING_LABELS,
  GROUPINGS,
  PERIOD_CODES,
  PERIOD_COLORS,
  PERIOD_LABELS,
  type Grouping,
} from '@shared/meal';
import { PERMISSIONS } from '@shared/permissions';
import { formatNumber, rangeForDays, toISODate } from '@shared/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DecisionBadge, EmptyState, ErrorState, LoadingBlock, PageHeader, StatCard } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { departmentsApi, locationsApi, reportsApi, scansApi, type ReportQueryParams } from '@/lib/api';

const PRESETS = ['7 хоног', 'Сар', 'Улирал', 'Жил'] as const;
type Preset = (typeof PRESETS)[number];

const initial = rangeForDays(30);

export function ReportsPage(): JSX.Element {
  const { can } = useAuth();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [groupBy, setGroupBy] = useState<Grouping>('day');
  const [period, setPeriod] = useState('all');
  const [departmentId, setDepartmentId] = useState('all');
  const [locationId, setLocationId] = useState('all');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);

  const params: ReportQueryParams = {
    from,
    to,
    groupBy,
    period: period === 'all' ? undefined : (period as ReportQueryParams['period']),
    departmentId: departmentId === 'all' ? undefined : departmentId,
    locationId: locationId === 'all' ? undefined : locationId,
    includeVoided,
  };

  const summary = useQuery({ queryKey: ['reports', 'summary', params], queryFn: () => reportsApi.summary(params) });
  const counts = useQuery({ queryKey: ['reports', 'counts', params], queryFn: () => reportsApi.mealCounts(params) });
  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const locations = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list });
  const deptReport = useQuery({
    queryKey: ['reports', 'departments', params],
    queryFn: () => reportsApi.byDepartment(params),
  });
  const locationReport = useQuery({
    queryKey: ['reports', 'locations', params],
    queryFn: () => reportsApi.byLocation(params),
  });
  const integrity = useQuery({ queryKey: ['reports', 'integrity'], queryFn: reportsApi.integrity });
  const detail = useQuery({
    queryKey: ['reports', 'day-scans', detailDate, detailPage, params.period, params.departmentId, params.locationId],
    queryFn: () =>
      scansApi.list({
        from: detailDate!,
        to: detailDate!,
        period: params.period,
        departmentId: params.departmentId,
        locationId: params.locationId,
        page: detailPage,
        pageSize: 20,
      }),
    enabled: Boolean(detailDate),
  });

  const totals = counts.data?.totals;
  const chartRowTotals = (counts.data?.rows ?? []).reduce((acc, row) => acc + row.total, 0);

  const applyPreset = (preset: Preset): void => {
    if (preset === '7 хоног') {
      const range = rangeForDays(7);
      setFrom(range.from);
      setTo(range.to);
      return;
    }
    const today = toISODate();
    if (preset === 'Сар') {
      applyStart(`${today.slice(0, 7)}-01`);
      return;
    }
    const [year, month] = today.split('-').map(Number) as [number, number];
    if (preset === 'Улирал') {
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      applyStart(`${year}-${String(quarterStartMonth).padStart(2, '0')}-01`);
      return;
    }
    applyStart(`${year}-01-01`);
  };

  /** Улаанбаатарын өдрөөр «эхлэх → өнөөдөр» хүрээ тогтооно */
  const applyStart = (startIso: string): void => {
    setFrom(startIso);
    setTo(toISODate());
  };

  const exportExcel = async (): Promise<void> => {
    setExporting(true);
    try {
      const { blob, filename } = await reportsApi.exportExcel(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Excel файл татагдлаа');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Экспорт амжилтгүй');
    } finally {
      setExporting(false);
    }
  };

  const periodShares = PERIOD_CODES.map((code) => {
    const value = totals?.[code] ?? 0;
    const share = totals && totals.total > 0 ? Math.round((value / totals.total) * 100) : 0;
    return { code, value, share };
  });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Тайлан"
        description="Өдөр, 7 хоног, сар, улирал, жилээр хоолны бүртгэлийг нарийвчлан гаргана."
        actions={
          can(PERMISSIONS.REPORT_EXPORT) ? (
            <Button size="sm" variant="secondary" className="gap-2" onClick={exportExcel} disabled={exporting}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Excel татах
            </Button>
          ) : null
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1">
            <Label>Эхлэх</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Дуусах</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Бүлэглэл</Label>
            <Select value={groupBy} onValueChange={(value) => setGroupBy(value as Grouping)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUPINGS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {GROUPING_LABELS[item]}
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
                <SelectItem value="all">Бүх хоол</SelectItem>
                {PERIOD_CODES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {PERIOD_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Хэлтэс</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Бүх хэлтэс</SelectItem>
                {(departments.data?.items ?? []).map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Байршил</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Бүх байршил</SelectItem>
                {(locations.data?.items ?? []).map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <Button key={preset} variant="ghost" size="sm" onClick={() => applyPreset(preset)}>
              {preset}
            </Button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeVoided}
              onChange={(event) => setIncludeVoided(event.target.checked)}
              className="size-3.5 accent-[#e8c07d]"
            />
            Цуцлагдсаныг тооцох
          </label>
        </div>
      </Card>

      {summary.isLoading ? (
        <LoadingBlock />
      ) : summary.isError ? (
        <ErrorState message={(summary.error as Error).message} />
      ) : summary.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Нийт хоол"
              value={summary.data.total}
              hint={`${summary.data.from} → ${summary.data.to}`}
              accent
            />
            <StatCard label="Хоол авсан хүн" value={summary.data.uniqueUsers} hint="Давхардалгүй" />
            <StatCard label="Өдрийн дундаж" value={summary.data.avgPerDay} hint={`${summary.data.days} хоног`} />
            <StatCard
              label="Өмнөх үетэй харьцуулалт"
              value={
                summary.data.changePercent === null
                  ? '—'
                  : `${summary.data.changePercent > 0 ? '+' : ''}${summary.data.changePercent}%`
              }
              hint={`Өмнөх: ${formatNumber(summary.data.previous.total)}`}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Хугацааны бүлэглэл</CardTitle>
                <Badge variant="outline">{GROUPING_LABELS[groupBy]}</Badge>
              </CardHeader>
              <CardContent>
                {counts.isLoading ? (
                  <LoadingBlock />
                ) : counts.data && counts.data.rows.length > 0 ? (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={counts.data.rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis
                          dataKey="bucket"
                          tickFormatter={(value: string) => (groupBy === 'day' ? value.slice(5) : value.slice(0, 7))}
                          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          width={44}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                          contentStyle={{
                            background: 'rgba(16,16,22,0.96)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: 'rgba(255,255,255,0.65)' }}
                        />
                        {PERIOD_CODES.map((code) => (
                          <Bar
                            key={code}
                            dataKey={code}
                            name={PERIOD_LABELS[code]}
                            stackId="a"
                            fill={PERIOD_COLORS[code]}
                            radius={[2, 2, 0, 0]}
                            maxBarSize={38}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="Өгөгдөл алга" description="Сонгосон хугацаанд бүртгэл байхгүй." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Хоолны задаргаа</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {periodShares.map((item) => (
                  <div key={item.code} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm">
                        <span className="size-2 rounded-full" style={{ backgroundColor: PERIOD_COLORS[item.code] }} />
                        {PERIOD_LABELS[item.code]}
                      </span>
                      <span className="tabular text-sm font-medium">{formatNumber(item.value)}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${item.share}%`, backgroundColor: PERIOD_COLORS[item.code] }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.share}% хувь</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Бүлэг тус бүрийн тоо</CardTitle>
                <span className="text-xs text-muted-foreground">
                  Нийлбэр: <span className="tabular text-foreground">{formatNumber(chartRowTotals)}</span>
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Хугацаа</TableHead>
                      {PERIOD_CODES.map((code) => (
                        <TableHead key={code} className="text-right">
                          {PERIOD_LABELS[code]}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Нийт</TableHead>
                      <TableHead className="text-right">Хүн</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(counts.data?.rows ?? []).map((row) => (
                      <TableRow
                        key={row.bucket}
                        className={groupBy === 'day' ? 'cursor-pointer hover:bg-white/[0.04]' : undefined}
                        onClick={() => {
                          if (groupBy !== 'day') return;
                          setDetailPage(1);
                          setDetailDate(row.bucket);
                        }}
                      >
                        <TableCell>
                          <span
                            className={
                              groupBy === 'day'
                                ? 'tabular text-xs font-medium text-primary underline-offset-4 hover:underline'
                                : 'tabular text-xs'
                            }
                          >
                            {row.bucket}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular text-xs">{formatNumber(row.BREAKFAST)}</TableCell>
                        <TableCell className="text-right tabular text-xs">{formatNumber(row.LUNCH)}</TableCell>
                        <TableCell className="text-right tabular text-xs">{formatNumber(row.DINNER)}</TableCell>
                        <TableCell className="text-right tabular text-xs">{formatNumber(row.NIGHT)}</TableCell>
                        <TableCell className="text-right tabular text-xs font-medium">{formatNumber(row.total)}</TableCell>
                        <TableCell className="text-right tabular text-xs text-muted-foreground">
                          {formatNumber(row.uniqueUsers)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs">
                  <span className="text-muted-foreground">НИЙТ</span>
                  <div className="flex gap-4 tabular">
                    {PERIOD_CODES.map((code) => (
                      <span key={code}>{formatNumber(totals?.[code] ?? 0)}</span>
                    ))}
                    <span className="font-semibold text-primary">{formatNumber(totals?.total ?? 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Байршлын задаргаа</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {locationReport.data && locationReport.data.rows.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Байршил</TableHead>
                          <TableHead className="text-right">Хүн</TableHead>
                          <TableHead className="text-right">Хоол</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {locationReport.data.rows.map((row) => (
                          <TableRow key={row.locationId ?? row.locationName}>
                            <TableCell className="text-xs">{row.locationName}</TableCell>
                            <TableCell className="text-right tabular text-xs">{row.uniqueUsers}</TableCell>
                            <TableCell className="text-right tabular text-xs">{formatNumber(row.meals)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <EmptyState title="Байршлын өгөгдөл алга" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Хэлтсийн задаргаа</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {deptReport.data && deptReport.data.rows.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Хэлтэс</TableHead>
                          <TableHead className="text-right">Хүн</TableHead>
                          <TableHead className="text-right">Хоол</TableHead>
                          <TableHead className="text-right">Дундаж</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deptReport.data.rows.map((row) => (
                          <TableRow key={row.departmentId ?? row.departmentName}>
                            <TableCell className="text-xs">{row.departmentName}</TableCell>
                            <TableCell className="text-right tabular text-xs">{row.holders}</TableCell>
                            <TableCell className="text-right tabular text-xs">{formatNumber(row.meals)}</TableCell>
                            <TableCell className="text-right tabular text-xs text-muted-foreground">
                              {row.holders > 0 ? (row.meals / row.holders).toFixed(1) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <EmptyState title="Хэлтсийн өгөгдөл алга" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    Нарийвчлалын хяналт
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {integrity.data ? (
                    <>
                      <CheckRow
                        label="Хүлээн авсан уншилт"
                        value={formatNumber(integrity.data.scanAccepted)}
                      />
                      <CheckRow label="Хоолны бүртгэл" value={formatNumber(integrity.data.mealRecords)} />
                      <CheckRow
                        label="Дутуу бүртгэл"
                        value={formatNumber(integrity.data.missingRecords)}
                        danger={integrity.data.missingRecords > 0}
                      />
                      <CheckRow
                        label="Эх сурвалжгүй бүртгэл"
                        value={formatNumber(integrity.data.orphanRecords)}
                        danger={integrity.data.orphanRecords > 0}
                      />
                      <CheckRow label="Давхар оролдлого" value={formatNumber(integrity.data.duplicateAttempts)} />
                      <CheckRow
                        label="Цагийн зөрүү ихтэй"
                        value={formatNumber(integrity.data.clockSkewHigh)}
                      />
                      <CheckRow
                        label={
                          integrity.data.missingRecords === 0 && integrity.data.orphanRecords === 0
                            ? 'Төлөв: бүрэн нийцэж байна'
                            : 'Төлөв: зөрүү илэрлээ'
                        }
                        value=""
                        good={integrity.data.missingRecords === 0 && integrity.data.orphanRecords === 0}
                      />
                    </>
                  ) : (
                    <p className="text-muted-foreground">Ачаалж байна…</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}

      <Dialog
        open={Boolean(detailDate)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailDate(null);
            setDetailPage(1);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{detailDate} — уншилтын дэлгэрэнгүй</DialogTitle>
            <DialogDescription>
              {detail.data ? `Нийт ${formatNumber(detail.data.total)} уншилт` : 'Ачаалж байна…'}
              {period !== 'all' ? ` · ${PERIOD_LABELS[period as keyof typeof PERIOD_LABELS]}` : ''}
            </DialogDescription>
          </DialogHeader>

          {detail.isLoading ? (
            <LoadingBlock />
          ) : detail.isError ? (
            <ErrorState message={(detail.error as Error).message} />
          ) : detail.data && detail.data.items.length > 0 ? (
            <>
              <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-white/[0.08]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Цаг</TableHead>
                      <TableHead>Ажилтан</TableHead>
                      <TableHead>Карт</TableHead>
                      <TableHead>Хоол</TableHead>
                      <TableHead>Байршил</TableHead>
                      <TableHead className="text-right">Шийдвэр</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.data.items.map((scan) => (
                      <TableRow key={scan.id}>
                        <TableCell className="tabular text-xs">
                          {new Date(scan.scannedAt).toLocaleTimeString('mn-MN', {
                            timeZone: 'Asia/Ulaanbaatar',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium">{scan.userName ?? 'Тодорхойгүй'}</p>
                          <p className="text-[11px] text-muted-foreground">{scan.employeeNo ?? '—'}</p>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{scan.cardUid}</TableCell>
                        <TableCell className="text-xs">
                          {scan.periodCode ? PERIOD_LABELS[scan.periodCode] : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{scan.locationName ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <DecisionBadge decision={scan.decision} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Хуудас {detail.data.page} /{' '}
                  {Math.max(1, Math.ceil(detail.data.total / detail.data.pageSize))}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={detailPage <= 1}
                    onClick={() => setDetailPage((page) => page - 1)}
                  >
                    Өмнөх
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={detailPage >= Math.ceil(detail.data.total / detail.data.pageSize)}
                    onClick={() => setDetailPage((page) => page + 1)}
                  >
                    Дараах
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="Уншилт байхгүй" description="Сонгосон өдөр уншилт бүртгэгдээгүй байна." />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckRow({
  label,
  value,
  danger,
  good,
}: {
  label: string;
  value: string;
  danger?: boolean;
  good?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          danger ? 'tabular font-medium text-rose-300' : good ? 'tabular font-medium text-emerald-300' : 'tabular font-medium'
        }
      >
        {value}
      </span>
    </div>
  );
}
