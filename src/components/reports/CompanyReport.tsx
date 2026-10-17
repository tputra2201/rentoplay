import { useRef } from "react";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addonAmount,
  BOOKING_DP_CATEGORY_ID,
  BOOKING_DP_USED_CATEGORY_ID,
  CARD_SALE_CATEGORY_ID,
  CARD_TOPUP_CATEGORY_ID,
  entryAccount,
  entrySource,
  formatRupiah,
  shiftSummary,
  useBilling,
  type HistoryRecord,
} from "@/lib/billing-store";
import { companyPayInRows } from "@/lib/company-pay-in";
import { inRange, rangeLabel, type ReportRange } from "@/lib/report-range";

type Row = { label: string; amount: number; qty?: number };

function bump(map: Map<string, Row>, label: string, amount: number, qty = 0) {
  const row = map.get(label) ?? { label, amount: 0, qty: 0 };
  row.amount += amount;
  row.qty = (row.qty ?? 0) + qty;
  map.set(label, row);
}

function sorted(map: Map<string, Row>) {
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function CompanyReport({ range }: { range: ReportRange }) {
  const {
    history,
    cashEntries,
    menu,
    shifts,
    businessProfile,
  } = useBilling();
  const salesLabels = businessProfile.salesLabels;

  const paidTime = (h: HistoryRecord) => h.paidAt ?? h.endAt;
  const records = history.filter((h) => inRange(paidTime(h), range));
  const cash = cashEntries.filter((e) => inRange(e.createdAt, range));

  const rentalGross = records.reduce((s, h) => s + h.rentalTotal, 0);
  const addonGross = records.reduce((s, h) => s + (h.addonTotal ?? 0), 0);
  const fnbGross = records.reduce((s, h) => s + h.fnbTotal, 0);
  const discount = records.reduce((s, h) => s + (h.discount ?? 0), 0);
  const netSales = records.reduce((s, h) => s + h.total, 0);

  const salePayments = new Map<string, Row>();
  for (const h of records) {
    if (h.payments?.length) {
      for (const p of h.payments) bump(salePayments, p.method || "Cash", p.amount, 1);
    } else {
      bump(salePayments, h.payment || "Cash", h.total, 1);
    }
  }

  const discounts = new Map<string, Row>();
  for (const h of records) {
    if ((h.discount ?? 0) > 0) bump(discounts, h.promoName || "Potongan harga", h.discount ?? 0, 1);
  }

  const saleTypes = new Map<string, Row>();
  for (const h of records) {
    bump(saleTypes, h.kind === "cafe" ? "Kafe / Meja" : "Rental PS", h.total, 1);
  }

  const tables = new Map<string, Row>();
  for (const h of records) {
    if (h.kind === "cafe" && h.tableName) bump(tables, h.tableName, h.total, 1);
  }

  const addons = new Map<string, Row>();
  for (const h of records) {
    for (const a of h.addons ?? []) {
      const hours = Math.max(0, h.minutes) / 60;
      bump(addons, a.name, addonAmount(a, hours), a.qty);
    }
  }

  const consoles = new Map<string, Row>();
  for (const h of records) {
    if (h.rentalTotal > 0) bump(consoles, h.console || "Rental", h.rentalTotal, 1);
  }

  const categories = new Map<string, Row>();
  const items = new Map<string, Row>();
  for (const h of records) {
    for (const o of h.orders ?? []) {
      const item =
        menu.find((m) => m.id === o.menuId) ??
        menu.find((m) => o.id.startsWith(`${m.id}-`)) ??
        menu.find((m) => m.name === o.name);
      bump(categories, item?.category || "Lainnya", o.price * o.qty, o.qty);
      bump(items, o.name, o.price * o.qty, o.qty);
    }
    if (h.rentalTotal > 0) {
      bump(categories, "Rental", h.rentalTotal, 1);
      bump(items, `Rental ${h.console}`, h.rentalTotal, 1);
    }
    for (const a of h.addons ?? []) {
      const amount = addonAmount(a, Math.max(0, h.minutes) / 60);
      bump(categories, "Additional Rental", amount, a.qty);
      bump(items, a.name, amount, a.qty);
    }
  }

  const cashSum = (pick: (e: (typeof cash)[number]) => boolean) =>
    cash.filter(pick).reduce((s, e) => s + e.amount, 0);
  const otherIncome = cashSum(
    (e) => e.direction === "in" && entryAccount(e) === "other",
  );
  const expense = cashSum((e) => e.direction === "out" && entryAccount(e) === "expense");

  const expenseRows = new Map<string, Row>();
  for (const e of cash) {
    if (e.direction === "out" && !e.payout) bump(expenseRows, e.categoryName, e.amount, 1);
  }
  const incomeRows = new Map<string, Row>();
  for (const e of cash) {
    if (e.direction === "in" && entryAccount(e) === "other") {
      bump(incomeRows, e.categoryName, e.amount, 1);
    }
  }

  const shiftInRange = shifts
    .filter((s) => inRange(s.openedAt, range))
    .sort((a, b) => a.openedAt - b.openedAt);

  const cardSales = cashSum((e) => e.direction === "in" && entryAccount(e) === "sales");
  const cashSalesRows = new Map<string, Row>();
  for (const e of cash) {
    if (e.direction === "in" && entryAccount(e) === "sales") {
      bump(cashSalesRows, entrySource(e) === "card-sale" ? "PLAYING CARD SALES" : e.categoryName.toUpperCase(), e.amount, 1);
    }
  }

  const payInRows = companyPayInRows(cash.map((e) => ({ ...e, source: entrySource(e) })));

  const payOutRows = new Map<string, Row>();
  for (const e of cash) {
    if (e.direction !== "out") continue;
    if (!e.payout) bump(payOutRows, "EXPENSES (BIAYA)", e.amount, 1);
    else if (entrySource(e) !== "booking-dp-used") {
      bump(payOutRows, "PRIVE / SETORAN TUNAI (KE OWNER / BANK)", e.amount, 1);
    }
  }

  // DP yang dipakai sudah ikut tercatat di metode pembayaran nota (QRIS/Cash/…),
  // jadi tidak ada baris "DP RESERVASI TERPAKAI" terpisah.
  const paymentRows = new Map<string, Row>();
  for (const [, r] of salePayments) bump(paymentRows, r.label, r.amount, r.qty ?? 0);
  for (const e of cash) {
    if (e.direction === "in" && !e.payout) {
      bump(paymentRows, e.payment || "Cash", e.amount, 1);
    }
  }
  const visiblePaymentRows = sorted(paymentRows).filter((row) => Math.abs(row.amount) > 0.5);
  const totalRevenue = netSales + cardSales + otherIncome;

  const printRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6" ref={printRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-accent text-xl font-extrabold tracking-tight">Company Report</h2>
          <p className="text-sm text-muted-foreground">Periode {rangeLabel(range)}</p>
        </div>
        <PrintReportButton
          targetRef={printRef}
          title={`Company Report — ${rangeLabel(range)}`}
        />
      </div>

      <Section title="REVENUE">
        <Subheading>SALES</Subheading>
        <Line label={salesLabels.rental} value={formatRupiah(rentalGross)} />
        <Line label={salesLabels.fnb} value={formatRupiah(fnbGross)} />
        <Line label={salesLabels.addon} value={formatRupiah(addonGross)} />
        {cashSalesRows.size === 0 ? (
          businessProfile?.modules?.playingCard === false ? null : (
            <Line label="PLAYING CARD SALES" value={formatRupiah(0)} />
          )
        ) : (
          sorted(cashSalesRows).map((r) => (
            <Line key={r.label} label={r.label} value={formatRupiah(r.amount)} />
          ))
        )}
        {discount > 0 && <Line label="DISCOUNT" value={`- ${formatRupiah(discount)}`} />}
        <Line label="TOTAL SALES" value={formatRupiah(netSales + cardSales)} strong />
        <Subheading>OTHER REVENUE</Subheading>
        <Rows rows={sorted(incomeRows)} countLabel="Transaksi" hideTotal />
        <Line label="TOTAL OTHER REVENUE" value={formatRupiah(otherIncome)} strong />
        <Line label="TOTAL REVENUE" value={formatRupiah(totalRevenue)} strong accent />
      </Section>

      <Section title="PAYMENTS">
        <Rows rows={visiblePaymentRows} countLabel="Transaksi" totalLabel="TOTAL PAYMENTS" />
        <p className="pt-2 text-xs text-muted-foreground">
          Total Payments = Total Revenue
        </p>
      </Section>

      <Section title="PAY-IN">
        <p className="mb-2 text-xs text-muted-foreground">PAY-IN yang bukan REVENUE.</p>
        <Rows rows={sorted(payInRows)} countLabel="Transaksi" totalLabel="TOTAL PAY-IN" />
      </Section>

      <Section title="PAY-OUT">
        <p className="mb-2 text-xs text-muted-foreground">Biaya toko dan uang tunai yang disetorkan.</p>
        <Rows rows={sorted(payOutRows)} countLabel="Transaksi" totalLabel="TOTAL PAY-OUT" />
      </Section>

      <Section title="Potongan harga">
        <Rows rows={sorted(discounts)} countLabel="Nota" />
      </Section>

      <Section title="Jenis penjualan">
        <Rows rows={sorted(saleTypes)} countLabel="Nota" />
      </Section>

      {tables.size > 0 && (
        <Section title="Penjualan per meja">
          <Rows rows={sorted(tables)} countLabel="Nota" />
        </Section>
      )}

      {addons.size > 0 && (
        <Section title="Additional Rental">
          <Rows rows={sorted(addons)} countLabel="Jumlah" />
        </Section>
      )}

      <Section title="Rental per konsol">
        <Rows rows={sorted(consoles)} countLabel="Sesi" />
      </Section>

      <Section title="Kelompok barang">
        <Rows rows={sorted(categories)} countLabel="Jumlah" />
      </Section>

      <Section title="Rincian barang terjual">
        <Rows rows={sorted(items)} countLabel="Jumlah" />
      </Section>

      <Section title="Rincian Expenses (Biaya)">
        <Rows rows={sorted(expenseRows)} countLabel="Catatan" />
        <Line label="TOTAL EXPENSES (BIAYA)" value={formatRupiah(expense)} strong />
      </Section>

      <Section title="CASH CLOSE OUT">
        {shiftInRange.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada shift pada periode ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kasir</TableHead>
                  <TableHead className="text-right">Cash Expected</TableHead>
                  <TableHead className="text-right">Cash Actual</TableHead>
                  <TableHead className="text-right">Balance Cash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shiftInRange.map((s) => {
                  const sum = shiftSummary(s, history, cashEntries);
                  const closed = s.closedAt != null;
                  const diff = closed ? (s.cashActual ?? 0) - sum.expected : 0;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{s.cashierName}{closed ? "" : " (masih buka)"}</TableCell>
                      <TableCell className="text-right">{formatRupiah(sum.expected)}</TableCell>
                      <TableCell className="text-right">{closed ? formatRupiah(s.cashActual ?? 0) : "-"}</TableCell>
                      <TableCell className={diff < 0 ? "text-right text-destructive" : "text-right"}>{closed ? formatRupiah(diff) : "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>


      <Section title="RINGKASAN AKHIR">
        <Line label="TOTAL REVENUE" value={formatRupiah(totalRevenue)} />
        <Line label="TOTAL EXPENSES (BIAYA)" value={`- ${formatRupiah(expense)}`} />
        <Line
          label="PENDAPATAN SETELAH BIAYA"
          value={formatRupiah(totalRevenue - expense)}
          strong
          accent
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-panel p-4 sm:p-6">
      <h3 className="text-accent mb-3 text-sm font-bold uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return <p className="border-b pb-1 pt-3 text-xs font-bold text-muted-foreground">{children}</p>;
}

function Line({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div
      className={
        strong
          ? "flex items-center justify-between gap-4 border-t pt-2 font-semibold"
          : "flex items-center justify-between gap-4 text-sm"
      }
    >
      <span>{label}</span>
      <span className={accent ? "font-bold text-accent" : strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}

function Rows({ rows, countLabel, totalLabel = "Total", hideTotal = false }: { rows: Row[]; countLabel: string; totalLabel?: string; hideTotal?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada data pada periode ini.</p>;
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama</TableHead>
            <TableHead className="text-right">{countLabel}</TableHead>
            <TableHead className="text-right">Jumlah</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell>{r.label}</TableCell>
              <TableCell className="text-right">{r.qty ?? 0}</TableCell>
              <TableCell className="text-right">{formatRupiah(r.amount)}</TableCell>
            </TableRow>
          ))}
          {!hideTotal && (
            <TableRow>
              <TableCell className="font-semibold">{totalLabel}</TableCell>
              <TableCell />
              <TableCell className="text-right font-semibold">{formatRupiah(total)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
