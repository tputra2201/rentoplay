import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyItemDiscount,
  formatRupiah,
  menuOptionsText,
  parseMenuOptions,
  useBilling,
  type MenuItem,
  type CafeTable,
} from "@/lib/billing-store";
import { tableTotal } from "@/components/CafeTables";
import { SetupHeading, SetupTable, DetailField } from "@/components/SetupTable";
import { DiscountFields } from "@/components/DiscountFields";
import { Switch } from "@/components/ui/switch";
import { PRINTER_ROLE_LABEL } from "@/lib/printing";

export const Route = createFileRoute("/_authenticated/kafe")({
  head: () => ({
    meta: [
      { title: "Pengaturan Meja Kafe — RenToPlay" },
      {
        name: "description",
        content:
          "Atur nomor meja, area, dan jumlah kursi untuk layanan kafe tanpa rental PlayStation.",
      },
      { property: "og:title", content: "Pengaturan Meja Kafe" },
      {
        property: "og:description",
        content: "Tambah, ubah, atau hapus nomor meja kafe beserta area dan jumlah kursi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KafePage,
});

function KafePage() {
  const {
    cafeTables,
    addCafeTable,
    updateCafeTable,
    removeCafeTable,
    menu,
    menuOrderMode,
    menuCategories,
    addMenuItem,
    updateMenuItem,
    removeMenuItem,
    addMenuCategory,
    renameMenuCategory,
    removeMenuCategory,
    reorderList,
    reorderMenuCategories,
    printers,
  } = useBilling();

  const labelPrinters = printers.filter((p) => p.active);

  const [newName, setNewName] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newSeats, setNewSeats] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const openTables = cafeTables.filter((t) => t.orders.length > 0 || t.openedAt);
  const grandTotal = openTables.reduce((sum, t) => sum + tableTotal(t), 0);
  const orderedMenu = useMemo(() => {
    return [...menu].sort((a, b) => {
      if (menuOrderMode === "manual") {
        const byManualOrder = (a.sort ?? Number.MAX_SAFE_INTEGER) -
          (b.sort ?? Number.MAX_SAFE_INTEGER);
        if (byManualOrder !== 0) return byManualOrder;
      }
      const byCategory = (a.category || "").localeCompare(b.category || "", "id", {
        numeric: true,
      });
      return byCategory || a.name.localeCompare(b.name, "id", { numeric: true });
    });
  }, [menu, menuOrderMode]);
  const menuGroups = useMemo(() => {
    const knownCategories = new Set(menuCategories);
    const extraCategories = orderedMenu
      .map((item) => item.category)
      .filter((category) => category && !knownCategories.has(category));
    const categories = [...menuCategories, ...new Set(extraCategories)];
    const groups = categories.map((category) => ({
      category,
      items: orderedMenu.filter((item) => item.category === category),
    }));
    const uncategorized = orderedMenu.filter((item) => !item.category);
    return uncategorized.length > 0
      ? [...groups, { category: "Tanpa Kategori", items: uncategorized }]
      : groups;
  }, [menuCategories, orderedMenu]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-neon text-3xl font-extrabold sm:text-4xl">
          Pengaturan Meja Kafe
        </h1>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{openTables.length} meja terisi</p>
          <p className="text-xl font-bold text-neon">{formatRupiah(grandTotal)}</p>
        </div>
      </header>

      <section className="surface-panel p-4 sm:p-6">
        <SetupHeading
          title="Nomor Meja"
          description="Nomor meja, area, dan jumlah kursi bisa diubah kapan saja."
        />

        <SetupTable<CafeTable>
          items={cafeTables}
          getId={(t) => t.id}
          getLabel={(t) => t.name}
          onReorder={(a, b) => reorderList("cafeTables", a, b)}
          columns={[
            {
              key: "name",
              header: "Nomor Meja",
              render: (t) => (
                <span className="font-bold text-foreground">{t.name}</span>
              ),
            },
            {
              key: "area",
              header: "Area",
              hideOnMobile: true,
              render: (t) => t.area || "—",
            },
            {
              key: "seats",
              header: "Kursi",
              render: (t) => t.seats,
            },
            {
              key: "status",
              header: "Status",
              hideOnMobile: true,
              render: (t) =>
                t.orders.length > 0 || t.openedAt ? (
                  <span className="font-semibold text-accent">Terisi</span>
                ) : (
                  <span className="text-muted-foreground">Kosong</span>
                ),
            },
          ]}
          onRemove={(t) => {
            if (!removeCafeTable(t.id)) {
              toast.error(`${t.name} masih terisi`);
              return;
            }
            toast.success(`${t.name} dihapus`);
          }}
          detailTitle={(t) => `Meja ${t.name}`}
          detailDescription={() => "Ubah nomor meja, area, dan jumlah kursi."}
          renderDetail={(t) => (
            <>
              <DetailField label="Nomor meja">
                <Input
                  value={t.name}
                  onChange={(e) => updateCafeTable(t.id, { name: e.target.value })}
                />
              </DetailField>
              <DetailField label="Area">
                <Input
                  value={t.area}
                  placeholder="Indoor / Outdoor"
                  onChange={(e) => updateCafeTable(t.id, { area: e.target.value })}
                />
              </DetailField>
              <DetailField label="Jumlah kursi">
                <Input
                  type="number"
                  min={1}
                  value={t.seats}
                  onChange={(e) =>
                    updateCafeTable(t.id, { seats: Number(e.target.value) || 1 })
                  }
                />
              </DetailField>
            </>
          )}
        />

        <form
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            addCafeTable({
              name: newName,
              area: newArea,
              seats: Number(newSeats) || 2,
            });
            setNewName("");
            setNewArea("");
            setNewSeats("");
            toast.success("Meja ditambahkan");
          }}
        >
          <Input
            placeholder="Nomor meja (mis. Meja 05)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder="Area (Indoor / Outdoor)"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
          />
          <Input
            type="number"
            min={1}
            placeholder="Kursi"
            value={newSeats}
            onChange={(e) => setNewSeats(e.target.value)}
          />
          <Button type="submit">
            <Plus className="size-4" /> Tambah
          </Button>
        </form>
      </section>

      <section className="surface-panel p-4 sm:p-6">
        <SetupHeading
          title="Kategori Menu"
          description="Kategori bebas ditambah, diganti nama, atau dihapus (jika tidak ada menu di dalamnya)."
        />
        <SetupTable<string>
          items={menuCategories}
          getId={(c) => c}
          getLabel={(c) => c}
          onReorder={reorderMenuCategories}
          columns={[
            {
              key: "name",
              header: "Nama Kategori",
              render: (c) => <span className="font-bold text-foreground">{c}</span>,
            },
            {
              key: "count",
              header: "Jumlah Menu",
              render: (c) => `${menu.filter((m) => m.category === c).length} menu`,
            },
          ]}
          onRemove={(c) => {
            if (!removeMenuCategory(c)) {
              toast.error(
                "Kategori masih dipakai menu atau minimal satu kategori harus ada",
              );
              return;
            }
            toast.success(`Kategori ${c} dihapus`);
          }}
          detailTitle={(c) => `Kategori ${c}`}
          detailDescription={() => "Ubah nama kategori menu ini."}
          renderDetail={(c) => (
            <DetailField label="Nama kategori">
              <Input
                defaultValue={c}
                aria-label={`Nama kategori ${c}`}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (!next || next === c) {
                    e.target.value = c;
                    return;
                  }
                  if (!renameMenuCategory(c, next)) {
                    e.target.value = c;
                    toast.error("Nama kategori sudah dipakai");
                  }
                }}
              />
            </DetailField>
          )}
        />
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!addMenuCategory(newCategory)) {
              toast.error("Nama kategori kosong atau sudah ada");
              return;
            }
            toast.success(`Kategori ${newCategory.trim()} ditambahkan`);
            setNewCategory("");
          }}
        >
          <Input
            placeholder="Kategori baru (mis. Coffee, Juice, Snack)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="w-56 flex-1"
          />
          <Button type="submit">
            <Plus className="size-4" /> Tambah
          </Button>
        </form>
      </section>

      <section className="surface-panel p-4 sm:p-6">
        <SetupHeading
          title="Menu Makanan & Minuman"
          description="Klik tombol detail untuk mengatur harga, diskon, printer label, dan modifier tiap menu."
        />

        <Accordion
          type="multiple"
          defaultValue={menuGroups[0] ? [menuGroups[0].category] : []}
          className="mt-4 space-y-2"
        >
          {menuGroups.map(({ category, items }) => (
            <AccordionItem
              key={category}
              value={category}
              className="overflow-hidden rounded-md border border-border px-3"
            >
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="flex min-w-0 items-center gap-2 text-left">
                  <span className="truncate font-bold text-foreground">{category}</span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {items.length} menu
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <SetupTable<MenuItem>
                  items={items}
                  getId={(m) => m.id}
                  getLabel={(m) => m.name}
                  detailWide
                  emptyText="Belum ada menu di kategori ini."
                  onReorder={(a, b, orderedIds) =>
                    reorderList("menu", a, b, orderedIds)
                  }
                  columns={[
                    {
                      key: "name",
                      header: "Nama Menu",
                      render: (m) => (
                        <span className="font-bold text-foreground">{m.name}</span>
                      ),
                    },
                    {
                      key: "price",
                      header: "Harga",
                      render: (m) => formatRupiah(m.price),
                    },
                    {
                      key: "label",
                      header: "Label",
                      hideOnMobile: true,
                      render: (m) =>
                        m.printEnabled !== false ? (
                          <span className="text-accent">Cetak</span>
                        ) : (
                          <span className="text-muted-foreground">Tidak</span>
                        ),
                    },
                  ]}
                  onRemove={(m) => {
                    removeMenuItem(m.id);
                    toast.success(`${m.name} dihapus`);
                  }}
                  detailTitle={(m) => m.name}
                  detailDescription={() => "Semua pengaturan menu ini."}
                  renderDetail={(m) => (
            <>
              <DetailField label="Nama menu">
                <Input
                  value={m.name}
                  onChange={(e) => updateMenuItem(m.id, { name: e.target.value })}
                />
              </DetailField>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Kategori">
                  <Select
                    value={menuCategories.includes(m.category) ? m.category : ""}
                    onValueChange={(value) => updateMenuItem(m.id, { category: value })}
                  >
                    <SelectTrigger aria-label={`Kategori ${m.name}`}>
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {menuCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DetailField>
                <DetailField label="Harga">
                  <Input
                    type="number"
                    min={0}
                    value={m.price}
                    onChange={(e) =>
                      updateMenuItem(m.id, { price: Number(e.target.value) || 0 })
                    }
                  />
                </DetailField>
              </div>

              <DetailField label="Potongan harga">
                <div className="grid gap-2">
                  <DiscountFields
                    label={m.name}
                    unitHint="Rp / item"
                    value={m.discount}
                    onChange={(patch) =>
                      updateMenuItem(m.id, {
                        discount: { ...emptyItemDiscount, ...m.discount, ...patch },
                      })
                    }
                  />
                </div>
              </DetailField>

              <DetailField label="Label dapur">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={m.printEnabled !== false}
                    onCheckedChange={(v) => updateMenuItem(m.id, { printEnabled: v })}
                    aria-label={`Cetak label ${m.name}`}
                  />
                  Cetak label
                </label>
                <Select
                  value={m.printerId ?? ""}
                  onValueChange={(value) => updateMenuItem(m.id, { printerId: value })}
                >
                  <SelectTrigger aria-label={`Printer label ${m.name}`}>
                    <SelectValue
                      placeholder={
                        labelPrinters.length === 0
                          ? "Belum ada printer aktif"
                          : "Pilih printer label"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {labelPrinters.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {PRINTER_ROLE_LABEL[p.role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DetailField>

              <DetailField
                label="Modifier"
                hint="Tulis pilihan dipisah koma. Tambahkan harga dengan tanda titik dua, mis. “Keju:7000”."
              >
                <Input
                  defaultValue={menuOptionsText(m.variants)}
                  aria-label={`Varian ${m.name}`}
                  placeholder="Varian, mis. Pedas:5000, Soto, Goreng:3000"
                  onBlur={(e) =>
                    updateMenuItem(m.id, { variants: parseMenuOptions(e.target.value) })
                  }
                />
                <Input
                  defaultValue={menuOptionsText(m.sizes)}
                  aria-label={`Ukuran ${m.name}`}
                  placeholder="Ukuran, mis. Small, Medium:3000, Large:6000"
                  onBlur={(e) =>
                    updateMenuItem(m.id, { sizes: parseMenuOptions(e.target.value) })
                  }
                />
                <Input
                  defaultValue={menuOptionsText(m.toppings)}
                  aria-label={`Topping ${m.name}`}
                  placeholder="Topping, mis. Telur:5000, Keju:7000, Kornet:8000"
                  onBlur={(e) =>
                    updateMenuItem(m.id, { toppings: parseMenuOptions(e.target.value) })
                  }
                />
                <Input
                  defaultValue={(m.modifiers ?? []).join(", ")}
                  aria-label={`Opsi lain ${m.name}`}
                  placeholder="Opsi lain tanpa biaya, mis. Less sugar, Iced"
                  onBlur={(e) =>
                    updateMenuItem(m.id, {
                      modifiers: e.target.value
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </DetailField>
                    </>
                  )}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <form
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px_140px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const p = Number(itemPrice);
            if (!itemName.trim() || !(p > 0)) {
              toast.error("Isi nama menu dan harga yang valid");
              return;
            }
            addMenuItem(itemName.trim(), p, itemCategory || menuCategories[0]);
            setItemName("");
            setItemPrice("");
            toast.success("Menu ditambahkan");
          }}
        >
          <Input
            placeholder="Nama menu"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
          <Select
            value={itemCategory || menuCategories[0] || ""}
            onValueChange={setItemCategory}
          >
            <SelectTrigger aria-label="Kategori menu baru">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              {menuCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            placeholder="Harga"
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
          />
          <Button type="submit">
            <Plus className="size-4" /> Tambah
          </Button>
        </form>
      </section>
    </div>
  );
}
