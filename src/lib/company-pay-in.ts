type PayInEntry = {
  direction: "in" | "out";
  payout: boolean;
  source?: string | undefined;
  amount: number;
};

/** Collected deposits remain receipts, regardless of when they are later used. */
export function companyPayInRows(entries: PayInEntry[]) {
  const rows = new Map<string, { label: string; amount: number; qty: number }>();
  for (const entry of entries) {
    if (entry.direction !== "in" || !entry.payout) continue;
    const label = entry.source === "booking-dp" ? "DP RESERVASI"
      : entry.source === "card-topup" ? "TOP UP PLAYING CARD" : "TAMBAHAN KAS MASUK";
    const row = rows.get(label) ?? { label, amount: 0, qty: 0 };
    row.amount += entry.amount;
    row.qty += 1;
    rows.set(label, row);
  }
  return rows;
}