import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, ROLES, ROLE_LABELS, type Role } from '@shared/permissions';
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
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { departmentsApi, usersApi } from '@/lib/api';

interface FormState {
  employeeNo: string;
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  role: Role;
  departmentId: string;
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
  departmentId: 'none',
  cardUid: '',
  password: '',
};

export function UsersPage(): JSX.Element {
  const { can, user: me } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const departments = useQuery({ queryKey: ['departments'], queryFn: departmentsApi.list });

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      role: role === 'all' ? undefined : role,
      status: status === 'all' ? undefined : status,
      page,
      pageSize: 20,
    }),
    [search, role, status, page],
  );

  const users = useQuery({ queryKey: ['users', params], queryFn: () => usersApi.list(params) });

  useEffect(() => {
    setPage(1);
  }, [search, role, status]);

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
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
        departmentId: form.departmentId === 'none' ? null : form.departmentId,
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

  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize)) : 1;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Хэрэглэгч"
        description="Ажилтан, түүний карт, эрхийн түвшинг удирдана."
        actions={
          can(PERMISSIONS.USER_CREATE) ? (
            <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Хэрэглэгч нэмэх
            </Button>
          ) : null
        }
      />

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
                      <Badge variant={item.role === 'ADMIN' ? 'gold' : item.role === 'MANAGER' ? 'info' : 'outline'}>
                        {ROLE_LABELS[item.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'ACTIVE' ? 'success' : 'danger'}>
                        {item.status === 'ACTIVE' ? 'Идэвхтэй' : 'Идэвхгүй'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
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
                        {can(PERMISSIONS.USER_UPDATE) ? (
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
              <Label>Картын UID</Label>
              <Input
                value={form.cardUid}
                onChange={(event) => setForm({ ...form, cardUid: event.target.value })}
                placeholder="заавал биш"
                className="font-mono"
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
