/**
 * Notifikasi sistem perangkat (bilah notifikasi HP). Aplikasi penerus seperti
 * NotifyTV membaca notifikasi ini lalu menampilkannya di layar TV.
 * Pengaturan aktif/tidak disimpan per perangkat.
 */
const KEY = "rentoplay.deviceNotify";

export function deviceNotifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function deviceNotifyEnabled() {
  if (!deviceNotifySupported()) return false;
  return localStorage.getItem(KEY) === "1" && Notification.permission === "granted";
}

export function setDeviceNotifyFlag(on: boolean) {
  localStorage.setItem(KEY, on ? "1" : "0");
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/notify-sw.js", { scope: "/notify-sw/" });
  } catch {
    return null;
  }
}

/** Minta izin lalu aktifkan. Mengembalikan true bila izin diberikan. */
export async function enableDeviceNotify() {
  if (!deviceNotifySupported()) return false;
  const perm =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  const ok = perm === "granted";
  setDeviceNotifyFlag(ok);
  if (ok) await registration();
  return ok;
}

export async function sendDeviceNotify(title: string, body: string, tag?: string) {
  if (!deviceNotifySupported() || Notification.permission !== "granted") return false;
  const options: NotificationOptions = { body, tag, icon: "/icon-192.png", badge: "/icon-192.png" };
  // Chrome Android hanya mengizinkan notifikasi lewat service worker.
  const reg = await registration();
  if (reg) {
    try {
      await navigator.serviceWorker.ready.catch(() => null);
      await reg.showNotification(title, options);
      return true;
    } catch {
      /* lanjut ke cara biasa */
    }
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
