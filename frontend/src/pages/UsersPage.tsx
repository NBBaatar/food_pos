import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, KeyRound, Loader2, Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_PERMISSIONS,
  ROLES,
  ROLE_LABELS,
  type Role,
} from '@shared/permissions';
import type { UserListItem } from '@shared/types';
import { formatDate } from '@shared/format';
import { Badge } from '@/components/ui/badge';
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
import { ReferenceCombobox } from '@/components/ui/reference-combobox';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { imageFileToDataUrl } from '@/lib/image';
import { companiesApi, departmentsApi, locationsApi, referenceApi, usersApi } from '@/lib/api';

interface FormState {
  employeeNo: string;
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  role: Role;
  canLogin: boolean;
  departmentId: string;
  companyId: string;
  /** Бүх байршилд уншуулж болох эсэх; false бол locationIds-д жагсаасан байршилд л */
  allLocations: boolean;
  locationIds: string[];
  unit: string;
  position: string;
  photoUrl: string | null;
  cardUid: string;
  password: string;
}

const EMPTY_FORM: FormState = {
  employeeNo: '',
  lastName: '',
  firstName: '',
  email: '',
  phone: '',
  role: 'USER',
  canLogin: true,
  departmentId: 'none',
  companyId: 'none',
  allLocations: true,
  locationIds: [],
  unit: '',
  position: '',
  photoUrl: null,
  cardUid: '',
  password: '',
};

export function UsersPage(): JSX.Element {
  const { can, user: me } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [access, setAccess] = useState<'LOGIN' | 'CARD'>('LOGIN');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [permUser, setPermUser] = useState<UserListItem | null>(null);
  const [permDraft, setPermDraft] = useState<Record<string, boolean> | null>(null);

  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });
  const companies = useQuery({ queryKey: ['companies'], queryFn: companiesApi.list });
  const locations = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list });
  const units = useQuery({ queryKey: ['reference', 'units'], queryFn: () => referenceApi.list('units') });
  const positions = useQuery({
    queryKey: ['reference', 'positions'],
    queryFn: () => referenceApi.list('positions'),
  });

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      access,
      role: role === 'all' ? undefined : role,
      status: status === 'all' ? undefined : status,
      page,
      pageSize: 20,
    }),
    [search, access, role, status, page],
  );

  const users = useQuery({ queryKey: ['users', params], queryFn: () => usersApi.list(params) });

  useEffect(() => {
    setPage(1);
  }, [search, access, role, status]);

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const pickPhoto = async (
    file: File | undefined,
    apply: (value: string | null) => void,
  ): Promise<void> => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      apply(await imageFileToDataUrl(file, { maxSize: 320, quality: 0.85 }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Зургийг уншиж чадсангүй');
    } finally {
      setPhotoBusy(false);
    }
  };

  const openEdit = (item: UserListItem): void => {
    setEditForm({
      ...EMPTY_FORM,
      employeeNo: item.employeeNo,
      lastName: item.lastName,
      firstName: item.firstName,
      email: item.email,
      phone: item.phone ?? '',
      role: item.role,
      canLogin: item.canLogin,
      departmentId: item.departmentId ?? 'none',
      companyId: item.companyId ?? 'none',
      allLocations: (item.locationIds ?? []).length === 0,
      locationIds: item.locationIds ?? [],
      unit: item.unit ?? '',
      position: item.position ?? '',
      photoUrl: item.photoUrl ?? null,
      cardUid: item.cardUid ?? '',
    });
    setEditUser(item);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      usersApi.create({
        employeeNo: form.employeeNo.trim(),
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        canLogin: form.canLogin,
        departmentId: form.departmentId === 'none' ? null : form.departmentId,
        companyId: form.companyId === 'none' ? null : form.companyId,
        locationIds: form.allLocations ? [] : form.locationIds,
        unit: form.unit.trim() || undefined,
        position: form.position.trim() || undefined,
        photoUrl: form.photoUrl ?? undefined,
        cardUid: form.cardUid.trim() || undefined,
        password: form.password.trim() || undefined,
      }),
    onSuccess: async (data) => {
      toast.success('Хэрэглэгч нэмэгдлээ');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      if (data.temporaryPassword) setTempPassword(data.temporaryPassword);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      usersApi.update(editUser!.id, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        phone: editForm.phone.trim(),
        canLogin: editForm.canLogin,
        departmentId: editForm.departmentId === 'none' ? null : editForm.departmentId,
        companyId: editForm.companyId === 'none' ? null : editForm.companyId,
        locationIds: editForm.allLocations ? [] : editForm.locationIds,
        unit: editForm.unit.trim(),
        position: editForm.position.trim(),
        photoUrl: editForm.photoUrl,
      }),
    onSuccess: async () => {
      toast.success('Хэрэглэгчийн мэдээлэл шинэчлэгдлээ');
      setEditUser(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (user: UserListItem) => usersApi.toggleStatus(user.id),
    onSuccess: async (data) => {
      toast.success(data.user.status === 'ACTIVE' ? 'Идэвхжүүллээ' : 'Идэвхгүй болголоо');
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: (user: UserListItem) => usersApi.resetPassword(user.id),
    onSuccess: (data) => setTempPassword(data.temporaryPassword),
    onError: (error: Error) => toast.error(error.message),
  });

  const permissions = useQuery({
    queryKey: ['user-permissions', permUser?.id],
    queryFn: () => usersApi.permissions(permUser!.id),
    enabled: Boolean(permUser),
  });

  useEffect(() => {
    if (!permUser || !permissions.data) return;
    const granted = new Set(permissions.data.permissions);
    setPermDraft(Object.fromEntries(ALL_PERMISSIONS.map((code) => [code, granted.has(code)])));
  }, [permUser, permissions.data]);

  const permissionsMutation = useMutation({
    mutationFn: () => {
      const defaults = new Set(ROLE_PERMISSIONS[permUser!.role]);
      const overrides = ALL_PERMISSIONS.filter((code) => (permDraft?.[code] ?? false) !== defaults.has(code)).map(
        (code) => ({ permission: code, allow: permDraft![code]! }),
      );
      return usersApi.setPermissions(permUser!.id, overrides);
    },
    onSuccess: async () => {
      toast.success('Эрх шинэчлэгдлээ');
      setPermUser(null);
      setPermDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize)) : 1;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Хэрэглэгч"
        description="Системд нэвтрэх хэрэглэгч болон карт эзэмшигчдийг тусад нь удирдана."
        actions={
          can(PERMISSIONS.USER_CREATE) ? (
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                setForm({ ...EMPTY_FORM, canLogin: access === 'LOGIN' });
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              {access === 'LOGIN' ? 'Нэвтрэх хэрэглэгч нэмэх' : 'Карт эзэмшигч нэмэх'}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant={access === 'LOGIN' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => {
            setAccess('LOGIN');
            setRole('all');
          }}
        >
          Нэвтрэх хэрэглэгч
        </Button>
        <Button
          variant={access === 'CARD' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => {
            setAccess('CARD');
            setRole('all');
          }}
        >
          Карт эзэмшигч
        </Button>
      </div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Нэр, дугаар, и-мэйл"
              className="pl-9"
            />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue placeholder="Эрх" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Бүх эрх</SelectItem>
              {ROLES.map((item) => (
                <SelectItem key={item} value={item}>
                  {ROLE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Төлөв" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Бүх төлөв</SelectItem>
              <SelectItem value="ACTIVE">Идэвхтэй</SelectItem>
              <SelectItem value="INACTIVE">Идэвхгүй</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end text-xs text-muted-foreground">
            {users.data ? `${users.data.total} бүртгэл` : ''}
          </div>
        </div>
      </Card>

      <Card>
        {users.isLoading ? (
          <LoadingBlock />
        ) : users.isError ? (
          <ErrorState message={(users.error as Error).message} />
        ) : users.data && users.data.items.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ажилтан</TableHead>
                  <TableHead>Хэлтэс</TableHead>
                  <TableHead>Карт</TableHead>
                  <TableHead>Эрх</TableHead>
                  <TableHead>Төлөв</TableHead>
                  <TableHead className="text-right">Үйлдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">
                        {item.lastName} {item.firstName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.employeeNo} · {item.email}
                      </p>
                      {item.companyName ? (
                        <p className="text-[11px] text-muted-foreground">{item.companyName}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.departmentName ?? '—'}</TableCell>
                    <TableCell>
                      {item.cardUid ? (
                        <span className="font-mono text-xs">{item.cardUid}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">оноогдоогүй</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={!item.canLogin ? 'outline' : item.role === 'ADMIN' ? 'gold' : item.role === 'MANAGER' ? 'info' : 'outline'}>
                        {item.canLogin ? ROLE_LABELS[item.role] : 'Карт эзэмшигч'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'ACTIVE' ? 'success' : 'danger'}>
                        {item.status === 'ACTIVE' ? 'Идэвхтэй' : 'Идэвхгүй'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {can(PERMISSIONS.USER_UPDATE) && (item.role !== 'ADMIN' || me?.role === 'ADMIN') ? (
                          <Button variant="ghost" size="icon" title="Засах" onClick={() => openEdit(item)}>
                            <Pencil className="size-4" />
                          </Button>
                        ) : null}
                        {can(PERMISSIONS.USER_DEACTIVATE) && item.id !== me?.id ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={item.status === 'ACTIVE' ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate(item)}
                          >
                            {item.status === 'ACTIVE' ? (
                              <UserX className="size-4 text-rose-300" />
                            ) : (
                              <UserCheck className="size-4 text-emerald-300" />
                            )}
                          </Button>
                        ) : null}
                        {me?.role === 'ADMIN' && item.canLogin && item.role !== 'ADMIN' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Эрх тохируулах"
                            onClick={() => {
                              setPermDraft(null);
                              setPermUser(item);
                            }}
                          >
                            <ShieldCheck className="size-4" />
                          </Button>
                        ) : null}
                        {can(PERMISSIONS.USER_UPDATE) && item.canLogin ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Нууц үг сэргээх"
                            disabled={resetMutation.isPending}
                            onClick={() => resetMutation.mutate(item)}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-xs text-muted-foreground">
              <span>
                Хуудас {users.data.page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Өмнөх
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Дараах
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="Хэрэглэгч олдсонгүй" description="Шүүлтүүрээ өөрчилж үзнэ үү." />
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Шинэ хэрэглэгч</DialogTitle>
            <DialogDescription>Нууц үг оруулахгүй бол систем түр зуурын нууц үг үүсгэнэ.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.canLogin}
                onChange={(event) => setForm({ ...form, canLogin: event.target.checked })}
                className="mt-0.5 size-4 accent-emerald-400"
              />
              <span>
                <span className="block text-sm font-medium">Системд нэвтрэх эрх</span>
                <span className="text-xs text-muted-foreground">
                  Идэвхжүүлбэл хэрэглэгч и-мэйл, нууц үгээрээ нэвтэрч удирдлагын хэсэгт орно.
                </span>
              </span>
            </label>
            <div className="space-y-1.5">
              <Label>Ажилтны дугаар</Label>
              <Input
                value={form.employeeNo}
                onChange={(event) => setForm({ ...form, employeeNo: event.target.value })}
                required
                placeholder="E-1024"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Хэлтэс</Label>
              <Select
                value={form.departmentId}
                onValueChange={(value) => setForm({ ...form, departmentId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Сонгох" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Хэлтэсгүй</SelectItem>
                  {(departments.data?.items ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Туслан гүйцэтгэгч компани</Label>
              <Select
                value={form.companyId}
                onValueChange={(value) => setForm({ ...form, companyId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Сонгох" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Компанигүй</SelectItem>
                  {(companies.data?.items ?? []).map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <LocationAccessField
                all={form.allLocations}
                ids={form.locationIds}
                options={locations.data?.items ?? []}
                onChange={(next) => setForm({ ...form, allLocations: next.all, locationIds: next.ids })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Нэгж</Label>
              <ReferenceCombobox
                value={form.unit}
                onChange={(value) => setForm({ ...form, unit: value })}
                options={(units.data?.items ?? []).map((item) => item.name)}
                placeholder="Нэгж сонгох эсвэл бичих"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Албан тушаал</Label>
              <ReferenceCombobox
                value={form.position}
                onChange={(value) => setForm({ ...form, position: value })}
                options={(positions.data?.items ?? []).map((item) => item.name)}
                placeholder="Албан тушаал сонгох эсвэл бичих"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Овог</Label>
              <Input
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Нэр</Label>
              <Input
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>И-мэйл</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
                placeholder="user@foodpos.mn"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Утас</Label>
              <Input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+976 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Эрх</Label>
              <Select
                value={form.role}
                onValueChange={(value) => setForm({ ...form, role: value as Role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((item) => me?.role === 'ADMIN' || item !== 'ADMIN').map((item) => (
                    <SelectItem key={item} value={item}>
                      {ROLE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Картын UID *</Label>
              <Input
                value={form.cardUid}
                onChange={(event) => setForm({ ...form, cardUid: event.target.value })}
                placeholder="04A1B2C300"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Нууц үг</Label>
              <Input
                type="text"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="автомат"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Ажилтны зураг</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="grid size-16 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                  {form.photoUrl ? (
                    <img src={form.photoUrl} alt="Ажилтны зураг" className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" />
                  )}
                </span>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/[0.06]">
                  {photoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                  Зураг сонгох
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => void pickPhoto(event.target.files?.[0], (value) => setForm((prev) => ({ ...prev, photoUrl: value })))}
                  />
                </label>
                {form.photoUrl ? (
                  <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setForm({ ...form, photoUrl: null })}>
                    <Trash2 className="size-3.5" />
                    Хасах
                  </Button>
                ) : null}
              </div>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Болих
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Хадгалах
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editUser)} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Хэрэглэгчийн мэдээлэл</DialogTitle>
            <DialogDescription>
              {editUser ? `${editUser.employeeNo} · ${editUser.email}` : ''} — киоск дээр карт уншуулахад эдгээр мэдээлэл харагдана.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateMutation.mutate();
            }}
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:col-span-2">
              <input
                type="checkbox"
                checked={editForm.canLogin}
                onChange={(event) => setEditForm({ ...editForm, canLogin: event.target.checked })}
                className="mt-0.5 size-4 accent-emerald-400"
              />
              <span>
                <span className="block text-sm font-medium">Системд нэвтрэх эрх</span>
                <span className="text-xs text-muted-foreground">
                  Идэвхгүй бол хэрэглэгч зөвхөн карт эзэмшигч болно; одоогийн нэвтрэлтүүд хаагдана.
                </span>
              </span>
            </label>
            <div className="space-y-1.5">
              <Label>Овог</Label>
              <Input
                value={editForm.lastName}
                onChange={(event) => setEditForm({ ...editForm, lastName: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Нэр</Label>
              <Input
                value={editForm.firstName}
                onChange={(event) => setEditForm({ ...editForm, firstName: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Хэлтэс</Label>
              <Select
                value={editForm.departmentId}
                onValueChange={(value) => setEditForm({ ...editForm, departmentId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Сонгох" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Хэлтэсгүй</SelectItem>
                  {(departments.data?.items ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Туслан гүйцэтгэгч компани</Label>
              <Select
                value={editForm.companyId}
                onValueChange={(value) => setEditForm({ ...editForm, companyId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Сонгох" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Компанигүй</SelectItem>
                  {(companies.data?.items ?? []).map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <LocationAccessField
                all={editForm.allLocations}
                ids={editForm.locationIds}
                options={locations.data?.items ?? []}
                onChange={(next) =>
                  setEditForm({ ...editForm, allLocations: next.all, locationIds: next.ids })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Нэгж</Label>
              <ReferenceCombobox
                value={editForm.unit}
                onChange={(value) => setEditForm({ ...editForm, unit: value })}
                options={(units.data?.items ?? []).map((item) => item.name)}
                placeholder="Нэгж сонгох эсвэл бичих"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Албан тушаал</Label>
              <ReferenceCombobox
                value={editForm.position}
                onChange={(value) => setEditForm({ ...editForm, position: value })}
                options={(positions.data?.items ?? []).map((item) => item.name)}
                placeholder="Албан тушаал сонгох эсвэл бичих"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Утас</Label>
              <Input
                value={editForm.phone}
                onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                placeholder="+976 …"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Ажилтны зураг</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="grid size-16 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                  {editForm.photoUrl ? (
                    <img src={editForm.photoUrl} alt="Ажилтны зураг" className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" />
                  )}
                </span>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/[0.06]">
                  {photoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                  Зураг солих
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) =>
                      void pickPhoto(event.target.files?.[0], (value) =>
                        setEditForm((prev) => ({ ...prev, photoUrl: value })),
                      )
                    }
                  />
                </label>
                {editForm.photoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => setEditForm({ ...editForm, photoUrl: null })}
                  >
                    <Trash2 className="size-3.5" />
                    Хасах
                  </Button>
                ) : null}
              </div>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setEditUser(null)}>
                Болих
              </Button>
              <Button type="submit" disabled={updateMutation.isPending || photoBusy}>
                {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Хадгалах
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(permUser)}
        onOpenChange={(open) => {
          if (!open) {
            setPermUser(null);
            setPermDraft(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Эрх тохируулах</DialogTitle>
            <DialogDescription>
              {permUser ? `${permUser.lastName} ${permUser.firstName} · ${ROLE_LABELS[permUser.role]}` : ''} — рольоос
              өгөгдсөн эрхээс зөрүүтэйг л хадгална.
            </DialogDescription>
          </DialogHeader>
          {permissions.isError ? (
            <ErrorState message={(permissions.error as Error).message} />
          ) : permissions.isLoading || !permDraft ? (
            <LoadingBlock />
          ) : (
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {ALL_PERMISSIONS.map((code) => {
                const base = ROLE_PERMISSIONS[permUser!.role].includes(code);
                const checked = permDraft[code] ?? base;
                return (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setPermDraft((draft) => ({ ...(draft ?? {}), [code]: event.target.checked }))
                      }
                      className="size-4 accent-emerald-400"
                    />
                    <span className="text-sm">{PERMISSION_LABELS[code]}</span>
                    {checked !== base ? (
                      <span
                        className={`ml-auto text-[10px] uppercase tracking-wide ${
                          checked ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {checked ? 'нэмсэн' : 'хассан'}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPermUser(null);
                setPermDraft(null);
              }}
            >
              Болих
            </Button>
            <Button
              onClick={() => permissionsMutation.mutate()}
              disabled={permissionsMutation.isPending || !permDraft || permissions.isError}
            >
              {permissionsMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Хадгалах
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tempPassword)} onOpenChange={(open) => !open && setTempPassword(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Түр зуурын нууц үг</DialogTitle>
            <DialogDescription>Энэ нууц үгийг хэрэглэгчид дамжуулна уу. Дахин харагдахгүй.</DialogDescription>
          </DialogHeader>
          <p className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center font-mono text-lg tracking-wider">
            {tempPassword}
          </p>
          <DialogFooter>
            <Button onClick={() => setTempPassword(null)}>Ойлголоо</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {users.data ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Сүүлд шинэчлэгдсэн: {formatDate(new Date())}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Хэрэглэгч аль байршилд карт уншуулж болохыг сонгоно.
 * «Бүх байршилд» чагтлагдсан бол хязгаарлалтгүй (серверт хоосон массив илгээнэ).
 */
function LocationAccessField({
  all,
  ids,
  options,
  onChange,
}: {
  all: boolean;
  ids: string[];
  options: { id: string; name: string }[];
  onChange: (next: { all: boolean; ids: string[] }) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <Label>Уншиж болох байршил</Label>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={all}
            onChange={(event) =>
              onChange({
                all: event.target.checked,
                ids: event.target.checked ? [] : options.map((option) => option.id),
              })
            }
            className="mt-0.5 size-4 accent-emerald-400"
          />
          <span>
            <span className="block text-sm font-medium">Бүх байршилд уншуулж болно</span>
            <span className="text-xs text-muted-foreground">
              Хязгаарлалтгүй. Зөвхөн тодорхой байршилд уншуулах бол чагтыг авч, доороос сонгоно уу.
            </span>
          </span>
        </label>

        {!all ? (
          <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
            {options.length === 0 ? (
              <p className="text-xs text-muted-foreground">Байршил бүртгэгдээгүй байна.</p>
            ) : (
              options.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={ids.includes(option.id)}
                    onChange={(event) =>
                      onChange({
                        all: false,
                        ids: event.target.checked
                          ? [...ids, option.id]
                          : ids.filter((id) => id !== option.id),
                      })
                    }
                    className="size-4 accent-emerald-400"
                  />
                  {option.name}
                </label>
              ))
            )}
            <p className="pt-1 text-[11px] text-muted-foreground">
              Сонгосон байршлаас өөр газар карт уншуулбал хоол тооцогдохгүй.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
