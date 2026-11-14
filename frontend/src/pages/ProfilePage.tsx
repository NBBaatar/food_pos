import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSION_LABELS, ROLE_LABELS } from '@shared/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReferenceCombobox } from '@/components/ui/reference-combobox';
import { MetaRow, PageHeader } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { imageFileToDataUrl } from '@/lib/image';
import { referenceApi, updateProfile } from '@/lib/api';

export function ProfilePage(): JSX.Element {
  const { user, refreshUser } = useAuth();
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [unit, setUnit] = useState('');
  const [position, setPosition] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const units = useQuery({ queryKey: ['reference', 'units'], queryFn: () => referenceApi.list('units') });
  const positions = useQuery({
    queryKey: ['reference', 'positions'],
    queryFn: () => referenceApi.list('positions'),
  });

  useEffect(() => {
    if (!user) return;
    setLastName(user.lastName);
    setFirstName(user.firstName);
    setPhone(user.phone ?? '');
    setUnit(user.unit ?? '');
    setPosition(user.position ?? '');
    setPhotoUrl(user.photoUrl);
  }, [user]);

  const saveProfileMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateProfile>[0]) => updateProfile(input),
    onSuccess: async () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshUser();
      toast.success('Профайл шинэчлэгдлээ');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pickPhoto = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhotoUrl(await imageFileToDataUrl(file, { maxSize: 320, quality: 0.85 }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Зургийг уншиж чадсангүй');
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveProfile = (): void => {
    if (!lastName.trim() || !firstName.trim()) {
      toast.error('Овог, нэрээ бөглөнө үү');
      return;
    }
    saveProfileMutation.mutate({
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      phone: phone.trim(),
      unit: unit.trim(),
      position: position.trim(),
      photoUrl,
    });
  };

  const changePassword = (): void => {
    if (!currentPassword) {
      toast.error('Одоогийн нууц үгээ оруулна уу');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Шинэ нууц үг 8+ тэмдэгт байх ёстой');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Шинэ нууц үг хоёр удаа ижил байх ёстой');
      return;
    }
    saveProfileMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Миний профайл"
        description="Нэр, холбоо барих мэдээлэл, нэгж, албан тушаал, avatar болон нууц үгээ удирдана."
      />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Хувийн мэдээлэл</CardTitle>
            <p className="text-xs text-muted-foreground">
              Энд хийсэн өөрчлөлт киоск дээр карт уншигдах үед харагдана.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                {photoUrl ? (
                  <img src={photoUrl} alt="Avatar" className="size-full object-cover" />
                ) : (
                  <ImagePlus className="size-6 text-muted-foreground" />
                )}
              </span>
              <div className="space-y-2">
                <p className="text-sm font-medium">Avatar</p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/[0.06]">
                    {photoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                    Зураг солих
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => void pickPhoto(event.target.files?.[0])}
                    />
                  </label>
                  {photoUrl ? (
                    <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setPhotoUrl(null)}>
                      <Trash2 className="size-3.5" />
                      Хасах
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Овог</Label>
                <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Нэр</Label>
                <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Утас</Label>
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Нэгж</Label>
                <ReferenceCombobox
                  value={unit}
                  onChange={setUnit}
                  options={(units.data?.items ?? []).map((item) => item.name)}
                  placeholder="Нэгж сонгох эсвэл бичих"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Албан тушаал</Label>
                <ReferenceCombobox
                  value={position}
                  onChange={setPosition}
                  options={(positions.data?.items ?? []).map((item) => item.name)}
                  placeholder="Албан тушаал сонгох эсвэл бичих"
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] px-3 py-1">
              <MetaRow label="Ажилтны дугаар" value={user?.employeeNo ?? '—'} />
              <MetaRow label="И-мэйл" value={user?.email ?? '—'} />
              <MetaRow label="Эрх" value={user ? ROLE_LABELS[user.role] : '—'} />
              <MetaRow label="Хэлтэс" value={user?.departmentName ?? '—'} />
            </div>

            <div className="flex justify-end">
              <Button className="gap-2" disabled={saveProfileMutation.isPending || photoBusy} onClick={saveProfile}>
                {saveProfileMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Профайл хадгалах
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Нууц үг солих</CardTitle>
              <p className="text-xs text-muted-foreground">
                Одоогийн нууц үгээ баталгаажуулж, шинэ нууц үгээ 8+ тэмдэгтээр оруулна.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Одоогийн нууц үг</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Шинэ нууц үг</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Шинэ нууц үг давтах</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button
                className="w-full gap-2"
                variant="secondary"
                disabled={saveProfileMutation.isPending}
                onClick={changePassword}
              >
                {saveProfileMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Нууц үг солих
              </Button>
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
      </div>
    </div>
  );
}
