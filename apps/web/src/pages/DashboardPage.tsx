import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, ScanLine, TrendingUp, UserRoundCheck, Utensils } from 'lucide-react';
import { PERIOD_COLORS, PERIOD_LABELS, PERIOD_CODES } from '@shared/meal';
import { formatNumber } from '@shared/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DecisionBadge, EmptyState, ErrorState, LoadingBlock, PageHeader, PeriodBadge, StatCard } from '@/components/common';
import { reportsApi, scansApi } from '@/lib/api';

export function DashboardPage(): JSX.Element {
  const today = useQuery({ queryKey: ['reports', 'today'], queryFn: reportsApi.today, refetchInterval: 30_000 });
  const recent = useQuery({
    queryKey: ['scans', 'recent'],
    queryFn: () => scansApi.list({ pageSize: 8 }),
    refetchInterval: 20_000,
  });

  if (today.isError) return <ErrorState message={(today.error as Error).message} />;

  const data = today.data;
  const trend = data?.trend ?? [];
  const periodTotal = PERIOD_CODES.reduce((sum, code) => sum + (data?.byPeriod[code] ?? 0), 0) || 1;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Самбар"
        description="Өнөөдрийн хоолны бүртгэл, сүүлийн 7 хоногийн чиг хандлага."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/reports">
              Тайлан руу <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      {today.isLoading ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Өнөөдрийн хоол"
              value={data?.total ?? 0}
              hint={`Бизнес өдөр ${data?.businessDate ?? '—'}`}
              icon={<Utensils className="size-4" />}
              accent
            />
            <StatCard
              label="Хоол авсан хүн"
              value={data?.holders ?? 0}
              hint="Давхардалгүй тоо"
              icon={<UserRoundCheck className="size-4" />}
            />
            <StatCard
              label="Дундаж / хэрэглэгч"
              value={data && data.holders > 0 ? (data.total / data.holders).toFixed(1) : '0'}
              hint="Өнөөдрийн харьцаа"
              icon={<TrendingUp className="size-4" />}
            />
            <StatCard
              label="Шөнийн хоол"
              value={data?.byPeriod.NIGHT ?? 0}
              hint="22:00–02:00 цонх"
              icon={<ScanLine className="size-4" />}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>7 хоногийн урсгал</CardTitle>
                <div className="flex flex-wrap gap-3">
                  {PERIOD_CODES.map((code) => (
                    <span key={code} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="size-2 rounded-full" style={{ backgroundColor: PERIOD_COLORS[code] }} />
                      {PERIOD_LABELS[code]}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        {PERIOD_CODES.map((code) => (
                          <linearGradient key={code} id={`grad-${code}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={PERIOD_COLORS[code]} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={PERIOD_COLORS[code]} stopOpacity={0.02} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="bucket"
                        tickFormatter={(value: string) => value.slice(5)}
                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(16,16,22,0.95)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: 'rgba(255,255,255,0.65)' }}
                      />
                      {PERIOD_CODES.map((code) => (
                        <Area
                          key={code}
                          type="monotone"
                          dataKey={code}
                          name={PERIOD_LABELS[code]}
                          stackId="1"
                          stroke={PERIOD_COLORS[code]}
                          strokeWidth={1.5}
                          fill={`url(#grad-${code})`}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Өнөөдрийн хуваарилалт</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {PERIOD_CODES.map((code) => {
                  const value = data?.byPeriod[code] ?? 0;
                  const percent = Math.round((value / periodTotal) * 100);
                  return (
                    <div key={code}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <PeriodBadge code={code} />
                        <span className="tabular text-muted-foreground">
                          {formatNumber(value)} · {percent}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percent}%`, backgroundColor: PERIOD_COLORS[code] }}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="mt-6 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Хоолны цонх</p>
                  {(data?.periods ?? []).map((period) => (
                    <div key={period.code} className="flex items-center justify-between text-xs">
                      <span>{period.name}</span>
                      <span className="tabular text-muted-foreground">
                        {period.startTime}–{period.endTime}
                        {period.crossesMidnight ? ' (+1)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Сүүлийн уншилтууд</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/scans">Бүгдийг харах</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {recent.isLoading ? (
                <LoadingBlock />
              ) : recent.data && recent.data.items.length > 0 ? (
                <ul className="divide-y divide-white/[0.06]">
                  {recent.data.items.map((scan) => (
                    <li key={scan.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {scan.userName ?? 'Тодорхойгүй карт'}
                          {scan.employeeNo ? (
                            <span className="ml-2 text-[11px] text-muted-foreground">{scan.employeeNo}</span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          <PeriodBadge code={scan.periodCode} /> ·{' '}
                          {new Date(scan.scannedAt).toLocaleTimeString('mn-MN', {
                            timeZone: 'Asia/Ulaanbaatar',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <DecisionBadge decision={scan.decision} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Уншилт алга" description="Карт уншигдмагц энд шууд харагдана." />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
