import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Check, Undo2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBilling } from "@/lib/billing-store";
import { useStoreInfo } from "@/lib/store-info";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  controlTv,
  saveTvGlobalSettings,
  tvGlobalSettings,
  validRemotePattern,
  type TvGlobalSettings,
} from "@/lib/tv-control";
import {
  DEFAULT_TV_CONFIG,
  saveTvConfig,
  tvBridge,
  tvConfig,
  tvIps,
  messageLines,
  type TvNotifyConfig,
} from "@/lib/tv-notify";

const PATTERN_KEYS = [
  { key: "U", label: "Atas", icon: ArrowUp },
  { key: "D", label: "Bawah", icon: ArrowDown },
  { key: "L", label: "Kiri", icon: ArrowLeft },
  { key: "R", label: "Kanan", icon: ArrowRight },
  { key: "C", label: "OK", icon: Check },
] as const;
const PATTERN_SYMBOL: Record<string, string> = { U: "↑", D: "↓", L: "←", R: "→", C: "OK" };

/** IP layar per station + pesan & menit pengingat (disimpan di perangkat kasir ini). */
export function TvNotifySettings() {
  const { stations } = useBilling();
  const { store } = useStoreInfo(true);
  const [cfg, setCfg] = useState<TvNotifyConfig>(DEFAULT_TV_CONFIG);
  const [global, setGlobal] = useState<TvGlobalSettings>(tvGlobalSettings());
  const [sendingAll, setSendingAll] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setCfg(tvConfig());
    setGlobal(tvGlobalSettings());
    const b = tvBridge();
    setReady(Boolean(b));
  }, []);

  const update = (next: TvNotifyConfig) => {
    setCfg(next);
    saveTvConfig(next);
  };

  const updateGlobal = (next: TvGlobalSettings) => {
    setGlobal(next);
    saveTvGlobalSettings(next);
  };

  const sendAll = async () => {
    if (!validRemotePattern(global.unlockPattern)) {
      toast.error("Pola remote harus 4–6 tombol arah/OK.");
      return;
    }
    const ips = tvIps();
    const targets = stations.filter((st) => ips[st.id]?.trim());
    if (!targets.length) {
      toast.error("Belum ada IP TV yang diisi.");
      return;
    }
    setSendingAll(true);
    let ok = 0;
    let skipped = 0;
    for (const st of targets) {
      try {
        await controlTv(st.id, "configure", { logo: store?.logo_url ?? "", store: store?.store_name ?? "RenToPlay" });
        ok++;
      } catch {
        skipped++;
      }
    }
    setSendingAll(false);
    if (skipped) toast.error(`Tersimpan di ${ok} TV; ${skipped} gagal (periksa IP, kode kontrol, dan TV menyala).`);
    else toast.success(`Pengaturan tersimpan di ${ok} TV.`);
  };

  return (
    <Tabs defaultValue="global" className="text-sm">
      <TabsList className="setup-tabs-list"><TabsTrigger value="global">Sambutan & Pola</TabsTrigger><TabsTrigger value="reminders">Pengingat Waktu</TabsTrigger><TabsTrigger value="end">Waktu Habis</TabsTrigger></TabsList>
      <TabsContent value="global" className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Pengaturan Global TV</h2>
        <p className="text-xs text-muted-foreground">
          Berlaku untuk semua TV di store ini. Isi satu kali, lalu kirim ke semua TV.
        </p>
        <div className="space-y-2">
          <Label>Pola Remote TV (4–6 tombol)</Label>
          <div aria-label="Pola remote tersimpan" className="flex min-h-9 items-center gap-2 font-mono text-lg">
            {global.unlockPattern ? global.unlockPattern.split("").map((key, i) => <span key={i}>{PATTERN_SYMBOL[key]}</span>) : <span className="text-sm text-muted-foreground">Belum diatur</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {PATTERN_KEYS.map(({ key, label, icon: Icon }) => (
              <Button key={key} type="button" size="icon" variant="outline" title={label} aria-label={`Pola ${label}`} disabled={global.unlockPattern.length >= 6} onClick={() => updateGlobal({ ...global, unlockPattern: global.unlockPattern + key })}><Icon className="size-4" /></Button>
            ))}
            <Button type="button" size="icon" variant="outline" title="Hapus tombol terakhir" aria-label="Hapus tombol terakhir" disabled={!global.unlockPattern} onClick={() => updateGlobal({ ...global, unlockPattern: global.unlockPattern.slice(0, -1) })}><Undo2 className="size-4" /></Button>
            <Button type="button" size="icon" variant="outline" title="Kosongkan pola" aria-label="Kosongkan pola" disabled={!global.unlockPattern} onClick={() => updateGlobal({ ...global, unlockPattern: "" })}><RotateCcw className="size-4" /></Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tv-global-title">Judul sambutan</Label>
            <Input id="tv-global-title" value={global.welcomeTitle} onChange={(e) => updateGlobal({ ...global, welcomeTitle: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tv-global-message">Ucapan sambutan</Label>
            <Input id="tv-global-message" value={global.welcomeMessage} onChange={(e) => updateGlobal({ ...global, welcomeMessage: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center justify-between rounded-lg bg-secondary/60 p-3">
          <span>Splash saat TV dinyalakan</span>
          <Switch checked={global.splashOnWake} onCheckedChange={(splashOnWake) => updateGlobal({ ...global, splashOnWake })} />
        </label>
        <Button disabled={!ready || sendingAll} onClick={() => void sendAll()}>
          {sendingAll ? "Mengirim…" : "Kirim Pengaturan ke Semua TV"}
        </Button>
      </div>

      </TabsContent>
      <TabsContent value="reminders" className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Pengingat Waktu</h2>
        <p className="text-xs text-muted-foreground">
          Tulis {"{menit}"} di pesan untuk menampilkan angka menit.
        </p>
        {cfg.stages.map((s, i) => (
          <div key={i} className="space-y-3 border-b border-border pb-4">
            <div className="flex items-center gap-2">
            <Label htmlFor={`tv-minutes-${i}`} className="w-28 shrink-0">Sisa (menit)</Label>
            <Input
              id={`tv-minutes-${i}`}
              type="number"
              min={1}
              value={s.minutes}
              className="h-8 w-20"
              onChange={(e) => {
                const stages = [...cfg.stages];
                stages[i] = { ...s, minutes: Math.max(1, Number(e.target.value) || 1) };
                update({ ...cfg, stages });
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Hapus pengingat"
              onClick={() => update({ ...cfg, stages: cfg.stages.filter((_, j) => j !== i) })}
            >
              <X className="size-4" />
            </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`tv-title-${i}`}>Judul</Label>
              <Input id={`tv-title-${i}`} value={s.title ?? ""} placeholder="Nama store - Station" onChange={(e) => {
                const stages = [...cfg.stages];
                const next = { ...s };
                if (e.target.value) next.title = e.target.value;
                else delete next.title;
                stages[i] = next;
                update({ ...cfg, stages });
              }} />
            </div>
            {[0, 1, 2].map((line) => (
              <div key={line} className="space-y-1.5">
                <Label htmlFor={`tv-stage-${i}-line-${line}`}>Message Baris {line + 1}</Label>
                <Input id={`tv-stage-${i}-line-${line}`} value={(s.messageLines ?? messageLines(s.message))[line] ?? ""} onChange={(e) => {
                  const lines = [...(s.messageLines ?? messageLines(s.message))];
                  lines[line] = e.target.value;
                  const stages = [...cfg.stages];
                  stages[i] = { ...s, messageLines: lines, message: lines.join("\n") };
                  update({ ...cfg, stages });
                }} />
              </div>
            ))}
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={cfg.stages.length >= 5}
          onClick={() =>
            update({ ...cfg, stages: [...cfg.stages, { minutes: 5, message: "Sisa waktu bermain {menit} menit." }] })
          }
        >
          <Plus className="size-4" /> Tambah pengingat
        </Button>
      </div>

      </TabsContent>
      <TabsContent value="end">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Saat Waktu Habis</h2>
        <div className="space-y-1.5">
          <Label htmlFor="tv-end-title">Judul</Label>
          <Input id="tv-end-title" value={cfg.endTitle} onChange={(e) => update({ ...cfg, endTitle: e.target.value })} />
        </div>
        {[0, 1, 2].map((line) => (
          <div key={line} className="space-y-1.5">
            <Label htmlFor={`tv-end-line-${line}`}>Message Baris {line + 1}</Label>
            <Input id={`tv-end-line-${line}`} value={(cfg.endMessageLines ?? messageLines(cfg.endMessage))[line] ?? ""} onChange={(e) => {
              const lines = [...(cfg.endMessageLines ?? messageLines(cfg.endMessage))];
              lines[line] = e.target.value;
              update({ ...cfg, endMessageLines: lines, endMessage: lines.join("\n") });
            }} />
          </div>
        ))}
        <label className="flex items-center justify-between rounded-lg bg-secondary/60 p-3">
          <span>Layar penuh hitam pekat + logo store, tetap tampil sampai dilepas kasir</span>
          <Switch checked={cfg.fullscreenEnd} onCheckedChange={(fullscreenEnd) => update({ ...cfg, fullscreenEnd })} />
        </label>
        <Button size="sm" variant="ghost" onClick={() => update(DEFAULT_TV_CONFIG)}>
          <Minus className="size-4" /> Kembalikan bawaan
        </Button>
      </div>
      </TabsContent>
    </Tabs>
  );
}
