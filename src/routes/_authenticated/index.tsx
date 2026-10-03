import { useUnitLabel } from "@/lib/billing-store";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, Coins, MonitorPlay } from "lucide-react";
import { StationCard } from "@/components/StationCard";
import { SortableArea, SortableItem } from "@/components/Sortable";
import { StationDialog } from "@/components/StationDialog";
import { CafeTables } from "@/components/CafeTables";
import {
  CARD_PAYMENT_NAME,
  cafeBill,
  formatRupiah,
  paidTotal,
  sessionBill,
  stationStatus,
  useBilling,
} from "@/lib/billing-store";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard TV — RenToPlay" },
      {
        name: "description",
        content:
          "Pantau semua TV rental PlayStation: status kosong, sedang main, atau waktu habis, lengkap dengan timer dan total tagihan.",
      },
      { property: "og:title", content: "Dashboard TV — RenToPlay" },
      {
        property: "og:description",
        content:
          "Pantau status dan timer setiap TV rental PlayStation secara real-time.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const unit = useUnitLabel();
  const {
    stations,
    cafeTables,
    now,
    bookings,
    reorderList,
    consoleDiscounts,
    menu,
    promotions,
    addonRentals,
    cardDiscountPercent,
    cardMemberDiscountPercent,
    businessProfile,
  } = useBilling();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<"timer" | "order" | "payment">("timer");

  const active = stations.filter((s) => s.session);
  const available = stations.filter((s) => stationStatus(s, now, bookings) === "idle");
  const openBill = active.reduce((sum, s) => {
    const session = s.session;
    if (!session) return sum;
    const usedCard = Boolean(
      session.settlements?.some(
        (settlement) =>
          settlement.payment === CARD_PAYMENT_NAME ||
          settlement.payments?.some((row) => row.method === CARD_PAYMENT_NAME),
      ),
    );
    const bill = sessionBill(
      session,
      now,
      s.console,
      {
        consoleDiscounts,
        menu,
        promotions,
        addonRentals,
        cardDiscountPercent,
        cardMemberDiscountPercent,
      },
      { member: Boolean(session.member), card: usedCard },
    );
    return sum + Math.max(0, bill.total - paidTotal(session));
  }, 0);
  const cafeOpenBill = businessProfile?.modules?.cafe === false
    ? 0
    : cafeTables.reduce((sum, t) => {
        if (!t.orders.length || t.paidAt) return sum;
        const usedCard = Boolean(
          t.settlements?.some(
            (st) =>
              st.payment === CARD_PAYMENT_NAME ||
              st.payments?.some((row) => row.method === CARD_PAYMENT_NAME),
          ),
        );
        const bill = cafeBill(
          t.orders,
          now,
          { consoleDiscounts, menu, promotions, cardDiscountPercent, cardMemberDiscountPercent },
          { member: false, card: usedCard },
          undefined,
          t.promoIds,
        );
        const paid = (t.settlements ?? []).reduce((a, st) => a + (st.amount ?? 0), 0);
        return sum + Math.max(0, bill.total - paid);
      }, 0);
  const totalOpenBill = openBill + cafeOpenBill;
  const selected = stations.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Dashboard</h1>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<MonitorPlay className="size-5" />}
          label={`${unit} Tersedia`}
          value={`${available.length} / ${stations.length}`}
        />
        <StatCard
          icon={<Activity className="size-5" />}
          label="Sedang Main"
          value={String(active.length)}
        />
        <StatCard
          icon={<Coins className="size-5" />}
          label="Tagihan Berjalan"
          value={formatRupiah(totalOpenBill)}
          hint={
            businessProfile?.modules?.cafe === false
              ? undefined
              : `${unit}: ${formatRupiah(openBill)} · Kafe: ${formatRupiah(cafeOpenBill)}`
          }
        />
        
      </section>

      <SortableArea
        ids={stations.map((s) => s.id)}
        onReorder={(activeId, overId) => reorderList("stations", activeId, overId)}
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        {stations.map((station) => (
          <SortableItem
            key={station.id}
            id={station.id}
            handle={false}
            label={station.name}
            className="min-w-0"
          >
            <StationCard
              station={station}
              now={now}
              onClick={(sec) => { setSection(sec ?? "timer"); setSelectedId(station.id); }}
            />
          </SortableItem>
        ))}
      </SortableArea>

      {businessProfile.modules.cafe && (
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Meja Kafe</h2>
          <p className="text-sm text-muted-foreground">
            Untuk pelanggan yang hanya makan atau ngopi. Klik Pesanan untuk mencatat dan
            membayar. Kartu bisa digeser untuk mengatur posisinya.
          </p>
        </div>
        <CafeTables />
      </section>
      )}

      <StationDialog
        key={`${selectedId ?? "kosong"}-${section}`}
        initialSection={section}
        station={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />

    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="surface-panel flex items-center gap-4 p-5">
      <span className="flex size-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
        {icon}
      </span>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="font-display text-xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
