/**
 * Notifikasi langsung ke aplikasi RenToPlay TV di setiap station (jaringan lokal).
 * Hanya bisa dari aplikasi Android kasir: alarm dijadwalkan oleh Android
 * sehingga tetap berjalan walau aplikasi di latar belakang. IP per station
 * dan pengaturan pesan disimpan di perangkat ini.
 */
const KEY = "rentoplay.tvIps";
const CFG_KEY = "rentoplay.tvNotifyConfig";

type TvBridge = {
  sendNow: (ip: string, title: string, message: string, level: string) => void;
  schedule: (key: string, ip: string, name: string, endMs: number) => void;
  cancel: (key: string) => void;
  /** APK kasir versi baru: jadwal dengan pesan & menit kustom. */
  scheduleJson?: (key: string, ip: string, json: string) => void;
  /** APK kasir versi baru: kirim JSON bebas (mis. layar penuh). */
  sendJson?: (ip: string, json: string) => void;
  /** APK kasir versi baru: lepas layar penuh di TV. */
  dismiss?: (ip: string) => void;
};

declare global {
  interface Window {
    RenToPlayTV?: TvBridge;
  }
}

export type TvStage = { minutes: number; title?: string; message: string; messageLines?: string[] };
export type TvNotifyConfig = {
  stages: TvStage[];
  endTitle: string;
  endMessage: string;
  endMessageLines?: string[];
  /** Saat habis: layar penuh semi transparan + logo, tetap tampil sampai dilepas kasir. */
  fullscreenEnd: boolean;
};

export const DEFAULT_TV_CONFIG: TvNotifyConfig = {
  stages: [
    { minutes: 10, message: "Sisa waktu bermain 10 menit." },
    { minutes: 5, message: "Sisa waktu bermain 5 menit." },
    { minutes: 2, message: "Sisa waktu bermain 2 menit. Hubungi kasir untuk tambah waktu." },
  ],
  endTitle: "WAKTU HABIS",
  endMessage: "Waktu bermain sudah habis. Silakan hubungi kasir. Terima kasih!",
  endMessageLines: ["Waktu bermain sudah habis.", "Silakan hubungi kasir.", "Terima kasih!"],
  fullscreenEnd: true,
};

export function tvBridge(): TvBridge | null {
  return typeof window !== "undefined" && window.RenToPlayTV ? window.RenToPlayTV : null;
}

/** Release only dismisses the TV overlay; it never settles or ends a rental. */
export function canReleaseStation(mode: string | undefined, secondsLeft: number): boolean {
  return mode !== undefined && mode !== "open" && secondsLeft <= 0;
}

export function releaseStationScreen(stationId: string): "sent" | "no-bridge" | "no-ip" {
  const bridge = tvBridge();
  if (!bridge?.dismiss) return "no-bridge";
  const ip = tvIps()[stationId]?.trim();
  if (!ip) return "no-ip";
  bridge.dismiss(ip);
  return "sent";
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

export function tvConfig(): TvNotifyConfig {
  if (typeof window === "undefined") return DEFAULT_TV_CONFIG;
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || "null") as Partial<TvNotifyConfig> | null;
    return raw ? { ...DEFAULT_TV_CONFIG, ...raw, endMessageLines: raw.endMessageLines ?? messageLines(raw.endMessage ?? DEFAULT_TV_CONFIG.endMessage) } : DEFAULT_TV_CONFIG;
  } catch {
    return DEFAULT_TV_CONFIG;
  }
}

export function saveTvConfig(cfg: TvNotifyConfig) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function messageLines(message: string): string[] {
  const lines = message.split("\n");
  return [lines[0] ?? "", lines[1] ?? "", lines.slice(2).join(" ")];
}

export function tvMessage(message: string, lines?: string[]): string {
  return lines ? lines.slice(0, 3).join("\n") : message;
}

/** Isi jadwal untuk APK kasir. `{menit}` di pesan diganti angka menit tahap itu. */
export function tvSchedulePayload(
  cfg: TvNotifyConfig,
  stationName: string,
  endMs: number,
  logo: string,
  store: string,
) {
  const stages = cfg.stages
    .filter((s) => s.minutes > 0)
    .map((s) => ({
      sec: Math.round(s.minutes * 60),
      title: s.title?.replace(/\{menit\}/g, String(s.minutes)) ?? `${store || "RenToPlay"} - ${stationName}`,
      message: tvMessage(s.message, s.messageLines).replace(/\{menit\}/g, String(s.minutes)),
      level: s.minutes <= 2 ? "warning" : "info",
    }));
  stages.push({ sec: 0, title: cfg.endTitle, message: tvMessage(cfg.endMessage, cfg.endMessageLines), level: "danger" });
  return JSON.stringify({
    endMs,
    title: `${store || "RenToPlay"} - ${stationName}`,
    endTitle: cfg.endTitle,
    block: cfg.fullscreenEnd,
    logo,
    stages,
  });
}
