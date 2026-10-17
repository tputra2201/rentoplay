import { useEffect, useState } from "react";
import { Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrderModifierDialog, hasMenuOptions } from "@/components/OrderModifierDialog";
import { useShiftGate } from "@/components/ShiftGate";
import { formatRupiah, useBilling, type MenuItem, type OrderItem } from "@/lib/billing-store";
import { stationModuleAccess } from "@/lib/station-module-access";

/** Satu baris pesanan yang sedang disusun kasir, belum dikirim. */
export type DraftLine = {
  key: string;
  item: MenuItem;
  qty: number;
  mods?: string[];
  priceAdd: number;
};

/**
 * Panel pemesanan bersama untuk card TV dan card meja kafe.
 * Pesanan hanya benar-benar masuk saat kasir menekan "Sent Order";
 * menutup panel tanpa menekan tombol itu membatalkan seluruh susunan.
 */
export function OrderDraftDialog({
  open,
  onOpenChange,
  sourceName,
  onSend,
  existing = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  onSend: (lines: DraftLine[]) => void;
  /** Pesanan yang sudah ada di TV/meja ini, untuk indikator jumlah. */
  existing?: OrderItem[];
}) {
  const { menu, menuCategories, businessProfile } = useBilling();
  const { canOrderCafe } = stationModuleAccess(businessProfile?.modules, false, false);
  const { requireShift } = useShiftGate();
  const [category, setCategory] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [modItem, setModItem] = useState<MenuItem | null>(null);
  const [modNotesOnly, setModNotesOnly] = useState(false);

  // Setiap kali panel dibuka kembali, susunan pesanan mulai dari kosong.
  useEffect(() => {
    if (!open) return;
    setCategory(null);
    setLines([]);
    setModItem(null);
  }, [open]);

  const countOf = (id: string) =>
    existing.filter((o) => o.menuId === id && o.price > 0).reduce((s, o) => s + o.qty, 0) +
    lines.filter((l) => l.item.id === id).reduce((s, l) => s + l.qty, 0);

  const push = (item: MenuItem, mods?: string[], priceAdd = 0) => {
    if (!canOrderCafe || !requireShift()) return;
    const modKey = (mods ?? []).join("·");
    setLines((prev) => {
      const idx = prev.findIndex(
        (l) => l.item.id === item.id && l.priceAdd === priceAdd && (l.mods ?? []).join("·") === modKey,
      );
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...prev,
        {
          key: `${item.id}-${Date.now()}-${prev.length}`,
          item,
          qty: 1,
          ...(mods && mods.length > 0 ? { mods } : {}),
          priceAdd,
        },
      ];
    });
  };

  const lineTotal = (line: DraftLine) => (line.item.price + line.priceAdd) * line.qty;
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  const visible =
    category === null
      ? []
      : category === "semua"
        ? menu
        : menu.filter((m) => m.category === category);

  return (
    <Dialog open={open && canOrderCafe} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Tambah Order</DialogTitle>
          <DialogDescription>
            {sourceName} · pesanan baru dikirim setelah menekan Sent Order
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {menuCategories.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={category === c ? "default" : "outline"}
              onClick={() => setCategory(category === c ? null : c)}
            >
              {c}
            </Button>
          ))}
          <Button
            size="sm"
            variant={category === "semua" ? "default" : "outline"}
            onClick={() => setCategory(category === "semua" ? null : "semua")}
          >
            Semua
          </Button>
        </div>

        {category === null && (
          <p className="text-sm text-muted-foreground">
            Pilih kategori untuk menampilkan menu.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {visible.map((item) => {
            const count = countOf(item.id);
            return (
            <div key={item.id} className="space-y-1">
              <Button
                size="sm"
                variant="secondary"
                className={`h-auto w-full justify-between py-2 shadow-sm transition-all duration-75 active:translate-y-0.5 active:scale-[0.97] active:shadow-inner active:brightness-90 ${count > 0 ? "ring-1 ring-primary/50" : ""}`}
                onClick={() => push(item)}
              >
                <span className="flex min-w-0 flex-col items-start text-left">
                  <span className={`truncate ${count > 0 ? "font-semibold text-primary" : ""}`}>
                    {item.name}
                    {count > 0 && ` (${count})`}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRupiah(item.price)}
                  </span>
                </span>
                <Plus className="size-3.5 shrink-0" />
              </Button>
              <div className="flex flex-wrap gap-1">
                {hasMenuOptions(item) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      setModNotesOnly(false);
                      setModItem(item);
                    }}
                  >
                    Modifier
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    setModNotesOnly(true);
                    setModItem(item);
                  }}
                >
                  Notes
                </Button>
              </div>
            </div>
            );
          })}
          {category !== null && visible.length === 0 && (
            <p className="col-span-2 text-sm text-muted-foreground">
              Tidak ada menu pada kategori ini.
            </p>
          )}
        </div>

        <OrderModifierDialog
          item={modItem}
          notesOnly={modNotesOnly}
          onOpenChange={(o) => {
            if (!o) setModItem(null);
          }}
          onConfirm={(mods, priceAdd) => {
            if (!modItem) return;
            push(modItem, mods, priceAdd);
            setModItem(null);
          }}
        />

        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-sm font-semibold">Pesanan yang akan dikirim</p>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pesanan dipilih.</p>
          ) : (
            <ul className="space-y-1">
              {lines.map((line) => (
                <li
                  key={line.key}
                  className="flex items-center justify-between rounded-md bg-secondary px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{line.item.name}</span>
                    {line.mods && line.mods.length > 0 && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {line.mods.join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Kurangi ${line.item.name}`}
                        className="rounded border border-border px-1.5 leading-none text-muted-foreground transition-colors hover:text-primary"
                        onClick={() =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, qty: Math.max(1, row.qty - 1) }
                                : row,
                            ),
                          )
                        }
                      >
                        −
                      </button>
                      <Input
                        type="number"
                        min={1}
                        aria-label={`Jumlah ${line.item.name}`}
                        className="h-7 w-14 px-1 text-center text-sm"
                        value={line.qty}
                        onChange={(e) => {
                          const next = Math.max(1, Math.round(Number(e.target.value) || 1));
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key ? { ...row, qty: next } : row,
                            ),
                          );
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Tambah ${line.item.name}`}
                        className="rounded border border-border px-1.5 leading-none text-muted-foreground transition-colors hover:text-primary"
                        onClick={() =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key ? { ...row, qty: row.qty + 1 } : row,
                            ),
                          )
                        }
                      >
                        +
                      </button>
                    </span>
                    {formatRupiah(lineTotal(line))}
                    <button
                      type="button"
                      aria-label={`Batalkan ${line.item.name}`}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      onClick={() =>
                        setLines((prev) => prev.filter((row) => row.key !== line.key))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Total pesanan baru</span>
          <span className="font-display text-lg font-semibold text-accent">
            {formatRupiah(total)}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            className="flex-1"
            disabled={!canOrderCafe || lines.length === 0}
            onClick={() => {
              if (!canOrderCafe || !requireShift()) return;
              onSend(lines);
              toast.success(`${lines.length} pesanan dikirim`, {
                description: sourceName,
              });
              setLines([]);
              onOpenChange(false);
            }}
          >
            <Send className="size-4" /> Sent Order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
