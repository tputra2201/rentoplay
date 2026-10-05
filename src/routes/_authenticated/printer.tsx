import { createFileRoute } from "@tanstack/react-router";
import { Plus, Printer as PrinterIcon, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBilling } from "@/lib/billing-store";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { useStoreInfo } from "@/lib/store-info";
import { SetupHeading, SetupTable, DetailField } from "@/components/SetupTable";
import { printLabels, printReceipt, type PrintStore } from "@/lib/print-docs";
import {
  PAPER_LABEL,
  PAPER_OPTIONS,
  PRINTER_ROLES,
  PRINTER_ROLE_LABEL,
  PRINT_MODES,
  PRINT_MODE_LABEL,
  labelLayout,
  usesThermalCutter,
  isAndroidPrintAvailable,
  pairedAndroidPrinters,
  type DocLayout,
  type PaperSize,
  type PrintMode,
  type PrinterConfig,
  type PrinterRole,
} from "@/lib/printing";
import {
  bluetoothSupported,
  forgetDevice,
  printerReady,
  savedDevice,
  scanPrinter,
  usbSupported,
} from "@/lib/escpos";

export const Route = createFileRoute("/_authenticated/printer")({
  head: () => ({
    meta: [
      { title: "Printer & Cetak — Billing Rental PS" },
      {
        name: "description",
        content:
          "Atur printer struk, invoice, label dapur, label bar, dan printer laporan beserta ukuran kertas, margin, dan huruf.",
      },
      { property: "og:title", content: "Printer & Cetak" },
      {
        property: "og:description",
        content:
          "Pengaturan printer thermal 40mm/80mm dan printer laporan A4 beserta layout struk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrinterPage,
});

function PrinterPage() {
  const [pairedPrinters, setPairedPrinters] = useState(() => pairedAndroidPrinters());
  const androidApp = isAndroidPrintAvailable();
  const {
    printers,
    addPrinter,
    updatePrinter,
    removePrinter,
    receiptLayout,
    invoiceLayout,
    setReceiptLayout,
    setInvoiceLayout,
    rolePermissions,
  } = useBilling();
  const { role } = useAuth();
  const { store } = useStoreInfo(true);
  const canManage = can(role, "printer.kelola", rolePermissions);

  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (androidApp) setPairedPrinters(pairedAndroidPrinters());
  }, [androidApp]);

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const p of printers) {
      const saved = savedDevice(p.id);
      if (saved) map[p.id] = saved.name;
    }
    setDeviceNames(map);
  }, [printers]);

  const scan = async (printer: PrinterConfig) => {
    const kind = printer.mode === "usb" ? "usb" : "bluetooth";
    try {
      const saved = await scanPrinter(printer.id, kind);
      setDeviceNames((prev) => ({ ...prev, [printer.id]: saved.name }));
      toast.success(`${saved.name} tersambung ke ${printer.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cancel|No device selected|chooser/i.test(message)) {
        toast.error("Pemilihan printer dibatalkan.");
        return;
      }
      toast.error(`Printer tidak bisa disambungkan: ${message}`);
    }
  };

  const testPrint = (printer: PrinterConfig) => {
    if (printer.role === "kitchen" || printer.role === "bar") {
      printLabels({
        printer,
        items: [{ name: "Contoh Menu", qty: 1 }],
        heading: printer.role === "bar" ? "BAR" : "DAPUR",
        source: "Uji coba cetak",
        customerName: "Pelanggan Uji",
      });
      return;
    }
    const at = Date.now();
    printReceipt({
      printer,
      store: store as PrintStore,
      layout: printer.role === "invoice" ? invoiceLayout : receiptLayout,
      kind: printer.role === "invoice" ? "invoice" : "receipt",
      record: {
        id: "TEST-0001",
        stationId: "tv-1",
        stationName: "TV 01",
        console: "PS4",
        mode: "prepaid",
        minutes: 60,
        startAt: at - 3600000,
        endAt: at,
        paidAt: at,
        rentalTotal: 8000,
        fnbTotal: 6000,
        total: 14000,
        orders: [{ id: "o1", menuId: "m2", name: "Teh Botol", price: 6000, qty: 1 }],
        payment: "Cash",
        amountPaid: 20000,
        change: 6000,
        customerName: "Uji Coba",
      } as never,
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Printer &amp; Cetak</h1>
      </header>

      <section className="surface-panel space-y-2 p-6">
        <h2 className="text-xl font-semibold">Cetak langsung tanpa aplikasi tambahan</h2>
        <p className="text-sm text-muted-foreground">
          Pilih cara mencetak pada printer di bawah, tekan <strong>Pindai printer</strong>, pilih
          printer thermal Anda, lalu tekan <strong>Uji cetak</strong>. Printer yang dipilih diingat
          pada perangkat ini, jadi cukup sekali dipilih.
        </p>
        <p className="text-sm text-muted-foreground">
          Bluetooth langsung {bluetoothSupported() ? "tersedia" : "belum didukung"} di perangkat ini;
          printer USB {usbSupported() ? "tersedia" : "belum didukung"}. Printer Bluetooth lama
          (Classic/SPP) hanya bisa lewat aplikasi Android
          {androidApp ? ` (${pairedPrinters.length} printer ditemukan)` : ""} atau disambung USB.
        </p>
      </section>

      <section className="surface-panel space-y-4 p-6">
        <SetupHeading
          title="Daftar Printer"
          description="Kertas 40 mm dan 80 mm untuk printer thermal, A4 untuk printer laporan."
          right={
            canManage && (
              <Button onClick={() => addPrinter()}>
                <Plus className="size-4" /> Tambah printer
              </Button>
            )
          }
        />

        <SetupTable<PrinterConfig>
          items={printers}
          getId={(p) => p.id}
          getLabel={(p) => p.name}
          detailWide
          columns={[
            {
              key: "name",
              header: "Nama Printer",
              render: (p) => <span className="font-bold text-foreground">{p.name}</span>,
            },
            {
              key: "role",
              header: "Jenis Dokumen",
              render: (p) => PRINTER_ROLE_LABEL[p.role],
            },
            {
              key: "paper",
              header: "Kertas",
              hideOnMobile: true,
              render: (p) => PAPER_LABEL[p.paper],
            },
            {
              key: "active",
              header: "Status",
              hideOnMobile: true,
              render: (p) =>
                p.active ? (
                  <span className="font-semibold text-accent">Aktif</span>
                ) : (
                  <span className="text-muted-foreground">Nonaktif</span>
                ),
            },
            {
              key: "test",
              header: "Uji",
              render: (p) => (
                <Button size="sm" variant="outline" onClick={() => testPrint(p)}>
                  <PrinterIcon className="size-4" /> Uji cetak
                </Button>
              ),
            },
          ]}
          onRemove={(p) => {
            if (!canManage) return;
            removePrinter(p.id);
            toast.success(`${p.name} dihapus`);
          }}
          removeDisabled={() => !canManage}
          detailTitle={(p) => p.name}
          detailDescription={() => "Semua pengaturan printer ini."}
          emptyText="Belum ada printer."
          renderDetail={(p) => (
            <>
              <DetailField label="Nama printer">
                <Input
                  value={p.name}
                  disabled={!canManage}
                  onChange={(e) => updatePrinter(p.id, { name: e.target.value })}
                />
              </DetailField>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Jenis dokumen">
                  <Select
                    value={p.role}
                    disabled={!canManage}
                    onValueChange={(value) => updatePrinter(p.id, { role: value as PrinterRole })}
                  >
                    <SelectTrigger aria-label={`Jenis ${p.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRINTER_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {PRINTER_ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DetailField>
                <DetailField label="Ukuran kertas">
                  <Select
                    value={p.paper}
                    disabled={!canManage}
                    onValueChange={(value) => updatePrinter(p.id, { paper: value as PaperSize })}
                  >
                    <SelectTrigger aria-label={`Kertas ${p.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAPER_OPTIONS.map((size) => (
                        <SelectItem key={size} value={size}>
                          {PAPER_LABEL[size]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DetailField>
              </div>

              <DetailField
                label="Cara mencetak"
                hint="Gunakan Bluetooth langsung di aplikasi Android, atau dialog cetak di komputer."
              >
                <Select
                  value={p.mode ?? "system"}
                  disabled={!canManage}
                  onValueChange={(value) => updatePrinter(p.id, { mode: value as PrintMode })}
                >
                  <SelectTrigger aria-label={`Cara mencetak ${p.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINT_MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PRINT_MODE_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DetailField>

              {(p.mode === "bluetooth" || p.mode === "usb") && (
                <DetailField
                  label="Printer terpilih"
                  hint={
                    printerReady(p.id)
                      ? "Tersambung — cetak berikutnya tanpa dialog pilih printer."
                      : "Pilih sekali setelah aplikasi dibuka; cetak berikutnya tanpa dialog."
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {deviceNames[p.id] ?? "Belum ada printer dipilih"}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canManage}
                      onClick={() => void scan(p)}
                    >
                      <RefreshCw className="size-4" /> Pindai printer
                    </Button>
                    {deviceNames[p.id] && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!canManage}
                        onClick={() => {
                          forgetDevice(p.id);
                          setDeviceNames((prev) => ({ ...prev, [p.id]: "" }));
                        }}
                      >
                        Lupakan
                      </Button>
                    )}
                  </div>
                </DetailField>
              )}

              {p.mode === "rawbt" && (
                <DetailField label="Cetak lewat RawBT">
                  <p className="text-sm text-muted-foreground">
                    Pilih printer di aplikasi RawBT pada HP/tablet Android ini, dan pastikan
                    printer sudah dipasangkan di pengaturan Bluetooth. Cocok untuk printer
                    Bluetooth lama seperti RPP02N. Tidak tersedia di PC Windows — di PC gunakan
                    cetak langsung Bluetooth atau USB.
                  </p>
                </DetailField>
              )}

              {p.mode === "android" && (
                <DetailField label="Printer Bluetooth (aplikasi Android)">
                  <Select
                    value={p.bluetoothAddress ?? ""}
                    disabled={!canManage || !androidApp}
                    onValueChange={(value) => updatePrinter(p.id, { bluetoothAddress: value })}
                  >
                    <SelectTrigger aria-label={`Printer Bluetooth ${p.name}`}>
                      <SelectValue placeholder="Pilih printer yang dipasangkan" />
                    </SelectTrigger>
                    <SelectContent>
                      {pairedPrinters.map((device) => (
                        <SelectItem key={device.address} value={device.address}>
                          {device.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DetailField>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <DetailField label="Ukuran huruf (pt)">
                  <Input
                    type="number"
                    min={6}
                    max={20}
                    value={p.fontSizePt}
                    disabled={!canManage}
                    onChange={(e) =>
                      updatePrinter(p.id, { fontSizePt: Number(e.target.value) || 9 })
                    }
                  />
                </DetailField>
                <DetailField label="Margin (mm)">
                  <Input
                    type="number"
                    min={0}
                    max={25}
                    value={p.marginMm}
                    disabled={!canManage}
                    onChange={(e) => updatePrinter(p.id, { marginMm: Number(e.target.value) || 0 })}
                  />
                </DetailField>
                <DetailField label="Salinan">
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={p.copies}
                    disabled={!canManage}
                    onChange={(e) => updatePrinter(p.id, { copies: Number(e.target.value) || 1 })}
                  />
                </DetailField>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={usesThermalCutter(p)}
                    disabled={!canManage}
                    onCheckedChange={(v) => updatePrinter(p.id, { autoCut: v })}
                    aria-label={`Auto cutter ${p.name}`}
                  />
                  Auto cutter
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={p.bold}
                    disabled={!canManage}
                    onCheckedChange={(v) => updatePrinter(p.id, { bold: v })}
                    aria-label={`Huruf tebal ${p.name}`}
                  />
                  Tebal
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={p.active}
                    disabled={!canManage}
                    onCheckedChange={(v) => updatePrinter(p.id, { active: v })}
                    aria-label={`Aktif ${p.name}`}
                  />
                  Aktif
                </label>
              </div>

              {(p.role === "kitchen" || p.role === "bar") && (
                <DetailField
                  label="Isi label yang dicetak"
                  hint="Matikan informasi yang tidak diperlukan. Baris yang dimatikan tidak menyisakan ruang kosong."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      ["showHeading", "Judul DAPUR/BAR"],
                      ["showSeparators", "Garis pemisah"],
                      ["showItemName", "Nama menu"],
                      ["showQuantity", "Jumlah pesanan"],
                      ["showNotes", "Catatan pesanan"],
                      ["showSource", "Nomor TV/meja"],
                      ["showCustomer", "Nama pelanggan"],
                      ["showTimestamp", "Tanggal dan jam"],
                    ] as const).map(([key, text]) => (
                      <Toggle
                        key={key}
                        label={text}
                        checked={labelLayout(p)[key]}
                        disabled={!canManage}
                        onChange={(value) =>
                          updatePrinter(p.id, {
                            labelLayout: { ...labelLayout(p), [key]: value },
                          })
                        }
                      />
                    ))}
                  </div>
                </DetailField>
              )}

              <Button size="sm" variant="outline" onClick={() => testPrint(p)}>
                <PrinterIcon className="size-4" /> Uji cetak
              </Button>
            </>
          )}
        />
      </section>

      <LayoutForm
        title="Layout Struk (Receipt)"
        layout={receiptLayout}
        onChange={setReceiptLayout}
        disabled={!canManage}
      />
      <LayoutForm
        title="Layout Invoice"
        layout={invoiceLayout}
        onChange={setInvoiceLayout}
        disabled={!canManage}
      />

    </div>
  );
}

function LayoutForm({
  title,
  layout,
  onChange,
  disabled,
}: {
  title: string;
  layout: DocLayout;
  onChange: (patch: Partial<DocLayout>) => void;
  disabled: boolean;
}) {
  const slug = title.toLowerCase().replaceAll(/[^a-z]/g, "");
  return (
    <section className="surface-panel space-y-4 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${slug}-header`}>Teks header</Label>
          <Textarea
            id={`${slug}-header`}
            value={layout.headerText}
            disabled={disabled}
            placeholder="mis. Selamat datang di Cosmo Gaming"
            onChange={(e) => onChange({ headerText: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${slug}-footer`}>Teks footer</Label>
          <Textarea
            id={`${slug}-footer`}
            value={layout.footerText}
            disabled={disabled}
            placeholder="mis. Terima kasih"
            onChange={(e) => onChange({ footerText: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${slug}-margin`}>Margin (mm)</Label>
          <Input
            id={`${slug}-margin`}
            type="number"
            min={0}
            max={25}
            value={layout.marginMm}
            disabled={disabled}
            onChange={(e) => onChange({ marginMm: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${slug}-font`}>Ukuran huruf (pt)</Label>
          <Input
            id={`${slug}-font`}
            type="number"
            min={6}
            max={20}
            value={layout.fontSizePt}
            disabled={disabled}
            onChange={(e) => onChange({ fontSizePt: Number(e.target.value) || 9 })}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={layout.bold}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ bold: v })}
              aria-label={`Huruf tebal ${title}`}
            />
            Huruf tebal
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle
          label="Tampilkan data store"
          checked={layout.showStoreInfo}
          disabled={disabled}
          onChange={(v) => onChange({ showStoreInfo: v })}
        />
        <Toggle
          label="Tampilkan pelanggan"
          checked={layout.showCustomer}
          disabled={disabled}
          onChange={(v) => onChange({ showCustomer: v })}
        />
        <Toggle
          label="Tampilkan rincian item"
          checked={layout.showItems}
          disabled={disabled}
          onChange={(v) => onChange({ showItems: v })}
        />
        <Toggle
          label="Tampilkan pembayaran"
          checked={layout.showPayment}
          disabled={disabled}
          onChange={(v) => onChange({ showPayment: v })}
        />
      </div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
      {label}
    </label>
  );
}
