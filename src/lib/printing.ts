/**
 * Pengaturan & pencetakan dokumen (struk, invoice, label dapur/bar, laporan).
 *
 * Pencetakan memakai dialog cetak bawaan sistem: dokumen dirakit menjadi HTML
 * dengan ukuran kertas yang tepat (40mm / 80mm / A4), lalu dikirim ke printer
 * yang dipilih pengguna di dialog. Cara ini bekerja di semua perangkat,
 * termasuk printer thermal Bluetooth yang sudah dipasang di sistem operasi
 * maupun printer inkjet A4 lewat USB.
 */

export type PrinterRole = "receipt" | "invoice" | "kitchen" | "bar" | "report";
export type PaperSize = "40mm" | "58mm" | "80mm" | "a4";
/**
 * Cara mengirim dokumen ke printer.
 * - "system": dialog cetak bawaan perangkat (Windows, Mac, iOS, printer A4).
 * - "bluetooth": langsung ke printer thermal Bluetooth dari aplikasi ini.
 * - "usb": langsung ke printer thermal USB dari aplikasi ini.
 * - "rawbt": aplikasi RawBT di Android untuk printer Bluetooth lama (Classic/SPP).
 * - "android": aplikasi Android RenToPlay untuk printer Bluetooth lama (Classic/SPP).
 */
export type PrintMode = "system" | "bluetooth" | "usb" | "rawbt" | "android";

/** Informasi yang ditampilkan pada satu label dapur / bar. */
export type LabelLayout = {
  showHeading: boolean;
  showSeparators: boolean;
  showItemName: boolean;
  showQuantity: boolean;
  showNotes: boolean;
  showSource: boolean;
  showCustomer: boolean;
  showTimestamp: boolean;
};

export type PrinterConfig = {
  id: string;
  name: string;
  role: PrinterRole;
  paper: PaperSize;
  /** Cara pengiriman dokumen; default dialog cetak sistem. */
  mode?: PrintMode;
  /** Alamat perangkat Bluetooth yang dipasangkan, untuk aplikasi Android khusus. */
  bluetoothAddress?: string;
  /** Ukuran huruf (pt). */
  fontSizePt: number;
  /** Huruf tebal. */
  bold: boolean;
  /** Margin kertas (mm). */
  marginMm: number;
  /** Jumlah salinan setiap kali mencetak. */
  copies: number;
  active: boolean;
  /** Pilihan isi label; nilai lama tanpa pengaturan memakai layout ringkas bawaan. */
  labelLayout?: Partial<LabelLayout>;
  note?: string;
  sort?: number;
};

/** Layout dokumen struk / invoice yang bisa diatur pengguna. */
export type DocLayout = {
  headerText: string;
  footerText: string;
  marginMm: number;
  fontSizePt: number;
  bold: boolean;
  showStoreInfo: boolean;
  showCustomer: boolean;
  showItems: boolean;
  showPayment: boolean;
};

export const PRINTER_ROLE_LABEL: Record<PrinterRole, string> = {
  receipt: "Receipt (struk)",
  invoice: "Invoice",
  kitchen: "Kitchen Printer (label makanan)",
  bar: "Bar Printer (label minuman)",
  report: "Report Printer (laporan)",
};

export const PAPER_LABEL: Record<PaperSize, string> = {
  "40mm": "Thermal 40 mm",
  "58mm": "Thermal 58 mm",
  "80mm": "Thermal 80 mm",
  a4: "A4 (inkjet / USB)",
};

export const PAPER_OPTIONS: PaperSize[] = ["40mm", "58mm", "80mm", "a4"];
export const PRINTER_ROLES: PrinterRole[] = ["receipt", "invoice", "kitchen", "bar", "report"];

export const PRINT_MODE_LABEL: Record<PrintMode, string> = {
  system: "Dialog cetak perangkat (printer A4)",
  bluetooth: "Langsung — printer Bluetooth",
  usb: "Langsung — printer USB",
  rawbt: "RawBT (printer Bluetooth lama)",
  android: "Aplikasi Android RenToPlay (Bluetooth lama)",
};
export const PRINT_MODES: PrintMode[] = ["system", "bluetooth", "usb", "rawbt", "android"];

/** Jumlah huruf per baris untuk cetak teks polos ESC/POS. */
export const CHARS_PER_LINE: Record<PaperSize, number> = {
  "40mm": 24,
  "58mm": 32,
  "80mm": 42,
  a4: 60,
};

export const defaultLabelLayout: LabelLayout = {
  showHeading: false,
  showSeparators: false,
  showItemName: true,
  showQuantity: true,
  showNotes: false,
  showSource: false,
  showCustomer: true,
  showTimestamp: true,
};

export function labelLayout(printer: PrinterConfig): LabelLayout {
  return { ...defaultLabelLayout, ...(printer.labelLayout ?? {}) };
}

/**
 * Cara mencetak & printer Bluetooth terpilih adalah milik tiap perangkat:
 * disimpan di perangkat ini saja, sehingga sinkronisasi dari perangkat lain
 * tidak pernah mengembalikannya ke pengaturan awal.
 */
export type DevicePrinterPref = { mode?: PrintMode | undefined; bluetoothAddress?: string | undefined };
const DEVICE_PREF_KEY = "billing.printer-device-prefs-v1";

export function loadDevicePrinterPrefs(): Record<string, DevicePrinterPref> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DEVICE_PREF_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, DevicePrinterPref>) : {};
  } catch {
    return {};
  }
}

export function saveDevicePrinterPrefs(prefs: Record<string, DevicePrinterPref>) {
  try {
    localStorage.setItem(DEVICE_PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* penyimpanan penuh */
  }
}

export function withDevicePrinterPrefs(
  printers: PrinterConfig[],
  prefs: Record<string, DevicePrinterPref>,
): PrinterConfig[] {
  return printers.map((p) => {
    const pref = prefs[p.id];
    if (!pref) return p;
    return {
      ...p,
      ...(pref.mode !== undefined ? { mode: pref.mode } : {}),
      ...(pref.bluetoothAddress !== undefined ? { bluetoothAddress: pref.bluetoothAddress } : {}),
    };
  });
}

export function printMode(printer: PrinterConfig): PrintMode {
  if (printer.mode === "android") return isAndroidPrintAvailable() ? "android" : "system";
  if (printer.mode === "rawbt" || printer.mode === "bluetooth" || printer.mode === "usb")
    return printer.mode;
  return "system";
}

type AndroidPrinter = { name: string; address: string };

declare global {
  interface Window {
    BillingAndroid?: {
      getPairedPrinters: () => string;
      printBase64: (address: string, payload: string) => void;
    };
  }
}

export function isAndroidPrintAvailable() {
  return typeof window !== "undefined" && Boolean(window.BillingAndroid);
}

export function pairedAndroidPrinters(): AndroidPrinter[] {
  if (!isAndroidPrintAvailable()) return [];
  try {
    const value = window.BillingAndroid?.getPairedPrinters();
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AndroidPrinter =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as AndroidPrinter).name === "string" &&
        typeof (item as AndroidPrinter).address === "string",
    );
  } catch {
    return [];
  }
}

/** Baris kiri-kanan rata untuk cetak teks polos. */
export function textRow(left: string, right: string, width: number) {
  const l = String(left ?? "");
  const r = String(right ?? "");
  const space = Math.max(1, width - l.length - r.length);
  if (l.length + r.length + 1 > width) return `${l}\n${" ".repeat(Math.max(0, width - r.length))}${r}`;
  return `${l}${" ".repeat(space)}${r}`;
}

export function textCenter(value: string, width: number) {
  const v = String(value ?? "").slice(0, width);
  const pad = Math.max(0, Math.floor((width - v.length) / 2));
  return `${" ".repeat(pad)}${v}`;
}

export function textSep(width: number) {
  return "-".repeat(width);
}

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Kirim teks ESC/POS ke aplikasi RawBT (Android) untuk printer Bluetooth lama.
 * Payload dikirim sebagai base64 tanpa pengkodean ganda agar tidak "wrong base64".
 */
export function printViaRawBt(printer: PrinterConfig, text: string) {
  if (typeof window === "undefined") return false;
  const body = text.endsWith("\n") ? text : `${text}\n`;
  window.location.href = `rawbt:base64,${toBase64(`${body}\n\n\n`)}`;
  return true;
}

/** Kirim teks ESC/POS melalui jembatan Bluetooth aplikasi Android khusus. */
export function printViaAndroid(printer: PrinterConfig, text: string) {
  if (typeof window === "undefined") return false;
  if (!window.BillingAndroid) {
    window.dispatchEvent(
      new CustomEvent("billing-android-print", {
        detail: { ok: false, message: "Buka halaman ini dari aplikasi Android Billing Rental PS" },
      }),
    );
    return false;
  }
  if (!printer.bluetoothAddress) {
    window.dispatchEvent(
      new CustomEvent("billing-android-print", {
        detail: { ok: false, message: "Pilih printer Bluetooth di menu Printer" },
      }),
    );
    return false;
  }
  window.BillingAndroid.printBase64(printer.bluetoothAddress, toBase64(text));
  return true;
}

/** Ulangi teks sesuai jumlah salinan printer. */
export function textWithCopies(printer: PrinterConfig, body: string) {
  const copies = Math.min(5, Math.max(1, Math.round(printer.copies || 1)));
  return Array.from({ length: copies }, () => body).join("\n\n");
}

export const defaultReceiptLayout: DocLayout = {
  headerText: "",
  footerText: "Terima kasih atas kunjungan Anda",
  marginMm: 3,
  fontSizePt: 9,
  bold: false,
  showStoreInfo: true,
  showCustomer: true,
  showItems: true,
  showPayment: true,
};

export const defaultInvoiceLayout: DocLayout = {
  ...defaultReceiptLayout,
  footerText: "Invoice ini sah tanpa tanda tangan.",
  fontSizePt: 10,
};

export const defaultPrinters: PrinterConfig[] = [
  {
    id: "prt-receipt",
    name: "Printer Struk",
    role: "receipt",
    paper: "80mm",
    fontSizePt: 9,
    bold: false,
    marginMm: 3,
    copies: 1,
    active: true,
    sort: 1,
  },
  {
    id: "prt-invoice",
    name: "Printer Invoice",
    role: "invoice",
    paper: "80mm",
    fontSizePt: 10,
    bold: false,
    marginMm: 4,
    copies: 1,
    active: true,
    sort: 2,
  },
  {
    id: "prt-kitchen",
    name: "Kitchen Printer",
    role: "kitchen",
    paper: "40mm",
    fontSizePt: 9,
    bold: true,
    marginMm: 2,
    copies: 1,
    active: true,
    sort: 3,
  },
  {
    id: "prt-bar",
    name: "Bar Printer",
    role: "bar",
    paper: "40mm",
    fontSizePt: 9,
    bold: true,
    marginMm: 2,
    copies: 1,
    active: true,
    sort: 4,
  },
  {
    id: "prt-report",
    name: "Report Printer",
    role: "report",
    paper: "a4",
    fontSizePt: 10,
    bold: false,
    marginMm: 10,
    copies: 1,
    active: true,
    sort: 5,
  },
];

export function printerFor(
  printers: PrinterConfig[],
  role: PrinterRole,
  id?: string,
): PrinterConfig | undefined {
  if (id) {
    const found = printers.find((p) => p.id === id && p.active);
    if (found) return found;
  }
  return printers.find((p) => p.role === role && p.active);
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const PAPER_WIDTH_MM: Record<PaperSize, number | null> = {
  "40mm": 40,
  "58mm": 58,
  "80mm": 80,
  a4: null,
};

/** CSS dasar untuk satu jenis kertas. */
export function paperCss(printer: PrinterConfig) {
  const width = PAPER_WIDTH_MM[printer.paper];
  const margin = Math.max(0, printer.marginMm);
  const page =
    width === null
      ? `@page { size: A4; margin: ${margin}mm; }`
      : `@page { size: ${width}mm auto; margin: ${margin}mm; }`;
  const bodyWidth = width === null ? "auto" : `${width - margin * 2}mm`;
  return `
    ${page}
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: ${bodyWidth};
      font-family: "Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif;
      font-size: ${printer.fontSizePt}pt;
      font-weight: ${printer.bold ? 700 : 400};
      color: #000;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .big { font-size: ${printer.fontSizePt + 3}pt; }
    .muted { font-size: ${Math.max(6, printer.fontSizePt - 1)}pt; }
    .sep { border-top: 1px dashed #000; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 2px 3px; text-align: left; vertical-align: top; }
    .page-break { page-break-after: always; }
    .page-break:last-child { page-break-after: auto; }
  `;
}

/** Kirim satu dokumen HTML ke dialog cetak sistem. */
export function printHtml(title: string, css: string, body: string) {
  if (typeof document === "undefined") return;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      title,
    )}</title><style>${css}</style></head><body>${body}</body></html>`,
  );
  doc.close();

  const run = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 2000);
    }
  };
  // Beri waktu browser merender isi dokumen sebelum dialog cetak dibuka.
  window.setTimeout(run, 250);
}

/** Ulangi isi dokumen sebanyak jumlah salinan pada pengaturan printer. */
export function withCopies(printer: PrinterConfig, body: string) {
  const copies = Math.min(5, Math.max(1, Math.round(printer.copies || 1)));
  if (copies === 1) return body;
  return Array.from({ length: copies }, () => `<div class="page-break">${body}</div>`).join("");
}
