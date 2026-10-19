import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TvControlPanel } from "@/components/TvControlPanel";
import { useStoreInfo } from "@/lib/store-info";
import { setTvIp, tvBridge, tvConfig, tvIps, tvMessage } from "@/lib/tv-notify";

export function StationTvSettings({ stationId, name, onIpChange }: { stationId: string; name: string; onIpChange: () => void }) {
  const { store } = useStoreInfo(true);
  const [ip, setIp] = useState("");
  const [ready, setReady] = useState(false);
  const [modern, setModern] = useState(false);
  useEffect(() => { setIp(tvIps()[stationId] ?? ""); setReady(Boolean(tvBridge())); setModern(Boolean(tvBridge()?.sendJson)); }, [stationId]);
  const test = (block: boolean) => {
    const bridge = tvBridge();
    if (!bridge || !ip.trim()) return;
    const cfg = tvConfig();
    const stage = cfg.stages[0];
    if (block && bridge.sendJson) bridge.sendJson(ip.trim(), JSON.stringify({ title: cfg.endTitle, subtitle: `${store?.store_name || "RenToPlay"} - ${name}`, message: tvMessage(cfg.endMessage, cfg.endMessageLines), level: "danger", block: true, logo: store?.logo_url ?? "" }));
    else bridge.sendNow(ip.trim(), (stage?.title ?? name).replace(/\{menit\}/g, String(stage?.minutes ?? 10)), tvMessage(stage?.message ?? "Tes notifikasi dari kasir.", stage?.messageLines).replace(/\{menit\}/g, String(stage?.minutes ?? 10)), "warning");
    toast.success(`Tes dikirim ke ${name}`);
  };
  return <div className="space-y-4">
    <div className="space-y-2"><Label htmlFor={`tv-ip-${stationId}`}>IP Layar TV</Label><Input id={`tv-ip-${stationId}`} inputMode="decimal" placeholder="192.168.x.x" value={ip} onChange={e => setIp(e.target.value)} onBlur={() => { setTvIp(stationId, ip); onIpChange(); }} /></div>
    {!ready && <p className="text-xs text-muted-foreground">Kontrol dan tes layar tersedia di aplikasi Android kasir.</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!ready || !ip.trim()} onClick={() => test(false)}>Tes Pengingat</Button>
      <Button size="sm" variant="outline" disabled={!modern || !ip.trim()} onClick={() => test(true)}>Tes Layar Penuh</Button>
      <Button size="sm" disabled={!modern || !ip.trim()} onClick={() => { tvBridge()?.dismiss?.(ip.trim()); toast.success(`Layar ${name} dilepas`); }}>Lepas Layar</Button>
    </div>
    <TvControlPanel stationId={stationId} setup />
  </div>;
}
