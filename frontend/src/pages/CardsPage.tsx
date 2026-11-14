import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Link2, Loader2, Plus, RotateCcw, Search, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS } from '@shared/permissions';
import type { CardListItem } from '@shared/types';
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
import { cardsApi, usersApi } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Идэвхтэй', BLOCKED: 'Идэвхгүй', LOST: 'Алдагдсан' };

export function CardsPage(): JSX.Element {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [assigned, setAssigned] = useState('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ uid: '', label: '', userId: 'none' });
  const [userQuery, setUserQuery] = useState('');
  const [assignTarget, setAssignTarget] = useState<CardListItem | null>(null);
  const [assignUserId, setAssignUserId] = useState('none');
  const [blockTarget, setBlockTarget] = useState<CardListItem | null>(null);
  const [blockReason, setBlockReason] = useState('');

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status === 'all' ? undefined : status,
      assigned: assigned === 'all' ? undefined : assigned,
      page,
      pageSize: 20,
    }),
    [search, status, assigned, page],
  );

  const cards = useQuery({ queryKey: ['cards', params], queryFn: () => cardsApi.list(params) });
  // 200+ хэрэглэгчтэй байгууллагад ч сонголт бүрэн ажиллахын тулд нэр/код/и-мэйлээр хайна
  const users = useQuery({
    queryKey: ['users', 'picker', userQuery],
    queryFn: () =>
      usersApi.list({ pageSize: 200, status: 'ACTIVE', search: userQuery.trim() || undefined }),
  });

  useEffect(() => {
    setPage(1);
  }, [search, status, assigned]);

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['cards'] });
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      cardsApi.create({
        uid: createForm.uid.trim().toUpperCase(),
        label: createForm.label.trim() || undefined,
        userId: createForm.userId === 'none' ? null : createForm.userId,
      }),
    onSuccess: async () => {
      toast.success('Карт бүртгэгдлээ');
      setCreateOpen(false);
      setCreateForm({ uid: '', label: '', userId: 'none' });
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignMutation = useMutation({
    mutationFn: () => cardsApi.assign(assignTarget!.id, assignUserId),
    onSuccess: async () => {
      toast.success('Карт оноогдлоо');
      setAssignTarget(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const releaseMutation = useMutation({
    mutationFn: (card: CardListItem) => cardsApi.release(card.id),
    onSuccess: async () => {
      toast.success('Картын оноолт цуцлагдлаа');
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const blockMutation = useMutation({
    mutationFn: (card: CardListItem) => cardsApi.block(card.id, blockReason.trim() || 'Менежерийн шийдвэр'),
    onSuccess: async () => {
      toast.success('Картын эрх идэвхгүй боллоо');
      setBlockTarget(null);
      setBlockReason('');
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unblockMutation = useMutation({
    mutationFn: (card: CardListItem) => cardsApi.unblock(card.id),
    onSuccess: async () => {
      toast.success('Карт идэвхжлээ');
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totalPages = cards.data ? Math.max(1, Math.ceil(cards.data.total / cards.data.pageSize)) : 1;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Карт"
        description="RFID картын бүртгэл, эзэмшигчийн оноолт, эрхийн төлөв."
        actions={
          can(PERMISSIONS.CARD_MANAGE) ? (
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                setUserQuery('');
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              Карт нэмэх
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
              placeholder="UID эсвэл эзэмшигч"
              className="pl-9 font-mono"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Бүх төлөв</SelectItem>
              <SelectItem value="ACTIVE">Идэвхтэй</SelectItem>
              <SelectItem value="BLOCKED">Идэвхгүй</SelectItem>
              <SelectItem value="LOST">Алдагдсан</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigned} onValueChange={setAssigned}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Бүх карт</SelectItem>
              <SelectItem value="true">Оноогдсон</SelectItem>
              <SelectItem value="false">Сул</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-end text-xs text-muted-foreground">
            {cards.data ? `${cards.data.total} карт` : ''}
          </div>
        </div>
      </Card>

      <Card>
        {cards.isLoading ? (
          <LoadingBlock />
        ) : cards.isError ? (
          <ErrorState message={(cards.error as Error).message} />
        ) : cards.data && cards.data.items.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UID</TableHead>
                  <TableHead>Эзэмшигч</TableHead>
                  <TableHead>Оноосон</TableHead>
                  <TableHead>Төлөв</TableHead>
                  <TableHead className="text-right">Үйлдэл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.data.items.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{card.uid}</span>
                      {card.label ? (
                        <p className="text-[11px] text-muted-foreground">{card.label}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{card.holderName ?? <span className="text-muted-foreground">сул</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(card.assignedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={card.status === 'ACTIVE' ? 'success' : card.status === 'LOST' ? 'warning' : 'danger'}>
                        {STATUS_LABEL[card.status] ?? card.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {can(PERMISSIONS.CARD_MANAGE) ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Хэрэглэгчид оноох"
                              onClick={() => {
                                setUserQuery('');
                                setAssignTarget(card);
                                setAssignUserId('none');
                              }}
                            >
                              <Link2 className="size-4" />
                            </Button>
                            {card.holderId ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Оноолтыг цуцлах"
                                disabled={releaseMutation.isPending}
                                onClick={() => releaseMutation.mutate(card)}
                              >
                                <Unlink className="size-4" />
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {can(PERMISSIONS.CARD_BLOCK) && card.status === 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Эрх идэвхгүй болгох"
                            onClick={() => {
                              setBlockTarget(card);
                              setBlockReason('');
                            }}
                          >
                            <Ban className="size-4 text-rose-300" />
                          </Button>
                        ) : null}
                        {can(PERMISSIONS.CARD_MANAGE) && card.status !== 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Идэвхжүүлэх"
                            disabled={unblockMutation.isPending}
                            onClick={() => unblockMutation.mutate(card)}
                          >
                            <RotateCcw className="size-4 text-emerald-300" />
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
                Хуудас {cards.data.page} / {totalPages}
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
          <EmptyState title="Карт олдсонгүй" description="Шинэ карт бүртгэж эхэлнэ үү." />
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Шинэ карт</DialogTitle>
            <DialogDescription>UID-г уншигчаас эсвэл гараар оруулна.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Картын UID</Label>
              <Input
                value={createForm.uid}
                onChange={(event) => setCreateForm({ ...createForm, uid: event.target.value })}
                className="font-mono"
                placeholder="04A1B2C3D4"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Тэмдэглэл</Label>
              <Input
                value={createForm.label}
                onChange={(event) => setCreateForm({ ...createForm, label: event.target.value })}
                placeholder="жишээ: нөөц карт"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Эзэмшигч</Label>
              <Input
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Нэр, ажилтны код, и-мэйлээр хайх"
              />
              <Select
                value={createForm.userId}
                onValueChange={(value) => setCreateForm({ ...createForm, userId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Одоохондоо оноохгүй</SelectItem>
                  {(users.data?.items ?? []).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.lastName} {user.firstName} · {user.employeeNo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
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

      <Dialog open={Boolean(assignTarget)} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Карт оноох</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{assignTarget?.uid}</span> картыг хэрэглэгчид холбоно.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={userQuery}
            onChange={(event) => setUserQuery(event.target.value)}
            placeholder="Нэр, ажилтны код, и-мэйлээр хайх"
          />
          <Select value={assignUserId} onValueChange={setAssignUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Хэрэглэгч сонгох" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Сонгоно уу</SelectItem>
              {(users.data?.items ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.lastName} {user.firstName} · {user.employeeNo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignTarget(null)}>
              Болих
            </Button>
            <Button
              disabled={assignUserId === 'none' || assignMutation.isPending}
              onClick={() => assignMutation.mutate()}
            >
              Оноох
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(blockTarget)} onOpenChange={(open) => !open && setBlockTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Картын эрх идэвхгүй болгох</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{blockTarget?.uid}</span> карт уншигдсангүй мэт ажиллана.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Шалтгаан</Label>
            <Input
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="алдагдсан / ажлаас гарсан"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlockTarget(null)}>
              Болих
            </Button>
            <Button
              variant="destructive"
              disabled={blockMutation.isPending}
              onClick={() => blockTarget && blockMutation.mutate(blockTarget)}
            >
              Блоклох
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
