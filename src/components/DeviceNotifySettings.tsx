import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  deviceNotifyEnabled,
  deviceNotifySupported,
  enableDeviceNotify,
  sendDeviceNotify,
  setDeviceNotifyFlag,
} from "@/lib/device-notify";

export function DeviceNotifySettings() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(deviceNotifySupported());
    setOn(deviceNotifyEnabled());
  }, []);

  const toggle = async (next: boolean) => {
    if (!next) {
      setDeviceNotifyFlag(false);
      setOn(false);
      return;
    }
    const ok = await enableDeviceNotify();
    setOn(ok);
    if (!ok) toast.error("Izin notifikasi ditolak. Izinkan notifikasi di pengaturan HP.");
  };

  const test = async () => {
    const ok = (await enableDeviceNotify()) &&
      (await sendDeviceNotify("RenToPlay - Tes", "Tes notifikasi dari kasir ke TV.", "rtp-test"));
    setOn(ok);
    if (ok) toast.success("Notifikasi tes dikirim.");
    else toast.error("Notifikasi tidak bisa dikirim di perangkat ini.");
  };

  return (
    <div className="space-y-2 rounded-lg bg-secondary/60 p-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        <span>Notifikasi HP sisa waktu 10 mnt, 2 mnt & habis (diteruskan ke TV)</span>
        <Switch checked={on} onCheckedChange={toggle} disabled={!supported} aria-label="Notifikasi HP" />
      </label>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {supported
            ? "Berlaku di perangkat ini saja. Aktifkan di HP yang terhubung ke NotifyTV."
            : "Perangkat/aplikasi ini tidak mendukung notifikasi. Buka RenToPlay lewat Chrome."}
        </p>
        <Button size="sm" variant="outline" onClick={test} disabled={!supported}>
          Tes Notifikasi
        </Button>
      </div>
    </div>
  );
}
