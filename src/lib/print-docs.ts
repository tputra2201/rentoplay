/** Perakit dokumen cetak: struk, invoice, label dapur/bar, dan laporan. */

import { addonAmount, formatRupiah, type HistoryRecord, type OrderItem } from "./billing-store";
import { printDirect } from "./escpos";
import {
  CHARS_PER_LINE,
  escapeHtml,
  paperCss,
  printHtml,
  labelLayout,
  printMode,
  printViaAndroid,
  printViaRawBt,
  textCenter,
  textRow,
  textSep,
  textWithCopies,
  withCopies,
  type DocLayout,
  type PrinterConfig,
} from "./printing";

export type PrintStore = {
  store_name?: string;
  address?: string;
  city?: string;
  phone?: string;
  store_code?: string;
} | null;

const time = (ms?: number) =>
  ms ? new Date(ms).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-";

function layoutCss(layout: DocLayout) {
  return `
    body { font-size: ${layout.fontSizePt}pt; font-weight: ${layout.bold ? 700 : 400};
      padding: ${Math.max(0, layout.marginMm)}mm 0; }
  `;
}

function storeBlock(store: PrintStore, layout: DocLayout) {
  if (!layout.showStoreInfo) return "";
  const lines = [store?.address, store?.city, store?.phone ? `Telp ${store.phone}` : ""].filter(
    Boolean,
  );
  return `
    <div class="center bold big">${escapeHtml(store?.store_name || "Billing Rental PS")}</div>
    ${lines.map((l) => `<div class="center muted">${escapeHtml(l)}</div>`).join("")}
  `;
}

function itemRows(record: HistoryRecord) {
  const rows: string[] = [];
  if (record.rentalTotal > 0) {
    rows.push(
      `<tr><td>Rental ${escapeHtml(record.stationName)} (${record.minutes} mnt)</td><td class="right">${formatRupiah(
        record.rentalTotal,
      )}</td></tr>`,
    );
  }
  for (const a of record.addons ?? []) {
    const amount = addonAmount(a, Math.max(0, record.minutes) / 60);
    rows.push(
      `<tr><td>${escapeHtml(a.name)} × ${a.qty}${
        a.mode === "hourly" ? " (per jam)" : ""
      }</td><td class="right">${formatRupiah(amount)}</td></tr>`,
    );
  }
  for (const o of record.orders ?? []) {
    rows.push(
      `<tr><td>${escapeHtml(orderName(o))} × ${o.qty}</td><td class="right">${formatRupiah(
        o.price * o.qty,
      )}</td></tr>`,
    );
  }
  return rows.join("");
}

function paymentBlock(record: HistoryRecord) {
  const splits = record.payments?.length
    ? record.payments.map((p) => `${p.method}: ${formatRupiah(p.amount)}`)
    : [`${record.payment ?? "Cash"}: ${formatRupiah(record.amountPaid ?? record.total)}`];
  return `
    ${splits.map((s) => `<div class="row"><span>${escapeHtml(s)}</span></div>`).join("")}
    ${
      record.change
        ? `<div class="row"><span>Kembali</span><span>${formatRupiah(record.change)}</span></div>`
        : ""
    }
  `;
}

export function receiptBody(opts: {
  record: HistoryRecord;
  store: PrintStore;
  layout: DocLayout;
  kind: "receipt" | "invoice" | "bill";
  cashier?: string;
}) {
  const { record, store, layout, kind } = opts;
  const cashier = opts.cashier || record.cashierName || "";
  const title =
    kind === "invoice" ? "INVOICE" : kind === "bill" ? "BILL SEMENTARA" : "STRUK PEMBAYARAN";
  return `
    ${layout.headerText ? `<div class="center bold">${escapeHtml(layout.headerText)}</div>` : ""}
    ${storeBlock(store, layout)}
    <div class="sep"></div>
    <div class="center bold">${title}</div>
    <div class="muted">No: ${escapeHtml(record.id)}</div>
    <div class="muted">Waktu: ${time(record.paidAt ?? record.endAt)}</div>
    ${cashier ? `<div class="muted">Kasir: ${escapeHtml(cashier)}</div>` : ""}
    ${
      layout.showCustomer
        ? `<div class="muted">Pelanggan: ${escapeHtml(record.customerName || "Umum")}</div>
           ${record.tableName ? `<div class="muted">Meja: ${escapeHtml(record.tableName)}</div>` : ""}`
        : ""
    }
    <div class="sep"></div>
    ${layout.showItems ? `<table>${itemRows(record)}</table><div class="sep"></div>` : ""}
    <div class="row"><span>Subtotal</span><span>${formatRupiah(
      record.rentalTotal + (record.addonTotal ?? 0) + record.fnbTotal,
    )}</span></div>
    ${
      record.discount
        ? `<div class="row"><span>Potongan ${escapeHtml(
            record.promoName || "",
          )}</span><span>- ${formatRupiah(record.discount)}</span></div>`
        : ""
    }
    <div class="row bold big"><span>TOTAL</span><span>${formatRupiah(record.total)}</span></div>
    ${layout.showPayment ? `<div class="sep"></div>${paymentBlock(record)}` : ""}
    <div class="sep"></div>
    ${layout.footerText ? `<div class="center muted">${escapeHtml(layout.footerText)}</div>` : ""}
  `;
}

/** Versi teks polos struk / invoice untuk printer thermal ESC/POS. */
export function receiptText(opts: {
  record: HistoryRecord;
  store: PrintStore;
  printer: PrinterConfig;
  layout: DocLayout;
  kind: "receipt" | "invoice" | "bill";
  cashier?: string;
}) {
  const { record, store, printer, layout, kind } = opts;
  const cashier = opts.cashier || record.cashierName || "";
  const w = CHARS_PER_LINE[printer.paper];
  const lines: string[] = [];
  if (layout.headerText) lines.push(textCenter(layout.headerText, w));
  if (layout.showStoreInfo) {
    lines.push(textCenter(store?.store_name || "Billing Rental PS", w));
    for (const l of [store?.address, store?.city, store?.phone ? `Telp ${store.phone}` : ""]) {
      if (l) lines.push(textCenter(l, w));
    }
  }
  lines.push(textSep(w));
  lines.push(
    textCenter(
      kind === "invoice" ? "INVOICE" : kind === "bill" ? "BILL SEMENTARA" : "STRUK PEMBAYARAN",
      w,
    ),
  );
  lines.push(`No: ${record.id}`);
  lines.push(`Waktu: ${time(record.paidAt ?? record.endAt)}`);
  if (cashier) lines.push(`Kasir: ${cashier}`);
  if (layout.showCustomer) {
    lines.push(`Pelanggan: ${record.customerName || "Umum"}`);
    if (record.tableName) lines.push(`Meja: ${record.tableName}`);
  }
  lines.push(textSep(w));
  if (layout.showItems) {
    if (record.rentalTotal > 0) {
      lines.push(
        textRow(
          `Rental ${record.stationName} (${record.minutes}m)`,
          formatRupiah(record.rentalTotal),
          w,
        ),
      );
    }
    for (const a of record.addons ?? []) {
      lines.push(
        textRow(
          `${a.name} x${a.qty}${a.mode === "hourly" ? " /jam" : ""}`,
          formatRupiah(addonAmount(a, Math.max(0, record.minutes) / 60)),
          w,
        ),
      );
    }
    for (const o of record.orders ?? []) {
      lines.push(textRow(`${orderName(o)} x${o.qty}`, formatRupiah(o.price * o.qty), w));
    }
    lines.push(textSep(w));
  }
  lines.push(
    textRow(
      "Subtotal",
      formatRupiah(record.rentalTotal + (record.addonTotal ?? 0) + record.fnbTotal),
      w,
    ),
  );
  if (record.discount) {
    lines.push(
      textRow(`Potongan ${record.promoName || ""}`.trim(), `- ${formatRupiah(record.discount)}`, w),
    );
  }
  lines.push(textRow("TOTAL", formatRupiah(record.total), w));
  if (layout.showPayment) {
    lines.push(textSep(w));
    const splits = record.payments?.length
      ? record.payments.map((p) => textRow(p.method, formatRupiah(p.amount), w))
      : [
          textRow(
            record.payment ?? "Cash",
            formatRupiah(record.amountPaid ?? record.total),
            w,
          ),
        ];
    lines.push(...splits);
    if (record.change) lines.push(textRow("Kembali", formatRupiah(record.change), w));
  }
  lines.push(textSep(w));
  if (layout.footerText) lines.push(textCenter(layout.footerText, w));
  return lines.join("\n");
}

export function printReceipt(opts: {
  record: HistoryRecord;
  store: PrintStore;
  printer: PrinterConfig;
  layout: DocLayout;
  kind: "receipt" | "invoice" | "bill";
  cashier?: string;
}) {
  const mode = printMode(opts.printer);
  if (mode === "android") {
    printViaAndroid(opts.printer, textWithCopies(opts.printer, receiptText(opts)));
    return;
  }
  if (mode === "rawbt") {
    printViaRawBt(opts.printer, textWithCopies(opts.printer, receiptText(opts)));
    return;
  }
  if (mode === "bluetooth" || mode === "usb") {
    void printDirect(opts.printer, mode, textWithCopies(opts.printer, receiptText(opts)));
    return;
  }
  const body = receiptBody(opts);
  printHtml(
    opts.kind === "invoice" ? "Invoice" : opts.kind === "bill" ? "Bill" : "Struk",
    paperCss(opts.printer) + layoutCss(opts.layout),
    withCopies(opts.printer, body),
  );
}

export type LabelItem = { name: string; qty: number; note?: string };

function labelTextLines(opts: {
  printer: PrinterConfig;
  item: LabelItem;
  heading: string;
  source: string;
  customerName: string | undefined;
  note: string | undefined;
  stamp: string;
}) {
  const { printer, item, heading, source, customerName, note, stamp } = opts;
  const layout = labelLayout(printer);
  const width = CHARS_PER_LINE[printer.paper];
  const lines: string[] = [];
  if (layout.showHeading) lines.push(textCenter(heading, width));
  if (layout.showSeparators) lines.push(textSep(width));
  if (layout.showItemName) lines.push(item.name);
  if (layout.showQuantity) lines.push(`x ${item.qty}`);
  if (layout.showNotes) lines.push(...[item.note, note].filter(Boolean) as string[]);
  if (layout.showSeparators) lines.push(textSep(width));
  if (layout.showSource && source) lines.push(source);
  if (layout.showCustomer && customerName) lines.push(customerName);
  if (layout.showTimestamp) lines.push(stamp);
  return lines;
}

/** Satu label per item (kertas label thermal dapur / bar). */
export function printLabels(opts: {
  printer: PrinterConfig;
  items: LabelItem[];
  heading: string;
  source: string;
  customerName?: string;
  note?: string;
  at?: number;
}) {
  const { printer, items, heading, source, customerName, note } = opts;
  const stamp = time(opts.at ?? Date.now());
  const mode = printMode(printer);
  if (mode === "android" || mode === "rawbt" || mode === "bluetooth" || mode === "usb") {
    const text = items
      .map((item) =>
        labelTextLines({ printer, item, heading, source, customerName, note, stamp }).join("\n"),
      )
      .join("\n\n");
    if (mode === "android") printViaAndroid(printer, textWithCopies(printer, text));
    else if (mode === "rawbt") printViaRawBt(printer, textWithCopies(printer, text));
    else void printDirect(printer, mode, textWithCopies(printer, text));
    return;
  }
  const layout = labelLayout(printer);
  const labels = items
    .map((item) => {
      const notes = layout.showNotes ? [item.note, note].filter(Boolean) : [];
      return `
        <div class="page-break">
          ${layout.showHeading ? `<div class="center bold">${escapeHtml(heading)}</div>` : ""}
          ${layout.showSeparators ? '<div class="sep"></div>' : ""}
          ${layout.showItemName ? `<div class="bold big">${escapeHtml(item.name)}</div>` : ""}
          ${layout.showQuantity ? `<div class="bold big">× ${item.qty}</div>` : ""}
          ${notes.map((value) => `<div class="muted">${escapeHtml(value)}</div>`).join("")}
          ${layout.showSeparators ? '<div class="sep"></div>' : ""}
          ${layout.showSource && source ? `<div class="muted">${escapeHtml(source)}</div>` : ""}
          ${layout.showCustomer && customerName ? `<div class="muted">${escapeHtml(customerName)}</div>` : ""}
          ${layout.showTimestamp ? `<div class="muted">${escapeHtml(stamp)}</div>` : ""}
        </div>
      `;
    })
    .join("");
  printHtml(heading, paperCss(printer), withCopies(printer, labels));
}

/** Cetak isi laporan yang sedang tampil di layar. */
export function printReport(printer: PrinterConfig, title: string, innerHtml: string) {
  const mode = printMode(printer);
  if (mode === "android" || mode === "rawbt" || mode === "bluetooth" || mode === "usb") {
    const w = CHARS_PER_LINE[printer.paper];
    const plain = innerHtml
      .replace(/<\/(tr|div|p|h1|h2|h3|section|table)>/gi, "\n")
      .replace(/<\/(td|th)>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    const text = `${textCenter(title, w)}\n${textSep(w)}\n${plain}`;
    if (mode === "android") printViaAndroid(printer, text);
    else if (mode === "rawbt") printViaRawBt(printer, text);
    else void printDirect(printer, mode, text);
    return;
  }
  const css = `
    ${paperCss(printer)}
    h1, h2, h3 { font-size: ${printer.fontSizePt + 2}pt; margin: 6px 0 3px; }
    table { margin-bottom: 6px; }
    th, td { border-bottom: 1px solid #ddd; }
    button, [role="tablist"], svg { display: none !important; }
    section { break-inside: avoid; margin-bottom: 8px; }
  `;
  printHtml(
    title,
    css,
    `<div class="center bold big">${escapeHtml(title)}</div><div>${innerHtml}</div>`,
  );
}

/** Nama pesanan beserta opsi modifikasinya. */
const orderName = (o: OrderItem) =>
  o.mods && o.mods.length > 0 ? `${o.name} (${o.mods.join(", ")})` : o.name;

/** Kelompokkan order menjadi item label sesuai pengaturan cetak tiap menu. */
export function labelItemsFor(
  orders: OrderItem[],
  menu: { id: string; name: string; printEnabled?: boolean; printerId?: string }[],
  printerId: string,
): LabelItem[] {
  const out: LabelItem[] = [];
  for (const o of orders) {
    const item =
      menu.find((m) => m.id === o.menuId) ??
      menu.find((m) => o.id.startsWith(`${m.id}-`)) ??
      menu.find((m) => m.name === o.name);
    if (!item) continue;
    if (item.printEnabled === false) continue;
    if (item.printerId !== printerId) continue;
    out.push({ name: orderName(o), qty: o.qty });
  }
  return out;
}
