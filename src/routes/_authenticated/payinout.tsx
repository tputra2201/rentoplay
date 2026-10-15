import { createFileRoute } from "@tanstack/react-router";
import { CashHistory, FinanceQuickActions, TodayStats } from "@/components/finance/FinanceParts";

export const Route = createFileRoute("/_authenticated/payinout")({
  head: () => ({
    meta: [
      { title: "PAY-IN / PAY-OUT — RenToPlay" },
      { name: "description", content: "Catat PAY-IN dan PAY-OUT kasir selama shift berjalan." },
      { property: "og:title", content: "PAY-IN / PAY-OUT — RenToPlay" },
      { property: "og:description", content: "Form cepat pencatatan uang masuk dan keluar kasir." },
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
        <h1 className="text-3xl font-bold sm:text-4xl">PAY-IN / PAY-OUT</h1>
      </header>
      <TodayStats />
      <FinanceQuickActions />
      <CashHistory />
    </div>
  );
}
