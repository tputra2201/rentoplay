import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { entrySource, formatRupiah, pendingPaymentRecords, useBilling } from "@/lib/billing-store";
import { rangeLabel, type ReportRange } from "@/lib/report-range";
import { methodReportRows } from "@/lib/method-report";

function timeText(ts: number) {
  return new Date(ts).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Laporan pembayaran untuk satu kelompok metode (mis. QRIS atau transfer bank).
 * `match` mencocokkan nama metode pembayaran secara bebas huruf besar/kecil.
 */
export function MethodReport({
  range,
  title,
  match,
  emptyText,
}: {
  range: ReportRange;
  title: string;
  match: (method: string) => boolean;
  emptyText: string;
}) {
  const { history, cashEntries, stations, cafeTables } = useBilling();
  const pending = pendingPaymentRecords({ history, stations, cafeTables }).map((h) => {
    const table = cafeTables.find((t) => `pending-${t.id}` === h.id);
    const station = stations.find((s) => `pending-${s.id}` === h.id);
    return { ...h, startAt: table?.openedAt ?? station?.session?.startAt ?? h.endAt,
      customerName: table?.customerName ?? station?.session?.customerName,
      ...(table ? { kind: "cafe" as const, tableName: table.name } : {}) };
  });
  const rows = methodReportRows([...history, ...pending], cashEntries, range, match, entrySource);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const income = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const outflow = rows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);

  const perMethod = Object.entries(
    rows.reduce<Record<string, { count: number; total: number }>>((acc, r) => {
      const item = (acc[r.method] ||= { count: 0, total: 0 });
      item.count += 1;
      item.total += r.amount;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="space-y-6">
      <h2 className="text-accent text-lg font-extrabold">
        {title} <span className="font-normal text-muted-foreground text-sm">· Periode {rangeLabel(range)}</span>
      </h2>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Jumlah transaksi" value={String(rows.length)} note={title} />
        <Stat label="Penerimaan" value={formatRupiah(income)} note="masuk" />
        <Stat label="Total bersih" value={formatRupiah(total)} note={`Keluar ${formatRupiah(outflow)}`} />
      </section>

      {perMethod.length > 1 && (
        <section className="surface-panel overflow-x-auto p-4 sm:p-6">
          <h3 className="mb-4 text-accent text-base font-bold">Per metode</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metode</TableHead>
                <TableHead className="text-right">Transaksi</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perMethod.map(([method, item]) => (
                <TableRow key={method}>
                  <TableCell>{method}</TableCell>
                  <TableCell className="text-right">{item.count}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatRupiah(item.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <section className="surface-panel overflow-x-auto p-4 sm:p-6">
        <h3 className="mb-4 text-accent text-base font-bold">Detail transaksi</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="whitespace-nowrap">{timeText(r.at)}</TableCell>
                  <TableCell>{r.method}</TableCell>
                  <TableCell>{r.source}</TableCell>
                  <TableCell>{r.detail}</TableCell>
                  <TableCell
                    className={
                      r.amount < 0
                        ? "text-right font-semibold text-destructive"
                        : "text-right font-semibold"
                    }
                  >
                    {formatRupiah(r.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="surface-panel p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
