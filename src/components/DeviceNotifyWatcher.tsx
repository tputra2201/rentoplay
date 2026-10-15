import { useEffect, useRef } from "react";

import { useBilling, remainingSeconds } from "@/lib/billing-store";
import { useAuth } from "@/lib/auth";
import { deviceNotifyEnabled, sendDeviceNotify } from "@/lib/device-notify";

const STAGES = [
  { id: "10", at: 600, msg: "Sisa waktu bermain 10 menit." },
  { id: "2", at: 120, msg: "Sisa waktu bermain 2 menit. Hubungi kasir untuk tambah waktu." },
  { id: "0", at: 0, msg: "Waktu bermain sudah habis. Terima kasih!" },
];

/** Kirim notifikasi HP saat sisa waktu 10 menit, 2 menit, dan habis. */
export function DeviceNotifyWatcher() {
  const { stations, now } = useBilling();
  const { session } = useAuth();
  const sent = useRef(new Set<string>());

  useEffect(() => {
    if (!session || !deviceNotifyEnabled()) return;
    for (const station of stations) {
      const s = station.session;
      if (!s || s.mode === "open") continue;
      const left = remainingSeconds(s, now);
      for (const stage of STAGES) {
        // Hanya saat baru melewati batas (jendela 60 detik), supaya tidak
        // muncul untuk sesi lama ketika aplikasi baru dibuka.
        if (left > stage.at || left <= stage.at - 60) continue;
        const key = `${station.id}:${s.startAt}:${stage.id}`;
        if (sent.current.has(key)) continue;
        sent.current.add(key);
        void sendDeviceNotify(`RenToPlay - ${station.name}`, stage.msg, key);
      }
    }
  }, [stations, now, session]);

  return null;
}
