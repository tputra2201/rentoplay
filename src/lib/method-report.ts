import type { CashEntry, HistoryRecord, ModuleSource } from "./billing-store";
import { inRange, type ReportRange } from "./report-range";

export type MethodRow = { key: string; at: number; method: string; source: string; detail: string; amount: number };

/** Receipt ledger: DP application settles a bill but is not a second bank receipt. */
export function methodReportRows(
  history: HistoryRecord[], cashEntries: CashEntry[], range: ReportRange,
  match: (method: string) => boolean,
  sourceOf: (entry: CashEntry) => ModuleSource | undefined,
): MethodRow[] {
  const rows: MethodRow[] = [];
  const normalize = (text: string) => text.trim().toLowerCase();
  // Old settlements have no source. Consume each corresponding application once,
  // across the entire ledger before applying the requested period filter.
  const applications = cashEntries.filter((e) => sourceOf(e) === "booking-dp-used").map((e) => ({
    entry: e, remaining: e.amount,
    customer: normalize(e.note.replace(/^DP reservasi\s+/i, "").replace(/\s+dipakai di .*$/i, "")),
  }));
  for (const h of [...history].sort((a, b) => a.endAt - b.endAt)) {
    const splits = h.payments?.length ? h.payments : [{ method: h.payment ?? "Cash", amount: h.total }];
    splits.forEach((s, i) => {
      const at = s.at ?? h.paidAt ?? h.endAt;
      let amount = s.amount;
      for (const application of applications) {
        const e = application.entry;
        if (application.remaining <= 0 || normalize(e.payment) !== normalize(s.method)) continue;
        if (!application.customer || application.customer !== normalize(h.customerName ?? "")) continue;
        // Check-in and its cash application are consecutive local mutations.
        // Legacy splits without at must belong to this session's lifetime.
        const sameReceipt = s.at !== undefined
          ? Math.abs(s.at - e.createdAt) <= 5000
          : e.createdAt >= h.startAt && e.createdAt <= h.endAt + 5000;
        if (!sameReceipt) continue;
        const applied = Math.min(amount, application.remaining);
        amount -= applied;
        application.remaining -= applied;
        if (amount <= 0) break;
      }
      if (s.source === "booking-dp" || amount <= 0 || !match(s.method) || !inRange(at, range)) return;
      rows.push({ key: `bill-${h.id}-${i}`, at, method: s.method,
        source: h.kind === "cafe" ? "Kafe" : "Rental",
        detail: `${h.tableName ?? h.stationName} · ${h.customerName ?? "Umum"}`, amount });
    });
  }
  for (const e of cashEntries) {
    const source = sourceOf(e);
    if (source === "booking-dp-used" || !match(e.payment) || !inRange(e.createdAt, range)) continue;
    const label = source === "booking-dp" ? "DP Reservasi"
      : source === "card-topup" ? "Top Up Playing Card"
      : source === "card-sale" ? "Pembelian Playing Card"
      : e.direction === "in" ? "PAY-IN" : "PAY-OUT";
    rows.push({ key: `cash-${e.id}`, at: e.createdAt, method: e.payment, source: label,
      detail: `${e.categoryName}${e.note ? ` · ${e.note}` : ""}`,
      amount: e.direction === "in" ? e.amount : -e.amount });
  }
  return rows.sort((a, b) => b.at - a.at);
}