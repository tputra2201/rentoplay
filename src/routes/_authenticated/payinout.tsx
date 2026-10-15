import { createFileRoute } from "@tanstack/react-router";
import { CashHistory, FinanceQuickActions, TodayStats } from "@/components/finance/FinanceParts";

export const Route = createFileRoute("/_authenticated/payinout")({
  head: () => ({
    meta: [
      { title: "Finance — RenToPlay" },
      { name: "description", content: "Catat Other Revenue, Expenses, Pay-In, dan Pay-Out selama shift berjalan." },
      { property: "og:title", content: "Finance — RenToPlay" },
      { property: "og:description", content: "Pencatatan uang masuk dan keluar kasir." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PayInOutPage,
});

function PayInOutPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Finance</h1>
      </header>
      <TodayStats />
      <FinanceQuickActions />
      <CashHistory />
    </div>
  );
}
