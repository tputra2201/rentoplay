import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, LogIn, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRupiah, pendingPaymentRecords, shiftSummary, useBilling } from "@/lib/billing-store";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/shift")({
  head: () => ({
    meta: [
      { title: "Shift Kasir — Check-in & Close Out" },
      {
        name: "description",
        content:
          "Check-in sebelum mulai shift kasir untuk melihat uang kas yang harus ada di laci, lalu isi form close out saat menutup kasir.",
      },
      { property: "og:title", content: "Shift Kasir — Check-in & Close Out" },
      {
        property: "og:description",
        content:
          "Kelola pembukaan shift kasir dan hitung selisih uang laci saat tutup kasir.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShiftPage,
});

function clock(ts?: number) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ShiftPage() {
  const {
    shifts,
    history,
    cashEntries,
    now,
    openShift,
    closeShift,
    activeBusinessDay,
    stations,
    cafeTables,
  } = useBilling();
  const { fullName, user, role } = useAuth();

  const active = shifts.find((s) => !s.closedAt) ?? null;
  // Urutan daftar shift bisa teracak setelah sinkronisasi, jadi shift terakhir
  // ditentukan dari waktu tutup terbaru — bukan dari posisi di daftar.
  const lastClosed = useMemo(
    () =>
      shifts
        .filter((s) => s.closedAt)
        .reduce<typeof shifts[number] | null>(
          (best, s) => (!best || (s.closedAt ?? 0) > (best.closedAt ?? 0) ? s : best),
          null,
        ),
    [shifts],
  );
  const suggestedStart = lastClosed?.nextStartCash ?? 0;

  const sortedShifts = useMemo(
    () => [...shifts].sort((a, b) => b.openedAt - a.openedAt),
    [shifts],
  );

  const cashierName = fullName.trim() || user?.email || "Kasir";

  const dayShifts = activeBusinessDay
    ? shifts.filter((s) => s.openedAt >= activeBusinessDay.openedAt)
    : [];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Shift Kasir</h1>
      </header>

      {activeBusinessDay && (
        <section className="surface-panel grid gap-4 p-4 sm:grid-cols-3 sm:p-6">
          <Field label="Hari usaha dibuka" value={clock(activeBusinessDay.openedAt)} />
          <Field label="Jumlah shift hari ini" value={`${dayShifts.length} shift`} />
          <Field
            label="Berjalan selama"
            value={`${Math.floor((now - activeBusinessDay.openedAt) / 3_600_000)} jam ${Math.floor(
              ((now - activeBusinessDay.openedAt) % 3_600_000) / 60_000,
            )} menit`}
            highlight
          />
        </section>
      )}

      {active ? (
        <CloseOutForm
          shift={active}
          summary={shiftSummary(
            active,
            [...history, ...pendingPaymentRecords({ stations, cafeTables, history })],
            cashEntries,
            now,
          )}
          onClose={closeShift}
        />
      ) : (
        <CheckInCard
          cashierName={cashierName}
          role={role ?? "kasir"}
          suggested={suggestedStart}
          lastClosedAt={lastClosed?.closedAt}
          onOpen={(startCash) => {
            const row = openShift({
              cashierName,
              ...(user?.id ? { cashierId: user.id } : {}),
              startCash,
            });
            if (!row) {
              toast.error("Check-in gagal, masih ada shift yang belum ditutup");
              return;
            }
            toast.success(`Shift ${row.cashierName} dimulai`);
          }}
        />
      )}

      <section className="surface-panel overflow-x-auto p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Riwayat shift</h2>
        {shifts.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Belum ada shift yang dicatat.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kasir</TableHead>
                <TableHead>Opening</TableHead>
                <TableHead>Closing</TableHead>
                <TableHead className="text-right">Kas Awal</TableHead>
                <TableHead className="text-right">Kas Seharusnya</TableHead>
                <TableHead className="text-right">Kas Fisik</TableHead>
                <TableHead className="text-right">Selisih Kas</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedShifts.map((s) => {
                const sum = shiftSummary(s, history, cashEntries, now);
                const actual = s.cashActual ?? 0;
                const diff = s.closedAt ? actual - sum.expected : 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell>{s.cashierName}</TableCell>
                    <TableCell className="whitespace-nowrap">{clock(s.openedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.closedAt ? (
                        clock(s.closedAt)
                      ) : (
                        <Badge variant="secondary">Sedang bertugas</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatRupiah(s.startCash)}</TableCell>
                    <TableCell className="text-right">{formatRupiah(sum.expected)}</TableCell>
                    <TableCell className="text-right">
                      {s.closedAt ? formatRupiah(actual) : "-"}
                    </TableCell>
                    <TableCell
                      className={
                        diff === 0
                          ? "text-right"
                          : diff > 0
                            ? "text-right font-semibold text-accent"
                            : "text-right font-semibold text-destructive"
                      }
                    >
                      {s.closedAt ? formatRupiah(diff) : "-"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {s.balanceNote || "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function CheckInCard({
  cashierName,
  role,
  suggested,
  lastClosedAt,
  onOpen,
}: {
  cashierName: string;
  role: string;
  suggested: number;
  lastClosedAt?: number | undefined;
  onOpen: (startCash: number) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [startCash, setStartCash] = useState(String(suggested));

  // Angka anjuran bisa berubah setelah data tersinkron dari pusat.
  const [lastSuggested, setLastSuggested] = useState(suggested);
  if (lastSuggested !== suggested) {
    setLastSuggested(suggested);
    setStartCash(String(suggested));
  }

  return (
    <section className="surface-panel space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <LogIn className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Check-in shift</h2>
      </div>

      {!opened ? (
        <>
          <p className="text-sm text-muted-foreground">
            Klik check-in untuk melihat uang kas yang seharusnya tersedia di laci.
          </p>
          <Button onClick={() => setOpened(true)}>
            <ClipboardCheck className="size-4" /> Check-in
          </Button>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama kasir" value={cashierName} />
            <Field label="Level" value={role} />
            <Field
              label="Uang kas yang harus ada di laci"
              value={formatRupiah(suggested)}
              highlight
            />
            <Field
              label="Ditinggalkan shift sebelumnya"
              value={lastClosedAt ? clock(lastClosedAt) : "Belum ada shift sebelumnya"}
            />
          </div>

          <div className="space-y-1.5 sm:max-w-xs">
            <label className="text-sm font-medium" htmlFor="start-cash">
              Uang kas awal (hitung fisik)
            </label>
            <Input
              id="start-cash"
              type="number"
              min={0}
              value={startCash}
              onChange={(e) => setStartCash(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const value = Number(startCash);
                if (!Number.isFinite(value) || value < 0) {
                  toast.error("Isi jumlah uang kas awal");
                  return;
                }
                onOpen(value);
              }}
            >
              <Wallet className="size-4" /> Mulai shift
            </Button>
            <Button variant="ghost" onClick={() => setOpened(false)}>
              Batal
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function CloseOutForm({
  shift,
  summary,
  onClose,
}: {
  shift: import("@/lib/billing-store").CashShift;
  summary: import("@/lib/billing-store").ShiftSummary;
  onClose: (
    id: string,
    input: { cashActual: number; balanceNote?: string; nextStartCash?: number },
  ) => unknown;
}) {
  const { businessProfile } = useBilling();
  const cardOn = businessProfile?.modules?.playingCard !== false;
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  // Next start cash mengikuti cash actual yang diinput kasir; 0 bila belum diisi.
  const [nextStart, setNextStart] = useState("0");
  const [nextStartEdited, setNextStartEdited] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const actualValue = Number(actual);
  const balance = useMemo(
    () => (Number.isFinite(actualValue) ? actualValue - summary.expected : 0),
    [actualValue, summary.expected],
  );
  const nextStartValue = Number(nextStart);
  const cashToDeposit = Number.isFinite(actualValue) && Number.isFinite(nextStartValue)
    ? actualValue - nextStartValue
    : 0;

  const validate = () => {
    if (!actual.trim() || !Number.isFinite(actualValue) || actualValue < 0) {
      toast.error("Isi jumlah uang fisik di laci");
      return false;
    }
    if (!Number.isFinite(nextStartValue) || nextStartValue < 0) {
      toast.error("Isi kas awal shift berikutnya");
      return false;
    }
    if (nextStartValue > actualValue) {
      toast.error("Kas awal berikutnya tidak boleh melebihi uang fisik di laci");
      return false;
    }
    if (balance !== 0 && !note.trim()) {
      toast.error("Ada selisih kas, isi catatan selisih dulu");
      return false;
    }
    return true;
  };

  const submitClose = () => {
    const row = onClose(shift.id, {
      cashActual: actualValue,
      balanceNote: note,
      nextStartCash: nextStartValue,
    });
    if (!row) {
      toast.error("Tutup shift gagal");
      return;
    }
    setActual("");
    setNote("");
    setConfirmOpen(false);
    toast.success(`Shift ${shift.cashierName} ditutup`);
  };

  return (
    <section className="surface-panel space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Cash Close Out</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nama kasir" value={shift.cashierName} />
        <Field label="Opening Shift" value={clock(shift.openedAt)} />
        <Field label="Closing Shift" value={clock(Date.now())} />
      </div>

      <MoneySection title="CASH IN">
        <MoneyLine label="START CASH" value={shift.startCash} />
        <MoneyLine label="CASH SALES" value={summary.cashSales} hint="Rental, kafe, dan penjualan Playing Card tunai" />
        <MoneyLine label="OTHER REVENUE" value={summary.otherRevenue} />
        <MoneyLine label="TAMBAHAN KAS MASUK" value={summary.additionalCashIn} />
        {(cardOn || summary.cardTopup !== 0) && (
          <MoneyLine label="TOP UP PLAYING CARD" value={summary.cardTopup} />
        )}
        <MoneyLine label="DP RESERVASI MASUK" value={summary.bookingDp} hint="DP tunai yang diterima pada shift ini" />
        <MoneyLine label="TOTAL CASH IN" value={shift.startCash + summary.sales + summary.paidIn} strong />
      </MoneySection>

      <MoneySection title="CASH OUT">
        <MoneyLine label="EXPENSES (BIAYA)" value={summary.expenses} />
        <MoneyLine label="PRIVE / SETORAN TUNAI" value={summary.ownerDeposit} hint="Ke owner atau bank" />
        <MoneyLine label="TOTAL CASH OUT" value={summary.expenses + summary.ownerDeposit} strong />
      </MoneySection>

      <NonCashBox from={shift.openedAt} />


      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="cash-actual">
            CASH ACTUAL (hasil hitung fisik uang di laci)
          </label>
          <Input
            id="cash-actual"
            type="number"
            min={0}
            value={actual}
            placeholder="0"
            onChange={(e) => {
              setActual(e.target.value);
              if (!nextStartEdited) setNextStart(e.target.value);
            }}
          />
        </div>
        <Field
          label="BALANCE CASH (selisih)"
          value={formatRupiah(balance)}
          tone={balance === 0 ? undefined : balance > 0 ? "accent" : "danger"}
        />
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="balance-note">
            BALANCE NOTE
          </label>
          <Input
            id="balance-note"
            value={note}
            placeholder="Alasan selisih uang"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="next-start">
            NEXT START CASH
          </label>
          <Input
            id="next-start"
            type="number"
            min={0}
            value={nextStart}
            onChange={(e) => {
              setNextStart(e.target.value);
              setNextStartEdited(true);
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CASH EXPECTED (uang yang harus ada di laci)" value={formatRupiah(summary.expected)} highlight />
        <Field label="SETORAN KE OWNER / BANK" value={formatRupiah(cashToDeposit)} highlight />
      </div>

      <Button
        onClick={() => {
          if (validate()) setConfirmOpen(true);
        }}
      >
        Close Out
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Tutup Shift</AlertDialogTitle>
            <AlertDialogDescription>
              Periksa kembali ringkasan uang sebelum shift ditutup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 rounded-md border p-4 text-sm">
            <MoneyLine label="CASH EXPECTED" value={summary.expected} />
            <MoneyLine label="CASH ACTUAL" value={actualValue} />
            <MoneyLine label="BALANCE CASH" value={balance} strong />
            <MoneyLine label="NEXT START CASH" value={nextStartValue} />
            <MoneyLine label="SETORAN KE OWNER / BANK" value={cashToDeposit} strong />
            {note.trim() && <p className="border-t pt-2 text-muted-foreground">Catatan: {note.trim()}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal / Cek Lagi</AlertDialogCancel>
            <AlertDialogAction onClick={submitClose}>Ya, Tutup Shift Sekarang</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function MoneySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-4">
      <h3 className="mb-3 text-sm font-bold text-accent">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MoneyLine({ label, value, strong, hint }: { label: string; value: number; strong?: boolean; hint?: string }) {
  return (
    <div className={strong ? "flex items-end justify-between gap-4 border-t pt-2 font-bold" : "flex items-end justify-between gap-4 text-sm"}>
      <span>{label}{hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}</span>
      <span className="whitespace-nowrap">{formatRupiah(value)}</span>
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "accent" | "danger" | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          tone === "accent"
            ? "font-display text-lg font-semibold text-accent"
            : tone === "danger"
              ? "font-display text-lg font-semibold text-destructive"
              : highlight
                ? "font-display text-lg font-semibold text-primary"
                : "font-display text-lg font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

/** Ringkasan uang non-tunai selama shift: sekadar info, tidak masuk hitungan laci. */
function NonCashBox({ from }: { from: number }) {
  const { history, cashEntries } = useBilling();
  const to = Date.now();
  const within = (t: number) => t >= from && t <= to;
  const rows = new Map<string, number>();
  const add = (m: string, v: number) => rows.set(m, (rows.get(m) ?? 0) + v);
  for (const h of history) {
    if (!within(h.paidAt ?? h.endAt)) continue;
    if (h.payments?.length) for (const p of h.payments) { if (p.method !== "Cash") add(p.method, p.amount); }
    else if ((h.payment || "Cash") !== "Cash") add(h.payment!, h.total);
  }
  for (const e of cashEntries) {
    if (!within(e.createdAt) || e.payment === "Cash") continue;
    add(e.payment, e.direction === "in" ? e.amount : -e.amount);
  }
  const list = [...rows.entries()].filter(([, v]) => v !== 0);
  if (list.length === 0) return null;
  return (
    <div className="rounded-md border border-dashed p-4 text-sm">
      <p className="mb-2 font-bold">PEMBAYARAN NON-TUNAI</p>
      <p className="mb-2 text-xs text-muted-foreground">Tidak masuk laci, hanya informasi.</p>
      {list.map(([m, v]) => (
        <div key={m} className="flex justify-between text-muted-foreground">
          <span>{m}</span><span>{formatRupiah(v)}</span>
        </div>
      ))}
    </div>
  );
}
