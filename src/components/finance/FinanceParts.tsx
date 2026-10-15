import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowDownCircle, ArrowUpCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ShiftLockedNotice, useShiftGate } from "@/components/ShiftGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatRupiah,
  useBilling,
  type CashCategory,
  type CashDirection,
  type CashEntry,
  type CashGroup,
} from "@/lib/billing-store";
import {
  ACCOUNTS_BY_DIRECTION,
  CASH_ACCOUNT_LABEL,
  MODULE_SOURCES,
  categoryAccount,
  entryAccount,
  resolveModuleCategory,
  type CashAccount,
} from "@/lib/billing-store";
import { SetupHeading, SetupTable, DetailField } from "@/components/SetupTable";
import { useConfirm } from "@/components/ConfirmDialog";
import { useCan } from "@/lib/use-can";
import { ReportRangePicker } from "@/components/reports/ReportRangePicker";
import { ExportExcelButton } from "@/components/reports/ExportExcelButton";
import { useStoreInfo } from "@/lib/store-info";
import { defaultRange, inRange, rangeLabel, type ReportRange } from "@/lib/report-range";

function timeOf(ts: number) {
  return new Date(ts).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}


/** Riwayat Finance per periode hari usaha, dipisah PAY-IN dan PAY-OUT. */
export function CashHistory() {
  const { cashEntries, operatingHours, removeCashEntry, updateCashEntry, paymentMethods } =
    useBilling();
  const { store } = useStoreInfo(true);
  const storeName = store?.store_name?.trim() || "RenToPlay";
  const { confirm, dialog } = useConfirm();
  const printRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<ReportRange>(() => defaultRange("day"));
  const range = useMemo<ReportRange>(
    () => ({ mode: picked.mode, from: picked.from, to: picked.to, hours: operatingHours }),
    [picked, operatingHours],
  );

  const rows = useMemo(
    () => cashEntries.filter((e) => inRange(e.createdAt, range)),
    [cashEntries, range],
  );
  const revenue = rows.filter((e) => e.direction === "in" && entryAccount(e) !== "payin");
  const incoming = rows.filter((e) => e.direction === "in" && entryAccount(e) === "payin");
  const expenses = rows.filter((e) => e.direction === "out" && entryAccount(e) === "expense");
  const outgoing = rows.filter((e) => e.direction === "out" && entryAccount(e) === "payout");
  const total = (list: CashEntry[]) => list.reduce((s, e) => s + e.amount, 0);
  const totalIn = total(incoming) + total(revenue);
  const totalOut = total(outgoing) + total(expenses);

  const remove = (entry: CashEntry) => {
    confirm({
      title: `Hapus catatan ${entry.categoryName}?`,
      description: entry.cardId
        ? "Catatan kas dan riwayat kartunya ikut dihapus. Kalau ini top-up, saldo kartu dikembalikan."
        : "Data ini tidak bisa dikembalikan.",
      destructive: true,
      onConfirm: () => {
        removeCashEntry(entry.id);
        toast.success("Catatan kas dihapus");
      },
    });
  };

  const changePayment = (entry: CashEntry, value: string) => {
    if (value === entry.payment) return;
    updateCashEntry(entry.id, { payment: value });
    toast.success(`Metode diubah ke ${value}`);
  };
  const methodNames = paymentMethods.map((m) => m.name);

  return (
    <div className="space-y-4">
      <ReportRangePicker range={picked} onChange={setPicked} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Periode {rangeLabel(range)}</p>
        <div className="flex flex-wrap gap-2">
          <ExportExcelButton
            targetRef={printRef}
            title={`Riwayat Kas ${storeName}`}
            periodText={`Periode ${rangeLabel(range)}`}
          />
        </div>
      </div>

      <div className="space-y-6" ref={printRef}>
        <section className="grid gap-4 sm:grid-cols-3">
          <Stat label="TOTAL UANG MASUK" value={formatRupiah(totalIn)} tone="accent" />
          <Stat label="TOTAL UANG KELUAR" value={formatRupiah(totalOut)} tone="danger" />
          <Stat label="Selisih" value={formatRupiah(totalIn - totalOut)} />
        </section>
        <CashGroup
          title="SALES & OTHER REVENUE"
          list={revenue}
          onRemove={remove}
          methods={methodNames}
          onPayment={changePayment}
        />
        <CashGroup
          title="PAY-IN (TITIPAN)"
          list={incoming}
          onRemove={remove}
          methods={methodNames}
          onPayment={changePayment}
        />
        <CashGroup
          title="EXPENSES (BIAYA)"
          list={expenses}
          onRemove={remove}
          methods={methodNames}
          onPayment={changePayment}
        />
        <CashGroup
          title="PAY-OUT LAIN (PRIVE / SETORAN)"
          list={outgoing}
          onRemove={remove}
          methods={methodNames}
          onPayment={changePayment}
        />
      </div>
      {dialog}
    </div>
  );
}

/** Tabel satu kelompok kas. Didefinisikan di luar CashHistory agar posisi
 *  geser horizontal di HP tidak ke-reset setiap kali data di-refresh. */
function CashGroup({
  title,
  list,
  onRemove,
  methods,
  onPayment,
}: {
  title: string;
  list: CashEntry[];
  onRemove: (entry: CashEntry) => void;
  methods: string[];
  onPayment: (entry: CashEntry, value: string) => void;
}) {
  const allow = useCan();
  const total = list.reduce((s, e) => s + e.amount, 0);
  return (
    <section className="surface-panel overflow-x-auto p-4 sm:p-6">
      <SetupHeading title={title} />
      {list.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">
          Tidak ada catatan pada periode ini.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Pelaku</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{timeOf(e.createdAt)}</TableCell>
                <TableCell>{e.categoryName}</TableCell>
                <TableCell>{e.group}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {CASH_ACCOUNT_LABEL[entryAccount(e)]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {allow("kas.tambah") ? (
                    <Select value={e.payment} onValueChange={(v) => onPayment(e, v)}>
                      <SelectTrigger
                        className="h-8 w-32"
                        aria-label={`Metode ${e.categoryName}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(methods.includes(e.payment) ? methods : [e.payment, ...methods]).map(
                          (name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    e.payment
                  )}
                </TableCell>
                <TableCell>{e.createdBy || "-"}</TableCell>
                <TableCell className="max-w-48 truncate">{e.note || "-"}</TableCell>
                <TableCell
                  className={
                    e.direction === "in"
                      ? "text-right font-semibold text-accent"
                      : "text-right font-semibold text-destructive"
                  }
                >
                  {e.direction === "in" ? "+" : "-"}
                  {formatRupiah(e.amount)}
                </TableCell>
                <TableCell className="text-right">
                  {allow("kas.hapus") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Hapus catatan"
                      onClick={() => onRemove(e)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell colSpan={6} />
              <TableCell className="text-right font-semibold">
                {formatRupiah(total)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export function EntryForm({ direction }: { direction: CashDirection }) {
  const { cashCategories, paymentMethods, addCashEntry } = useBilling();
  const { requireShift } = useShiftGate();
  // Item otomatis sistem (penjualan & top up kartu, DP reservasi) tidak boleh dicatat manual.
  const SYSTEM_IDS = new Set(MODULE_SOURCES.map((m) => m.defaultId));
  const options = cashCategories.filter(
    (c) => c.direction === direction && c.active && !SYSTEM_IDS.has(c.id) && !c.mapFor,
  );
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((c) => `${c.name} ${c.group}`.toLowerCase().includes(q));
  }, [options, search]);
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState("Cash");
  const [note, setNote] = useState("");
  const active = options.find((c) => c.id === categoryId);

  const submit = () => {
    const value = Number(amount);
    if (!categoryId || !Number.isFinite(value) || value <= 0) {
      toast.error("Pilih item dan isi jumlah uang");
      return;
    }
    if (!requireShift()) return;
    const row = addCashEntry({ categoryId, amount: value, payment, note });
    if (!row) {
      toast.error("Catatan gagal disimpan");
      return;
    }
    setAmount("");
    setNote("");
    toast.success(
      `${row.categoryName} ${formatRupiah(row.amount)} dicatat`,
    );
  };

  return (
    <section className="surface-panel space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        {direction === "in" ? (
          <ArrowDownCircle className="size-5 text-accent" />
        ) : (
          <ArrowUpCircle className="size-5 text-destructive" />
        )}
        <h2 className="text-lg font-semibold">
          {direction === "in" ? "Catat PAY-IN" : "Catat PAY-OUT"}
        </h2>
      </div>

      <ShiftLockedNotice />

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada item. Tambahkan dulu di tab Item &amp; Kategori.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor={`kas-search-${direction}`}>
              Cari item
            </label>
            <Input
              id={`kas-search-${direction}`}
              value={search}
              placeholder="Ketik huruf awal nama item…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Item</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih item" />
                </SelectTrigger>
                <SelectContent>
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Tidak ada item yang cocok
                    </div>
                  ) : (
                    filtered.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.group}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`kas-amount-${direction}`}>
                Jumlah uang
              </label>
              <Input
                id={`kas-amount-${direction}`}
                type="number"
                min={0}
                value={amount}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Metode</label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih metode" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods
                    .filter((p) => p.active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`kas-note-${direction}`}>
                Catatan
              </label>
              <Input
                id={`kas-note-${direction}`}
                value={note}
                placeholder="Misal: tagihan listrik bulan ini"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {active && (
            <p className="text-sm text-muted-foreground">
              Masuk ke pos <span className="font-semibold text-foreground">{CASH_ACCOUNT_LABEL[categoryAccount(active)]}</span> di laporan.
            </p>
          )}

          <Button onClick={submit}>
            <Plus className="size-4" /> Simpan catatan
          </Button>
        </>
      )}
    </section>
  );
}

export function GroupEditor({ direction }: { direction: CashDirection }) {
  const { cashGroups, cashCategories, addCashGroup, updateCashGroup, removeCashGroup } =
    useBilling();
  const rows = cashGroups.filter((g) => g.direction === direction);
  const [name, setName] = useState("");

  const add = () => {
    const row = addCashGroup({ name, direction });
    if (!row) {
      toast.error("Nama kategori kosong atau sudah ada");
      return;
    }
    setName("");
    toast.success(`Kategori ${row.name} ditambahkan`);
  };

  return (
    <section className="surface-panel space-y-4 p-4 sm:p-6">
      <SetupHeading
        title={direction === "in" ? "Kategori PAY-IN" : "Kategori PAY-OUT"}
        as="h2"
      />

      <SetupTable<CashGroup>
        items={rows}
        getId={(g) => g.id}
        getLabel={(g) => g.name}
        columns={[
          {
            key: "name",
            header: "Nama Kategori",
            render: (g) => <span className="font-bold text-foreground">{g.name}</span>,
          },
          {
            key: "count",
            header: "Jumlah Item",
            render: (g) =>
              cashCategories.filter(
                (c) => c.direction === direction && c.group === g.name,
              ).length,
          },
        ]}
        onRemove={(g) => {
          if (!removeCashGroup(g.id)) {
            toast.error("Kategori ini masih dipakai item, pindahkan itemnya dulu");
            return;
          }
          toast.success(`Kategori ${g.name} dihapus`);
        }}
        detailTitle={(g) => g.name}
        detailDescription={() => "Ubah nama kategori ini."}
        emptyText="Belum ada kategori."
        renderDetail={(g) => (
          <DetailField
            label="Nama kategori"
            hint="Semua item yang memakai kategori ini ikut berubah."
          >
            <Input
              value={g.name}
              aria-label={`Nama kategori ${g.name}`}
              onChange={(e) => updateCashGroup(g.id, { name: e.target.value })}
            />
          </DetailField>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor={`grp-name-${direction}`}>
            Nama kategori
          </label>
          <Input
            id={`grp-name-${direction}`}
            value={name}
            placeholder={direction === "in" ? "Misal: OTHER REVENUE" : "Misal: Operasional"}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button onClick={add}>
          <Plus className="size-4" /> Tambah kategori
        </Button>
      </div>
    </section>
  );
}

export function CategoryEditor({ direction }: { direction: CashDirection }) {
  const {
    cashCategories,
    cashGroups,
    cashEntries,
    addCashCategory,
    updateCashCategory,
    removeCashCategory,
  } = useBilling();
  const rows = cashCategories.filter((c) => c.direction === direction);
  const groups = useMemo(
    () => cashGroups.filter((g) => g.direction === direction && g.active),
    [cashGroups, direction],
  );
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const accounts = ACCOUNTS_BY_DIRECTION[direction];
  const [account, setAccount] = useState<CashAccount>(accounts[direction === "in" ? 1 : 0] ?? "other");

  const add = () => {
    if (!group) {
      toast.error("Pilih kategori dulu");
      return;
    }
    const row = addCashCategory({ name, direction, account, group });
    if (!row) {
      toast.error("Nama item kosong atau sudah ada");
      return;
    }
    setName("");
    setGroup("");
    toast.success(`${row.name} ditambahkan`);
  };

  return (
    <section className="surface-panel space-y-4 p-4 sm:p-6">
      <SetupHeading
        title={direction === "in" ? "Item PAY-IN" : "Item PAY-OUT"}
        as="h2"
      />

      <SetupTable<CashCategory>
        items={rows}
        getId={(c) => c.id}
        getLabel={(c) => c.name}
        columns={[
          {
            key: "name",
            header: "Nama Item",
            render: (c) => <span className="font-bold text-foreground">{c.name}</span>,
          },
          {
            key: "group",
            header: "Kategori",
            hideOnMobile: true,
            render: (c) => c.group || "—",
          },
          {
            key: "account",
            header: "Pos Akun",
            render: (c) => (
              <Badge variant="outline">{CASH_ACCOUNT_LABEL[categoryAccount(c)]}</Badge>
            ),
          },
          {
            key: "active",
            header: "Status",
            render: (c) =>
              c.active ? (
                <span className="font-semibold text-accent">Aktif</span>
              ) : (
                <span className="text-muted-foreground">Nonaktif</span>
              ),
          },
        ]}
        onRemove={(c) => {
          if (cashEntries.some((e) => e.categoryId === c.id)) {
            toast.error("Item ini sudah dipakai, nonaktifkan saja");
            return;
          }
          removeCashCategory(c.id);
          toast.success(`${c.name} dihapus`);
        }}
        detailTitle={(c) => c.name}
        detailDescription={() => "Ubah nama, kategori, dan status item ini."}
        emptyText="Belum ada item."
        renderDetail={(c) => (
          <>
            <DetailField label="Nama item">
              <Input
                value={c.name}
                aria-label={`Nama item ${c.name}`}
                onChange={(e) => updateCashCategory(c.id, { name: e.target.value })}
              />
            </DetailField>
            <DetailField label="Kategori">
              <Select
                value={c.group}
                onValueChange={(v) => updateCashCategory(c.id, { group: v })}
              >
                <SelectTrigger aria-label={`Kategori ${c.name}`}>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.name}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DetailField>
            <DetailField label="Pos akun" hint="Menentukan item ini masuk tabel mana di laporan.">
              <AccountSelect
                direction={direction}
                value={categoryAccount(c)}
                onChange={(v) => updateCashCategory(c.id, { account: v })}
                label={`Pos akun ${c.name}`}
              />
            </DetailField>
            <DetailField label="Status">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  checked={c.active}
                  onCheckedChange={(v) => updateCashCategory(c.id, { active: v })}
                  aria-label={`Aktifkan ${c.name}`}
                />
                {c.active ? "Aktif" : "Nonaktif"}
              </label>
            </DetailField>
          </>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor={`cat-name-${direction}`}>
            Nama item
          </label>
          <Input
            id={`cat-name-${direction}`}
            value={name}
            placeholder={direction === "in" ? "Misal: Sewa Stik" : "Misal: Pembelian Gas"}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Kategori</label>
          <Select value={group} onValueChange={setGroup} disabled={groups.length === 0}>
            <SelectTrigger aria-label={`Kategori item ${direction}`}>
              <SelectValue
                placeholder={groups.length === 0 ? "Buat kategori dulu" : "Pilih kategori"}
              />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.name}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Pos akun</label>
          <AccountSelect direction={direction} value={account} onChange={setAccount} label={`Pos akun item baru ${direction}`} />
        </div>
        <Button onClick={add}>
          <Plus className="size-4" /> Tambah
        </Button>
      </div>
    </section>
  );
}

const ACCOUNT_HINT: Record<CashAccount, string> = {
  sales: "Omzet penjualan utama toko",
  other: "Pendapatan pendukung (denda, sewa alat, jasa)",
  payin: "Uang masuk bukan omzet (titipan, DP, modal owner)",
  expense: "Biaya operasional, mengurangi laba",
  payout: "Uang keluar bukan biaya (prive, setoran)",
};

function AccountSelect({
  direction,
  value,
  onChange,
  label,
}: {
  direction: CashDirection;
  value: CashAccount;
  onChange: (v: CashAccount) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CashAccount)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ACCOUNTS_BY_DIRECTION[direction].map((a) => (
          <SelectItem key={a} value={a}>
            <span className="font-semibold">{CASH_ACCOUNT_LABEL[a]}</span>
            <span className="ml-2 text-xs text-muted-foreground">{ACCOUNT_HINT[a]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Account Mapping: modul otomatis diarahkan ke item pilihan store. */
export function AccountMapping() {
  const { cashCategories, updateCashCategory, businessProfile, setBusinessProfile } = useBilling();
  return (
    <section className="surface-panel space-y-4 p-4 sm:p-6">
      <SetupHeading title="Account Mapping (Pemetaan Akun Modul)" as="h2" />
      <p className="text-sm text-muted-foreground">
        Pilih item yang dipakai saat modul mencatat uang secara otomatis. Nama item
        dan pos akunnya mengikuti pengaturan Anda di Uang Masuk / Uang Keluar.
      </p>
      <div className="divide-y divide-border rounded-md border border-border">
        {MODULE_SOURCES.map((m) => {
          const current = resolveModuleCategory(cashCategories, m.source);
          const choices = cashCategories.filter((c) => c.direction === m.direction);
          const value = choices.some((c) => c.id === current.id) ? current.id : "";
          return (
            <div key={m.source} className="grid gap-2 p-3 sm:grid-cols-[1fr_1.4fr] sm:items-center">
              <div>
                <p className="font-semibold text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.hint}</p>
              </div>
              <div className="space-y-1">
                <Select
                  value={value}
                  onValueChange={(id) => updateCashCategory(id, { mapFor: m.source })}
                >
                  <SelectTrigger aria-label={`Akun untuk ${m.label}`}>
                    <SelectValue placeholder={`${current.name} (bawaan)`} />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {CASH_ACCOUNT_LABEL[categoryAccount(c)]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Masuk pos <span className="font-semibold">{CASH_ACCOUNT_LABEL[current.account]}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-3 border-t border-border pt-4">
        <p className="font-semibold text-foreground">Nama akun SALES dari transaksi utama</p>
        <p className="text-xs text-muted-foreground">
          Selalu masuk pos SALES. Nama ini dipakai di Company Report, misalnya "SEWA MEJA BILIAR".
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["rental", "Sewa unit (timer)"],
            ["fnb", "Makanan & minuman"],
            ["addon", "Sewa tambahan"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`sales-label-${key}`}>{label}</label>
              <Input
                id={`sales-label-${key}`}
                value={businessProfile.salesLabels[key]}
                onChange={(e) => setBusinessProfile({ salesLabels: { [key]: e.target.value.toUpperCase() } })}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "danger";
}) {
  return (
    <div className="surface-panel p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          tone === "accent"
            ? "font-display text-2xl font-bold text-accent"
            : tone === "danger"
              ? "font-display text-2xl font-bold text-destructive"
              : "font-display text-2xl font-bold"
        }
      >
        {value}
      </p>
    </div>
  );
}

export function TodayStats() {
  const { cashEntries, operatingHours } = useBilling();
  const businessRange = useMemo<ReportRange>(() => defaultRange("day", operatingHours), [operatingHours]);
  const today = useMemo(() => cashEntries.filter((e) => inRange(e.createdAt, businessRange)), [cashEntries, businessRange]);
  const sum = (pick: (e: CashEntry) => boolean) => today.filter(pick).reduce((s, e) => s + e.amount, 0);
  return (
    <>
      <p className="text-sm text-muted-foreground">Hari ini {rangeLabel(businessRange)}</p>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="OTHER REVENUE hari ini" value={formatRupiah(sum((e) => e.direction === "in" && entryAccount(e) === "other"))} tone="accent" />
        <Stat label="EXPENSES (BIAYA) hari ini" value={formatRupiah(sum((e) => e.direction === "out" && entryAccount(e) === "expense"))} tone="danger" />
        <Stat label="PAY-IN hari ini (bukan revenue)" value={formatRupiah(sum((e) => e.direction === "in" && entryAccount(e) === "payin"))} />
        <Stat label="PAY-OUT hari ini (bukan expenses)" value={formatRupiah(sum((e) => e.direction === "out" && entryAccount(e) === "payout"))} />
      </section>
    </>
  );
}

const FINANCE_KINDS: { account: CashAccount; label: string; hint: string }[] = [
  { account: "other", label: "Other Revenue", hint: "Uang masuk — menambah pendapatan" },
  { account: "expense", label: "Expenses", hint: "Uang keluar — mengurangi pendapatan" },
  { account: "payin", label: "Pay-In", hint: "Uang masuk, tidak mempengaruhi pendapatan" },
  { account: "payout", label: "Pay-Out", hint: "Uang keluar, tidak mempengaruhi pendapatan" },
];

/** Empat tombol cepat ala Finance Univer: pilih jenis → kategori → item. */
export function FinanceQuickActions() {
  const [kind, setKind] = useState<CashAccount | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FINANCE_KINDS.map((k) => (
          <Button key={k.account} className="h-12" onClick={() => setKind(k.account)}>
            <Plus className="size-4" /> {k.label}
          </Button>
        ))}
      </div>
      <ShiftLockedNotice />
      <FinanceDialog kind={kind} onClose={() => setKind(null)} />
    </>
  );
}

function FinanceDialog({ kind, onClose }: { kind: CashAccount | null; onClose: () => void }) {
  if (!kind) return null;
  return <FinanceDialogBody initialKind={kind} onClose={onClose} />;
}

function FinanceDialogBody({ initialKind, onClose }: { initialKind: CashAccount; onClose: () => void }) {
  const { cashCategories, paymentMethods, addCashEntry } = useBilling();
  const { requireShift } = useShiftGate();
  const SYSTEM_IDS = new Set(MODULE_SOURCES.map((m) => m.defaultId));
  const methods = paymentMethods.filter((p) => p.active);
  const cashName =
    methods.find((m) => /^(tunai|cash|uang)\b/i.test(m.name))?.name ?? methods[0]?.name ?? "Cash";
  const [kind, setKind] = useState<CashAccount>(initialKind);
  const [group, setGroup] = useState("");
  const [itemId, setItemId] = useState("");
  const [payment, setPayment] = useState(cashName);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const items = cashCategories.filter(
    (c) => c.active && !SYSTEM_IDS.has(c.id) && !c.mapFor && categoryAccount(c) === kind,
  );
  const groups = Array.from(new Set(items.map((c) => c.group || "Lainnya")));
  const groupItems = items.filter((c) => (c.group || "Lainnya") === group);
  const sel =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

  const submit = () => {
    const value = Number(amount) || 0;
    if (!group) return toast.error("Pilih kategori");
    if (!itemId) return toast.error("Pilih item");
    if (value <= 0) return toast.error("Isi nominal");
    if (!requireShift()) return;
    const row = addCashEntry({ categoryId: itemId, amount: value, payment, note: note.trim() });
    if (!row) return toast.error("Catatan gagal disimpan");
    toast.success(`${row.categoryName} ${formatRupiah(row.amount)} dicatat`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[96dvh] gap-3 overflow-y-auto p-4 sm:max-w-md md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Catat Finance</DialogTitle>
        </DialogHeader>
        <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:col-span-2">
            {FINANCE_KINDS.map((k) => (
              <Button
                key={k.account}
                size="sm"
                variant={kind === k.account ? "default" : "secondary"}
                onClick={() => {
                  setKind(k.account);
                  setGroup("");
                  setItemId("");
                }}
              >
                {k.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground md:col-span-2">
            {FINANCE_KINDS.find((k) => k.account === kind)?.hint}
          </p>
          <div className="space-y-1">
            <Label htmlFor="fin-cat">Kategori</Label>
            <select
              id="fin-cat"
              className={sel}
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setItemId("");
              }}
            >
              <option value="">— Pilih kategori —</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Belum ada item. Atur di menu Finance → Item &amp; Kategori.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="fin-item">Item</Label>
            <select
              id="fin-item"
              className={sel}
              value={itemId}
              disabled={!group}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">— Pilih item —</option>
              {groupItems.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fin-method">Metode pembayaran</Label>
            <select
              id="fin-method"
              className={sel}
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              {methods.map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fin-amount">Nominal</Label>
            <Input
              id="fin-amount"
              inputMode="numeric"
              placeholder="0"
              className="h-10 text-right text-lg font-bold tabular-nums"
              value={amount ? Number(amount).toLocaleString("id-ID") : ""}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="fin-note">Keterangan</Label>
            <Input
              id="fin-note"
              value={note}
              placeholder="Opsional"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button className="h-11 w-full md:col-span-2" onClick={submit}>
            Simpan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
