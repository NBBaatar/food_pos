import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PERIOD_COLORS, PERIOD_FULL_LABELS, PERIOD_LABELS } from '@shared/meal';
import { PERMISSIONS } from '@shared/permissions';
import { formatDateTime } from '@shared/format';
import type { LocationItem } from '@shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { imageFileToDataUrl } from '@/lib/image';
import {
  auditApi,
  brandingApi,
  companiesApi,
  departmentsApi,
  locationsApi,
  periodsApi,
  referenceApi,
  type CompanyItem,
  type DepartmentItem,
  type PeriodItem,
  type ReferenceItem,
} from '@/lib/api';

function LocationRow({ location }: { location: LocationItem }): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState(location.name);

  useEffect(() => setName(location.name), [location.name]);

  const save = useMutation({
    mutationFn: () => locationsApi.update(location.id, { name }),
    onSuccess: async () => {
      toast.success('Байршил хадгалагдлаа');
      await queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: () =>
      locationsApi.update(location.id, {
        status: location.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <TableRow>
      <TableCell>
        <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8 max-w-[280px]" />
      </TableCell>
      <TableCell>
        <Badge variant={location.status === 'ACTIVE' ? 'gold' : 'outline'}>{location.status}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            disabled={name === location.name || !name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="size-3.5" />
            Хадгалах
          </Button>
          <Button variant="ghost" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
            {location.status === 'ACTIVE' ? 'Идэвхгүй' : 'Идэвхжүүлэх'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CompanyRow({ company }: { company: CompanyItem }): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState(company.name);

  useEffect(() => setName(company.name), [company.name]);

  const save = useMutation({
    mutationFn: () => companiesApi.update(company.id, { name: name.trim() }),
    onSuccess: async () => {
      toast.success('Компани хадгалагдлаа');
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <TableRow>
      <TableCell>
        <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8 max-w-[320px]" />
      </TableCell>
      <TableCell className="tabular text-xs text-muted-foreground">{company.userCount}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          disabled={!name.trim() || name.trim() === company.name || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save className="size-3.5" />
          Хадгалах
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DepartmentRow({ department }: { department: DepartmentItem }): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState(department.name);
  const [code, setCode] = useState(department.code ?? '');

  useEffect(() => {
    setName(department.name);
    setCode(department.code ?? '');
  }, [department.name, department.code]);

  const save = useMutation({
    mutationFn: () => departmentsApi.update(department.id, { name: name.trim(), code: code.trim() }),
    onSuccess: async () => {
      toast.success('Хэлтэс хадгалагдлаа');
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => departmentsApi.remove(department.id),
    onSuccess: async () => {
      toast.success('Хэлтэс устгагдлаа');
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dirty = name.trim() !== department.name || code.trim() !== (department.code ?? '');

  return (
    <TableRow>
      <TableCell>
        <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8 max-w-[260px]" />
      </TableCell>
      <TableCell>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="—"
          className="h-8 w-28 font-mono"
        />
      </TableCell>
      <TableCell className="tabular text-xs text-muted-foreground">{department.userCount}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            disabled={!dirty || !name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="size-3.5" />
            Хадгалах
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={department.userCount > 0 ? 'Хэрэглэгчтэй хэлтэс устгахгүй' : 'Устгах'}
            disabled={department.userCount > 0 || remove.isPending}
            onClick={() => {
              if (window.confirm(`«${department.name}» хэлтсийг устгах уу?`)) remove.mutate();
            }}
          >
            <Trash2 className="size-4 text-rose-300" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReferenceRow({ kind, item }: { kind: 'units' | 'positions'; item: ReferenceItem }): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item.name);

  useEffect(() => setName(item.name), [item.name]);

  const save = useMutation({
    mutationFn: () => referenceApi.update(kind, item.id, name.trim()),
    onSuccess: async () => {
      toast.success('Хадгалагдлаа');
      await queryClient.invalidateQueries({ queryKey: ['reference', kind] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => referenceApi.remove(kind, item.id),
    onSuccess: async () => {
      toast.success('Устгагдлаа');
      await queryClient.invalidateQueries({ queryKey: ['reference', kind] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <TableRow>
      <TableCell>
        <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8 max-w-[300px]" />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            disabled={!name.trim() || name.trim() === item.name || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="size-3.5" />
            Хадгалах
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Устгах"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`«${item.name}»-г устгах уу?`)) remove.mutate();
            }}
          >
            <Trash2 className="size-4 text-rose-300" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReferenceManager({
  kind,
  title,
  description,
  placeholder,
}: {
  kind: 'units' | 'positions';
  title: string;
  description: string;
  placeholder: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const items = useQuery({
    queryKey: ['reference', kind],
    queryFn: () => referenceApi.list(kind),
  });
  const create = useMutation({
    mutationFn: () => referenceApi.create(kind, name.trim()),
    onSuccess: async () => {
      setName('');
      toast.success('Нэмэгдлээ');
      await queryClient.invalidateQueries({ queryKey: ['reference', kind] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4 p-0">
        <form
          className="flex gap-2 px-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={placeholder} />
          <Button type="submit" className="shrink-0 gap-2" disabled={!name.trim() || create.isPending}>
            <Plus className="size-4" />
            Нэмэх
          </Button>
        </form>
        <div className="border-t border-white/[0.06]">
          {items.isLoading ? (
            <LoadingBlock />
          ) : items.data && items.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Нэр</TableHead>
                  <TableHead className="text-right">Үйлдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.data.items.map((item) => (
                  <ReferenceRow key={item.id} kind={kind} item={item} />
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="Жагсаалт хоосон" description="Дээрх талбарт нэр бичээд нэмнэ үү." />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

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
  const [locationName, setLocationName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [footerText, setFooterText] = useState('');
  const [copyright, setCopyright] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const periods = useQuery({ queryKey: ['periods'], queryFn: periodsApi.list });
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: departmentsApi.list,
    enabled: user?.role === 'ADMIN',
  });
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
    enabled: can(PERMISSIONS.DEVICE_MANAGE),
  });
  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: companiesApi.list,
    enabled: user?.role === 'ADMIN',
  });
  const branding = useQuery({ queryKey: ['branding'], queryFn: brandingApi.get });
  const audit = useQuery({
    queryKey: ['audit', auditPage],
    queryFn: () => auditApi.list(auditPage, 20),
    enabled: can(PERMISSIONS.AUDIT_READ),
  });

  useEffect(() => {
    if (!branding.data) return;
    setCompanyName(branding.data.companyName);
    setFooterText(branding.data.footerText);
    setCopyright(branding.data.copyright);
    setLogoUrl(branding.data.logoUrl);
  }, [branding.data]);

  const createDepartment = useMutation({
    mutationFn: () => departmentsApi.create({ name: departmentName.trim(), code: departmentCode.trim() || undefined }),
    onSuccess: async () => {
      setDepartmentName('');
      setDepartmentCode('');
      toast.success('Хэлтэс нэмэгдлээ');
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createCompany = useMutation({
    mutationFn: () => companiesApi.create({ name: newCompanyName.trim() }),
    onSuccess: async () => {
      setNewCompanyName('');
      toast.success('Компани нэмэгдлээ');
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createLocation = useMutation({
    mutationFn: () => locationsApi.create({ name: locationName.trim() }),
    onSuccess: async () => {
      setLocationName('');
      toast.success('Байршил нэмэгдлээ');
      await queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveBranding = useMutation({
    mutationFn: () => brandingApi.update({ companyName, footerText, copyright, logoUrl }),
    onSuccess: async () => {
      toast.success('Компанийн нэр, footer, лого хадгалагдлаа');
      await queryClient.invalidateQueries({ queryKey: ['branding'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pickLogo = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setLogoBusy(true);
    try {
      setLogoUrl(await imageFileToDataUrl(file, { maxSize: 400 }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Лого уншиж чадсангүй');
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Тохиргоо"
        description="Хоолны цонх, байршил, хэлтэс, туслан гүйцэтгэгч компани, лавлах болон аудитын тохиргоо."
      />

      <Tabs defaultValue="periods">
        <TabsList>
          <TabsTrigger value="periods">Хоолны цонх</TabsTrigger>
          {can(PERMISSIONS.DEVICE_MANAGE) ? <TabsTrigger value="locations">Байршил</TabsTrigger> : null}
          {user?.role === 'ADMIN' ? <TabsTrigger value="departments">Хэлтэс</TabsTrigger> : null}
          {user?.role === 'ADMIN' ? <TabsTrigger value="companies">Туслан гүйцэтгэгч</TabsTrigger> : null}
          {user?.role === 'ADMIN' ? <TabsTrigger value="reference">Нэгж, албан тушаал</TabsTrigger> : null}
          {can(PERMISSIONS.BRANDING_MANAGE) ? <TabsTrigger value="branding">Footer, лого</TabsTrigger> : null}
          {can(PERMISSIONS.AUDIT_READ) ? <TabsTrigger value="audit">Аудит</TabsTrigger> : null}
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
          <TabsContent value="locations">
            <Card>
              <CardHeader>
                <CardTitle>Уншилтын байршил</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Киоск дээр уншилт хийхдээ эдгээрээс сонгоно. Зөвхөн идэвхтэй байршил киоск дээр харагдана.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 p-0">
                <form
                  className="flex gap-2 px-4 sm:max-w-md"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (locationName.trim()) createLocation.mutate();
                  }}
                >
                  <Input
                    value={locationName}
                    onChange={(event) => setLocationName(event.target.value)}
                    placeholder="Жишээ: 2 давхар, цехийн терминал"
                  />
                  <Button type="submit" className="shrink-0 gap-2" disabled={!locationName.trim() || createLocation.isPending}>
                    <Plus className="size-4" />
                    Нэмэх
                  </Button>
                </form>

                <div className="border-t border-white/[0.06]">
                  {locations.isLoading ? (
                    <LoadingBlock />
                  ) : locations.data && locations.data.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Нэр</TableHead>
                          <TableHead>Төлөв</TableHead>
                          <TableHead className="text-right">Үйлдэл</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {locations.data.items.map((location) => (
                          <LocationRow key={location.id} location={location} />
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <EmptyState title="Байршил байхгүй" description="Киоск ажиллуулахын тулд дор хаяж нэг байршил нэмнэ үү." />
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}        {user?.role === 'ADMIN' ? (
          <TabsContent value="departments">
            <Card>
              <CardHeader>
                <CardTitle>Хэлтэс</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Хэрэглэгчийг хэлтэст хуваарилах энэ жагсаалтыг ашиглана. Хэрэглэгчтэй хэлтсийг устгахын өмнө
                  хэрэглэгчдийг өөр хэлтэст шилжүүлнэ үү.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 p-0">
                <form
                  className="grid gap-2 px-4 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:max-w-2xl"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (departmentName.trim()) createDepartment.mutate();
                  }}
                >
                  <Input
                    value={departmentName}
                    onChange={(event) => setDepartmentName(event.target.value)}
                    placeholder="Хэлтсийн нэр"
                  />
                  <Input
                    value={departmentCode}
                    onChange={(event) => setDepartmentCode(event.target.value)}
                    placeholder="Код (заавал биш)"
                    className="font-mono"
                  />
                  <Button
                    type="submit"
                    className="gap-2"
                    disabled={!departmentName.trim() || createDepartment.isPending}
                  >
                    <Plus className="size-4" />
                    Нэмэх
                  </Button>
                </form>

                <div className="border-t border-white/[0.06]">
                  {departments.isLoading ? (
                    <LoadingBlock />
                  ) : departments.data && departments.data.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Нэр</TableHead>
                          <TableHead>Код</TableHead>
                          <TableHead>Хэрэглэгч</TableHead>
                          <TableHead className="text-right">Үйлдэл</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {departments.data.items.map((department) => (
                          <DepartmentRow key={department.id} department={department} />
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <EmptyState title="Хэлтэс байхгүй" description="Эхний хэлтсээ нэмнэ үү." />
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {user?.role === 'ADMIN' ? (
          <TabsContent value="companies">
            <Card>
              <CardHeader>
                <CardTitle>Туслан гүйцэтгэгч компани</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Хэрэглэгч бүртгэхэд энэ жагсаалтаас хамааруулж сонгоно. Карт уншуулахад ажилтны кодын доор
                  компанийн нэр харагдана.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 p-0">
                <form
                  className="flex gap-2 px-4 sm:max-w-lg"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (newCompanyName.trim()) createCompany.mutate();
                  }}
                >
                  <Input
                    value={newCompanyName}
                    onChange={(event) => setNewCompanyName(event.target.value)}
                    placeholder="Жишээ: «Тэнгэр» ХХК"
                    maxLength={120}
                  />
                  <Button
                    type="submit"
                    className="shrink-0 gap-2"
                    disabled={!newCompanyName.trim() || createCompany.isPending}
                  >
                    <Plus className="size-4" />
                    Нэмэх
                  </Button>
                </form>

                <div className="border-t border-white/[0.06]">
                  {companies.isLoading ? (
                    <LoadingBlock />
                  ) : companies.data && companies.data.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Нэр</TableHead>
                          <TableHead>Хэрэглэгч</TableHead>
                          <TableHead className="text-right">Үйлдэл</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companies.data.items.map((company) => (
                          <CompanyRow key={company.id} company={company} />
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <EmptyState
                      title="Компани байхгүй"
                      description="Туслан гүйцэтгэгч компаний нэрийг энд бүртгэнэ үү."
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {user?.role === 'ADMIN' ? (
          <TabsContent value="reference">
            <div className="grid gap-4 xl:grid-cols-2">
              <ReferenceManager
                kind="units"
                title="Нэгж"
                description="Хэрэглэгч бүртгэхэд энэ жагсаалтаас сонгоно. Эхний үсэг бичихэд санал гарч ирнэ."
                placeholder="Жишээ: Нэгж 1"
              />
              <ReferenceManager
                kind="positions"
                title="Албан тушаал"
                description="Хэрэглэгчийн албан тушаалын санал болгох жагсаалт."
                placeholder="Жишээ: Мэргэжилтэн"
              />
            </div>
          </TabsContent>
        ) : null}

        {can(PERMISSIONS.BRANDING_MANAGE) ? (

          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle>Компанийн нэр, footer болон лого</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Компанийн нэр болон лого нь бүх хуудасны header-т, footer-ийн мэдээлэл доод хэсэгт харагдана.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Компанийн нэр</Label>
                  <Input
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    maxLength={120}
                    placeholder="Food POS"
                  />
                  <p className="text-[11px] text-muted-foreground">Логоны хажууд header дээр харагдана.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Footer-ийн үндсэн мэдээлэл</Label>
                    <textarea
                      value={footerText}
                      onChange={(event) => setFooterText(event.target.value)}
                      maxLength={300}
                      rows={3}
                      placeholder="Жишээ: Ажлын өдөр 08:00–17:00, утас: 7700-0000"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Copyright</Label>
                    <Input
                      value={copyright}
                      onChange={(event) => setCopyright(event.target.value)}
                      maxLength={200}
                      placeholder={`© ${new Date().getFullYear()} Food POS`}
                    />
                    <p className="text-[11px] text-muted-foreground">Хоосон бол зөвхөн footer-ийн мэдээлэл харагдана.</p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span className="grid h-16 w-28 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Лого" className="max-h-16 max-w-full object-contain" />
                        ) : (
                          <ImagePlus className="size-5 text-muted-foreground" />
                        )}
                      </span>
                      <div>
                        <p className="text-sm font-medium">Сайтын лого</p>
                        <p className="text-[11px] text-muted-foreground">PNG, JPEG, WebP, SVG · 4MB хүртэл</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/[0.06]">
                        {logoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                        Лого сонгох
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                          className="hidden"
                          onChange={(event) => void pickLogo(event.target.files?.[0])}
                        />
                      </label>
                      {logoUrl ? (
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLogoUrl(null)}>
                          <Trash2 className="size-3.5" />
                          Хасах
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    className="gap-2"
                    disabled={saveBranding.isPending || logoBusy || branding.isLoading}
                    onClick={() => saveBranding.mutate()}
                  >
                    {saveBranding.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Хадгалах
                  </Button>
                </div>
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

      </Tabs>

      <p className="mt-4 text-[11px] text-muted-foreground">
        {PERIOD_LABELS.BREAKFAST} · {PERIOD_LABELS.LUNCH} · {PERIOD_LABELS.DINNER} · {PERIOD_LABELS.NIGHT} — бизнес
        өдөр 04:00-д солигдоно.
      </p>
    </div>
  );
}
