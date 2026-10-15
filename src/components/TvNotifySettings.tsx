import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBilling } from "@/lib/billing-store";
import { setTvIp, tvBridge, tvIps } from "@/lib/tv-notify";

/** IP aplikasi RenToPlay TV per unit (disimpan di perangkat kasir ini). */
export function TvNotifySettings() {
  const { stations } = useBilling();
  const [ips, setIps] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setIps(tvIps());
    setReady(Boolean(tvBridge()));
  }, []);

  const test = (id: string, name: string) => {
    const ip = ips[id]?.trim();
    const bridge = tvBridge();
    if (!bridge || !ip) return;
    bridge.sendNow(ip, `RenToPlay - ${name}`, "Tes notifikasi dari kasir.", "warning");
    toast.success(`Tes dikirim ke ${ip}`);
  };

  return (
    <div className="space-y-2 rounded-lg bg-secondary/60 p-3 text-sm">
      <p className="font-medium">Notifikasi TV (aplikasi RenToPlay TV)</p>
      <p className="text-xs text-muted-foreground">
        {ready
          ? "Isi IP yang tampil di aplikasi RenToPlay TV. Pengingat 10 mnt, 2 mnt & habis tetap terkirim walau aplikasi kasir di latar belakang."
          : "Hanya bisa dari aplikasi Android kasir versi terbaru (bukan Chrome)."}
      </p>
      {stations.map((st) => (
        <div key={st.id} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate">{st.name}</span>
          <Input
            inputMode="decimal"
            placeholder="192.168.x.x"
            value={ips[st.id] ?? ""}
            onChange={(e) => setIps({ ...ips, [st.id]: e.target.value })}
            onBlur={(e) => setTvIp(st.id, e.target.value)}
            disabled={!ready}
            className="h-8"
          />
          <Button size="sm" variant="outline" onClick={() => test(st.id, st.name)} disabled={!ready || !ips[st.id]}>
            Tes
          </Button>
        </div>
      ))}
    </div>
  );
}
