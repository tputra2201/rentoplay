import { useEffect, useRef, useState } from "react";
import { DeviceNotifySettings } from "@/components/DeviceNotifySettings";
import { TvNotifySettings } from "@/components/TvNotifySettings";
import { createFileRoute } from "@tanstack/react-router";
import { Store, ImageUp, ShieldCheck, Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeDevices, useStoreInfo, type AllowedDevice } from "@/lib/store-info";
import { friendlyDeviceName } from "@/lib/device-name";

import { useBilling } from "@/lib/billing-store";
import { useAuth } from "@/lib/auth";
import { useDeviceAccess } from "@/lib/device-guard";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALARM_SOUNDS,
  clearCustomAlarm,
  getCustomAlarm,
  playAlarm,
  saveCustomAlarm,
  stopAlarm,
  type AlarmSound,
  type CustomAlarm,
} from "@/lib/alarm";

/** Perkecil gambar agar ringan dan tetap tajam sebagai logo. */
async function toLogoDataUrl(file: File, max = 256) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tidak bisa memproses gambar");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function LogoSection({
  storeId,
  logoUrl,
}: {
  storeId: string | undefined;
  logoUrl: string;
}) {
  const [secret, setSecret] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (logo: string) => {
    if (!storeId) return;
    if (!secret.trim()) {
      toast.error("Masukkan Kunci Developer terlebih dahulu.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/store-registry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-control-secret": secret.trim(),
        },
        body: JSON.stringify({ action: "update", id: storeId, logo_url: logo }),
      });
      if (!res.ok) {
        toast.error(
          res.status === 401
            ? "Kunci Developer salah."
            : "Gagal menyimpan logo. Coba lagi.",
        );
        return;
      }
      setPreview(logo);
      toast.success(logo ? "Logo store tersimpan." : "Logo store dihapus.");
    } catch {
      toast.error("Tidak ada koneksi ke server.");
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 5 MB.");
      return;
    }
    try {
      const data = await toLogoDataUrl(file);
      await save(data);
    } catch {
      toast.error("Gambar tidak bisa dibaca.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const current = preview ?? logoUrl;

  return (
    <div className="surface-panel grid gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ImageUp className="size-5" /> Logo Store
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Logo tampil di samping nama store pada bagian atas aplikasi. Hanya
          Developer yang bisa mengubahnya dengan memasukkan Kunci Developer.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {current ? (
          <img
            src={current}
            alt="Logo store"
            className="size-16 rounded-xl border border-border object-contain"
          />
        ) : (
          <div className="grid size-16 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
            Kosong
          </div>
        )}
        <div className="grid flex-1 gap-2 sm:max-w-xs">
          <Label htmlFor="control-secret">Kunci Developer</Label>
          <Input
            id="control-secret"
            type="password"
            value={secret}
            autoComplete="off"
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Kunci Developer"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button
          disabled={busy || !storeId}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Menyimpan…" : "Unggah Logo"}
        </Button>
        {current && (
          <Button
            variant="outline"
            disabled={busy || !storeId}
            onClick={() => void save("")}
          >
            Hapus Logo
          </Button>
        )}
      </div>
    </div>
  );
}

/** Daftar kode perangkat & daftar IP yang boleh bertransaksi. */
function DeviceAccessSection({
  storeId,
  storeName,
  devicesSaved,
  allowedIpsSaved,
}: {
  storeId: string | undefined;
  storeName: string;
  devicesSaved: AllowedDevice[];
  allowedIpsSaved: string[];
}) {
  const { code, ip, allowed, privileged } = useDeviceAccess();
  const { addLog } = useBilling();
  const [secret, setSecret] = useState("");
  const [devices, setDevices] = useState<AllowedDevice[]>(devicesSaved);
  const [ips, setIps] = useState(allowedIpsSaved.join("\n"));
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!seeded && (devicesSaved.length || allowedIpsSaved.length)) {
    setDevices(devicesSaved);
    setIps(allowedIpsSaved.join("\n"));
    setSeeded(true);
  }

  const ipList = () =>
    ips
      .split(/[\n,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);

  const addDevice = (rawCode: string, label: string) => {
    const value = rawCode.trim().toUpperCase();
    if (!value) {
      toast.error("Kode perangkat masih kosong.");
      return;
    }
    if (devices.some((d) => d.code.toUpperCase() === value)) {
      toast.error("Kode perangkat itu sudah ada di daftar.");
      return;
    }
    setDevices([...devices, { code: value, label: label.trim() }]);
    setNewCode("");
    setNewLabel("");
  };

  const removeDevice = (target: string) =>
    setDevices(devices.filter((d) => d.code !== target));

  const updateLabel = (target: string, label: string) =>
    setDevices(devices.map((d) => (d.code === target ? { ...d, label } : d)));

  const logChange = () =>
    addLog(
      "Ubah perangkat yang diizinkan",
      `${devices.length} perangkat · IP: ${ipList().join(", ") || "kosong"}`,
    );

  /**
   * Membaca ulang isi yang tersimpan lalu memastikan daftar perangkat & IP
   * benar-benar sama dengan yang baru disimpan. Tanpa ini, penyimpanan yang
   * tidak mengubah satu baris pun tetap terlihat "berhasil".
   */
  const confirmSaved = async () => {
    const { data, error } = await supabase
      .from("stores")
      .select("allowed_devices, allowed_ips")
      .limit(1)
      .maybeSingle();
    if (error || !data) return false;
    const row = data as { allowed_devices: unknown; allowed_ips: string[] | null };
    const savedCodes = normalizeDevices(row.allowed_devices)
      .map((d) => d.code.toUpperCase())
      .sort()
      .join("|");
    const wantCodes = devices
      .map((d) => d.code.toUpperCase())
      .sort()
      .join("|");
    const savedIps = [...(row.allowed_ips ?? [])].sort().join("|");
    const wantIps = [...ipList()].sort().join("|");
    return savedCodes === wantCodes && savedIps === wantIps;
  };

  const savedOk = () => {
    logChange();
    toast.success("Perangkat & IP yang diizinkan tersimpan.");
  };

  const savedFailed = () =>
    toast.error(
      "Daftar perangkat belum tersimpan. Akun ini kemungkinan terdaftar di store lain — pastikan store yang sedang dibuka sudah benar, lalu coba lagi.",
      { duration: 14000 },
    );

  /** Manager / Installer menyimpan langsung tanpa Kunci Developer. */
  const saveAsManager = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("store_set_device_access", {
        _device_code: devices[0]?.code ?? "",
        _allowed_ips: ipList(),
        _allowed_devices: devices,
      });
      if (error) {
        toast.error(error.message, { duration: 10000 });
        return;
      }
      const changed = typeof data === "number" ? data : 1;
      if (changed < 1 || !(await confirmSaved())) {
        savedFailed();
        return;
      }
      savedOk();
    } catch {
      toast.error("Tidak ada koneksi ke server.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (privileged) {
      await saveAsManager();
      return;
    }
    if (!storeId) return;
    if (!secret.trim()) {
      toast.error("Masukkan Kunci Developer terlebih dahulu.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/store-registry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-control-secret": secret.trim(),
        },
        body: JSON.stringify({
          action: "update",
          id: storeId,
          device_code: devices[0]?.code ?? "",
          allowed_devices: devices,
          allowed_ips: ipList(),
        }),
      });
      if (!res.ok) {
        toast.error(await res.text(), { duration: 10000 });
        return;
      }
      if (!(await confirmSaved())) {
        savedFailed();
        return;
      }
      savedOk();
    } catch {
      toast.error("Tidak ada koneksi ke server.");
    } finally {
      setBusy(false);
    }
  };

  const thisRegistered = devices.some((d) => d.code === code);

  return (
    <div className="surface-panel grid gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ShieldCheck className="size-5" /> Perangkat yang Diizinkan
        </h2>
        <p className="mt-1 text-sm font-bold text-primary">
          Daftar di bawah berlaku untuk store: {storeName || "belum diketahui"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Hanya perangkat yang kodenya ada di daftar (atau alamat IP-nya cocok)
          boleh bertransaksi — kecuali level Manager, Installer, atau Developer.
          Bila daftar perangkat dan daftar IP dibiarkan kosong, semua perangkat
          boleh bertransaksi.
        </p>
      </div>

      <div className="grid gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
        <p>
          Kode perangkat ini: <span className="font-mono font-bold">{code || "-"}</span>
        </p>
        <p>
          Alamat IP internet perangkat ini:{" "}
          <span className="font-mono font-bold">{ip || "tidak diketahui"}</span>
        </p>
        <p className="sm:col-span-2">
          Status perangkat ini:{" "}
          <span className={allowed ? "font-bold text-success" : "font-bold text-destructive"}>
            {allowed ? "boleh bertransaksi" : "hanya bisa melihat"}
          </span>
        </p>
        <div className="sm:col-span-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!code || thisRegistered}
            onClick={() =>
              addDevice(
                code,
                friendlyDeviceName(
                  localStorage.getItem("billing.device-model") ?? "",
                  navigator.userAgent,
                ),
              )
            }
          >
            <Plus className="size-4" />{" "}
            {thisRegistered ? "Perangkat ini sudah terdaftar" : "Tambahkan perangkat ini"}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Daftar Kode Perangkat</Label>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-left font-bold text-primary">Kode Perangkat</th>
                <th className="px-3 py-2 text-left font-bold text-primary">Keterangan</th>
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                    Belum ada perangkat terdaftar — semua perangkat diizinkan.
                  </td>
                </tr>
              )}
              {devices.map((d) => (
                <tr key={d.code} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono font-bold">
                    {d.code}
                    {d.code === code && (
                      <span className="ml-2 text-xs text-success">(perangkat ini)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={d.label}
                      onChange={(e) => updateLabel(d.code, e.target.value)}
                      placeholder="Kasir 1"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Hapus ${d.code}`}
                      onClick={() => removeDevice(d.code)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="Tempel kode perangkat"
          />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Keterangan (Kasir 1)"
          />
          <Button type="button" variant="secondary" onClick={() => addDevice(newCode, newLabel)}>
            <Plus className="size-4" /> Tambah
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="allowed-ips">Allowed IP Address (satu per baris)</Label>
          <Textarea
            id="allowed-ips"
            value={ips}
            rows={4}
            onChange={(e) => setIps(e.target.value)}
            placeholder={"103.10.*\n103.10.20.30"}
          />
          <p className="text-xs text-muted-foreground">
            Ini alamat IP internet store (bukan alamat Wi-Fi lokal seperti
            192.168.x.x). Boleh memakai pola, contoh{" "}
            <span className="font-mono">103.10.*</span>.
          </p>
        </div>
        {!privileged && (
          <div className="grid gap-2">
            <Label htmlFor="device-secret">Kunci Developer</Label>
            <Input
              id="device-secret"
              type="password"
              value={secret}
              autoComplete="off"
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Kunci Developer"
            />
          </div>
        )}
      </div>

      <div>
        <Button disabled={busy || (!privileged && !storeId)} onClick={() => void save()}>
          {busy ? "Menyimpan…" : "Simpan Perangkat & IP"}
        </Button>
      </div>
    </div>
  );
}

/** Jam buka & tutup operasional sebagai dasar siklus hari usaha. */
function OperatingHoursSection() {
  const { operatingHours, setOperatingHours } = useBilling();
  const [open, setOpen] = useState(String(operatingHours.openHour));
  const [close, setClose] = useState(String(operatingHours.closeHour));

  return (
    <div className="surface-panel grid gap-4 p-5">
      <div className="flex items-center gap-2">
        <Clock className="size-5 text-primary" />
        <h2 className="font-display text-lg font-bold">Jam Operasional</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Laporan dan statistik satu tanggal dihitung dari jam buka sampai jam tutup
        keesokan harinya. Contoh: buka 10, tutup 2 berarti 10:00 sampai 02:00.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="open-hour">Jam buka (0–23)</Label>
          <Input
            id="open-hour"
            type="number"
            min={0}
            max={23}
            value={open}
            onChange={(e) => setOpen(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="close-hour">Jam tutup (0–23)</Label>
          <Input
            id="close-hour"
            type="number"
            min={0}
            max={23}
            value={close}
            onChange={(e) => setClose(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Button
          onClick={() => {
            setOperatingHours({
              openHour: Number(open),
              closeHour: Number(close),
            });
            toast.success("Jam operasional disimpan");
          }}
        >
          Simpan Jam Operasional
        </Button>
      </div>
    </div>
  );
}


/** Keluar otomatis saat menganggur dan alarm waktu habis. */
function SessionSecuritySection() {
  const { sessionSecurity, setSessionSecurity } = useBilling();
  const [minutes, setMinutes] = useState(String(sessionSecurity.idleMinutes));
  const [custom, setCustom] = useState<CustomAlarm | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCustom(getCustomAlarm());
  }, []);


  return (
    <div className="surface-panel grid gap-4 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="font-display text-lg font-bold">Keamanan Sesi &amp; Alarm</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Pengguna keluar sendiri bila layar tidak dipakai selama waktu di bawah. Timer rental
        tetap berjalan sesuai jam sebenarnya, jadi sisa waktu tidak berubah. Isi 0 untuk
        mematikan keluar otomatis.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="idle-minutes">Keluar otomatis setelah (menit)</Label>
          <Input
            id="idle-minutes"
            type="number"
            min={0}
            max={240}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>Nada alarm waktu habis</Label>
          <div className="flex gap-2">
            <Select
              value={sessionSecurity.alarmSound}
              onValueChange={(value) => setSessionSecurity({ alarmSound: value as AlarmSound })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALARM_SOUNDS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => playAlarm(sessionSecurity.alarmSound, sessionSecurity.alarmVolume)}
            >
              Coba nada
            </Button>
            <Button type="button" variant="ghost" onClick={() => stopAlarm()}>
              Stop
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pilih “Sirine Keras”, “Klakson Keras”, atau “Darurat” untuk suara paling kencang.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="alarm-volume">Kekencangan alarm (1–10)</Label>
          <Input
            id="alarm-volume"
            type="number"
            min={1}
            max={10}
            value={sessionSecurity.alarmVolume}
            onChange={(e) =>
              setSessionSecurity({
                alarmVolume: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Naikkan juga volume perangkat agar terdengar sampai area rental.
          </p>
        </div>
        <div className="grid gap-2">
          <Label>Nada dari perangkat ini</Label>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const saved = await saveCustomAlarm(file);
                setCustom(saved);
                setSessionSecurity({ alarmSound: "custom" });
                toast.success(`Nada alarm diganti: ${saved.name}`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Gagal memakai berkas suara");
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Pilih berkas suara
            </Button>
            {custom ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  clearCustomAlarm();
                  setCustom(null);
                  if (sessionSecurity.alarmSound === "custom")
                    setSessionSecurity({ alarmSound: "sirenKeras" });
                  toast.success("Nada dari perangkat dihapus");
                }}
              >
                Hapus
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {custom
              ? `Terpasang: ${custom.name} (tersimpan di perangkat ini saja, maksimal 3 MB).`
              : "Belum ada. Pilih lagu atau nada MP3/WAV dari perangkat, maksimal 3 MB."}
          </p>
        </div>
      </div>
      <DeviceNotifySettings />
      <TvNotifySettings />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between rounded-lg bg-secondary/60 p-3 text-sm">
          <span>Alarm suara saat waktu habis</span>
          <Switch
            checked={sessionSecurity.alarmEnabled}
            onCheckedChange={(alarmEnabled) => setSessionSecurity({ alarmEnabled })}
            aria-label="Alarm suara saat waktu habis"
          />
        </label>
        <label className="flex items-center justify-between rounded-lg bg-secondary/60 p-3 text-sm">
          <span>Berbunyi berulang sampai ditekan OK</span>
          <Switch
            checked={sessionSecurity.alarmRepeat}
            onCheckedChange={(alarmRepeat) => setSessionSecurity({ alarmRepeat })}
            aria-label="Alarm berulang"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Kotak peringatan waktu habis tetap muncul walau layar sedang di halaman masuk. Beberapa
        browser baru mengeluarkan suara setelah layar pernah disentuh sekali.
      </p>
      <div>
        <Button
          onClick={() => {
            setSessionSecurity({ idleMinutes: Number(minutes) || 0 });
            toast.success("Pengaturan keamanan sesi disimpan");
          }}
        >
          Simpan Keamanan Sesi
        </Button>
      </div>
    </div>
  );
}


export const Route = createFileRoute("/_authenticated/store")({
  head: () => ({
    meta: [
      { title: "Pengaturan Store — RenToPlay" },
      {
        name: "description",
        content:
          "Installer mengisi identitas store: kode, nama, email, alamat, kota, pemilik, dan nomor HP.",
      },
      { property: "og:title", content: "Pengaturan Store — RenToPlay" },
      {
        property: "og:description",
        content: "Data identitas outlet rental PlayStation yang diatur oleh Installer.",
      },
    ],
  }),
  component: StorePage,
});

type StoreForm = {
  store_code: string;
  store_name: string;
  store_email: string;
  address: string;
  city: string;
  owner_name: string;
  phone: string;
  app_version: string;
  dev_contact: string;
};

const empty: StoreForm = {
  store_code: "",
  store_name: "",
  store_email: "",
  address: "",
  city: "",
  owner_name: "",
  phone: "",
  app_version: "v1.0",
  dev_contact: "",
};

const fields: {
  key: keyof StoreForm;
  label: string;
  type?: string;
  wide?: boolean;
  hint?: string;
}[] = [
  { key: "store_code", label: "Kode Store" },
  { key: "store_name", label: "Nama Store" },
  { key: "store_email", label: "Email Store", type: "email" },
  { key: "address", label: "Alamat lengkap", wide: true },
  { key: "city", label: "Kota" },
  { key: "owner_name", label: "Nama pemilik" },
  { key: "phone", label: "Nomor HP", type: "tel" },
  { key: "app_version", label: "Versi aplikasi" },
  {
    key: "dev_contact",
    label: "Nomor kontak developer",
    type: "tel",
    hint: "Contoh: 081282284411",
  },
];

function ModulesSection() {
  const { role } = useAuth();
  const { businessProfile, setBusinessProfile } = useBilling();
  if (role !== "manager" && role !== "admin") return null;
  const rows = [
    ["cafe", "Kafe (F&B)", "Menu kafe, meja kafe, dan pesanan makanan/minuman."],
    ["booking", "Reservasi", "Pemesanan jadwal dan DP reservasi."],
    ["playingCard", "Playing Card", "Kartu pelanggan, penjualan kartu, dan top up saldo."],
  ] as const;
  return (
    <section className="surface-panel space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Modul Aktif</h2>
        <p className="text-sm text-muted-foreground">
          Matikan modul yang tidak dipakai store ini. Menunya disembunyikan, data lama tetap aman.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="unit-label">Sebutan unit sewa</Label>
        <Input
          id="unit-label"
          value={businessProfile.unitLabel}
          placeholder="Misal: TV, Meja, Lapangan, Ruangan"
          onChange={(e) => setBusinessProfile({ unitLabel: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">Dipakai di Dashboard, layar kasir, dan panel sewa.</p>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {rows.map(([key, label, hint]) => (
          <label key={key} className="flex items-center justify-between gap-3 p-3">
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            <Switch
              checked={businessProfile.modules[key]}
              onCheckedChange={(v) => setBusinessProfile({ modules: { [key]: v } })}
              aria-label={`Modul ${label}`}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function EarlyEndOfDaySection() {
  const { role } = useAuth();
  const { activeBusinessDay, closeBusinessDay, shifts, operatingHours } = useBilling();
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  if (role !== "manager" && role !== "admin") return null;
  const shiftOpen = shifts.some((s) => !s.closedAt);
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <section className="surface-panel grid gap-3 p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Clock className="size-5" /> End of Day lebih awal
      </h2>
      <p className="text-sm text-muted-foreground">
        End of Day berjalan otomatis setiap hari pukul {pad(operatingHours.closeHour)}.
        Gunakan tombol ini hanya bila hari usaha harus ditutup lebih cepat. Setelah
        ditutup di sini, sistem tidak akan menutup lagi pada pukul {pad(operatingHours.closeHour)}.
      </p>
      {!activeBusinessDay ? (
        <p className="text-sm">Tidak ada hari usaha yang sedang berjalan.</p>
      ) : shiftOpen ? (
        <p className="text-sm text-destructive">
          Masih ada shift kasir yang berjalan. Minta kasir close out dulu.
        </p>
      ) : !confirm ? (
        <Button variant="destructive" className="w-fit" onClick={() => setConfirm(true)}>
          Tutup hari usaha sekarang
        </Button>
      ) : (
        <div className="grid gap-2 sm:max-w-md">
          <Label htmlFor="eod-note">Alasan (wajib)</Label>
          <Input id="eod-note" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                if (!note.trim()) {
                  toast.error("Isi alasan End of Day lebih awal");
                  return;
                }
                const row = closeBusinessDay({ note });
                if (!row) {
                  toast.error("Gagal, pastikan semua shift sudah ditutup");
                  return;
                }
                setConfirm(false);
                setNote("");
                toast.success("Hari usaha ditutup lebih awal");
              }}
            >
              Ya, tutup sekarang
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Batal</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function StorePage() {
  const { store, loading } = useStoreInfo(true);
  const form: StoreForm = store
    ? {
        store_code: store.store_code ?? "",
        store_name: store.store_name ?? "",
        store_email: store.store_email ?? "",
        address: store.address ?? "",
        city: store.city ?? "",
        owner_name: store.owner_name ?? "",
        phone: store.phone ?? "",
        app_version: store.app_version || "v1.0",
        dev_contact: store.dev_contact ?? "",
      }
    : empty;
  const expiresAt = store?.expires_at ?? null;

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "-";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-neon">
          <Store className="size-6" /> Data Store
        </h1>
      </div>

      <div className="surface-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Masa aktif aplikasi sampai
          </p>
          <p className="font-display text-xl font-bold">{expiryLabel}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Perpanjangan dilakukan oleh Developer.
        </p>
      </div>

      <OperatingHoursSection />
      <EarlyEndOfDaySection />
      <ModulesSection />
      <SessionSecuritySection />

      <LogoSection storeId={store?.id} logoUrl={store?.logo_url ?? ""} />

      <DeviceAccessSection
        storeId={store?.id}
        storeName={store?.store_name ?? ""}
        devicesSaved={store?.allowed_devices ?? []}
        allowedIpsSaved={store?.allowed_ips ?? []}
      />

      <div className="surface-panel grid gap-4 p-5 sm:grid-cols-2">
        {loading && (
          <p className="text-sm text-muted-foreground sm:col-span-2">Memuat data store…</p>
        )}
        {!loading &&
          fields.map(({ key, label, type, wide, hint }) => (
            <div key={key} className={`grid gap-2 ${wide ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type={type ?? "text"}
                value={form[key]}
                readOnly
                disabled
                placeholder={label}
              />
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
          ))}
      </div>
    </div>
  );
}
