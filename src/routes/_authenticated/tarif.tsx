import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatRupiah,
  useBilling,
  type AddonMode,
  type AddonRental,
  type ConsoleType,
  type RentalPackage,
  type RoundingRule,
  type StationAvailability,
} from "@/lib/billing-store";
import { DiscountFields } from "@/components/DiscountFields";
import { SetupHeading, SetupTable, DetailField } from "@/components/SetupTable";


const STATION_STATUS_LABEL: Record<StationAvailability, string> = {
  available: "Tersedia",
  booked: "Reservasi",
  maintenance: "Maintenance",
  offline: "Offline",
};

export const Route = createFileRoute("/_authenticated/tarif")({
  head: () => ({
    meta: [
      { title: "Setup Price — RenToPlay" },
      {
        name: "description",
        content:
          "Atur tarif sewa per jam untuk PS3, PS4, dan PS5 serta daftar harga makanan dan minuman.",
      },
      { property: "og:title", content: "Setup Price — RenToPlay" },
      {
        property: "og:description",
        content: "Atur tarif per jam tiap konsol dan harga menu kasir.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TarifPage,
});

function TarifPage() {
  const {
    rates,
    consoleTypes,
    addConsoleType,
    renameConsoleType,
    setConsoleRate,
    setConsoleDiscount,
    consoleDiscounts,
    removeConsoleType,
    stations,
    addStation,
    setStationConsole,
    removeStation,
    updateStation,
    packages,
    addPackage,
    updatePackage,
    removePackage,
    roundingRule,
    setRoundingRule,
    defaultBonusMin,
    setDefaultBonusMin,
    reorderList,
    reorderConsoleTypes,
    addonRentals,
    addAddonRental,
    updateAddonRental,
    setAddonDiscount,
    removeAddonRental,
  } = useBilling();
  const [newAddon, setNewAddon] = useState("");
  const [newAddonPrice, setNewAddonPrice] = useState("");
  const [newAddonMode, setNewAddonMode] = useState<AddonMode>("hourly");
  const [packageName, setPackageName] = useState("");
  const [packageDuration, setPackageDuration] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [newConsole, setNewConsole] = useState("");
  const [newConsoleRate, setNewConsoleRate] = useState("");
  const [name, setName] = useState("");
  const [booth, setBooth] = useState("");
  const [consoleType, setConsoleType] = useState<ConsoleType>(
    consoleTypes[0] ?? "PS4",
  );


  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Setup Price</h1>
      </header>
      <section className="surface-panel p-4 sm:p-6">
        <SetupHeading
          title="Jenis Konsol & Tarif per Jam"
          description="Tambah, ubah nama, atau hapus jenis konsol beserta tarifnya. Potongan harga diisi per jam pemakaian; kalau pelanggan member sekaligus bayar dengan Playing Card, dipakai potongan yang paling besar."
        />

        <SetupTable<string>
          items={consoleTypes}
          getId={(c) => c}
          getLabel={(c) => c}
          onReorder={reorderConsoleTypes}
          columns={[
            {
              key: "name",
              header: "Nama Konsol",
              render: (c) => <span className="font-bold text-foreground">{c}</span>,
            },
            {
              key: "rate",
              header: "Tarif / Jam",
              render: (c) => formatRupiah(rates[c] ?? 0),
            },
          ]}
          onRemove={(c) => {
            if (!removeConsoleType(c)) {
              toast.error("Konsol masih dipakai unit TV atau minimal satu konsol harus ada");
              return;
            }
            toast.success(`Konsol ${c} dihapus`);
          }}
          detailTitle={(c) => `Konsol ${c}`}
          detailDescription={() => "Ubah nama, tarif per jam, dan potongan harga konsol ini."}
          renderDetail={(c) => (
            <>
              <DetailField label="Nama konsol">
                <Input
                  defaultValue={c}
                  aria-label={`Nama konsol ${c}`}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (!next || next === c) {
                      e.target.value = c;
                      return;
                    }
                    if (!renameConsoleType(c, next)) {
                      e.target.value = c;
                      toast.error("Nama konsol sudah dipakai");
                    }
                  }}
                />
              </DetailField>
              <DetailField label="Tarif per jam">
                <Input
                  type="number"
                  min={0}
                  step={500}
                  value={rates[c] ?? 0}
                  aria-label={`Tarif ${c}`}
                  onChange={(e) => setConsoleRate(c, Number(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  {formatRupiah(rates[c] ?? 0)} / jam
                </p>
              </DetailField>
              <DetailField label="Potongan harga">
                <DiscountFields
                  label={c}
                  unitHint="Rp / jam"
                  value={consoleDiscounts[c]}
                  onChange={(patch) => setConsoleDiscount(c, patch)}
                />
              </DetailField>
            </>
          )}
        />

        <form
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_160px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!addConsoleType(newConsole, Number(newConsoleRate) || 0)) {
              toast.error("Nama konsol kosong atau sudah ada");
              return;
            }
            toast.success(`Konsol ${newConsole.trim()} ditambahkan`);
            setNewConsole("");
            setNewConsoleRate("");
          }}
        >
          <Input
            placeholder="Nama konsol (mis. PS2, Nintendo)"
            value={newConsole}
            onChange={(e) => setNewConsole(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            step={500}
            placeholder="Tarif / jam"
            value={newConsoleRate}
            onChange={(e) => setNewConsoleRate(e.target.value)}
          />
          <Button type="submit">
            <Plus className="size-4" /> Tambah
          </Button>
        </form>
      </section>

      <section className="surface-panel p-4 sm:p-6">
        <SetupHeading
          title="Additional Rental"
          description="Sewa tambahan di luar konsol (stik ekstra, VR, kursi, dan lain-lain). Pilih cara hitungnya: mengikuti lama pemakaian (per jam) atau sekali sewa. Item aktif bisa dipilih di panel TV saat transaksi dan masuk kategori “Additional Rental” di laporan."
        />

        <SetupTable<AddonRental>
          items={addonRentals}
          getId={(item) => item.id}
          getLabel={(item) => item.name}
          onReorder={(activeId, overId) => reorderList("addonRentals", activeId, overId)}
          columns={[
            {
              key: "name",
              header: "Nama Item",
              render: (item) => (
                <span className="font-bold text-foreground">{item.name}</span>
              ),
            },
            {
              key: "price",
              header: "Harga",
              render: (item) => (
                <>
                  {formatRupiah(item.price)}
                  {item.mode === "hourly" ? " / jam" : " / sewa"}
                </>
              ),
            },
            {
              key: "mode",
              header: "Cara Hitung",
              hideOnMobile: true,
              render: (item) => (item.mode === "hourly" ? "Per jam" : "Sekali sewa"),
            },
            {
              key: "active",
              header: "Status",
              render: (item) =>
                item.active ? (
                  <span className="font-semibold text-accent">Aktif</span>
                ) : (
                  <span className="text-muted-foreground">Nonaktif</span>
                ),
            },
          ]}
          onRemove={(item) => {
            removeAddonRental(item.id);
            toast.success(`${item.name} dihapus`);
          }}
          detailTitle={(item) => item.name}
          detailDescription={() => "Ubah nama, harga, cara hitung, status, dan potongan harga."}
          renderDetail={(item) => (
            <>
              <DetailField label="Nama item">
                <Input
                  value={item.name}
                  aria-label={`Nama ${item.name}`}
                  onChange={(e) => updateAddonRental(item.id, { name: e.target.value })}
                />
              </DetailField>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Harga">
                  <Input
                    type="number"
                    min={0}
                    step={500}
                    value={item.price}
                    aria-label={`Harga ${item.name}`}
                    onChange={(e) =>
                      updateAddonRental(item.id, { price: Number(e.target.value) || 0 })
                    }
                  />
                </DetailField>
                <DetailField label="Cara hitung">
                  <Select
                    value={item.mode}
                    onValueChange={(v) => updateAddonRental(item.id, { mode: v as AddonMode })}
                  >
                    <SelectTrigger aria-label={`Cara hitung ${item.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Per jam</SelectItem>
                      <SelectItem value="once">Sekali sewa</SelectItem>
                    </SelectContent>
                  </Select>
                </DetailField>
              </div>
              <DetailField label="Status aktif">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={item.active}
                    onCheckedChange={(active) => updateAddonRental(item.id, { active })}
                    aria-label={`Aktifkan ${item.name}`}
                  />
                  {item.active ? "Aktif" : "Nonaktif"}
                </label>
              </DetailField>
              <DetailField label="Potongan harga">
                <DiscountFields
                  label={item.name}
                  unitHint={item.mode === "hourly" ? "Rp / jam" : "Rp / sewa"}
                  value={item.discount}
                  onChange={(patch) => setAddonDiscount(item.id, patch)}
                />
              </DetailField>
            </>
          )}
        />
        <form
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_150px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!addAddonRental(newAddon, Number(newAddonPrice) || 0, newAddonMode)) {
              toast.error("Nama item kosong");
              return;
            }
            toast.success(`${newAddon.trim()} ditambahkan`);
            setNewAddon("");
            setNewAddonPrice("");
          }}
        >
          <Input
            placeholder="Nama item (mis. Stik Ekstra, VR)"
            value={newAddon}
            onChange={(e) => setNewAddon(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            step={500}
            placeholder="Harga"
            value={newAddonPrice}
            onChange={(e) => setNewAddonPrice(e.target.value)}
          />
          <Select value={newAddonMode} onValueChange={(v) => setNewAddonMode(v as AddonMode)}>
            <SelectTrigger aria-label="Cara hitung item baru">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Per jam</SelectItem>
              <SelectItem value="once">Sekali sewa</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">
            <Plus className="size-4" /> Tambah
          </Button>
        </form>
      </section>


      <section className="surface-panel p-4 sm:p-6">
        <SetupHeading
          title="Paket Rental"
          description="Paket aktif muncul saat memulai sesi."
          right={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="default-bonus" className="text-sm text-muted-foreground">Waktu ekstra default (menit)</Label>
                <Input id="default-bonus" type="number" className="w-24" value={defaultBonusMin} onChange={(e) => setDefaultBonusMin(Number(e.target.value) || 0)} />
              </div>
              <Select value={roundingRule} onValueChange={(value) => setRoundingRule(value as RoundingRule)}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="minute">Hitung per menit</SelectItem><SelectItem value="30-minutes">Bulatkan 30 menit</SelectItem><SelectItem value="hour">Bulatkan per jam</SelectItem></SelectContent></Select>
            </div>
          }
        />
        <SetupTable<RentalPackage>
          items={packages}
          getId={(item) => item.id}
          getLabel={(item) => item.name}
          onReorder={(activeId, overId) => reorderList("packages", activeId, overId)}
          columns={[
            {
              key: "name",
              header: "Nama Paket",
              render: (item) => (
                <span className="font-bold text-foreground">{item.name}</span>
              ),
            },
            {
              key: "duration",
              header: "Durasi",
              hideOnMobile: true,
              render: (item) => `${item.durationMin} menit`,
            },
            {
              key: "price",
              header: "Harga",
              render: (item) => formatRupiah(item.price),
            },
            {
              key: "active",
              header: "Status",
              render: (item) =>
                item.active ? (
                  <span className="font-semibold text-accent">Aktif</span>
                ) : (
                  <span className="text-muted-foreground">Nonaktif</span>
                ),
            },
          ]}
          onRemove={(item) => removePackage(item.id)}
          detailTitle={(item) => item.name}
          detailDescription={() => "Ubah nama, durasi, harga khusus, dan status paket."}
          renderDetail={(item) => (
            <>
              <DetailField label="Nama paket">
                <Input
                  value={item.name}
                  onChange={(e) => updatePackage(item.id, { name: e.target.value })}
                  aria-label={`Nama paket ${item.name}`}
                />
              </DetailField>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Durasi (menit)">
                  <Input
                    type="number"
                    min={1}
                    value={item.durationMin}
                    onChange={(e) => updatePackage(item.id, { durationMin: Number(e.target.value) })}
                    aria-label={`Durasi ${item.name}`}
                  />
                </DetailField>
                <DetailField label="Harga khusus">
                  <Input
                    type="number"
                    min={0}
                    value={item.price}
                    onChange={(e) => updatePackage(item.id, { price: Number(e.target.value) })}
                    aria-label={`Harga khusus ${item.name}`}
                  />
                </DetailField>
              </div>
              <DetailField label="Status aktif">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={item.active}
                    onCheckedChange={(active) => updatePackage(item.id, { active })}
                    aria-label={`Aktifkan ${item.name}`}
                  />
                  {item.active ? "Aktif" : "Nonaktif"}
                </label>
              </DetailField>
            </>
          )}
        />
        <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_120px_140px_auto]" onSubmit={(e) => { e.preventDefault(); const minutes = Number(packageDuration); const packageCost = Number(packagePrice); if (!packageName.trim() || minutes <= 0) { toast.error("Lengkapi nama dan durasi paket"); return; } addPackage(packageName.trim(), minutes, packageCost); setPackageName(""); setPackageDuration(""); setPackagePrice(""); }}><Input placeholder="Nama paket" value={packageName} onChange={(e) => setPackageName(e.target.value)} /><Input type="number" min={1} placeholder="Menit" value={packageDuration} onChange={(e) => setPackageDuration(e.target.value)} /><Input type="number" min={0} placeholder="Harga khusus" value={packagePrice} onChange={(e) => setPackagePrice(e.target.value)} /><Button type="submit"><Plus className="size-4" /> Tambah</Button></form>
      </section>



    </div>
  );
}
