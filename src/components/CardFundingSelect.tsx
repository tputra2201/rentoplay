import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBilling } from "@/lib/billing-store";

/** Metode yang tidak logis untuk mengisi saldo kartu. */
const EXCLUDED = /playing\s*card|compliment|kartu/i;

/**
 * Pilihan metode pembayaran untuk pembelian kartu baru dan top up saldo:
 * semua metode aktif store, kecuali Playing Card dan Compliment.
 */
export function CardFundingSelect({
  value,
  onChange,
  id,
  label = "Metode pembayaran",
}: {
  value: string;
  onChange: (value: string) => void;
  id: string;
  label?: string;
}) {
  const { paymentMethods } = useBilling();
  const active = paymentMethods
    .filter((m) => m.active && (!m.modules || m.modules.includes("card")) && !EXCLUDED.test(m.name))
    .map((m) => m.name);
  const options = Array.from(
    new Set(active.some((n) => n.toLowerCase() === "cash") ? active : ["Cash", ...active]),
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Cash" />
        </SelectTrigger>
        <SelectContent>
          {options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
