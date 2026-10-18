import { useEffect, useState } from "react";
import { Power, PowerOff, Unlock, Home, RefreshCw, Image } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStoreInfo } from "@/lib/store-info";
import { controlTv, tvControlSettings, saveTvControlSettings, DEFAULT_TV_CONTROL, type TvControlResult } from "@/lib/tv-control";

export function TvControlPanel({ stationId, setup = false }: { stationId: string; setup?: boolean }) {
  const { store } = useStoreInfo(true);
  const [settings, setSettings] = useState(DEFAULT_TV_CONTROL);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TvControlResult | null>(null);
  useEffect(() => { setSettings(tvControlSettings(stationId)); setReady(Boolean(window.RenToPlayControl)); }, [stationId]);
  const run = async (action: string, data: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const result = await controlTv(stationId, action, data);
      if (result.volume !== undefined || result.inputs) setStatus(result);
      if (action === "wake") toast.success("Sinyal nyala dikirim; periksa layar TV.");
      else if (action === "configure") toast.success("Pengaturan tersimpan di TV.");
      else if (action !== "status" && action !== "volume") toast.success("Perintah diterima TV.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "TV tidak merespons."); }
    finally { setBusy(false); }
  };
  const update = (changes: Partial<typeof settings>) => {
    const next = { ...settings, ...changes }; setSettings(next); saveTvControlSettings(stationId, next);
  };
  const disabled = !ready || busy;
  return <div className="space-y-3 border-t border-border pt-3 text-sm">
    <h3 className="font-semibold">Kontrol TV</h3>
    {setup && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor={`mac-${stationId}`}>MAC TV</Label><Input id={`mac-${stationId}`} value={settings.mac} placeholder="1c:d1:d7:b8:30:68" onChange={e => update({ mac: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`token-${stationId}`}>Kode kontrol dari TV (6 angka)</Label><Input id={`token-${stationId}`} inputMode="numeric" maxLength={6} autoComplete="off" placeholder="123456" value={settings.token} onChange={e => update({ token: e.target.value.replace(/[^0-9]/g, "") })} /></div>
      <div className="space-y-1"><Label htmlFor={`pin-${stationId}`}>PIN Remote TV (4–6 angka)</Label><Input id={`pin-${stationId}`} type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={settings.pin} onChange={e => update({ pin: e.target.value.replace(/[^0-9]/g, "") })} /></div>
      <div className="space-y-1"><Label htmlFor={`welcome-title-${stationId}`}>Judul sambutan</Label><Input id={`welcome-title-${stationId}`} value={settings.welcomeTitle} onChange={e => update({ welcomeTitle: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor={`welcome-message-${stationId}`}>Ucapan sambutan</Label><Input id={`welcome-message-${stationId}`} value={settings.welcomeMessage} onChange={e => update({ welcomeMessage: e.target.value })} /></div>
      <div className="flex items-center justify-between gap-3 sm:col-span-2"><Label htmlFor={`splash-enabled-${stationId}`}>Splash saat TV dinyalakan</Label><Switch id={`splash-enabled-${stationId}`} checked={settings.splashOnWake} onCheckedChange={v => update({ splashOnWake: v })} /></div>
      <Button className="sm:col-span-2" disabled={disabled} onClick={() => run("configure", { logo: store?.logo_url ?? "", store: store?.store_name ?? "RenToPlay" })}>Kirim Pengaturan ke TV</Button>
    </div>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => run("wake")}><Power className="size-4" /> Nyalakan</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => { if (window.confirm("Jadikan TV standby? Billing dan timer tetap berjalan.")) void run("standby"); }}><PowerOff className="size-4" /> Standby</Button>
      <Button size="sm" disabled={disabled} onClick={() => run("releaseSplash")}><Unlock className="size-4" /> Release Splash</Button>
      <Button size="icon" variant="outline" title="Tampilkan splash" aria-label="Tampilkan splash" disabled={disabled} onClick={() => run("splash")}><Image className="size-4" /></Button>
      <Button size="icon" variant="outline" title="Home TV" aria-label="Home TV" disabled={disabled} onClick={() => run("home")}><Home className="size-4" /></Button>
      <Button size="icon" variant="outline" title="Periksa volume dan input TV" aria-label="Periksa volume dan input TV" disabled={disabled} onClick={() => run("status")}><RefreshCw className="size-4" /></Button>
    </div>
    {status?.volume !== undefined && <div className="space-y-1"><Label htmlFor={`volume-${stationId}`}>Volume {status.volume}%</Label><input className="w-full accent-primary" id={`volume-${stationId}`} type="range" min={0} max={100} disabled={disabled} value={status.volume} onChange={e => setStatus({ ...status, volume: Number(e.target.value) })} onPointerUp={e => run("volume", { value: Number(e.currentTarget.value) })} onKeyUp={e => run("volume", { value: Number(e.currentTarget.value) })} /></div>}
    {Boolean(status?.inputs?.length) && <Select disabled={disabled} onValueChange={inputId => run("input", { inputId })}><SelectTrigger aria-label="Input TV"><SelectValue placeholder="Input HDMI" /></SelectTrigger><SelectContent>{status?.inputs?.map(input => <SelectItem key={input.id} value={input.id}>{input.label}</SelectItem>)}</SelectContent></Select>}
  </div>;
}