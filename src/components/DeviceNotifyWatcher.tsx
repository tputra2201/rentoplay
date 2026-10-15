import { useEffect, useRef } from "react";

import { useBilling, remainingSeconds } from "@/lib/billing-store";
import { useAuth } from "@/lib/auth";
import { deviceNotifyEnabled, sendDeviceNotify } from "@/lib/device-notify";

// Diurutkan dari batas terkecil: yang pertama cocok = tahap terakhir yang dilewati.
const STAGES = [
  { id: "0", at: 0 },
  { id: "2", at: 120 },
  { id: "10", at: 600 },
];

// Notifikasi yang terlambat lebih dari ini (mis. HP lama tertidur) tidak dikirim.
const MAX_LATE_MS = 10 * 60 * 1000;

function messageFor(stageId: string, left: number) {
  if (stageId === "0") return "Waktu bermain sudah habis. Terima kasih!";
  const mins = Math.max(1, Math.ceil(left / 60));
  return stageId === "2"
    ? `Sisa waktu bermain ${mins} menit. Hubungi kasir untuk tambah waktu.`
    : `Sisa waktu bermain ${mins} menit.`;
}

/**
 * Kirim notifikasi HP saat sisa waktu 10 menit, 2 menit, dan habis.
 * Setiap kali waktu selesai berubah (tambah/kurang waktu), pengingat diulang
 * dari awal. Bila timer sempat tertahan (Chrome di latar belakang), tahap
 * yang terlewat tetap dikirim begitu timer berjalan lagi.
 */
export function DeviceNotifyWatcher() {
  const { stations, now } = useBilling();
  const { session } = useAuth();
  const mountedAt = useRef(Date.now());
  const track = useRef(new Map<string, { end: number; sent: Set<string> }>());

  useEffect(() => {
    if (!session || !deviceNotifyEnabled()) return;
    const seen = new Set<string>();
    for (const station of stations) {
      const s = station.session;
      if (!s || s.mode === "open" || s.pausedAt) continue;
      const left = remainingSeconds(s, now);
      const end = now + left * 1000;
      const sessionKey = `${station.id}:${s.startAt}`;
      seen.add(sessionKey);

      let entry = track.current.get(sessionKey);
      if (!entry || Math.abs(entry.end - end) > 30_000) {
        // Sesi baru atau waktu selesai berubah: mulai ulang pengingat.
        entry = { end, sent: new Set() };
        track.current.set(sessionKey, entry);
      }

      const stage = STAGES.find((st) => left <= st.at);
      if (!stage || entry.sent.has(stage.id)) continue;
      const crossedAt = end - stage.at * 1000;
      // Jangan kirim tahap yang sudah lewat sebelum aplikasi dibuka.
      if (crossedAt < mountedAt.current - 60_000 || now - crossedAt > MAX_LATE_MS) {
        entry.sent.add(stage.id);
        continue;
      }
      // Tahap yang lebih awal tidak perlu dikirim lagi.
      for (const st of STAGES) if (st.at >= stage.at) entry.sent.add(st.id);
      void sendDeviceNotify(
        `RenToPlay - ${station.name}`,
        messageFor(stage.id, left),
        `${sessionKey}:${Math.round(end / 1000)}:${stage.id}`,
      );
    }
    for (const key of track.current.keys()) if (!seen.has(key)) track.current.delete(key);
  }, [stations, now, session]);

  return null;
}
