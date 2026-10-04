import { useUnitLabel } from "@/lib/billing-store";
import { useEffect, useState } from "react";
import { Ban, Coffee, Link2, Plus, Printer, Trash2, Unlink, Receipt } from "lucide-react";
import { OrderDraftDialog } from "@/components/OrderDraftDialog";
import { VoidDialog } from "@/components/VoidDialog";
import { CustomerPicker } from "@/components/CustomerPicker";
import { PromoPicker } from "@/components/PromoPicker";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardPaymentPanel } from "@/components/CardPaymentPanel";
import { ShiftLockedNotice, useShiftGate } from "@/components/ShiftGate";
import {
  CARD_PAYMENT_NAME,
  cafeBill,
  findCardByNumber,
  formatRupiah,
  useBilling,
  type CafeTable,
  type DiscountType,
  type HistoryRecord,
  type OrderItem,
  orderLabel,
} from "@/lib/billing-store";
import { SortableArea, SortableItem } from "@/components/Sortable";
import { useConfirm } from "@/components/ConfirmDialog";
import { useCan } from "@/lib/use-can";
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
import { printerFor } from "@/lib/printing";
import { useStoreInfo } from "@/lib/store-info";
import type { PrinterConfig } from "@/lib/printing";

export function tableTotal(table: CafeTable) {
  return table.orders.reduce((sum, o) => sum + o.price * o.qty, 0);
}

export function CafeTables({ allowDelete = false }: { allowDelete?: boolean }) {
  const unit = useUnitLabel();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirm();
  const allow = useCan();
  const {
    cafeTables,
    menu,
    paymentMethods,
    updateCafeTable,
    removeCafeTable,
    addCafeOrder,
    removeCafeOrder,
    clearCafeTable,
    voidCafeTable,
    moveCafeTable,
    payCafeTable,
    settleCafeTable,
    removeCafeSettlement,
    cancelCafeRemainder,

    stations,
    mergeCafeTables,
    unmergeCafeTables,
    linkStationToTable,

    reorderList,
    playingCards,
    cardDiscountPercent,
    cardMemberDiscountPercent,
    consoleDiscounts,
    promotions,
    now,
    chargeCard,
    printers,
    receiptLayout,
  } = useBilling();
  const { store: storeInfo } = useStoreInfo(true);
  const { requireShift } = useShiftGate();
  const [paidRecord, setPaidRecord] = useState<HistoryRecord | null>(null);
  const [tableMoveTo, setTableMoveTo] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);


  const labelPrinters = printers.filter((p) => p.active);
  const labelHeading = (p: PrinterConfig) =>
    p.role === "bar" ? "BAR" : p.role === "kitchen" ? "DAPUR" : p.name;
  /** Cetak label untuk satu atau semua pesanan meja, sesuai printer per menu. */
  const printOrderLabels = (
    orders: OrderItem[],
    source: string,
    customerName?: string,
    note?: string,
  ) => {
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
        ...(note ? { note } : {}),
      });
      printed += items.length;
    }
    if (printed === 0) {
      toast.error("Label belum bisa dicetak", {
        description: "Atur printer label untuk menu ini di menu Printer.",
      });
    }
  };

  const [openId, setOpenId] = useState<string | null>(null);
  const [orderTableId, setOrderTableId] = useState<string | null>(null);
  const [voidTableId, setVoidTableId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState("");
  const [received, setReceived] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [discType, setDiscType] = useState<DiscountType>("fixed");
  const [discValue, setDiscValue] = useState("");
  const [cardPart, setCardPart] = useState("");
  const [restPay, setRestPay] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<{ method: string; amount: string }[]>([]);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  // Item pesanan yang dicentang untuk dibayar sendiri atau ditransfer.
  const [pickedIds, setPickedIds] = useState<string[]>([]);


  // Setiap kali meja lain dibuka atau dialog ditutup, form kembali kosong.
  useEffect(() => {
    setPayMethod(cashMethodName);
    setReceived("");
    setPayAmount("");
    setCardNumber("");
    setDiscType("fixed");
    setDiscValue("");
    setCardPart("");
    setRestPay("");
    setSplitMode(false);
    setSplits([]);
    setPickedIds([]);
  }, [openId]);




  const activeMethods = paymentMethods.filter((p) => p.active);
  const otherMethods = activeMethods.filter((m) => m.name !== CARD_PAYMENT_NAME);
  // Tipe pembayaran bawaan = tunai. Namanya bebas dikustomisasi tiap toko,
  // jadi dikenali dari kata "tunai"/"cash"/"uang", bukan dari ID tetap.
  const cashMethodName =
    activeMethods.find((m) => /^(tunai|cash|uang)\b/i.test(m.name.trim()))?.name ??
    activeMethods[0]?.name ??
    "";
  const table = cafeTables.find((t) => t.id === openId) ?? null;
  const pickedOrders = (table?.orders ?? []).filter((o) => pickedIds.includes(o.id));


  // Gabung tagihan: pesanan titipan di meja ini, serta calon meja & TV yang bisa digabung.
  const linkedOrders = (table?.orders ?? []).filter((o) => o.linkedFrom);
  const linkedSourceNames = linkedOrders
    .map((o) => o.linkedFrom!.name)
    .filter((name, i, arr) => arr.indexOf(name) === i);
  const mergeTableCandidates = cafeTables.filter(
    (t) => t.id !== table?.id && t.orders.length > 0,
  );
  const mergeStationCandidates = stations.filter(
    (s) => s.session && !s.session.paidAt && s.session.orders.length > 0,
  );



  const isCardPayment = payMethod === CARD_PAYMENT_NAME;
  const card = isCardPayment ? findCardByNumber(playingCards, cardNumber) : undefined;
  const manualDisc = { type: discType, value: Math.max(0, Number(discValue) || 0) };
  const bill = cafeBill(
    table?.orders ?? [],
    now,
    { consoleDiscounts, menu, promotions, cardDiscountPercent, cardMemberDiscountPercent },
    { member: Boolean(card?.member), card: Boolean(isCardPayment && card) },
    manualDisc,
    table?.promoIds,

  );
  const total = bill.total;
  // Pembayaran sebagian (DP) yang sudah diterima untuk meja ini.
  const cafePaid = (table?.settlements ?? []).reduce((sum, s) => sum + s.amount, 0);
  const dueAmount = Math.max(0, total - cafePaid);
  const payTarget =
    payAmount === ""
      ? dueAmount
      : Math.min(dueAmount, Math.max(0, Number(payAmount) || 0));
  const isPartial = payTarget + 0.5 < dueAmount;
  const cardCharge = isCardPayment
    ? Math.min(payTarget, Math.max(0, cardPart === "" ? payTarget : Number(cardPart) || 0))
    : payTarget;
  const restAmount = isCardPayment ? Math.max(0, payTarget - cardCharge) : 0;
  const restMethod = restPay || otherMethods[0]?.name || "Cash";


  // Belum diketik = uang diterima dianggap sesuai sisa tagihan sekarang.
  const receivedValue =
    received === "" ? payTarget : Math.max(0, Number(received) || 0);
  const change = Math.max(0, receivedValue - payTarget);
  const shortage = Math.max(0, payTarget - receivedValue);

  // Split Bill: satu tagihan dibagi ke beberapa metode pembayaran.
  const splitRows = splits.map((row) => ({
    method: row.method || activeMethods[0]?.name || "Cash",
    amount: Math.max(0, Number(row.amount) || 0),
  }));
  const splitPaid = splitRows.reduce((sum, row) => sum + row.amount, 0);
  const splitRemaining = Math.max(0, payTarget - splitPaid);

  const splitCardAmount = splitRows
    .filter((row) => row.method === CARD_PAYMENT_NAME)
    .reduce((sum, row) => sum + row.amount, 0);
  const splitCard = findCardByNumber(playingCards, cardNumber);

  /** Isi bill sementara meja untuk pratinjau dan cetak. */
  const billRecord = (): HistoryRecord | null => {
    if (!table) return null;
    return {
      id: `BILL-${table.id}-${Date.now()}`,
      stationName: table.name,
      console: "PS4",
      mode: "open",
      startAt: table.openedAt ?? now,
      endAt: now,
      minutes: 0,
      rentalTotal: 0,
      fnbTotal: bill.subtotal,
      total: bill.total,
      kind: "cafe",
      tableName: table.name,
      ...(bill.discount ? { discount: bill.discount } : {}),
      ...(bill.promoName ? { promoName: bill.promoName } : {}),
      ...(table.customerName ? { customerName: table.customerName } : {}),
      orders: table.orders,
      ongoing: true,
    };
  };

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

  /**
   * Terima pembayaran meja kafe: bisa lunas sekaligus atau sebagian (DP),
   * persis seperti panel TV. DP tersimpan sebagai pembayaran diterima.
   */
  const handleCafePay = () => {
    if (!table) return;
    const tableId = table.id;
    const tableName = table.name;
    const finish = (
      input: {
        payment?: string;
        payments?: { method: string; amount: number }[];
        amountPaid: number;
        member?: boolean;
      },
      description: string,
    ) => {
      if (isPartial) {
        const ok = settleCafeTable(tableId, {
          ...(input.payments ? { payments: input.payments } : {}),
          ...(input.payment ? { payment: input.payment } : {}),
          amount: payTarget,
          amountPaid: input.amountPaid,
        });
        if (!ok) {
          toast.error("Pembayaran gagal diproses");
          return;
        }
        toast.success(`Pembayaran sebagian ${formatRupiah(payTarget)} diterima`, {
          description: `${description} · sisa tagihan ${formatRupiah(dueAmount - payTarget)}`,
        });
        setReceived("");
        setPayAmount("");
        setCardNumber("");
        setCardPart("");
        setRestPay("");
        setSplitMode(false);
        setSplits([]);
        return;
      }
      const record = payCafeTable(tableId, { ...input, discount: manualDisc });
      if (!record) {
        toast.error("Pembayaran gagal diproses");
        return;
      }
      toast.success(`${tableName} lunas ${formatRupiah(record.total)}`, { description });
      setReceived("");
      setPayAmount("");
      setCardNumber("");
      setCardPart("");
      setRestPay("");
      setDiscValue("");
      setSplitMode(false);
      setSplits([]);
      setOpenId(null);
      setPaidRecord(record);
    };

    if (splitMode) {
      const rows = splitRows.filter((row) => row.amount > 0);
      if (rows.length === 0) {
        toast.error("Isi jumlah tiap metode pembayaran");
        return;
      }
      if (splitPaid + 0.5 < payTarget) {
        toast.error(`Pembayaran masih kurang ${formatRupiah(splitRemaining)}`);
        return;
      }
      if (splitCardAmount > 0) {
        if (!splitCard) {
          toast.error("Kartu belum terdaftar!", {
            description: "Scan kartu atau ketik nomor kartu yang sudah terdaftar.",
          });
          return;
        }
        if (!splitCard.active) {
          toast.error("Kartu ini sedang diblokir");
          return;
        }
        if (splitCard.balance + 0.5 < splitCardAmount) {
          toast.error("Saldo kartu tidak mencukupi!");
          return;
        }
      }
      if (!requireShift()) return;
      if (
        splitCardAmount > 0 &&
        splitCard &&
        !chargeCard(splitCard.id, splitCardAmount, `Pembayaran ${tableName}`)
      ) {
        toast.error("Saldo kartu tidak mencukupi!");
        return;
      }
      finish(
        {
          payments: rows,
          amountPaid: splitPaid,
          ...(splitCardAmount > 0 && splitCard ? { member: Boolean(splitCard.member) } : {}),
        },
        rows.map((row) => `${row.method} ${formatRupiah(row.amount)}`).join(" + "),
      );
      return;
    }

    if (isCardPayment) {
      if (!card) {
        toast.error("Kartu belum terdaftar!", {
          description: "Scan kartu atau ketik nomor kartu yang sudah terdaftar.",
        });
        return;
      }
      if (!card.active) {
        toast.error("Kartu ini sedang diblokir");
        return;
      }
      if (card.balance + 0.5 < cardCharge) {
        toast.error("Saldo kartu tidak mencukupi!", {
          description: `Saldo ${formatRupiah(card.balance)}, dibutuhkan ${formatRupiah(cardCharge)}. Top up dulu atau bagi dengan metode lain.`,
        });
        return;
      }
      if (restAmount > 0 && otherMethods.length === 0) {
        toast.error("Belum ada metode lain untuk sisa tagihan");
        return;
      }
      if (cardCharge > 0 && !chargeCard(card.id, cardCharge, `Pembayaran ${tableName}`)) {
        toast.error("Saldo kartu tidak mencukupi!");
        return;
      }
      if (!requireShift()) return;
      finish(
        {
          ...(restAmount > 0
            ? {
                payments: [
                  { method: CARD_PAYMENT_NAME, amount: cardCharge },
                  { method: restMethod, amount: restAmount },
                ],
              }
            : { payment: CARD_PAYMENT_NAME }),
          amountPaid: payTarget,
          member: Boolean(card.member),
        },
        `Playing Card ${card.cardNumber} · dipotong ${formatRupiah(cardCharge)}${
          restAmount > 0 ? ` · ${restMethod} ${formatRupiah(restAmount)}` : ""
        }`,
      );
      return;
    }

    const paid = receivedValue;
    if (paid + 0.5 < payTarget) {
      toast.error("Uang diterima kurang dari total tagihan");
      return;
    }
    if (!requireShift()) return;
    const method = payMethod || activeMethods[0]?.name || "Cash";
    finish(
      { payment: method, amountPaid: paid },
      `${method} · kembalian ${formatRupiah(Math.max(0, paid - payTarget))}`,
    );
  };


  /** Klik kartu meja langsung membuka panel pesanan & pembayaran meja itu. */
  const openTablePanel = (t: CafeTable) => {
    setOpenId(t.id);
    setPayMethod(cashMethodName);
    setReceived("");
    if (!t.customerName?.trim()) {
      updateCafeTable(t.id, { customerName: "Umum" });
    }
  };

  return (

    <>
      <ShiftLockedNotice className="mb-3" />
      <SortableArea
        ids={cafeTables.map((t) => t.id)}
        onReorder={(activeId, overId) => reorderList("cafeTables", activeId, overId)}
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        {cafeTables.map((t) => {
          const filled = t.orders.length > 0 || Boolean(t.openedAt);
          return (
            <SortableItem
              key={t.id}
              id={t.id}
              handle={false}
              label={t.name}
              className={`surface-panel p-3 ${filled ? "border-accent/60 glow-accent" : ""}`}
            >
              <div
                role="button"
                tabIndex={0}
                className="cursor-pointer text-left"
                aria-label={`Buka panel pesanan ${t.name}`}
                onClick={() => openTablePanel(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openTablePanel(t);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`truncate font-display text-xl font-extrabold uppercase tracking-wide ${filled ? "text-accent" : "text-primary"}`}>
                      {t.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.area} · {t.seats} kursi
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={filled ? "default" : "secondary"} className="text-[10px]">
                      {filled ? "Terisi" : "Kosong"}
                    </Badge>
                    {t.paidAt && (
                      <Badge variant="outline" className="border-current text-[10px] text-accent">
                        Lunas
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  {t.customerName?.trim() || "Umum"}
                </p>

                {t.orders.length > 0 && (
                  <>
                    <ul className="mt-2 space-y-0.5 text-[11px]">
                      {t.orders.map((o) => (
                        <li key={o.id} className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {orderLabel(o)} × {o.qty}
                          </span>
                          <span className="shrink-0">{formatRupiah(o.price * o.qty)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 font-display text-2xl font-extrabold text-neon">
                      {formatRupiah(tableTotal(t))}
                    </p>
                    {t.paidAt && (
                      <p className="text-xs font-bold uppercase tracking-widest text-accent">
                        Lunas
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {allow("kafe.order") && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!requireShift()) return;
                      if (t.paidAt) {
                        // Tagihan sudah lunas: pesanan baru harus di sesi baru supaya
                        // tidak ikut terhapus tanpa tertagih saat "Akhiri Sesi".
                        toast.error(`${t.name} sudah lunas. Akhiri sesi dulu untuk pesanan baru.`);
                        return;
                      }
                      if (!t.customerName?.trim()) {
                        updateCafeTable(t.id, { customerName: "Umum" });
                      }
                      setOrderTableId(t.id);
                    }}
                  >
                    <Plus className="size-4" /> Tambah Order
                  </Button>
                )}

                {t.orders.length > 0 && !t.paidAt && allow("kafe.void") && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (!requireShift()) return;
                      setVoidTableId(t.id);
                    }}
                  >
                    <Ban className="size-4" /> VOID
                  </Button>
                )}
                {/* Sesi meja bisa diakhiri kalau sudah lunas atau tidak ada tagihan. */}
                {filled && (t.paidAt || t.orders.length === 0) && allow("kafe.akhiri") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      confirmAction({
                        title: `Akhiri sesi ${t.name}?`,
                        description:
                          "Meja akan kembali berstatus kosong dan siap dipakai lagi.",
                        actionLabel: "Akhiri Sesi",
                        onConfirm: () => {
                          clearCafeTable(t.id);
                          toast.success(`Sesi ${t.name} diakhiri`);
                        },
                      })
                    }
                  >
                    <Receipt className="size-4" /> Akhiri Sesi
                  </Button>
                )}
                {allowDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Hapus ${t.name}`}
                    onClick={() =>
                      confirmAction({
                        title: `Hapus ${t.name}?`,
                        description: "Meja ini dihapus dari daftar meja kafe.",
                        actionLabel: "Hapus",
                        onConfirm: () => {
                          if (!removeCafeTable(t.id)) {
                            toast.error(`${t.name} masih terisi`);
                            return;
                          }
                          toast.success(`${t.name} dihapus`);
                        },
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </SortableItem>
          );
        })}
      </SortableArea>

      <OrderDraftDialog
        open={Boolean(orderTableId)}
        onOpenChange={(open) => {
          if (!open) setOrderTableId(null);
        }}
        sourceName={cafeTables.find((t) => t.id === orderTableId)?.name ?? ""}
        existing={cafeTables.find((t) => t.id === orderTableId)?.orders ?? []}
        onSend={(lines) => {
          if (!orderTableId) return;
          for (const line of lines) {
            addCafeOrder(orderTableId, line.item, line.qty, line.mods, line.priceAdd);
          }
        }}
      />

      <VoidDialog
        open={Boolean(voidTableId)}
        onOpenChange={(open) => {
          if (!open) setVoidTableId(null);
        }}
        sourceName={cafeTables.find((t) => t.id === voidTableId)?.name ?? ""}
        onConfirm={(reason) => {
          if (!voidTableId) return;
          const done = voidCafeTable(voidTableId, reason);
          setVoidTableId(null);
          setOpenId(null);
          if (done) toast.success(`Pesanan ${done.sourceName} di-VOID`);
        }}
      />



      <Dialog open={Boolean(table)} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {table && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Coffee className="size-5 text-primary" />
                  {table.name}
                </DialogTitle>
                <DialogDescription>
                  {table.area} · {table.seats} kursi
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <CustomerPicker
                    id="cafe-customer"
                    label="Nama pelanggan"
                    value={table.customerName}
                    onChange={(value) => updateCafeTable(table.id, { customerName: value })}
                    onPick={(item) =>
                      updateCafeTable(table.id, { customerName: item.name })
                    }
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="cafe-notes">Catatan</Label>
                    <Input
                      id="cafe-notes"
                      value={table.notes}
                      placeholder="mis. tanpa gula"
                      onChange={(e) => updateCafeTable(table.id, { notes: e.target.value })}
                    />
                  </div>
                </div>

                {allow("kafe.order") && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (!requireShift()) return;
                      setOrderTableId(table.id);
                    }}
                  >
                    <Plus className="size-4" /> Tambah Order
                  </Button>
                )}


                {table.orders.length > 0 && (
                  <ul className="space-y-1">
                    {table.orders.map((o) => (
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
                              aria-label={`Cetak label ${o.name}`}
                              title="Cetak label"
                              className="text-muted-foreground transition-colors hover:text-primary"
                              onClick={() =>
                                printOrderLabels(
                                  [o],
                                  table.name,
                                  table.customerName ?? undefined,
                                  table.notes ?? undefined,
                                )
                              }
                            >
                              <Printer className="size-3.5" />
                            </button>
                          )}
                          {allow("kafe.hapusorder") && (
                            <button
                              aria-label={`Hapus ${o.name}`}
                              onClick={() =>
                                confirmAction({
                                  title: `Hapus ${o.name}?`,
                                  description: `${o.name} × ${o.qty} dibatalkan dari pesanan ${table.name}.`,
                                  actionLabel: "Hapus",
                                  onConfirm: () => removeCafeOrder(table.id, o.id),
                                })
                              }
                            >
                              <Trash2 className="size-3.5 text-muted-foreground" />
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {pickedOrders.length > 0 && (
                  <OrderSelectionActions
                    source={{ type: "table", id: table.id }}
                    sourceName={table.name}
                    orders={pickedOrders}
                    payPermission="kafe.bayar"
                    transferPermission="kafe.gabung"
                    onDone={() => setPickedIds([])}
                    onPaid={(record) => setPaidRecord(record)}
                  />
                )}


                {table.orders.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {labelPrinters.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          printOrderLabels(
                            table.orders,
                            table.name,
                            table.customerName ?? undefined,
                            table.notes ?? undefined,
                          )
                        }
                      >
                        <Printer className="size-4" /> Cetak semua label
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={previewBill}>
                      <Printer className="size-4" /> Cetak Bill
                    </Button>
                  </div>
                )}

                {/* Promo berlaku: bisa diberikan satu atau beberapa sekaligus. */}
                {allow("kafe.promo") && (
                  <PromoPicker
                    target={{ type: "table", id: table.id }}
                    {...(table.promoIds ? { promoIds: table.promoIds } : {})}
                  />
                )}

                {/* Gabung tagihan: meja lain & pesanan sesi TV dibayar dari panel ini. */}

                {allow("kafe.gabung") && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                  <span className="text-sm font-semibold">Gabung Tagihan</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!requireShift()) return;
                      setMergeOpen(true);
                    }}
                  >
                    <Link2 className="size-4" /> Gabung Tagihan
                  </Button>
                  {linkedOrders.length > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        Titipan dari {linkedSourceNames.join(", ")}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          confirmAction({
                            title: "Lepas gabungan tagihan?",
                            description: `Pesanan titipan dikembalikan ke ${linkedSourceNames.join(", ")}.`,
                            actionLabel: "Lepas",
                            destructive: false,
                            onConfirm: () => {
                              unmergeCafeTables(table.id);
                              toast.success("Gabungan tagihan dilepas");
                            },
                          })
                        }
                      >
                        <Unlink className="size-4" /> Lepas gabungan
                      </Button>
                    </>
                  )}
                </div>
                )}



                <div className="space-y-3 border-t border-border pt-4">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatRupiah(bill.subtotal)}</span>
                    </div>
                    {bill.itemDiscount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Potongan menu</span>
                        <span className="text-neon">-{formatRupiah(bill.itemDiscount)}</span>
                      </div>
                    )}
                    {bill.promoDiscount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{bill.promoName}</span>
                        <span className="text-neon">-{formatRupiah(bill.promoDiscount)}</span>
                      </div>
                    )}
                    {bill.manualDiscount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Diskon transaksi</span>
                        <span className="text-neon">-{formatRupiah(bill.manualDiscount)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Receipt className="size-4 text-primary" /> Total
                    </span>
                    <span className="text-neon">{formatRupiah(total)}</span>
                  </div>

                  {cafePaid > 0 && (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sudah dibayar</span>
                        <span>{formatRupiah(cafePaid)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Sisa Tagihan</span>
                        <span className={dueAmount > 0 ? "text-destructive" : "text-neon"}>
                          {dueAmount > 0 ? formatRupiah(dueAmount) : "Lunas"}
                        </span>
                      </div>
                    </div>
                  )}

                  {(table.settlements ?? []).length > 0 && (
                    <div className="space-y-1.5 rounded-md border border-border p-3">
                      <p className="text-sm font-medium text-neon">Pembayaran diterima</p>
                      <ul className="space-y-1">
                        {(table.settlements ?? []).map((s) => (
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
                              {allow("kafe.void") && (
                                <button
                                  type="button"
                                  aria-label="Batalkan pembayaran"
                                  className="text-muted-foreground transition-colors hover:text-destructive"
                                  onClick={() =>
                                    confirmAction({
                                      title: "Batalkan pembayaran ini?",
                                      description: `${s.payment} ${formatRupiah(s.amount)} akan dihapus dan kembali menjadi tagihan meja.`,
                                      actionLabel: "Batalkan pembayaran",
                                      destructive: true,
                                      onConfirm: () => {
                                        removeCafeSettlement(table.id, s.id);
                                        toast.success("Pembayaran dibatalkan");
                                      },
                                    })
                                  }
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


                  {allow("kafe.diskon") && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Diskon transaksi</Label>
                      <Select
                        value={discType}
                        onValueChange={(v) => setDiscType(v as DiscountType)}
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
                      <Label htmlFor="cafe-disc">Nilai diskon</Label>
                      <Input
                        id="cafe-disc"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={discValue}
                        onChange={(e) => setDiscValue(e.target.value)}
                      />
                    </div>
                  </div>
                  )}

                  {dueAmount > 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="cafe-pay-amount">
                        Jumlah dibayar sekarang (kosongkan untuk lunas)
                      </Label>
                      <Input
                        id="cafe-pay-amount"
                        type="number"
                        min={0}
                        max={dueAmount}
                        placeholder={String(dueAmount)}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                      {isPartial && (
                        <p className="text-xs text-muted-foreground">
                          Bayar sebagian (DP) {formatRupiah(payTarget)} · sisa{" "}
                          {formatRupiah(dueAmount - payTarget)} tetap jadi tagihan meja.
                        </p>
                      )}
                    </div>
                  )}


                  {activeMethods.length > 1 && allow("kafe.split") && (
                    <div className="flex justify-end">
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
                              { method: activeMethods[0]?.name ?? "Cash", amount: String(payTarget) },
                              { method: activeMethods[1]?.name ?? "QRIS", amount: "0" },
                            ]);
                          }
                        }}
                      >
                        {splitMode ? "Satu metode saja" : "Split Bill"}
                      </button>
                    </div>
                  )}

                  {activeMethods.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada tipe pembayaran aktif. Atur di menu Pembayaran.
                    </p>
                  ) : splitMode ? (
                    <div className="space-y-2">
                      {splits.map((row, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Select
                            value={row.method || activeMethods[0]?.name || "Cash"}
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
                              {activeMethods.map((m) => (
                                <SelectItem key={m.id} value={m.name}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={0}
                            className="flex-1"
                            aria-label={`Jumlah ${row.method}`}
                            value={row.amount}
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSplits((prev) => [
                            ...prev,
                            {
                              method: activeMethods[0]?.name ?? "Cash",
                              amount: String(splitRemaining),
                            },
                          ])
                        }
                      >
                        <Plus className="size-4" /> Tambah metode
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {splitRemaining > 0
                          ? `Masih kurang ${formatRupiah(splitRemaining)}`
                          : `Terkumpul ${formatRupiah(splitPaid)}`}
                      </p>
                      {splitCardAmount > 0 && (
                        <CardPaymentPanel
                          cardNumber={cardNumber}
                          onCardNumberChange={setCardNumber}
                          need={splitCardAmount}
                          discount={bill.discount}
                          inputId="cafe-split-card-number"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Metode pembayaran</Label>
                        <Select value={payMethod} onValueChange={setPayMethod}>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih metode" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeMethods.map((m) => (
                              <SelectItem key={m.id} value={m.name}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cafe-received">
                          {isCardPayment ? "Nominal tercatat" : "Uang diterima"}
                        </Label>
                        <Input
                          id="cafe-received"
                          type="number"
                          min={0}
                          value={received === "" ? payTarget : received}
                          onChange={(e) => setReceived(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {isCardPayment && !splitMode && (
                    <div className="space-y-3">
                      <CardPaymentPanel
                        cardNumber={cardNumber}
                        onCardNumberChange={setCardNumber}
                        need={cardCharge}
                        discount={bill.discount}
                        inputId="cafe-card-number"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="cafe-card-part">Dibayar dengan kartu</Label>
                          <Input
                            id="cafe-card-part"
                            type="number"
                            min={0}
                            max={payTarget}
                            value={cardPart === "" ? String(payTarget) : cardPart}

                            onChange={(e) => setCardPart(e.target.value)}
                          />
                        </div>
                        {restAmount > 0 && (
                          <div className="space-y-1.5">
                            <Label>Sisa {formatRupiah(restAmount)} dibayar dengan</Label>
                            <Select value={restMethod} onValueChange={setRestPay}>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih metode" />
                              </SelectTrigger>
                              <SelectContent>
                                {otherMethods.map((m) => (
                                  <SelectItem key={m.id} value={m.name}>
                                    {m.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!splitMode && (
                  <p className="text-xs text-muted-foreground">
                    {isCardPayment
                      ? card
                        ? `Kartu ${formatRupiah(cardCharge)}${
                            restAmount > 0
                              ? ` + ${restMethod} ${formatRupiah(restAmount)}`
                              : ""
                          }`
                        : "Scan atau ketik nomor kartu yang sudah terdaftar."
                      : received === "" || shortage === 0
                      ? `Kembalian: ${formatRupiah(received === "" ? 0 : change)}`
                      : `Kurang: ${formatRupiah(shortage)}`}
                  </p>
                  )}

                </div>
              </div>

              {allow("kafe.pindahmeja") && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                <span className="text-sm font-semibold">Pindah meja</span>
                <Select value={tableMoveTo} onValueChange={setTableMoveTo}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Pilih meja kosong…" />
                  </SelectTrigger>
                  <SelectContent>
                    {cafeTables.filter(
                      (t) => t.id !== table.id && !t.openedAt && t.orders.length === 0,
                    ).length === 0 ? (
                      <SelectItem value="none" disabled>
                        Tidak ada meja kosong
                      </SelectItem>
                    ) : (
                      cafeTables
                        .filter((t) => t.id !== table.id && !t.openedAt && t.orders.length === 0)
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                            {t.area ? ` · ${t.area}` : ""}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!tableMoveTo || tableMoveTo === "none"}
                  onClick={() => {
                    const target = cafeTables.find((t) => t.id === tableMoveTo);
                    if (!target) return;
                    const ok = moveCafeTable(table.id, tableMoveTo);
                    if (!ok) {
                      toast.error("Gagal pindah meja", {
                        description: "Meja tujuan sudah terpakai. Pilih meja lain.",
                      });
                      return;
                    }
                    setTableMoveTo("");
                    setOpenId(null);
                    toast.success(`Pesanan dipindah ke ${target.name}`, {
                      description: "Semua pesanan dan data pelanggan ikut berpindah.",
                    });
                  }}
                >
                  Pindahkan
                </Button>
              </div>
              )}

              <DialogFooter className="flex-col gap-2 sm:flex-row">

                {allow("kafe.void") && dueAmount > 0 && table.orders.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    confirmAction({
                      title:
                        cafePaid > 0
                          ? `Batalkan sisa tagihan ${table.name}?`
                          : `Batalkan pesanan ${table.name}?`,
                      description:
                        cafePaid > 0
                          ? `Hanya sisa tagihan ${formatRupiah(dueAmount)} yang dibatalkan. Pembayaran ${formatRupiah(cafePaid)} yang sudah diterima tetap tercatat sebagai nota.`
                          : "Seluruh pesanan di meja ini dibatalkan tanpa pembayaran.",
                      actionLabel: cafePaid > 0 ? "Batalkan sisa tagihan" : "Batalkan pesanan",
                      destructive: true,
                      onConfirm: () => {
                        const record = cancelCafeRemainder(table.id);
                        toast.success(
                          record
                            ? `Sisa tagihan ${table.name} dibatalkan`
                            : `Pesanan ${table.name} dibatalkan`,
                        );
                        setOpenId(null);
                        if (record) setPaidRecord(record);
                      },
                    })
                  }
                >
                  {cafePaid > 0 ? "Batalkan sisa tagihan" : "Batalkan pesanan"}
                </Button>
                )}
                <Button
                  disabled={
                    table.orders.length === 0 ||
                    dueAmount <= 0 ||
                    activeMethods.length === 0 ||
                    !allow("kafe.bayar")
                  }
                  onClick={handleCafePay}
                >
                  {dueAmount <= 0
                    ? "Sudah Lunas"
                    : isPartial
                      ? `Bayar ${formatRupiah(payTarget)}`
                      : "Bayar & selesaikan"}
                </Button>
              </DialogFooter>

            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gabung Tagihan ke {table?.name ?? "meja ini"}</DialogTitle>
            <DialogDescription>
              Pesanan meja lain dan pesanan sesi {unit} bisa dibayar dari panel ini. Biaya rental {unit}
              tetap dibayar di panel {unit}-nya. Bisa dilepas selama belum dibayar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Meja lain yang ada pesanannya</p>
              {mergeTableCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada meja lain yang bisa digabung.
                </p>
              ) : (
                mergeTableCandidates.map((other) => (
                  <div
                    key={other.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 p-2"
                  >
                    <span className="text-sm">
                      {other.name} · {other.orders.length} pesanan ·{" "}
                      {formatRupiah(tableTotal(other))}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!table) return;
                        confirmAction({
                          title: `Gabung ${other.name} ke ${table.name}?`,
                          description: `${other.orders.length} pesanan senilai ${formatRupiah(
                            tableTotal(other),
                          )} ikut dibayar dari ${table.name}. Total baru ${formatRupiah(
                            total + tableTotal(other),
                          )}.`,
                          actionLabel: "Gabung",
                          destructive: false,
                          onConfirm: () => {
                            if (mergeCafeTables(table.id, [other.id]))
                              toast.success(`${other.name} digabung ke ${table.name}`);
                            else toast.error("Meja ini tidak bisa digabung");
                          },
                        });
                      }}
                    >
                      Gabung
                    </Button>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">{unit} yang ada pesanannya</p>
              {mergeStationCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada pesanan di sesi {unit}.</p>
              ) : (
                mergeStationCandidates.map((s) => {
                  const value = (s.session?.orders ?? []).reduce(
                    (sum, o) => sum + o.price * o.qty,
                    0,
                  );
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 p-2"
                    >
                      <span className="text-sm">
                        {s.name} · {s.session?.orders.length} pesanan · {formatRupiah(value)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!table) return;
                          confirmAction({
                            title: `Titipkan pesanan ${s.name} ke ${table.name}?`,
                            description: `Pesanan senilai ${formatRupiah(
                              value,
                            )} dibayar dari ${table.name}. Biaya rental ${s.name} tetap dibayar di panel ${unit}. Total baru ${formatRupiah(
                              total + value,
                            )}.`,
                            actionLabel: "Titipkan",
                            destructive: false,
                            onConfirm: () => {
                              if (linkStationToTable(table.id, s.id))
                                toast.success(`Pesanan ${s.name} dititipkan ke ${table.name}`);
                              else toast.error(`Pesanan ${unit} ini tidak bisa dititipkan`);
                            },
                          });
                        }}
                      >
                        Titipkan
                      </Button>
                    </div>
                  );
                })
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

      <PaidPrintDialog record={paidRecord} onClose={() => setPaidRecord(null)} />


      <BillPreviewDialog
        open={billPreview !== null}
        onOpenChange={(v) => !v && setBillPreview(null)}
        sourceName={table?.name ?? ""}
        text={billPreview ?? ""}
        onPrint={doPrintBill}
      />

      {confirmDialog}
    </>
  );
}
