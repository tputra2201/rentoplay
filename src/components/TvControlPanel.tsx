import { useEffect, useState } from "react";
import { Power, PowerOff, Unlock, Home, RefreshCw, Image } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStoreInfo } from "@/lib/store-info";
import { controlTv, tvControlSettings, saveTvControlSettings, DEFAULT_TV_CONTROL, type TvControlResult } from "@/lib/tv-control";

export function TvControlPanel({ stationId, setup = false }: { stationId: string; setup?: boolean }) {
  const { store } = useStoreInfo(true);
  const [settings, setSettings] = useState(DEFAULT_TV_CONTROL);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TvControlResult | null>(null);
  const [statusError, setStatusError] = useState("");
  const [selectedInput, setSelectedInput] = useState("");
  useEffect(() => {
    let cancelled = false;
    const nativeReady = Boolean(window.RenToPlayControl);
    setSettings(tvControlSettings(stationId));
    setReady(nativeReady);
    setStatus(null);
    setSelectedInput("");
    setStatusError("");
    setBusy(nativeReady);
    if (nativeReady) {
      void controlTv(stationId, "status")
        .then(result => { if (!cancelled) setStatus(result); })
        .catch(error => { if (!cancelled) setStatusError(error instanceof Error ? error.message : "TV tidak merespons."); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }
    return () => { cancelled = true; };
  }, [stationId]);
  const run = async (action: string, data: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const result = await controlTv(stationId, action, data);
      if (result.volume !== undefined || result.inputs) setStatus(previous => ({ ...previous, ...result }));
      if (action === "status") setStatusError("");
      if (action === "input" && typeof data["inputId"] === "string") setSelectedInput(data["inputId"]);
      if (action === "wake") toast.success("Sinyal nyala dikirim; periksa layar TV.");
      else if (action === "configure") toast.success("Pengaturan tersimpan di TV.");
      else if (action !== "status" && action !== "volume") toast.success("Perintah diterima TV.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "TV tidak merespons.";
      if (action === "status") setStatusError(message);
      toast.error(message);
    }
    finally { setBusy(false); }
  };
  const update = (changes: Partial<typeof settings>) => {
    const next = { ...settings, ...changes }; setSettings(next); saveTvControlSettings(stationId, next);
  };
  const disabled = !ready || busy;
  return <div className="space-y-3 border-t border-border pt-3 text-sm">
    {setup && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor={`mac-${stationId}`}>MAC TV</Label><Input id={`mac-${stationId}`} value={settings.mac} placeholder="1c:d1:d7:b8:30:68" onChange={e => update({ mac: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`token-${stationId}`}>Kode kontrol dari TV (6 angka)</Label><Input id={`token-${stationId}`} inputMode="numeric" maxLength={6} autoComplete="off" placeholder="123456" value={settings.token} onChange={e => update({ token: e.target.value.replace(/[^0-9]/g, "") })} /></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Pola remote, judul, dan ucapan sambutan diatur satu kali untuk semua TV di bagian Pengaturan Global TV.</p>
      <Button className="sm:col-span-2" disabled={disabled} onClick={() => run("configure", { logo: store?.logo_url ?? "", store: store?.store_name ?? "RenToPlay" })}>Kirim Pengaturan ke TV</Button>
    </div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`volume-${stationId}`} className="flex items-center justify-between gap-2">
          Volume TV <span className="text-muted-foreground">{status?.volume !== undefined ? `${status.volume}%` : "—"}</span>
        </Label>
        <input className="h-9 w-full accent-primary disabled:opacity-50" id={`volume-${stationId}`} type="range" min={0} max={100}
          disabled={disabled || status?.volume === undefined} value={status?.volume ?? 0}
          aria-valuetext={status?.volume !== undefined ? `${status.volume}%` : "Volume belum tersedia"}
          onChange={e => setStatus(previous => previous ? { ...previous, volume: Number(e.target.value) } : previous)}
          onPointerUp={e => { if (!disabled && status?.volume !== undefined) void run("volume", { value: Number(e.currentTarget.value) }); }}
          onKeyUp={e => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key) && !disabled && status?.volume !== undefined) void run("volume", { value: Number(e.currentTarget.value) }); }} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`input-${stationId}`}>Input HDMI</Label>
        <Select value={selectedInput} disabled={disabled || !status?.inputs?.length} onValueChange={inputId => void run("input", { inputId })}>
          <SelectTrigger id={`input-${stationId}`} aria-label="Input HDMI TV" className="w-full"><SelectValue placeholder={busy && !status ? "Memuat input…" : status?.inputs?.length ? "Pilih input HDMI" : "Input belum tersedia"} /></SelectTrigger>
          <SelectContent>{status?.inputs?.map(input => <SelectItem key={input.id} value={input.id}>{input.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
    {!ready && <p className="text-xs text-muted-foreground">Kontrol TV tersedia melalui APK kasir.</p>}
    {statusError && <p role="status" className="text-xs text-destructive">{statusError}</p>}
    {ready && status && !status.inputs?.length && <p className="text-xs text-muted-foreground">TV tidak melaporkan input HDMI yang tersedia.</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => run("wake")}><Power className="size-4" /> Nyalakan</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => { if (window.confirm("Jadikan TV standby? Billing dan timer tetap berjalan.")) void run("standby"); }}><PowerOff className="size-4" /> Standby</Button>
      <Button size="sm" disabled={disabled} onClick={() => run("releaseSplash")}><Unlock className="size-4" /> Release Splash</Button>
      <Button size="icon" variant="outline" title="Tampilkan splash" aria-label="Tampilkan splash" disabled={disabled} onClick={() => run("splash")}><Image className="size-4" /></Button>
      <Button size="icon" variant="outline" title="Home TV" aria-label="Home TV" disabled={disabled} onClick={() => run("home")}><Home className="size-4" /></Button>
      <Button size="icon" variant="outline" title="Periksa volume dan input TV" aria-label="Periksa volume dan input TV" disabled={disabled} onClick={() => run("status")}><RefreshCw className="size-4" /></Button>
    </div>
  </div>;
}