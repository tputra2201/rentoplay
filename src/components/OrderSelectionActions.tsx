import { useUnitLabel } from "@/lib/billing-store";
import { useState } from "react";
import { ArrowRightLeft, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useShiftGate } from "@/components/ShiftGate";
import { useCan } from "@/lib/use-can";
import {
  CARD_PAYMENT_NAME,
  cafeBill,
  findCardByNumber,
  formatRupiah,
  orderLabel,
  useBilling,
  type HistoryRecord,
  type OrderItem,
} from "@/lib/billing-store";

type Source = { type: "table" | "station"; id: string };

/**
 * Aksi untuk item pesanan yang dicentang di panel meja kafe atau panel TV:
 * bayar hanya item terpilih, atau transfer item itu ke meja/TV lain.
 */
export function OrderSelectionActions({
  source,
  sourceName,
  orders,
  payPermission,
  transferPermission,
  onDone,
  onPaid,
}: {
  source: Source;
  sourceName: string;
  orders: OrderItem[];
  payPermission: string;
  transferPermission: string;
  onDone: () => void;
  onPaid?: (record: HistoryRecord) => void;
}) {
  const unit = useUnitLabel();
  const {
    paymentMethods,
    payOrderItems,
    transferOrders,
    cafeTables: allCafeTables,
    businessProfile,
    stations,
    menu,
    promotions,
    consoleDiscounts,
    cardDiscountPercent,
    cardMemberDiscountPercent,
    playingCards,
    chargeCard,
    now,
  } = useBilling();
  const allow = useCan();
  const { requireShift } = useShiftGate();

  const [payOpen, setPayOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [received, setReceived] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [target, setTarget] = useState("");

  const activeMethods = paymentMethods.filter((p) => p.active);
  // Bawaan = tunai (nama metode bebas dikustomisasi tiap toko).
  const cashMethodName =
    activeMethods.find((m) => /^(tunai|cash|uang)\b/i.test(m.name.trim()))?.name ??
    activeMethods[0]?.name ??
    "Cash";
  const payMethod = method || cashMethodName;
  const card = isCard ? findCardByNumber(playingCards, cardNumber) : undefined;

  const bill = cafeBill(
    orders,
    now,
    { consoleDiscounts, menu, promotions, cardDiscountPercent, cardMemberDiscountPercent },
    { member: Boolean(card?.member), card: Boolean(isCard && card) },
  );
  const total = bill.total;
  const cafeTables = businessProfile?.modules?.cafe === false ? [] : allCafeTables;
  const receivedValue = received === "" ? total : Math.max(0, Number(received) || 0);

  // Tujuan transfer: meja kafe lain dan TV yang sesinya masih berjalan.
  const targets = [
    ...cafeTables
      .filter((t) => !(source.type === "table" && t.id === source.id))
      .map((t) => ({ key: `table:${t.id}`, label: `Meja ${t.name}` })),
    ...stations
      .filter(
        (s) =>
          s.session &&
          !s.session.paidAt &&
          !(source.type === "station" && s.id === source.id),
      )
      .map((s) => ({ key: `station:${s.id}`, label: `${unit} ${s.name}` })),
  ];

  const closeAll = () => {
    setPayOpen(false);
    setMoveOpen(false);
    setMethod("");
    setReceived("");
    setCardNumber("");
    setTarget("");
  };

  const doPay = () => {
    if (!requireShift()) return;
    if (isCard) {
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
      if (card.balance + 0.5 < total) {
        toast.error("Saldo kartu tidak mencukupi!", {
          description: `Saldo ${formatRupiah(card.balance)}, dibutuhkan ${formatRupiah(total)}.`,
        });
        return;
      }
      if (!chargeCard(card.id, total, `Pembayaran item ${sourceName}`)) {
        toast.error("Saldo kartu tidak mencukupi!");
        return;
      }
    } else if (receivedValue + 0.5 < total) {
      toast.error("Uang diterima kurang dari total item terpilih");
      return;
    }
    const record = payOrderItems(
      source,
      orders.map((o) => o.id),
      {
        payment: payMethod,
        amountPaid: isCard ? total : receivedValue,
        ...(card ? { member: Boolean(card.member) } : {}),
      },
    );
    if (!record) {
      toast.error("Pembayaran item gagal diproses");
      return;
    }
    toast.success(`${orders.length} item lunas ${formatRupiah(record.total)}`, {
      description: `${sourceName} · ${payMethod}`,
    });
    closeAll();
    onDone();
    onPaid?.(record);
  };

  const doTransfer = () => {
    const [type, id] = target.split(":");
    if (!type || !id) {
      toast.error("Pilih tujuan transfer dulu");
      return;
    }
    const ok = transferOrders(
      source,
      { type: type as "table" | "station", id },
      orders.map((o) => o.id),
    );
    if (!ok) {
      toast.error("Transfer pesanan gagal", {
        description: "Pastikan tujuan masih aktif dan belum dibayar.",
      });
      return;
    }
    const label = targets.find((t) => t.key === target)?.label ?? "tujuan";
    toast.success(`${orders.length} item dipindah ke ${label}`);
    closeAll();
    onDone();
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-semibold">
        {orders.length} item dipilih · {formatRupiah(total)}
      </p>
      <p className="text-xs text-muted-foreground">
        {orders.map((o) => `${orderLabel(o)} × ${o.qty}`).join(", ")}
      </p>
      <div className="flex flex-wrap gap-2">
        {allow(payPermission) && (
          <Button size="sm" onClick={() => setPayOpen(true)}>
            <Wallet className="size-4" /> Bayar item terpilih
          </Button>
        )}
        {allow(transferPermission) && (
          <Button size="sm" variant="outline" onClick={() => setMoveOpen(true)}>
            <ArrowRightLeft className="size-4" /> Transfer item
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDone}>
          Batal pilih
        </Button>
      </div>

      <Dialog open={payOpen} onOpenChange={(v) => !v && setPayOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bayar item terpilih</DialogTitle>
            <DialogDescription>
              {orders.length} item dari {sourceName} dibayar sekarang dan keluar dari tagihan
              berjalan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total item</span>
              <span className="text-neon">{formatRupiah(total)}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Metode pembayaran</Label>
              <Select value={payMethod} onValueChange={setMethod}>
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
            {isCard ? (
              <CardPaymentPanel
                cardNumber={cardNumber}
                onCardNumberChange={setCardNumber}
                need={total}
                discount={bill.discount}
                inputId="item-card-number"
              />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="item-received">Uang diterima</Label>
                <Input
                  id="item-received"
                  type="number"
                  min={0}
                  value={received === "" ? total : received}
                  onChange={(e) => setReceived(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Kembalian {formatRupiah(Math.max(0, receivedValue - total))}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Batal
            </Button>
            <Button disabled={activeMethods.length === 0} onClick={doPay}>
              Terima pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={(v) => !v && setMoveOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer item pesanan</DialogTitle>
            <DialogDescription>
              {orders.length} item dari {sourceName} dipindah ke meja kafe atau {unit} lain beserta
              tagihannya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Tujuan</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder={`Pilih meja atau ${unit} tujuan…`} />
              </SelectTrigger>
              <SelectContent>
                {targets.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Tidak ada tujuan yang tersedia
                  </SelectItem>
                ) : (
                  targets.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Batal
            </Button>
            <Button disabled={!target || target === "none"} onClick={doTransfer}>
              Pindahkan item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
