import { useUnitLabel } from "@/lib/billing-store";
import { useEffect, useState } from "react";
import { Ban, Play, Square, Plus, Trash2, Timer, Infinity as InfinityIcon, CheckCircle2, Wallet, AlertTriangle, Printer as PrinterIcon } from "lucide-react";
import { OrderDraftDialog } from "@/components/OrderDraftDialog";
import { VoidDialog } from "@/components/VoidDialog";
import { PromoPicker } from "@/components/PromoPicker";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CustomerPicker } from "@/components/CustomerPicker";
import { CardPaymentPanel } from "@/components/CardPaymentPanel";
import { ShiftLockedNotice, useShiftGate } from "@/components/ShiftGate";
import { PaidPrintDialog } from "@/components/PaidPrintDialog";
import { OrderSelectionActions } from "@/components/OrderSelectionActions";

import {
  labelItemsFor,
  printLabels,
  printReceipt,
  receiptText,
  type PrintStore,
} from "@/lib/print-docs";
import { BillPreviewDialog } from "@/components/BillPreviewDialog";
import { printerFor, type PrinterConfig } from "@/lib/printing";
import { useStoreInfo } from "@/lib/store-info";
import { useConfirm } from "@/components/ConfirmDialog";
import { useCan } from "@/lib/use-can";
import {
  CARD_PAYMENT_NAME,
  sessionBill,
  findCardByNumber,
  elapsedSeconds,
  fnbTotal,
  formatClock,
  formatRupiah,
  paidTotal,
  isPaused,
  pausedMsTotal,
  remainingSeconds,
  rentalTotal,
  rentalMinutes,
  addonAmount,
  useBilling,
  type ConsoleType,
  type DiscountType,
  type Station,
  type OrderItem,
  orderLabel,
} from "@/lib/billing-store";



// Wrapper: hanya mengembalikan null saat tidak ada unit terpilih. Dengan begitu
// semua hook di StationDialogBody selalu berjalan dengan jumlah yang sama.
export function StationDialog({
  station,
  open,
  onOpenChange,
  initialSection = "timer",
}: {
  station: Station | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: "timer" | "order" | "payment";
}) {
  if (!station) return null;
  return (
    <StationDialogBody
      station={station}
      open={open}
      onOpenChange={onOpenChange}
      initialSection={initialSection}
    />
  );
}

function StationDialogBody({
  station,
  open,
  onOpenChange,
  initialSection = "timer",
}: {
  station: Station;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: "timer" | "order" | "payment";
}) {
  const [section, setSection] = useState<"timer" | "order" | "payment">(initialSection);
  const unit = useUnitLabel();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirm();
  const allow = useCan();
  const {
    now,
    bookings,
    rates,
    consoleTypes,
    menu,
    menuCategories,

    startSession,
    stopSession,
    settleSession,
    removeSettlement,
    addTime,
    addOrder,
    removeOrder,
    setStationConsole,
    paymentMethods,
    packages,
    defaultBonusMin,
    adjustBonusTime,
    customers,
    updateSessionCustomer,
    playingCards,
    cardDiscountPercent,
    cardMemberDiscountPercent,
    consoleDiscounts,
    promotions,
    setSessionDiscount,
    chargeCard,
    printers,
    history,
    receiptLayout,
    addonRentals,
    addSessionAddon,
    updateSessionAddon,
    removeSessionAddon,

    stations,
    moveSession,
    voidSession,
    cafeTables,
    businessProfile,
    mergeStations,
    unmergeStations,
    linkCafeTable,
  } = useBilling();
  const [mergeOpen, setMergeOpen] = useState(false);

  const { requireShift } = useShiftGate();
  const { store: storeInfo } = useStoreInfo(true);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [paidRecord, setPaidRecord] = useState<import("@/lib/billing-store").HistoryRecord | null>(
    null,
  );
  // Setelah tagihan lunas, tawarkan cetak struk walau sesi masih berjalan.
  const [wantPrint, setWantPrint] = useState(false);
  // Waktu bermain sudah habis dan tagihan baru dilunasi: sesi ditutup otomatis.
  const [autoEnd, setAutoEnd] = useState(false);

  const paidHistoryId = station?.session?.historyId;
  useEffect(() => {
    if (!wantPrint || !paidHistoryId) return;
    const found = history.find((h) => h.id === paidHistoryId);
    if (!found) return;
    setWantPrint(false);
    setPaidRecord(found);
  }, [wantPrint, paidHistoryId, history]);
  const labelPrinters = printers.filter((p) => p.active);
  const labelHeading = (p: PrinterConfig) =>
    p.role === "bar" ? "BAR" : p.role === "kitchen" ? "DAPUR" : p.name;
  /** Cetak label untuk satu atau semua pesanan, sesuai printer yang diatur per menu. */
  const printOrderLabels = (orders: OrderItem[], source: string, customerName?: string) => {
    let printed = 0;
    for (const printer of labelPrinters) {
      const items = labelItemsFor(orders, menu, printer.id);
      if (items.length === 0) continue;
      printLabels({
        printer,
        items,
        heading: labelHeading(printer),
        source,
        ...(customerName ? { customerName } : {}),
      });
      printed += items.length;
    }
    if (printed === 0) {
      toast.error("Label belum bisa dicetak", {
        description: "Atur printer label untuk menu ini di menu Printer.",
      });
    }
  };
  const [cardNumber, setCardNumber] = useState("");
  const [editCustomer, setEditCustomer] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editMember, setEditMember] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState("");
  const [duration, setDuration] = useState(60);
  const [customDuration, setCustomDuration] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [moveConsole, setMoveConsole] = useState("");
  const [addonPick, setAddonPick] = useState("");
  const [addonMinutes, setAddonMinutes] = useState("");

  const freeStations = stations.filter((s) => s.id !== station?.id && !s.session);


  const [payment, setPayment] = useState("");

  const [customerName, setCustomerName] = useState("Umum");
  const [customerPhone, setCustomerPhone] = useState("");
  const [member, setMember] = useState(false);
  const [packageId, setPackageId] = useState("");
  const [notes, setNotes] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<{ method: string; amount: string }[]>([]);
  const [bonus, setBonus] = useState(String(defaultBonusMin ?? 0));
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  // Item pesanan yang dicentang untuk dibayar sendiri atau ditransfer.
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const pickedOrders = (station?.session?.orders ?? []).filter((o) =>
    pickedIds.includes(o.id),
  );
  useEffect(() => {
    setPickedIds([]);
  }, [station?.id, open]);

  const bonusMin = Math.round(Number(bonus) || 0);

  const matchedCustomer =
    customers.find(
      (item) => item.name.trim().toLowerCase() === customerName.trim().toLowerCase(),
    ) ?? null;

  const activePayments = paymentMethods.filter((p) => p.active);
  const selectedPayment =
    payment || activePayments[0]?.name || "Cash";

  const session = station.session;
  const rate = rates[station.console] ?? 0;
  const chosenPackage = packages.find((item) => item.id === packageId);
  const upcomingBooking = session || businessProfile?.modules?.booking === false
    ? undefined
    : bookings
        .filter(
          (item) =>
            item.stationId === station.id &&
            item.status !== "cancelled" &&
            item.status !== "completed" &&
            item.endAt >= now &&
            item.startAt - 6 * 60 * 60 * 1000 <= now,
        )
        .sort((a, b) => a.startAt - b.startAt)[0];
  const cardMethodSelected = splitMode
    ? splits.some((s) => (s.method || activePayments[0]?.name || "Cash") === CARD_PAYMENT_NAME)
    : selectedPayment === CARD_PAYMENT_NAME;
  const isCardPayment = !splitMode && selectedPayment === CARD_PAYMENT_NAME;
  const cardFound = findCardByNumber(playingCards, cardNumber);
  const card = cardMethodSelected ? cardFound : undefined;
  const hasCardSettlement = Boolean(
    session?.settlements?.some(
      (settlement) =>
        settlement.payment === CARD_PAYMENT_NAME ||
        settlement.payments?.some((row) => row.method === CARD_PAYMENT_NAME),
    ),
  );
  const priceCfg = {
    consoleDiscounts,
    menu,
    promotions,
    cardDiscountPercent,
    cardMemberDiscountPercent,
  };
  const alreadyPaid = paidTotal(session);
  const billWithoutPendingCard = session
    ? sessionBill(session, now, station.console, priceCfg, {
        member: Boolean(session.member),
        card: hasCardSettlement,
      })
    : null;
  const pendingCardBill = session && cardMethodSelected && cardFound && !hasCardSettlement
    ? sessionBill(session, now, station.console, priceCfg, {
        member: Boolean(session.member),
        card: true,
      })
    : null;
  // Pemilihan kartu hanya menjadi pratinjau potongan. Jangan biarkan potongan
  // yang belum dibayar membuat pembayaran lama terlihat melunasi tagihan.
  const bill = pendingCardBill && pendingCardBill.total > alreadyPaid
    ? pendingCardBill
    : billWithoutPendingCard;
  const sessionTotal = bill ? bill.total : 0;
  const ownDue = Math.max(0, sessionTotal - alreadyPaid);
  // TV lain yang tagihannya digabung ke panel ini.
  const mergedChildren = stations.filter((s) => s.session?.mergedInto === station.id);
  const childDue = (child: Station) => {
    if (!child.session) return 0;
    const childBill = sessionBill(child.session, now, child.console, priceCfg, {
      member: Boolean(child.session.member),
      card: false,
    });
    return Math.max(0, childBill.total - paidTotal(child.session));
  };
  const childrenDue = mergedChildren.reduce((sum, child) => sum + childDue(child), 0);
  const mergedParent = session?.mergedInto
    ? stations.find((s) => s.id === session.mergedInto)
    : undefined;
  const dueAmount = ownDue + childrenDue;
  const isSettled = dueAmount <= 0;
  // Setelah pelunasan saat waktu sudah habis: akhiri sesi & tutup panel sendiri.
  useEffect(() => {
    if (!autoEnd) return;
    if (!station?.session) {
      setAutoEnd(false);
      return;
    }
    if (dueAmount > 0.5) return;
    const record = stopSession(station.id);
    setAutoEnd(false);
    if (!record) return;
    setWantPrint(false);
    onOpenChange(false);
    setPaidRecord(record);
    toast.success(`${record.stationName} selesai`, {
      description: `Total ${formatRupiah(record.total)} — ${record.payment}`,
    });
  }, [autoEnd, dueAmount, station, stopSession, onOpenChange]);

  const openCafeTables = businessProfile?.modules?.cafe === false ? [] : cafeTables.filter((t) => t.orders.length > 0);
  // Baris tagihan TV lain yang sudah dipindah ke panel ini.
  const transferredLines = (session?.orders ?? []).filter(
    (o) => o.linkedFrom?.type === "station",
  );
  const mergeCandidates = stations.filter(
    (s) => s.id !== station.id && s.session && !s.session.mergedInto && !s.session.paidAt,
  );


  const payTarget =
    payAmount === ""
      ? dueAmount
      : Math.min(dueAmount, Math.max(0, Number(payAmount) || 0));

  const splitRows = splits.map((s) => ({
    method: s.method || activePayments[0]?.name || "Cash",
    amount: Math.max(0, Number(s.amount) || 0),
  }));
  const splitPaid = splitRows.reduce((sum, s) => sum + s.amount, 0);
  const splitRemaining = Math.max(0, payTarget - splitPaid);
  const cashReceived =
    amountPaid === "" ? payTarget : Math.max(0, Number(amountPaid) || 0);

  const cardSplit = splitMode
    ? splitRows
        .filter((s) => s.method === CARD_PAYMENT_NAME)
        .reduce((sum, s) => sum + s.amount, 0)
    : 0;
  const usesCard = cardMethodSelected;
  const cardCharge = isCardPayment ? payTarget : cardSplit;



  const resetPaymentForm = () => {
    setSplitMode(false);
    setSplits([]);
    setPayment("");
    setAmountPaid("");
    setPayAmount("");
    setCardNumber("");
  };

  const validatePayment = () => {
    if (dueAmount <= 0) {
      toast.error("Tagihan sudah lunas");
      return false;
    }
    if (payTarget <= 0) {
      toast.error("Jumlah pembayaran harus lebih dari 0");
      return false;
    }
    if (usesCard) {
      if (!cardFound) {
        toast.error("Kartu belum terdaftar!", {
          description: "Scan kartu atau ketik nomor kartu yang sudah terdaftar.",
        });
        return false;
      }
      if (!cardFound.active) {
        toast.error("Kartu ini sedang diblokir");
        return false;
      }
      if (cardFound.balance + 0.5 < cardCharge) {
        toast.error("Saldo kartu tidak mencukupi!", {
          description: `Saldo ${formatRupiah(cardFound.balance)}, dibutuhkan ${formatRupiah(cardCharge)}. Top up dulu atau bagi dengan metode lain.`,
        });
        return false;
      }
    }
    if (splitMode) {
      if (splitRows.filter((s) => s.amount > 0).length === 0) {
        toast.error("Isi jumlah tiap metode pembayaran");
        return false;
      }
      if (splitPaid < payTarget) {
        toast.error(`Pembayaran masih kurang ${formatRupiah(splitRemaining)}`);
        return false;
      }
      return true;
    }
    if (isCardPayment) return true;

    if (selectedPayment === "Cash" && cashReceived < payTarget) {
      toast.error("Uang diterima masih kurang");
      return false;
    }
    return true;
  };

  /**
   * Bayar tagihan TV ini lebih dulu, sisanya dipakai melunasi TV lain yang
   * digabung. Tiap TV tetap punya notanya sendiri supaya laporan per TV benar.
   */
  const settleSpread = (label: string, payload: (amount: number) => Parameters<typeof settleSession>[1]) => {
    const ownPart = Math.min(payTarget, ownDue);
    if (ownPart > 0) settleSession(station.id, payload(ownPart));
    let rest = payTarget - ownPart;
    for (const child of mergedChildren) {
      if (rest <= 0.5) break;
      const due = childDue(child);
      const part = Math.min(rest, due);
      if (part > 0) {
        settleSession(child.id, { payment: label, amount: part, amountPaid: part });
        if (part + 0.5 >= due) stopSession(child.id);
      }
      rest -= part;
    }
  };

  /** Waktu bermain sudah habis (mode paket), jadi pelunasan menutup sesi. */
  const timeIsUp = () =>
    Boolean(session) &&
    session!.mode !== "open" &&
    remainingSeconds(session!, Date.now()) <= 0;

  const handlePay = () => {

    if (!requireShift()) return;
    if (isCardPayment) {
      if (!card) return;
      if (!chargeCard(card.id, cardCharge, `Pembayaran ${station.name}`)) {
        toast.error("Saldo Playing Card tidak mencukupi");
        return;
      }
      settleSpread(CARD_PAYMENT_NAME, (amount) => ({
        payment: CARD_PAYMENT_NAME,
        amount,
        amountPaid: amount,
      }));
      const remaining = Math.max(0, dueAmount - payTarget);
      if (remaining <= 0) {
        setWantPrint(true);
        if (timeIsUp()) setAutoEnd(true);
      }

      toast.success("Pembayaran Playing Card diterima", {
        description: `${formatRupiah(cardCharge)} dari kartu ${card.cardNumber}${
          (bill?.discount ?? 0) > 0 ? ` · potongan ${formatRupiah(bill?.discount ?? 0)}` : ""
        }${remaining > 0 ? ` · Sisa tagihan ${formatRupiah(remaining)}` : ""}`,
      });
      resetPaymentForm();
      return;
    }
    if (splitMode) {
      const rows = splitRows.filter((s) => s.amount > 0);
      if (cardSplit > 0) {
        if (!cardFound) return;
        if (!chargeCard(cardFound.id, cardSplit, `Pembayaran ${station.name}`)) {
          toast.error("Saldo kartu tidak mencukupi!");
          return;
        }
      }
      const label = Array.from(new Set(rows.map((r) => r.method))).join(" + ");
      settleSpread(label, (amount) => ({
        payments: amount === payTarget ? rows : [{ method: label, amount }],
        amount,
        amountPaid: amount === payTarget ? splitPaid : amount,
      }));
    } else {
      settleSpread(selectedPayment, (amount) => ({
        payment: selectedPayment,
        amount,
        amountPaid:
          selectedPayment === "Cash" && amount === payTarget ? cashReceived : amount,
      }));
    }
    const sisa = Math.max(0, dueAmount - payTarget);
    if (sisa <= 0) {
      setWantPrint(true);
      if (timeIsUp()) setAutoEnd(true);
    }

    toast.success(sisa > 0 ? "Pembayaran sebagian diterima" : "Pembayaran diterima", {
      description: `${formatRupiah(payTarget)} — ${
        splitMode
          ? splitRows.filter((s) => s.amount > 0).map((s) => s.method).join(" + ")
          : selectedPayment
      }${sisa > 0 ? ` · Sisa tagihan ${formatRupiah(sisa)}` : ""}`,
    });
    resetPaymentForm();
  };

  const leftMinutes =
    session && session.mode !== "open"
      ? Math.max(0, Math.ceil(remainingSeconds(session, now) / 60))
      : 0;

  const handleEnd = () => {
    const record = stopSession(station.id);
    if (!record) {
      toast.error("Sesi belum bisa diakhiri", {
        description:
          dueAmount > 0
            ? `Sisa tagihan ${formatRupiah(dueAmount)} harus dibayar dulu`
            : `Coba tutup lalu buka kembali kartu ${unit} ini, atau muat ulang halaman.`,
      });
      return;
    }
    onOpenChange(false);
    resetPaymentForm();
    setPaidRecord(record);
    toast.success(`${record.stationName} selesai`, {
      description: `Total ${formatRupiah(record.total)} — ${record.payment}`,
    });
  };


  /** Data nota bill sementara sebelum tagihan dilunasi. */
  const billRecord = (): import("@/lib/billing-store").HistoryRecord | null => {
    if (!session || !bill) return null;
    return {
        id: `BILL-${station.id}-${Date.now()}`,
        stationName: station.name,
        console: station.console,
        mode: session.mode,
        startAt: session.startAt,
        endAt: now,
        minutes: Math.round(elapsedSeconds(session, now) / 60),
        rentalTotal: bill.rental,
        fnbTotal: bill.fnb,
        total: bill.total,
        ...(bill.discount ? { discount: bill.discount } : {}),
        ...(bill.promoName ? { promoName: bill.promoName } : {}),
        ...(session.customerName ? { customerName: session.customerName } : {}),
      orders: session.orders ?? [],
      ongoing: true,
    };
  };

  /** Buka pratinjau bill dulu, cetak setelah kasir menekan Cetak. */
  const previewBill = () => {
    const printer = printerFor(printers, "receipt");
    if (!printer) {
      toast.error("Printer struk belum diatur di menu Printer");
      return;
    }
    const record = billRecord();
    if (!record) return;
    setBillPreview(
      receiptText({
        record,
        store: storeInfo as PrintStore,
        printer,
        layout: { ...receiptLayout, showPayment: false },
        kind: "bill",
      }),
    );
  };

  const doPrintBill = () => {
    const printer = printerFor(printers, "receipt");
    const record = billRecord();
    if (!printer || !record) return;
    printReceipt({
      record,
      store: storeInfo as PrintStore,
      printer,
      layout: { ...receiptLayout, showPayment: false },
      kind: "bill",
    });
  };

  return (
    <>
    <PaidPrintDialog record={paidRecord} onClose={() => setPaidRecord(null)} />
    <BillPreviewDialog
      open={billPreview !== null}
      onOpenChange={(v) => !v && setBillPreview(null)}
      sourceName={station?.name ?? ""}
      text={billPreview ?? ""}
      onPrint={doPrintBill}
    />
    <VoidDialog
      open={confirmVoid}
      onOpenChange={setConfirmVoid}
      sourceName={station?.name ?? ""}
      onConfirm={(reason) => {
        if (!station) return;
        const done = voidSession(station.id, reason);
        setConfirmVoid(false);
        if (done) {
          toast.success(`Transaksi ${done.sourceName} di-VOID`);
          onOpenChange(false);
        }
      }}
    />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {station.name}
          </DialogTitle>
          <DialogDescription>
            {station.console} &middot; {formatRupiah(rate)} / jam
          </DialogDescription>
        </DialogHeader>

        <ShiftLockedNotice />

        {!session ? (
          <div className="space-y-5">
            {station.availability !== "available" && (
              <Badge variant="outline" className="w-full justify-center py-2 text-warning">Unit berstatus {station.availability}. Ubah status di Pengaturan terlebih dahulu.</Badge>
            )}
            {upcomingBooking && (
              <div className="flex items-start gap-2 rounded-md border border-warning/60 bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  {unit} ini telah direservasi oleh <strong>{upcomingBooking.customerName}</strong> yang akan Check-In pada jam{" "}
                  {new Date(upcomingBooking.startAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  {upcomingBooking.customerPhone ? ` (${upcomingBooking.customerPhone})` : ""}.
                </p>
              </div>
            )}



            <div className="space-y-2">
              <p className="text-sm font-medium">Jenis konsol</p>
              <Select
                value={station.console}
                onValueChange={(v) =>
                  setStationConsole(station.id, v as ConsoleType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {consoleTypes.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} — {formatRupiah(rates[c] ?? 0)} / jam
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {packages.some((item) => item.active) && (
              <Select value={packageId} onValueChange={(value) => { setPackageId(value); const item = packages.find((entry) => entry.id === value); if (item) { setDuration(item.durationMin); setCustomDuration(String(item.durationMin / 60)); } }}>
                <SelectTrigger><SelectValue placeholder="Pilih paket rental" /></SelectTrigger>
                <SelectContent>{packages.filter((item) => item.active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} — {item.durationMin} menit</SelectItem>)}</SelectContent>
              </Select>
              )}
              <div className="flex items-center gap-2">
                <Label htmlFor="play-hours" className="shrink-0">Jam Main :</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => { const h = Math.max(0.5, (customDuration === "" ? duration / 60 : Number(customDuration) || 0) - 0.5); setCustomDuration(String(h)); setDuration(Math.round(h * 60)); }}>-</Button>
                <Input
                  id="play-hours"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={customDuration === "" ? String(duration / 60) : customDuration}
                  onChange={(e) => {
                    setCustomDuration(e.target.value);
                    const v = Number(e.target.value);
                    if (v > 0) setDuration(Math.round(v * 60));
                  }}
                  className="h-8 w-20 text-center"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => { const h = (customDuration === "" ? duration / 60 : Number(customDuration) || 0) + 0.5; setCustomDuration(String(h)); setDuration(Math.round(h * 60)); }}>+</Button>
                <span className="text-sm text-muted-foreground">jam</span>
              </div>
              <div className="space-y-1.5 rounded-md border border-border p-3">
                <Label htmlFor="bonus-min">Waktu ekstra (menit, boleh minus)</Label>
                <div className="flex items-center gap-2">
                  <Input id="bonus-min" type="number" className="h-8 w-24 text-center" value={bonus} onChange={(e) => setBonus(e.target.value)} />
                  {[-1, 0, 1].map((m) => (
                    <Button key={m} type="button" size="sm" variant="outline" onClick={() => setBonus(String(m === 0 ? 0 : bonusMin + m))}>{m > 0 ? `+${m}` : m}</Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Total waktu main: {Math.max(0, duration + bonusMin)} menit — tarif tetap dihitung {duration} menit.</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Harga paket: {formatRupiah((rate * duration) / 60)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <CustomerPicker
                  value={customerName}
                  onChange={setCustomerName}
                  onPick={(item) => {
                    setCustomerName(item.name);
                    setCustomerPhone(item.phone);
                    setMember(item.member);
                  }}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="customer-phone">Nomor HP</Label>
                  <Input
                    id="customer-phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="08..."
                    inputMode="tel"
                  />
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="rental-notes">Catatan</Label><Input id="rental-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Permintaan pelanggan (opsional)" /></div>

              <Button
                className="w-full"
                disabled={!allow("sesi.mulai")}
                onClick={() => {
                  if (!requireShift()) return;
                  startSession(station.id, "prepaid", duration, { customerName, customerPhone, member, ...(matchedCustomer ? { customerId: matchedCustomer.id } : {}), packageName: chosenPackage?.name || `${duration} Menit`, notes, bonusMin });
                  toast.success(`${station.name} mulai ${Math.max(0, duration + bonusMin)} menit`, bonusMin !== 0 ? { description: `${duration} menit + ekstra ${bonusMin} menit (tarif tetap)` } : undefined);
                }}
              >
                <Play className="size-4" /> Mulai Paket
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                disabled={!allow("sesi.mulai")}
                onClick={() => {
                  if (!requireShift()) return;
                  startSession(station.id, "open", 0, { customerName, customerPhone, member, ...(matchedCustomer ? { customerId: matchedCustomer.id } : {}), packageName: "Open Time", notes });
                  toast.success(`${station.name} mulai Main Sepuasnya`);
                }}
              >
                <InfinityIcon className="size-4" /> Mulai Main Sepuasnya
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="sticky top-0 z-10 -mx-1 grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
              {(["timer","order","payment"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setSection(k)}
                  className={`rounded-md py-1.5 text-sm font-semibold transition-colors ${section === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {k === "timer" ? "Timer" : k === "order" ? "Order" : "Payment"}
                </button>
              ))}
            </div>
            {section === "timer" && (<>
            <div className="surface-panel p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {session.mode === "open" ? "Waktu berjalan" : "Sisa waktu"}
              </p>
              <p className="timer-digits mt-1 text-4xl">
                {session.mode === "open"
                  ? formatClock(elapsedSeconds(session, now))
                  : formatClock(Math.max(0, remainingSeconds(session, now)))}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {session.customerName || "Umum"} · {session.member ? "Member" : "Umum"} · {session.packageName}
              </p>
              <p className="text-xs text-muted-foreground">
                Waktu mulai:{" "}
                {new Date(session.startAt).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
              {!allow("sesi.ubahpelanggan") ? null : !editCustomer ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1"
                  onClick={() => {
                    setEditName(session.customerName ?? "");
                    setEditPhone(session.customerPhone ?? "");
                    setEditMember(Boolean(session.member));
                    setEditCustomerId(session.customerId ?? "");
                    setEditCustomer(true);
                  }}
                >
                  Ubah data pelanggan
                </Button>
              ) : (
                <div className="mt-3 space-y-3 rounded-md border p-3 text-left">
                  <div className="space-y-1.5">
                    <Label>Pelanggan tersimpan</Label>
                    <Select
                      value={editCustomerId || "guest"}
                      onValueChange={(value) => {
                        if (value === "guest") {
                          setEditCustomerId("");
                          return;
                        }
                        const found = customers.find((item) => item.id === value);
                        setEditCustomerId(value);
                        if (found) {
                          setEditName(found.name);
                          setEditPhone(found.phone);
                          setEditMember(found.member);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="guest">Pelanggan umum</SelectItem>
                        {customers.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} · {item.phone || "tanpa nomor"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-session-name">Nama pelanggan</Label>
                    <Input
                      id="edit-session-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Umum"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-session-phone">Nomor HP</Label>
                    <Input
                      id="edit-session-phone"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="08..."
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label htmlFor="edit-session-member">Member</Label>
                    <Switch id="edit-session-member" checked={editMember} onCheckedChange={setEditMember} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setEditCustomer(false)}>
                      Batal
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        updateSessionCustomer(station.id, {
                          customerName: editName.trim(),
                          customerPhone: editPhone.trim(),
                          member: editMember,
                          ...(editCustomerId ? { customerId: editCustomerId } : { customerId: undefined }),
                        });
                        setEditCustomer(false);
                        toast.success("Data pelanggan diperbarui");
                      }}
                    >
                      Simpan
                    </Button>
                  </div>
                </div>
              )}
              {isPaused(session) && (
                <p className="mt-1 text-sm font-semibold text-warning">Timer dijeda</p>
              )}
              <div className="mt-3 flex flex-col items-center gap-1">
                {pausedMsTotal(session, now) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total jeda {formatClock(Math.floor(pausedMsTotal(session, now) / 1000))}
                  </p>
                )}
                <div className="mt-2 flex w-full flex-wrap items-center justify-center gap-2">
                  <Select value={moveTo} onValueChange={setMoveTo}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Pindah ke unit…" />
                    </SelectTrigger>
                    <SelectContent>
                      {freeStations.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Tidak ada unit kosong
                        </SelectItem>
                      ) : (
                        freeStations.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} · {s.console}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Select value={moveConsole} onValueChange={setMoveConsole}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Ganti konsol (opsional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tetap">
                        Tetap {station.console} · {formatRupiah(session.rate)}/jam
                      </SelectItem>
                      {consoleTypes
                        .filter((c) => c !== station.console)
                        .map((c) => (
                          <SelectItem key={c} value={c}>
                            {c} · {formatRupiah(rates[c] ?? 0)}/jam
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!moveTo || moveTo === "none" || !allow("sesi.pindah")}
                    onClick={() => {
                      const target = stations.find((s) => s.id === moveTo);
                      if (!target) return;
                      const newConsole =
                        moveConsole && moveConsole !== "tetap" ? moveConsole : undefined;
                      const ok = moveSession(station.id, moveTo, newConsole);
                      if (!ok) {
                        toast.error("Gagal pindah unit", {
                          description: "Unit tujuan sudah terpakai. Pilih unit lain.",
                        });
                        return;
                      }
                      setMoveTo("");
                      setMoveConsole("");
                      onOpenChange(false);
                      toast.success(`Sesi dipindah ke ${target.name}`, {
                        description: newConsole
                          ? `Konsol diganti ke ${newConsole} — tarif mengikuti harga baru.`
                          : "Waktu, pesanan, dan pembayaran ikut berpindah.",
                      });
                    }}
                  >
                    Pindah {unit}
                  </Button>
                </div>
              </div>

            </div>


            <div className="flex flex-wrap gap-2">
              {[30, 60, -30, -60]
                .filter((m) =>
                  m > 0 ? allow("sesi.tambahwaktu") : allow("sesi.kurangiwaktu"),
                )
                .map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    confirmAction({
                      title: `${m > 0 ? "Tambah" : "Kurangi"} ${Math.abs(m)} menit?`,
                      description:
                        m > 0
                          ? `Waktu main ${station.name} ditambah ${m} menit dan tagihan ikut bertambah.`
                          : `Waktu main ${station.name} dikurangi ${Math.abs(m)} menit dan tagihan ikut berkurang.`,
                      actionLabel: m > 0 ? "Tambah" : "Kurangi",
                      destructive: m < 0,
                      onConfirm: () => {
                        addTime(station.id, m);
                        toast.success(
                          `${m > 0 ? "Tambah" : "Kurangi"} ${Math.abs(m)} menit di ${station.name}`,
                        );
                      },
                    });
                  }}
                >
                  <Timer className="size-4" /> {m > 0 ? `+${m}` : m} mnt
                </Button>
              ))}
            </div>

            {session.mode === "prepaid" && allow("sesi.ekstra") && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Waktu ekstra (tanpa biaya)</p>
                  <span className="text-sm text-accent">{(session.bonusMin ?? 0) >= 0 ? "+" : ""}{session.bonusMin ?? 0} mnt</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[-15, -10, -5, -1, 1, 5, 10, 15, 30].map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        confirmAction({
                          title: `Waktu ekstra ${m > 0 ? "+" : ""}${m} menit?`,
                          description: `Tagihan ${station.name} tidak berubah, hanya waktu mainnya.`,
                          actionLabel: "Terapkan",
                          destructive: m < 0,
                          onConfirm: () => {
                            adjustBonusTime(station.id, m);
                            toast.success(`Waktu ekstra ${m > 0 ? "+" : ""}${m} menit`, { description: "Tarif tidak berubah" });
                          },
                        });
                      }}
                    >
                      {m > 0 ? `+${m}` : m}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Paket {session.durationMin} menit — total main {Math.max(0, session.durationMin + (session.bonusMin ?? 0))} menit.</p>
                {remainingSeconds(session, now) <= 0 && (
                  <p className="text-xs text-warning">
                    Waktu sudah habis. Tambah waktu di atas (berbayar) atau waktu ekstra
                    tanpa biaya agar sesi lanjut tanpa perlu diakhiri dulu.
                  </p>
                )}
              </div>
            )}
            </>)}
            {section === "order" && (<>


            {addonRentals.some((a) => a.active) && allow("sesi.addon") && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Additional Rental</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={addonPick}
                    onValueChange={(v) => {
                      setAddonPick(v);
                      setAddonMinutes(
                        addonRentals.find((a) => a.id === v)?.mode === "hourly" ? "60" : "",
                      );
                    }}
                  >
                    <SelectTrigger className="w-56" aria-label="Pilih additional rental">
                      <SelectValue placeholder="Pilih additional rental…" />
                    </SelectTrigger>
                    <SelectContent>
                      {addonRentals
                        .filter((a) => a.active)
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} · {formatRupiah(a.price)}
                            {a.mode === "hourly" ? "/jam" : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {addonRentals.find((a) => a.id === addonPick)?.mode === "hourly" && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Durasi :</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setAddonMinutes(String(Math.max(30, (Number(addonMinutes) || 60) - 30)))
                        }
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        min={30}
                        step={30}
                        inputMode="numeric"
                        className="h-8 w-20 text-center"
                        aria-label="Durasi additional rental (menit)"
                        value={addonMinutes}
                        onChange={(e) => setAddonMinutes(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAddonMinutes(String((Number(addonMinutes) || 0) + 30))}
                      >
                        +
                      </Button>
                      <span className="text-sm text-muted-foreground">menit</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!addonPick}
                    onClick={() => {
                      if (!requireShift()) return;
                      const picked = addonRentals.find((a) => a.id === addonPick);
                      if (!picked) return;
                      const mins = Number(addonMinutes);
                      addSessionAddon(
                        station.id,
                        picked.id,
                        1,
                        Number.isFinite(mins) && mins > 0 ? mins : undefined,
                      );
                      setAddonPick("");
                      setAddonMinutes("");
                      toast.success(`${picked.name} ditambahkan`);
                    }}
                  >
                    <Plus className="size-4" /> Tambah
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Durasi bisa diketik atau digeser per 30 menit; dikosongkan = ikut lama sesi {unit}.
                </p>
                {(session.addons ?? []).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {(session.addons ?? []).map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm"
                      >
                        <span>
                          {a.name} × {a.qty}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {a.mode === "hourly"
                              ? a.minutes
                                ? `per jam · ${a.minutes} menit`
                                : "per jam · ikut sesi"
                              : "sekali sewa"}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {a.mode === "hourly" && (
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              className="h-8 w-24"
                              aria-label={`Durasi ${a.name} (menit)`}
                              placeholder="ikut sesi"
                              value={a.minutes ?? ""}
                              onChange={(e) =>
                                updateSessionAddon(station.id, a.id, {
                                  minutes: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                          )}
                          {formatRupiah(
                            addonAmount(a, rentalMinutes(session, now) / 60),
                          )}
                          {allow("sesi.hapusaddon") && (
                          <button
                            type="button"
                            onClick={() =>
                              confirmAction({
                                title: `Hapus ${a.name}?`,
                                description:
                                  "Item additional rental ini dibatalkan dan tagihan berkurang.",
                                actionLabel: "Hapus",
                                onConfirm: () =>
                                  removeSessionAddon(station.id, a.id),
                              })
                            }
                            aria-label={`Hapus ${a.name}`}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

              </div>
            )}


            <div className="space-y-2">
              <p className="text-sm font-medium">Pesanan makanan &amp; minuman</p>
              <div className="flex flex-wrap gap-2">
                {allow("sesi.order") && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (!requireShift()) return;
                    setOrderOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Tambah Order
                </Button>
                )}
                {!isSettled && (
                  <Button size="sm" variant="outline" onClick={previewBill}>
                    <PrinterIcon className="size-4" /> Cetak Bill
                  </Button>
                )}
              </div>

              {session.orders.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {session.orders.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between rounded-md bg-secondary px-3 py-1.5 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={`Pilih ${o.name}`}
                          checked={pickedIds.includes(o.id)}
                          onChange={(e) =>
                            setPickedIds((prev) =>
                              e.target.checked
                                ? [...prev, o.id]
                                : prev.filter((id) => id !== o.id),
                            )
                          }
                        />
                        {orderLabel(o)} × {o.qty}
                      </span>
                      <span className="flex items-center gap-2">
                        {formatRupiah(o.price * o.qty)}
                        {labelPrinters.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              printOrderLabels(
                                [o],
                                station.name,
                                session.customerName ?? undefined,
                              )
                            }
                            aria-label={`Cetak label ${o.name}`}
                            title="Cetak label"
                            className="text-muted-foreground transition-colors hover:text-primary"
                          >
                            <PrinterIcon className="size-3.5" />
                          </button>
                        )}
                        {allow("sesi.hapusorder") && (
                        <button
                          type="button"
                          onClick={() =>
                            confirmAction({
                              title: `Hapus ${o.name}?`,
                              description: `${orderLabel(o)} × ${o.qty} dibatalkan dari pesanan.`,
                              actionLabel: "Hapus",
                              onConfirm: () => removeOrder(station.id, o.id),
                            })
                          }
                          aria-label={`Hapus ${o.name}`}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {pickedOrders.length > 0 && (
                <OrderSelectionActions
                  source={{ type: "station", id: station.id }}
                  sourceName={station.name}
                  orders={pickedOrders}
                  payPermission="sesi.bayar"
                  transferPermission="sesi.gabung"
                  onDone={() => setPickedIds([])}
                  onPaid={(record) => setPaidRecord(record)}
                />
              )}


              {session.orders.length > 0 && labelPrinters.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() =>
                    printOrderLabels(session.orders, station.name, session.customerName ?? undefined)
                  }
                >
                  <PrinterIcon className="size-4" /> Cetak semua label
                </Button>
              )}
            </div>
            </>)}
            {section === "payment" && (<>
            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rental</span>
                <span>{formatRupiah(bill?.rental ?? rentalTotal(session, now))}</span>
              </div>
              {(bill?.addon ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Additional Rental</span>
                  <span>{formatRupiah(bill!.addon)}</span>
                </div>
              )}
              {fnbTotal(session) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Makanan &amp; minuman</span>
                  <span>{formatRupiah(fnbTotal(session))}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span>{formatRupiah(bill?.subtotal ?? sessionTotal)}</span>
              </div>
              {bill && bill.itemDiscount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Potongan tarif &amp; menu</span>
                  <span className="text-accent">-{formatRupiah(bill.itemDiscount)}</span>
                </div>
              )}
              {bill && bill.promoDiscount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{bill.promoName}</span>
                  <span className="text-accent">-{formatRupiah(bill.promoDiscount)}</span>
                </div>
              )}
              {bill && bill.manualDiscount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diskon transaksi</span>
                  <span className="text-accent">-{formatRupiah(bill.manualDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between font-display text-lg font-semibold">
                <span>Total Tagihan</span>
                <span className="text-accent">{formatRupiah(bill?.total ?? sessionTotal)}</span>
              </div>
              {alreadyPaid > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sudah dibayar</span>
                    <span>{formatRupiah(alreadyPaid)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Sisa Tagihan</span>
                    <span className={dueAmount > 0 ? "text-destructive" : "text-accent"}>
                      {dueAmount > 0 ? formatRupiah(dueAmount) : "Lunas"}
                    </span>
                  </div>
                </>
              )}
              
              

              {isSettled && paidHistoryId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const found = history.find((h) => h.id === paidHistoryId);
                    if (!found) {
                      toast.error("Nota belum tersedia");
                      return;
                    }
                    setPaidRecord(found);
                  }}
                >
                  <PrinterIcon className="size-4" /> Cetak / cetak ulang struk
                </Button>
              )}
            </div>


            {(session.settlements ?? []).length > 0 && (
              <div className="space-y-1.5 rounded-md border border-border p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
                  <CheckCircle2 className="size-4" /> Pembayaran diterima
                </p>
                <ul className="space-y-1">
                  {(session.settlements ?? []).map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-muted-foreground">
                        {s.payment} ·{" "}
                        {new Date(s.at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="flex items-center gap-2">
                        {formatRupiah(s.amount)}
                        {allow("sesi.batalbayar") && (
                        <button
                          type="button"
                          aria-label="Batalkan pembayaran"
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => {
                            removeSettlement(station.id, s.id);
                            toast.success("Pembayaran dibatalkan");
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}


            {session.mode === "prepaid" &&
              remainingSeconds(session, now) <= 0 && (
                <Badge variant="destructive" className="w-full justify-center py-1.5">
                  Waktu habis — silakan akhiri atau tambah waktu
                </Badge>
              )}



            {session && bill && allow("sesi.diskon") && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Diskon transaksi</Label>
                    <Select
                      value={session.discountType ?? "fixed"}
                      onValueChange={(v) =>
                        setSessionDiscount(station.id, { type: v as DiscountType })
                      }
                    >
                      <SelectTrigger aria-label="Jenis diskon transaksi">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Rupiah</SelectItem>
                        <SelectItem value="percent">Persen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="session-disc">Nilai diskon</Label>
                    <Input
                      id="session-disc"
                      type="number"
                      min={0}
                      value={session.discountValue ?? 0}
                      onChange={(e) =>
                        setSessionDiscount(station.id, {
                          value: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Promo yang sedang berlaku, bisa diberikan satu atau beberapa sekaligus. */}
            {allow("sesi.promo") && (
              <PromoPicker
                target={{ type: "station", id: station.id }}
                {...(session.promoIds ? { promoIds: session.promoIds } : {})}
              />
            )}

            {/* Gabung tagihan: TV lain dan meja kafe dibayar dari panel ini. */}

            <div className="space-y-2 rounded-lg bg-secondary/50 p-3">
              {mergedParent ? (
                <p className="text-sm text-muted-foreground">
                  Tagihan {unit} ini digabung ke <strong>{mergedParent.name}</strong> — pembayarannya
                  dilakukan dari panel {mergedParent.name}.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Gabung Tagihan</p>
                    {allow("sesi.gabung") && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setMergeOpen(true)}>
                        Gabung Tagihan
                      </Button>
                    )}
                  </div>
                  {transferredLines.length > 0 ? (
                    <div className="space-y-1">
                      {transferredLines.map((line) => (
                        <div key={line.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{line.name}</span>
                          <span className="font-semibold">{formatRupiah(line.price * line.qty)}</span>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        {unit} asalnya sudah kembali tersedia dan bisa dijual lagi. Untuk membatalkan,
                        hapus barisnya di daftar pesanan.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Satukan tagihan {unit} lain, atau titipkan pesanan meja kafe ke {unit} ini. {unit} yang
                      tagihannya dipindah langsung tersedia kembali.
                    </p>
                  )}

                </>
              )}
            </div>

            {!isSettled && (
            <div className="space-y-2">

              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Tipe pembayaran</p>
                {activePayments.length > 1 && allow("sesi.split") && (
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      if (splitMode) {
                        setSplitMode(false);
                        setSplits([]);
                      } else {
                        setSplitMode(true);
                        setSplits([
                          { method: activePayments[0]?.name ?? "Cash", amount: String(payTarget) },
                          { method: activePayments[1]?.name ?? "QRIS", amount: "0" },
                        ]);
                      }
                    }}
                  >
                    {splitMode ? "Satu metode saja" : "Split Bill"}
                  </button>
                )}
              </div>
              {activePayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada tipe pembayaran aktif. Atur di menu Pembayaran.
                </p>
              ) : splitMode ? (
                <div className="space-y-2">
                  {splits.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select
                        value={row.method || activePayments[0]?.name || "Cash"}
                        onValueChange={(v) =>
                          setSplits((prev) =>
                            prev.map((r, idx) => (idx === i ? { ...r, method: v } : r)),
                          )
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {activePayments.map((p) => (
                            <SelectItem key={p.id} value={p.name}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        className="flex-1"
                        value={row.amount}
                        aria-label={`Jumlah ${row.method}`}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, idx) =>
                              idx === i ? { ...r, amount: e.target.value } : r,
                            ),
                          )
                        }
                      />
                      {splits.length > 2 && (
                        <button
                          type="button"
                          aria-label="Hapus metode"
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() =>
                            setSplits((prev) => prev.filter((_, idx) => idx !== i))
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSplits((prev) => [
                          ...prev,
                          {
                            method: activePayments[0]?.name ?? "Cash",
                            amount: String(splitRemaining),
                          },
                        ])
                      }
                    >
                      <Plus className="size-4" /> Metode lain
                    </Button>
                    <span
                      className={
                        splitRemaining > 0
                          ? "font-semibold text-destructive"
                          : "font-semibold text-accent"
                      }
                    >
                      {splitRemaining > 0
                        ? `Kurang ${formatRupiah(splitRemaining)}`
                        : `Kembalian ${formatRupiah(splitPaid - payTarget)}`}
                    </span>
                  </div>
                </div>
              ) : (
                <Select
                  value={selectedPayment}
                  onValueChange={(v) => setPayment(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activePayments.map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {usesCard && (
                <CardPaymentPanel
                  cardNumber={cardNumber}
                  onCardNumberChange={setCardNumber}
                  need={cardCharge}
                  discount={bill?.discount ?? 0}
                  inputId="pay-card-number"
                />
              )}
            </div>
            )}



            {!isSettled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pay-amount">Jumlah dibayar</Label>
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => setPayAmount("")}
                  >
                    Bayar lunas
                  </button>
                </div>
                <div className="relative">
                  <Wallet className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pay-amount"
                    className="pl-9"
                    type="number"
                    min={0}
                    max={dueAmount}
                    value={payAmount === "" ? String(dueAmount) : payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Bisa bayar sebagian di depan. Sisa {formatRupiah(Math.max(0, dueAmount - payTarget))}{" "}
                  tetap jadi tagihan berjalan.
                </p>
              </div>
            )}






            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                className="w-full"
                disabled={isSettled || activePayments.length === 0 || !allow("sesi.bayar")}
                onClick={() => {
                  if (validatePayment()) setConfirmPay(true);
                }}
              >
                <Wallet className="size-4" />
                {isSettled ? "Sudah Lunas" : `Bayar ${formatRupiah(payTarget)}`}
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                disabled={!isSettled || !allow("sesi.akhiri")}
                onClick={() => setConfirmEnd(true)}
              >
                <Square className="size-4" /> Akhiri Sesi
              </Button>
              {allow("sesi.void") && (
              <Button
                variant="destructive"
                className="w-full sm:col-span-2"
                onClick={() => {
                  if (!requireShift()) return;
                  setConfirmVoid(true);
                }}
              >
                <Ban className="size-4" /> VOID Transaksi
              </Button>
              )}
            </div>
            {!isSettled && (
              <p className="text-center text-xs text-muted-foreground">
                Sesi hanya bisa diakhiri setelah seluruh tagihan lunas.
              </p>
            )}
            </>)}

            <AlertDialog open={confirmPay} onOpenChange={setConfirmPay}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Selesaikan pembayaran?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {station.name} — {formatRupiah(payTarget)} melalui{" "}
                    {splitMode
                      ? splitRows.filter((s) => s.amount > 0).map((s) => s.method).join(" + ") ||
                        "gabungan"
                      : selectedPayment}
                    .{" "}
                    {dueAmount - payTarget > 0
                      ? `Sisa ${formatRupiah(dueAmount - payTarget)} tetap jadi tagihan berjalan.`
                      : "Sesi rental tetap berjalan setelah pembayaran."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePay}>Ya, terima pembayaran</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Akhiri sesi rental?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {leftMinutes > 0
                      ? `Yakin akan mengakhiri sesi ini? Timer masih tersisa ${leftMinutes} menit. `
                      : ""}
                    {station.name} akan dikosongkan dan transaksi masuk ke riwayat. Tindakan ini
                    tidak bisa dibatalkan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleEnd}>Ya, akhiri sesi</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </div>
        )}
      </DialogContent>
    </Dialog>

    {session && (
      <OrderDraftDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        sourceName={station.name}
        existing={session.orders}
        onSend={(lines) => {
          for (const line of lines) {
            addOrder(station.id, line.item, line.qty, line.mods, line.priceAdd);
          }
        }}
      />
    )}
    <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gabung Tagihan ke {station.name}</DialogTitle>
          <DialogDescription>
            Tagihan {unit} lain dibayar dari panel ini, dan pesanan meja kafe dititipkan ke sesi {unit}
            ini. Bisa dilepas selama belum dibayar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold">{unit} yang sedang bermain</p>
            {mergeCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada {unit} lain yang bisa digabung.</p>
            ) : (
              mergeCandidates.map((other) => (
                <div
                  key={other.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 p-2"
                >
                  <span className="text-sm">
                    {other.name} · {other.session?.customerName || "Umum"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (mergeStations(station.id, [other.id]))
                        toast.success(`${other.name} digabung ke ${station.name}`);
                      else toast.error(`${unit} ini tidak bisa digabung`);
                    }}
                  >
                    Gabung
                  </Button>
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Meja kafe yang ada pesanan</p>
            {openCafeTables.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pesanan di meja kafe.</p>
            ) : (
              openCafeTables.map((table) => (
                <div
                  key={table.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 p-2"
                >
                  <span className="text-sm">
                    {table.name} · {table.orders.length} pesanan
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (linkCafeTable(station.id, table.id))
                        toast.success(`Pesanan ${table.name} dititipkan ke ${station.name}`);
                      else toast.error("Pesanan meja ini tidak bisa dititipkan");
                    }}
                  >
                    Titipkan
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setMergeOpen(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {confirmDialog}
    </>

  );
}
