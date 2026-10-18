import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MailCheck, Send, ShieldCheck, UserPlus, Wifi } from "lucide-react";
import { listPresence, type PresenceRow } from "@/lib/presence.functions";
import {
  listUsers,
  inviteUser,
  resendInvite,
  sendPasswordReset,
  updateUser,
  deleteUser,
  type ManagedUser,
} from "@/lib/users.functions";
import { useAuth } from "@/lib/auth";
import { useBilling } from "@/lib/billing-store";
import {
  ALL_ROLES,
  PERMISSION_GROUPS,
  can,
  defaultRolePermissions,
  permissionsOf,
  roleLabel,
  type AppRole,
} from "@/lib/permissions";
import { passwordSetupUrl } from "@/lib/app-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetupHeading, SetupTable, DetailField } from "@/components/SetupTable";
import { useConfirm } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/_authenticated/pengguna")({
  head: () => ({
    meta: [
      { title: "Pengaturan Pengguna — RenToPlay" },
      {
        name: "description",
        content:
          "Daftar pengguna setiap store, pengaturan level Manager, Finance, Kasir, Operator, dan hak akses tiap menu.",
      },
      { property: "og:title", content: "Pengaturan Pengguna — RenToPlay" },
      {
        property: "og:description",
        content:
          "Kelola akun staf rental PlayStation per store dan atur hak akses tiap level lewat centang.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PenggunaPage,
});

/** Level yang bisa dipilih di form (Installer hanya oleh Installer). */
const selectableRoles = (canInstaller: boolean): AppRole[] =>
  canInstaller ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "installer");

function PenggunaPage() {
  const { user, role: myRole } = useAuth();
  const { rolePermissions, addLog } = useBilling();
  const canInstaller = myRole === "installer";
  const canEditAccess = can(myRole, "pengguna.hakakses", rolePermissions);
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const addFn = useServerFn(inviteUser);
  const resendFn = useServerFn(resendInvite);
  const resetFn = useServerFn(sendPasswordReset);
  const editFn = useServerFn(updateUser);
  const delFn = useServerFn(deleteUser);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => fetchUsers(),
  });

  const fetchPresence = useServerFn(listPresence);
  const { data: presence = [] } = useQuery({
    queryKey: ["user-presence"],
    queryFn: () => fetchPresence(),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["managed-users"] });
  const onError = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : "Terjadi kesalahan");

  const redirectTo = passwordSetupUrl;

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("kasir");

  const add = useMutation({
    mutationFn: (data: { email: string; fullName: string; role: AppRole }) =>
      addFn({ data: { ...data, redirectTo: redirectTo() } }),
    onSuccess: (_res, vars) => {
      toast.success("Undangan terkirim ke email staf");
      addLog("Undang pengguna baru", `${vars.email} · ${roleLabel[vars.role] ?? vars.role}`);
      setEmail("");
      setFullName("");
      setRole("kasir");
      invalidate();
    },
    onError,
  });

  const resend = useMutation({
    mutationFn: (mail: string) =>
      resendFn({ data: { email: mail, redirectTo: redirectTo() } }),
    onSuccess: (_res, mail) => {
      toast.success("Undangan dikirim ulang");
      addLog("Kirim ulang undangan", mail);
    },
    onError,
  });

  const reset = useMutation({
    mutationFn: (mail: string) =>
      resetFn({ data: { email: mail, redirectTo: redirectTo() } }),
    onSuccess: (_res, mail) => {
      toast.success("Tautan atur ulang sandi dikirim");
      addLog("Kirim tautan atur ulang sandi", mail);
    },
    onError,
  });

  const edit = useMutation({
    mutationFn: (data: {
      id: string;
      fullName?: string;
      role?: AppRole;
      password?: string;
    }) => editFn({ data }),
    onSuccess: (_res, vars) => {
      toast.success("Perubahan disimpan");
      const parts = [
        vars.fullName ? `nama: ${vars.fullName}` : "",
        vars.role ? `level: ${roleLabel[vars.role] ?? vars.role}` : "",
        vars.password ? "kata sandi diubah Admin" : "",
      ].filter(Boolean);
      addLog("Ubah data pengguna", parts.join(" · "));
      invalidate();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: (_res, id) => {
      toast.success("Pengguna dihapus");
      addLog("Hapus pengguna", id);
      invalidate();
    },
    onError,
  });

  /** Kelompokkan pengguna per store. */
  const groups = useMemo(() => {
    const map = new Map<string, ManagedUser[]>();
    for (const u of users as ManagedUser[]) {
      const key = u.storeName || "Tanpa store";
      map.set(key, [...(map.get(key) ?? []), u]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [users]);

  return (
    <div className="grid gap-6">
      <SetupHeading title="Pengaturan Pengguna" as="h1" />

      <form
        className="surface-panel grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate({ email, fullName, role });
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="nama">Nama lengkap</Label>
          <Input
            id="nama"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nama staf"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staf@email.com"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label>Level</Label>
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectableRoles(canInstaller).map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabel[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={add.isPending}>
            <UserPlus className="size-4" /> Kirim undangan
          </Button>
        </div>
      </form>

      <OnlineNow users={users as ManagedUser[]} presence={presence} />


      <div className="grid gap-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Memuat pengguna…</p>
        )}
        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Gagal memuat pengguna"}
          </p>
        )}
        {groups.map(([storeName, rows]) => (
          <div key={storeName} className="surface-panel p-5">
            <SetupHeading
              as="h2"
              title={storeName}
              className="mb-1"
              right={
                <span className="text-xs text-muted-foreground">{rows.length} pengguna</span>
              }
            />
            <SetupTable<ManagedUser>
              items={rows}
              getId={(u) => u.id}
              getLabel={(u) => u.fullName || u.email}
              columns={[
                {
                  key: "name",
                  header: "Nama",
                  render: (u) => (
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">
                        {u.fullName || u.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email}
                        {u.id === user?.id && " · akun kamu"}
                        {u.pending && (
                          <span className="text-primary"> · menunggu buat sandi</span>
                        )}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "role",
                  header: "Level",
                  render: (u) => roleLabel[u.role],
                },
              ]}
              onRemove={(u) => remove.mutate(u.id)}
              removeDisabled={(u) => u.id === user?.id}
              detailTitle={(u) => u.fullName || u.email}
              detailDescription={(u) => u.email}
              renderDetail={(u) => (
                <UserDetail
                  user={u}
                  isSelf={u.id === user?.id}
                  canInstaller={canInstaller}
                  busy={resend.isPending || reset.isPending}
                  onSave={(payload) => edit.mutate({ id: u.id, ...payload })}
                  onResend={() => resend.mutate(u.email)}
                  onReset={() => reset.mutate(u.email)}
                />
              )}
            />
          </div>
        ))}
        {!isLoading && groups.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada pengguna.</p>
        )}
      </div>

      {canEditAccess && <AccessMatrix canInstaller={canInstaller} />}
    </div>
  );
}

/** Batas dianggap masih aktif: 3 menit tanpa denyut = sudah keluar. */
const ONLINE_MS = 3 * 60_000;

function sinceText(at: string) {
  const diff = Date.now() - new Date(at).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} jam lalu`;
  return `${Math.floor(hour / 24)} hari lalu`;
}

/** Siapa saja yang sedang memakai aplikasi, dikelompokkan per store. */
function OnlineNow({
  users,
  presence,
}: {
  users: ManagedUser[];
  presence: PresenceRow[];
}) {
  const rows = useMemo(() => {
    const userById = new Map(users.map((u) => [u.id, u]));
    const now = Date.now();
    return presence
      .filter((p) => now - new Date(p.lastSeenAt).getTime() <= ONLINE_MS)
      .map((p) => ({ presence: p, user: userById.get(p.userId) }))
      .filter((r) => Boolean(r.user))
      .sort((a, b) =>
        (a.user!.storeName || "").localeCompare(b.user!.storeName || ""),
      );
  }, [users, presence]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.user!.storeName || "Tanpa store";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <div className="surface-panel grid gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Wifi className="size-5 text-primary" /> Sedang Masuk Saat Ini
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pengguna yang aktif memakai aplikasi dalam 3 menit terakhir, per store.
          Daftar diperbarui otomatis.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada pengguna yang sedang memakai aplikasi.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {groups.map(([storeName, list]) => (
            <div
              key={storeName}
              className="rounded-lg border border-border bg-secondary/30 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{storeName}</h3>
                <span className="text-xs text-muted-foreground">
                  {list.length} sedang masuk
                </span>
              </div>
              <div className="grid gap-2">
                {list.map(({ user, presence: p }) => (
                  <div
                    key={p.userId}
                    className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-0 last:pb-0"
                  >
                    <span className="flex items-start gap-2">
                      <span className="mt-1.5 size-2 rounded-full bg-emerald-500" />
                      <span className="grid">
                        <span className="font-medium">
                          {user!.fullName || user!.email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {roleLabel[user!.role]} · {user!.email}
                        </span>
                      </span>
                    </span>
                    <span className="grid text-right">
                      <span className="font-medium">
                        {p.device || "Perangkat"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {sinceText(p.lastSeenAt)}
                        {p.deviceCode ? ` · ${p.deviceCode}` : ""}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserDetail({
  user,
  isSelf,
  canInstaller,
  busy,
  onSave,
  onResend,
  onReset,
}: {
  user: ManagedUser;
  isSelf: boolean;
  canInstaller: boolean;
  busy: boolean;
  onSave: (p: { fullName?: string; role?: AppRole }) => void;
  onResend: () => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(user.fullName);
  const [role, setRole] = useState<AppRole>(user.role);
  const options = selectableRoles(canInstaller);
  const { confirm, dialog: confirmDialog } = useConfirm();

  return (
    <>
      <DetailField label="Nama lengkap">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </DetailField>

      <DetailField label={`Level saat ini: ${roleLabel[user.role]}`}>
        <Select
          value={role}
          onValueChange={(v) => setRole(v as AppRole)}
          disabled={isSelf || (user.role === "installer" && !canInstaller)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(options.includes(user.role)
              ? options
              : [user.role, ...options]
            ).map((r) => (
              <SelectItem key={r} value={r}>
                {roleLabel[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DetailField>

      <Button
        className="w-full"
        variant="outline"
        onClick={() => {
          const payload: { fullName?: string; role?: AppRole } = {};
          if (name && name !== user.fullName) payload.fullName = name;
          if (role !== user.role) payload.role = role;
          if (Object.keys(payload).length === 0) return;
          confirm({
            title: "Simpan perubahan?",
            description: `Data ${user.fullName || user.email} akan diperbarui.`,
            actionLabel: "Simpan",
            destructive: false,
            onConfirm: () => onSave(payload),
          });
        }}
      >
        Simpan
      </Button>
      {confirmDialog}

      <DetailField label="Akun">
        <p className="text-xs text-muted-foreground">
          {user.email} {isSelf && "· akun kamu"}
          {user.pending && (
            <span className="text-primary"> · menunggu buat sandi</span>
          )}
        </p>
        <Button
          className="w-full"
          variant="outline"
          disabled={busy}
          onClick={user.pending ? onResend : onReset}
        >
          {user.pending ? (
            <>
              <Send className="size-4" /> Kirim ulang undangan
            </>
          ) : (
            <>
              <MailCheck className="size-4" /> Tautan atur sandi
            </>
          )}
        </Button>
      </DetailField>
    </>
  );
}

/** Pengaturan hak akses tiap level lewat centang. */
function AccessMatrix({ canInstaller }: { canInstaller: boolean }) {
  const { rolePermissions, setRolePermissions, addLog } = useBilling();
  void canInstaller;
  const editableRoles = ALL_ROLES.filter((r) => r !== "installer");
  const [active, setActive] = useState<AppRole>(editableRoles[0] ?? "manager");
  const allowed = permissionsOf(active, rolePermissions);

  const toggle = (key: string, on: boolean) => {
    const next = on
      ? [...new Set([...allowed, key])]
      : allowed.filter((k) => k !== key);
    setRolePermissions(active, next);
    addLog(
      "Ubah hak akses level",
      `${roleLabel[active]} · ${on ? "aktifkan" : "matikan"} ${key}`,
    );
  };

  const setGroup = (keys: string[], on: boolean) => {
    const next = on
      ? [...new Set([...allowed, ...keys])]
      : allowed.filter((k) => !keys.includes(k));
    setRolePermissions(active, next);
    addLog(
      "Ubah hak akses level",
      `${roleLabel[active]} · ${on ? "aktifkan" : "matikan"} ${keys.length} item`,
    );
  };

  return (
    <div className="surface-panel grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShieldCheck className="size-5 text-primary" /> Hak Akses per Level
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Centang menu, sub menu, dan fitur yang boleh dipakai tiap level.
            Installer selalu punya akses penuh.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRolePermissions(active, defaultRolePermissions[active] ?? []);
            addLog("Kembalikan hak akses ke bawaan", roleLabel[active]);
          }}
        >
          Kembalikan bawaan {roleLabel[active]}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {editableRoles.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={r === active ? "default" : "outline"}
            onClick={() => setActive(r)}
          >
            {roleLabel[r]}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => {
          const keys = group.items.map((i) => i.key);
          const allOn = keys.every((k) => allowed.includes(k));
          return (
            <div
              key={group.label}
              className="rounded-lg border border-border bg-secondary/30 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setGroup(keys, !allOn)}
                >
                  {allOn ? "Hapus semua" : "Pilih semua"}
                </button>
              </div>
              <div className="grid gap-2">
                {group.items.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <Checkbox
                      checked={allowed.includes(item.key)}
                      onCheckedChange={(v) => toggle(item.key, v === true)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
