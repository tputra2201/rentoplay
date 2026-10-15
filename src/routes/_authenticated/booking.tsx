import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Clock, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBilling, canCheckIn, bookingMinutes, formatRupiah, BOOKING_DP_CATEGORY_ID, BOOKING_DP_USED_CATEGORY_ID, CHECKIN_LEAD_MS, type BookingAddon, type BookingOrder, type BookingStatus } from "@/lib/billing-store";
import { useCan } from "@/lib/use-can";

/** Baris pemilih Additional Rental untuk reservasi (barang, jumlah, durasi). */
function AddonRowsEditor({ rows, onChange }: { rows: BookingAddon[]; onChange: (next: BookingAddon[]) => void }) {
  const { addonRentals } = useBilling();
  const options = addonRentals.filter((item) => item.active);
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState("1");
  const [minutes, setMinutes] = useState("");
  const picked = options.find((item) => item.id === pick);

  const add = () => {
    if (!picked) { toast.error("Pilih barang additional rental"); return; }
    const count = Math.max(1, Math.round(Number(qty) || 1));
    const mins = picked.mode === "hourly" ? Math.max(0, Math.round(Number(minutes) || 0)) : 0;
    onChange([...rows, { addonId: picked.id, qty: count, ...(mins > 0 ? { minutes: mins } : {}) }]);
    setPick(""); setQty("1"); setMinutes("");
  };

  if (options.length === 0) return <p className="text-sm text-muted-foreground">Belum ada barang di Setup Price → Additional Rental.</p>;

  return <div className="space-y-2">
    {rows.map((row, index) => {
      const item = options.find((opt) => opt.id === row.addonId) ?? addonRentals.find((opt) => opt.id === row.addonId);
      return <div key={`${row.addonId}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="min-w-0 truncate">{item?.name ?? "Barang"} × {row.qty}{item?.mode === "hourly" ? ` · ${row.minutes ? `${row.minutes} menit` : "ikut sesi"}` : ""}</span>
        <Button size="icon" variant="ghost" aria-label="Hapus additional rental" onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 className="size-4 text-destructive"/></Button>
      </div>;
    })}
    <div className="grid gap-2 sm:grid-cols-[1fr_70px_90px_auto]">
      <Select value={pick} onValueChange={setPick}><SelectTrigger><SelectValue placeholder="Pilih barang"/></SelectTrigger><SelectContent>{options.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {formatRupiah(item.price)}{item.mode === "hourly" ? "/jam" : ""}</SelectItem>)}</SelectContent></Select>
      <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Jumlah"/>
      {picked?.mode === "hourly" ? <Input type="number" min={0} step={15} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="menit" aria-label="Durasi (menit)"/> : <span />}
      <Button type="button" variant="outline" onClick={add}><Plus className="size-4"/></Button>
    </div>
  </div>;
}

/** Baris pemesanan makanan & minuman untuk reservasi. */
function OrderRowsEditor({ rows, onChange }: { rows: BookingOrder[]; onChange: (next: BookingOrder[]) => void }) {
  const { menu } = useBilling();
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState("1");
  const add = () => {
    const item = menu.find((m) => m.id === pick);
    if (!item) { toast.error("Pilih menu makanan/minuman"); return; }
    const count = Math.max(1, Math.round(Number(qty) || 1));
    const existing = rows.findIndex((r) => r.menuId === item.id);
    onChange(existing >= 0 ? rows.map((r, i) => i === existing ? { ...r, qty: r.qty + count } : r) : [...rows, { menuId: item.id, qty: count }]);
    setPick(""); setQty("1");
  };
  if (menu.length === 0) return <p className="text-sm text-muted-foreground">Belum ada menu di Setup Price → Menu.</p>;
  const total = rows.reduce((sum, r) => sum + (menu.find((m) => m.id === r.menuId)?.price ?? 0) * r.qty, 0);
  return <div className="space-y-2">
    {rows.map((row, index) => {
      const item = menu.find((m) => m.id === row.menuId);
      return <div key={`${row.menuId}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="min-w-0 truncate">{item?.name ?? "Menu"} × {row.qty} · {formatRupiah((item?.price ?? 0) * row.qty)}</span>
        <Button type="button" size="icon" variant="ghost" aria-label="Hapus pesanan" onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 className="size-4 text-destructive"/></Button>
      </div>;
    })}
    <div className="grid gap-2 grid-cols-[1fr_70px_auto]">
      <Select value={pick} onValueChange={setPick}><SelectTrigger><SelectValue placeholder="Pilih menu"/></SelectTrigger><SelectContent>{menu.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} · {formatRupiah(m.price)}</SelectItem>)}</SelectContent></Select>
      <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Jumlah"/>
      <Button type="button" variant="outline" onClick={add} aria-label="Tambah pesanan"><Plus className="size-4"/></Button>
    </div>
    {rows.length > 0 && <p className="text-xs text-muted-foreground">Total pesanan {formatRupiah(total)} · masuk otomatis saat check-in</p>}
  </div>;
}

/** Pilihan tempat: unit TV atau meja kafe. Nilai "s:<id>" / "t:<id>". */
function PlaceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { stations, cafeTables: allT, businessProfile } = useBilling();
  const cafeTables = businessProfile?.modules?.cafe === false ? [] : allT;
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Pilih unit / meja"/></SelectTrigger><SelectContent>
    <SelectGroup><SelectLabel>Unit TV</SelectLabel>{stations.map((s) => <SelectItem key={s.id} value={`s:${s.id}`}>{s.name} · {s.console}</SelectItem>)}</SelectGroup>
    {cafeTables.length > 0 && <SelectGroup><SelectLabel>Meja Kafe</SelectLabel>{cafeTables.map((t) => <SelectItem key={t.id} value={`t:${t.id}`}>Meja {t.name}{t.area ? ` · ${t.area}` : ""}</SelectItem>)}</SelectGroup>}
  </SelectContent></Select>;
}

const placeKey = (item: { stationId: string; target?: "station" | "table" }) => `${item.target === "table" ? "t" : "s"}:${item.stationId}`;
const parsePlace = (key: string) => ({ target: (key.startsWith("t:") ? "table" : "station") as "station" | "table", stationId: key.slice(2) });


export const Route = createFileRoute("/_authenticated/booking")({
  head: () => ({ meta: [
    { title: "Reservasi Rental & Kafe — RenToPlay" },
    { name: "description", content: "Kelola jadwal reservasi unit PlayStation dan cegah bentrok pemakaian." },
    { property: "og:title", content: "Reservasi Rental & Kafe — RenToPlay" },
    { property: "og:description", content: "Agenda reservasi unit PlayStation dengan pemeriksaan jadwal otomatis." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: BookingPage,
});

const statusLabel: Record<BookingStatus, string> = { confirmed: "Dikonfirmasi", "checked-in": "Check-in", completed: "Selesai", cancelled: "Dibatalkan" };

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function BookingPage() {
  const { bookings, stations, cafeTables, customers, paymentMethods, addBooking, updateBooking, removeBooking, addCashEntry } = useBilling();
  const allow = useCan();
  const initialStart = useMemo(() => { const date = new Date(); date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0); return date; }, []);
  const [place, setPlace] = useState(stations[0] ? `s:${stations[0].id}` : "");
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [start, setStart] = useState(localInputValue(initialStart));
  const [durHours, setDurHours] = useState("1");
  const [durMinutes, setDurMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [addonRows, setAddonRows] = useState<BookingAddon[]>([]);
  const [orderRows, setOrderRows] = useState<BookingOrder[]>([]);
  const [dp, setDp] = useState("");
  const activePayments = paymentMethods.filter((item) => item.active && (!item.modules || item.modules.includes("rental")));
  const [dpPayment, setDpPayment] = useState(activePayments[0]?.name ?? "Cash");

  const ordered = [...bookings].sort((a, b) => a.startAt - b.startAt);
  const now = Date.now();
  const checkedIn = ordered.filter((item) => item.status === "checked-in");
  const upcoming = ordered.filter((item) => item.endAt >= now && item.status === "confirmed");
  const past = ordered.filter((item) => !upcoming.includes(item) && !checkedIn.includes(item));

  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((item) => item.id === id);
    if (customer) { setName(customer.name); setPhone(customer.phone); }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const startAt = new Date(start).getTime();
    const durH = Math.max(0, Math.floor(Number(durHours) || 0));
    const durM = Math.max(0, Math.floor(Number(durMinutes) || 0));
    const minutes = durH * 60 + durM;
    const { target, stationId } = parsePlace(place);
    if (!stationId || !name.trim() || !Number.isFinite(startAt) || minutes <= 0) { toast.error("Lengkapi data reservasi — durasi minimal 1 menit"); return; }
    const dpAmount = Math.max(0, Math.round(Number(dp) || 0));
    const ok = addBooking({ stationId, target, ...(customerId ? { customerId } : {}), customerName: name.trim(), customerPhone: phone.trim(), startAt, endAt: startAt + minutes * 60000, notes, ...(target === "station" && addonRows.length ? { addons: addonRows } : {}), ...(orderRows.length ? { orders: orderRows } : {}), ...(dpAmount > 0 ? { dpAmount, dpPayment } : {}) });
    if (!ok) { toast.error("Jadwal bentrok dengan reservasi lain pada unit/meja tersebut"); return; }
    if (dpAmount > 0) {
      const cash = addCashEntry({ categoryId: BOOKING_DP_CATEGORY_ID, source: "booking-dp", amount: dpAmount, payment: dpPayment, note: `DP reservasi ${name.trim()}` });
      if (!cash) toast.error("DP belum tercatat di kas — buka shift kasir lebih dulu");
    }
    toast.success("Reservasi berhasil ditambahkan"); setName(""); setPhone(""); setCustomerId(""); setNotes(""); setAddonRows([]); setOrderRows([]); setDp("");
  };

  return <div className="space-y-8">
    <header><h1 className="text-3xl font-bold sm:text-4xl">Reservasi</h1></header>
    <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="surface-panel space-y-4 p-5">
        <div className="flex items-center gap-2"><Plus className="size-5 text-primary"/><h2 className="text-lg font-semibold">Reservasi baru</h2></div>
        <div className="space-y-1.5"><Label>Unit TV / Meja Kafe</Label><PlaceSelect value={place} onChange={setPlace}/></div>
        <div className="space-y-1.5"><Label>Pelanggan tersimpan</Label><Select value={customerId || "guest"} onValueChange={(value) => value === "guest" ? setCustomerId("") : chooseCustomer(value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="guest">Pelanggan baru / umum</SelectItem>{customers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.phone || "tanpa nomor"}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><div className="space-y-1.5"><Label htmlFor="booking-name">Nama</Label><Input id="booking-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama pelanggan"/></div><div className="space-y-1.5"><Label htmlFor="booking-phone">Nomor HP</Label><Input id="booking-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08..."/></div></div>
        <div className="space-y-1.5"><Label htmlFor="booking-start">Mulai</Label><Input id="booking-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}/></div>
        <div className="space-y-1.5"><Label>Durasi</Label><div className="grid grid-cols-2 gap-2"><div className="relative"><Input id="booking-duration-hours" type="number" min={0} max={24} value={durHours} onChange={(e) => setDurHours(e.target.value)} className="pr-12" aria-label="Durasi jam"/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Jam</span></div><div className="relative"><Input id="booking-duration-minutes" type="number" min={0} max={59} value={durMinutes} onChange={(e) => setDurMinutes(e.target.value)} className="pr-14" aria-label="Durasi menit"/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Menit</span></div></div></div>
        <div className="space-y-1.5"><Label htmlFor="booking-notes">Catatan</Label><Input id="booking-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan opsional"/></div>
        {place.startsWith("s:") && <div className="space-y-1.5"><Label>Additional Rental</Label><AddonRowsEditor rows={addonRows} onChange={setAddonRows}/></div>}
        <div className="space-y-1.5"><Label>Pesanan Makanan & Minuman</Label><OrderRowsEditor rows={orderRows} onChange={setOrderRows}/></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="space-y-1.5"><Label htmlFor="booking-dp">DP (uang muka)</Label><Input id="booking-dp" type="number" min={0} step={1000} value={dp} onChange={(e) => setDp(e.target.value)} placeholder="0"/></div>
          <div className="space-y-1.5"><Label>Metode pembayaran DP</Label><Select value={dpPayment} onValueChange={setDpPayment}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{activePayments.map((item) => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <p className="text-xs text-muted-foreground">DP dicatat sebagai PAY-IN (bukan REVENUE) dan otomatis dipakai sebagai pembayaran saat check-in.</p>
        <Button className="w-full" type="submit" disabled={!allow("booking.buat")}><CalendarDays className="size-4"/> Simpan Reservasi</Button>
      </form>
      <div className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Agenda mendatang</h2><Badge variant="secondary">{upcoming.length} reservasi</Badge></div>{upcoming.length === 0 ? <div className="surface-panel p-10 text-center text-muted-foreground">Belum ada reservasi mendatang.</div> : <div className="space-y-3">{upcoming.map((item) => <BookingRow key={item.id} item={item} stationName={item.target === "table" ? `Meja ${cafeTables.find((t) => t.id === item.stationId)?.name ?? ""}` : stations.find((station) => station.id === item.stationId)?.name ?? "Unit"} onStatus={(status) => updateBooking(item.id, { status })} onDelete={() => removeBooking(item.id)}/>)}</div>}
      {checkedIn.length > 0 && <div className="pt-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Already Check-In</h2><Badge variant="secondary">{checkedIn.length} reservasi</Badge></div><div className="space-y-3">{checkedIn.map((item) => <BookingRow key={item.id} item={item} locked stationName={item.target === "table" ? `Meja ${cafeTables.find((t) => t.id === item.stationId)?.name ?? ""}` : stations.find((station) => station.id === item.stationId)?.name ?? "Unit"} onStatus={(status) => updateBooking(item.id, { status })} onDelete={() => removeBooking(item.id)}/>)}</div></div>}
      {past.length > 0 &&  <div className="pt-3"><h2 className="mb-3 text-lg font-semibold">Riwayat reservasi</h2><div className="space-y-3 opacity-75">{past.slice(-8).reverse().map((item) => <BookingRow key={item.id} item={item} stationName={item.target === "table" ? `Meja ${cafeTables.find((t) => t.id === item.stationId)?.name ?? ""}` : stations.find((station) => station.id === item.stationId)?.name ?? "Unit"} onStatus={(status) => updateBooking(item.id, { status })} onDelete={() => removeBooking(item.id)}/>)}</div></div>}</div>
    </section>
  </div>;
}

type BookingItem = ReturnType<typeof useBilling>["bookings"][number];

/** Baris informasi pada panel detail reservasi: label di kiri, isinya di kanan (menumpuk di layar kecil). */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-0.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3">
    <span className="text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</span>
    <span className="min-w-0 break-words text-sm leading-relaxed">{children}</span>
  </div>;
}

function BookingRow({ item, stationName, locked, onStatus, onDelete }: { item: BookingItem; stationName: string; locked?: boolean; onStatus: (status: BookingStatus) => void; onDelete: () => void }) {
  const { now, shiftOpen, stations, cafeTables, menu, addonRentals, startSession, updateBooking, addSessionAddon, settleSession, addCashEntry, addOrder, openCafeTable, addCafeOrder, settleCafeTable } = useBilling();
  const isTable = item.target === "table";
  const [open, setOpen] = useState(false);
  const dpAmount = Math.max(0, Math.round(item.dpAmount ?? 0));
  const addonText = (item.addons ?? [])
    .map((row) => {
      const addon = addonRentals.find((a) => a.id === row.addonId);
      const dur = addon?.mode === "hourly" ? (row.minutes ? ` ${row.minutes} menit` : " ikut sesi") : "";
      return `${addon?.name ?? "Barang"} × ${row.qty}${dur}`;
    })
    .join(" · ");
  const orderText = (item.orders ?? []).map((row) => `${menu.find((m) => m.id === row.menuId)?.name ?? "Menu"} × ${row.qty}`).join(" · ");
  const minutes = bookingMinutes(item);
  const ready = canCheckIn(item, now);
  const opensAt = new Date(item.startAt - CHECKIN_LEAD_MS).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const readOnly = locked || item.status === "checked-in";
  const allow = useCan();

  const checkIn = () => {
    if (!ready) { toast.error(`Check-in baru bisa dilakukan mulai ${opensAt} (1 jam sebelum jadwal)`); return; }
    if (isTable) {
      const table = cafeTables.find((t) => t.id === item.stationId);
      if (!table) { toast.error("Meja tidak ditemukan"); return; }
      if (table.openedAt) { toast.error(`Meja ${table.name} masih terisi`); return; }
      openCafeTable(table.id, item.customerName, item.notes ?? "");
      for (const row of item.orders ?? []) {
        const m = menu.find((x) => x.id === row.menuId);
        if (m) addCafeOrder(table.id, m, Math.max(1, row.qty));
      }
      if (dpAmount > 0 && !item.dpUsedAt) {
        if (shiftOpen) {
          settleCafeTable(table.id, { payment: item.dpPayment || "Cash", amount: dpAmount, amountPaid: dpAmount });
          addCashEntry({ categoryId: BOOKING_DP_USED_CATEGORY_ID, source: "booking-dp-used", amount: dpAmount, payment: item.dpPayment || "Cash", note: `DP reservasi ${item.customerName} dipakai di Meja ${table.name}` });
          updateBooking(item.id, { status: "checked-in", dpUsedAt: Date.now() });
          toast.success(`${item.customerName} check-in di Meja ${table.name} · DP ${formatRupiah(dpAmount)} sudah dipakai`);
          return;
        }
        toast.error("DP belum bisa dipakai — buka shift kasir lebih dulu");
      }
      updateBooking(item.id, { status: "checked-in" });
      toast.success(`${item.customerName} check-in di Meja ${table.name}`);
      return;
    }
    const station = stations.find((s) => s.id === item.stationId);
    if (!station) { toast.error("Unit tidak ditemukan"); return; }
    if (station.session) { toast.error(`${station.name} masih dipakai sesi lain`); return; }
    startSession(item.stationId, "prepaid", minutes, {
      customerName: item.customerName,
      customerPhone: item.customerPhone ?? "",
      ...(item.customerId ? { customerId: item.customerId } : {}),
      bookingId: item.id,
      packageName: `Reservasi ${minutes} Menit`,
      notes: item.notes ?? "",
    });
    for (const row of item.addons ?? []) {
      addSessionAddon(item.stationId, row.addonId, Math.max(1, row.qty), row.minutes);
    }
    for (const row of item.orders ?? []) {
      const m = menu.find((x) => x.id === row.menuId);
      if (m) addOrder(item.stationId, m, Math.max(1, row.qty));
    }
    if (dpAmount > 0 && !item.dpUsedAt) {
      if (shiftOpen) {
        settleSession(item.stationId, {
          payment: item.dpPayment || "Cash",
          amount: dpAmount,
          amountPaid: dpAmount,
        });
        addCashEntry({
          categoryId: BOOKING_DP_USED_CATEGORY_ID,
          source: "booking-dp-used",
          amount: dpAmount,
          payment: item.dpPayment || "Cash",
          note: `DP reservasi ${item.customerName} dipakai di ${station.name}`,
        });
        updateBooking(item.id, { status: "checked-in", dpUsedAt: Date.now() });
        toast.success(`${item.customerName} check-in di ${station.name} · DP ${formatRupiah(dpAmount)} sudah dipakai`);
        return;
      }
      toast.error("DP belum bisa dipakai — buka shift kasir lebih dulu");
    }
    updateBooking(item.id, { status: "checked-in" });
    toast.success(`${item.customerName} check-in di ${station.name} · ${minutes} menit`);
  };

  const actions: React.ReactNode[] = [];
  if (item.status === "confirmed" && allow("booking.checkin")) actions.push(<Button key="checkin" size="sm" onClick={checkIn} disabled={!ready}><CheckCircle2 className="size-4"/> Check-in</Button>);
  if (!readOnly) {
    if (allow("booking.ubah")) actions.push(<EditBookingDialog key="edit" item={item}/>);
    if (item.status !== "completed" && item.status !== "cancelled" && allow("booking.batal")) actions.push(<Button key="cancel" size="icon" variant="outline" onClick={() => onStatus("cancelled")} aria-label="Batalkan reservasi"><XCircle className="size-4"/></Button>);
    if (allow("booking.hapus")) actions.push(<Button key="delete" size="icon" variant="ghost" onClick={onDelete} aria-label="Hapus reservasi"><Trash2 className="size-4"/></Button>);
  }

  return <article className="surface-panel p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Tutup detail reservasi" : "Buka detail reservasi"}>
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.customerName}</h3><Badge variant={item.status === "cancelled" ? "destructive" : "outline"}>{statusLabel[item.status]}</Badge><ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}/></div>
        <p className="mt-1 text-sm text-muted-foreground"><Clock className="mr-1 inline size-3.5"/>{new Date(item.startAt).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} – {new Date(item.endAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} · {stationName} · {minutes} menit</p>
        {item.status === "confirmed" && !ready && <p className="mt-1 text-xs text-warning">Check-in tersedia mulai {opensAt}</p>}
      </button>
      {actions.length > 0 && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {open && <div className="mt-3 space-y-2.5 border-t pt-3">
      <DetailRow label="DP">{dpAmount > 0 ? <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold">{formatRupiah(dpAmount)}</span><span className="text-muted-foreground">· {item.dpPayment || "Cash"}</span><Badge variant={item.dpUsedAt ? "secondary" : "outline"} className="text-[11px]">{item.dpUsedAt ? "Sudah dipakai" : "Dipakai otomatis saat check-in"}</Badge></span> : <span className="text-muted-foreground">tidak ada</span>}</DetailRow>
      {addonText && <DetailRow label="Additional rental">{addonText}</DetailRow>}
      {orderText && <DetailRow label="Pesanan F&B">{orderText}</DetailRow>}
      {item.notes && <DetailRow label="Catatan">{item.notes}</DetailRow>}
    </div>}
  </article>;
}

function EditBookingDialog({ item }: { item: BookingItem }) {
  const { updateBooking } = useBilling();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(placeKey(item));
  const [name, setName] = useState(item.customerName);
  const [phone, setPhone] = useState(item.customerPhone ?? "");
  const [start, setStart] = useState(localInputValue(new Date(item.startAt)));
  const [duration, setDuration] = useState(String(Math.max(15, Math.round((item.endAt - item.startAt) / 60000))));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [status, setStatus] = useState<BookingStatus>(item.status);
  const [addonRows, setAddonRows] = useState<BookingAddon[]>(item.addons ?? []);
  const [orderRows, setOrderRows] = useState<BookingOrder[]>(item.orders ?? []);

  const openChange = (value: boolean) => {
    setOpen(value);
    if (value) {
      setPlace(placeKey(item)); setName(item.customerName); setPhone(item.customerPhone ?? "");
      setStart(localInputValue(new Date(item.startAt)));
      setDuration(String(Math.max(15, Math.round((item.endAt - item.startAt) / 60000))));
      setNotes(item.notes ?? ""); setStatus(item.status); setAddonRows(item.addons ?? []); setOrderRows(item.orders ?? []);
    }
  };

  const save = () => {
    const startAt = new Date(start).getTime();
    const minutes = Number(duration);
    const { target, stationId } = parsePlace(place);
    if (!stationId || !name.trim() || !Number.isFinite(startAt) || !Number.isFinite(minutes) || minutes <= 0) { toast.error("Lengkapi data reservasi"); return; }
    const ok = updateBooking(item.id, { stationId, target, customerName: name.trim(), customerPhone: phone.trim(), startAt, endAt: startAt + minutes * 60000, notes, status, addons: target === "station" ? addonRows : [], orders: orderRows });
    if (!ok) { toast.error("Jadwal bentrok dengan reservasi lain pada unit tersebut"); return; }
    toast.success("Reservasi diperbarui"); setOpen(false);
  };

  return <Dialog open={open} onOpenChange={openChange}>
    <DialogTrigger asChild><Button size="icon" variant="outline" aria-label="Ubah reservasi"><Pencil className="size-4"/></Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
      <DialogHeader><DialogTitle>Ubah reservasi</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Unit TV / Meja Kafe</Label><PlaceSelect value={place} onChange={setPlace}/></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor={`edit-name-${item.id}`}>Nama</Label><Input id={`edit-name-${item.id}`} value={name} onChange={(e) => setName(e.target.value)}/></div><div className="space-y-1.5"><Label htmlFor={`edit-phone-${item.id}`}>Nomor HP</Label><Input id={`edit-phone-${item.id}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08..."/></div></div>
        <div className="space-y-1.5"><Label htmlFor={`edit-start-${item.id}`}>Mulai</Label><Input id={`edit-start-${item.id}`} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}/></div>
        <div className="space-y-1.5"><Label htmlFor={`edit-duration-${item.id}`}>Durasi (menit)</Label><Input id={`edit-duration-${item.id}`} type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(e.target.value)}/></div>
        <div className="space-y-1.5"><Label>Status</Label><Select value={status} onValueChange={(value) => setStatus(value as BookingStatus)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(Object.keys(statusLabel) as BookingStatus[]).map((key) => <SelectItem key={key} value={key}>{statusLabel[key]}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor={`edit-notes-${item.id}`}>Catatan</Label><Input id={`edit-notes-${item.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan opsional"/></div>
        {place.startsWith("s:") && <div className="space-y-1.5"><Label>Additional Rental</Label><AddonRowsEditor rows={addonRows} onChange={setAddonRows}/></div>}
        <div className="space-y-1.5"><Label>Pesanan Makanan & Minuman</Label><OrderRowsEditor rows={orderRows} onChange={setOrderRows}/></div>
        {(item.dpAmount ?? 0) > 0 && <p className="text-sm text-muted-foreground">DP {formatRupiah(item.dpAmount ?? 0)} · {item.dpPayment || "Cash"}{item.dpUsedAt ? " · sudah dipakai saat check-in" : " · dipakai otomatis saat check-in"}</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button onClick={save}>Simpan perubahan</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}