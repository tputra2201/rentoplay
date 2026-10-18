import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBilling } from "@/lib/billing-store";
import { useStoreInfo } from "@/lib/store-info";
import { TvControlPanel } from "@/components/TvControlPanel";
import {
  DEFAULT_TV_CONFIG,
  saveTvConfig,
  setTvIp,
  tvBridge,
  tvConfig,
  tvIps,
  messageLines,
  tvMessage,
  type TvNotifyConfig,
} from "@/lib/tv-notify";

/** IP layar per station + pesan & menit pengingat (disimpan di perangkat kasir ini). */
export function TvNotifySettings() {
  const { stations } = useBilling();
  const { store } = useStoreInfo(true);
  const [ips, setIps] = useState<Record<string, string>>({});
  const [cfg, setCfg] = useState<TvNotifyConfig>(DEFAULT_TV_CONFIG);
  const [ready, setReady] = useState(false);
  const [modern, setModern] = useState(false);
  useEffect(() => {
    setIps(tvIps());
    setCfg(tvConfig());
    const b = tvBridge();
    setReady(Boolean(b));
    setModern(Boolean(b?.scheduleJson));
  }, []);

  const update = (next: TvNotifyConfig) => {
    setCfg(next);
    saveTvConfig(next);
  };

  const test = (id: string, name: string) => {
    const ip = ips[id]?.trim();
    const bridge = tvBridge();
    if (!bridge || !ip) return;
    const stage = cfg.stages[0];
    const title = (stage?.title ?? `${store?.store_name || "RenToPlay"} - ${name}`).replace(/\{menit\}/g, String(stage?.minutes ?? 10));
    const message = tvMessage(stage?.message ?? "Tes notifikasi dari kasir.", stage?.messageLines).replace(/\{menit\}/g, String(stage?.minutes ?? 10));
    bridge.sendNow(ip, title, message, "warning");
    toast.success(`Tes dikirim ke ${ip}`);
  };

  const testBlock = (id: string, name: string) => {
    const ip = ips[id]?.trim();
    const bridge = tvBridge();
    if (!bridge?.sendJson || !ip) return;
    bridge.sendJson(
      ip,
      JSON.stringify({
        title: cfg.endTitle,
        subtitle: `${store?.store_name || "RenToPlay"} - ${name}`,
        message: tvMessage(cfg.endMessage, cfg.endMessageLines),
        level: "danger",
        block: true,
        logo: store?.logo_url ?? "",
      }),
    );
    toast.success(`Layar penuh dikirim ke ${name}`);
  };

  const release = (id: string, name: string) => {
    const ip = ips[id]?.trim();
    const bridge = tvBridge();
    if (!bridge?.dismiss || !ip) return;
    bridge.dismiss(ip);
    toast.success(`Layar ${name} dilepas`);
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">IP Layar Station</h2>
        <p className="text-xs text-muted-foreground">
          {ready
            ? "Isi IP yang tampil di aplikasi RenToPlay TV. Pengingat tetap terkirim walau aplikasi kasir di latar belakang."
            : "Hanya bisa dari aplikasi Android kasir (bukan Chrome)."}
          {ready && !modern && " Pasang APK kasir terbaru agar pesan kustom & layar penuh aktif."}
        </p>
        {stations.map((st) => (
          <div key={st.id} className="space-y-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 truncate font-medium">{st.name}</span>
            <Input
              inputMode="decimal"
              placeholder="192.168.x.x"
              value={ips[st.id] ?? ""}
              onChange={(e) => setIps({ ...ips, [st.id]: e.target.value })}
              onBlur={(e) => setTvIp(st.id, e.target.value)}
              disabled={!ready}
              className="h-8 w-40"
            />
            <Button size="sm" variant="outline" onClick={() => test(st.id, st.name)} disabled={!ready || !ips[st.id]}>
              Tes
            </Button>
            <Button size="sm" variant="outline" onClick={() => testBlock(st.id, st.name)} disabled={!modern || !ips[st.id]}>
              Tes Layar Penuh
            </Button>
            <Button size="sm" onClick={() => release(st.id, st.name)} disabled={!modern || !ips[st.id]}>
              Lepas Layar
            </Button>
          </div>
          <TvControlPanel stationId={st.id} setup />
          </div>
        ))}
      </div>

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
    </div>
  );
}
