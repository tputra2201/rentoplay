import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountMapping, CashHistory, FinanceSetup } from "@/components/finance/FinanceParts";

export const Route = createFileRoute("/_authenticated/kas")({
  head: () => ({
    meta: [
      { title: "Setup Finance — Item & Kategori — RenToPlay" },
      { name: "description", content: "Atur kategori dan item uang masuk & uang keluar: Sales, Other Revenue, Pay-In, Expenses, Pay-Out." },
      { property: "og:title", content: "Setup Finance — Item & Kategori — RenToPlay" },
      { property: "og:description", content: "Atur akun keuangan toko: Sales, Other Revenue, Pay-In, Expenses, Pay-Out." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KasPage,
});

function KasPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Finance</h1>
        <p className="text-sm text-muted-foreground">
          Setup kategori & item uang masuk dan uang keluar. Pencatatan harian ada di menu PAY-IN/OUT.
        </p>
      </header>
      <Tabs defaultValue="setup">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="setup">Kategori &amp; Item</TabsTrigger>
          <TabsTrigger value="mapping">Account Mapping</TabsTrigger>
          <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
        </TabsList>
        <TabsContent value="setup" className="mt-4">
          <FinanceSetup />
        </TabsContent>
        <TabsContent value="mapping" className="mt-4">
          <AccountMapping />
        </TabsContent>
        <TabsContent value="riwayat" className="mt-4">
          <CashHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
