import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Printer, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceiptView } from "@/components/CustomerDetail";
import { useConfirm } from "@/components/ConfirmDialog";
import { CompanyReport } from "@/components/reports/CompanyReport";
import { CardReport } from "@/components/reports/CardReport";
import { ShiftReport } from "@/components/reports/ShiftReport";
import { ExpenseReport } from "@/components/reports/ExpenseReport";
import { MembershipReport } from "@/components/reports/MembershipReport";
import { MethodReport } from "@/components/reports/MethodReport";
import { CashierReport } from "@/components/reports/CashierReport";
import { LogBookReport } from "@/components/reports/LogBookReport";
import { StatsReport } from "@/components/reports/StatsReport";
import { VoidReport } from "@/components/reports/VoidReport";
import { DeviceReport } from "@/components/reports/DeviceReport";
import { ReportRangePicker } from "@/components/reports/ReportRangePicker";
import { PrintReportButton } from "@/components/reports/PrintReportButton";
import { ExportExcelButton } from "@/components/reports/ExportExcelButton";
import {
  businessDate,
  defaultRange,
  todayValue,
  inRange,
  rangeLabel,
  type OperatingHours,
  type ReportRange,
} from "@/lib/report-range";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { useStoreInfo } from "@/lib/store-info";
import { printReceipt, type PrintStore } from "@/lib/print-docs";
import { printerFor } from "@/lib/printing";
import { entryAccount, formatRupiah, useBilling, type HistoryRecord } from "@/lib/billing-store";


export const Route = createFileRoute("/_authenticated/laporan")({
  head: () => ({
    meta: [
      { title: "Riwayat & Laporan — RenToPlay" },
      {
        name: "description",
        content:
          "Rekap pendapatan harian rental PlayStation dan penjualan makanan minuman beserta riwayat transaksi.",
      },
      { property: "og:title", content: "Riwayat & Laporan — RenToPlay" },
      {
        property: "og:description",
        content: "Rekap pendapatan harian rental dan penjualan kasir.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LaporanPage,
});

function dayKey(ts: number, hours?: OperatingHours) {
  return businessDate(ts, hours).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function timeOf(ts: number) {
  return new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Tanggal + jam untuk entri kas (contoh: 17 Sep, 20.15). */
function dateTimeOf(ts: number) {
  const d = new Date(ts);
  return `${d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}, ${timeOf(ts)}`;
}

function LaporanPage() {
  const { role } = useAuth();
  const { rolePermissions, operatingHours, activeBusinessDay, businessProfile } = useBilling();
  const [pickedRange, setRangeState] = useState<ReportRange>(() => defaultRange("day"));
  const [touched, setTouched] = useState(false);
  const setRange = (r: ReportRange) => {
    setTouched(true);
    setRangeState(r);
  };
  // Tanggal awal laporan mengikuti hari usaha yang sedang berjalan (tanggal
  // kalender saat hari usaha dibuka) dan jam operasional toko sebenarnya.
  useEffect(() => {
    if (touched) return;
    const base = defaultRange("day", operatingHours);
    if (activeBusinessDay) {
      const v = todayValue("day", new Date(activeBusinessDay.openedAt));
      setRangeState({ ...base, from: v, to: v });
    } else setRangeState(base);
  }, [touched, operatingHours, activeBusinessDay?.openedAt]);

  // Tanggal yang dipilih dibaca sebagai hari usaha: mulai jam buka store
  // sampai jam tutup keesokan harinya. Bila hari usaha itu sudah ditutup
  // lewat End of Day, batas akhirnya memakai waktu penutupan sebenarnya.
  const range = useMemo<ReportRange>(() => {
    const base: ReportRange = {
      mode: pickedRange.mode,
      from: pickedRange.from,
      to: pickedRange.to,
      hours: operatingHours,
    };
    return base;
  }, [pickedRange, operatingHours]);

  const { store } = useStoreInfo(true);
  const storeName = store?.store_name?.trim() || "RenToPlay";

  const allow = (key: string) => can(role, key, rolePermissions);

  const tabs = [
    { value: "nota", label: "Nota Transaksi", key: "laporan.receipt" },
    { value: "company", label: "Company Report", key: "laporan.company" },
    { value: "kartu", label: "Laporan Playing Card", key: "laporan.card" },
    { value: "shift", label: "Cash Close Out", key: "laporan.shift" },
    { value: "expense", label: "Expense Reports", key: "laporan.expense" },
    { value: "member", label: "Laporan Membership", key: "laporan.membership" },
    { value: "qris", label: "Pembayaran QRIS", key: "laporan.qris" },
    { value: "transfer", label: "Transfer Bank", key: "laporan.transfer" },
    { value: "kasir", label: "Transaksi per Kasir", key: "laporan.kasir" },
    { value: "logbook", label: "Log Book", key: "laporan.logbook" },
    { value: "statistik", label: "Statistik", key: "laporan.statistik" },
    { value: "void", label: "Laporan VOID", key: "laporan.void" },
    { value: "perangkat", label: "Transaksi per Perangkat", key: "laporan.perangkat" },
  ]
    .filter((t) => allow(t.key))
    .filter((t) => t.value !== "kartu" || businessProfile?.modules?.playingCard !== false);
  const first = tabs[0]?.value ?? "nota";
  const reportRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Riwayat &amp; Laporan</h1>
      </header>

      <Tabs key={first} defaultValue={first} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-5">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="w-full min-w-0 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:text-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Levelmu belum punya hak akses ke laporan mana pun.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ReportRangePicker range={range} onChange={setRange} />
          <div className="flex flex-wrap gap-2">
            {allow("laporan.cetak") && (
              <PrintReportButton targetRef={reportRef} title="Laporan" label="Cetak laporan" />
            )}
            {allow("laporan.excel") && (
              <ExportExcelButton
                targetRef={reportRef}
                title={`Laporan ${storeName}`}
                periodText={`Periode: ${rangeLabel(range)}`}
              />
            )}
          </div>
        </div>

        <div ref={reportRef}>

        <TabsContent value="nota" className="mt-6">
          <ReceiptReport range={range} />
        </TabsContent>
        <TabsContent value="company" className="mt-6">
          <CompanyReport range={range} />
        </TabsContent>
        <TabsContent value="kartu" className="mt-6">
          <CardReport range={range} />
        </TabsContent>
        <TabsContent value="shift" className="mt-6">
          <ShiftReport range={range} />
        </TabsContent>
        <TabsContent value="expense" className="mt-6">
          <ExpenseReport range={range} />
        </TabsContent>
        <TabsContent value="member" className="mt-6">
          <MembershipReport range={range} />
        </TabsContent>
        <TabsContent value="qris" className="mt-6">
          <MethodReport
            range={range}
            title="Pembayaran QRIS"
            match={(m) => m.toLowerCase().includes("qris")}
            emptyText="Belum ada pembayaran QRIS pada periode ini."
          />
        </TabsContent>
        <TabsContent value="transfer" className="mt-6">
          <MethodReport
            range={range}
            title="Pembayaran transfer bank"
            match={(m) => {
              const key = m.toLowerCase();
              return key.includes("transfer") || key.includes("bank");
            }}
            emptyText="Belum ada pembayaran transfer bank pada periode ini."
          />
        </TabsContent>
        <TabsContent value="kasir" className="mt-6">
          <CashierReport range={range} />
        </TabsContent>
        <TabsContent value="logbook" className="mt-6">
          <LogBookReport range={range} />
        </TabsContent>
        <TabsContent value="void" className="mt-6">
          <VoidReport range={range} />
        </TabsContent>
        <TabsContent value="perangkat" className="mt-6">
          <DeviceReport range={range} />
        </TabsContent>
        <TabsContent value="statistik" className="mt-6">
          <StatsReport range={range} />
        </TabsContent>
      </div>
      </Tabs>
    </div>
  );
}

function ReceiptReport({ range }: { range: ReportRange }) {
  const {
    history: rawHistory,
    cashEntries,
    clearHistory,
    addLog,
    paymentMethods,
    updateCashEntry,
    removeCashEntry,
    rolePermissions,
    businessProfile,
  } = useBilling();
  const { role: myRole } = useAuth();
  const canClearHistory =
    myRole === "manager" || myRole === "installer" || myRole === "admin";
  const canEditCash = can(myRole, "kas.tambah", rolePermissions);
  const canDeleteCash = can(myRole, "kas.hapus", rolePermissions);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const paidTime = (h: HistoryRecord) => h.paidAt ?? h.endAt;
  const history = [...rawHistory]
    .filter((h) => inRange(paidTime(h), range))
    .sort((a, b) => paidTime(b) - paidTime(a));
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = history.find((h) => h.id === openId) ?? null;
  // Ringkasan memakai periode hari usaha yang dipilih, bukan tanggal kalender.
  const today = history;

  const cashToday = cashEntries.filter((e) => inRange(e.createdAt, range));
  const cashSum = (pick: (e: (typeof cashEntries)[number]) => boolean) =>
    cashToday.filter(pick).reduce((s, e) => s + e.amount, 0);
  const otherIncome = cashSum((e) => e.direction === "in" && entryAccount(e) === "other");
  const cardSalesTotal = cashSum((e) => e.direction === "in" && entryAccount(e) === "sales");
  const expense = cashSum((e) => e.direction === "out" && !e.payout);
  const payoutIn = cashSum((e) => e.direction === "in" && e.payout);
  const payoutOut = cashSum((e) => e.direction === "out" && e.payout);

  const sum = (
    arr: typeof history,
    key: "rentalTotal" | "fnbTotal" | "total" | "addonTotal",
  ) => arr.reduce((s, h) => s + (h[key] ?? 0), 0);


  const groups = history.reduce<Record<string, typeof history>>((acc, h) => {
    const k = dayKey(paidTime(h), range.hours);
    (acc[k] ||= []).push(h);
    return acc;
  }, {});


  const exportCsv = () => {
    const header = ["Tanggal", businessProfile?.unitLabel || "TV", "Pelanggan", "Paket", "Pembayaran", "Durasi", "Rental", "Additional Rental", "F&B", "Total"];
    const rows = history.map((h) => [new Date(h.endAt).toLocaleString("id-ID"), h.stationName, h.customerName ?? "Umum", h.packageName ?? h.mode, h.payment ?? "Cash", h.minutes, h.rentalTotal, h.addonTotal ?? 0, h.fnbTotal, h.total]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `laporan-ps-rental-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Rekap pendapatan dari sesi rental dan penjualan kasir.
        </p>
        {history.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Cetak
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Ekspor CSV
            </Button>
            {canClearHistory && (
              <Button
                variant="outline"
                onClick={() =>
                  confirm({
                    title: "Hapus seluruh riwayat transaksi?",
                    description:
                      "Semua nota transaksi akan hilang dan tidak bisa dikembalikan.",
                    actionLabel: "Hapus riwayat",
                    requireTypedWord: "HAPUS",
                    onConfirm: () => {
                      clearHistory();
                      addLog(
                        "Hapus seluruh riwayat transaksi",
                        `${history.length} nota`,
                      );
                      toast.success("Riwayat transaksi dihapus");
                    },
                  })
                }
              >
                <Trash2 className="size-4" /> Hapus riwayat
              </Button>
            )}
          </div>
        )}
      </header>

      {confirmDialog}



      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Rental periode ini" value={formatRupiah(sum(today, "rentalTotal"))} />
        <Stat
          label="Additional Rental"
          value={formatRupiah(sum(today, "addonTotal"))}
        />
        <Stat label="Makanan & minuman" value={formatRupiah(sum(today, "fnbTotal"))} />
        <Stat label="PLAYING CARD SALES" value={formatRupiah(cardSalesTotal)} />
        <Stat label="OTHER REVENUE" value={formatRupiah(otherIncome)} />
        <Stat label="EXPENSES (BIAYA)" value={formatRupiah(expense)} />
        <Stat
          label="Total pendapatan periode ini"
          value={formatRupiah(sum(today, "total") + cardSalesTotal + otherIncome)}
        />
        <Stat
          label="Sisa bersih periode ini"
          value={formatRupiah(sum(today, "total") + cardSalesTotal + otherIncome - expense)}
          highlight
        />
      </section>

      {(payoutIn > 0 || payoutOut > 0) && (
        <p className="text-sm text-muted-foreground">
          PAY-IN / PAY-OUT periode ini (tidak dihitung sebagai REVENUE / EXPENSES): PAY-IN{" "}
          {formatRupiah(payoutIn)} · PAY-OUT {formatRupiah(payoutOut)}.
        </p>
      )}

      {cashToday.length > 0 && (
        <section className="surface-panel overflow-x-auto p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Finance — PAY-IN &amp; PAY-OUT periode ini</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Pelaku</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                {(canEditCash || canDeleteCash) && (
                  <TableHead className="text-right">Aksi</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashToday.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{dateTimeOf(e.createdAt)}</TableCell>
                  <TableCell>{e.createdBy || "-"}</TableCell>
                  <TableCell>{e.categoryName}</TableCell>
                  <TableCell>{e.group}</TableCell>
                  <TableCell>
                    {e.payout
                      ? e.direction === "in"
                        ? "PAY-IN"
                        : "PAY-OUT"
                      : e.direction === "in"
                        ? entryAccount(e) === "sales" ? `SALES · ${e.categoryName.toUpperCase()}` : "OTHER REVENUE"
                        : "EXPENSES (BIAYA)"}
                  </TableCell>
                  <TableCell>
                    {canEditCash ? (
                      <Select
                        value={e.payment}
                        onValueChange={(value) => {
                          if (value === e.payment) return;
                          updateCashEntry(e.id, { payment: value });
                          toast.success(`Metode diubah ke ${value}`);
                        }}
                      >
                        <SelectTrigger className="h-8 w-32" aria-label={`Metode ${e.categoryName}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(paymentMethods.some((m) => m.name === e.payment)
                            ? paymentMethods.map((m) => m.name)
                            : [e.payment, ...paymentMethods.map((m) => m.name)]
                          ).map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      e.payment
                    )}
                  </TableCell>
                  <TableCell>{e.note || "-"}</TableCell>
                  <TableCell
                    className={
                      e.direction === "in"
                        ? "text-right font-semibold text-accent"
                        : "text-right font-semibold text-destructive"
                    }
                  >
                    {e.direction === "in" ? "+" : "-"}
                    {formatRupiah(e.amount)}
                  </TableCell>
                  {(canEditCash || canDeleteCash) && (
                    <TableCell className="text-right">
                      {canDeleteCash && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Hapus catatan ${e.categoryName}`}
                          onClick={() =>
                            confirm({
                              title: `Hapus catatan ${e.categoryName}?`,
                              description: e.cardId
                                ? "Catatan kas dan riwayat kartunya ikut dihapus. Kalau ini top-up, saldo kartu dikembalikan."
                                : "Catatan ini akan hilang dari laporan dan tidak bisa dikembalikan.",
                              destructive: true,
                              onConfirm: () => {
                                removeCashEntry(e.id);
                                toast.success("Catatan kas dihapus");
                              },
                            })
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {history.length === 0 ? (
        <p className="surface-panel p-10 text-center text-muted-foreground">
          Belum ada transaksi. Akhiri sebuah sesi di Dashboard untuk mencatatnya di
          sini.
        </p>
      ) : (
        Object.entries(groups).map(([day, records]) => (
          <section key={day} className="surface-panel overflow-x-auto p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{day}</h2>
              <Badge variant="outline" className="border-accent text-accent">
                {formatRupiah(sum(records, "total"))}
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jam</TableHead>
                  <TableHead>{businessProfile?.unitLabel || "TV"}</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Kasir</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Pembayaran</TableHead>
                  <TableHead className="text-right">Durasi</TableHead>
                  <TableHead className="text-right">Rental</TableHead>
                  <TableHead className="text-right">Add. Rental</TableHead>
                  <TableHead className="text-right">F&amp;B</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap">
                      {timeOf(paidTime(h))}
                      <span className="block text-xs text-muted-foreground">
                        {timeOf(h.startAt)} – {timeOf(h.endAt)}
                        {h.ongoing ? " · masih main" : ""}
                      </span>
                    </TableCell>

                    <TableCell>
                      {h.stationName}{" "}
                      <span className="text-muted-foreground">({h.console})</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{h.customerName ?? "Umum"}<span className="block text-xs text-muted-foreground">{h.packageName ?? "-"}</span></TableCell>
                    <TableCell className="whitespace-nowrap">{h.cashierName ?? "-"}</TableCell>
                    <TableCell>
                      {h.mode === "open" ? "Sepuasnya" : "Per Jam"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {h.payment ?? "Cash"}
                    </TableCell>
                    <TableCell className="text-right">{h.minutes} mnt</TableCell>
                    <TableCell className="text-right">
                      {formatRupiah(h.rentalTotal)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatRupiah(h.addonTotal ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatRupiah(h.fnbTotal)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatRupiah(h.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenId(h.id)}>
                        <Receipt className="size-4" /> Buka
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ))
      )}

      {selected && (
        <ReceiptDialog
          record={selected}
          open={Boolean(openId)}
          onOpenChange={(value) => setOpenId(value ? openId : null)}
        />
      )}
    </div>
  );
}

function ReceiptDialog({
  record,
  open,
  onOpenChange,
}: {
  record: HistoryRecord;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const {
    paymentMethods,
    updateHistoryPayment,
    removeHistory,
    rolePermissions,
    printers,
    receiptLayout,
    invoiceLayout,
  } = useBilling();
  const { role } = useAuth();
  const { store } = useStoreInfo(true);
  const printDoc = (kind: "receipt" | "invoice") => {
    if (!can(role, "cetak.struk", rolePermissions)) {
      toast.error("Levelmu belum punya hak akses mencetak struk");
      return;
    }
    const printer = printerFor(printers, kind);
    if (!printer) {
      toast.error("Printer belum diatur di menu Printer");
      return;
    }
    printReceipt({
      record,
      store: store as PrintStore,
      printer,
      layout: kind === "invoice" ? invoiceLayout : receiptLayout,
      kind,
    });
  };
  const canDelete = can(role, "laporan.hapus", rolePermissions);
  const [method, setMethod] = useState(record.payment ?? "Cash");
  const [confirm, setConfirm] = useState(false);
  const options = paymentMethods.filter((p) => p.active);
  const { confirm: askConfirm, dialog: askDialog } = useConfirm();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nota transaksi</DialogTitle>
        </DialogHeader>

        <ReceiptView record={record} />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => printDoc("receipt")}
          >
            <Printer className="size-4" /> Cetak struk
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Ubah metode pembayaran</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Pilih metode" />
              </SelectTrigger>
              <SelectContent>
                {options.map((item) => (
                  <SelectItem key={item.id} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() =>
                askConfirm({
                  title: "Simpan perubahan?",
                  description: `Metode pembayaran nota ini diubah menjadi ${method}.`,
                  actionLabel: "Simpan",
                  destructive: false,
                  onConfirm: () => {
                    updateHistoryPayment(record.id, {
                      payment: method,
                      payments: [],
                    });
                    toast.success("Metode pembayaran diperbarui");
                  },
                })
              }
            >
              Simpan
            </Button>
            {askDialog}
            {canDelete && (
              <Button variant="destructive" onClick={() => setConfirm(true)}>
                <Trash2 className="size-4" /> Hapus nota
              </Button>
            )}
          </div>
          {record.payments && record.payments.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Nota ini dibayar dengan beberapa metode. Menyimpan metode tunggal akan
              menggantikan rincian tersebut.
            </p>
          )}
          {!canDelete && (
            <p className="text-xs text-muted-foreground">
              Hanya admin yang dapat menghapus nota.
            </p>
          )}
        </div>

        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus nota ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Nota akan dihapus dari riwayat dan laporan. Tindakan ini tidak bisa
                dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  removeHistory(record.id);
                  setConfirm(false);
                  onOpenChange(false);
                  toast.success("Nota dihapus");
                }}
              >
                Ya, hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="surface-panel p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        data-report-stat={label}
        className={
          highlight
            ? "font-display text-2xl font-bold text-accent"
            : "font-display text-2xl font-bold"
        }
      >
        {value}
      </p>
    </div>
  );
}
