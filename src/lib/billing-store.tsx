import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react";
import { DEVICE_BLOCKED_MESSAGE, deviceCode, deviceWriteAllowed } from "@/lib/device-guard";
import { toast } from "sonner";
import { useAuth } from "./auth";
import { useStoreSync, type SyncStatus } from "./store-sync";
import type { RolePermissions } from "./permissions";
import {
  defaultInvoiceLayout,
  defaultPrinters,
  defaultReceiptLayout,
  type DocLayout,
  type PrinterConfig,
} from "./printing";
import {
  loadDevicePrinterPrefs,
  saveDevicePrinterPrefs,
  withDevicePrinterPrefs,
  type DevicePrinterPref,
} from "./printing";
import {
  DEFAULT_OPERATING_HOURS,
  businessDate,
  normalizeHours,
  type OperatingHours,
} from "./report-range";
import { ALARM_SOUNDS, type AlarmSound } from "./alarm";
import { SETTINGS_KEYS } from "./sync-records";

/**
 * Waktu batas penutupan otomatis satu hari usaha: tepat pada jam tutup.
 * Hasilnya dijamin selalu SETELAH waktu buka. Tanpa jaminan ini, hari usaha
 * yang kebetulan dibuka sebelum jam buka (mis. 02:00 saat jam buka 09:00)
 * bisa mendapat batas tutup yang sama dengan waktu bukanya sendiri, sehingga
 * penutupan otomatis berulang tanpa henti dan membanjiri Log Book.
 */
function autoCloseAt(openedAt: number, hours?: OperatingHours) {
  const { openHour, closeHour } = normalizeHours(hours);
  const d = businessDate(openedAt, hours);
  d.setDate(d.getDate() + (closeHour <= openHour ? 1 : 0));
  d.setHours(closeHour, 0, 0, 0);
  // Majukan per hari sampai batas tutup benar-benar melewati waktu buka.
  while (d.getTime() <= openedAt) d.setDate(d.getDate() + 1);
  return d.getTime();
}


export type ConsoleType = string;
export type PlayMode = "prepaid" | "open";
export type StationAvailability = "available" | "booked" | "maintenance" | "offline";
export type RoundingRule = "minute" | "30-minutes" | "hour";

export type OrderItem = {
  id: string;
  menuId?: string;
  name: string;
  price: number;
  qty: number;
  /** Opsi modifikasi yang dipilih (mis. "Less sugar", "Iced", "Pedas"). */
  mods?: string[];
  /** Asal pesanan bila tagihannya dititipkan dari meja/TV lain. */
  linkedFrom?: { type: "table" | "station"; id: string; name: string };
};

/** Kunci penggabungan: menu, nama, harga, dan modifier yang sama → satu baris. */
const orderKey = (o: OrderItem) =>
  `${o.menuId ?? ""}|${o.name}|${o.price}|${(o.mods ?? []).join("·")}`;

/** Tambahkan pesanan baru; baris identik (bukan titipan) cukup ditambah qty-nya. */
export function mergeOrders(existing: OrderItem[], added: OrderItem[]): OrderItem[] {
  const list = [...existing];
  for (const o of added) {
    const idx = list.findIndex((e) => !e.linkedFrom && !o.linkedFrom && orderKey(e) === orderKey(o));
    const hit = idx >= 0 ? list[idx] : undefined;
    if (hit) list[idx] = { ...hit, qty: hit.qty + o.qty };
    else list.push(o);
  }
  return list;
}


/** Tanda asal pesanan titipan yang ikut tampil di bill, struk, dan label. */
const linkTag = (from: NonNullable<OrderItem["linkedFrom"]>) =>
  `${from.type === "table" ? "Meja" : "TV"} ${from.name}`;

/** Salin pesanan sebagai titipan, lengkap dengan tanda asalnya. */
export function withLinkTag(
  order: OrderItem,
  from: NonNullable<OrderItem["linkedFrom"]>,
  index = 0,
): OrderItem {
  const tag = linkTag(from);
  const mods = order.mods ?? [];
  return {
    ...order,
    id: `${order.id}-link-${Date.now()}-${index}`,
    mods: mods.includes(tag) ? mods : [...mods, tag],
    linkedFrom: from,
  };
}

/** Kembalikan pesanan titipan ke bentuk aslinya (tanda asal dilepas). */
export function stripLinkTag(order: OrderItem): OrderItem {
  const { linkedFrom, ...rest } = order;
  if (!linkedFrom) return rest;
  const tag = linkTag(linkedFrom);
  const mods = (rest.mods ?? []).filter((m) => m !== tag);
  return mods.length ? { ...rest, mods } : { ...rest, mods: [] };
}


/** Nama pesanan lengkap dengan opsi modifikasi. */
export const orderLabel = (o: OrderItem) =>
  o.mods && o.mods.length > 0 ? `${o.name} (${o.mods.join(", ")})` : o.name;

/** Cara hitung sewa tambahan: per jam pemakaian atau sekali sewa. */
export type AddonMode = "hourly" | "once";

/** Item "Additional Rental": sewa tambahan selain konsol (stik, VR, kursi, dll). */
export type AddonRental = {
  id: string;
  name: string;
  price: number;
  mode: AddonMode;
  active: boolean;
  discount?: ItemDiscount;
  sort?: number;
};

/** Sewa tambahan yang dipakai pada satu sesi rental. */
export type SessionAddon = {
  id: string;
  addonId: string;
  name: string;
  price: number;
  mode: AddonMode;
  qty: number;
  /** Durasi khusus item ini (menit). Kosong = ikut lama sesi. */
  minutes?: number;
};

/** Jam yang dipakai satu sewa tambahan: durasi sendiri bila diisi, jika tidak ikut sesi. */
export function addonHours(addon: SessionAddon, sessionHours: number) {
  const own = addon.minutes;
  if (typeof own === "number" && own > 0) return own / 60;
  return Math.max(0, sessionHours);
}

/** Biaya satu sewa tambahan. Mode per jam dikali durasi yang dipakai item itu. */
export function addonAmount(addon: SessionAddon, hours: number) {
  const qty = Math.max(0, addon.qty);
  if (addon.mode === "once") return Math.round(addon.price * qty);
  return Math.round(addon.price * qty * addonHours(addon, hours));
}

export function addonsTotal(addons: SessionAddon[] | undefined, hours: number) {
  return (addons ?? []).reduce((sum, a) => sum + addonAmount(a, hours), 0);
}


export type Session = {
  mode: PlayMode;
  startAt: number;
  durationMin: number; // 0 for open time
  rate: number; // rupiah per hour, snapshot at start
  orders: OrderItem[];
  /** Sewa tambahan (Additional Rental) yang dipakai sesi ini. */
  addons?: SessionAddon[];
  customerName: string;
  customerPhone: string;
  member: boolean;
  packageName: string;
  notes: string;
  bonusMin: number; // waktu ekstra/pengurangan tanpa mengubah tarif
  customerId?: string;
  bookingId?: string;
  promoName?: string;
  /** Promo yang diberikan kasir untuk sesi ini. */
  promoIds?: string[];

  discountType?: "percent" | "fixed";
  discountValue?: number;
  discountMax?: number;
  settlements?: Settlement[];
  historyId?: string; // nota yang sudah dibuat saat tagihan lunas
  paidAt?: number; // waktu tagihan dinyatakan lunas
  pausedAt?: number; // jika terisi, timer sedang dijeda
  pausedMs?: number; // akumulasi total waktu jeda
  /** Koreksi hitung mundur setelah waktu habis; tidak mengubah durasi main/tagihan. */
  timerOffsetMs?: number;
  /** Tagihan sesi ini digabung dan dibayar dari panel TV induk berikut. */
  mergedInto?: string;
};


export type Settlement = {
  id: string;
  at: number;
  payment: string;
  payments?: { method: string; amount: number }[];
  amount: number; // jumlah yang dibayarkan ke tagihan
  amountPaid: number; // uang diterima
  change: number;
};


export type Station = {
  id: string;
  name: string;
  console: ConsoleType;
  booth: string;
  availability: StationAvailability;
  session: Session | null;
  sort?: number;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  sort?: number;
  /** Potongan harga khusus untuk item ini (Playing Card / Member). */
  discount?: ItemDiscount;
  /** Cetak label saat pesanan dibuat (default: ya). */
  printEnabled?: boolean;
  /** Printer label tujuan (Kitchen / Bar). */
  printerId?: string;
  /** Opsi modifikasi sederhana tanpa tambahan harga (mis. Less sugar, Iced). */
  modifiers?: string[];
  /** Varian rasa/jenis dengan tambahan harga (mis. Pedas, Soto, Goreng). */
  variants?: MenuOption[];
  /** Ukuran dengan tambahan harga (mis. Small, Medium, Large). */
  sizes?: MenuOption[];
  /** Topping tambahan dengan harga (mis. Telur, Keju, Kornet). */
  toppings?: MenuOption[];
};

/** Pilihan menu tambahan: nama + tambahan harga (0 = gratis). */
export type MenuOption = { name: string; price: number };

/** Label pilihan beserta tambahan harganya. */
export const optionLabel = (o: MenuOption) =>
  o.price > 0 ? `${o.name} +${formatRupiah(o.price)}` : o.name;

/** Ubah teks "Pedas:5000, Manis" menjadi daftar pilihan. */
export const parseMenuOptions = (text: string): MenuOption[] =>
  text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, price] = part.split(":");
      return { name: (name ?? "").trim(), price: Number((price ?? "").trim()) || 0 };
    })
    .filter((o) => o.name.length > 0);

/** Ubah daftar pilihan menjadi teks "Pedas:5000, Manis". */
export const menuOptionsText = (list?: MenuOption[]) =>
  (list ?? []).map((o) => (o.price > 0 ? `${o.name}:${o.price}` : o.name)).join(", ");

export type CafeTable = {
  id: string;
  name: string; // nomor meja
  area: string;
  seats: number;
  customerName: string;
  notes: string;
  openedAt: number | null;
  orders: OrderItem[];
  /** Promo yang diberikan kasir untuk meja ini. */
  promoIds?: string[];
  /** Pembayaran sebagian (DP) yang sudah diterima untuk meja ini. */
  settlements?: Settlement[];
  /** Waktu tagihan meja dinyatakan lunas; meja tetap terisi sampai sesi diakhiri. */
  paidAt?: number;
  sort?: number;


};


export type PaymentMethod = { id: string; name: string; active: boolean; sort?: number };
export type RentalPackage = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  active: boolean;
  sort?: number;
};

export type CustomerLevel = "Bronze" | "Silver" | "Gold";
export type Customer = {
  id: string;
  name: string;
  phone: string;
  member: boolean;
  level: CustomerLevel;
  points: number;
  visits: number;
  totalSpent: number;
  createdAt: number;
};
export type BookingStatus = "confirmed" | "checked-in" | "completed" | "cancelled";
/** Additional Rental yang dipesan bersama reservasi. */
export type BookingAddon = {
  addonId: string;
  qty: number;
  /** Durasi khusus item ini (menit). Kosong = ikut lama sesi. */
  minutes?: number;
};
/** Makanan/minuman yang dipesan bersama reservasi. */
export type BookingOrder = { menuId: string; qty: number };
export type Booking = {
  id: string;
  /** Id unit TV, atau id meja kafe bila target = "table". */
  stationId: string;
  /** Jenis tempat yang direservasi (default: unit TV). */
  target?: "station" | "table";
  customerId?: string;
  customerName: string;
  customerPhone: string;
  startAt: number;
  endAt: number;
  notes: string;
  status: BookingStatus;
  /** Additional Rental yang otomatis masuk sesi saat check-in. */
  addons?: BookingAddon[];
  /** Pesanan F&B yang otomatis masuk panel TV/meja saat check-in. */
  orders?: BookingOrder[];
  /** Uang muka (DP) yang sudah disetor pelanggan. */
  dpAmount?: number;
  /** Metode pembayaran DP. */
  dpPayment?: string;
  /** Penanda bahwa DP sudah dipakai sebagai pembayaran sesi. */
  dpUsedAt?: number;
};
export type Promotion = {
  id: string;
  name: string;
  type: "percent" | "fixed";
  value: number;
  minSpend: number;
  maxDiscount: number;
  startsAt: number;
  endsAt: number;
  active: boolean;
  /** Berlaku otomatis pada setiap transaksi selama periode berjalan (happy hour). */
  auto?: boolean;
  /** Jam mulai/selesai harian, format "HH:MM". Kosong berarti sepanjang hari. */
  startTime?: string;
  endTime?: string;
  /** Jenis promo. Kosong berarti promo diskon (bentuk lama). */
  kind?: PromoKind;
  /** Bonus jam rental: bayar `payHours` jam dapat `bonusHours` jam. */
  payHours?: number;
  bonusHours?: number;
  /** Buy one get one kafe: beli `buyQty` menu ini, dapat menu gratis. */
  buyMenuId?: string;
  buyQty?: number;
  /** Menu hadiah untuk BOGO maupun promo menu gratis. */
  freeMenuId?: string;
  freeMenuQty?: number;
  /** Promo menu gratis: minimal jam main sebelum hadiah diberikan. */
  minHours?: number;
};

/** Jenis promo yang didukung aplikasi. */
export type PromoKind = "discount" | "bonusHours" | "bogo" | "freeMenu";

export const PROMO_KINDS: { id: PromoKind; label: string; hint: string }[] = [
  { id: "discount", label: "Promo Diskon", hint: "Potongan persen atau nominal dari tagihan." },
  {
    id: "bonusHours",
    label: "Bonus Jam Rental",
    hint: "Bayar sekian jam, dapat tambahan jam gratis.",
  },
  {
    id: "bogo",
    label: "Buy One Get One (Kafe)",
    hint: "Beli menu tertentu, dapat menu gratis otomatis.",
  },
  {
    id: "freeMenu",
    label: "Main X Jam Dapat Menu Gratis",
    hint: "Rental minimal sekian jam, menu hadiah masuk pesanan.",
  },
];

export const promoKind = (promo: Promotion): PromoKind => promo.kind ?? "discount";

export const promoKindLabel = (kind: PromoKind) =>
  PROMO_KINDS.find((item) => item.id === kind)?.label ?? "Promo Diskon";
/** Pengaturan keamanan sesi: keluar otomatis dan alarm waktu habis. */
export type SessionSecurity = {
  /** Menit tanpa aktivitas sebelum keluar otomatis. 0 berarti dimatikan. */
  idleMinutes: number;
  /** Alarm suara saat waktu rental habis. */
  alarmEnabled: boolean;
  /** Nada alarm bawaan. */
  alarmSound: AlarmSound;
  /** Kekencangan alarm 1–10. */
  alarmVolume: number;
  /** Alarm berbunyi berulang sampai ditekan OK. */
  alarmRepeat: boolean;
};

export const DEFAULT_SESSION_SECURITY: SessionSecurity = {
  idleMinutes: 5,
  alarmEnabled: true,
  alarmSound: "beep",
  alarmVolume: 10,
  alarmRepeat: true,
};

export function normalizeSessionSecurity(value?: Partial<SessionSecurity> | null): SessionSecurity {
  const minutes = Number(value?.idleMinutes ?? DEFAULT_SESSION_SECURITY.idleMinutes);
  const volume = Number(value?.alarmVolume ?? DEFAULT_SESSION_SECURITY.alarmVolume);
  return {
    idleMinutes: Number.isFinite(minutes) ? Math.min(240, Math.max(0, Math.round(minutes))) : 5,
    alarmEnabled: value?.alarmEnabled ?? true,
    alarmSound: ALARM_SOUNDS.some((item) => item.id === value?.alarmSound)
      ? (value?.alarmSound as AlarmSound)
      : "beep",
    alarmVolume: Number.isFinite(volume) ? Math.min(10, Math.max(1, Math.round(volume))) : 10,
    alarmRepeat: value?.alarmRepeat ?? true,
  };
}

export type PointEntry = { id: string; customerId: string; points: number; reason: string; createdAt: number };

/** Kartu bermain (Playing Card) berchip RFID Mifare Classic 13,56 MHz. */
export type PlayingCard = {
  id: string;
  cardNumber: string;
  /** Kode kartu (alfanumerik) yang dicetak/ditempel di kartu. */
  cardCode?: string;
  /** Nomor seri chip (UID) yang diketik oleh pembaca kartu USB mode keyboard. */
  cardUid?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  member: boolean;
  balance: number;
  active: boolean;
  cardPrice: number;
  createdAt: number;
  sort?: number;
};

/** Cadangan data Playing Card (kartu + saldo + riwayat transaksi kartu). */
export type CardBackup = {
  id: string;
  createdAt: number;
  /** manual = ditekan kasir, closing = otomatis saat close out shift. */
  source: "manual" | "closing";
  actorName: string;
  actorRole?: string;
  cardCount: number;
  totalBalance: number;
  cards: PlayingCard[];
  entries: CardEntry[];
};

/** Jumlah cadangan kartu yang disimpan (yang paling lama dibuang). */
export const CARD_BACKUP_LIMIT = 10;

export type CardEntryType = "purchase" | "topup" | "payment" | "adjust";
export type CardEntry = {
  id: string;
  cardId: string;
  cardNumber: string;
  cardCode?: string;
  type: CardEntryType;
  amount: number;
  balanceAfter: number;
  note: string;
  createdAt: number;
};

/** Label kartu: nomor kartu + kode kartu bila ada. */
export function cardLabel(card?: { cardNumber: string; cardCode?: string } | null) {
  if (!card) return "";
  const code = card.cardCode?.trim();
  return code ? `${card.cardNumber} · ${code}` : card.cardNumber;
}


export const CARD_PAYMENT_NAME = "Playing Card";
/** Top-up kartu hanya deposit: masuk kas, tapi bukan penghasilan. */
export const CARD_TOPUP_CATEGORY_ID = "cc-topup-card";
/** Penjualan kartu baru: penghasilan store. */
export const CARD_SALE_CATEGORY_ID = "cc-jual-kartu";
/** DP reservasi: kas masuk, bukan penghasilan. */
export const BOOKING_DP_CATEGORY_ID = "cc-dp-reservasi";
/** DP reservasi yang dipakai saat check-in: kas keluar, bukan biaya. */
export const BOOKING_DP_USED_CATEGORY_ID = "cc-dp-reservasi-pakai";

/**
 * Pos akun baku (Chart of Accounts). Nama akun bebas diatur store, tapi setiap
 * item wajib memilih salah satu pos ini supaya laporan tetap seimbang.
 */
export type CashAccount = "sales" | "other" | "payin" | "expense" | "payout";
export const CASH_ACCOUNT_LABEL: Record<CashAccount, string> = {
  sales: "SALES",
  other: "OTHER REVENUE",
  payin: "PAY-IN (TITIPAN)",
  expense: "EXPENSES (BIAYA)",
  payout: "PAY-OUT LAIN (PRIVE / SETORAN)",
};
export const ACCOUNTS_BY_DIRECTION: Record<CashDirection, CashAccount[]> = {
  in: ["sales", "other", "payin"],
  out: ["expense", "payout"],
};
export function isPayoutAccount(a: CashAccount) {
  return a === "payin" || a === "payout";
}

/** Modul yang mencatat kas otomatis dan bisa dipetakan ke akun pilihan store. */
export type ModuleSource = "card-sale" | "card-topup" | "booking-dp" | "booking-dp-used";
export const MODULE_SOURCES: {
  source: ModuleSource;
  label: string;
  hint: string;
  direction: CashDirection;
  account: CashAccount;
  defaultId: string;
  defaultName: string;
  defaultGroup: string;
}[] = [
  { source: "card-sale", label: "Penjualan Kartu Baru", hint: "Harga kartu saat kartu baru dijual.", direction: "in", account: "sales", defaultId: "cc-jual-kartu", defaultName: "Penjualan Playing Card", defaultGroup: "Playing Card" },
  { source: "card-topup", label: "Top Up Saldo Kartu", hint: "Saldo titipan pelanggan di kartu.", direction: "in", account: "payin", defaultId: "cc-topup-card", defaultName: "Top Up Playing Card", defaultGroup: "Playing Card" },
  { source: "booking-dp", label: "DP Reservasi", hint: "Uang muka saat reservasi dibuat.", direction: "in", account: "payin", defaultId: "cc-dp-reservasi", defaultName: "DP Reservasi", defaultGroup: "DP Reservasi" },
  { source: "booking-dp-used", label: "DP Reservasi Terpakai", hint: "DP yang memotong tagihan saat check-in.", direction: "out", account: "payout", defaultId: "cc-dp-reservasi-pakai", defaultName: "DP Reservasi dipakai", defaultGroup: "DP Reservasi" },
];

/** Sumber modul sebuah catatan kas (termasuk data lama berdasarkan id bawaan). */
export function entrySource(e: { source?: ModuleSource; categoryId: string }): ModuleSource | undefined {
  if (e.source) return e.source;
  return MODULE_SOURCES.find((m) => m.defaultId === e.categoryId)?.source;
}

/**
 * ID catatan "DP Reservasi" yang sudah dipakai saat check-in (sudah menjadi SALES
 * di nota sesuai metode bayarnya). Laporan hanya menampilkan DP yang belum terpakai.
 * Dipasangkan dengan catatan "DP Reservasi dipakai" lewat nominal, metode, dan nama tamu.
 */
export function usedBookingDpIds(entries: { id: string; amount: number; payment: string; note?: string; source?: ModuleSource; categoryId: string; createdAt: number }[]): Set<string> {
  const nameOf = (n?: string) => (n ?? "").replace(/^DP reservasi\s+/i, "").replace(/\s+dipakai di .*$/i, "").trim().toLowerCase();
  const key = (e: { amount: number; payment: string; note?: string }) => `${e.amount}|${(e.payment || "Cash").toLowerCase()}|${nameOf(e.note)}`;
  const pending = new Map<string, number>();
  for (const e of entries) if (entrySource(e) === "booking-dp-used") pending.set(key(e), (pending.get(key(e)) ?? 0) + 1);
  const used = new Set<string>();
  for (const e of [...entries].sort((a, b) => a.createdAt - b.createdAt)) {
    if (entrySource(e) !== "booking-dp") continue;
    const k = key(e); const n = pending.get(k) ?? 0;
    if (n > 0) { used.add(e.id); pending.set(k, n - 1); }
  }
  return used;
}



/** Pos akun sebuah item kas; data lama diturunkan dari arah + tanda payout. */
export function categoryAccount(c: {
  account?: CashAccount;
  direction: CashDirection;
  payout: boolean;
  id?: string;
  categoryId?: string;
  source?: ModuleSource;
}): CashAccount {
  if (c.account && ACCOUNTS_BY_DIRECTION[c.direction].includes(c.account)) return c.account;
  const src = c.source ?? MODULE_SOURCES.find((m) => m.defaultId === (c.categoryId ?? c.id))?.source;
  if (src === "card-sale") return "sales";
  if (c.direction === "in") return c.payout ? "payin" : "other";
  return c.payout ? "payout" : "expense";
}
export const entryAccount = categoryAccount;

/** Item kas yang dipakai sebuah modul: pemetaan store → item bawaan → cadangan. */
export function resolveModuleCategory(categories: CashCategory[], source: ModuleSource) {
  const meta = MODULE_SOURCES.find((m) => m.source === source)!;
  const mapped = categories.find((c) => c.mapFor === source && c.direction === meta.direction);
  const found = mapped ?? categories.find((c) => c.id === meta.defaultId);
  const cat = found ?? {
    id: meta.defaultId,
    name: meta.defaultName,
    group: meta.defaultGroup,
    direction: meta.direction,
    payout: isPayoutAccount(meta.account),
    account: meta.account,
    active: true,
  };
  const account = found ? categoryAccount(found) : meta.account;
  return { ...cat, account, payout: isPayoutAccount(account) };
}

/** Modul aktif & label akun SALES bawaan per store. */
export type BusinessProfile = {
  modules: { cafe: boolean; booking: boolean; playingCard: boolean };
  salesLabels: { rental: string; fnb: string; addon: string };
  /** Sebutan unit sewa di layar, misal "TV", "Meja", "Lapangan". */
  unitLabel: string;
};
export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  modules: { cafe: true, booking: true, playingCard: true },
  salesLabels: { rental: "RENTAL", fnb: "F&B", addon: "ADDITIONAL RENTAL" },
  unitLabel: "TV",
};

/** Metode pembayaran yang boleh dipakai untuk beli kartu / top up saldo. */
export const CARD_FUNDING_METHODS = [
  "Cash",
  "QRIS",
  "Transfer Bank BCA",
  "Transfer Bank Mandiri",
] as const;

/** Bandingkan nomor tanpa peduli huruf besar/kecil, spasi, titik dua, atau tanda hubung. */
export function normalizeCardKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s:-]/g, "");
}

/**
 * Cari kartu berdasarkan nomor kartu, kode kartu, atau nomor seri chip (UID).
 * Dengan begitu tap dari pembaca USB (yang mengetik UID) dan tap dari perangkat
 * ber-NFC bawaan (yang membaca teks rekaman NFC Tools) menemukan kartu yang sama.
 */
export function findCardByNumber(cards: PlayingCard[], cardNumber: string) {
  const key = normalizeCardKey(cardNumber);
  if (!key) return undefined;
  return (
    cards.find((c) => normalizeCardKey(c.cardNumber) === key) ??
    cards.find((c) => normalizeCardKey(c.cardCode ?? "") === key) ??
    cards.find((c) => normalizeCardKey(c.cardUid ?? "") === key)
  );
}

/**
 * Terapkan data cadangan kartu ke state.
 * - replace: seluruh data kartu & riwayat kartu diganti isi cadangan.
 * - merge: hanya kartu yang hilang (id/nomor belum ada) yang ditambahkan.
 */
function applyCardRestore<
  T extends { playingCards: PlayingCard[]; cardEntries: CardEntry[] },
>(prev: T, cards: PlayingCard[], entries: CardEntry[], mode: "replace" | "merge"): T {
  const copyCards = JSON.parse(JSON.stringify(cards)) as PlayingCard[];
  const copyEntries = JSON.parse(JSON.stringify(entries)) as CardEntry[];
  if (mode === "replace") {
    return { ...prev, playingCards: copyCards, cardEntries: copyEntries };
  }
  const ids = new Set(prev.playingCards.map((c) => c.id));
  const keys = new Set(prev.playingCards.map((c) => normalizeCardKey(c.cardNumber)));
  const missing = copyCards.filter(
    (c) => !ids.has(c.id) && !keys.has(normalizeCardKey(c.cardNumber)),
  );
  if (!missing.length) return prev;
  const missingIds = new Set(missing.map((c) => c.id));
  const entryIds = new Set(prev.cardEntries.map((e) => e.id));
  const addedEntries = copyEntries.filter(
    (e) => missingIds.has(e.cardId) && !entryIds.has(e.id),
  );
  return {
    ...prev,
    playingCards: [...prev.playingCards, ...missing],
    cardEntries: [...addedEntries, ...prev.cardEntries],
  };
}

/** Potongan harga (persen) untuk pembayaran memakai saldo Playing Card. */
export function cardDiscountPercentFor(
  card: PlayingCard,
  settings: { cardDiscountPercent: number; cardMemberDiscountPercent: number },
) {
  const pct = card.member ? settings.cardMemberDiscountPercent : settings.cardDiscountPercent;
  return Math.min(100, Math.max(0, pct ?? 0));
}
export type DiscountType = "percent" | "fixed";

/**
 * Potongan harga per item yang dijual.
 * `type: "fixed"` berarti rupiah (untuk rental: rupiah per jam),
 * `type: "percent"` berarti persen dari harga item.
 */
export type ItemDiscount = { type: DiscountType; card: number; member: number };

export const emptyItemDiscount: ItemDiscount = { type: "fixed", card: 0, member: 0 };

export type DiscountContext = { member: boolean; card: boolean };

/** Potongan yang dipakai adalah yang paling besar (member atau Playing Card). */
export function itemDiscountAmount(
  discount: ItemDiscount | undefined,
  base: number,
  units: number,
  ctx: DiscountContext,
  fallbackPercent = 0,
) {
  if (base <= 0) return 0;
  const values: number[] = [];
  if (discount) {
    if (ctx.card) values.push(discount.card ?? 0);
    if (ctx.member) values.push(discount.member ?? 0);
  }
  const value = values.length ? Math.max(...values) : 0;
  const type = discount?.type ?? "fixed";
  const own = value <= 0 ? 0 : type === "percent" ? (base * value) / 100 : value * Math.max(0, units);
  // Potongan yang sudah ditetapkan per item selalu menang. Potongan umum kartu
  // hanya dipakai kalau item itu belum punya angka sendiri.
  if (own > 0) return Math.min(base, Math.round(own));
  const fallback = ctx.card && fallbackPercent > 0 ? (base * fallbackPercent) / 100 : 0;
  return Math.min(base, Math.round(fallback));
}

/** Total potongan per item untuk daftar pesanan makanan/minuman. */
export function orderDiscountTotal(
  orders: OrderItem[],
  menu: MenuItem[],
  ctx: DiscountContext,
  fallbackPercent = 0,
) {
  return orders.reduce((sum, order) => {
    const item =
      menu.find((m) => m.id === order.menuId) ??
      menu.find((m) => order.id.startsWith(`${m.id}-`)) ??
      menu.find((m) => m.name === order.name);
    const base = order.price * order.qty;
    return sum + itemDiscountAmount(item?.discount, base, order.qty, ctx, fallbackPercent);
  }, 0);
}

function minutesOfDay(at: number) {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

function parseClockValue(value?: string) {
  if (!value) return null;
  const [h, m] = value.split(":");
  const hour = Number(h);
  const minute = Number(m ?? 0);
  if (!Number.isFinite(hour)) return null;
  return hour * 60 + (Number.isFinite(minute) ? minute : 0);
}

/** Apakah promo ini sedang berada dalam periode tanggal dan jamnya? */
export function promoInWindow(promo: Promotion, now: number) {
  if (!promo.active) return false;
  if (promo.startsAt > now || promo.endsAt < now) return false;
  const current = minutesOfDay(now);
  const from = parseClockValue(promo.startTime);
  const to = parseClockValue(promo.endTime);
  if (from === null || to === null) return true;
  // Jendela yang melewati tengah malam tetap dihitung benar.
  return from <= to ? current >= from && current <= to : current >= from || current <= to;
}

/** Diskon global (happy hour) yang sedang berjalan pada waktu `now`. */
export function activeGlobalPromo(promotions: Promotion[], now: number) {
  return promotions.find(
    (promo) => promoKind(promo) === "discount" && Boolean(promo.auto) && promoInWindow(promo, now),
  );
}

/** Promo jenis tertentu yang sedang berjalan. */
export function activePromosOfKind(promotions: Promotion[], now: number, kind: PromoKind) {
  return promotions.filter((promo) => promoKind(promo) === kind && promoInWindow(promo, now));
}

/**
 * Promo jenis tertentu yang berlaku sendiri (otomatis).
 * Promo tanpa tanda otomatis hanya jalan bila kasir memberikannya manual.
 */
export function autoPromosOfKind(promotions: Promotion[], now: number, kind: PromoKind) {
  return activePromosOfKind(promotions, now, kind).filter((promo) => Boolean(promo.auto));
}

/** Semua promo yang tanggal dan jamnya sedang berlaku. */
export function activePromos(promotions: Promotion[], now: number) {
  return promotions.filter((promo) => promoInWindow(promo, now));
}


/** Tanda pada baris pesanan hadiah promo. */
export const PROMO_FREE_TAG = "Promo";

/** Baris pesanan gratis dari sebuah promo. */
export function freeOrderLine(menu: MenuItem, qty: number, promoName: string): OrderItem {
  return {
    id: `promo-${menu.id}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    menuId: menu.id,
    name: menu.name,
    price: 0,
    qty: Math.max(1, Math.round(qty)),
    mods: [`${PROMO_FREE_TAG}: ${promoName}`],
  };
}

/** Pesanan gratis dari promo Buy One Get One untuk satu menu yang baru dipesan. */
export function bogoFreeOrders(
  promotions: Promotion[],
  menuList: MenuItem[],
  now: number,
  item: MenuItem,
  qty: number,
): OrderItem[] {
  const out: OrderItem[] = [];
  for (const promo of autoPromosOfKind(promotions, now, "bogo")) {
    if (promo.buyMenuId !== item.id) continue;
    const need = Math.max(1, Math.round(promo.buyQty ?? 1));
    const times = Math.floor(qty / need);
    if (times <= 0) continue;
    const gift = menuList.find((m) => m.id === (promo.freeMenuId || promo.buyMenuId));
    if (!gift) continue;
    out.push(freeOrderLine(gift, times * Math.max(1, Math.round(promo.freeMenuQty ?? 1)), promo.name));
  }
  return out;
}

export function promoDiscountAmount(promo: Promotion | undefined, base: number) {
  if (!promo || base <= 0) return 0;
  if (base < (promo.minSpend ?? 0)) return 0;
  const raw = promo.type === "percent" ? (base * promo.value) / 100 : promo.value;
  const capped = promo.maxDiscount > 0 ? Math.min(raw, promo.maxDiscount) : raw;
  return Math.min(base, Math.max(0, Math.round(capped)));
}

export type BillBreakdown = {
  rental: number;
  /** Total sewa tambahan (Additional Rental). */
  addon: number;
  fnb: number;
  subtotal: number;
  itemDiscount: number;
  promoDiscount: number;
  promoName: string;
  manualDiscount: number;
  discount: number;
  total: number;
};

/** Satu tempat perhitungan tagihan: potongan item, happy hour, lalu diskon transaksi. */
export function computeBill(input: {
  rental: number;
  rentalHours: number;
  rentalDiscount?: ItemDiscount;
  /** Total sewa tambahan yang sudah dihitung. */
  addon?: number;
  /** Potongan harga khusus sewa tambahan. */
  addonDiscount?: number;
  orders: OrderItem[];
  menu: MenuItem[];
  ctx: DiscountContext;
  promotions: Promotion[];
  now: number;
  fallbackPercent?: number;
  /** Promo diskon yang dipilih kasir (bisa beberapa sekaligus). */
  promoIds?: string[];
  manual?: { type: DiscountType; value: number; max?: number };
}): BillBreakdown {
  const fallback = input.fallbackPercent ?? 0;
  const fnb = input.orders.reduce((sum, o) => sum + o.price * o.qty, 0);
  const rental = Math.max(0, input.rental);
  const addon = Math.max(0, input.addon ?? 0);
  const subtotal = rental + addon + fnb;
  const itemDiscount =
    itemDiscountAmount(input.rentalDiscount, rental, input.rentalHours, input.ctx, fallback) +
    Math.min(addon, Math.max(0, input.addonDiscount ?? 0)) +
    orderDiscountTotal(input.orders, input.menu, input.ctx, fallback);
  const afterItem = Math.max(0, subtotal - itemDiscount);
  // Promo diskon: happy hour otomatis ditambah promo yang dipilih kasir.
  // Beberapa promo bisa dipakai sekaligus, dihitung bertingkat.
  const picked = (input.promoIds ?? [])
    .map((id) => input.promotions.find((p) => p.id === id))
    .filter((p): p is Promotion => Boolean(p) && promoKind(p!) === "discount");
  const auto = activeGlobalPromo(input.promotions, input.now);
  const promoList = [...(auto ? [auto] : []), ...picked].filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
  );
  let promoDiscount = 0;
  const promoNames: string[] = [];
  for (const promo of promoList) {
    const amount = promoDiscountAmount(promo, Math.max(0, afterItem - promoDiscount));
    if (amount <= 0) continue;
    promoDiscount += amount;
    promoNames.push(promo.name);
  }
  promoDiscount = Math.min(afterItem, promoDiscount);
  const afterPromo = Math.max(0, afterItem - promoDiscount);

  const manual = input.manual;
  const manualRaw =
    !manual || !manual.value
      ? 0
      : manual.type === "percent"
        ? (afterPromo * manual.value) / 100
        : manual.value;
  const manualCapped = manual?.max ? Math.min(manualRaw, manual.max) : manualRaw;
  const manualDiscount = Math.min(afterPromo, Math.max(0, Math.round(manualCapped)));
  const discount = itemDiscount + promoDiscount + manualDiscount;
  return {
    rental,
    addon,
    fnb,
    subtotal,
    itemDiscount,
    promoDiscount,
    promoName: promoNames.join(" · "),
    manualDiscount,
    discount,
    total: Math.max(0, subtotal - discount),
  };
}

/** Arah uang kas: masuk (penerimaan) atau keluar (pengeluaran). */
export type CashDirection = "in" | "out";

/**
 * Kelompok/item kas buatan pengguna.
 * `payout: true` berarti tidak dihitung sebagai pendapatan / biaya,
 * hanya perpindahan uang (misal setoran atau pengambilan uang owner).
 */
export type CashCategory = {
  id: string;
  name: string;
  direction: CashDirection;
  payout: boolean;
  /** Pos akun baku; kosong untuk data lama (diturunkan dari `payout`). */
  account?: CashAccount;
  /** Modul otomatis yang memakai item ini (Account Mapping). */
  mapFor?: ModuleSource;
  group: string;
  active: boolean;
  sort?: number;
};

/** Kategori kas buatan pengguna, dipakai untuk mengelompokkan item kas. */
export type CashGroup = {
  id: string;
  name: string;
  direction: CashDirection;
  active: boolean;
  sort?: number;
};

export type CashEntry = {
  id: string;
  categoryId: string;
  categoryName: string;
  group: string;
  direction: CashDirection;
  payout: boolean;
  amount: number;
  payment: string;
  note: string;
  createdAt: number;
  /** Nama pelaku yang mencatat entri ini (kosong untuk data lama). */
  createdBy?: string;
  /** Kartu playing card yang jadi sumber catatan ini (jual kartu / top-up). */
  cardId?: string;
  /** Riwayat kartu yang berpasangan, supaya hapus/edit ikut berdampak. */
  cardEntryId?: string;
  /** Pos akun saat dicatat. */
  account?: CashAccount;
  /** Modul otomatis yang membuat catatan ini. */
  source?: ModuleSource;
};

/**
 * Catatan log book: semua aktivitas selain nota transaksi pelanggan,
 * misalnya menghapus nota, mengganti kata sandi, atau buka/tutup shift.
 */
export type LogEntry = {
  id: string;
  at: number;
  actor: string;
  role: string;
  action: string;
  detail: string;
};

export type PaymentSplit = {
  method: string;
  amount: number;
  /** Waktu uang ini benar-benar diterima kasir (dipakai untuk kas per shift). */
  at?: number;
};

/**
 * Pecahan pembayaran satu pelunasan, lengkap dengan waktu uang diterima.
 * Dipakai agar uang tetap milik shift yang menerimanya walau nota
 * baru ditutup di shift berikutnya.
 */
export function settlementSplits(s: Settlement): PaymentSplit[] {
  const list: PaymentSplit[] = s.payments?.length
    ? s.payments
    : [{ method: s.payment, amount: s.amount }];
  return list.map((p) => ({ ...p, at: p.at ?? s.at }));
}

/** Shift kasir: check-in sampai close out. */
export type CashShift = {
  id: string;
  cashierName: string;
  cashierId?: string;
  openedAt: number;
  closedAt?: number;
  startCash: number;
  cashActual?: number;
  balanceNote?: string;
  nextStartCash?: number;
  closedByName?: string;
  closedById?: string;
  /** Angka final yang dikunci saat Close Out; riwayat shift tertutup membaca ini. */
  snapshot?: ShiftSummary;
};

/**
 * Hari usaha (siklus akuntansi harian): terbuka saat kasir pertama check-in,
 * ditutup lewat proses End of Day setelah shift terakhir selesai closing.
 */
export type BusinessDay = {
  id: string;
  openedAt: number;
  closedAt?: number;
  closedByName?: string;
  closedById?: string;
  /** True bila ditutup otomatis oleh sistem karena End of Day tidak dijalankan. */
  autoClosed?: boolean;
  note?: string;
};


export type HistoryRecord = {
  id: string;
  stationName: string;
  console: ConsoleType;
  mode: PlayMode;
  startAt: number;
  endAt: number;
  minutes: number;
  rentalTotal: number;
  /** Total sewa tambahan (Additional Rental). */
  addonTotal?: number;
  /** Rincian sewa tambahan yang dipakai. */
  addons?: SessionAddon[];
  fnbTotal: number;
  total: number;
  payment?: string;
  payments?: PaymentSplit[];
  customerName?: string;
  customerPhone?: string;
  packageName?: string;
  amountPaid?: number;
  change?: number;
  orders?: OrderItem[];
  customerId?: string;
  promoName?: string;
  discount?: number;
  pointsEarned?: number;
  kind?: "rental" | "cafe";
  tableName?: string;
  paidAt?: number; // waktu pembayaran lunas
  ongoing?: boolean; // sesi masih berjalan saat nota dibuat
  cashierName?: string; // kasir yang memproses transaksi
  deviceCode?: string; // kode perangkat yang memproses transaksi
};


/** Transaksi yang dibatalkan (VOID) sebelum dibayar, lengkap dengan pelakunya. */
export type VoidRecord = {
  id: string;
  at: number;
  kind: "rental" | "cafe";
  /** Nama unit TV atau meja kafe. */
  sourceName: string;
  console?: ConsoleType;
  customerName?: string;
  customerPhone?: string;
  minutes?: number;
  rentalTotal: number;
  addonTotal?: number;
  fnbTotal: number;
  discount?: number;
  total: number;
  /** Jumlah yang sudah dibayar sebelum transaksi di-void. */
  paidBefore?: number;
  orders?: OrderItem[];
  reason: string;
  actorName?: string;
  actorRole?: string;
};


export type Rates = Record<string, number>;

/** Pengaturan notifikasi yang tampil di layar TV pelanggan. */
export type TvNotice = {
  warnMinutes: number;
  warnText: string;
  endText: string;
  countdownSec: number;
  blockTitle: string;
  blockText: string;
};

export const defaultTvNotice: TvNotice = {
  warnMinutes: 5,
  warnText:
    "Waktu bermain Anda tersisa 5 menit. Silahkan menghubungi Operator untuk penambahan waktu.",
  endText: "Waktu bermain Anda telah habis.",
  countdownSec: 10,
  blockTitle: "WAKTU BERMAIN HABIS",
  blockText: "Silahkan menghubungi Operator untuk penambahan waktu.",
};

type State = {
  /**
   * Store pemilik seluruh data di perangkat ini. Semua data hanya boleh dikirim
   * ke store ini; kalau perangkat masuk ke store lain, data lokal dibuang dulu.
   */
  storeId: string | null;
  stations: Station[];
  consoleTypes: string[];
  rates: Rates;
  consoleDiscounts: Record<string, ItemDiscount>;
  /** Sewa tambahan (Additional Rental) di luar konsol. */
  addonRentals: AddonRental[];
  menu: MenuItem[];
  /** Urutan menu baru menjadi manual setelah pengguna menggeser baris. */
  menuOrderMode: "auto-category-name" | "manual";
  menuCategories: string[];
  cafeTables: CafeTable[];
  paymentMethods: PaymentMethod[];
  packages: RentalPackage[];
  roundingRule: RoundingRule;
  defaultBonusMin: number;
  history: HistoryRecord[];
  /** Transaksi yang dibatalkan (VOID). */
  voids: VoidRecord[];
  customers: Customer[];
  bookings: Booking[];
  promotions: Promotion[];
  pointEntries: PointEntry[];
  pointsPerRupiah: number;
  playingCards: PlayingCard[];
  cardEntries: CardEntry[];
  /** Cadangan data Playing Card (maksimal 10 terbaru). */
  cardBackups: CardBackup[];
  cardPrice: number;
  cardDiscountPercent: number;
  cardMemberDiscountPercent: number;
  /** Mode pembaca kartu USB (keyboard): fokus otomatis + tangkap ketikan cepat. */
  cardUsbReaderMode: boolean;
  businessProfile: BusinessProfile;
  cashCategories: CashCategory[];
  cashGroups: CashGroup[];
  cashEntries: CashEntry[];
  shifts: CashShift[];
  /** Riwayat hari usaha (End of Day). */
  businessDays: BusinessDay[];
  /** Jam buka dan tutup operasional store, dipakai untuk batas hari usaha. */
  operatingHours: OperatingHours;
  /** Keluar otomatis saat menganggur dan alarm waktu habis. */
  sessionSecurity: SessionSecurity;
  /** Log book aktivitas non-transaksi. */
  logEntries: LogEntry[];
  tvNotice: TvNotice;
  /** Daftar printer store (struk, invoice, dapur, bar, laporan). */
  printers: PrinterConfig[];
  receiptLayout: DocLayout;
  invoiceLayout: DocLayout;
  /** Hak akses per level pengguna, diatur Installer. */
  rolePermissions: RolePermissions;

};


const STORAGE_KEY = "billing-ps-state-v1";
/** Penanda pengaturan penting yang memang diubah dari perangkat ini. */
const DIRTY_SETTINGS_KEY = "billing.settings-dirty-v1";
/**
 * Penanda bahwa pengaturan yang sudah berbeda dari bawaan pernah dicatat sekali
 * sebagai "diubah di perangkat ini". Tanpa ini, perangkat yang sudah mengatur
 * Printer sebelum pembaruan aplikasi tidak akan pernah mengirim pengaturannya.
 */
const DIRTY_SEED_KEY = "billing.settings-dirty-seed-v1";

/** JSON dengan urutan kunci tetap, supaya urutan kunci tidak dianggap berubah. */
function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableValue(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Pindahkan satu elemen array dari posisi `from` ke posisi `to`. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [row] = next.splice(from, 1);
  if (row !== undefined) next.splice(to, 0, row);
  return next;
}

const defaultState: State = {
  storeId: null,
  stations: [
    { id: "tv-1", name: "TV 01", console: "PS3", booth: "Booth 1", availability: "available", session: null },
    { id: "tv-2", name: "TV 02", console: "PS3", booth: "Booth 2", availability: "available", session: null },
    { id: "tv-3", name: "TV 03", console: "PS4", booth: "Booth 3", availability: "available", session: null },
    { id: "tv-4", name: "TV 04", console: "PS4", booth: "Booth 4", availability: "available", session: null },
    { id: "tv-5", name: "TV 05", console: "PS5", booth: "VIP 1", availability: "available", session: null },
    { id: "tv-6", name: "TV 06", console: "PS5", booth: "VIP 2", availability: "available", session: null },
  ],
  consoleTypes: ["PS3", "PS4", "PS5"],
  rates: { PS3: 5000, PS4: 8000, PS5: 12000 },
  consoleDiscounts: {},
  addonRentals: [],
  menu: [
    { id: "m1", name: "Air Mineral", price: 4000, category: "Minuman", printerId: "prt-bar" },
    { id: "m2", name: "Teh Botol", price: 6000, category: "Minuman", printerId: "prt-bar" },
    { id: "m3", name: "Kopi Hitam", price: 8000, category: "Coffee", printerId: "prt-bar" },
    { id: "m4", name: "Es Kopi Susu", price: 15000, category: "Coffee", printerId: "prt-bar" },
    { id: "m5", name: "Juice Jeruk", price: 14000, category: "Juice", printerId: "prt-bar" },
    { id: "m6", name: "Indomie Goreng", price: 10000, category: "Snack", printerId: "prt-kitchen" },
    { id: "m7", name: "Snack Ringan", price: 7000, category: "Snack", printerId: "prt-kitchen" },
    { id: "m8", name: "Nasi Goreng", price: 15000, category: "Main Course", printerId: "prt-kitchen" },
  ],
  menuOrderMode: "auto-category-name",
  menuCategories: ["Coffee", "Juice", "Minuman", "Snack", "Main Course"],
  cafeTables: [
    { id: "meja-1", name: "Meja 01", area: "Indoor", seats: 2, customerName: "", notes: "", openedAt: null, orders: [] },
    { id: "meja-2", name: "Meja 02", area: "Indoor", seats: 4, customerName: "", notes: "", openedAt: null, orders: [] },
    { id: "meja-3", name: "Meja 03", area: "Indoor", seats: 4, customerName: "", notes: "", openedAt: null, orders: [] },
    { id: "meja-4", name: "Meja 04", area: "Outdoor", seats: 4, customerName: "", notes: "", openedAt: null, orders: [] },
  ],

  paymentMethods: [
    { id: "pm-cash", name: "Cash", active: true },
    { id: "pm-qris", name: "QRIS", active: true },
    { id: "pm-giftcard", name: "Gift Card", active: true },
    { id: "pm-transfer", name: "Transfer Bank BCA", active: true },
    { id: "pm-transfer-mandiri", name: "Transfer Bank Mandiri", active: true },
    { id: "pm-compliment", name: "Compliment", active: true },
    { id: "pm-card", name: CARD_PAYMENT_NAME, active: true },
    { id: "pm-lainnya", name: "Lainnya", active: true },
  ],
  packages: [
    { id: "pkg-1", name: "1 Jam", durationMin: 60, price: 0, active: true },
    { id: "pkg-2", name: "2 Jam", durationMin: 120, price: 0, active: true },
    { id: "pkg-3", name: "3 Jam", durationMin: 180, price: 0, active: true },
  ],
  roundingRule: "minute",
  defaultBonusMin: 0,
  history: [],
  voids: [],
  customers: [],
  bookings: [],
  promotions: [],
  pointEntries: [],
  pointsPerRupiah: 10000,
  playingCards: [],
  cardEntries: [],
  cardBackups: [],
  cardPrice: 10000,
  cardDiscountPercent: 10,
  cardMemberDiscountPercent: 15,
  cardUsbReaderMode: true,
  businessProfile: DEFAULT_BUSINESS_PROFILE,
  cashCategories: [
    { id: "cc-lain", name: "Pendapatan Lain", direction: "in", payout: false, group: "Pendapatan Lain", active: true },
    { id: "cc-sewa-alat", name: "Sewa Stik / Alat", direction: "in", payout: false, group: "Pendapatan Lain", active: true },
    { id: "cc-modal-owner", name: "Tambah Kas dari Owner", direction: "in", payout: true, group: "Kas Owner", active: true },
    { id: CARD_TOPUP_CATEGORY_ID, name: "Top Up Playing Card", direction: "in", payout: true, group: "Playing Card", active: true },
    { id: CARD_SALE_CATEGORY_ID, name: "Penjualan Playing Card", direction: "in", payout: false, group: "Playing Card", active: true },
    { id: "cc-listrik", name: "Pembayaran Listrik", direction: "out", payout: false, group: "Operasional", active: true },
    { id: "cc-gas", name: "Pembelian Gas", direction: "out", payout: false, group: "Operasional", active: true },
    { id: "cc-belanja", name: "Belanja Bahan Kafe", direction: "out", payout: false, group: "Operasional", active: true },
    { id: "cc-gaji", name: "Gaji Karyawan", direction: "out", payout: false, group: "Gaji", active: true },
    { id: "cc-ambil-owner", name: "Pengambilan Uang Owner", direction: "out", payout: true, group: "Kas Owner", active: true },
    { id: BOOKING_DP_CATEGORY_ID, name: "DP Reservasi", direction: "in", payout: true, group: "DP Reservasi", active: true },
    { id: BOOKING_DP_USED_CATEGORY_ID, name: "DP Reservasi dipakai", direction: "out", payout: true, group: "DP Reservasi", active: true },
  ],
  cashGroups: [
    { id: "cg-in-lain", name: "Pendapatan Lain", direction: "in", active: true, sort: 0 },
    { id: "cg-in-owner", name: "Kas Owner", direction: "in", active: true, sort: 1 },
    { id: "cg-in-card", name: "Playing Card", direction: "in", active: true, sort: 2 },
    { id: "cg-in-dp", name: "DP Reservasi", direction: "in", active: true, sort: 3 },
    { id: "cg-out-ops", name: "Operasional", direction: "out", active: true, sort: 0 },
    { id: "cg-out-gaji", name: "Gaji", direction: "out", active: true, sort: 1 },
    { id: "cg-out-owner", name: "Kas Owner", direction: "out", active: true, sort: 2 },
    { id: "cg-out-dp", name: "DP Reservasi", direction: "out", active: true, sort: 3 },
  ],
  cashEntries: [],
  shifts: [],
  businessDays: [],
  operatingHours: DEFAULT_OPERATING_HOURS,
  sessionSecurity: DEFAULT_SESSION_SECURITY,
  logEntries: [],
  tvNotice: defaultTvNotice,
  printers: defaultPrinters,
  receiptLayout: defaultReceiptLayout,
  invoiceLayout: defaultInvoiceLayout,
  rolePermissions: {},

};

/** Catatan kas untuk top-up kartu: uang masuk, tapi bukan penghasilan. */
function cardTopupCashEntry(
  categories: CashCategory[],
  amount: number,
  cardNumber: string,
  stamp: number,
  payment = "Cash",
  actor?: string,
  link?: { cardId?: string; cardEntryId?: string },
): CashEntry | null {
  if (amount <= 0) return null;
  const category = resolveModuleCategory(categories, "card-topup");
  return {
    id: `cash-topup-${stamp}`,
    categoryId: category.id,
    categoryName: category.name,
    group: category.group,
    direction: "in",
    payout: category.payout,
    account: category.account,
    source: "card-topup",
    amount,
    payment,
    note: `Top up kartu ${cardNumber}`,
    createdAt: stamp,
    ...(actor ? { createdBy: actor } : {}),
    ...(link?.cardId ? { cardId: link.cardId } : {}),
    ...(link?.cardEntryId ? { cardEntryId: link.cardEntryId } : {}),
  };
}

/** Catatan kas untuk penjualan kartu baru: uang masuk dan jadi penghasilan. */
function cardSaleCashEntry(
  categories: CashCategory[],
  amount: number,
  cardNumber: string,
  stamp: number,
  payment = "Cash",
  actor?: string,
  link?: { cardId?: string; cardEntryId?: string },
): CashEntry | null {
  if (amount <= 0) return null;
  const category = resolveModuleCategory(categories, "card-sale");
  return {
    id: `cash-cardsale-${stamp}`,
    categoryId: category.id,
    categoryName: category.name,
    group: category.group,
    direction: "in",
    payout: category.payout,
    account: category.account,
    source: "card-sale",
    amount,
    payment,
    note: `Penjualan kartu ${cardNumber}`,
    createdAt: stamp,
    ...(actor ? { createdBy: actor } : {}),
    ...(link?.cardId ? { cardId: link.cardId } : {}),
    ...(link?.cardEntryId ? { cardEntryId: link.cardEntryId } : {}),
  };
}

export function formatRupiah(value: number) {
  return "Rp " + Math.round(value).toLocaleString("id-ID");
}

export function paidTotal(session: Session | null | undefined) {
  return (session?.settlements ?? []).reduce((sum, s) => sum + s.amount, 0);
}

/** Nama metode pembayaran tunai. */
export const CASH_METHOD = "Cash";

function cashOfRecord(record: HistoryRecord, within?: (stamp: number) => boolean) {
  if (record.payments?.length) {
    return record.payments
      .filter((p) => p.method === CASH_METHOD)
      // Uang tetap milik shift yang menerimanya, walau nota ditutup di shift berikutnya.
      .filter((p) => !within || within(p.at ?? record.paidAt ?? record.endAt))
      .reduce((sum, p) => sum + p.amount, 0);
  }
  return (record.payment ?? "") === CASH_METHOD ? record.total : 0;
}

export type ShiftSummary = {
  cashSales: number;
  otherRevenue: number;
  additionalCashIn: number;
  cardTopup: number;
  bookingDp: number;
  ownerDeposit: number;
  paidIn: number;
  paidOut: number;
  sales: number;
  expenses: number;
  expected: number;
};

/** Hitung posisi uang tunai laci untuk satu shift kasir. */
/**
 * Uang yang sudah diterima dari meja/unit yang belum lunas (DP/cicilan),
 * sehingga belum punya nota. Dipakai saat Close Out agar uang itu ikut
 * dikunci di shift penerimanya.
 */
export function pendingPaymentRecords(state: {
  stations: { id: string; name: string; console?: string; session?: { historyId?: string; paidAt?: number; settlements?: Settlement[] } | null }[];
  cafeTables?: { id: string; name: string; historyId?: string; paidAt?: number; settlements?: Settlement[] }[];
  history: HistoryRecord[];
}): HistoryRecord[] {
  const known = new Set(state.history.map((h) => h.id));
  const groups = [
    ...state.stations.map((s) => ({ id: s.id, name: s.name, historyId: s.session?.historyId, paidAt: s.session?.paidAt, settlements: s.session?.settlements })),
    ...(state.cafeTables ?? []).map((t) => ({ id: t.id, name: t.name, historyId: t.historyId, paidAt: t.paidAt, settlements: t.settlements })),
  ];
  const out: HistoryRecord[] = [];
  for (const g of groups) {
    if (!g.settlements?.length) continue;
    if (g.historyId && known.has(g.historyId)) continue;
    // Sudah lunas: notanya sudah ada di riwayat dengan seluruh pembayaran.
    if (g.paidAt) continue;
    const payments = g.settlements.flatMap((s) => settlementSplits(s));
    const last = g.settlements[g.settlements.length - 1]!.at;
    out.push({
      id: `pending-${g.id}`,
      stationName: g.name,
      endAt: last,
      paidAt: last,
      total: payments.reduce((sum, p) => sum + p.amount, 0),
      payments,
    } as unknown as HistoryRecord);
  }
  return out;
}

export function shiftSummary(
  shift: CashShift,
  history: HistoryRecord[],
  cashEntries: CashEntry[],
  until: number = Date.now(),
): ShiftSummary {
  // Shift yang sudah Close Out bersifat final: jangan hitung ulang.
  if (shift.closedAt && shift.snapshot) return shift.snapshot;
  const from = shift.openedAt;
  const to = shift.closedAt ?? until;
  const within = (stamp: number) => stamp >= from && stamp <= to;

  // Nota dengan rincian pembayaran dihitung per waktu uang diterima;
  // nota lama tanpa rincian tetap memakai waktu pelunasan.
  const sales = history.reduce((sum, h) => {
    if (h.payments?.length) return sum + cashOfRecord(h, within);
    return within(h.paidAt ?? h.endAt) ? sum + cashOfRecord(h) : sum;
  }, 0);

  const cash = cashEntries.filter(
    (e) => e.payment === CASH_METHOD && within(e.createdAt),
  );
  const sum = (pick: (e: CashEntry) => boolean) =>
    cash.filter(pick).reduce((s, e) => s + e.amount, 0);

  const acc = (e: CashEntry) => entryAccount(e);
  const src = (e: CashEntry) => entrySource(e);
  const cardSales = sum((e) => e.direction === "in" && acc(e) === "sales");
  const bookingDpUsed = sum((e) => e.direction === "out" && src(e) === "booking-dp-used");
  const otherRevenue = sum((e) => e.direction === "in" && acc(e) === "other");
  const cardTopup = sum((e) => e.direction === "in" && src(e) === "card-topup");
  const bookingDp = sum((e) => e.direction === "in" && src(e) === "booking-dp");
  const additionalCashIn = sum(
    (e) =>
      e.direction === "in" &&
      acc(e) === "payin" &&
      src(e) !== "card-topup" &&
      src(e) !== "booking-dp",
  );
  const ownerDeposit = sum(
    (e) => e.direction === "out" && acc(e) === "payout" && src(e) !== "booking-dp-used",
  );
  const paidIn = additionalCashIn + cardTopup + bookingDp;
  const paidOut = ownerDeposit + bookingDpUsed;
  const expenses = sum((e) => e.direction === "out" && acc(e) === "expense");
  // DP yang dipakai sudah berada di rincian pembayaran nota. Kurangi dari
  // penerimaan penjualan shift ini karena uang fisiknya masuk saat reservasi.
  const cashSales = Math.max(0, sales + cardSales - bookingDpUsed);
  const salesTotal = cashSales + otherRevenue;

  return {
    cashSales,
    otherRevenue,
    additionalCashIn,
    cardTopup,
    bookingDp,
    ownerDeposit,
    paidIn,
    paidOut,
    sales: salesTotal,
    expenses,
    expected:
      shift.startCash +
      cashSales +
      otherRevenue +
      additionalCashIn +
      cardTopup +
      bookingDp -
      expenses -
      ownerDeposit,
  };
}



export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function pausedMsTotal(session: Session, now: number) {
  const base = session.pausedMs ?? 0;
  return session.pausedAt ? base + Math.max(0, now - session.pausedAt) : base;
}

export function isPaused(session: Session) {
  return Boolean(session.pausedAt);
}

export function elapsedSeconds(session: Session, now: number) {
  return Math.max(
    0,
    Math.floor((now - session.startAt - pausedMsTotal(session, now)) / 1000),
  );
}

export function effectiveMinutes(session: Session) {
  return Math.max(0, session.durationMin + (session.bonusMin ?? 0));
}

export function remainingSeconds(session: Session, now: number) {
  if (session.mode === "open") return Infinity;
  return (
    effectiveMinutes(session) * 60 -
    elapsedSeconds(session, now) +
    Math.floor((session.timerOffsetMs ?? 0) / 1000)
  );
}

export function rentalMinutes(session: Session, now: number) {
  if (session.mode === "prepaid") return session.durationMin;
  return Math.max(1, Math.ceil(elapsedSeconds(session, now) / 60));
}

export function rentalTotal(session: Session, now: number) {
  return (session.rate * rentalMinutes(session, now)) / 60;
}

export function fnbTotal(session: Session) {
  return session.orders.reduce((sum, o) => sum + o.price * o.qty, 0);
}

export function discountTotal(session: Session, now: number) {
  const subtotal = rentalTotal(session, now) + fnbTotal(session);
  if (!session.discountType || !session.discountValue) return 0;
  const raw = session.discountType === "percent" ? subtotal * session.discountValue / 100 : session.discountValue;
  return Math.min(subtotal, session.discountMax ? Math.min(raw, session.discountMax) : raw);
}

export function billingTotal(session: Session, now: number) {
  return rentalTotal(session, now) + fnbTotal(session) - discountTotal(session, now);
}

export type PriceConfig = {
  consoleDiscounts: Record<string, ItemDiscount>;
  menu: MenuItem[];
  promotions: Promotion[];
  cardDiscountPercent: number;
  cardMemberDiscountPercent: number;
  addonRentals?: AddonRental[];
};

function fallbackCardPercent(cfg: PriceConfig, ctx: DiscountContext) {
  if (!ctx.card) return 0;
  return ctx.member ? cfg.cardMemberDiscountPercent : cfg.cardDiscountPercent;
}

/** Potongan harga khusus item sewa tambahan. */
export function addonDiscountTotal(
  addons: SessionAddon[] | undefined,
  hours: number,
  catalog: AddonRental[] | undefined,
  ctx: DiscountContext,
  fallbackPercent = 0,
) {
  return (addons ?? []).reduce((sum, addon) => {
    const base = addonAmount(addon, hours);
    const item = (catalog ?? []).find((a) => a.id === addon.addonId);
    const units =
      addon.mode === "hourly"
        ? Math.max(0, addon.qty) * addonHours(addon, hours)
        : Math.max(0, addon.qty);

    return sum + itemDiscountAmount(item?.discount, base, units, ctx, fallbackPercent);
  }, 0);
}

/** Tagihan satu sesi rental lengkap dengan semua potongan. */
export function sessionBill(
  session: Session,
  now: number,
  consoleType: ConsoleType,
  cfg: PriceConfig,
  ctx: DiscountContext,
  manual?: { type: DiscountType; value: number },
): BillBreakdown {
  const minutes = rentalMinutes(session, now);
  const hours = minutes / 60;
  const fallbackManual =
    session.discountType && session.discountValue
      ? { type: session.discountType, value: session.discountValue, max: session.discountMax }
      : undefined;
  const fallbackPercent = fallbackCardPercent(cfg, ctx);
  return computeBill({
    rental: rentalTotal(session, now),
    rentalHours: hours,
    ...(cfg.consoleDiscounts[consoleType] ? { rentalDiscount: cfg.consoleDiscounts[consoleType] } : {}),
    addon: addonsTotal(session.addons, hours),
    addonDiscount: addonDiscountTotal(
      session.addons,
      hours,
      cfg.addonRentals,
      ctx,
      fallbackPercent,
    ),
    orders: session.orders,
    menu: cfg.menu,
    ctx,
    promotions: cfg.promotions,
    now,
    fallbackPercent,
    ...(session.promoIds?.length ? { promoIds: session.promoIds } : {}),
    ...(manual && manual.value ? { manual } : fallbackManual ? { manual: fallbackManual } : {}),

  });
}

/** Tagihan satu meja kafe lengkap dengan semua potongan. */
export function cafeBill(
  orders: OrderItem[],
  now: number,
  cfg: PriceConfig,
  ctx: DiscountContext,
  manual?: { type: DiscountType; value: number },
  promoIds?: string[],
): BillBreakdown {
  return computeBill({
    rental: 0,
    rentalHours: 0,
    orders,
    menu: cfg.menu,
    ctx,
    promotions: cfg.promotions,
    now,
    fallbackPercent: fallbackCardPercent(cfg, ctx),
    ...(promoIds?.length ? { promoIds } : {}),
    ...(manual && manual.value ? { manual } : {}),

  });
}

export type StationStatus = "idle" | "booked" | "playing" | "timeup" | "maintenance" | "offline";

export const BOOKING_LEAD_MS = 2 * 60 * 60 * 1000;
/** Toleransi check-in: paling cepat 1 jam sebelum jam booking. */
export const CHECKIN_LEAD_MS = 60 * 60 * 1000;

export function canCheckIn(booking: { startAt: number; endAt: number }, now: number) {
  return now >= booking.startAt - CHECKIN_LEAD_MS && now <= booking.endAt;
}

export function bookingMinutes(booking: { startAt: number; endAt: number }) {
  return Math.max(15, Math.round((booking.endAt - booking.startAt) / 60000));
}

export function activeBooking(bookings: Booking[], stationId: string, now: number) {
  return bookings
    .filter(
      (item) =>
        item.stationId === stationId &&
        item.status !== "cancelled" &&
        item.status !== "completed" &&
        item.endAt >= now &&
        item.startAt - BOOKING_LEAD_MS <= now,
    )
    .sort((a, b) => a.startAt - b.startAt)[0];
}

export function stationStatus(
  station: Station,
  now: number,
  bookings: Booking[] = [],
): StationStatus {
  if (!station.session && station.availability !== "available") return station.availability;
  if (!station.session) {
    return activeBooking(bookings, station.id, now) ? "booked" : "idle";
  }
  if (station.session.mode === "open") return "playing";
  return remainingSeconds(station.session, now) <= 0 ? "timeup" : "playing";
}

function migrateState(raw: unknown): State {
  const parsed = typeof raw === "object" && raw ? (raw as Partial<State>) : {};
  return {
    ...defaultState,
    ...parsed,
    stations: (parsed.stations ?? defaultState.stations).map((station, index) => ({
      ...station,
      booth: station.booth ?? `Booth ${index + 1}`,
      availability: station.availability ?? "available",
      session: station.session
        ? {
            ...station.session,
            customerName: station.session.customerName ?? "Umum",
            customerPhone: station.session.customerPhone ?? "",
            member: station.session.member ?? false,
            packageName: station.session.packageName ?? (station.session.mode === "open" ? "Open Time" : `${station.session.durationMin} Menit`),
            notes: station.session.notes ?? "",
            bonusMin: station.session.bonusMin ?? 0,
          }
        : null,
    })),
    rates: parsed.rates ?? defaultState.rates,
    consoleDiscounts: parsed.consoleDiscounts ?? defaultState.consoleDiscounts,
    addonRentals: (parsed.addonRentals ?? defaultState.addonRentals).map((item) => ({
      ...item,
      mode: item.mode === "once" ? ("once" as const) : ("hourly" as const),
      active: item.active ?? true,
    })),
    consoleTypes:
      parsed.consoleTypes && parsed.consoleTypes.length
        ? parsed.consoleTypes
        : Object.keys(parsed.rates ?? defaultState.rates),
    menu: (parsed.menu ?? defaultState.menu).map((item) => ({
      ...item,
      category: item.category?.trim() ? item.category : "Lainnya",
    })),
    menuCategories: (() => {
      const fromItems = (parsed.menu ?? []).map((m) => m.category).filter(Boolean) as string[];
      const base = parsed.menuCategories?.length ? parsed.menuCategories : defaultState.menuCategories;
      return Array.from(new Set([...base, ...fromItems]));
    })(),
    cafeTables: (parsed.cafeTables ?? defaultState.cafeTables).map((table, index) => ({
      ...table,
      name: table.name ?? `Meja ${String(index + 1).padStart(2, "0")}`,
      area: table.area ?? "Indoor",
      seats: table.seats ?? 2,
      customerName: table.customerName ?? "",
      notes: table.notes ?? "",
      openedAt: table.openedAt ?? null,
      orders: table.orders ?? [],
    })),
    paymentMethods: (() => {
      let list = parsed.paymentMethods ?? defaultState.paymentMethods;
      // Transfer bank dipisah per bank: BCA dan Mandiri.
      list = list.map((p) =>
        p.name.trim().toLowerCase() === "transfer bank"
          ? { ...p, name: "Transfer Bank BCA" }
          : p,
      );
      if (!list.some((p) => p.name.trim().toLowerCase() === "transfer bank mandiri")) {
        list = [...list, { id: "pm-transfer-mandiri", name: "Transfer Bank Mandiri", active: true }];
      }
      return list.some((p) => p.name === CARD_PAYMENT_NAME)
        ? list
        : [...list, { id: "pm-card", name: CARD_PAYMENT_NAME, active: true }];
    })(),
    packages: parsed.packages ?? defaultState.packages,
    roundingRule: parsed.roundingRule ?? defaultState.roundingRule,
    defaultBonusMin: parsed.defaultBonusMin ?? defaultState.defaultBonusMin,
    customers: parsed.customers ?? defaultState.customers,
    bookings: parsed.bookings ?? defaultState.bookings,
    promotions: parsed.promotions ?? defaultState.promotions,
    pointEntries: parsed.pointEntries ?? defaultState.pointEntries,
    pointsPerRupiah: parsed.pointsPerRupiah ?? defaultState.pointsPerRupiah,
    playingCards: parsed.playingCards ?? defaultState.playingCards,
    cardEntries: parsed.cardEntries ?? defaultState.cardEntries,
    cardBackups: parsed.cardBackups ?? defaultState.cardBackups,
    cardPrice: parsed.cardPrice ?? defaultState.cardPrice,
    cardDiscountPercent: parsed.cardDiscountPercent ?? defaultState.cardDiscountPercent,
    cardMemberDiscountPercent:
      parsed.cardMemberDiscountPercent ?? defaultState.cardMemberDiscountPercent,
    cardUsbReaderMode: parsed.cardUsbReaderMode ?? defaultState.cardUsbReaderMode,
    businessProfile: {
      modules: { ...DEFAULT_BUSINESS_PROFILE.modules, ...(parsed.businessProfile?.modules ?? {}) },
      salesLabels: { ...DEFAULT_BUSINESS_PROFILE.salesLabels, ...(parsed.businessProfile?.salesLabels ?? {}) },
      unitLabel: parsed.businessProfile?.unitLabel?.trim() || DEFAULT_BUSINESS_PROFILE.unitLabel,
    },
    cashCategories: (() => {
      const list = (parsed.cashCategories?.length
        ? parsed.cashCategories
        : defaultState.cashCategories
      ).map((item) => ({
        ...item,
        group: item.group?.trim() ? item.group : "Lainnya",
        payout: Boolean(item.payout),
        active: item.active ?? true,
      }));
      for (const id of [
        CARD_TOPUP_CATEGORY_ID,
        BOOKING_DP_CATEGORY_ID,
        BOOKING_DP_USED_CATEGORY_ID,
      ]) {
        if (list.some((item) => item.id === id)) continue;
        const preset = defaultState.cashCategories.find((item) => item.id === id);
        if (preset) list.push(preset);
      }
      return list;
    })(),
    cashGroups: (() => {
      if (parsed.cashGroups?.length) {
        const rows = parsed.cashGroups.map((row, index) => ({
          ...row,
          name: row.name?.trim() ? row.name.trim() : "Lainnya",
          active: row.active ?? true,
          sort: row.sort ?? index,
        }));
        for (const direction of ["in", "out"] as const) {
          if (
            rows.some(
              (row) =>
                row.direction === direction &&
                row.name.toLowerCase() === "dp reservasi",
            )
          )
            continue;
          rows.push({
            id: `cg-${direction}-dp`,
            name: "DP Reservasi",
            direction,
            active: true,
            sort: rows.length,
          });
        }
        return rows;
      }
      const source = parsed.cashCategories?.length
        ? parsed.cashCategories
        : defaultState.cashCategories;
      const rows: CashGroup[] = [];
      const seen = new Set<string>();
      for (const item of [...defaultState.cashCategories, ...source]) {
        const name = item.group?.trim() ? item.group.trim() : "Lainnya";
        const key = `${item.direction}::${name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          id: `cash-group-${rows.length}-${item.direction}`,
          name,
          direction: item.direction,
          active: true,
          sort: rows.length,
        });
      }
      return rows;
    })(),
    cashEntries: parsed.cashEntries ?? defaultState.cashEntries,
    shifts: parsed.shifts ?? defaultState.shifts,
    businessDays: parsed.businessDays ?? defaultState.businessDays,
    operatingHours: normalizeHours(parsed.operatingHours),
    sessionSecurity: normalizeSessionSecurity(parsed.sessionSecurity),
    logEntries: parsed.logEntries ?? defaultState.logEntries,
    tvNotice: { ...defaultTvNotice, ...(parsed.tvNotice ?? {}) },
    printers: parsed.printers?.length ? parsed.printers : defaultPrinters,
    receiptLayout: { ...defaultReceiptLayout, ...(parsed.receiptLayout ?? {}) },
    invoiceLayout: { ...defaultInvoiceLayout, ...(parsed.invoiceLayout ?? {}) },
    rolePermissions: parsed.rolePermissions ?? {},



  };
}

type Ctx = State & {
  now: number;
  /** Shift kasir yang sedang terbuka (null bila belum check-in). */
  activeShift: CashShift | null;
  /** True bila ada shift terbuka; transaksi uang hanya boleh saat true. */
  shiftOpen: boolean;
  startSession: (
    stationId: string,
    mode: PlayMode,
    durationMin: number,
    details?: Partial<Pick<Session, "customerName" | "customerPhone" | "member" | "packageName" | "notes" | "bonusMin" | "customerId" | "bookingId" | "promoName" | "discountType" | "discountValue" | "discountMax">>,
  ) => void;
  stopSession: (stationId: string, payment?: string, amountPaid?: number, payments?: PaymentSplit[]) => HistoryRecord | null;
  settleSession: (
    stationId: string,
    input: { payment?: string; payments?: PaymentSplit[]; amount: number; amountPaid: number },
  ) => Settlement | null;
  removeSettlement: (stationId: string, settlementId: string) => void;

  addTime: (stationId: string, extraMin: number) => void;
  adjustBonusTime: (stationId: string, deltaMin: number) => void;
  setSessionBonus: (stationId: string, bonusMin: number) => void;
  updateSessionCustomer: (
    stationId: string,
    patch: { customerName?: string; customerPhone?: string; member?: boolean; customerId?: string | undefined },
  ) => void;
  pauseSession: (stationId: string) => void;
  resumeSession: (stationId: string) => void;
  /** Pindahkan sesi (beserta pesanan & pembayaran) ke unit TV lain yang kosong. */
  moveSession: (fromStationId: string, toStationId: string, newConsole?: string) => boolean;
  /** Pindahkan isi meja kafe (pesanan & pelanggan) ke meja lain yang kosong. */
  moveCafeTable: (fromTableId: string, toTableId: string) => boolean;
  /** Gabungkan tagihan beberapa TV lain ke satu TV induk. */
  mergeStations: (parentStationId: string, childStationIds: string[]) => boolean;
  /** Lepas kembali semua TV yang digabung ke TV induk ini. */
  unmergeStations: (parentStationId: string) => void;
  /** Titipkan pesanan meja kafe ke sesi TV induk, lalu meja dikosongkan. */
  linkCafeTable: (parentStationId: string, tableId: string) => boolean;
  /** Gabungkan pesanan meja kafe lain ke satu meja induk. */
  mergeCafeTables: (parentTableId: string, childTableIds: string[]) => boolean;
  /** Lepas kembali semua pesanan titipan di meja induk ini ke asalnya. */
  unmergeCafeTables: (parentTableId: string) => void;
  /** Titipkan pesanan sesi TV ke meja kafe (rental tetap dibayar di panel TV). */
  linkStationToTable: (tableId: string, stationId: string) => boolean;
  /** Berikan satu promo ke sesi TV atau meja kafe. */
  givePromo: (target: { type: "station" | "table"; id: string }, promoId: string) => boolean;
  /** Batalkan promo yang sudah diberikan. */
  cancelPromo: (target: { type: "station" | "table"; id: string }, promoId: string) => void;



  setDefaultBonusMin: (minutes: number) => void;
  setTvNotice: (patch: Partial<TvNotice>) => void;
  addPrinter: (init?: Partial<Omit<PrinterConfig, "id">>) => void;
  updatePrinter: (id: string, patch: Partial<Omit<PrinterConfig, "id">>) => void;
  removePrinter: (id: string) => void;
  setReceiptLayout: (patch: Partial<DocLayout>) => void;
  setInvoiceLayout: (patch: Partial<DocLayout>) => void;
  setRolePermissions: (role: string, keys: string[]) => void;
  addOrder: (
    stationId: string,
    item: MenuItem,
    qty: number,
    mods?: string[],
    priceAdd?: number,
  ) => void;
  removeOrder: (stationId: string, orderId: string) => void;
  setRates: (rates: Rates) => void;
  setStationConsole: (stationId: string, console: ConsoleType) => void;
  /** Ganti konsol sesi berjalan; tarif ikut berubah. Sesi lunas hanya boleh naik tarif (selisih jadi tagihan baru). */
  changeSessionConsole: (stationId: string, console: ConsoleType) => "ok" | "downgrade-paid" | "invalid";
  addConsoleType: (name: string, rate: number) => boolean;
  renameConsoleType: (oldName: string, newName: string) => boolean;
  setConsoleRate: (name: string, rate: number) => void;
  setConsoleDiscount: (name: string, patch: Partial<ItemDiscount>) => void;
  setSessionDiscount: (
    stationId: string,
    patch: { type?: DiscountType; value?: number },
  ) => void;
  removeConsoleType: (name: string) => boolean;
  updateStation: (stationId: string, patch: Partial<Omit<Station, "id" | "session">>) => void;
  addStation: (init?: {
    name?: string;
    console?: ConsoleType;
    booth?: string;
  }) => void;
  removeStation: (stationId: string) => void;
  reorderList: (
    list:
      | "stations"
      | "cafeTables"
      | "menu"
      | "packages"
      | "paymentMethods"
      | "addonRentals"
      | "cashGroups",
    activeId: string,
    overId: string,
    orderedIds?: string[],
  ) => void;
  addAddonRental: (name: string, price: number, mode: AddonMode) => boolean;
  updateAddonRental: (id: string, patch: Partial<Omit<AddonRental, "id">>) => void;
  setAddonDiscount: (id: string, patch: Partial<ItemDiscount>) => void;
  removeAddonRental: (id: string) => void;
  addSessionAddon: (stationId: string, addonId: string, qty?: number, minutes?: number) => void;
  updateSessionAddon: (
    stationId: string,
    rowId: string,
    patch: { qty?: number; minutes?: number },
  ) => void;
  removeSessionAddon: (stationId: string, rowId: string) => void;

  reorderConsoleTypes: (activeName: string, overName: string) => void;
  reorderMenuCategories: (activeName: string, overName: string) => void;
  addMenuItem: (name: string, price: number, category?: string) => void;
  updateMenuItem: (id: string, patch: Partial<Omit<MenuItem, "id">>) => void;
  removeMenuItem: (id: string) => void;
  addMenuCategory: (name: string) => boolean;
  renameMenuCategory: (oldName: string, newName: string) => boolean;
  removeMenuCategory: (name: string) => boolean;
  addCafeTable: (init?: { name?: string; area?: string; seats?: number }) => void;
  updateCafeTable: (tableId: string, patch: Partial<Omit<CafeTable, "id" | "orders">>) => void;
  removeCafeTable: (tableId: string) => boolean;
  openCafeTable: (tableId: string, customerName?: string, notes?: string) => void;
  addCafeOrder: (
    tableId: string,
    item: MenuItem,
    qty: number,
    mods?: string[],
    priceAdd?: number,
  ) => void;
  removeCafeOrder: (tableId: string, orderId: string) => void;
  /** Bayar hanya item pesanan yang dipilih (di meja kafe atau sesi TV). */
  payOrderItems: (
    source: { type: "table" | "station"; id: string },
    orderIds: string[],
    input: {
      payment?: string;
      payments?: PaymentSplit[];
      amountPaid?: number;
      member?: boolean;
    },
  ) => HistoryRecord | null;
  /** Pindahkan item pesanan terpilih ke meja kafe atau TV lain. */
  transferOrders: (
    from: { type: "table" | "station"; id: string },
    to: { type: "table" | "station"; id: string },
    orderIds: string[],
  ) => boolean;

  clearCafeTable: (tableId: string) => void;
  /** Batalkan (VOID) sesi rental yang sedang berjalan beserta pesanannya. */
  voidSession: (stationId: string, reason: string) => VoidRecord | null;
  /** Batalkan (VOID) seluruh pesanan satu meja kafe. */
  voidCafeTable: (tableId: string, reason: string) => VoidRecord | null;
  payCafeTable: (
    tableId: string,
    input: {
      payment?: string;
      payments?: PaymentSplit[];
      amountPaid?: number;
      member?: boolean;
      discount?: { type: DiscountType; value: number };
    },
  ) => HistoryRecord | null;
  /** Terima pembayaran sebagian (DP) untuk meja kafe. */
  settleCafeTable: (
    tableId: string,
    input: { payment?: string; payments?: PaymentSplit[]; amount: number; amountPaid: number },
  ) => Settlement | null;
  /** Batalkan satu pembayaran meja kafe yang belum menjadi nota. */
  removeCafeSettlement: (tableId: string, settlementId: string) => void;
  /**
   * Batalkan hanya sisa tagihan meja kafe. Bagian yang sudah dibayar tetap
   * tercatat sebagai nota; meja tetap terisi sampai sesi diakhiri.
   */
  cancelCafeRemainder: (tableId: string) => HistoryRecord | null;


  addPaymentMethod: (name: string) => void;
  updatePaymentMethod: (id: string, patch: Partial<Omit<PaymentMethod, "id">>) => void;
  removePaymentMethod: (id: string) => void;
  addPackage: (name: string, durationMin: number, price: number) => void;
  updatePackage: (id: string, patch: Partial<Omit<RentalPackage, "id">>) => void;
  removePackage: (id: string) => void;
  setRoundingRule: (rule: RoundingRule) => void;
  addCustomer: (input: Pick<Customer, "name" | "phone" | "member" | "level">) => Customer;
  updateCustomer: (id: string, patch: Partial<Omit<Customer, "id" | "createdAt">>) => void;
  removeCustomer: (id: string) => void;
  adjustPoints: (customerId: string, points: number, reason: string) => void;
  setPointsPerRupiah: (value: number) => void;
  buyPlayingCard: (input: {
    cardNumber: string;
    cardCode?: string;
    cardUid?: string;
    customerName?: string;
    customerPhone?: string;
    customerId?: string;
    member?: boolean;
    topup?: number;
    price?: number;
    payment?: string;
  }) => PlayingCard | null;
  updatePlayingCard: (
    id: string,
    patch: Partial<Omit<PlayingCard, "id" | "createdAt" | "balance">>,
  ) => void;
  removePlayingCard: (id: string) => void;
  topupCard: (id: string, amount: number, note?: string, payment?: string) => boolean;
  adjustCardBalance: (id: string, amount: number, note: string) => boolean;
  chargeCard: (id: string, amount: number, note: string) => boolean;
  setCardPrice: (value: number) => void;
  setCardDiscountPercent: (value: number) => void;
  setCardMemberDiscountPercent: (value: number) => void;
  setBusinessProfile: (patch: {
    modules?: Partial<BusinessProfile["modules"]>;
    salesLabels?: Partial<BusinessProfile["salesLabels"]>;
    unitLabel?: string;
  }) => void;
  setCardUsbReaderMode: (value: boolean) => void;
  /** Buat cadangan data Playing Card sekarang. */
  createCardBackup: (source?: "manual" | "closing") => CardBackup | null;
  /** Pulihkan data kartu dari cadangan tersimpan. */
  restoreCardBackup: (id: string, mode: "replace" | "merge") => boolean;
  /** Pulihkan data kartu dari isi berkas cadangan. */
  restoreCardBackupData: (
    data: { cards: PlayingCard[]; entries: CardEntry[] },
    mode: "replace" | "merge",
    label?: string,
  ) => boolean;
  /** Hapus satu cadangan data kartu. */
  removeCardBackup: (id: string) => void;
  addBooking: (input: Omit<Booking, "id" | "status">) => boolean;
  updateBooking: (id: string, patch: Partial<Omit<Booking, "id">>) => boolean;
  removeBooking: (id: string) => void;
  addPromotion: (input: Omit<Promotion, "id">) => void;
  updatePromotion: (id: string, patch: Partial<Omit<Promotion, "id">>) => void;
  removePromotion: (id: string) => void;
  updateHistoryPayment: (id: string, patch: { payment?: string; payments?: PaymentSplit[] }) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
  resetTransactions: () => void;
  addCashCategory: (input: {
    name: string;
    direction: CashDirection;
    payout?: boolean;
    account?: CashAccount;
    group?: string;
  }) => CashCategory | null;
  updateCashCategory: (id: string, patch: Partial<Omit<CashCategory, "id">>) => void;
  removeCashCategory: (id: string) => void;
  addCashGroup: (input: { name: string; direction: CashDirection }) => CashGroup | null;
  updateCashGroup: (id: string, patch: Partial<Omit<CashGroup, "id" | "direction">>) => void;
  removeCashGroup: (id: string) => boolean;
  addCashEntry: (input: {
    categoryId: string;
    /** Bila diisi, item diambil dari Account Mapping modul ini. */
    source?: ModuleSource;
    amount: number;
    payment?: string;
    note?: string;
    createdAt?: number;
  }) => CashEntry | null;
  updateCashEntry: (
    id: string,
    patch: { amount?: number; payment?: string; note?: string; categoryId?: string },
  ) => void;
  removeCashEntry: (id: string) => void;
  exportSnapshot: () => BillingSnapshot;
  openShift: (input: {
    cashierName: string;
    cashierId?: string;
    startCash: number;
  }) => CashShift | null;
  closeShift: (
    id: string,
    input: { cashActual: number; balanceNote?: string; nextStartCash?: number },
  ) => CashShift | null;
  /** Hari usaha yang sedang berjalan (null bila belum ada check-in). */
  activeBusinessDay: BusinessDay | null;
  /** Jalankan End of Day untuk menutup hari usaha yang sedang berjalan. */
  closeBusinessDay: (input?: { note?: string }) => BusinessDay | null;
  /** Ubah jam buka/tutup operasional store. */
  setOperatingHours: (patch: Partial<OperatingHours>) => void;
  /** Ubah pengaturan keluar otomatis & alarm waktu habis. */
  setSessionSecurity: (patch: Partial<SessionSecurity>) => void;
  replaceAll: (data: unknown) => void;

  resetAll: () => void;
  /** Catat satu aktivitas ke laporan Log Book. */
  addLog: (action: string, detail?: string) => void;
  sync: SyncStatus;
};

export type BillingSnapshot = State;

type LogInfo = { action: string; detail?: string; coalesce?: boolean };
type LogDescriber = (
  args: unknown[],
  state: State,
  result: unknown,
) => LogInfo | null;

const txt = (value: unknown) => {
  if (typeof value === "boolean") return value ? "aktif" : "nonaktif";
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** Ringkas isi patch menjadi teks "kolom: nilai" untuk log book. */
const patchText = (patch: unknown) =>
  patch && typeof patch === "object"
    ? Object.entries(patch as Record<string, unknown>)
        .map(([key, value]) => `${key} → ${txt(value)}`)
        .join(", ")
    : "";

const nameById = (
  list: readonly { id: string; name?: string }[] | undefined,
  id: unknown,
) => list?.find((row) => row.id === id)?.name ?? String(id ?? "");

/**
 * Aktivitas non-transaksi yang otomatis tercatat ke Log Book. Kunci = nama
 * fungsi di context; nilai = cara menuliskan aktivitasnya. `coalesce` dipakai
 * untuk kolom angka/teks yang berubah tiap ketikan agar log tidak membanjir.
 */
const LOG_DESCRIBERS: Record<string, LogDescriber> = {
  moveSession: (a, s, r) =>
    r === false
      ? null
      : {
          action: "Pindah unit TV",
          detail: `${nameById(s.stations, a[0])} → ${nameById(s.stations, a[1])}${a[2] ? ` · konsol diganti ${txt(a[2])}` : ""}`,
        },
  moveCafeTable: (a, s, r) =>
    r === false
      ? null
      : {
          action: "Pindah meja kafe",
          detail: `${nameById(s.cafeTables, a[0])} → ${nameById(s.cafeTables, a[1])}`,
        },
  // Pesanan yang dihapus kasir
  removeOrder: (a, s) => {
    const station = s.stations.find((row) => row.id === a[0]);
    const order = station?.session?.orders.find((o) => o.id === a[1]);
    return {
      action: "Hapus order",
      detail: `${station?.name ?? "-"} · ${order ? `${order.name} × ${order.qty}` : txt(a[1])}`,
    };
  },
  removeSessionAddon: (a, s) => {
    const station = s.stations.find((row) => row.id === a[0]);
    const addon = (station?.session?.addons ?? []).find((x) => x.id === a[1]);
    return {
      action: "Hapus additional rental",
      detail: `${station?.name ?? "-"} · ${addon ? `${addon.name} × ${addon.qty}` : txt(a[1])}`,
    };
  },
  removeCafeOrder: (a, s) => {
    const table = s.cafeTables.find((row) => row.id === a[0]);
    const order = table?.orders.find((o) => o.id === a[1]);
    return {
      action: "Hapus order meja kafe",
      detail: `${table?.name ?? "-"} · ${order ? `${order.name} × ${order.qty}` : txt(a[1])}`,
    };
  },

  // Menu kafe & kategorinya


  addMenuItem: (a) => ({ action: "Tambah menu kafe", detail: `${txt(a[0])} · ${txt(a[1])}` }),
  updateMenuItem: (a, s) => ({
    action: "Ubah menu kafe",
    detail: `${nameById(s.menu, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  addMenuCategory: (a, _s, r) =>
    r === false ? null : { action: "Tambah kategori menu kafe", detail: txt(a[0]) },
  renameMenuCategory: (a, _s, r) =>
    r === false
      ? null
      : { action: "Ubah nama kategori menu kafe", detail: `${txt(a[0])} → ${txt(a[1])}` },
  removeMenuCategory: (a, _s, r) =>
    r === false ? null : { action: "Hapus kategori menu kafe", detail: txt(a[0]) },
  reorderMenuCategories: () => ({ action: "Ubah urutan kategori menu kafe", coalesce: true }),

  // Paket rental
  addPackage: (a) => ({
    action: "Tambah paket rental",
    detail: `${txt(a[0])} · ${txt(a[1])} menit · ${txt(a[2])}`,
  }),
  updatePackage: (a, s) => ({
    action: "Ubah paket rental",
    detail: `${nameById(s.packages, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  removePackage: (a, s) => ({
    action: "Hapus paket rental",
    detail: nameById(s.packages, a[0]),
  }),

  // Konsol & tarif
  addConsoleType: (a, _s, r) =>
    r === false ? null : { action: "Tambah jenis konsol", detail: `${txt(a[0])} · ${txt(a[1])}/jam` },
  renameConsoleType: (a, _s, r) =>
    r === false ? null : { action: "Ubah nama konsol", detail: `${txt(a[0])} → ${txt(a[1])}` },
  removeConsoleType: (a, _s, r) =>
    r === false ? null : { action: "Hapus jenis konsol", detail: txt(a[0]) },
  setConsoleRate: (a) => ({
    action: "Ubah tarif konsol",
    detail: `${txt(a[0])} · ${txt(a[1])}/jam`,
    coalesce: true,
  }),
  setConsoleDiscount: (a) => ({
    action: "Ubah potongan harga konsol",
    detail: `${txt(a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  setRates: () => ({ action: "Ubah tarif per jam", coalesce: true }),

  // Additional Rental
  addAddonRental: (a, _s, r) =>
    r === false ? null : { action: "Tambah additional rental", detail: `${txt(a[0])} · ${txt(a[1])}` },
  updateAddonRental: (a, s) => ({
    action: "Ubah additional rental",
    detail: `${nameById(s.addonRentals, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  setAddonDiscount: (a, s) => ({
    action: "Ubah potongan additional rental",
    detail: `${nameById(s.addonRentals, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  removeAddonRental: (a, s) => ({
    action: "Hapus additional rental",
    detail: nameById(s.addonRentals, a[0]),
  }),

  // Unit TV
  addStation: (a) => ({
    action: "Tambah unit TV",
    detail: patchText(a[0]),
  }),
  updateStation: (a, s) => ({
    action: "Ubah unit TV",
    detail: `${nameById(s.stations, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  changeSessionConsole: (a, s) => ({
    action: "Ganti konsol sesi berjalan",
    detail: `${nameById(s.stations, a[0])} → ${txt(a[1])}`,
  }),
  setStationConsole: (a, s) => ({
    action: "Ubah konsol unit TV",
    detail: `${nameById(s.stations, a[0])} → ${txt(a[1])}`,
  }),

  // Meja kafe
  addCafeTable: (a) => ({ action: "Tambah meja kafe", detail: patchText(a[0]) }),
  updateCafeTable: (a, s) => ({
    action: "Ubah meja kafe",
    detail: `${nameById(s.cafeTables, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  removeCafeTable: (a, s, r) =>
    r === false ? null : { action: "Hapus meja kafe", detail: nameById(s.cafeTables, a[0]) },

  // Metode pembayaran
  addPaymentMethod: (a) => ({ action: "Tambah metode pembayaran", detail: txt(a[0]) }),
  updatePaymentMethod: (a, s) => ({
    action: "Ubah metode pembayaran",
    detail: `${nameById(s.paymentMethods, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  removePaymentMethod: (a, s) => ({
    action: "Hapus metode pembayaran",
    detail: nameById(s.paymentMethods, a[0]),
  }),

  // Pengaturan umum
  setRoundingRule: (a) => ({ action: "Ubah aturan pembulatan waktu", detail: txt(a[0]) }),
  setDefaultBonusMin: (a) => ({
    action: "Ubah waktu ekstra default",
    detail: `${txt(a[0])} menit`,
    coalesce: true,
  }),
  setTvNotice: (a) => ({
    action: "Ubah notifikasi layar TV",
    detail: patchText(a[0]),
    coalesce: true,
  }),
  setPointsPerRupiah: (a) => ({ action: "Ubah rasio poin", detail: txt(a[0]), coalesce: true }),
  setCardPrice: (a) => ({ action: "Ubah harga playing card", detail: txt(a[0]), coalesce: true }),
  setCardDiscountPercent: (a) => ({
    action: "Ubah potongan playing card",
    detail: `${txt(a[0])}%`,
    coalesce: true,
  }),
  setBusinessProfile: () => ({
    action: "Ubah modul & label akun store",
    detail: "",
    coalesce: true,
  }),
  setCardMemberDiscountPercent: (a) => ({
    action: "Ubah potongan member playing card",
    detail: `${txt(a[0])}%`,
    coalesce: true,
  }),
  setCardUsbReaderMode: (a) => ({
    action: "Ubah mode pembaca USB kartu",
    detail: a[0] ? "Aktif" : "Nonaktif",
  }),
  setReceiptLayout: (a) => ({
    action: "Ubah tata letak struk",
    detail: patchText(a[0]),
    coalesce: true,
  }),
  setInvoiceLayout: (a) => ({
    action: "Ubah tata letak invoice",
    detail: patchText(a[0]),
    coalesce: true,
  }),

  // Printer
  addPrinter: () => ({ action: "Tambah printer" }),
  updatePrinter: (a, s) => ({
    action: "Ubah pengaturan printer",
    detail: `${nameById(s.printers, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  removePrinter: (a, s) => ({ action: "Hapus printer", detail: nameById(s.printers, a[0]) }),

  // Pelanggan & poin
  addCustomer: (a) => ({ action: "Tambah pelanggan", detail: patchText(a[0]) }),
  updateCustomer: (a, s) => ({
    action: "Ubah data pelanggan",
    detail: `${nameById(s.customers, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  removeCustomer: (a, s) => ({
    action: "Hapus pelanggan",
    detail: nameById(s.customers, a[0]),
  }),
  adjustPoints: (a, s) => ({
    action: "Sesuaikan poin pelanggan",
    detail: `${nameById(s.customers, a[0])} · ${txt(a[1])} poin · ${txt(a[2])}`,
  }),

  // Playing card
  updatePlayingCard: (a) => ({
    action: "Ubah data playing card",
    detail: patchText(a[1]),
    coalesce: true,
  }),
  adjustCardBalance: (a, _s, r) =>
    r === false
      ? null
      : { action: "Sesuaikan saldo playing card", detail: `${txt(a[1])} · ${txt(a[2])}` },

  // Promo
  addPromotion: (a) => ({ action: "Tambah promo", detail: patchText(a[0]) }),
  updatePromotion: (a, s) => ({
    action: "Ubah promo",
    detail: `${nameById(s.promotions, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  removePromotion: (a, s) => ({ action: "Hapus promo", detail: nameById(s.promotions, a[0]) }),

  // Booking
  addBooking: (a, _s, r) => (r === false ? null : { action: "Tambah booking", detail: patchText(a[0]) }),
  updateBooking: (a, _s, r) =>
    r === false ? null : { action: "Ubah booking", detail: patchText(a[1]) },
  removeBooking: () => ({ action: "Hapus booking" }),

  // Kas
  addCashCategory: (a, _s, r) =>
    r === null ? null : { action: "Tambah kategori kas", detail: patchText(a[0]) },
  updateCashCategory: (a, s) => ({
    action: "Ubah kategori kas",
    detail: `${nameById(s.cashCategories, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  addCashGroup: (a, _s, r) =>
    r === null ? null : { action: "Tambah kategori kas", detail: patchText(a[0]) },
  updateCashGroup: (a, s) => ({
    action: "Ubah nama kategori kas",
    detail: `${nameById(s.cashGroups, a[0])} · ${patchText(a[1])}`,
    coalesce: true,
  }),
  removeCashGroup: (a, s, r) =>
    r === false ? null : { action: "Hapus kategori kas", detail: nameById(s.cashGroups, a[0]) },
  updateCashEntry: (a) => ({
    action: "Ubah catatan kas",
    detail: patchText(a[1]),
    coalesce: true,
  }),
};

// Pertahankan satu instance context saat Vite/HMR mengganti modul. Tanpa ini,
// Provider lama dan hook baru dapat memegang context berbeda lalu /auth blank.
const billingGlobal = globalThis as typeof globalThis & {
  __rentoplayBillingContext?: Context<Ctx | null>;
};
const BillingContext =
  billingGlobal.__rentoplayBillingContext ?? createContext<Ctx | null>(null);
billingGlobal.__rentoplayBillingContext = BillingContext;


export function BillingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(defaultState);
  const stateRef = useRef<State>(state);
  stateRef.current = state;
  const [now, setNow] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);
  // True hanya bila data lokal memang terbaca dari perangkat. Kalau false,
  // aplikasi berjalan dari isi bawaan sehingga tidak boleh mengirim pengaturan
  // penting (Jenis Konsol & Tarif) ke pusat sebelum menerima data store.
  const [storageLoaded, setStorageLoaded] = useState(false);
  const storageWarnedRef = useRef(false);
  // Pengaturan penting yang benar-benar diubah dari perangkat ini. Hanya kunci
  // di daftar ini yang boleh dikirim ke pusat, sehingga perangkat yang datanya
  // tergerus tidak pernah menimpa Jenis Konsol & Tarif store dengan bawaan.
  const dirtyRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DIRTY_SETTINGS_KEY);
      if (raw) dirtyRef.current = new Set(JSON.parse(raw) as string[]);
    } catch {
      /* penanda rusak: anggap belum ada perubahan lokal */
    }
  }, []);
  const [printerPrefs, setPrinterPrefs] = useState<Record<string, DevicePrinterPref>>({});
  useEffect(() => {
    const saved = loadDevicePrinterPrefs();
    // Perangkat lama: ambil cara cetak yang terakhir tampil sebagai milik perangkat ini.
    if (Object.keys(saved).length === 0) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const printers = raw ? (JSON.parse(raw)?.printers as PrinterConfig[] | undefined) : undefined;
        for (const p of printers ?? []) {
          if (p?.id && (p.mode || p.bluetoothAddress))
            saved[p.id] = { mode: p.mode, bluetoothAddress: p.bluetoothAddress };
        }
        if (Object.keys(saved).length) saveDevicePrinterPrefs(saved);
      } catch {
        /* abaikan */
      }
    }
    setPrinterPrefs(saved);
  }, []);
  const markSettingsDirty = useCallback((...keys: string[]) => {
    for (const key of keys) dirtyRef.current.add(key);
    try {
      localStorage.setItem(DIRTY_SETTINGS_KEY, JSON.stringify([...dirtyRef.current]));
    } catch {
      /* penyimpanan penuh: cukup berlaku selama aplikasi terbuka */
    }
  }, []);


  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const loaded = migrateState(JSON.parse(raw));
        setState(loaded);
        setStorageLoaded(true);
        // Sekali saja: pengaturan yang isinya sudah berbeda dari bawaan aplikasi
        // dianggap memang diatur di perangkat ini, supaya tetap bisa dikirim ke
        // pusat setelah pembaruan aplikasi ini.
        if (!localStorage.getItem(DIRTY_SEED_KEY)) {
          const seeded: string[] = [];
          for (const key of SETTINGS_KEYS) {
            if (stableValue(loaded[key]) !== stableValue(defaultState[key])) seeded.push(key);
          }
          if (seeded.length) markSettingsDirty(...seeded);
          try {
            localStorage.setItem(DIRTY_SEED_KEY, "1");
          } catch {
            /* penyimpanan penuh: cukup berlaku selama aplikasi terbuka */
          }
        }
      }
    } catch {
      /* isi penyimpanan rusak: jalan dari bawaan, jangan tandai terbaca */
    }
    setHydrated(true);
  }, [markSettingsDirty]);

  useEffect(() => {
    if (!hydrated) return;
    const write = (value: State) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    };
    if (write(state)) {
      setStorageLoaded(true);
      return;
    }
    // Penyimpanan perangkat penuh: simpan ulang tanpa Log Book & riwayat lama
    // (keduanya tetap aman di pusat) supaya data hari ini tidak ikut hilang.
    const trimmed: State = {
      ...state,
      logEntries: state.logEntries.slice(-300),
      history: state.history.slice(-300),
    };
    const saved = write(trimmed);
    if (saved) setStorageLoaded(true);
    if (!storageWarnedRef.current) {
      storageWarnedRef.current = true;
      toast.warning(
        saved
          ? "Penyimpanan perangkat hampir penuh. Log Book dan riwayat lama di perangkat ini dipangkas — datanya tetap ada di laporan."
          : "Perangkat ini tidak bisa menyimpan data. Bersihkan penyimpanan browser lalu muat ulang halaman.",
      );
    }
  }, [state, hydrated]);

  // Timer is derived from stored timestamps, so a refresh, a device restart,
  // or an offline period never changes the elapsed time. We only need to keep
  // the displayed clock fresh and resync it whenever the tab wakes up.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    const resync = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, []);

  // Keep sessions consistent when the app is open in more than one tab/window.
  useEffect(() => {
    if (!hydrated) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        setState(migrateState(JSON.parse(event.newValue)));
      } catch {
        /* ignore corrupt payload from other tab */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated]);

  // Sesi yang tagihannya sudah lunas selalu punya nota di laporan, termasuk
  // sesi yang dilunasi sebelum fitur nota otomatis ada.
  useEffect(() => {
    if (!hydrated) return;
    setState((prev) => {
      const missing = prev.stations.filter((station) => {
        const session = station.session;
        if (!session) return false;
        const settlements = session.settlements ?? [];
        if (!settlements.length) return false;
        if (session.historyId && prev.history.some((h) => h.id === session.historyId))
          return false;
        const paid = settlements.reduce((sum, s) => sum + s.amount, 0);
        const methods = settlements.flatMap((s) =>
          s.payments?.length ? s.payments.map((p) => p.method) : [s.payment],
        );
        const at = settlements[settlements.length - 1]!.at;
        const bill = sessionBill(session, at, station.console, prev, {
          member: Boolean(session.member),
          card: methods.some((m) => m === CARD_PAYMENT_NAME),
        });
        return bill.total > 0 && paid + 0.5 >= bill.total;
      });
      if (!missing.length) return prev;
      const added: HistoryRecord[] = [];
      const stations = prev.stations.map((station) => {
        if (!missing.includes(station) || !station.session) return station;
        const session = station.session;
        const settlements = session.settlements ?? [];
        const at = settlements[settlements.length - 1]!.at;
        const methods = settlements.flatMap((s) =>
          s.payments?.length ? s.payments.map((p) => p.method) : [s.payment],
        );
        const bill = sessionBill(session, at, station.console, prev, {
          member: Boolean(session.member),
          card: methods.some((m) => m === CARD_PAYMENT_NAME),
        });
        const splits: PaymentSplit[] = settlements.flatMap((s) =>
          settlementSplits(s),
        );
        const historyId = session.historyId ?? `${station.id}-paid-${at}`;
        added.push({
          id: historyId,
          stationName: station.name,
          console: station.console,
          mode: session.mode,
          startAt: session.startAt,
          endAt: at,
          paidAt: at,
          ongoing: true,
          minutes: Math.ceil(elapsedSeconds(session, at) / 60),
          rentalTotal: bill.rental,
          ...(bill.addon ? { addonTotal: bill.addon } : {}),
          ...(session.addons?.length ? { addons: session.addons } : {}),
          fnbTotal: bill.fnb,
          total: bill.total,
          payment: Array.from(new Set(methods)).filter(Boolean).join(" + ") || "Cash",
          ...(splits.length > 0 ? { payments: splits } : {}),
          customerName: session.customerName,
          customerPhone: session.customerPhone,
          packageName: session.packageName,
          amountPaid: settlements.reduce((sum, s) => sum + s.amountPaid, 0),
          change: settlements.reduce((sum, s) => sum + s.change, 0),
          orders: session.orders,
          ...(session.customerId ? { customerId: session.customerId } : {}),
          ...(session.promoName || bill.promoName
            ? { promoName: session.promoName || bill.promoName }
            : {}),
          discount: bill.discount,
        });
        return { ...station, session: { ...session, historyId, paidAt: at } };
      });
      return { ...prev, stations, history: [...added, ...prev.history] };
    });
  }, [hydrated, state.stations, state.history]);




  const update = useCallback(
    (fn: (draft: State) => State) =>
      setState((prev) => {
        const next = fn(prev);
        // Catat pengaturan yang benar-benar berubah di perangkat ini. Hanya
        // pengaturan bertanda inilah yang boleh dikirim ke pusat, sehingga
        // perangkat lain tidak pernah menimpanya dengan isi bawaan.
        const touched: string[] = [];
        for (const key of SETTINGS_KEYS) {
          if (prev[key] === next[key]) continue;
          if (stableValue(prev[key]) === stableValue(next[key])) continue;
          touched.push(key);
        }
        if (touched.length) markSettingsDirty(...touched);
        return next;
      }),
    [markSettingsDirty],
  );

  const mapStation = useCallback(
    (stationId: string, fn: (s: Station) => Station) =>
      update((prev) => ({
        ...prev,
        stations: prev.stations.map((s) => (s.id === stationId ? fn(s) : s)),
      })),
    [update],
  );

  const startSession = useCallback<Ctx["startSession"]>(
    (stationId, mode, durationMin, details) =>
      mapStation(stationId, (s) => ({
        ...s,
        session: {
          mode,
          startAt: Date.now(),
          durationMin: mode === "prepaid" ? durationMin : 0,
          rate: 0,
          orders: [],
          customerName: details?.customerName || "Umum",
          customerPhone: details?.customerPhone || "",
          member: details?.member || false,
          packageName: details?.packageName || (mode === "open" ? "Open Time" : `${durationMin} Menit`),
          notes: details?.notes || "",
          bonusMin: mode === "prepaid" ? (details?.bonusMin ?? 0) : 0,
        },
      })),
    [mapStation],
  );

  // rate snapshot needs access to rates; wrap it
  const startSessionWithRate = useCallback<Ctx["startSession"]>(
    (stationId, mode, durationMin, details) =>
      update((prev) => {
        const startAt = Date.now();
        const paidHours = mode === "prepaid" ? durationMin / 60 : 0;
        // Promo bonus jam rental: jam tambahan tanpa menambah tagihan.
        const bonusPromo = autoPromosOfKind(prev.promotions, startAt, "bonusHours").find(
          (promo) => paidHours >= Math.max(0.25, promo.payHours ?? 0),
        );
        const promoBonusMin = bonusPromo ? Math.round((bonusPromo.bonusHours ?? 0) * 60) : 0;
        // Promo main X jam dapat menu gratis.
        const giftOrders: OrderItem[] = [];
        for (const promo of autoPromosOfKind(prev.promotions, startAt, "freeMenu")) {
          if (paidHours < Math.max(0.25, promo.minHours ?? 0)) continue;
          const gift = prev.menu.find((m) => m.id === promo.freeMenuId);
          if (gift) giftOrders.push(freeOrderLine(gift, promo.freeMenuQty ?? 1, promo.name));
        }
        const promoNames = [
          ...(details?.promoName ? [details.promoName] : []),
          ...(bonusPromo ? [bonusPromo.name] : []),
          ...giftOrders.map((o) => o.mods?.[0]?.split(": ")[1] ?? "").filter(Boolean),
        ];
        return {
        ...prev,
        stations: prev.stations.map((s) =>
          s.id === stationId
            ? {
                ...s,
                session: {
                  mode,
                  startAt,
                  durationMin: mode === "prepaid" ? durationMin : 0,
                  rate: prev.rates[s.console] ?? 0,
                  orders: giftOrders,
                    customerName: details?.customerName || "Umum",
                    customerPhone: details?.customerPhone || "",
                    member: details?.member || false,
                    packageName: details?.packageName || (mode === "open" ? "Open Time" : `${durationMin} Menit`),
                    notes: details?.notes || "",
                    bonusMin:
                      mode === "prepaid"
                        ? (details?.bonusMin ?? prev.defaultBonusMin ?? 0) + promoBonusMin
                        : 0,
                    ...(details?.customerId ? { customerId: details.customerId } : {}),
                    ...(details?.bookingId ? { bookingId: details.bookingId } : {}),
                    ...(promoNames.length ? { promoName: promoNames.join(" · ") } : {}),
                    ...(details?.discountType ? { discountType: details.discountType } : {}),
                    ...(details?.discountValue !== undefined ? { discountValue: details.discountValue } : {}),
                    ...(details?.discountMax !== undefined ? { discountMax: details.discountMax } : {}),
                },
              }
            : s,
        ),
        };
      }),
    [update],
  );
  void startSession;

  // Dihitung sebagai fungsi murni supaya hasilnya bisa dibaca langsung
  // (setState di React 18 tidak berjalan seketika).
  const computeStop = useCallback(
    (
      prevState: State,
      endAt: number,
      stationId: string,
      payment?: string,
      amountPaid?: number,
      payments?: PaymentSplit[],
    ): { record: HistoryRecord | null; next: State } => {
      let record: HistoryRecord | null = null;
      const next = ((prev: State): State => {
        const station = prev.stations.find((s) => s.id === stationId);
        if (!station?.session) return prev;
        const session = station.session;
        const methodsUsed = [
          ...(session.settlements ?? []).flatMap((s) =>
            s.payments?.length ? s.payments.map((p) => p.method) : [s.payment],
          ),
          ...(payments?.length ? payments.map((p) => p.method) : [payment ?? ""]),
        ];
        const usesCard = methodsUsed.some((m) => m === CARD_PAYMENT_NAME);
        const bill = sessionBill(session, endAt, station.console, prev, {
          member: Boolean(session.member),
          card: usesCard,
        });
        const rental = bill.rental;
        const fnb = bill.fnb;
        const discount = bill.discount;
        const total = bill.total;

        const prior = session.settlements ?? [];
        const priorPaid = prior.reduce((sum, s) => sum + s.amount, 0);
        const hasDirect = Boolean(payment) || Boolean(payments && payments.length);
        const directDue = Math.max(0, total - priorPaid);
        const directAmount = hasDirect ? directDue : 0;
        const directReceived = hasDirect
          ? payments && payments.length
            ? payments.reduce((sum, p) => sum + p.amount, 0)
            : amountPaid ?? directDue
          : 0;
        // Sesi hanya boleh diakhiri bila seluruh tagihan sudah lunas.
        if (priorPaid + (hasDirect ? directReceived : 0) + 0.5 < total) return prev;

        const methodNames = [
          ...prior.flatMap((s) => (s.payments?.length ? s.payments.map((p) => p.method) : [s.payment])),
          ...(hasDirect
            ? payments && payments.length
              ? payments.map((p) => p.method)
              : [payment || "Cash"]
            : []),
        ].filter(Boolean);
        const uniqueMethods = Array.from(new Set(methodNames));
        const allSplits: PaymentSplit[] = [
          ...prior.flatMap((s) => settlementSplits(s)),
          ...(hasDirect
            ? payments && payments.length
              ? payments.map((p) => ({ ...p, at: p.at ?? endAt }))
              : [{ method: payment || "Cash", amount: directAmount, at: endAt }]
            : []),
        ];
        const totalReceived =
          prior.reduce((sum, s) => sum + s.amountPaid, 0) + directReceived;
        const totalChange =
          prior.reduce((sum, s) => sum + s.change, 0) +
          Math.max(0, directReceived - directAmount);

        const pointsEarned = session.customerId && session.member
          ? Math.floor(total / Math.max(1, prev.pointsPerRupiah))
          : 0;
        const completedRecord: HistoryRecord = {
          id: session.historyId ?? `${stationId}-${endAt}`,
          stationName: station.name,
          console: station.console,
          mode: session.mode,
          startAt: session.startAt,
          endAt,
          paidAt: session.paidAt ?? endAt,
          ongoing: false,
          ...(actorRef.current.name ? { cashierName: actorRef.current.name } : {}),
          ...(deviceCode() ? { deviceCode: deviceCode() } : {}),
          minutes: Math.ceil(elapsedSeconds(session, endAt) / 60),
          rentalTotal: rental,
          ...(bill.addon ? { addonTotal: bill.addon } : {}),
          ...(session.addons?.length ? { addons: session.addons } : {}),
          fnbTotal: fnb,
          total,
          payment: uniqueMethods.join(" + ") || "Cash",
          ...(allSplits.length > 0 ? { payments: allSplits } : {}),
          customerName: session.customerName,
          customerPhone: session.customerPhone,
          packageName: session.packageName,
          amountPaid: totalReceived,
          change: totalChange,
          orders: session.orders,
          ...(session.customerId ? { customerId: session.customerId } : {}),
          ...(session.promoName || bill.promoName
            ? { promoName: session.promoName || bill.promoName }
            : {}),
          discount,
          pointsEarned,
        };

        record = completedRecord;
        const alreadyLogged = prev.history.some((h) => h.id === completedRecord.id);
        return {
          ...prev,
          history: alreadyLogged
            ? prev.history.map((h) => (h.id === completedRecord.id ? completedRecord : h))
            : [completedRecord, ...prev.history],

          customers: prev.customers.map((customer) => customer.id === session.customerId ? {
            ...customer,
            visits: customer.visits + 1,
            totalSpent: customer.totalSpent + total,
            points: customer.points + pointsEarned,
          } : customer),
          pointEntries: pointsEarned > 0 && session.customerId ? [{ id: `point-${endAt}`, customerId: session.customerId, points: pointsEarned, reason: `Transaksi ${station.name}`, createdAt: endAt }, ...prev.pointEntries] : prev.pointEntries,
          bookings: prev.bookings.map((booking) => booking.id === session.bookingId ? { ...booking, status: "completed" as const } : booking),
          stations: prev.stations.map((s) =>
            s.id === stationId ? { ...s, session: null } : s,
          ),
        };
      })(prevState);
      return { record, next };
    },
    [],
  );

  const stopSession = useCallback<Ctx["stopSession"]>(
    (stationId, payment, amountPaid, payments) => {
      const endAt = Date.now();
      const { record } = computeStop(
        stateRef.current,
        endAt,
        stationId,
        payment,
        amountPaid,
        payments,
      );
      if (!record) return null;
      setState(
        (prev) =>
          computeStop(prev, endAt, stationId, payment, amountPaid, payments).next,
      );
      return record;
    },
    [computeStop, setState],
  );

  const settleSession = useCallback<Ctx["settleSession"]>(
    (stationId, input) => {
      let created: Settlement | null = null;
      setState((prev) => {
        const station = prev.stations.find((s) => s.id === stationId);
        if (!station?.session) return prev;
        const at = Date.now();
        const amount = Math.max(0, Math.round(input.amount));
        const amountPaid = Math.max(0, Math.round(input.amountPaid));
        if (amount <= 0) return prev;
        const label =
          input.payments && input.payments.length
            ? Array.from(new Set(input.payments.map((p) => p.method))).join(" + ")
            : input.payment || "Cash";
        const settlement: Settlement = {
          id: `pay-${at}`,
          at,
          payment: label,
          ...(input.payments && input.payments.length ? { payments: input.payments } : {}),
          amount,
          amountPaid,
          change: Math.max(0, amountPaid - amount),
        };
        created = settlement;
        const settlements = [...(station.session.settlements ?? []), settlement];
        const paid = settlements.reduce((sum, s) => sum + s.amount, 0);
        const allMethods = settlements.flatMap((s) =>
          s.payments?.length ? s.payments.map((p) => p.method) : [s.payment],
        );
        const bill = sessionBill(station.session, at, station.console, prev, {
          member: Boolean(station.session.member),
          card: allMethods.some((m) => m === CARD_PAYMENT_NAME),
        });
        const fullyPaid = paid + 0.5 >= bill.total && bill.total > 0;
        const splits: PaymentSplit[] = settlements.flatMap((s) =>
          settlementSplits(s),
        );
        const historyId = station.session.historyId ?? `${stationId}-paid-${at}`;
        const sess = station.session;
        const receipt: HistoryRecord = {
          id: historyId,
          stationName: station.name,
          console: station.console,
          mode: sess.mode,
          startAt: sess.startAt,
          endAt: at,
          paidAt: at,
          ongoing: true,
          ...(actorRef.current.name ? { cashierName: actorRef.current.name } : {}),
          ...(deviceCode() ? { deviceCode: deviceCode() } : {}),
          minutes: Math.ceil(elapsedSeconds(sess, at) / 60),
          rentalTotal: bill.rental,
          ...(bill.addon ? { addonTotal: bill.addon } : {}),
          ...(sess.addons?.length ? { addons: sess.addons } : {}),
          fnbTotal: bill.fnb,
          total: bill.total,
          payment: Array.from(new Set(allMethods)).filter(Boolean).join(" + ") || "Cash",
          ...(splits.length > 0 ? { payments: splits } : {}),
          customerName: sess.customerName,
          customerPhone: sess.customerPhone,
          packageName: sess.packageName,
          amountPaid: settlements.reduce((sum, s) => sum + s.amountPaid, 0),
          change: settlements.reduce((sum, s) => sum + s.change, 0),
          orders: sess.orders,
          ...(sess.customerId ? { customerId: sess.customerId } : {}),
          ...(sess.promoName || bill.promoName
            ? { promoName: sess.promoName || bill.promoName }
            : {}),
          discount: bill.discount,
        };
        const existing = prev.history.some((h) => h.id === historyId);
        const history = fullyPaid
          ? existing
            ? prev.history.map((h) => (h.id === historyId ? { ...h, ...receipt } : h))
            : [receipt, ...prev.history]
          : prev.history;
        return {
          ...prev,
          history,
          stations: prev.stations.map((s) =>
            s.id === stationId && s.session
              ? {
                  ...s,
                  session: {
                    ...s.session,
                    settlements,
                    ...(fullyPaid ? { historyId, paidAt: at } : {}),
                  },
                }
              : s,
          ),
        };
      });

      return created;
    },
    [setState],
  );

  const removeSettlement = useCallback<Ctx["removeSettlement"]>(
    (stationId, settlementId) =>
      setState((prev) => {
        const station = prev.stations.find((s) => s.id === stationId);
        if (!station?.session) return prev;
        const settlements = (station.session.settlements ?? []).filter(
          (x) => x.id !== settlementId,
        );
        const historyId = station.session.historyId;
        // Nota otomatis dibatalkan bila pembayaran dihapus dan sesi masih berjalan.
        const history = historyId
          ? prev.history.filter((h) => !(h.id === historyId && h.ongoing))
          : prev.history;
        return {
          ...prev,
          history,
          stations: prev.stations.map((s) => {
            if (s.id !== stationId || !s.session) return s;
            const { historyId: _drop, paidAt: _drop2, ...rest } = s.session;
            return { ...s, session: { ...rest, settlements } };
          }),
        };
      }),
    [setState],
  );




  const addTime = useCallback<Ctx["addTime"]>(
    (stationId, extraMin) =>
      mapStation(stationId, (s) => {
        if (!s.session) return s;
        const at = Date.now();
        const overdueSeconds = Math.max(0, -remainingSeconds(s.session, at));
        const originalMode = s.session.mode;
        const baseDuration =
          originalMode === "open"
            ? Math.max(1, Math.ceil(elapsedSeconds(s.session, at) / 60))
            : s.session.durationMin;
        const nextDuration = Math.max(1, baseDuration + extraMin);
        return {
          ...s,
          session: {
            ...s.session,
            mode: "prepaid",
            // Tagihan hanya berubah sebesar tombol yang dipilih. Waktu lewat
            // setelah 00:00 bukan durasi berbayar dan tidak boleh ikut ditagih.
            durationMin: nextDuration,
            ...(originalMode === "prepaid" && extraMin > 0 && overdueSeconds > 0
              ? { timerOffsetMs: (s.session.timerOffsetMs ?? 0) + overdueSeconds * 1000 }
              : {}),
          },
        };
      }),
    [mapStation],
  );


  const addOrder = useCallback<Ctx["addOrder"]>(
    (stationId, item, qty, mods, priceAdd) =>
      update((prev) => ({
        ...prev,
        stations: prev.stations.map((s) =>
          s.id === stationId && s.session
            ? {
                ...s,
                session: {
                  ...s.session,
                  orders: mergeOrders(s.session.orders, [
                    {
                      id: `${item.id}-${Date.now()}`,
                      menuId: item.id,
                      name: item.name,
                      price: item.price + (priceAdd ?? 0),
                      qty,
                      ...(mods && mods.length > 0 ? { mods } : {}),
                    },
                    // Promo Buy One Get One: menu hadiah langsung ikut masuk.
                    ...bogoFreeOrders(prev.promotions, prev.menu, Date.now(), item, qty),
                  ]),
                },
              }
            : s,
        ),
      })),
    [update],
  );

  const removeOrder = useCallback<Ctx["removeOrder"]>(
    (stationId, orderId) =>
      mapStation(stationId, (s) =>
        s.session
          ? {
              ...s,
              session: {
                ...s.session,
                orders: s.session.orders.filter((o) => o.id !== orderId),
              },
            }
          : s,
      ),
    [mapStation],
  );

  const { session: authSession, fullName, user, role: authRole } = useAuth();

  // Siapa yang sedang memakai aplikasi, dipakai untuk mencatat log book.
  // Nama terakhir yang diketahui disimpan di perangkat supaya catatan tetap
  // bernama walau profil belum termuat atau pengguna baru saja keluar.
  const ACTOR_MARK = "billing.last-actor";
  const actorRef = useRef({ name: "", role: "" });
  const known = fullName.trim() || user?.email || "";
  if (known) {
    actorRef.current = { name: known, role: authRole || actorRef.current.role };
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(ACTOR_MARK, JSON.stringify(actorRef.current));
      } catch {
        /* penyimpanan tidak tersedia */
      }
    }
  } else if (!actorRef.current.name && typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(ACTOR_MARK);
      if (raw) actorRef.current = JSON.parse(raw) as { name: string; role: string };
    } catch {
      /* penanda rusak: biarkan kosong */
    }
  }

  /** Tambahkan satu baris log book ke state. */
  const withLog = useCallback((prev: State, action: string, detail = ""): State => ({
    ...prev,
    logEntries: [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: Date.now(),
        actor: actorRef.current.name,
        role: actorRef.current.role,
        action,
        detail,
      },
      ...(prev.logEntries ?? []),
    ].slice(0, 2000),
  }), []);

  const addLog = useCallback(
    (action: string, detail?: string) =>
      update((prev) => withLog(prev, action, detail ?? "")),
    [update, withLog],
  );

  // Catat masuk dan keluar pengguna ke log book. Penanda di perangkat menjaga
  // agar memuat ulang halaman tidak dianggap masuk lagi.
  const LOGIN_MARK = "billing.logged-in-user";
  useEffect(() => {
    const uid = authSession?.user.id ?? null;
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(LOGIN_MARK);
    } catch {
      previous = null;
    }
    if (uid) {
      if (previous !== uid) {
        try {
          localStorage.setItem(LOGIN_MARK, uid);
        } catch {
          /* penyimpanan tidak tersedia */
        }
        addLog("Masuk aplikasi", user?.email ?? "");
      }
      return;
    }
    if (previous) {
      try {
        localStorage.removeItem(LOGIN_MARK);
      } catch {
        /* penyimpanan tidak tersedia */
      }
      addLog("Keluar aplikasi", actorRef.current.name);
    }
  }, [authSession?.user.id, addLog, user?.email]);

  // Seluruh data di perangkat terikat ke satu store. Begitu store pengguna
  // diketahui, data lokal dari store lain dibuang sebelum satu baris pun
  // dikirim, dan data baru langsung bertanda store ini.
  const bindStore = useCallback((id: string, keepLocal = false) => {
    setState((prev) => {
      if (prev.storeId === id) return prev;
      // keepLocal: data di perangkat ini memang milik store ini (versi lama
      // belum menandainya). Cukup diberi tanda, jangan dihapus, supaya
      // transaksi yang belum terkirim tidak hilang.
      if (keepLocal) return { ...prev, storeId: id };
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* penyimpanan diblokir: cukup reset di memori */
      }
      return { ...defaultState, storeId: id };
    });
    // Perangkat ganti store: penanda "diedit di sini" tidak lagi berlaku.
    dirtyRef.current = new Set();
    try {
      localStorage.removeItem(DIRTY_SETTINGS_KEY);
    } catch {
      /* penyimpanan diblokir */
    }
  }, []);

  const dirtySettings = useCallback(() => dirtyRef.current, []);

  // Perubahan Jenis Konsol & Tarif yang datang dari pusat dicatat, supaya kalau
  // suatu perangkat menimpanya lagi jelas terlihat kapan dan menjadi apa.
  const applyRemote = useCallback(
    (apply: (prev: State) => State) => {
      setState((prev) => {
        const next = apply(prev);
        const before = JSON.stringify([prev.consoleTypes, prev.rates]);
        const after = JSON.stringify([next.consoleTypes, next.rates]);
        if (before !== after) {
          const detail = next.consoleTypes
            .map((c) => `${c} ${formatRupiah(next.rates[c] ?? 0)}`)
            .join(", ");
          queueMicrotask(() => addLog("Tarif konsol disegarkan dari pusat", detail));
        }
        return next;
      });
    },
    [addLog],
  );

  const sync = useStoreSync({
    state,
    hydrated,
    enabled: Boolean(authSession),
    storageLoaded,
    dirtySettings,
    applyRemote,
    bindStore,
  });

  // Kasir wajib check-in shift sebelum ada uang masuk atau keluar.
  const activeShift = state.shifts.find((s) => !s.closedAt) ?? null;
  const shiftOpen = Boolean(activeShift);

  // Hari usaha berjalan sejak kasir pertama check-in sampai End of Day.
  const activeBusinessDay = (state.businessDays ?? []).find((d) => !d.closedAt) ?? null;

  // Jaring pengaman: bila End of Day lupa dijalankan, hari usaha ditutup
  // otomatis tepat pada jam tutup operasional yang diatur di Setup → Store.
  useEffect(() => {
    if (!activeBusinessDay) return;
    const limit = autoCloseAt(activeBusinessDay.openedAt, state.operatingHours);
    if (now < limit) return;
    update((prev) => {
      const day = (prev.businessDays ?? []).find((d) => d.id === activeBusinessDay.id);
      if (!day || day.closedAt) return prev;
      const stillOpen = prev.shifts.some((s) => !s.closedAt);
      const nextId = `bday-${limit}`;
      // Pengaman ganda: bila hari usaha tujuan sudah pernah dibuat, jangan
      // dibuat ulang. Tanpa ini penutupan otomatis bisa berputar terus dan
      // membanjiri Log Book dengan catatan yang sama.
      if (stillOpen && (prev.businessDays ?? []).some((d) => d.id === nextId)) return prev;
      // Bila kasir masih bertugas melewati jam tutup, hari usaha baru langsung dibuka.
      const nextDay: BusinessDay | null = stillOpen
        ? { id: nextId, openedAt: limit }
        : null;
      const closedList = (prev.businessDays ?? []).map((d) =>
        d.id === day.id
          ? { ...d, closedAt: limit, autoClosed: true, closedByName: "Sistem" }
          : d,
      );
      const next = withLog(
        { ...prev, businessDays: nextDay ? [nextDay, ...closedList] : closedList },
        "End of Day otomatis",
        `Hari usaha ${new Date(day.openedAt).toLocaleDateString("id-ID")} ditutup otomatis oleh sistem pada jam tutup operasional`,
      );
      return nextDay
        ? withLog(next, "Buka hari usaha", new Date(limit).toLocaleString("id-ID"))
        : next;
    });

  }, [activeBusinessDay, shiftOpen, now, state.operatingHours, update, withLog]);



  const value = useMemo<Ctx>(
    () => ({
      ...state,
      printers: withDevicePrinterPrefs(state.printers, printerPrefs),
      now,
      activeShift,
      shiftOpen,
      startSession: (...args) => {
        if (!shiftOpen) return;
        startSessionWithRate(...args);
      },
      // Menutup sesi yang tagihannya sudah lunas tidak memindahkan uang,
      // jadi tetap boleh walau shift belum/sudah tidak terbuka.
      stopSession: (...args) => {
        const withPayment = Boolean(args[1]) || Boolean(args[3]?.length);
        if (!shiftOpen && withPayment) return null;
        return stopSession(...args);
      },
      settleSession: (...args) => (shiftOpen ? settleSession(...args) : null),
      removeSettlement,

      addTime,
      addOrder: (...args) => {
        if (!shiftOpen) return;
        addOrder(...args);
      },
      removeOrder,
      setRates: (rates) => {
        markSettingsDirty("rates");
        update((prev) => ({ ...prev, rates }));
      },
      addAddonRental: (name, price, mode) => {
        const clean = name.trim();
        if (!clean) return false;
        update((prev) =>
          prev.addonRentals.some((a) => a.name.trim().toLowerCase() === clean.toLowerCase())
            ? prev
            : {
                ...prev,
                addonRentals: [
                  ...prev.addonRentals,
                  {
                    id: `add-${Date.now()}`,
                    name: clean,
                    price: Math.max(0, Math.round(price)),
                    mode,
                    active: true,
                    sort: prev.addonRentals.length,
                  },
                ],
              },
        );
        return true;
      },
      updateAddonRental: (id, patch) =>
        update((prev) => ({
          ...prev,
          addonRentals: prev.addonRentals.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      setAddonDiscount: (id, patch) =>
        update((prev) => ({
          ...prev,
          addonRentals: prev.addonRentals.map((a) =>
            a.id === id
              ? { ...a, discount: { ...emptyItemDiscount, ...a.discount, ...patch } }
              : a,
          ),
        })),
      removeAddonRental: (id) =>
        update((prev) => ({
          ...prev,
          addonRentals: prev.addonRentals.filter((a) => a.id !== id),
        })),
      addSessionAddon: (stationId, addonId, qty = 1, minutes) =>
        update((prev) => {
          const item = prev.addonRentals.find((a) => a.id === addonId);
          if (!item) return prev;
          const mins =
            item.mode === "hourly" && typeof minutes === "number" && minutes > 0
              ? Math.round(minutes)
              : undefined;
          return {
            ...prev,
            stations: prev.stations.map((s) => {
              if (s.id !== stationId || !s.session) return s;
              const addons = [...(s.session.addons ?? [])];
              const index = addons.findIndex(
                (a) => a.addonId === addonId && (a.minutes ?? 0) === (mins ?? 0),
              );
              const existing = addons[index];
              if (existing) {
                addons[index] = { ...existing, qty: existing.qty + Math.max(1, qty) };
              } else {
                addons.push({
                  id: `sa-${addonId}-${Date.now()}`,
                  addonId,
                  name: item.name,
                  price: item.price,
                  mode: item.mode,
                  qty: Math.max(1, qty),
                  ...(mins ? { minutes: mins } : {}),
                });
              }
              return { ...s, session: { ...s.session, addons } };
            }),
          };
        }),
      updateSessionAddon: (stationId, rowId, patch) =>
        mapStation(stationId, (s) =>
          s.session
            ? {
                ...s,
                session: {
                  ...s.session,
                  addons: (s.session.addons ?? []).map((a) => {
                    if (a.id !== rowId) return a;
                    const next: SessionAddon = { ...a };
                    if (typeof patch.qty === "number") next.qty = Math.max(1, Math.round(patch.qty));
                    if (typeof patch.minutes === "number") {
                      const mins = Math.round(patch.minutes);
                      if (mins > 0) next.minutes = mins;
                      else delete next.minutes;
                    }
                    return next;
                  }),
                },
              }
            : s,
        ),

      removeSessionAddon: (stationId, rowId) =>
        mapStation(stationId, (s) =>
          s.session
            ? {
                ...s,
                session: {
                  ...s.session,
                  addons: (s.session.addons ?? []).filter((a) => a.id !== rowId),
                },
              }
            : s,
        ),
      setConsoleDiscount: (name, patch) => {
        markSettingsDirty("consoleDiscounts");
        update((prev) => ({
          ...prev,
          consoleDiscounts: {
            ...prev.consoleDiscounts,
            [name]: {
              ...emptyItemDiscount,
              ...prev.consoleDiscounts[name],
              ...patch,
            },
          },
        }));
      },
      setSessionDiscount: (stationId, patch) =>
        mapStation(stationId, (s) =>
          s.session
            ? {
                ...s,
                session: {
                  ...s.session,
                  ...(patch.type ? { discountType: patch.type } : {}),
                  ...(patch.value !== undefined
                    ? { discountValue: Math.max(0, Math.round(patch.value)) }
                    : {}),
                },
              }
            : s,
        ),
      setStationConsole: (stationId, consoleType) =>
        mapStation(stationId, (s) => ({ ...s, console: consoleType })),
      changeSessionConsole: (stationId, consoleType) => {
        const st = state.stations.find((s) => s.id === stationId);
        const nextRate = state.rates[consoleType];
        if (!st?.session || typeof nextRate !== "number" || st.console === consoleType) return "invalid";
        if (st.session.paidAt && nextRate < st.session.rate) return "downgrade-paid";
        update((prev) => ({
          ...prev,
          stations: prev.stations.map((s) => {
            if (s.id !== stationId || !s.session) return s;
            const raise = nextRate > s.session.rate;
            // Lunas + naik tarif: buka lagi tagihan; historyId dipertahankan agar nota yang sama diperbarui.
            const { paidAt, ...rest } = s.session;
            const session = paidAt && raise ? { ...rest, rate: nextRate } : { ...s.session, rate: nextRate };
            return { ...s, console: consoleType, session };
          }),
        }));
        return "ok";
      },
      addConsoleType: (name, rate) => {
        const clean = name.trim();
        if (!clean) return false;
        if (state.consoleTypes.some((c) => c.toLowerCase() === clean.toLowerCase()))
          return false;
        markSettingsDirty("consoleTypes", "rates");
        update((prev) => ({
          ...prev,
          consoleTypes: [...prev.consoleTypes, clean],
          rates: { ...prev.rates, [clean]: Math.max(0, rate) },
        }));
        return true;
      },
      renameConsoleType: (oldName, newName) => {
        const clean = newName.trim();
        if (!clean || clean === oldName) return false;
        if (state.consoleTypes.some((c) => c.toLowerCase() === clean.toLowerCase()))
          return false;
        markSettingsDirty("consoleTypes", "rates", "consoleDiscounts");
        update((prev) => {
          const rates: Rates = {};
          for (const key of Object.keys(prev.rates)) {
            rates[key === oldName ? clean : key] = prev.rates[key] ?? 0;
          }
          // Potongan harga ikut pindah ke nama baru supaya tidak hilang.
          const consoleDiscounts: Record<string, ItemDiscount> = {};
          for (const key of Object.keys(prev.consoleDiscounts)) {
            const row = prev.consoleDiscounts[key];
            if (row) consoleDiscounts[key === oldName ? clean : key] = row;
          }
          return {
            ...prev,
            consoleTypes: prev.consoleTypes.map((c) => (c === oldName ? clean : c)),
            rates,
            consoleDiscounts,
            stations: prev.stations.map((s) =>
              s.console === oldName ? { ...s, console: clean } : s,
            ),
          };
        });
        return true;
      },
      setConsoleRate: (name, rate) => {
        markSettingsDirty("rates");
        update((prev) => ({
          ...prev,
          rates: { ...prev.rates, [name]: Math.max(0, rate) },
        }));
      },
      removeConsoleType: (name) => {
        if (state.consoleTypes.length <= 1) return false;
        if (state.stations.some((s) => s.console === name)) return false;
        markSettingsDirty("consoleTypes", "rates", "consoleDiscounts");
        update((prev) => {
          const rates = { ...prev.rates };
          delete rates[name];
          const consoleDiscounts = { ...prev.consoleDiscounts };
          delete consoleDiscounts[name];
          return {
            ...prev,
            consoleTypes: prev.consoleTypes.filter((c) => c !== name),
            rates,
            consoleDiscounts,
          };
        });
        return true;
      },
      addStation: (init) =>
        update((prev) => {
          const n = prev.stations.length + 1;
          return {
            ...prev,
            stations: [
              ...prev.stations,
              {
                id: `tv-${Date.now()}`,
                name: init?.name?.trim() || `TV ${String(n).padStart(2, "0")}`,
                console: init?.console ?? prev.consoleTypes[0] ?? "PS4",
                booth: init?.booth?.trim() || `Booth ${n}`,
                availability: "available",
                session: null,
              },
            ],
          };
        }),
      reorderList: (list, activeId, overId, orderedIds) =>
        update((prev) => {
          const storedRows = prev[list] as { id: string; sort?: number }[];
          const byId = new Map(storedRows.map((row) => [row.id, row]));
          const visibleRows = orderedIds
            ?.map((id) => byId.get(id))
            .filter((row): row is { id: string; sort?: number } => Boolean(row));
          const visibleIds = new Set(visibleRows?.map((row) => row.id) ?? []);
          const rows = visibleRows
            ? [...visibleRows, ...storedRows.filter((row) => !visibleIds.has(row.id))]
            : storedRows;
          const from = rows.findIndex((r) => r.id === activeId);
          const to = rows.findIndex((r) => r.id === overId);
          if (from < 0 || to < 0 || from === to) return prev;
          const next = moveItem(rows, from, to).map((row, index) => ({ ...row, sort: index }));
          return {
            ...prev,
            [list]: next,
            ...(list === "menu" ? { menuOrderMode: "manual" as const } : {}),
          } as State;
        }),
      reorderConsoleTypes: (activeName, overName) =>
        update((prev) => {
          const from = prev.consoleTypes.indexOf(activeName);
          const to = prev.consoleTypes.indexOf(overName);
          if (from < 0 || to < 0 || from === to) return prev;
          return { ...prev, consoleTypes: moveItem(prev.consoleTypes, from, to) };
        }),
      reorderMenuCategories: (activeName, overName) =>
        update((prev) => {
          const from = prev.menuCategories.indexOf(activeName);
          const to = prev.menuCategories.indexOf(overName);
          if (from < 0 || to < 0 || from === to) return prev;
          return { ...prev, menuCategories: moveItem(prev.menuCategories, from, to) };
        }),
      removeStation: (stationId) =>
        update((prev) =>
          withLog(
            { ...prev, stations: prev.stations.filter((s) => s.id !== stationId) },
            "Hapus unit TV",
            prev.stations.find((s) => s.id === stationId)?.name ?? stationId,
          ),
        ),
      updateStation: (stationId, patch) =>
        mapStation(stationId, (station) => ({ ...station, ...patch })),
      addMenuItem: (name, price, category) =>
        update((prev) => {
          const cat = category?.trim() || prev.menuCategories[0] || "Lainnya";
          return {
            ...prev,
            menuCategories: prev.menuCategories.includes(cat)
              ? prev.menuCategories
              : [...prev.menuCategories, cat],
            menu: [...prev.menu, { id: `m-${Date.now()}`, name, price, category: cat }],
          };
        }),
      updateMenuItem: (id, patch) =>
        update((prev) => ({
          ...prev,
          menu: prev.menu.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      removeMenuItem: (id) =>
        update((prev) =>
          withLog(
            { ...prev, menu: prev.menu.filter((m) => m.id !== id) },
            "Hapus item menu",
            prev.menu.find((m) => m.id === id)?.name ?? id,
          ),
        ),
      addMenuCategory: (name) => {
        const clean = name.trim();
        if (!clean) return false;
        if (state.menuCategories.some((c) => c.toLowerCase() === clean.toLowerCase())) return false;
        update((prev) => ({ ...prev, menuCategories: [...prev.menuCategories, clean] }));
        return true;
      },
      renameMenuCategory: (oldName, newName) => {
        const clean = newName.trim();
        if (!clean || clean === oldName) return false;
        if (state.menuCategories.some((c) => c.toLowerCase() === clean.toLowerCase())) return false;
        update((prev) => ({
          ...prev,
          menuCategories: prev.menuCategories.map((c) => (c === oldName ? clean : c)),
          menu: prev.menu.map((m) => (m.category === oldName ? { ...m, category: clean } : m)),
        }));
        return true;
      },
      removeMenuCategory: (name) => {
        if (state.menu.some((m) => m.category === name)) return false;
        if (state.menuCategories.length <= 1) return false;
        update((prev) => ({
          ...prev,
          menuCategories: prev.menuCategories.filter((c) => c !== name),
        }));
        return true;
      },
      addCafeTable: (init) =>
        update((prev) => {
          const n = prev.cafeTables.length + 1;
          return {
            ...prev,
            cafeTables: [
              ...prev.cafeTables,
              {
                id: `meja-${Date.now()}`,
                name: init?.name?.trim() || `Meja ${String(n).padStart(2, "0")}`,
                area: init?.area?.trim() || "Indoor",
                seats: Math.max(1, init?.seats ?? 2),
                customerName: "",
                notes: "",
                openedAt: null,
                orders: [],
              },
            ],
          };
        }),
      updateCafeTable: (tableId, patch) =>
        update((prev) => ({
          ...prev,
          cafeTables: prev.cafeTables.map((t) => (t.id === tableId ? { ...t, ...patch } : t)),
        })),
      removeCafeTable: (tableId) => {
        const table = state.cafeTables.find((t) => t.id === tableId);
        if (table && (table.openedAt || table.orders.length > 0)) return false;
        update((prev) => ({
          ...prev,
          cafeTables: prev.cafeTables.filter((t) => t.id !== tableId),
        }));
        return true;
      },
      openCafeTable: (tableId, customerName, notes) =>
        !shiftOpen
          ? undefined
          : update((prev) => ({
          ...prev,
          cafeTables: prev.cafeTables.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  openedAt: t.openedAt ?? Date.now(),
                  customerName: customerName ?? t.customerName,
                  notes: notes ?? t.notes,
                }
              : t,
          ),
        })),
      addCafeOrder: (tableId, item, qty, mods, priceAdd) =>
        !shiftOpen
          ? undefined
          : update((prev) => ({
          ...prev,
          cafeTables: prev.cafeTables.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  openedAt: t.openedAt ?? Date.now(),
                  orders: mergeOrders(t.orders, [
                    {
                      id: `${item.id}-${Date.now()}`,
                      menuId: item.id,
                      name: item.name,
                      price: item.price + (priceAdd ?? 0),
                      qty,
                      ...(mods && mods.length > 0 ? { mods } : {}),
                    },
                    // Promo Buy One Get One: menu hadiah langsung ikut masuk.
                    ...bogoFreeOrders(prev.promotions, prev.menu, Date.now(), item, qty),
                  ]),
                }
              : t,
          ),
        })),
      removeCafeOrder: (tableId, orderId) =>
        update((prev) => ({
          ...prev,
          cafeTables: prev.cafeTables.map((t) =>
            t.id === tableId ? { ...t, orders: t.orders.filter((o) => o.id !== orderId) } : t,
          ),
        })),
      clearCafeTable: (tableId) =>
        update((prev) => ({
          ...prev,
          cafeTables: prev.cafeTables.map((t) =>
            t.id === tableId
              ? (() => {
                  const { paidAt: _paidAt, ...rest } = t;
                  return {
                    ...rest,
                    orders: [],
                    openedAt: null,
                    customerName: "",
                    notes: "",
                    promoIds: [],
                    settlements: [],
                  };
                })()

              : t,
          ),
        })),
      voidSession: (stationId, reason) => {
        let record: VoidRecord | null = null;
        setState((prev) => {
          const station = prev.stations.find((s) => s.id === stationId);
          const session = station?.session;
          if (!station || !session) return prev;
          const at = Date.now();
          const bill = sessionBill(session, at, station.console, prev, {
            member: Boolean(session.member),
            card: false,
          });
          const made: VoidRecord = {
            id: `void-${at}-${Math.random().toString(36).slice(2, 7)}`,
            at,
            kind: "rental",
            sourceName: station.name,
            console: station.console,
            customerName: session.customerName || "Umum",
            customerPhone: session.customerPhone ?? "",
            minutes: Math.ceil(elapsedSeconds(session, at) / 60),
            rentalTotal: bill.rental,
            ...(bill.addon ? { addonTotal: bill.addon } : {}),
            fnbTotal: bill.fnb,
            discount: bill.discount,
            total: bill.total,
            paidBefore: paidTotal(session),
            orders: session.orders,
            reason: reason.trim(),
            actorName: actorRef.current.name,
            actorRole: actorRef.current.role,
          };
          record = made;
          const historyId = session.historyId;
          return withLog(
            {
              ...prev,
              voids: [made, ...(prev.voids ?? [])],
              history: historyId
                ? prev.history.filter((h) => !(h.id === historyId && h.ongoing))
                : prev.history,
              stations: prev.stations.map((s) =>
                s.id === stationId ? { ...s, session: null } : s,
              ),
            },
            "VOID transaksi rental",
            `${station.name} · ${made.customerName} · ${formatRupiah(made.total)} · alasan: ${made.reason || "-"}`,
          );
        });
        return record;
      },
      voidCafeTable: (tableId, reason) => {
        let record: VoidRecord | null = null;
        setState((prev) => {
          const table = prev.cafeTables.find((t) => t.id === tableId);
          if (!table || table.orders.length === 0) return prev;
          const at = Date.now();
          const bill = cafeBill(
            table.orders,
            at,
            prev,
            { member: false, card: false },
            undefined,
            table.promoIds,
          );

          const made: VoidRecord = {
            id: `void-${at}-${Math.random().toString(36).slice(2, 7)}`,
            at,
            kind: "cafe",
            sourceName: table.name,
            customerName: table.customerName || "Umum",
            rentalTotal: 0,
            fnbTotal: bill.fnb,
            discount: bill.discount,
            total: bill.total,
            orders: table.orders,
            reason: reason.trim(),
            actorName: actorRef.current.name,
            actorRole: actorRef.current.role,
          };
          record = made;
          return withLog(
            {
              ...prev,
              voids: [made, ...(prev.voids ?? [])],
              cafeTables: prev.cafeTables.map((t) =>
                t.id === tableId
                  ? {
                      ...t,
                      orders: [],
                      openedAt: null,
                      customerName: "",
                      notes: "",
                      promoIds: [],
                      settlements: [],
                    }
                  : t,
              ),

            },
            "VOID pesanan meja kafe",
            `${table.name} · ${made.customerName} · ${formatRupiah(made.total)} · alasan: ${made.reason || "-"}`,
          );
        });
        return record;
      },
      payCafeTable: (tableId, input) => {
        if (!shiftOpen) return null;
        const endAt = Date.now();
        // Nota dihitung dari data terbaru lebih dulu (bukan di dalam setState)
        // supaya hasilnya pasti terbaca dan tidak muncul pesan "gagal" palsu.
        const compute = (prev: State): { record: HistoryRecord | null; next: State } => {
          const table = prev.cafeTables.find((t) => t.id === tableId);
          if (!table || table.orders.length === 0) return { record: null, next: prev };
          const methodsUsed = input.payments?.length
            ? input.payments.map((p) => p.method)
            : [input.payment ?? ""];
          const bill = cafeBill(
            table.orders,
            endAt,
            prev,
            { member: Boolean(input.member), card: methodsUsed.includes(CARD_PAYMENT_NAME) },
            input.discount,
            table.promoIds,
          );

          const total = bill.total;
          // Pembayaran sebagian (DP) yang sudah diterima ikut melunasi nota.
          const prior = table.settlements ?? [];
          const priorPaid = prior.reduce((sum, s) => sum + s.amount, 0);
          const due = Math.max(0, total - priorPaid);
          const splits = input.payments?.length ? input.payments : [];
          const received = splits.length
            ? splits.reduce((sum, p) => sum + p.amount, 0)
            : (input.amountPaid ?? due);
          if (received + 0.5 < due) return { record: null, next: prev };
          const priorSplits: PaymentSplit[] = prior.flatMap((s) => settlementSplits(s));
          const nowSplits: PaymentSplit[] = splits.length
            ? splits.map((p) => ({ ...p, at: p.at ?? endAt }))
            : due > 0
              ? [{ method: input.payment || "Cash", amount: due, at: endAt }]
              : [];
          const allSplits = [...priorSplits, ...nowSplits];
          const label =
            Array.from(new Set(allSplits.map((p) => p.method))).join(" + ") ||
            input.payment ||
            "Cash";

          const completed: HistoryRecord = {
            id: `cafe-${tableId}-${endAt}`,
            stationName: table.name,
            ...(actorRef.current.name ? { cashierName: actorRef.current.name } : {}),
            ...(deviceCode() ? { deviceCode: deviceCode() } : {}),
            console: "Kafe",
            mode: "prepaid",
            startAt: table.openedAt ?? endAt,
            endAt,
            minutes: 0,
            rentalTotal: 0,
            fnbTotal: bill.fnb,
            total,
            discount: bill.discount,
            ...(bill.promoName ? { promoName: bill.promoName } : {}),
            payment: label,
            ...(allSplits.length > 0 ? { payments: allSplits } : {}),
            customerName: table.customerName || "Pelanggan Kafe",
            packageName: "Kafe",
            amountPaid: priorPaid + received,
            change: Math.max(0, received - due),
            orders: table.orders,
            kind: "cafe",
            tableName: table.name,
          };
          // Pelunasan dicatat sebagai pembayaran diterima supaya rincian pesanan
          // tetap tampil di panel meja sampai sesi diakhiri (sama seperti meja TV).
          const paySettlement: Settlement | null =
            due > 0
              ? {
                  id: `cafepay-${endAt}-${Math.random().toString(36).slice(2, 7)}`,
                  at: endAt,
                  payment:
                    Array.from(new Set(nowSplits.map((p) => p.method))).join(" + ") ||
                    input.payment ||
                    "Cash",
                  ...(nowSplits.length > 1 ? { payments: nowSplits } : {}),
                  amount: due,
                  amountPaid: Math.round(received),
                  change: Math.max(0, Math.round(received - due)),
                }
              : null;
          return {
            record: completed,
            next: {
              ...prev,
              history: [completed, ...prev.history],
              cafeTables: prev.cafeTables.map((t) =>
                t.id === tableId
                  ? {
                      // Meja tetap terisi setelah lunas; kasir menutupnya lewat "Akhiri Sesi".
                      ...t,
                      settlements: paySettlement ? [...prior, paySettlement] : prior,
                      openedAt: t.openedAt ?? endAt,
                      paidAt: endAt,
                    }
                  : t,
              ),
            },
          };
        };
        const { record } = compute(stateRef.current);
        if (!record) return null;
        setState((prev) => compute(prev).next);
        return record;
      },
      settleCafeTable: (tableId, input) => {
        if (!shiftOpen) return null;
        const amount = Math.max(0, Math.round(input.amount));
        if (amount <= 0) return null;
        const at = Date.now();
        const label = input.payments?.length
          ? Array.from(new Set(input.payments.map((p) => p.method))).join(" + ")
          : input.payment || "Cash";
        const settlement: Settlement = {
          id: `cafepay-${at}-${Math.random().toString(36).slice(2, 7)}`,
          at,
          payment: label,
          ...(input.payments?.length ? { payments: input.payments } : {}),
          amount,
          amountPaid: Math.max(0, Math.round(input.amountPaid || amount)),
          change: Math.max(0, Math.round((input.amountPaid || amount) - amount)),
        };
        if (!stateRef.current.cafeTables.some((t) => t.id === tableId)) return null;
        update((prev) => {
          const table = prev.cafeTables.find((t) => t.id === tableId);
          if (!table) return prev;
          return {
            ...prev,
            cafeTables: prev.cafeTables.map((t) =>
              t.id === tableId
                ? {
                    ...t,
                    openedAt: t.openedAt ?? at,
                    settlements: [...(t.settlements ?? []), settlement],
                  }
                : t,
            ),
          };
        });
        return settlement;
      },
      removeCafeSettlement: (tableId, settlementId) =>
        update((prev) => ({
          ...prev,
          cafeTables: prev.cafeTables.map((t) => {
            if (t.id !== tableId) return t;
            // Pembayaran dihapus → meja kembali punya tagihan, tanda lunas dilepas.
            const { paidAt: _paidAt, ...rest } = t;
            return {
              ...rest,
              settlements: (t.settlements ?? []).filter((s) => s.id !== settlementId),
            };
          }),
        })),
      cancelCafeRemainder: (tableId) => {
        const at = Date.now();
        const compute = (prev: State): { record: HistoryRecord | null; next: State } => {
          const table = prev.cafeTables.find((t) => t.id === tableId);
          if (!table) return { record: null, next: prev };
          const prior = table.settlements ?? [];
          const paid = prior.reduce((sum, s) => sum + s.amount, 0);
          if (paid <= 0) {
            // Belum ada pembayaran: seluruh pesanan meja dibatalkan.
            return {
              record: null,
              next: withLog(
                {
                  ...prev,
                  cafeTables: prev.cafeTables.map((t) =>
                    t.id === tableId
                      ? (() => {
                          const { paidAt: _paidAt, ...rest } = t;
                          return {
                            ...rest,
                            orders: [],
                            openedAt: null,
                            customerName: "",
                            notes: "",
                            promoIds: [],
                            settlements: [],
                          };
                        })()
                      : t,
                  ),
                },
                "Batalkan pesanan meja kafe",
                `${table.name} · ${table.orders.length} item`,
              ),
            };
          }
          const splits: PaymentSplit[] = prior.flatMap((s) =>
            settlementSplits(s),
          );
          const label = Array.from(new Set(splits.map((p) => p.method))).join(" + ") || "Cash";
          const completed: HistoryRecord = {
            id: `cafe-${tableId}-${at}`,
            stationName: table.name,
            ...(actorRef.current.name ? { cashierName: actorRef.current.name } : {}),
            ...(deviceCode() ? { deviceCode: deviceCode() } : {}),
            console: "Kafe",
            mode: "prepaid",
            startAt: table.openedAt ?? at,
            endAt: at,
            minutes: 0,
            rentalTotal: 0,
            fnbTotal: paid,
            total: paid,
            discount: 0,
            payment: label,
            ...(splits.length > 0 ? { payments: splits } : {}),
            customerName: table.customerName || "Pelanggan Kafe",
            packageName: "Kafe",
            amountPaid: paid,
            change: 0,
            orders: table.orders,
            kind: "cafe",
            tableName: table.name,
          };
          return {
            record: completed,
            next: withLog(
              {
                ...prev,
                history: [completed, ...prev.history],
                cafeTables: prev.cafeTables.map((t) =>
                  t.id === tableId
                    ? {
                        ...t,
                        orders: [],
                        promoIds: [],
                        settlements: [],
                        openedAt: t.openedAt ?? at,
                        paidAt: at,
                      }
                    : t,
                ),
              },
              "Batalkan sisa tagihan meja kafe",
              `${table.name} · sudah dibayar ${formatRupiah(paid)} · sisa tagihan dibatalkan`,
            ),
          };
        };
        const { record } = compute(stateRef.current);
        if (!stateRef.current.cafeTables.some((t) => t.id === tableId)) return null;
        setState((prev) => compute(prev).next);
        return record;
      },



      addPaymentMethod: (name) =>
        update((prev) => ({
          ...prev,
          paymentMethods: [
            ...prev.paymentMethods,
            { id: `pm-${Date.now()}`, name, active: true },
          ],
        })),
      updatePaymentMethod: (id, patch) =>
        update((prev) => ({
          ...prev,
          paymentMethods: prev.paymentMethods.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),
      removePaymentMethod: (id) =>
        update((prev) => ({
          ...prev,
          paymentMethods: prev.paymentMethods.filter((p) => p.id !== id),
        })),
      addPackage: (name, durationMin, price) =>
        update((prev) => ({
          ...prev,
          packages: [...prev.packages, { id: `pkg-${Date.now()}`, name, durationMin, price, active: true }],
        })),
      updatePackage: (id, patch) =>
        update((prev) => ({
          ...prev,
          packages: prev.packages.map((item) => item.id === id ? { ...item, ...patch } : item),
        })),
      removePackage: (id) =>
        update((prev) => ({ ...prev, packages: prev.packages.filter((item) => item.id !== id) })),
      setRoundingRule: (roundingRule) => update((prev) => ({ ...prev, roundingRule })),
      setDefaultBonusMin: (minutes) => update((prev) => ({ ...prev, defaultBonusMin: Math.round(minutes) })),
      setTvNotice: (patch) =>
        update((prev) => ({ ...prev, tvNotice: { ...prev.tvNotice, ...patch } })),
      setRolePermissions: (role, keys) =>
        update((prev) => ({
          ...prev,
          rolePermissions: { ...prev.rolePermissions, [role]: keys },
        })),
      addPrinter: (init) =>
        update((prev) => {
          const id = `prt-${Date.now().toString(36)}`;
          const printer: PrinterConfig = {
            id,
            name: init?.name?.trim() || `Printer ${prev.printers.length + 1}`,
            role: init?.role ?? "receipt",
            paper: init?.paper ?? "80mm",
            fontSizePt: init?.fontSizePt ?? 9,
            bold: init?.bold ?? false,
            marginMm: init?.marginMm ?? 3,
            copies: init?.copies ?? 1,
            active: true,
            sort: prev.printers.length + 1,
          };
          return { ...prev, printers: [...prev.printers, printer] };
        }),
      updatePrinter: (id, patch) => {
        const { mode, bluetoothAddress, ...shared } = patch;
        if (mode !== undefined || bluetoothAddress !== undefined) {
          setPrinterPrefs((prev) => {
            const cur = { ...(prev[id] ?? {}) };
            if (mode !== undefined) cur.mode = mode;
            if (bluetoothAddress !== undefined) cur.bluetoothAddress = bluetoothAddress;
            const next = { ...prev, [id]: cur };
            saveDevicePrinterPrefs(next);
            return next;
          });
        }
        if (Object.keys(shared).length === 0) return;
        update((prev) => ({
          ...prev,
          printers: prev.printers.map((p) => (p.id === id ? { ...p, ...shared } : p)),
        }));
      },
      removePrinter: (id) =>
        update((prev) => ({ ...prev, printers: prev.printers.filter((p) => p.id !== id) })),
      setReceiptLayout: (patch) =>
        update((prev) => ({ ...prev, receiptLayout: { ...prev.receiptLayout, ...patch } })),
      setInvoiceLayout: (patch) =>
        update((prev) => ({ ...prev, invoiceLayout: { ...prev.invoiceLayout, ...patch } })),
      adjustBonusTime: (stationId, deltaMin) =>
        mapStation(stationId, (s) => {
          if (!s.session) return s;
          const delta = Math.round(deltaMin);
          const current = s.session.bonusMin ?? 0;
          if (delta <= 0) return { ...s, session: { ...s.session, bonusMin: current + delta } };
          const overdueSeconds = Math.max(0, -remainingSeconds(s.session, Date.now()));
          return {
            ...s,
            session: {
              ...s.session,
              // Waktu lewat setelah 00:00 dinetralkan pada timer, bukan
              // dimasukkan ke bonus agar angka paket/tagihan tetap bersih.
              bonusMin: current + delta,
              ...(overdueSeconds > 0
                ? { timerOffsetMs: (s.session.timerOffsetMs ?? 0) + overdueSeconds * 1000 }
                : {}),
            },
          };
        }),

      setSessionBonus: (stationId, bonusMin) =>
        mapStation(stationId, (s) =>
          s.session ? { ...s, session: { ...s.session, bonusMin: Math.round(bonusMin) } } : s,
        ),
      updateSessionCustomer: (stationId, patch) =>
        mapStation(stationId, (s) => {
          if (!s.session) return s;
          const { customerId, ...rest } = patch;
          const { customerId: _old, ...session } = s.session;
          return {
            ...s,
            session: { ...session, ...rest, ...(customerId ? { customerId } : {}) },
          };
        }),
      pauseSession: (stationId) =>
        mapStation(stationId, (s) =>
          s.session && !s.session.pausedAt
            ? { ...s, session: { ...s.session, pausedAt: Date.now() } }
            : s,
        ),
      resumeSession: (stationId) =>
        mapStation(stationId, (s) => {
          if (!s.session?.pausedAt) return s;
          const extra = Math.max(0, Date.now() - s.session.pausedAt);
          const { pausedAt: _pausedAt, ...rest } = s.session;
          return {
            ...s,
            session: { ...rest, pausedMs: (s.session.pausedMs ?? 0) + extra },
          };
        }),
      moveSession: (fromStationId, toStationId, newConsole) => {
        if (fromStationId === toStationId) return false;
        {
          const f = state.stations.find((s) => s.id === fromStationId);
          const t = state.stations.find((s) => s.id === toStationId);
          const r = newConsole ? state.rates[newConsole] : undefined;
          if (!f?.session || !t || t.session) return false;
          if (f.session.paidAt && typeof r === "number" && r < f.session.rate) return false;
        }
        // setState updater berjalan tertunda; hasil ditentukan dari pengecekan di atas.
        let moved = true;
        update((prev) => {
          const from = prev.stations.find((s) => s.id === fromStationId);
          const to = prev.stations.find((s) => s.id === toStationId);
          if (!from?.session || !to || to.session) return prev;
          const nextRate = newConsole ? prev.rates[newConsole] : undefined;
          if (from.session.paidAt && typeof nextRate === "number" && nextRate < from.session.rate) return prev;
          let session = from.session;
          if (newConsole && typeof nextRate === "number") {
            const { paidAt, ...rest } = from.session;
            session = paidAt && nextRate > from.session.rate
              ? { ...rest, rate: nextRate }
              : { ...from.session, rate: nextRate };
          }
          moved = true;
          return {
            ...prev,
            stations: prev.stations.map((s) => {
              if (s.id === fromStationId) return { ...s, session: null };
              // Konsol ikut pindah bersama sesi: unit tujuan memakai konsol baru (jika dipilih) atau konsol unit asal.
              if (s.id === toStationId)
                return { ...s, console: newConsole && typeof nextRate === "number" ? newConsole : from.console, session };
              return s;
            }),
          };
        });
        return moved;
      },
      moveCafeTable: (fromTableId, toTableId) => {
        if (fromTableId === toTableId) return false;
        {
          const f = state.cafeTables.find((t) => t.id === fromTableId);
          const t = state.cafeTables.find((x) => x.id === toTableId);
          if (!f || !t) return false;
          if (!f.openedAt && f.orders.length === 0) return false;
          if (t.openedAt || t.orders.length > 0) return false;
        }
        let moved = true;
        update((prev) => {
          const from = prev.cafeTables.find((t) => t.id === fromTableId);
          const to = prev.cafeTables.find((t) => t.id === toTableId);
          if (!from || !to) return prev;
          if (!from.openedAt && from.orders.length === 0) return prev;
          if (to.openedAt || to.orders.length > 0) return prev;
          moved = true;
          return {
            ...prev,
            cafeTables: prev.cafeTables.map((t) => {
              if (t.id === fromTableId)
                return { ...t, orders: [], openedAt: null, customerName: "", notes: "", promoIds: [] };
              if (t.id === toTableId)
                return {
                  ...t,
                  orders: from.orders,
                  openedAt: from.openedAt,
                  customerName: from.customerName,
                  notes: from.notes,
                };
              return t;
            }),
          };
        });
        return moved;
      },
      mergeStations: (parentStationId, childStationIds) => {
        // Kelayakan diperiksa dari state sekarang supaya hasil true/false bisa
        // dipakai langsung untuk pesan di layar (setState berjalan setelahnya).
        const parentNow = state.stations.find((s) => s.id === parentStationId);
        if (!parentNow?.session || parentNow.session.mergedInto) return false;
        const eligible = state.stations.filter(
          (s) =>
            childStationIds.includes(s.id) &&
            s.id !== parentStationId &&
            s.session &&
            !s.session.mergedInto &&
            !s.session.paidAt,
        );
        if (!eligible.length) return false;
        const at = Date.now();
        const cfg: PriceConfig = {
          consoleDiscounts: state.consoleDiscounts,
          menu: state.menu,
          promotions: state.promotions,
          addonRentals: state.addonRentals,
          cardDiscountPercent: state.cardDiscountPercent,
          cardMemberDiscountPercent: state.cardMemberDiscountPercent,
        };
        // Tagihan TV yang digabung dipindah jadi satu baris di TV induk, lalu
        // sesinya ditutup supaya TV itu langsung bisa dijual lagi.
        const moved = eligible.map((child, index) => {
          const childSession = child.session!;
          const bill = sessionBill(childSession, at, child.console, cfg, {
            member: Boolean(childSession.member),
            card: false,
          });
          const due = Math.max(0, Math.round(bill.total - paidTotal(childSession)));
          const minutes = rentalMinutes(childSession, at);
          const mods = [
            linkTag({ type: "station", id: child.id, name: child.name }),
            `Rental ${Math.floor(minutes / 60)} jam ${minutes % 60} menit`,
            ...(childSession.orders.length
              ? [`Pesanan ${childSession.orders.length} item`]
              : []),
          ];
          const order: OrderItem = {
            id: `merge-${child.id}-${at}-${index}`,
            name: `Tagihan ${child.name}${
              childSession.customerName ? ` · ${childSession.customerName}` : ""
            }`,
            price: due,
            qty: 1,
            mods,
            linkedFrom: { type: "station", id: child.id, name: child.name },
          };
          return { child, order, due };
        });
        update((prev) => {
          const parent = prev.stations.find((s) => s.id === parentStationId);
          if (!parent?.session) return prev;
          const ids = moved.map((row) => row.child.id);
          const stations = prev.stations.map((s) => {
            if (s.id === parentStationId && s.session)
              return {
                ...s,
                session: {
                  ...s.session,
                  orders: [...s.session.orders, ...moved.map((row) => row.order)],
                },
              };
            if (!ids.includes(s.id)) return s;
            return { ...s, session: null };

          });
          return withLog(
            { ...prev, stations },
            "Gabung tagihan TV",
            `${moved
              .map((row) => `${row.child.name} (${formatRupiah(row.due)})`)
              .join(", ")} → ${parent.name}; TV asal kembali tersedia`,
          );
        });
        return true;
      },

      unmergeStations: (parentStationId) =>
        update((prev) => {
          const parentName =
            prev.stations.find((s) => s.id === parentStationId)?.name ?? "TV induk";
          const names = prev.stations
            .filter((s) => s.session?.mergedInto === parentStationId)
            .map((s) => s.name);
          // Pesanan meja yang dititipkan ke sesi ini juga dikembalikan.
          const parent = prev.stations.find((s) => s.id === parentStationId);
          const linked = (parent?.session?.orders ?? []).filter(
            (o) => o.linkedFrom?.type === "table",
          );
          if (!names.length && linked.length === 0) return prev;
          const restored = new Map<string, OrderItem[]>();
          for (const order of linked) {
            const from = order.linkedFrom!;
            const list = restored.get(from.id) ?? [];
            list.push(stripLinkTag(order));
            restored.set(from.id, list);
          }
          const tableNames = linked
            .map((o) => o.linkedFrom!.name)
            .filter((name, i, arr) => arr.indexOf(name) === i);
          return withLog(
            {
              ...prev,
              stations: prev.stations.map((s) => {
                if (s.id === parentStationId && s.session) {
                  return {
                    ...s,
                    session: {
                      ...s.session,
                      orders: s.session.orders.filter((o) => o.linkedFrom?.type !== "table"),
                    },
                  };
                }
                if (s.session?.mergedInto !== parentStationId) return s;
                const { mergedInto: _drop, ...session } = s.session;
                return { ...s, session };
              }),
              cafeTables: prev.cafeTables.map((t) => {
                const back = restored.get(t.id);
                if (!back) return t;
                return {
                  ...t,
                  orders: [...t.orders, ...back],
                  openedAt: t.openedAt ?? Date.now(),
                };
              }),
            },
            "Lepas gabungan tagihan TV",
            `${[...names, ...tableNames].join(", ")} dilepas dari ${parentName}`,
          );
        }),
      linkCafeTable: (parentStationId, tableId) => {
        const parentNow = state.stations.find((s) => s.id === parentStationId);
        const tableNow = state.cafeTables.find((t) => t.id === tableId);
        if (!parentNow?.session || parentNow.session.paidAt) return false;
        if (!tableNow || tableNow.orders.length === 0) return false;
        update((prev) => {
          const parent = prev.stations.find((s) => s.id === parentStationId);
          const table = prev.cafeTables.find((t) => t.id === tableId);
          if (!parent?.session || !table || table.orders.length === 0) return prev;
          // Pesanan meja dititipkan ke sesi TV induk dengan tanda meja asalnya,
          // supaya rincian pesanan tetap terbaca di bill dan struk.
          const moved = table.orders.map((order, i) =>
            withLinkTag(order, { type: "table", id: table.id, name: table.name }, i),
          );
          return withLog(
            {
              ...prev,
              stations: prev.stations.map((s) =>
                s.id === parentStationId && s.session
                  ? { ...s, session: { ...s.session, orders: [...s.session.orders, ...moved] } }
                  : s,
              ),
              cafeTables: prev.cafeTables.map((t) =>
                t.id === tableId
                  ? { ...t, orders: [], openedAt: null, customerName: "", notes: "", promoIds: [] }
                  : t,
              ),
            },
            "Titip tagihan meja kafe",
            `${table.name} → ${parent.name}`,
          );
        });
        return true;
      },
      mergeCafeTables: (parentTableId, childTableIds) => {
        const parentNow = state.cafeTables.find((t) => t.id === parentTableId);
        if (!parentNow) return false;
        const eligible = state.cafeTables.filter(
          (t) => childTableIds.includes(t.id) && t.id !== parentTableId && t.orders.length > 0,
        );
        if (!eligible.length) return false;
        const ids = eligible.map((t) => t.id);
        update((prev) => {
          const parent = prev.cafeTables.find((t) => t.id === parentTableId);
          if (!parent) return prev;
          const names: string[] = [];
          const moved: OrderItem[] = [];
          for (const table of prev.cafeTables) {
            if (!ids.includes(table.id) || table.orders.length === 0) continue;
            names.push(table.name);
            table.orders.forEach((order, i) =>
              moved.push(
                withLinkTag(order, { type: "table", id: table.id, name: table.name }, i),
              ),
            );
          }
          if (!moved.length) return prev;
          return withLog(
            {
              ...prev,
              cafeTables: prev.cafeTables.map((t) => {
                if (t.id === parentTableId)
                  return {
                    ...t,
                    orders: [...t.orders, ...moved],
                    openedAt: t.openedAt ?? Date.now(),
                  };
                if (!ids.includes(t.id)) return t;
                return { ...t, orders: [], openedAt: null, customerName: "", notes: "", promoIds: [] };
              }),
            },
            "Gabung tagihan meja kafe",
            `${names.join(", ")} → ${parent.name}`,
          );
        });
        return true;
      },
      unmergeCafeTables: (parentTableId) =>
        update((prev) => {
          const parent = prev.cafeTables.find((t) => t.id === parentTableId);
          if (!parent) return prev;
          const linked = parent.orders.filter((o) => o.linkedFrom);
          if (!linked.length) return prev;
          const backToTable = new Map<string, OrderItem[]>();
          const backToStation = new Map<string, OrderItem[]>();
          for (const order of linked) {
            const from = order.linkedFrom!;
            const bucket = from.type === "table" ? backToTable : backToStation;
            const list = bucket.get(from.id) ?? [];
            list.push(stripLinkTag(order));
            bucket.set(from.id, list);
          }
          const names = linked
            .map((o) => o.linkedFrom!.name)
            .filter((name, i, arr) => arr.indexOf(name) === i);
          return withLog(
            {
              ...prev,
              cafeTables: prev.cafeTables.map((t) => {
                if (t.id === parentTableId)
                  return { ...t, orders: t.orders.filter((o) => !o.linkedFrom) };
                const back = backToTable.get(t.id);
                if (!back) return t;
                return { ...t, orders: [...t.orders, ...back], openedAt: t.openedAt ?? Date.now() };
              }),
              stations: prev.stations.map((s) => {
                const back = backToStation.get(s.id);
                if (!back || !s.session) return s;
                return { ...s, session: { ...s.session, orders: [...s.session.orders, ...back] } };
              }),
            },
            "Lepas gabungan tagihan meja kafe",
            `${names.join(", ")} dilepas dari ${parent.name}`,
          );
        }),
      linkStationToTable: (tableId, stationId) => {
        const tableNow = state.cafeTables.find((t) => t.id === tableId);
        const stationNow = state.stations.find((s) => s.id === stationId);
        if (!tableNow || !stationNow?.session || stationNow.session.paidAt) return false;
        if (stationNow.session.orders.length === 0) return false;
        update((prev) => {
          const table = prev.cafeTables.find((t) => t.id === tableId);
          const station = prev.stations.find((s) => s.id === stationId);
          if (!table || !station?.session || station.session.orders.length === 0) return prev;
          const moved = station.session.orders.map((order, i) =>
            withLinkTag(order, { type: "station", id: station.id, name: station.name }, i),
          );
          return withLog(
            {
              ...prev,
              cafeTables: prev.cafeTables.map((t) =>
                t.id === tableId
                  ? { ...t, orders: [...t.orders, ...moved], openedAt: t.openedAt ?? Date.now() }
                  : t,
              ),
              stations: prev.stations.map((s) =>
                s.id === stationId && s.session
                  ? { ...s, session: { ...s.session, orders: [] } }
                  : s,
              ),
            },
            "Titip pesanan TV ke meja kafe",
            `${station.name} → ${table.name}`,
          );
        });
        return true;
      },
      payOrderItems: (source, orderIds, input) => {
        if (!shiftOpen) return null;
        const at = Date.now();
        const compute = (prev: State): { record: HistoryRecord | null; next: State } => {
          const table =
            source.type === "table"
              ? prev.cafeTables.find((t) => t.id === source.id)
              : undefined;
          const station =
            source.type === "station"
              ? prev.stations.find((s) => s.id === source.id)
              : undefined;
          const orders =
            (source.type === "table" ? table?.orders : station?.session?.orders) ?? [];
          const picked = orders.filter((o) => orderIds.includes(o.id));
          if (picked.length === 0) return { record: null, next: prev };
          const methodsUsed = input.payments?.length
            ? input.payments.map((p) => p.method)
            : [input.payment ?? ""];
          const bill = cafeBill(picked, at, prev, {
            member: Boolean(input.member),
            card: methodsUsed.includes(CARD_PAYMENT_NAME),
          });
          const total = bill.total;
          const splits = input.payments?.length ? input.payments : [];
          const received = splits.length
            ? splits.reduce((sum, p) => sum + p.amount, 0)
            : (input.amountPaid ?? total);
          if (received + 0.5 < total) return { record: null, next: prev };
          const label = splits.length
            ? Array.from(new Set(splits.map((p) => p.method))).join(" + ")
            : input.payment || "Cash";
          const sourceName = table?.name ?? station?.name ?? "";
          const record: HistoryRecord = {
            id: `item-${source.id}-${at}`,
            stationName: sourceName,
            ...(actorRef.current.name ? { cashierName: actorRef.current.name } : {}),
            ...(deviceCode() ? { deviceCode: deviceCode() } : {}),
            console: station?.console ?? "Kafe",
            mode: "prepaid",
            startAt: at,
            endAt: at,
            minutes: 0,
            rentalTotal: 0,
            fnbTotal: bill.fnb,
            total,
            discount: bill.discount,
            payment: label,
            ...(splits.length > 0 ? { payments: splits } : {}),
            customerName:
              table?.customerName || station?.session?.customerName || "Umum",
            packageName: source.type === "station" ? "Pesanan TV" : "Kafe",
            amountPaid: received,
            change: Math.max(0, received - total),
            orders: picked,
            kind: "cafe",
            ...(table ? { tableName: table.name } : {}),
          };
          const keep = (o: OrderItem) => !orderIds.includes(o.id);
          return {
            record,
            next: withLog(
              {
                ...prev,
                history: [record, ...prev.history],
                cafeTables:
                  source.type === "table"
                    ? prev.cafeTables.map((t) =>
                        t.id === source.id ? { ...t, orders: t.orders.filter(keep) } : t,
                      )
                    : prev.cafeTables,
                stations:
                  source.type === "station"
                    ? prev.stations.map((s) =>
                        s.id === source.id && s.session
                          ? {
                              ...s,
                              session: { ...s.session, orders: s.session.orders.filter(keep) },
                            }
                          : s,
                      )
                    : prev.stations,
              },
              "Bayar item pesanan terpilih",
              `${sourceName} · ${picked.length} item · ${formatRupiah(total)} · ${label}`,
            ),
          };
        };
        const { record } = compute(stateRef.current);
        if (!record) return null;
        setState((prev) => compute(prev).next);
        return record;
      },
      transferOrders: (from, to, orderIds) => {
        if (from.type === to.type && from.id === to.id) return false;
        const srcOrders =
          (from.type === "table"
            ? state.cafeTables.find((t) => t.id === from.id)?.orders
            : state.stations.find((s) => s.id === from.id)?.session?.orders) ?? [];
        if (!srcOrders.some((o) => orderIds.includes(o.id))) return false;
        if (to.type === "table") {
          if (!state.cafeTables.some((t) => t.id === to.id)) return false;
        } else {
          const dest = state.stations.find((s) => s.id === to.id);
          if (!dest?.session || dest.session.paidAt) return false;
        }
        update((prev) => {
          const fromName =
            (from.type === "table"
              ? prev.cafeTables.find((t) => t.id === from.id)?.name
              : prev.stations.find((s) => s.id === from.id)?.name) ?? "";
          const toName =
            (to.type === "table"
              ? prev.cafeTables.find((t) => t.id === to.id)?.name
              : prev.stations.find((s) => s.id === to.id)?.name) ?? "";
          const orders =
            (from.type === "table"
              ? prev.cafeTables.find((t) => t.id === from.id)?.orders
              : prev.stations.find((s) => s.id === from.id)?.session?.orders) ?? [];
          const picked = orders.filter((o) => orderIds.includes(o.id));
          if (picked.length === 0) return prev;
          const at = Date.now();
          const moved = picked.map((o, i) => {
            const plain = stripLinkTag(o);
            return { ...plain, id: `${plain.id}-mv-${at}-${i}` };
          });
          return withLog(
            {
              ...prev,
              cafeTables: prev.cafeTables.map((t) => {
                let list = t.orders;
                if (from.type === "table" && t.id === from.id)
                  list = list.filter((o) => !orderIds.includes(o.id));
                if (to.type === "table" && t.id === to.id) list = [...list, ...moved];
                if (list === t.orders) return t;
                return {
                  ...t,
                  orders: list,
                  ...(to.type === "table" && t.id === to.id
                    ? { openedAt: t.openedAt ?? at }
                    : {}),
                };
              }),
              stations: prev.stations.map((s) => {
                if (!s.session) return s;
                let list = s.session.orders;
                if (from.type === "station" && s.id === from.id)
                  list = list.filter((o) => !orderIds.includes(o.id));
                if (to.type === "station" && s.id === to.id) list = [...list, ...moved];
                if (list === s.session.orders) return s;
                return { ...s, session: { ...s.session, orders: list } };
              }),
            },
            "Transfer item pesanan",
            `${picked.length} item: ${fromName} → ${toName}`,
          );
        });
        return true;
      },

      givePromo: (target, promoId) => {
        const at = Date.now();
        const promo = state.promotions.find((p) => p.id === promoId);
        if (!promo || !promoInWindow(promo, at)) return false;
        const kind = promoKind(promo);
        if (target.type === "station") {
          const station = state.stations.find((s) => s.id === target.id);
          if (!station?.session || station.session.paidAt) return false;
          if (station.session.promoIds?.includes(promoId)) return false;
        } else {
          const table = state.cafeTables.find((t) => t.id === target.id);
          if (!table) return false;
          if (table.promoIds?.includes(promoId)) return false;
          // Bonus jam rental hanya berlaku untuk sesi TV.
          if (kind === "bonusHours") return false;
        }
        // Hadiah menu (BOGO & menu gratis) langsung masuk sebagai pesanan harga 0.
        const gift = promo.freeMenuId
          ? state.menu.find((m) => m.id === promo.freeMenuId)
          : undefined;
        const giftLines =
          (kind === "freeMenu" || kind === "bogo") && gift
            ? [freeOrderLine(gift, promo.freeMenuQty ?? 1, promo.name)]
            : [];
        const bonusMin =
          kind === "bonusHours" ? Math.max(0, Math.round((promo.bonusHours ?? 0) * 60)) : 0;
        update((prev) => {
          const name =
            target.type === "station"
              ? (prev.stations.find((s) => s.id === target.id)?.name ?? "TV")
              : (prev.cafeTables.find((t) => t.id === target.id)?.name ?? "Meja");
          const next: State =
            target.type === "station"
              ? {
                  ...prev,
                  stations: prev.stations.map((s) => {
                    if (s.id !== target.id || !s.session) return s;
                    const ids = [...(s.session.promoIds ?? []), promoId];
                    return {
                      ...s,
                      session: {
                        ...s.session,
                        promoIds: ids,
                        orders: [...s.session.orders, ...giftLines],
                        bonusMin: s.session.bonusMin + bonusMin,
                        promoName: [s.session.promoName, promo.name]
                          .filter(Boolean)
                          .join(" · "),
                      },
                    };
                  }),
                }
              : {
                  ...prev,
                  cafeTables: prev.cafeTables.map((t) =>
                    t.id === target.id
                      ? {
                          ...t,
                          promoIds: [...(t.promoIds ?? []), promoId],
                          orders: [...t.orders, ...giftLines],
                          openedAt: t.openedAt ?? at,
                        }
                      : t,
                  ),
                };
          return withLog(
            next,
            "Berikan promo",
            `${promo.name} (${promoKindLabel(kind)}) → ${name}`,
          );
        });
        return true;
      },
      cancelPromo: (target, promoId) =>
        update((prev) => {
          const promo = prev.promotions.find((p) => p.id === promoId);
          if (!promo) return prev;
          const kind = promoKind(promo);
          const giftTag = `${PROMO_FREE_TAG}: ${promo.name}`;
          const dropGift = (orders: OrderItem[]) =>
            orders.filter((o) => !(o.price === 0 && (o.mods ?? []).includes(giftTag)));
          const bonusMin =
            kind === "bonusHours" ? Math.max(0, Math.round((promo.bonusHours ?? 0) * 60)) : 0;
          const name =
            target.type === "station"
              ? (prev.stations.find((s) => s.id === target.id)?.name ?? "TV")
              : (prev.cafeTables.find((t) => t.id === target.id)?.name ?? "Meja");
          const next: State =
            target.type === "station"
              ? {
                  ...prev,
                  stations: prev.stations.map((s) => {
                    if (s.id !== target.id || !s.session) return s;
                    if (!s.session.promoIds?.includes(promoId)) return s;
                    const ids = s.session.promoIds.filter((id) => id !== promoId);
                    const names = (s.session.promoName ?? "")
                      .split(" · ")
                      .filter((n) => n && n !== promo.name);
                    return {
                      ...s,
                      session: {
                        ...s.session,
                        promoIds: ids,
                        orders: dropGift(s.session.orders),
                        bonusMin: Math.max(0, s.session.bonusMin - bonusMin),
                        promoName: names.join(" · "),
                      },
                    };
                  }),
                }
              : {
                  ...prev,
                  cafeTables: prev.cafeTables.map((t) => {
                    if (t.id !== target.id || !t.promoIds?.includes(promoId)) return t;
                    return {
                      ...t,
                      promoIds: t.promoIds.filter((id) => id !== promoId),
                      orders: dropGift(t.orders),
                    };
                  }),
                };
          return withLog(next, "Batalkan promo", `${promo.name} dibatalkan dari ${name}`);
        }),


      addCustomer: (input) => {
        const customer: Customer = { id: `customer-${Date.now()}`, ...input, points: 0, visits: 0, totalSpent: 0, createdAt: Date.now() };
        update((prev) => ({ ...prev, customers: [customer, ...prev.customers] }));
        return customer;
      },
      updateCustomer: (id, patch) => update((prev) => ({ ...prev, customers: prev.customers.map((item) => item.id === id ? { ...item, ...patch } : item) })),
      removeCustomer: (id) => update((prev) => ({ ...prev, customers: prev.customers.filter((item) => item.id !== id) })),
      adjustPoints: (customerId, points, reason) => update((prev) => ({ ...prev, customers: prev.customers.map((item) => item.id === customerId ? { ...item, points: Math.max(0, item.points + points) } : item), pointEntries: [{ id: `point-${Date.now()}`, customerId, points, reason, createdAt: Date.now() }, ...prev.pointEntries] })),
      setPointsPerRupiah: (pointsPerRupiah) => update((prev) => ({ ...prev, pointsPerRupiah: Math.max(1, pointsPerRupiah) })),
      buyPlayingCard: (input) => {
        if (!shiftOpen) return null;
        const cardNumber = input.cardNumber.trim();
        if (!cardNumber) return null;
        if (findCardByNumber(state.playingCards, cardNumber)) return null;
        const cardCode = input.cardCode?.trim() ?? "";
        const cardUid = input.cardUid?.trim() ?? "";
        if (cardUid && findCardByNumber(state.playingCards, cardUid)) return null;
        const now = Date.now();
        const topup = Math.max(0, Math.round(input.topup ?? 0));
        const price = Math.max(0, Math.round(input.price ?? state.cardPrice));
        const holderName = input.customerName?.trim() || "";
        const holderPhone = input.customerPhone?.trim() || "";
        const member = input.member ?? false;

        // Pemegang kartu ikut tercatat di database pelanggan.
        let customerId = input.customerId;
        let newCustomer: Customer | null = null;
        if (!customerId && holderName && holderName.toLowerCase() !== "umum") {
          const existing = state.customers.find(
            (c) =>
              (holderPhone && c.phone.trim() === holderPhone) ||
              c.name.trim().toLowerCase() === holderName.toLowerCase(),
          );
          if (existing) {
            customerId = existing.id;
          } else {
            newCustomer = {
              id: `customer-${now}`,
              name: holderName,
              phone: holderPhone,
              member,
              level: "Bronze",
              points: 0,
              visits: 0,
              totalSpent: 0,
              createdAt: now,
            };
            customerId = newCustomer.id;
          }
        }

        const card: PlayingCard = {
          id: `card-${now}`,
          cardNumber,
          ...(cardCode ? { cardCode } : {}),
          ...(cardUid ? { cardUid } : {}),
          ...(customerId ? { customerId } : {}),
          customerName: holderName || "Umum",
          customerPhone: holderPhone,
          member,
          balance: topup,
          active: true,
          cardPrice: price,
          createdAt: now,
        };
        const entries: CardEntry[] = [
          {
            id: `ce-${now}`,
            cardId: card.id,
            cardNumber: card.cardNumber,
            ...(card.cardCode ? { cardCode: card.cardCode } : {}),
            type: "purchase",
            amount: price,
            balanceAfter: 0,
            note: "Penjualan kartu baru",
            createdAt: now,
          },
        ];
        if (topup > 0) {
          entries.unshift({
            id: `ce-${now}-topup`,
            cardId: card.id,
            cardNumber: card.cardNumber,
            ...(card.cardCode ? { cardCode: card.cardCode } : {}),
            type: "topup",
            amount: topup,
            balanceAfter: topup,
            note: "Top-up awal",
            createdAt: now + 1,
          });
        }
        update((prev) => ({
          ...prev,
          playingCards: [card, ...prev.playingCards],
          cardEntries: [...entries, ...prev.cardEntries],
          cashEntries: (() => {
            const method = input.payment?.trim() || "Cash";
            const rows = [
              cardSaleCashEntry(prev.cashCategories, price, cardNumber, now, method, actorRef.current.name, {
                cardId: card.id,
                cardEntryId: `ce-${now}`,
              }),
              cardTopupCashEntry(prev.cashCategories, topup, cardNumber, now, method, actorRef.current.name, {
                cardId: card.id,
                cardEntryId: `ce-${now}-topup`,
              }),
            ].filter(Boolean) as CashEntry[];
            return rows.length ? [...rows, ...prev.cashEntries] : prev.cashEntries;
          })(),
          customers: newCustomer
            ? [newCustomer, ...prev.customers]
            : customerId
              ? prev.customers.map((c) =>
                  c.id === customerId
                    ? {
                        ...c,
                        ...(holderName ? { name: holderName } : {}),
                        ...(holderPhone ? { phone: holderPhone } : {}),
                        member: c.member || member,
                      }
                    : c,
                )
              : prev.customers,
        }));
        return card;
      },
      updatePlayingCard: (id, patch) =>
        update((prev) => {
          const card = prev.playingCards.find((c) => c.id === id);
          const linkedId = patch.customerId ?? card?.customerId;
          return {
            ...prev,
            playingCards: prev.playingCards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            customers: linkedId
              ? prev.customers.map((c) =>
                  c.id === linkedId
                    ? {
                        ...c,
                        ...(patch.customerName?.trim()
                          ? { name: patch.customerName.trim() }
                          : {}),
                        ...(patch.customerPhone !== undefined
                          ? { phone: patch.customerPhone.trim() }
                          : {}),
                        ...(patch.member !== undefined ? { member: patch.member } : {}),
                      }
                    : c,
                )
              : prev.customers,
          };
        }),

      removePlayingCard: (id) =>
        update((prev) => {
          const card = prev.playingCards.find((c) => c.id === id);
          // Catatan kas yang lahir dari kartu ini ikut dihapus supaya laporan
          // tidak lagi menampilkan uang masuk untuk kartu yang sudah tidak ada.
          const linkedCash = prev.cashEntries.filter((e) => e.cardId === id);
          const cashTotal = linkedCash.reduce((s, e) => s + e.amount, 0);
          return withLog(
            {
              ...prev,
              playingCards: prev.playingCards.filter((c) => c.id !== id),
              cardEntries: prev.cardEntries.filter((e) => e.cardId !== id),
              cashEntries: prev.cashEntries.filter((e) => e.cardId !== id),
            },
            "Hapus playing card",
            `${card?.cardNumber ?? id}${
              linkedCash.length
                ? ` · ${linkedCash.length} catatan kas ${formatRupiah(cashTotal)} ikut dihapus`
                : ""
            }`,
          );
        }),
      topupCard: (id, amount, note, payment) => {
        if (!shiftOpen) return false;
        const value = Math.round(amount);
        const card = state.playingCards.find((c) => c.id === id);
        if (!card || value <= 0) return false;
        const stamp = Date.now();
        const method = payment?.trim() || "Cash";
        update((prev) => ({
          ...prev,
          playingCards: prev.playingCards.map((c) =>
            c.id === id ? { ...c, balance: c.balance + value } : c,
          ),
          cardEntries: [
            {
              id: `ce-${stamp}`,
              cardId: id,
              cardNumber: card.cardNumber,
            ...(card.cardCode ? { cardCode: card.cardCode } : {}),
              type: "topup",
              amount: value,
              balanceAfter: card.balance + value,
              note: `${note?.trim() || "Top-up saldo"} · ${method}`,
              createdAt: stamp,
            },
            ...prev.cardEntries,
          ],
          cashEntries: (() => {
            const row = cardTopupCashEntry(
              prev.cashCategories,
              value,
              card.cardNumber,
              stamp,
              method,
              actorRef.current.name,
              { cardId: id, cardEntryId: `ce-${stamp}` },
            );
            return row ? [row, ...prev.cashEntries] : prev.cashEntries;
          })(),
        }));
        return true;
      },
      adjustCardBalance: (id, amount, note) => {
        if (!shiftOpen) return false;
        const value = Math.round(amount);
        const card = state.playingCards.find((c) => c.id === id);
        if (!card || value === 0) return false;
        const next = card.balance + value;
        if (next < 0) return false;
        const stamp = Date.now();
        update((prev) => ({
          ...prev,
          playingCards: prev.playingCards.map((c) => (c.id === id ? { ...c, balance: next } : c)),
          cardEntries: [
            {
              id: `ce-${stamp}`,
              cardId: id,
              cardNumber: card.cardNumber,
            ...(card.cardCode ? { cardCode: card.cardCode } : {}),
              type: "adjust",
              amount: value,
              balanceAfter: next,
              note: note.trim() || "Penyesuaian saldo",
              createdAt: stamp,
            },
            ...prev.cardEntries,
          ],
        }));
        return true;
      },
      chargeCard: (id, amount, note) => {
        if (!shiftOpen) return false;
        const value = Math.round(amount);
        const card = state.playingCards.find((c) => c.id === id);
        if (!card || !card.active || value <= 0) return false;
        if (card.balance + 0.5 < value) return false;
        const next = card.balance - value;
        const stamp = Date.now();
        update((prev) => ({
          ...prev,
          playingCards: prev.playingCards.map((c) => (c.id === id ? { ...c, balance: next } : c)),
          cardEntries: [
            {
              id: `ce-${stamp}`,
              cardId: id,
              cardNumber: card.cardNumber,
            ...(card.cardCode ? { cardCode: card.cardCode } : {}),
              type: "payment",
              amount: -value,
              balanceAfter: next,
              note: note.trim() || "Pembayaran",
              createdAt: stamp,
            },
            ...prev.cardEntries,
          ],
        }));
        return true;
      },
      setCardPrice: (value) => update((prev) => ({ ...prev, cardPrice: Math.max(0, Math.round(value)) })),
      setCardDiscountPercent: (value) =>
        update((prev) => ({ ...prev, cardDiscountPercent: Math.min(100, Math.max(0, Math.round(value))) })),
      setCardMemberDiscountPercent: (value) =>
        update((prev) => ({ ...prev, cardMemberDiscountPercent: Math.min(100, Math.max(0, Math.round(value))) })),
      setBusinessProfile: (patch) =>
        update((prev) => ({
          ...prev,
          businessProfile: {
            modules: { ...prev.businessProfile.modules, ...(patch.modules ?? {}) },
            salesLabels: { ...prev.businessProfile.salesLabels, ...(patch.salesLabels ?? {}) },
            unitLabel: patch.unitLabel ?? prev.businessProfile.unitLabel,
          },
        })),
      setCardUsbReaderMode: (value) => update((prev) => ({ ...prev, cardUsbReaderMode: Boolean(value) })),
      createCardBackup: (source = "manual") => {
        const cards = state.playingCards ?? [];
        const entries = state.cardEntries ?? [];
        const backup: CardBackup = {
          id: `cardbk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now(),
          source,
          actorName: actorRef.current.name || "-",
          ...(actorRef.current.role ? { actorRole: actorRef.current.role } : {}),
          cardCount: cards.length,
          totalBalance: cards.reduce((sum, c) => sum + (c.balance ?? 0), 0),
          cards: JSON.parse(JSON.stringify(cards)) as PlayingCard[],
          entries: JSON.parse(JSON.stringify(entries)) as CardEntry[],
        };
        update((prev) =>
          withLog(
            {
              ...prev,
              cardBackups: [backup, ...(prev.cardBackups ?? [])].slice(0, CARD_BACKUP_LIMIT),
            },
            source === "closing" ? "Backup kartu otomatis (closing)" : "Buat backup saldo kartu",
            `${backup.cardCount} kartu · total saldo ${formatRupiah(backup.totalBalance)}`,
          ),
        );
        return backup;
      },
      restoreCardBackup: (id, mode) => {
        const backup = (state.cardBackups ?? []).find((b) => b.id === id);
        if (!backup) return false;
        update((prev) =>
          withLog(
            applyCardRestore(prev, backup.cards, backup.entries, mode),
            "Restore backup saldo kartu",
            `${new Date(backup.createdAt).toLocaleString("id-ID")} · ${
              mode === "replace" ? "ganti semua data kartu" : "tambah kartu yang hilang"
            } · ${backup.cardCount} kartu`,
          ),
        );
        return true;
      },
      restoreCardBackupData: (data, mode, label) => {
        const cards = Array.isArray(data.cards) ? data.cards : [];
        if (!cards.length) return false;
        const entries = Array.isArray(data.entries) ? data.entries : [];
        update((prev) =>
          withLog(
            applyCardRestore(prev, cards, entries, mode),
            "Pulihkan saldo kartu dari berkas",
            `${label ? `${label} · ` : ""}${cards.length} kartu · ${
              mode === "replace" ? "ganti semua data kartu" : "tambah kartu yang hilang"
            }`,
          ),
        );
        return true;
      },
      removeCardBackup: (id) =>
        update((prev) => {
          const target = (prev.cardBackups ?? []).find((b) => b.id === id);
          return withLog(
            { ...prev, cardBackups: (prev.cardBackups ?? []).filter((b) => b.id !== id) },
            "Hapus backup saldo kartu",
            target ? new Date(target.createdAt).toLocaleString("id-ID") : id,
          );
        }),
      addBooking: (input) => {
        const conflict = state.bookings.some((item) => item.stationId === input.stationId && item.status !== "cancelled" && item.status !== "completed" && input.startAt < item.endAt && input.endAt > item.startAt);
        if (conflict) return false;
        update((prev) => ({ ...prev, bookings: [{ ...input, id: `booking-${Date.now()}`, status: "confirmed" }, ...prev.bookings] }));
        return true;
      },
      updateBooking: (id, patch) => {
        const current = state.bookings.find((item) => item.id === id);
        if (!current) return false;
        const candidate = { ...current, ...patch };
        const conflict = state.bookings.some((item) => item.id !== id && item.stationId === candidate.stationId && item.status !== "cancelled" && item.status !== "completed" && candidate.startAt < item.endAt && candidate.endAt > item.startAt);
        if (conflict) return false;
        update((prev) => ({ ...prev, bookings: prev.bookings.map((item) => item.id === id ? candidate : item) }));
        return true;
      },
      removeBooking: (id) => update((prev) => ({ ...prev, bookings: prev.bookings.filter((item) => item.id !== id) })),
      addPromotion: (input) => update((prev) => ({ ...prev, promotions: [{ ...input, id: `promo-${Date.now()}` }, ...prev.promotions] })),
      updatePromotion: (id, patch) => update((prev) => ({ ...prev, promotions: prev.promotions.map((item) => item.id === id ? { ...item, ...patch } : item) })),
      removePromotion: (id) => update((prev) => ({ ...prev, promotions: prev.promotions.filter((item) => item.id !== id) })),
      updateHistoryPayment: (id, patch) =>
        update((prev) => {
          const target = prev.history.find((item) => item.id === id);
          return withLog(
            {
              ...prev,
              history: prev.history.map((item) => {
                if (item.id !== id) return item;
                const { payments: _old, ...rest } = item;
                const next: HistoryRecord = { ...rest };
                if (patch.payment !== undefined) next.payment = patch.payment;
                if (patch.payments && patch.payments.length > 0) next.payments = patch.payments;
                return next;
              }),
            },
            "Ubah metode pembayaran nota",
            `${target?.stationName ?? id} · ${target?.payment ?? "-"} → ${patch.payment ?? "-"}`,
          );
        }),
      removeHistory: (id) =>
        update((prev) => {
          const target = prev.history.find((item) => item.id === id);
          return withLog(
            { ...prev, history: prev.history.filter((item) => item.id !== id) },
            "Hapus nota transaksi",
            target
              ? `${target.stationName} · ${target.customerName ?? "Umum"} · ${formatRupiah(target.total)}`
              : id,
          );
        }),
      clearHistory: () =>
        update((prev) =>
          withLog(
            { ...prev, history: [] },
            "Hapus seluruh riwayat nota",
            `${prev.history.length} nota`,
          ),
        ),
      resetTransactions: () =>
        update((prev) =>
          withLog(
            {
              ...prev,
              history: [],
              voids: [],
              pointEntries: [],
              cashEntries: [],
              shifts: [],
              businessDays: [],
              bookings: [],
              playingCards: [],
              cardEntries: [],
              logEntries: [],
              stations: prev.stations.map((station) => ({
                ...station,
                session: null,
              })),
              cafeTables: prev.cafeTables.map((table) => ({
                ...table,
                customerName: "",
                notes: "",
                openedAt: null,
                orders: [],
              })),
            },
            "Reset semua transaksi",
            `${prev.history.length} nota · ${prev.cashEntries.length} catatan kas · ${prev.bookings.length} reservasi · ${prev.playingCards.length} playing card`,
          ),
        ),

      addCashCategory: (input) => {
        const name = input.name.trim();
        if (!name) return null;
        const exists = state.cashCategories.some(
          (item) =>
            item.direction === input.direction &&
            item.name.trim().toLowerCase() === name.toLowerCase(),
        );
        if (exists) return null;
        const row: CashCategory = {
          id: `cash-cat-${Date.now()}`,
          name,
          direction: input.direction,
          payout: input.account ? isPayoutAccount(input.account) : Boolean(input.payout),
          ...(input.account ? { account: input.account } : {}),
          group: input.group?.trim() ? input.group.trim() : "Lainnya",
          active: true,
        };
        update((prev) => ({ ...prev, cashCategories: [...prev.cashCategories, row] }));
        return row;
      },
      updateCashCategory: (id, patch) =>
        update((prev) => ({
          ...prev,
          cashCategories: prev.cashCategories.map((item) => {
            if (item.id !== id) {
              // Satu modul hanya boleh dipetakan ke satu item.
              return patch.mapFor && item.mapFor === patch.mapFor
                ? (({ mapFor: _drop, ...rest }) => rest)(item)
                : item;
            }
            const next = { ...item, ...patch };
            if (patch.account) next.payout = isPayoutAccount(patch.account);
            return next;
          }),
        })),
      removeCashCategory: (id) =>
        update((prev) =>
          withLog(
            { ...prev, cashCategories: prev.cashCategories.filter((item) => item.id !== id) },
            "Hapus item kas",
            prev.cashCategories.find((item) => item.id === id)?.name ?? id,
          ),
        ),
      addCashGroup: (input) => {
        const name = input.name.trim();
        if (!name) return null;
        const exists = state.cashGroups.some(
          (row) =>
            row.direction === input.direction &&
            row.name.trim().toLowerCase() === name.toLowerCase(),
        );
        if (exists) return null;
        const row: CashGroup = {
          id: `cash-group-${Date.now()}`,
          name,
          direction: input.direction,
          active: true,
          sort: state.cashGroups.length,
        };
        update((prev) => ({ ...prev, cashGroups: [...prev.cashGroups, row] }));
        return row;
      },
      updateCashGroup: (id, patch) =>
        update((prev) => {
          const current = prev.cashGroups.find((row) => row.id === id);
          if (!current) return prev;
          const nextName = patch.name?.trim() ? patch.name.trim() : current.name;
          return {
            ...prev,
            cashGroups: prev.cashGroups.map((row) =>
              row.id === id ? { ...row, ...patch, name: nextName } : row,
            ),
            cashCategories: prev.cashCategories.map((item) =>
              item.direction === current.direction && item.group === current.name
                ? { ...item, group: nextName }
                : item,
            ),
          };
        }),
      removeCashGroup: (id) => {
        const row = state.cashGroups.find((g) => g.id === id);
        if (!row) return false;
        const used = state.cashCategories.some(
          (item) => item.direction === row.direction && item.group === row.name,
        );
        if (used) return false;
        update((prev) => ({
          ...prev,
          cashGroups: prev.cashGroups.filter((g) => g.id !== id),
        }));
        return true;
      },
      addCashEntry: (input) => {
        if (!shiftOpen) return null;
        const category = input.source
          ? resolveModuleCategory(state.cashCategories, input.source)
          : state.cashCategories.find((item) => item.id === input.categoryId);
        const amount = Math.max(0, Math.round(input.amount));
        if (!category || amount <= 0) return null;
        const row: CashEntry = {
          id: `cash-${Date.now()}`,
          categoryId: category.id,
          categoryName: category.name,
          group: category.group,
          direction: category.direction,
          payout: categoryAccount(category) === "payin" || categoryAccount(category) === "payout",
          account: categoryAccount(category),
          ...(input.source ? { source: input.source } : {}),
          amount,
          payment: input.payment?.trim() ? input.payment.trim() : "Cash",
          note: input.note?.trim() ?? "",
          createdAt: input.createdAt ?? Date.now(),
          ...(actorRef.current.name ? { createdBy: actorRef.current.name } : {}),
        };
        update((prev) => ({ ...prev, cashEntries: [row, ...prev.cashEntries] }));
        return row;
      },
      updateCashEntry: (id, patch) =>
        update((prev) => {
          const before = prev.cashEntries.find((item) => item.id === id);
          const next = {
            ...prev,
            cashEntries: prev.cashEntries.map((item) => {
              if (item.id !== id) return item;
              const category = patch.categoryId
                ? prev.cashCategories.find((c) => c.id === patch.categoryId)
                : undefined;
              return {
                ...item,
                ...(patch.amount !== undefined ? { amount: Math.max(0, Math.round(patch.amount)) } : {}),
                ...(patch.payment !== undefined ? { payment: patch.payment } : {}),
                ...(patch.note !== undefined ? { note: patch.note } : {}),
                ...(category
                  ? {
                      categoryId: category.id,
                      categoryName: category.name,
                      group: category.group,
                      direction: category.direction,
                      payout: isPayoutAccount(categoryAccount(category)),
                      account: categoryAccount(category),
                    }
                  : {}),
              };
            }),
            // Riwayat kartu ikut menyesuaikan metode bayar yang baru.
            cardEntries:
              before?.cardEntryId && patch.payment !== undefined
                ? prev.cardEntries.map((e) =>
                    e.id === before.cardEntryId
                      ? {
                          ...e,
                          note: `${e.note.split(" · ")[0] ?? e.note} · ${patch.payment}`,
                        }
                      : e,
                  )
                : prev.cardEntries,
          };
          if (!before) return next;
          const changes: string[] = [];
          if (patch.payment !== undefined && patch.payment !== before.payment)
            changes.push(`metode ${before.payment} → ${patch.payment}`);
          if (patch.amount !== undefined && Math.round(patch.amount) !== before.amount)
            changes.push(
              `jumlah ${formatRupiah(before.amount)} → ${formatRupiah(Math.round(patch.amount))}`,
            );
          if (patch.note !== undefined && patch.note !== before.note) changes.push("catatan diubah");
          if (!changes.length) return next;
          return withLog(
            next,
            "Ubah catatan kas",
            `${before.categoryName} · ${changes.join(", ")}`,
          );
        }),
      removeCashEntry: (id) =>
        update((prev) => {
          const target = prev.cashEntries.find((item) => item.id === id);
          if (!target) return prev;
          // Kalau catatan ini lahir dari kartu, riwayat dan saldo kartu ikut
          // dikembalikan supaya semua laporan tetap cocok satu sama lain.
          const linked = target.cardEntryId
            ? prev.cardEntries.find((e) => e.id === target.cardEntryId)
            : undefined;
          const revert = linked?.type === "topup" ? linked.amount : 0;
          return withLog(
            {
              ...prev,
              cashEntries: prev.cashEntries.filter((item) => item.id !== id),
              cardEntries: linked
                ? prev.cardEntries.filter((e) => e.id !== linked.id)
                : prev.cardEntries,
              playingCards:
                revert > 0 && target.cardId
                  ? prev.playingCards.map((c) =>
                      c.id === target.cardId
                        ? { ...c, balance: Math.max(0, c.balance - revert) }
                        : c,
                    )
                  : prev.playingCards,
            },
            "Hapus catatan kas",
            `${target.categoryName} · ${formatRupiah(target.amount)}${
              revert > 0 ? ` · saldo kartu dikurangi ${formatRupiah(revert)}` : ""
            }`,
          );
        }),
      openShift: (input) => {
        if (typeof window !== "undefined")
          window.setTimeout(() => window.dispatchEvent(new Event("rentoplay:shift-change")), 0);
        const name = input.cashierName.trim();
        if (!name) return null;
        if (state.shifts.some((s) => !s.closedAt)) return null;
        const stamp = Date.now();
        const row: CashShift = {
          id: `shift-${stamp}`,
          cashierName: name,
          ...(input.cashierId ? { cashierId: input.cashierId } : {}),
          openedAt: stamp,
          startCash: Math.max(0, Math.round(input.startCash)),
        };
        // Shift pertama sekaligus membuka hari usaha baru — termasuk setelah
        // Manager melakukan End of Day lebih awal. Hari usaha yang sudah
        // ditutup tidak ditutup lagi oleh sistem, jadi tidak ada EOD dobel.
        const openDay =
          (state.businessDays ?? []).some((d) => !d.closedAt)
          ? null
          : ({ id: `bday-${stamp}`, openedAt: stamp } satisfies BusinessDay);
        update((prev) => {
          const next = withLog(
            {
              ...prev,
              shifts: [row, ...prev.shifts],
              ...(openDay
                ? { businessDays: [openDay, ...(prev.businessDays ?? [])] }
                : {}),
            },
            "Buka shift kasir",
            `${name} · kas awal ${formatRupiah(row.startCash)}`,
          );
          return openDay
            ? withLog(
                next,
                "Buka hari usaha",
                new Date(stamp).toLocaleString("id-ID"),
              )
            : next;
        });
        return row;
      },
      closeShift: (id, input) => {
        if (typeof window !== "undefined")
          window.setTimeout(() => window.dispatchEvent(new Event("rentoplay:shift-change")), 0);
        const shift = state.shifts.find((s) => s.id === id);
        if (!shift || shift.closedAt) return null;
        const closeAt = Date.now();
        const closed: CashShift = {
          ...shift,
          closedAt: closeAt,
          snapshot: shiftSummary(
            shift,
            [...state.history, ...pendingPaymentRecords(state)],
            state.cashEntries,
            closeAt,
          ),
          cashActual: Math.max(0, Math.round(input.cashActual)),
          balanceNote: input.balanceNote?.trim() ?? "",
          nextStartCash: Math.max(0, Math.round(input.nextStartCash ?? 0)),
          closedByName: actorRef.current.name || shift.cashierName,
          ...(user?.id ? { closedById: user.id } : {}),
        };
        update((prev) => {
          // Setelah close out, data kartu langsung dicadangkan otomatis.
          const cards = prev.playingCards ?? [];
          const backup: CardBackup = {
            id: `cardbk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: Date.now(),
            source: "closing",
            actorName: closed.closedByName || closed.cashierName,
            ...(actorRef.current.role ? { actorRole: actorRef.current.role } : {}),
            cardCount: cards.length,
            totalBalance: cards.reduce((sum, c) => sum + (c.balance ?? 0), 0),
            cards: JSON.parse(JSON.stringify(cards)) as PlayingCard[],
            entries: JSON.parse(JSON.stringify(prev.cardEntries ?? [])) as CardEntry[],
          };
          return withLog(
            withLog(
              {
                ...prev,
                shifts: prev.shifts.map((s) => (s.id === id ? closed : s)),
                cardBackups: [backup, ...(prev.cardBackups ?? [])].slice(0, CARD_BACKUP_LIMIT),
              },
              "Tutup shift kasir",
              `${closed.cashierName} · ditutup oleh ${closed.closedByName || "-"} · kas fisik ${formatRupiah(closed.cashActual ?? 0)}`,
            ),
            "Backup kartu otomatis (closing)",
            `${backup.cardCount} kartu · total saldo ${formatRupiah(backup.totalBalance)}`,
          );
        });
        return closed;
      },
      activeBusinessDay,
      closeBusinessDay: (input) => {
        const day = (state.businessDays ?? []).find((d) => !d.closedAt);
        if (!day) return null;
        if (state.shifts.some((s) => !s.closedAt)) return null;
        const closed: BusinessDay = {
          ...day,
          closedAt: Date.now(),
          closedByName: actorRef.current.name || "Manager",
          ...(user?.id ? { closedById: user.id } : {}),
          ...(input?.note?.trim() ? { note: input.note.trim() } : {}),
        };
        update((prev) =>
          withLog(
            {
              ...prev,
              businessDays: (prev.businessDays ?? []).map((d) =>
                d.id === day.id ? closed : d,
              ),
            },
            "End of Day lebih awal (Manager)",
            `Hari usaha ${new Date(day.openedAt).toLocaleDateString("id-ID")} ditutup oleh ${closed.closedByName}${closed.note ? ` · ${closed.note}` : ""}. End of Day otomatis jam tutup dilewati.`,
          ),
        );
        return closed;
      },
      setOperatingHours: (patch) =>
        update((prev) => {
          const hours = normalizeHours({ ...prev.operatingHours, ...patch });
          return withLog(
            { ...prev, operatingHours: hours },
            "Ubah jam operasional store",
            `Buka ${hours.openHour}:00 · Tutup ${hours.closeHour}:00`,
          );
        }),
      setSessionSecurity: (patch) =>
        update((prev) => {
          const next = normalizeSessionSecurity({ ...prev.sessionSecurity, ...patch });
          return withLog(
            { ...prev, sessionSecurity: next },
            "Ubah keamanan sesi",
            `${next.idleMinutes === 0 ? "Keluar otomatis dimatikan" : `Keluar otomatis ${next.idleMinutes} menit`} · Alarm ${next.alarmEnabled ? next.alarmSound : "mati"}`,
          );
        }),
      exportSnapshot: () => JSON.parse(JSON.stringify(state)) as State,

      replaceAll: (data) => {
        // Pemulihan dari berkas cadangan memang dimaksudkan menimpa pusat.
        markSettingsDirty("consoleTypes", "rates", "consoleDiscounts");
        setState(migrateState(data));
        update((prev) => withLog(prev, "Pulihkan data dari berkas cadangan"));
      },
      resetAll: () => {
        setState(JSON.parse(JSON.stringify(defaultState)) as State);
        update((prev) => withLog(prev, "Reset seluruh data aplikasi"));
      },
      addLog,
      sync,
    }),
    [
      state,
      printerPrefs,
      now,
      activeShift,
      activeBusinessDay,
      shiftOpen,
      sync,
      startSessionWithRate,
      stopSession,
      settleSession,
      removeSettlement,

      addTime,
      addOrder,
      removeOrder,
      update,
      mapStation,
      withLog,
      addLog,
    ],
  );

  // Catat perubahan pengaturan dan data induk ke Log Book tanpa perlu
  // menyentuh setiap fungsi satu per satu.
  const logChange = useCallback(
    (info: LogInfo) => {
      update((prev) => {
        const last = prev.logEntries?.[0];
        if (
          info.coalesce &&
          last &&
          last.action === info.action &&
          last.actor === actorRef.current.name &&
          Date.now() - last.at < 120_000
        ) {
          return {
            ...prev,
            logEntries: [
              { ...last, at: Date.now(), detail: info.detail ?? "" },
              ...(prev.logEntries ?? []).slice(1),
            ],
          };
        }
        return withLog(prev, info.action, info.detail ?? "");
      });
    },
    [update, withLog],
  );

  const loggedValue = useMemo<Ctx>(() => {
    const out = { ...value } as Record<string, unknown>;
    for (const [name, describe] of Object.entries(LOG_DESCRIBERS)) {
      const fn = (value as unknown as Record<string, unknown>)[name];
      if (typeof fn !== "function") continue;
      out[name] = (...args: unknown[]) => {
        if (!deviceWriteAllowed()) {
          toast.error("Perangkat tidak terdaftar", {
            description: DEVICE_BLOCKED_MESSAGE,
            duration: 10000,
          });
          return undefined;
        }
        const before = stateRef.current;
        const result = (fn as (...a: unknown[]) => unknown)(...args);
        const info = describe(args, before, result);
        if (info) logChange(info);
        return result;
      };
    }
    return out as unknown as Ctx;
  }, [value, logChange]);

  return (
    <BillingContext.Provider value={loggedValue}>{children}</BillingContext.Provider>

  );
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling harus dipakai di dalam BillingProvider");
  return ctx;
}

export function playAlarm() {
  try {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtor();
    const beep = (start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.25);
    };
    [0, 0.35, 0.7].forEach(beep);
  } catch {
    /* audio not available */
  }
}


/** Sebutan unit sewa store ini (bawaan "TV"). */
export function useUnitLabel() {
  return useBilling().businessProfile.unitLabel.trim() || "TV";
}
