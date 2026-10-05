/**
 * Cetak langsung ke printer thermal ESC/POS tanpa aplikasi pihak ketiga.
 *
 * Dua jalur langsung:
 * - Web Bluetooth (printer Bluetooth modern/BLE) — Chrome/Edge di Windows & Android.
 * - WebUSB (printer thermal USB) — Chrome/Edge di Windows & Android (OTG).
 *
 * Printer Bluetooth lama (Classic/SPP) tidak bisa dibuka browser; untuk jenis itu
 * pakai aplikasi Android RenToPlay atau sambungkan lewat USB.
 */

import { toast } from "sonner";
import { thermalCutText, usesThermalCutter, type PaperSize, type PrinterConfig } from "./printing";

export type DirectKind = "bluetooth" | "usb";

type SavedDevice = { kind: DirectKind; name: string; key: string };

type Writer = { name: string; write: (bytes: Uint8Array) => Promise<void> };

const STORE_PREFIX = "billing.printer-device.";

/** Karakteristik tulis yang umum dipakai printer thermal BLE. */
const BLE_SERVICES = [
  0xffe0, 0xff00, 0xffe5, 0xfff0, 0xae30, 0x18f0,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
] as (number | string)[];

export function bluetoothSupported() {
  return typeof navigator !== "undefined" && Boolean((navigator as Navigator).bluetooth);
}

export function usbSupported() {
  return typeof navigator !== "undefined" && Boolean((navigator as Navigator).usb);
}

export function savedDevice(printerId: string): SavedDevice | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE_PREFIX + printerId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedDevice;
    return parsed && parsed.key ? parsed : null;
  } catch {
    return null;
  }
}

function rememberDevice(printerId: string, device: SavedDevice) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORE_PREFIX + printerId, JSON.stringify(device));
}

export function forgetDevice(printerId: string) {
  forgetActive(printerId);
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORE_PREFIX + printerId);
}

/* ------------------------------- Bluetooth ------------------------------- */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Printer BLE kecil sering memutus koneksi; sambung ulang beberapa kali. */
async function connectGatt(device: BluetoothDevice) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (!device.gatt) break;
      if (!device.gatt.connected) await device.gatt.connect();
      // Beri printer waktu menyiapkan service sebelum ditanya.
      await wait(attempt === 0 ? 300 : 600);
      const services = await device.gatt.getPrimaryServices();
      for (const service of services) {
        const chars = await service.getCharacteristics().catch(() => []);
        for (const ch of chars) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
        }
      }
      throw new Error("no-write-characteristic");
    } catch (error) {
      lastError = error;
      try {
        device.gatt?.disconnect();
      } catch {
        /* diabaikan */
      }
      await wait(500);
    }
  }
  if (lastError instanceof Error && lastError.message === "no-write-characteristic") {
    throw new Error(
      "Printer ini tidak menyediakan jalur tulis Bluetooth (kemungkinan Bluetooth lama/SPP). Gunakan USB atau aplikasi Android.",
    );
  }
  throw new Error(
    `Printer ${device.name ?? "Bluetooth"} memutus sambungan. Matikan lalu nyalakan printer, dekatkan perangkat, atau gunakan USB.`,
  );
}

async function bleWriter(device: BluetoothDevice): Promise<Writer> {
  let ch = await connectGatt(device);
  const chunk = 100;
  return {
    name: device.name ?? "Printer Bluetooth",
    write: async (bytes) => {
      for (let i = 0; i < bytes.length; i += chunk) {
        const part = bytes.slice(i, i + chunk);
        try {
          if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(part);
          else await ch.writeValueWithResponse(part);
        } catch {
          // Printer terputus di tengah cetak: sambung lagi, lanjutkan potongan ini.
          ch = await connectGatt(device);
          if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(part);
          else await ch.writeValueWithResponse(part);
        }
        await wait(25);
      }
    },
  };
}

async function pickBluetooth(): Promise<{ device: BluetoothDevice; writer: Writer }> {
  if (!bluetoothSupported())
    throw new Error("Browser ini belum mendukung Bluetooth langsung. Gunakan Chrome atau Edge.");
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_SERVICES,
  });
  const writer = await bleWriter(device);
  return { device, writer };
}

async function reopenBluetooth(key: string): Promise<Writer | null> {
  const nav = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };
  if (!nav.getDevices) return null;
  const devices = await nav.getDevices().catch(() => [] as BluetoothDevice[]);
  const found = devices.find((d) => d.id === key);
  if (!found) return null;
  return bleWriter(found);
}

/* ---------------------------------- USB ---------------------------------- */

async function usbWriter(device: USBDevice): Promise<Writer> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const interfaces = device.configuration?.interfaces ?? [];
  for (const iface of interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (!out) continue;
      try {
        await device.claimInterface(iface.interfaceNumber);
      } catch {
        continue;
      }
      if (alt.alternateSetting !== 0)
        await device.selectAlternateInterface(iface.interfaceNumber, alt.alternateSetting);
      return {
        name: device.productName ?? "Printer USB",
        write: async (bytes) => {
          await device.transferOut(out.endpointNumber, bytes as unknown as BufferSource);
        },
      };
    }
  }
  throw new Error("Printer USB ini tidak menyediakan jalur cetak yang bisa dipakai.");
}

async function pickUsb(): Promise<{ device: USBDevice; writer: Writer }> {
  if (!usbSupported())
    throw new Error("Browser ini belum mendukung printer USB langsung. Gunakan Chrome atau Edge.");
  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: 7 }, { classCode: 0xff }],
  });
  const writer = await usbWriter(device);
  return { device, writer };
}

async function reopenUsb(key: string): Promise<Writer | null> {
  const devices = await navigator.usb.getDevices().catch(() => [] as USBDevice[]);
  const found = devices.find((d) => usbKey(d) === key);
  if (!found) return null;
  return usbWriter(found);
}

const usbKey = (d: USBDevice) => `${d.vendorId}:${d.productId}:${d.serialNumber ?? ""}`;

/* --------------------------- Pilih & simpan printer --------------------------- */

/** Printer yang sudah dipilih, diingat selama aplikasi terbuka. */
const active = new Map<string, { kind: DirectKind; writer: Writer }>();

/** Apakah printer sudah siap dipakai tanpa dialog pemilihan lagi. */
export function printerReady(printerId: string) {
  return active.has(printerId);
}

function forgetActive(printerId: string) {
  active.delete(printerId);
}

function keepBluetooth(printerId: string, device: BluetoothDevice, writer: Writer) {
  active.set(printerId, { kind: "bluetooth", writer });
  device.addEventListener("gattserverdisconnected", () => {
    // Biarkan tetap tersimpan: writer akan menyambung ulang sendiri saat mencetak.
  });
}

/** Buka dialog pemilihan printer, lalu simpan pilihannya untuk perangkat ini. */
export async function scanPrinter(printerId: string, kind: DirectKind): Promise<SavedDevice> {
  if (kind === "bluetooth") {
    const { device, writer } = await pickBluetooth();
    const saved: SavedDevice = {
      kind,
      name: device.name ?? "Printer Bluetooth",
      key: device.id,
    };
    rememberDevice(printerId, saved);
    keepBluetooth(printerId, device, writer);
    return saved;
  }
  const { device, writer } = await pickUsb();
  const saved: SavedDevice = { kind, name: device.productName ?? "Printer USB", key: usbKey(device) };
  rememberDevice(printerId, saved);
  active.set(printerId, { kind, writer });
  return saved;
}

async function writerFor(printer: PrinterConfig, kind: DirectKind): Promise<Writer> {
  const cached = active.get(printer.id);
  if (cached && cached.kind === kind) return cached.writer;

  const saved = savedDevice(printer.id);
  if (saved && saved.kind === kind) {
    const writer = kind === "bluetooth" ? await reopenBluetooth(saved.key) : await reopenUsb(saved.key);
    if (writer) {
      active.set(printer.id, { kind, writer });
      return writer;
    }
  }
  const picked = kind === "bluetooth" ? await pickBluetooth() : await pickUsb();
  const key =
    kind === "bluetooth"
      ? (picked.device as BluetoothDevice).id
      : usbKey(picked.device as USBDevice);
  rememberDevice(printer.id, { kind, name: picked.writer.name, key });
  if (kind === "bluetooth") keepBluetooth(printer.id, picked.device as BluetoothDevice, picked.writer);
  else active.set(printer.id, { kind, writer: picked.writer });
  return picked.writer;
}

/* --------------------------------- ESC/POS --------------------------------- */

const ESC = 0x1b;
const GS = 0x1d;

/** Ubah teks jadi byte ESC/POS lengkap dengan inisialisasi dan potong kertas. */
export function escposBytes(text: string, opts: { bold?: boolean; cut?: boolean } = {}) {
  const head = [
    ESC,
    0x40, // init
    ESC,
    0x74,
    0x00, // code page 437
    ESC,
    0x61,
    0x00, // rata kiri
    ESC,
    0x45,
    opts.bold ? 1 : 0,
  ];
  const cutting = opts.cut !== false;
  const body = latin(cutting ? text.replace(/[\r\n]+$/, "") : text.endsWith("\n") ? text : `${text}\n`);
  const tail = cutting
    ? Array.from(thermalCutText(""), (ch) => ch.charCodeAt(0))
    : [0x0a, 0x0a, 0x0a];
  return new Uint8Array([...head, ...body, ...tail]);
}

/** Sederhanakan huruf beraksen agar aman untuk code page printer. */
function latin(text: string) {
  const clean = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x0a\x20-\x7e]/g, " ");
  const out: number[] = [];
  for (const ch of clean) out.push(ch.charCodeAt(0));
  return out;
}

/**
 * Kirim teks ESC/POS langsung ke printer.
 * Mengembalikan true bila berhasil; kegagalan ditampilkan sebagai pesan jelas.
 */
export async function printDirect(printer: PrinterConfig, kind: DirectKind, text: string) {
  try {
    const writer = await writerFor(printer, kind);
    await writer.write(escposBytes(text, { bold: printer.bold, cut: usesThermalCutter(printer) }));
    toast.success(`Cetak dikirim ke ${writer.name}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel|chooser|No device selected|user gesture/i.test(message)) {
      toast.error("Pemilihan printer dibatalkan.");
      return false;
    }
    toast.error(
      `Gagal mencetak: ${message} Pastikan printer menyala dan sudah dipasangkan di perangkat ini.`,
    );
    return false;
  }
}

/** Lebar karakter untuk tiap ukuran kertas. */
export const DIRECT_WIDTH: Record<PaperSize, number> = {
  "40mm": 24,
  "58mm": 32,
  "80mm": 42,
  a4: 60,
};
