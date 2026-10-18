import { tvIps } from "./tv-notify";

const KEY = "rentoplay.tvControl";
export type TvControlSettings = { mac: string; token: string; pin: string; welcomeTitle: string; welcomeMessage: string; splashOnWake: boolean };
export const DEFAULT_TV_CONTROL: TvControlSettings = { mac: "", token: "", pin: "", welcomeTitle: "Selamat Datang", welcomeMessage: "", splashOnWake: false };
export type TvControlResult = { ok: boolean; error?: string; volume?: number; inputs?: { id: string; label: string }[] };
declare global {
  interface Window { RenToPlayControl?: { request: (id: string, ip: string, json: string) => void; wake: (id: string, mac: string, ip: string) => void } }
}
export function tvControlSettings(id: string): TvControlSettings {
  if (typeof window === "undefined") return { ...DEFAULT_TV_CONTROL };
  try { return { ...DEFAULT_TV_CONTROL, ...JSON.parse(localStorage.getItem(KEY) || "{}")[id] }; }
  catch { return { ...DEFAULT_TV_CONTROL }; }
}
export function saveTvControlSettings(id: string, value: TvControlSettings) {
  const all = JSON.parse(localStorage.getItem(KEY) || "{}");
  localStorage.setItem(KEY, JSON.stringify({ ...all, [id]: value }));
}
export function validRemotePin(pin: string): boolean { return /^[0-9]{4,6}$/.test(pin); }
export function tvControlDocument(settings: TvControlSettings, action: string, data: Record<string, unknown> = {}) {
  if (action === "configure" && !validRemotePin(settings.pin)) throw new Error("PIN harus 4–6 angka (0–9).");
  return JSON.stringify({ ...data, action, token: settings.token, ...(action === "configure" ? {
    pin: settings.pin, title: settings.welcomeTitle, message: settings.welcomeMessage, enabled: settings.splashOnWake,
  } : {}) });
}
export async function controlTv(id: string, action: string, data: Record<string, unknown> = {}): Promise<TvControlResult> {
  const bridge = typeof window === "undefined" ? undefined : window.RenToPlayControl;
  if (!bridge) throw new Error("Pasang APK kasir terbaru untuk kontrol TV.");
  const ip = tvIps()[id]?.trim();
  if (!ip) throw new Error("Isi IP TV di Setup Station.");
  const settings = tvControlSettings(id);
  if (action !== "wake" && !settings.token.trim()) throw new Error("Isi kode kontrol dari aplikasi TV di Setup Station.");
  const document = action === "wake" ? "" : tvControlDocument(settings, action, data);
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const finish = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.id !== requestId) return;
      window.removeEventListener("rentoplay:tv-control-result", finish);
      clearTimeout(timeout);
      if (detail.result?.ok) resolve(detail.result);
      else reject(new Error(detail.result?.error || "TV tidak merespons."));
    };
    const timeout = setTimeout(() => { window.removeEventListener("rentoplay:tv-control-result", finish); reject(new Error("TV tidak merespons. Periksa IP dan koneksi Wi-Fi.")); }, 15000);
    window.addEventListener("rentoplay:tv-control-result", finish);
    try {
      if (action === "wake") bridge.wake(requestId, settings.mac, ip);
      else bridge.request(requestId, ip, document);
    } catch (e) { clearTimeout(timeout); window.removeEventListener("rentoplay:tv-control-result", finish); reject(e); }
  });
}