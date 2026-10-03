// TEMPORARY: layout check harness for the TV card. Delete after verifying.
import { createFileRoute } from "@tanstack/react-router";
import { StationCard } from "@/components/StationCard";
import type { Station } from "@/lib/billing-store";

const start = Date.now() - 10 * 60 * 1000;

const playing: Station = {
  id: "t1",
  name: "MONACO",
  console: "PS5",
  booth: "VIP",
  availability: "available",
  session: {
    mode: "package",
    startAt: start,
    durationMin: 60,
    rate: 12000,
    orders: [{ id: "o1", menuId: "m1", name: "Es Kopi Aren", price: 18000, qty: 2 }],
    customerName: "Budi",
    customerPhone: "",
    member: false,
    packageName: "1 Jam",
    notes: "",
    bonusMin: 0,
  },
};

const openEnd: Station = {
  ...playing,
  id: "t2",
  name: "MADRID",
  session: { ...playing.session!, mode: "open", durationMin: 0, customerName: "" },
};

const paused: Station = {
  ...playing,
  id: "t3",
  name: "MILAN",
  session: { ...playing.session!, pausedAt: Date.now() - 60_000, customerName: "Sari" },
};

export const Route = createFileRoute("/_authenticated/cardcheck")({
  ssr: false,
  component: () => (
    <div className="flex flex-wrap items-start gap-6 p-6">
      {[150, 170, 190, 220, 260].map((w) => (
        <div key={w} style={{ width: w }}>
          <p className="mb-1 text-[10px] text-muted-foreground">{w}px</p>
          <StationCard station={playing} now={Date.now()} onClick={() => {}} />
          <div className="h-3" />
          <StationCard station={openEnd} now={Date.now()} onClick={() => {}} />
          <div className="h-3" />
          <StationCard station={paused} now={Date.now()} onClick={() => {}} />
        </div>
      ))}
    </div>
  ),
});
