/**
 * Notifikasi langsung ke aplikasi RenToPlay TV di setiap TV (jaringan lokal).
 * Hanya bisa dari aplikasi Android kasir: alarm dijadwalkan oleh Android
 * sehingga tetap berjalan walau aplikasi di latar belakang. IP per unit
 * disimpan di perangkat ini.
 */
const KEY = "rentoplay.tvIps";

type TvBridge = {
  sendNow: (ip: string, title: string, message: string, level: string) => void;
  schedule: (key: string, ip: string, name: string, endMs: number) => void;
  cancel: (key: string) => void;
};

declare global {
  interface Window {
    RenToPlayTV?: TvBridge;
  }
}

export function tvBridge(): TvBridge | null {
  return typeof window !== "undefined" && window.RenToPlayTV ? window.RenToPlayTV : null;
}

export function tvIps(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function setTvIp(stationId: string, ip: string) {
  const all = tvIps();
  if (ip.trim()) all[stationId] = ip.trim();
  else delete all[stationId];
  localStorage.setItem(KEY, JSON.stringify(all));
}
