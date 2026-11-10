import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, MonitorSmartphone, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PERIOD_COLORS, PERIOD_FULL_LABELS, PERIOD_LABELS } from '@shared/meal';
import { PERMISSIONS, PERMISSION_LABELS, ROLE_LABELS } from '@shared/permissions';
import { formatDateTime } from '@shared/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, LoadingBlock, MetaRow, PageHeader } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { auditApi, devicesApi, periodsApi, type PeriodItem } from '@/lib/api';

function PeriodCard({ period }: { period: PeriodItem }): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState(period.name);
  const [startTime, setStartTime] = useState(period.startTime);
  const [endTime, setEndTime] = useState(period.endTime);
  const [isActive, setIsActive] = useState(period.isActive);

  useEffect(() => {
    setName(period.name);
    setStartTime(period.startTime);
    setEndTime(period.endTime);
    setIsActive(period.isActive);
  }, [period]);

  const mutation = useMutation({
    mutationFn: () => periodsApi.update(period.id, { name, startTime, endTime, isActive }),
    onSuccess: async () => {
      toast.success('Хоолны цонх хадгалагдлаа');
      await queryClient.invalidateQueries({ queryKey: ['periods'] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dirty =
    name !== period.name ||
    startTime !== period.startTime ||
    endTime !== period.endTime ||
    isActive !== period.isActive;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: PERIOD_COLORS[period.code] }} />
          <p className="text-sm font-medium">{PERIOD_FULL_LABELS[period.code]}</p>
          {period.crossesMidnight ? <Badge variant="info">00:00-ийг даана</Badge> : null}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="size-3.5 accent-[#e8c07d]"
          />
          Идэвхтэй
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
        <div className="space-y-1">
          <Label>Нэр</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Эхлэх</Label>
          <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Дуусах</Label>
          <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </div>
        <div className="flex items-end">
          <Button
            size="sm"
            className="w-full gap-2"
            disabled={!dirty || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Хадгалах
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage(): JSX.Element {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ code: '', name: '', location: '' });
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);

  const periods = useQuery({ queryKey: ['periods'], queryFn: periodsApi.list });
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
    enabled: can(PERMISSIONS.DEVICE_MANAGE),
  });
  const audit = useQuery({
    queryKey: ['audit', auditPage],
    queryFn: () => auditApi.list(auditPage, 20),
    enabled: can(PERMISSIONS.AUDIT_READ),
  });

  const createDevice = useMutation({
    mutationFn: () => devicesApi.create(deviceForm),
    onSuccess: async (data) => {
      setDeviceOpen(false);
      setDeviceForm({ code: '', name: '', location: '' });
      setApiKey(data.apiKey);
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rotateKey = useMutation({
    mutationFn: (id: string) => devicesApi.rotate(id),
    onSuccess: (data) => setApiKey(data.apiKey),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="animate-fade-up">
      <PageHeader title="Тохиргоо" description="Хоолны цонх, төхөөрөмж, аудит болон өөрийн эрхийн мэдээлэл." />

      <Tabs defaultValue="periods">
        <TabsList>
          <TabsTrigger value="periods">Хоолны цонх</TabsTrigger>
          {can(PERMISSIONS.DEVICE_MANAGE) ? <TabsTrigger value="devices">Төхөөрөмж</TabsTrigger> : null}
          {can(PERMISSIONS.AUDIT_READ) ? <TabsTrigger value="audit">Аудит</TabsTrigger> : null}
          <TabsTrigger value="profile">Профайл</TabsTrigger>
        </TabsList>

        <TabsContent value="periods">
          <Card>
            <CardHeader>
              <CardTitle>Хоолны цагийн цонх</CardTitle>
              <p className="text-xs text-muted-foreground">
                Уншилт эдгээр цонхны аль нэгэнд багтсан үед л хоол бүртгэгдэнэ. 00:00-ийг давах цонхыг
                «шөнийн» гэж тохируулна.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {periods.isLoading ? (
                <LoadingBlock />
              ) : (
                (periods.data?.items ?? []).map((period) => <PeriodCard key={period.id} period={period} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {can(PERMISSIONS.DEVICE_MANAGE) ? (
          <TabsContent value="devices">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Уншигч төхөөрөмж</CardTitle>
                <Button size="sm" className="gap-2" onClick={() => setDeviceOpen(true)}>
                  <Plus className="size-4" />
                  Төхөөрөмж нэмэх
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {devices.isLoading ? (
                  <LoadingBlock />
                ) : devices.data && devices.data.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Код</TableHead>
                        <TableHead>Нэр</TableHead>
                        <TableHead>Байршил</TableHead>
                        <TableHead>Сүүлд холбогдсон</TableHead>
                        <TableHead className="text-right">Түлхүүр</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {devices.data.items.map((device) => (
                        <TableRow key={device.id}>
                          <TableCell className="font-mono text-xs">{device.code}</TableCell>
                          <TableCell className="text-sm">{device.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{device.location ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(device.lastSeenAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              disabled={rotateKey.isPending}
                              onClick={() => rotateKey.mutate(device.id)}
                            >
                              <KeyRound className="size-3.5" />
                              Шинэчлэх
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState title="Төхөөрөмж байхгүй" />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {can(PERMISSIONS.AUDIT_READ) ? (
          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Аудит лог</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {audit.isLoading ? (
                  <LoadingBlock />
                ) : audit.data && audit.data.items.length > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Цаг</TableHead>
                          <TableHead>Хэрэглэгч</TableHead>
                          <TableHead>Үйлдэл</TableHead>
                          <TableHead>Объект</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {audit.data.items.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="tabular text-xs text-muted-foreground">
                              {formatDateTime(log.createdAt)}
                            </TableCell>
                            <TableCell className="text-xs">{log.actorName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-[11px]">
                                {log.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {log.entity}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-xs text-muted-foreground">
                      <span>Нийт {audit.data.total}</span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={auditPage <= 1}
                          onClick={() => setAuditPage((page) => page - 1)}
                        >
                          Өмнөх
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={auditPage * audit.data.pageSize >= audit.data.total}
                          onClick={() => setAuditPage((page) => page + 1)}
                        >
                          Дараах
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState title="Лог байхгүй" />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="profile">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Миний мэдээлэл</CardTitle>
              </CardHeader>
              <CardContent>
                <MetaRow label="Ажилтны дугаар" value={user?.employeeNo ?? '—'} />
                <MetaRow label="Нэр" value={user ? `${user.lastName} ${user.firstName}` : '—'} />
                <MetaRow label="И-мэйл" value={user?.email ?? '—'} />
                <MetaRow label="Эрх" value={user ? ROLE_LABELS[user.role] : '—'} />
                <MetaRow label="Хэлтэс" value={user?.departmentName ?? '—'} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Эрхийн жагсаалт</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(user?.permissions ?? []).map((permission) => (
                    <Badge key={permission} variant="gold">
                      {PERMISSION_LABELS[permission] ?? permission}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Шинэ төхөөрөмж</DialogTitle>
            <DialogDescription>Түлхүүр нь зөвхөн нэг удаа харагдана — kiosk дээр хадгална уу.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createDevice.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Код</Label>
              <Input
                value={deviceForm.code}
                onChange={(event) => setDeviceForm({ ...deviceForm, code: event.target.value })}
                placeholder="KIOSK-02"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Нэр</Label>
              <Input
                value={deviceForm.name}
                onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })}
                placeholder="2 дахь терминал"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Байршил</Label>
              <Input
                value={deviceForm.location}
                onChange={(event) => setDeviceForm({ ...deviceForm, location: event.target.value })}
                placeholder="2 давхар"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeviceOpen(false)}>
                Болих
              </Button>
              <Button type="submit" disabled={createDevice.isPending} className="gap-2">
                {createDevice.isPending ? <Loader2 className="size-4 animate-spin" /> : <MonitorSmartphone className="size-4" />}
                Үүсгэх
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(apiKey)} onOpenChange={(open) => !open && setApiKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Төхөөрөмжийн түлхүүр</DialogTitle>
            <DialogDescription>Энэ утгыг kiosk-ийн тохиргоонд хадгална. Дахин харагдахгүй.</DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 font-mono text-xs">
            {apiKey}
          </p>
          <DialogFooter>
            <Button onClick={() => setApiKey(null)}>Ойлголоо</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-4 text-[11px] text-muted-foreground">
        {PERIOD_LABELS.BREAKFAST} · {PERIOD_LABELS.LUNCH} · {PERIOD_LABELS.DINNER} · {PERIOD_LABELS.NIGHT} — бизнес
        өдөр 04:00-д солигдоно.
      </p>
    </div>
  );
}
