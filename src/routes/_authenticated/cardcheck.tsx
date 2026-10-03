import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { StationCard } from "@/components/StationCard";
import { StationDialog } from "@/components/StationDialog";
import { useBilling, type Station } from "@/lib/billing-store";

export const Route = createFileRoute("/_authenticated/cardcheck")({
  component: Harness,
  head: () => ({
    meta: [
      { title: "Periksa Kartu TV" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Harness() {
  const { now } = useBilling();
  const [open, setOpen] = useState(false);

  const station: Station = {
    id: "harness-l1",
    name: "L1",
    console: "PS4",
    booth: "Box 1",
    availability: "available",
    session: {
      mode: "prepaid",
      startAt: now - 10 * 60 * 1000,
      durationMin: 60,
      rate: 13000,
      orders: [{ id: "o1", menuId: "m1", name: "Es Kopi Aren", price: 12000, qty: 2 }],
      customerName: "Budi",
      customerPhone: "",
      member: false,
      packageName: "60 mnt",
      notes: "",
      bonusMin: 0,
    },
  };

  return (
    <div className="mx-auto w-[190px] p-6">
      <StationCard station={station} now={now} onClick={() => setOpen(true)} />
      <StationDialog
        station={open ? station : null}
        open={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
      />
    </div>
  );
}
