import { tvIps } from "./tv-notify";

const KEY = "rentoplay.tvControl";
const GLOBAL_KEY = "rentoplay.tvControlGlobal";
export type TvControlSettings = { mac: string; token: string; pin: string; unlockPattern: string; welcomeTitle: string; welcomeMessage: string; splashOnWake: boolean };
export const DEFAULT_TV_CONTROL: TvControlSettings = { mac: "", token: "", pin: "", unlockPattern: "", welcomeTitle: "Selamat Datang", welcomeMessage: "", splashOnWake: false };
/** Pengaturan yang berlaku sama untuk semua TV di store: pola remote, sambutan, splash. */
export type TvGlobalSettings = { unlockPattern: string; welcomeTitle: string; welcomeMessage: string; splashOnWake: boolean; splashVideoUrl: string; splashVideoMuted: boolean };
export const DEFAULT_TV_GLOBAL: TvGlobalSettings = { unlockPattern: "UUDC", welcomeTitle: "Selamat Datang", welcomeMessage: "", splashOnWake: true, splashVideoUrl: "", splashVideoMuted: true };
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
export function tvGlobalSettings(): TvGlobalSettings {
  if (typeof window === "undefined") return { ...DEFAULT_TV_GLOBAL };
  try { return { ...DEFAULT_TV_GLOBAL, ...JSON.parse(localStorage.getItem(GLOBAL_KEY) || "{}") }; }
  catch { return { ...DEFAULT_TV_GLOBAL }; }
}
export function saveTvGlobalSettings(value: TvGlobalSettings) {
  localStorage.setItem(GLOBAL_KEY, JSON.stringify(value));
}
export function validRemotePin(pin: string): boolean { return /^[0-9]{4,6}$/.test(pin); }
export function validRemotePattern(pattern: string): boolean { return /^[UDLRC]{4,6}$/.test(pattern); }
export function tvControlDocument(settings: TvControlSettings, action: string, data: Record<string, unknown> = {}) {
  const global = tvGlobalSettings();
  if (action === "configure" && !validRemotePattern(global.unlockPattern)) throw new Error("Pola remote harus 4–6 tombol arah/OK.");
  return JSON.stringify({ ...data, action, token: settings.token, ...(action === "configure" ? {
    unlockPattern: global.unlockPattern, title: global.welcomeTitle, message: global.welcomeMessage, enabled: global.splashOnWake,
    videoUrl: global.splashVideoUrl, videoMuted: global.splashVideoMuted,
  } : {}) });
}
function sendControlRequest(bridge: NonNullable<Window["RenToPlayControl"]>, ip: string, document: string): Promise<TvControlResult> {
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
    try { bridge.request(requestId, ip, document); }
    catch (e) { clearTimeout(timeout); window.removeEventListener("rentoplay:tv-control-result", finish); reject(e); }
  });
}
export async function controlTv(id: string, action: string, data: Record<string, unknown> = {}): Promise<TvControlResult> {
  const bridge = typeof window === "undefined" ? undefined : window.RenToPlayControl;
  if (!bridge) throw new Error("Pasang APK kasir terbaru untuk kontrol TV.");
  const ip = tvIps()[id]?.trim();
  if (!ip) throw new Error("Isi IP TV di Setup Station.");
  const settings = tvControlSettings(id);
  if (action !== "wake" && !settings.token.trim()) throw new Error("Isi kode kontrol dari aplikasi TV di Setup Station.");
  if (action === "wake") {
    // Perintah bangun utama dikirim ke Companion lewat HTTP karena paket WoL
    // sering diblokir router Wi-Fi; WoL tetap dikirim sebagai cadangan.
    const wol = new Promise<TvControlResult>((resolve, reject) => {
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
      try { bridge.wake(requestId, settings.mac, ip); }
      catch (e) { clearTimeout(timeout); window.removeEventListener("rentoplay:tv-control-result", finish); reject(e); }
    });
    if (settings.token.trim()) {
      // Konfirmasi nyata dari Companion: jika TV merespons, selesai lebih cepat
      // tanpa menunggu hasil WoL.
      const http = sendControlRequest(bridge, ip, JSON.stringify({ action: "wake", token: settings.token }));
      return Promise.any([http, wol]).catch(() => wol);
    }
    return wol;
  }
  return sendControlRequest(bridge, ip, tvControlDocument(settings, action, data));
}