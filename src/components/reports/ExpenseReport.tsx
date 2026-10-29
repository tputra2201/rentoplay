import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRupiah, useBilling, entrySource, type CashEntry } from "@/lib/billing-store";
import { inRange, rangeLabel, type ReportRange } from "@/lib/report-range";

function timeText(ts: number) {
  return new Date(ts).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ItemRow = { name: string; count: number; total: number; entries: CashEntry[] };
type GroupRow = { group: string; count: number; total: number; items: ItemRow[] };

/** Kelompokkan entri kas keluar jadi kategori (group) lalu item di dalamnya. */
function groupEntries(entries: CashEntry[]): GroupRow[] {
  const map = new Map<string, Map<string, ItemRow>>();
  for (const e of entries) {
    const groupName = e.group?.trim() || "Lain-lain";
    const items = map.get(groupName) ?? new Map<string, ItemRow>();
    map.set(groupName, items);
    const itemName = e.categoryName?.trim() || "Tanpa nama";
    const item = items.get(itemName) ?? { name: itemName, count: 0, total: 0, entries: [] };
    item.count += 1;
    item.total += e.amount;
    item.entries.push(e);
    items.set(itemName, item);
  }
  return [...map.entries()]
    .map(([group, items]) => {
      const list = [...items.values()]
        .map((i) => ({ ...i, entries: [...i.entries].sort((a, b) => b.createdAt - a.createdAt) }))
        .sort((a, b) => b.total - a.total);
      return {
        group,
        items: list,
        count: list.reduce((s, i) => s + i.count, 0),
        total: list.reduce((s, i) => s + i.total, 0),
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Expense Reports: ringkasan tiap item pengeluaran, dikelompokkan per kategori,
 * untuk rentang tanggal laporan yang dipilih.
 */
export function ExpenseReport({ range }: { range: ReportRange }) {
  const { cashEntries } = useBilling();

  const out = cashEntries.filter((e) => e.direction === "out" && inRange(e.createdAt, range));
  const expenses = out.filter((e) => !e.payout);
  // "DP Reservasi dipakai" bukan uang keluar sungguhan — DP sudah jadi SALES di nota.
  const payouts = out.filter((e) => e.payout && entrySource(e) !== "booking-dp-used");

  const expenseGroups = groupEntries(expenses);
  const payoutGroups = groupEntries(payouts);

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalPayout = payouts.reduce((s, e) => s + e.amount, 0);
  const cashExpense = expenses
    .filter((e) => e.payment.toLowerCase() === "cash")
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-accent text-lg font-extrabold">
        Expense Reports{" "}
        <span className="font-normal text-muted-foreground text-sm">
          · Periode {rangeLabel(range)}
        </span>
      </h2>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Expenses (Biaya)"
          value={formatRupiah(totalExpense)}
          note={`${expenses.length} transaksi`}
        />
        <Stat label="Dibayar tunai" value={formatRupiah(cashExpense)} note="keluar dari laci kasir" />
        <Stat
          label="PAY-OUT LAIN"
          value={formatRupiah(totalPayout)}
          note="Prive / setoran & titipan dipakai"
        />
      </section>

      <GroupTables
        title="Expenses (Biaya) per kategori & item"
        groups={expenseGroups}
        total={totalExpense}
        emptyText="Belum ada EXPENSES (BIAYA) pada periode ini."
      />

      <GroupTables
        title="PAY-OUT LAIN (PRIVE / SETORAN & TITIPAN DIPAKAI)"
        groups={payoutGroups}
        total={totalPayout}
        emptyText="Belum ada PAY-OUT lain pada periode ini."
      />

      <DetailTable
        title="DETAIL TRANSAKSI EXPENSES (BIAYA)"
        entries={expenses}
        total={totalExpense}
        emptyText="Belum ada EXPENSES (BIAYA) pada periode ini."
      />
      <DetailTable
        title="DETAIL TRANSAKSI PAY-OUT LAIN (PRIVE / SETORAN & TITIPAN DIPAKAI)"
        entries={payouts}
        total={totalPayout}
        emptyText="Belum ada PAY-OUT lain pada periode ini."
      />
    </div>
  );
}

function DetailTable({
  title,
  entries,
  total,
  emptyText,
}: {
  title: string;
  entries: CashEntry[];
  total: number;
  emptyText: string;
}) {
  return (
    <section className="surface-panel overflow-x-auto p-4 sm:p-6">
      <h3 className="mb-4 text-accent text-base font-bold">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Keterangan</TableHead>
              <TableHead>Dicatat oleh</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...entries]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{timeText(e.createdAt)}</TableCell>
                  <TableCell>{e.group?.trim() || "Lain-lain"}</TableCell>
                  <TableCell>{e.categoryName}</TableCell>
                  <TableCell>{e.payment}</TableCell>
                  <TableCell>{e.note || "—"}</TableCell>
                  <TableCell>{e.createdBy || "—"}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatRupiah(e.amount)}
                  </TableCell>
                </TableRow>
              ))}
            <TableRow>
              <TableCell colSpan={6} className="font-bold">
                Total
              </TableCell>
              <TableCell className="text-right font-bold">{formatRupiah(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function GroupTables({
  title,
  groups,
  total,
  emptyText,
}: {
  title: string;
  groups: GroupRow[];
  total: number;
  emptyText: string;
}) {
  return (
    <section className="surface-panel overflow-x-auto p-4 sm:p-6">
      <h3 className="mb-4 text-accent text-base font-bold">{title}</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold uppercase tracking-wider">{g.group}</p>
                <p className="text-sm font-semibold">
                  {formatRupiah(g.total)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {g.count} transaksi
                  </span>
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Transaksi</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.items.map((i) => (
                    <ItemRows key={i.name} item={i} />
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t pt-3">
            <p className="text-sm font-bold uppercase tracking-wider">Total</p>
            <p className="font-display text-lg font-bold">{formatRupiah(total)}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ItemRows({ item }: { item: ItemRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <TableCell>
          <span className="inline-flex items-center gap-1">
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
            {item.name}
          </span>
        </TableCell>
        <TableCell className="text-right">{item.count}</TableCell>
        <TableCell className="text-right font-semibold">{formatRupiah(item.total)}</TableCell>
      </TableRow>
      {open &&
        item.entries.map((e) => (
          <TableRow key={e.id} className="bg-muted/40 text-xs">
            <TableCell className="pl-8">
              <span className="whitespace-nowrap">{timeText(e.createdAt)}</span>
              <span className="text-muted-foreground">
                {" "}· {e.payment}
                {e.note ? ` · ${e.note}` : ""}
                {e.createdBy ? ` · ${e.createdBy}` : ""}
              </span>
            </TableCell>
            <TableCell />
            <TableCell className="text-right">{formatRupiah(e.amount)}</TableCell>
          </TableRow>
        ))}
    </>
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
