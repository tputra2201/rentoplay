import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { passwordSetupUrl } from "@/lib/app-url";
import { updateBrandingCache, useBrandingRecord } from "@/lib/branding";
import { toLogoDataUrl } from "@/lib/logo-image";
import {
  ShieldCheck,
  RefreshCw,
  Save,
  LockKeyhole,
  Plus,
  Trash2,
  Settings2,
  X,
  UserPlus,
  Users,
  ImageUp,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/kontrol")({
  head: () => ({
    meta: [
      { title: "Pusat Kontrol Developer — RenToPlay" },
      {
        name: "description",
        content:
          "Halaman Developer untuk membuat store baru, memantau masa aktif, dan mengubah data seluruh store dari satu tempat.",
      },
      { property: "og:title", content: "Pusat Kontrol Developer — RenToPlay" },
      {
        property: "og:description",
        content: "Kelola seluruh store RenToPlay dan masa aktifnya dari satu halaman.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ControlCenter,
});

type StoreRow = {
  id: string;
  store_code: string;
  store_name: string;
  store_email: string;
  address: string;
  city: string;
  owner_name: string;
  phone: string;
  app_version: string;
  dev_contact: string;
  note: string;
  active: boolean;
  expires_at: string | null;
  members?: number;
  modules?: Record<string, boolean>;
};

const MODULE_DEFS = [
  ["rental", "Rental", "Station, Pricing, dan timer sewa unit."],
  ["cafe", "Kafe (F&B)", "Menu kafe, meja kafe, dan pesanan."],
  ["booking", "Reservasi", "Pemesanan jadwal dan DP reservasi."],
  ["playingCard", "Playing Card", "Kartu pelanggan dan top up saldo."],
  ["finance", "Finance", "Other Revenue, Expenses, Pay-In/Out."],
  ["tvConnect", "TV Connect", "Notifikasi ke layar TV Companion."],
] as const;

type ModuleKey = (typeof MODULE_DEFS)[number][0];

/** Saklar modul per store. Nilai `undefined` dianggap aktif (data lama). */
function ModuleToggles({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, boolean>;
  onChange: (key: ModuleKey, next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {MODULE_DEFS.map(([key, label, hint]) => (
        <label key={key} className="flex items-center justify-between gap-3 p-3">
          <span>
            <span className="block font-semibold">{label}</span>
            <span className="block text-xs text-muted-foreground">{hint}</span>
          </span>
          <Switch
            checked={value[key] !== false}
            disabled={disabled}
            onCheckedChange={(v) => onChange(key, v)}
            aria-label={`Modul ${label}`}
          />
        </label>
      ))}
    </div>
  );
}

type Form = {
  store_code: string;
  store_name: string;
  store_email: string;
  address: string;
  city: string;
  owner_name: string;
  phone: string;
  app_version: string;
  dev_contact: string;
  note: string;
  expires_date: string;
};

const emptyForm: Form = {
  store_code: "",
  store_name: "",
  store_email: "",
  address: "",
  city: "",
  owner_name: "",
  phone: "",
  app_version: "v1.0",
  dev_contact: "",
  note: "",
  expires_date: "",
};

const fields: { key: keyof Form; label: string; type?: string; wide?: boolean }[] = [
  { key: "store_code", label: "Kode Store" },
  { key: "store_name", label: "Nama Store" },
  { key: "store_email", label: "Email Store", type: "email" },
  { key: "address", label: "Alamat lengkap", wide: true },
  { key: "city", label: "Kota" },
  { key: "owner_name", label: "Nama pemilik" },
  { key: "phone", label: "Nomor HP", type: "tel" },
  { key: "app_version", label: "Versi aplikasi" },
  { key: "dev_contact", label: "Nomor kontak developer", type: "tel" },
  { key: "note", label: "Catatan", wide: true },
];

const toDateInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const daysUntil = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

const statusOf = (iso: string | null) => {
  if (!iso) return { text: "Belum diketahui", tone: "text-muted-foreground" };
  const days = daysUntil(iso);
  if (days <= 0) return { text: "Kedaluwarsa", tone: "text-destructive" };
  if (days <= 10) return { text: `Segera berakhir (${days} hari)`, tone: "text-warning" };
  return { text: `Aktif (${days} hari lagi)`, tone: "text-success" };
};

const SECRET_KEY = "rentalpro-control-secret";

function BrandingPanel({
  busy,
  post,
}: {
  busy: boolean;
  post: (body: unknown, okMessage?: string) => Promise<unknown>;
}) {
  const { branding, loaded } = useBrandingRecord();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [logo, setLogo] = useState("");
  const [ready, setReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready || !loaded) return;
    setTitle(branding.login_title);
    setNote(branding.login_note);
    setLogo(branding.logo_url);
    setReady(true);
  }, [branding, loaded, ready]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 5 MB.");
      return;
    }
    try {
      const data = await toLogoDataUrl(file);
      setLogo(data);
      await post(
        { action: "branding", logo_url: data },
        "Logo halaman masuk tersimpan.",
      );
    } catch {
      toast.error("Gambar tidak bisa dibaca.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="surface-panel grid gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ImageUp className="size-5" /> Tampilan halaman masuk
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Logo, judul, dan kalimat di bawah tombol Masuk yang dilihat semua
          pengguna sebelum login.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {logo ? (
          <img
            src={logo}
            alt="Logo halaman masuk"
            className="size-16 rounded-xl border border-border object-contain"
          />
        ) : (
          <div className="grid size-16 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
            Kosong
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImageUp className="size-4" /> Unggah logo
        </Button>
        {logo && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setLogo("");
              void post({ action: "branding", logo_url: "" }, "Logo dihapus.");
            }}
          >
            Hapus logo
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="login_title">Judul halaman masuk</Label>
        <Input
          id="login_title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="BILLING RENTAL PS"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="login_note">Kalimat di bawah tombol Masuk</Label>
        <Textarea
          id="login_note"
          value={note}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Contoh: Hubungi Admin untuk mendapatkan akun."
        />
      </div>
      <div>
        <Button
          disabled={busy}
          onClick={() =>
            void post(
              { action: "branding", login_title: title, login_note: note },
              "Tampilan halaman masuk tersimpan.",
            )
          }
        >
          <Save className="size-4" /> Simpan tampilan masuk
        </Button>
      </div>
    </div>
  );
}

const APP_FIELDS = [
  { key: "app_name", label: "Nama Aplikasi", placeholder: "RenToPlay" },
  { key: "app_version", label: "Versi Aplikasi", placeholder: "v1.0" },
  { key: "release_date", label: "Tanggal Rilis", type: "date" },
  { key: "developer_name", label: "Nama Developer", placeholder: "Nama lengkap" },
  { key: "developer_email", label: "Email Developer", type: "email" },
  { key: "developer_contact", label: "Nomor Contact Developer", placeholder: "081282284411" },
] as const;

type AppField = (typeof APP_FIELDS)[number]["key"];

function AppIdentityPanel({
  busy,
  post,
}: {
  busy: boolean;
  post: (body: unknown, okMessage?: string) => Promise<unknown>;
}) {
  const { branding, loaded } = useBrandingRecord();
  const [form, setForm] = useState<Record<AppField, string>>({
    app_name: "",
    app_version: "",
    release_date: "",
    developer_name: "",
    developer_email: "",
    developer_contact: "",
  });
  const [icon, setIcon] = useState("");
  const [ready, setReady] = useState(false);
  const iconRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready || !loaded) return;
    setForm({
      app_name: branding.app_name,
      app_version: branding.app_version,
      release_date: branding.release_date,
      developer_name: branding.developer_name,
      developer_email: branding.developer_email,
      developer_contact: branding.developer_contact,
    });
    setIcon(branding.app_icon_url);
    setReady(true);
  }, [branding, loaded, ready]);

  const pickIcon = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 5 MB.");
      return;
    }
    try {
      const data = await toLogoDataUrl(file);
      setIcon(data);
      const saved = await post(
        { action: "branding", app_icon_url: data },
        "Ikon aplikasi tersimpan.",
      );
      if (saved) updateBrandingCache({ app_icon_url: data });
    } catch {
      toast.error("Gambar tidak bisa dibaca.");
    } finally {
      if (iconRef.current) iconRef.current.value = "";
    }
  };

  return (
    <div className="surface-panel grid gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Info className="size-5" /> Identitas aplikasi
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nama aplikasi, versi, dan nomor kontak developer tampil di bawah nama
          store pada pojok kiri atas semua perangkat. Nama dan ikon aplikasi
          juga dipakai sebagai judul dan ikon website.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {icon ? (
          <img
            src={icon}
            alt="Ikon aplikasi"
            className="size-16 rounded-xl border border-border object-contain"
          />
        ) : (
          <div className="grid size-16 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
            Kosong
          </div>
        )}
        <input
          ref={iconRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pickIcon(e.target.files?.[0])}
        />
        <Button disabled={busy} onClick={() => iconRef.current?.click()}>
          <ImageUp className="size-4" /> Unggah ikon aplikasi
        </Button>
        {icon && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setIcon("");
              const saved = await post(
                { action: "branding", app_icon_url: "" },
                "Ikon aplikasi dihapus.",
              );
              if (saved) updateBrandingCache({ app_icon_url: "" });
            }}
          >
            Hapus ikon
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {APP_FIELDS.map((field) => (
          <div key={field.key} className="grid gap-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              type={"type" in field ? field.type : "text"}
              value={form[field.key]}
              placeholder={"placeholder" in field ? field.placeholder : ""}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div>
        <Button
          disabled={busy}
          onClick={async () => {
            const saved = await post(
              { action: "branding", ...form },
              "Identitas aplikasi tersimpan.",
            );
            if (saved) updateBrandingCache(form);
          }}
        >
          <Save className="size-4" /> Simpan identitas aplikasi
        </Button>
      </div>
    </div>
  );
}

type DeveloperRow = { user_id: string; email: string; created_at: string };

function DeveloperPanel({
  busy,
  post,
  developers,
  reload,
}: {
  busy: boolean;
  post: (body: unknown, okMessage?: string) => Promise<unknown>;
  developers: DeveloperRow[];
  reload: () => void;
}) {
  const [email, setEmail] = useState("");

  const create = async () => {
    const ok = await post(
      {
        action: "developer-account",
        email: email.trim(),
        full_name: "Developer",
        redirect_to: passwordSetupUrl(),
      },
      "Email untuk akun Developer sudah dikirim.",
    );
    if (ok) {
      setEmail("");
      reload();
    }
  };

  return (
    <div className="surface-panel grid gap-4 p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Akun Developer</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Akun ini masuk seperti staf biasa, tapi bisa membuka seluruh store dan mengubah
          semua pengaturan, menu, dan tarif. Store yang dibuka dipilih dari daftar di
          bagian atas aplikasi.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-[16rem] flex-1 gap-2">
          <Label htmlFor="dev_email">Email akun Developer</Label>
          <Input
            id="dev_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="developer@email.com"
          />
        </div>
        <Button disabled={busy || !email.trim()} onClick={() => void create()}>
          <ShieldCheck className="size-4" /> Buat / kirim ulang
        </Button>
      </div>
      {developers.length > 0 && (
        <ul className="grid gap-2">
          {developers.map((d) => (
            <li
              key={d.user_id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 text-sm"
            >
              <span className="truncate">{d.email}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const ok = await post(
                    { action: "developer-remove", user_id: d.user_id },
                    "Akses Developer dicabut.",
                  );
                  if (ok) reload();
                }}
              >
                Cabut akses
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ControlCenter() {
  const [secret, setSecret] = useState("");
  const [developers, setDevelopers] = useState<DeveloperRow[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [selected, setSelected] = useState<StoreRow | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [newStore, setNewStore] = useState({
    store_name: "",
    store_code: "",
    city: "",
    expires_date: "",
  });
  const [newModules, setNewModules] = useState<Record<string, boolean>>({});
  const [invite, setInvite] = useState({ email: "", full_name: "" });

  useEffect(() => {
    const saved = sessionStorage.getItem(SECRET_KEY);
    if (saved) {
      setSecret(saved);
      void load(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = () => secret || sessionStorage.getItem(SECRET_KEY) || "";

  const load = async (provided?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/public/store-registry", {
        headers: { "x-control-secret": provided ?? key() },
      });
      if (res.status === 401 || res.status === 503) {
        toast.error(
          (await res.text()) || "Kunci Developer salah.",
          res.status === 503 ? { duration: 12000 } : undefined,
        );
        setUnlocked(false);
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        toast.error(text || "Gagal memuat daftar store.", { duration: 12000 });
        return;
      }
      const json = (await res.json()) as {
        stores: StoreRow[];
        developers?: DeveloperRow[];
      };
      setStores(json.stores);
      setDevelopers(json.developers ?? []);
      setUnlocked(true);
      sessionStorage.setItem(SECRET_KEY, provided ?? key());
    } catch {
      toast.error("Tidak bisa terhubung ke pusat kontrol.");
    } finally {
      setBusy(false);
    }
  };

  const post = async (body: unknown, okMessage?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/public/store-registry", {
        method: "POST",
        headers: { "x-control-secret": key(), "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        toast.error(
          res.status === 401 ? "Kunci Developer salah." : text || "Perintah gagal.",
        );
        return null;
      }
      const json = (await res.json()) as {
        store?: StoreRow;
        ok?: boolean;
        invited?: boolean;
        emailSent?: "invite" | "reset" | null;
      };
      if (json.store) {
        setStores((prev) => {
          const exists = prev.some((s) => s.id === json.store!.id);
          return exists
            ? prev.map((s) => (s.id === json.store!.id ? { ...s, ...json.store! } : s))
            : [...prev, json.store!];
        });
        setSelected((prev) =>
          prev && prev.id === json.store!.id ? { ...prev, ...json.store! } : prev,
        );
      }
      if (okMessage) toast.success(okMessage);
      return json;
    } catch {
      toast.error("Tidak bisa terhubung ke pusat kontrol.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addStore = async () => {
    if (!newStore.store_name.trim()) {
      toast.error("Nama store wajib diisi.");
      return;
    }
    const payload: Record<string, unknown> = {
      action: "create",
      store_name: newStore.store_name,
      store_code: newStore.store_code,
      city: newStore.city,
    };
    if (newStore.expires_date) {
      const d = new Date(`${newStore.expires_date}T23:59:59`);
      if (!Number.isNaN(d.getTime())) payload["expires_at"] = d.toISOString();
    }
    const json = await post(payload, "Store baru dibuat.");
    if (json?.store) {
      const created = json.store;
      const disabled = Object.entries(newModules).filter(([, v]) => v === false);
      if (disabled.length > 0) {
        await post(
          { action: "modules", id: created.id, modules: Object.fromEntries(disabled) },
          "Modul store diatur.",
        );
      }
      setNewStore({ store_name: "", store_code: "", city: "", expires_date: "" });
      setNewModules({});
      openStore(created);
    }
  };

  const openStore = (row: StoreRow) => {
    setSelected(row);
    setForm({
      store_code: row.store_code ?? "",
      store_name: row.store_name ?? "",
      store_email: row.store_email ?? "",
      address: row.address ?? "",
      city: row.city ?? "",
      owner_name: row.owner_name ?? "",
      phone: row.phone ?? "",
      app_version: row.app_version || "v1.0",
      dev_contact: row.dev_contact ?? "",
      note: row.note ?? "",
      expires_date: row.expires_at ? toDateInput(row.expires_at) : "",
    });
    setInvite({ email: "", full_name: "" });
  };

  const saveStore = async () => {
    if (!selected) return;
    const payload: Record<string, unknown> = {
      action: "update",
      id: selected.id,
      store_code: form.store_code,
      store_name: form.store_name,
      store_email: form.store_email,
      address: form.address,
      city: form.city,
      owner_name: form.owner_name,
      phone: form.phone,
      app_version: form.app_version,
      dev_contact: form.dev_contact,
      note: form.note,
    };
    if (form.expires_date) {
      const d = new Date(`${form.expires_date}T23:59:59`);
      if (!Number.isNaN(d.getTime())) payload["expires_at"] = d.toISOString();
    }
    await post(payload, "Data store tersimpan.");
  };

  const extend = (row: StoreRow, days: number) =>
    void post(
      { action: "extend", id: row.id, days },
      `Masa aktif diperpanjang ${days} hari.`,
    );

  const removeStore = async (row: StoreRow) => {
    const json = await post({ action: "delete", id: row.id }, "Store dihapus.");
    if (json) {
      setStores((prev) => prev.filter((s) => s.id !== row.id));
      setSelected((prev) => (prev?.id === row.id ? null : prev));
    }
  };

  const assignAdmin = async () => {
    if (!selected || !invite.email.trim()) {
      toast.error("Email pengelola wajib diisi.");
      return;
    }
    const json = await post({
      action: "assign",
      id: selected.id,
      email: invite.email.trim(),
      full_name: invite.full_name.trim(),
      role: "installer",
      redirect_to: passwordSetupUrl(),
    });
    if (json?.ok) {
      toast.success(
        json.emailSent === "reset"
          ? "Akun ini sekarang mengelola store tersebut. Tautan buat sandi baru sudah dikirim ke emailnya."
          : "Undangan terkirim. Pengelola membuat sandi lewat tautan di email.",
      );
      setInvite({ email: "", full_name: "" });
      void load();
    }
  };

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md">
        <div className="surface-panel grid gap-4 p-6">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-neon">
            <LockKeyhole className="size-5" /> Pusat Kontrol Developer
          </h1>
          <p className="text-sm text-muted-foreground">
            Masukkan kunci Developer untuk membuat dan mengatur seluruh store.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="secret">Kunci Developer</Label>
            <Input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && secret && void load(secret)}
              placeholder="••••••••"
            />
          </div>
          <Button disabled={!secret || busy} onClick={() => void load(secret)}>
            <ShieldCheck className="size-4" /> Masuk pusat kontrol
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-neon">
            <ShieldCheck className="size-6" /> Pusat Kontrol Developer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Satu aplikasi untuk semua store. Buat store baru, atur datanya, dan pantau
            masa aktifnya dari sini.
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCw className="size-4" /> Muat ulang
        </Button>
      </div>

      <AppIdentityPanel busy={busy} post={post} />

      <BrandingPanel busy={busy} post={post} />

      <DeveloperPanel
        busy={busy}
        post={post}
        developers={developers}
        reload={() => void load()}
      />

      <div className="surface-panel grid gap-4 p-5">
        <h2 className="font-display text-lg font-bold">Buat store baru</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="new_name">Nama store</Label>
            <Input
              id="new_name"
              value={newStore.store_name}
              onChange={(e) => setNewStore((s) => ({ ...s, store_name: e.target.value }))}
              placeholder="Cosmo Gaming Makassar"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new_code">Kode store</Label>
            <Input
              id="new_code"
              value={newStore.store_code}
              onChange={(e) => setNewStore((s) => ({ ...s, store_code: e.target.value }))}
              placeholder="CGM-01"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new_city">Kota</Label>
            <Input
              id="new_city"
              value={newStore.city}
              onChange={(e) => setNewStore((s) => ({ ...s, city: e.target.value }))}
              placeholder="Makassar"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new_exp">Masa aktif sampai</Label>
            <Input
              id="new_exp"
              type="date"
              value={newStore.expires_date}
              onChange={(e) =>
                setNewStore((s) => ({ ...s, expires_date: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Modul aktif untuk store ini</Label>
          <ModuleToggles
            value={newModules}
            disabled={busy}
            onChange={(k, v) => setNewModules((m) => ({ ...m, [k]: v }))}
          />
          <p className="text-xs text-muted-foreground">
            Modul yang dimatikan disembunyikan dari menu store tersebut. Bisa diubah lagi
            kapan saja lewat tombol Kelola.
          </p>
        </div>
        <div>
          <Button disabled={busy} onClick={() => void addStore()}>
            <Plus className="size-4" /> Buat store
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {stores.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Belum ada store. Buat store pertama di atas.
          </p>
        )}
        {stores.map((row) => {
          const status = statusOf(row.expires_at);
          return (
            <div
              key={row.id}
              className="surface-panel grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="font-display text-lg font-bold">
                  {row.store_name?.trim() || "Store baru"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.store_code?.trim() || "tanpa kode"} · {row.city?.trim() || "-"} ·{" "}
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" />
                    {row.members ?? 0} akun
                  </span>
                </p>
                <p className={`text-xs font-semibold ${status.tone}`}>
                  {status.text}
                  {row.expires_at
                    ? ` · sampai ${new Date(row.expires_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[30, 90, 365].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => extend(row, d)}
                  >
                    +{d} hari
                  </Button>
                ))}
                <Button size="sm" disabled={busy} onClick={() => openStore(row)}>
                  <Settings2 className="size-4" /> Kelola
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void removeStore(row)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="surface-panel grid gap-4 p-5 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <h2 className="font-display text-lg font-bold">
              Data store: {selected.store_name?.trim() || "-"}
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              <X className="size-4" />
            </Button>
          </div>
          {fields.map(({ key: field, label, type, wide }) => (
            <div key={field} className={`grid gap-2 ${wide ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={field}>{label}</Label>
              <Input
                id={field}
                type={type ?? "text"}
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                placeholder={label}
              />
            </div>
          ))}
          <div className="grid gap-2">
            <Label htmlFor="expires_date">Tanggal kedaluwarsa</Label>
            <Input
              id="expires_date"
              type="date"
              value={form.expires_date}
              onChange={(e) => setForm((f) => ({ ...f, expires_date: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={busy} onClick={() => void saveStore()}>
              <Save className="size-4" /> Simpan perubahan
            </Button>
          </div>

          <div className="grid gap-2 border-t border-border pt-4 sm:col-span-2">
            <h3 className="font-display text-base font-bold">Modul aktif</h3>
            <p className="text-xs text-muted-foreground">
              Perubahan tersimpan otomatis dan langsung berlaku untuk store ini begitu
              perangkatnya tersinkron.
            </p>
            <ModuleToggles
              value={selected.modules ?? {}}
              disabled={busy}
              onChange={(k, v) => {
                const next = { ...(selected.modules ?? {}), [k]: v };
                setSelected((s) => (s ? { ...s, modules: next } : s));
                void post({ action: "modules", id: selected.id, modules: { [k]: v } });
              }}
            />
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:col-span-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="font-display text-base font-bold">
                Pengelola pertama store ini
              </h3>
              <p className="text-xs text-muted-foreground">
                Undangan dikirim ke email tersebut; dia membuat sandinya sendiri lalu
                menjadi Installer store ini.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv_email">Email pengelola</Label>
              <Input
                id="inv_email"
                type="email"
                value={invite.email}
                onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))}
                placeholder="pemilik@contoh.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv_name">Nama pengelola</Label>
              <Input
                id="inv_name"
                value={invite.full_name}
                onChange={(e) => setInvite((s) => ({ ...s, full_name: e.target.value }))}
                placeholder="Nama lengkap"
              />
            </div>
            <div className="sm:col-span-2">
              <Button variant="outline" disabled={busy} onClick={() => void assignAdmin()}>
                <UserPlus className="size-4" /> Kirim undangan pengelola
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
