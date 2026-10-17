import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, RotateCcw, Eraser } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { useBilling } from "@/lib/billing-store";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({
    meta: [
      { title: "Backup & Restore Data — RenToPlay" },
      {
        name: "description",
        content:
          "Cadangkan seluruh pengaturan dan transaksi rental PlayStation ke file Excel, pulihkan kembali, atau reset data ke pengaturan awal.",
      },
      { property: "og:title", content: "Backup & Restore Data — RenToPlay" },
      {
        property: "og:description",
        content: "Backup Excel, restore, dan reset data aplikasi RenToPlay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackupPage,
});

type Row = Record<string, unknown>;

const SHEETS: { sheet: string; key: string }[] = [
  { sheet: "Unit TV", key: "stations" },
  { sheet: "Tarif", key: "rates" },
  { sheet: "Menu", key: "menu" },
  { sheet: "Meja Kafe", key: "cafeTables" },

  { sheet: "Pembayaran", key: "paymentMethods" },
  { sheet: "Paket", key: "packages" },
  { sheet: "Pelanggan", key: "customers" },
  { sheet: "Booking", key: "bookings" },
  { sheet: "Promo", key: "promotions" },
  { sheet: "Poin", key: "pointEntries" },
  { sheet: "Playing Card", key: "playingCards" },
  { sheet: "Transaksi Kartu", key: "cardEntries" },
  { sheet: "Item Kas", key: "cashCategories" },
  { sheet: "Kategori Kas", key: "cashGroups" },
  { sheet: "Kas & Biaya", key: "cashEntries" },
  { sheet: "Transaksi", key: "history" },
  { sheet: "Pengaturan", key: "settings" },
];

function encode(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value as string | number | boolean;
}

function decode(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function toRows(items: Row[]): Row[] {
  return items.map((item) =>
    Object.fromEntries(Object.entries(item).map(([k, v]) => [k, encode(v)])),
  );
}

function fromRows(rows: Row[]): Row[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, decode(v)])),
  );
}

function BackupPage() {
  const billing = useBilling();
  const { exportSnapshot, replaceAll, resetAll, resetTransactions } = billing;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmTrx, setConfirmTrx] = useState(false);

  const handleExport = () => {
    const snap = exportSnapshot();
    const wb = XLSX.utils.book_new();

    for (const { sheet, key } of SHEETS) {
      let rows: Row[] = [];
      if (key === "rates") {
        rows = snap.consoleTypes.map((name) => ({
          console: name,
          tarifPerJam: snap.rates[name] ?? 0,
        }));
      } else if (key === "settings") {
        rows = [
          { pengaturan: "roundingRule", nilai: snap.roundingRule },
          { pengaturan: "defaultBonusMin", nilai: snap.defaultBonusMin },
          { pengaturan: "pointsPerRupiah", nilai: snap.pointsPerRupiah },
        ];
      } else {
        rows = toRows((snap as unknown as Record<string, Row[]>)[key] ?? []);
      }
      if (rows.length === 0) rows = [{}];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
    }

    XLSX.writeFile(
      wb,
      `backup-billing-ps-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    toast.success("Backup berhasil diunduh");
  };

  const handleImport = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const snap = exportSnapshot();
      const next: Record<string, unknown> = { ...snap };

      for (const { sheet, key } of SHEETS) {
        const ws = wb.Sheets[sheet];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });

        if (key === "rates") {
          const consoleTypes: string[] = [];
          const rates: Record<string, number> = {};
          for (const row of rows) {
            const name = String(row["console"] ?? "").trim();
            if (!name) continue;
            consoleTypes.push(name);
            rates[name] = Number(row["tarifPerJam"]) || 0;
          }
          if (consoleTypes.length > 0) {
            next["consoleTypes"] = consoleTypes;
            next["rates"] = rates;
          }
        } else if (key === "settings") {
          for (const row of rows) {
            const name = String(row["pengaturan"] ?? "").trim();
            const raw = row["nilai"];
            if (name === "roundingRule" && raw) next["roundingRule"] = String(raw);
            if (name === "defaultBonusMin") next["defaultBonusMin"] = Number(raw) || 0;
            if (name === "pointsPerRupiah") next["pointsPerRupiah"] = Number(raw) || 0;
          }
        } else {
          next[key] = fromRows(rows).filter(
            (row) => Object.values(row).some((v) => v !== "" && v !== undefined),
          );
        }
      }

      replaceAll(next);
      toast.success("Data berhasil dipulihkan dari file Excel");
    } catch (error) {
      console.error(error);
      toast.error("File tidak bisa dibaca. Pastikan memakai file backup Excel.");
    }
  };

  const counts = [
    { label: "Unit TV", value: billing.stations.length },
    { label: "Jenis konsol", value: billing.consoleTypes.length },
    { label: "Menu kasir", value: billing.menu.length },
    { label: "Paket rental", value: billing.packages.length },
    { label: "Metode pembayaran", value: billing.paymentMethods.length },
    { label: "Pelanggan", value: billing.customers.length },
    { label: "Booking", value: billing.bookings.length },
    { label: "Transaksi tersimpan", value: billing.history.length },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Backup &amp; Restore</h1>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {counts.map((item) => (
          <div key={item.label} className="surface-panel p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {item.label}
            </p>
            <p className="font-display text-2xl font-bold">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="surface-panel space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Backup ke Excel</h2>
          <p className="text-sm text-muted-foreground">
            File berisi lembar terpisah untuk unit TV, tarif, menu, paket,
            pembayaran, pelanggan, booking, promo, poin, transaksi, dan pengaturan.
            Nilainya bisa diedit langsung di Excel lalu dipulihkan kembali.
          </p>
        </div>
        <Button onClick={handleExport}>
          <Download className="size-4" /> Unduh file backup
        </Button>
      </section>

      <section className="surface-panel space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Restore dari Excel</h2>
          <p className="text-sm text-muted-foreground">
            Pilih file backup untuk mengganti seluruh data saat ini. Sesi yang
            sedang berjalan akan mengikuti isi file.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Pilih file backup
        </Button>
      </section>

      <section className="surface-panel space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Reset Semua Transaksi</h2>
          <p className="text-sm text-muted-foreground">
            Menghapus seluruh transaksi, sesi berjalan, pesanan meja, reservasi,
            playing card, PAY-IN/PAY-OUT, shift, hari usaha, poin, dan log
            aktivitas. Semua data di menu Setup tetap tersimpan.
          </p>
        </div>
        <Button variant="outline" onClick={() => setConfirmTrx(true)}>
          <Eraser className="size-4" /> Reset Semua Transaksi
        </Button>

      </section>

      <section className="surface-panel space-y-4 border-destructive/40 p-6">
        <div>
          <h2 className="text-lg font-semibold text-destructive">
            Reset ke pengaturan awal
          </h2>
          <p className="text-sm text-muted-foreground">
            Semua transaksi, pelanggan, booking, dan perubahan pengaturan akan
            dihapus. Unit TV, tarif, dan menu kembali seperti awal aplikasi.
            Sebaiknya unduh backup dulu.
          </p>
        </div>
        <Button variant="destructive" onClick={() => setConfirmReset(true)}>
          <RotateCcw className="size-4" /> Reset semua data
        </Button>
      </section>

      <AlertDialog open={confirmTrx} onOpenChange={setConfirmTrx}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset semua transaksi?</AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh transaksi, reservasi, playing card, PAY-IN/PAY-OUT,
              shift, dan riwayat terkait transaksi akan dihapus. Data di menu
              Setup tidak berubah.
            </AlertDialogDescription>

          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetTransactions();
                toast.success("Semua transaksi sudah dihapus");
              }}
            >
              Ya, reset semua transaksi

            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset semua data?</AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh transaksi dan pengaturan akan dihapus dan tidak bisa
              dikembalikan kecuali Anda punya file backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetAll();
                toast.success("Data dikembalikan ke pengaturan awal");
              }}
            >
              Ya, reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
