import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PAYMENT_MODULES, formatRupiah, useBilling, type PaymentMethod } from "@/lib/billing-store";
import { SetupHeading, SetupTable, DetailField } from "@/components/SetupTable";

export const Route = createFileRoute("/_authenticated/pembayaran")({
  head: () => ({
    meta: [
      { title: "Pengaturan Pembayaran — RenToPlay" },
      {
        name: "description",
        content:
          "Atur tipe pembayaran rental PS: cash, QRIS, gift card, transfer bank, compliment, dan tipe lain yang bisa ditambah atau diubah kapan saja.",
      },
      {
        property: "og:title",
        content: "Pengaturan Pembayaran — RenToPlay",
      },
      {
        property: "og:description",
        content:
          "Kelola daftar tipe pembayaran yang muncul saat pelanggan menyelesaikan sesi bermain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PembayaranPage,
});

function PembayaranPage() {
  const {
    paymentMethods,
    addPaymentMethod,
    updatePaymentMethod,
    removePaymentMethod,
    reorderList,
    history,
  } = useBilling();
  const [name, setName] = useState("");

  const todayKey = new Date().toDateString();
  const today = history.filter(
    (h) => new Date(h.endAt).toDateString() === todayKey,
  );
  const perMethod: (PaymentMethod & { total: number })[] = paymentMethods.map((p) => ({
    ...p,
    total: today
      .filter((h) => (h.payment ?? "Cash") === p.name)
      .reduce((s, h) => s + h.total, 0),
  }));

  const handleAdd = () => {
    const value = name.trim();
    if (!value) return;
    if (
      paymentMethods.some((p) => p.name.toLowerCase() === value.toLowerCase())
    ) {
      toast.error("Tipe pembayaran itu sudah ada");
      return;
    }
    addPaymentMethod(value);
    setName("");
    toast.success(`${value} ditambahkan`);
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Pengaturan Pembayaran</h1>
      </header>

      <section className="surface-panel space-y-4 p-4 sm:p-6">
        <SetupHeading
          title="Tipe Pembayaran"
          description="Klik detail untuk mengubah nama atau status tipe pembayaran."
        />

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1 space-y-1.5">
            <label htmlFor="pm-name" className="text-sm font-medium">
              Tambah tipe pembayaran
            </label>
            <Input
              id="pm-name"
              value={name}
              placeholder="Misal: OVO, Dana, Voucher Member"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
          </div>
          <Button onClick={handleAdd}>
            <Plus className="size-4" /> Tambah
          </Button>
        </div>

        <SetupTable<PaymentMethod & { total: number }>
          items={perMethod}
          getId={(p) => p.id}
          getLabel={(p) => p.name}
          columns={[
            {
              key: "name",
              header: "Nama",
              render: (p) => <span className="font-bold text-foreground">{p.name}</span>,
            },
            {
              key: "total",
              header: "Hari Ini",
              render: (p) => formatRupiah(p.total),
            },
            {
              key: "status",
              header: "Status",
              render: (p) =>
                p.active ? (
                  <span className="font-semibold text-accent">Aktif</span>
                ) : (
                  <span className="text-muted-foreground">Nonaktif</span>
                ),
            },
          ]}
          onReorder={(activeId, overId) => reorderList("paymentMethods", activeId, overId)}
          onRemove={(p) => {
            removePaymentMethod(p.id);
            toast.success(`${p.name} dihapus`);
          }}
          detailTitle={(p) => p.name}
          detailDescription={() => "Ubah nama dan status tipe pembayaran ini."}
          emptyText="Belum ada tipe pembayaran."
          renderDetail={(p) => (
            <>
              <DetailField label="Nama tipe pembayaran">
                <Input
                  value={p.name}
                  onChange={(e) => updatePaymentMethod(p.id, { name: e.target.value })}
                  aria-label={`Nama tipe pembayaran ${p.name}`}
                />
              </DetailField>
              <DetailField label="Total hari ini">
                <p className="text-sm text-muted-foreground">{formatRupiah(p.total)}</p>
              </DetailField>
              <DetailField label="Status aktif">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={p.active}
                    onCheckedChange={(v) => updatePaymentMethod(p.id, { active: v })}
                    aria-label={`Aktifkan ${p.name}`}
                  />
                  {p.active ? "Aktif" : "Nonaktif"}
                </label>
              </DetailField>
              <DetailField label="Muncul di">
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_MODULES.map((mod) => {
                    const current = p.modules ?? PAYMENT_MODULES.map((x) => x.key);
                    const on = current.includes(mod.key);
                    return (
                      <label key={mod.key} className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={on}
                          onCheckedChange={(v) =>
                            updatePaymentMethod(p.id, {
                              modules: v
                                ? [...current, mod.key]
                                : current.filter((k) => k !== mod.key),
                            })
                          }
                          aria-label={`${p.name} di ${mod.label}`}
                        />
                        {mod.label}
                      </label>
                    );
                  })}
                </div>
              </DetailField>
            </>
          )}
        />
      </section>
    </div>
  );
}
