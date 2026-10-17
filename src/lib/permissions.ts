/**
 * Daftar level pengguna dan hak akses per menu/fitur.
 * Installer selalu punya akses penuh dan tidak bisa dibatasi.
 */

export type AppRole =
  | "installer"
  | "manager"
  | "admin"
  | "finance"
  | "kasir"
  | "operator";

export const ALL_ROLES: AppRole[] = [
  "installer",
  "manager",
  "finance",
  "kasir",
  "operator",
];

export const roleLabel: Record<AppRole, string> = {
  installer: "Installer",
  manager: "Manager",
  admin: "Admin (lama)",
  finance: "Finance",
  kasir: "Kasir",
  operator: "Operator",
};

export type PermissionItem = { key: string; label: string };
export type PermissionGroup = { label: string; items: PermissionItem[] };

/** Menu utama: path -> kunci hak akses. */
export const MENU_PERMISSION: Record<string, string> = {
  "/": "menu.dashboard",
  "/kasir": "menu.kasir",
  "/shift": "menu.shift",
  "/kafe": "menu.kafe",
  "/booking": "menu.booking",
  "/pelanggan": "menu.pelanggan",
  "/promo": "menu.promo",
  "/kartu": "menu.kartu",
  "/kas": "menu.kas",
  "/payinout": "menu.kas",
  "/pembayaran": "menu.pembayaran",
  "/tarif": "menu.tarif",
  "/station": "menu.station",
  "/laporan": "menu.laporan",
  "/pengguna": "menu.pengguna",
  "/backup": "menu.backup",
  "/printer": "menu.printer",
  "/store": "menu.store",
  "/akun": "menu.akun",
  "/tema": "menu.tema",
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Menu utama",
    items: [
      { key: "menu.dashboard", label: "Dashboard" },
      { key: "menu.kasir", label: "Kasir (lama)" },
      { key: "menu.shift", label: "Kasir" },
      { key: "menu.kafe", label: "Kafe" },
      { key: "menu.booking", label: "Reservasi" },
      { key: "menu.pelanggan", label: "Membership" },
      { key: "menu.promo", label: "Promo" },
      { key: "menu.kartu", label: "Playing Card" },
      { key: "menu.kas", label: "Finance" },
      { key: "menu.pembayaran", label: "Payment" },
      { key: "menu.tarif", label: "Pricing" },
      { key: "menu.station", label: "Station" },
      { key: "menu.laporan", label: "Reports" },
      { key: "menu.pengguna", label: "User" },
      { key: "menu.printer", label: "Printer & Cetak" },
      { key: "menu.backup", label: "Backup" },
      { key: "menu.store", label: "Store" },
      { key: "menu.akun", label: "Password" },
      { key: "menu.tema", label: "Tema Tampilan" },
    ],
  },
  {
    label: "Sub menu Laporan",
    items: [
      { key: "laporan.receipt", label: "Laporan Receipt" },
      { key: "laporan.company", label: "Company Report" },
      { key: "laporan.card", label: "Laporan Playing Card" },
      { key: "laporan.shift", label: "Cash Close Out" },
      { key: "laporan.expense", label: "Expense Reports" },
      { key: "laporan.membership", label: "Laporan Membership" },
      { key: "laporan.qris", label: "Pembayaran QRIS" },
      { key: "laporan.transfer", label: "Transfer Bank" },
      { key: "laporan.kasir", label: "Laporan Transaksi per Kasir" },
      { key: "laporan.logbook", label: "Log Book Aktivitas" },
      { key: "laporan.statistik", label: "Statistik Terlaris" },
      { key: "laporan.void", label: "Laporan VOID" },
      { key: "laporan.perangkat", label: "Laporan Transaksi per Perangkat" },
      { key: "laporan.hapus", label: "Hapus data laporan" },
      { key: "laporan.cetak", label: "Cetak laporan" },
      { key: "laporan.excel", label: "Ekspor Excel / kirim ke email" },
    ],
  },
  {
    label: "Sesi rental",
    items: [
      { key: "sesi.mulai", label: "Mulai sesi rental" },
      { key: "sesi.tambahwaktu", label: "Tambah waktu (berbayar)" },
      { key: "sesi.kurangiwaktu", label: "Kurangi waktu (berbayar)" },
      { key: "sesi.ekstra", label: "Waktu ekstra tanpa biaya" },
      { key: "sesi.jeda", label: "Jeda / lanjutkan timer" },
      { key: "sesi.pindah", label: "Pindah Station / ganti konsol" },
      { key: "sesi.ubahpelanggan", label: "Ubah data pelanggan sesi" },
      { key: "sesi.addon", label: "Tambah Additional Rental" },
      { key: "sesi.hapusaddon", label: "Hapus item Additional Rental" },
      { key: "sesi.order", label: "Tambah order makanan & minuman" },
      { key: "sesi.hapusorder", label: "Hapus / batalkan item pesanan" },
      { key: "sesi.promo", label: "Terapkan / batalkan promo" },
      { key: "sesi.diskon", label: "Beri diskon" },
      { key: "sesi.gabung", label: "Gabung tagihan TV & meja" },
      { key: "sesi.bayar", label: "Terima pembayaran" },
      { key: "sesi.split", label: "Split bill (beberapa metode)" },
      { key: "sesi.batalbayar", label: "Batalkan pembayaran yang sudah masuk" },
      { key: "sesi.akhiri", label: "Akhiri sesi" },
      { key: "sesi.void", label: "VOID transaksi Station" },
      { key: "station.release", label: "Release layar TV saat waktu habis" },
      { key: "cetak.struk", label: "Cetak struk / invoice" },
      { key: "cetak.label", label: "Cetak label dapur / bar" },
    ],
  },
  {
    label: "Kasir & kas",
    items: [
      { key: "shift.checkin", label: "Check-in shift" },
      { key: "shift.closeout", label: "Cash close out" },
      { key: "kas.tambah", label: "Catat Finance (Other Revenue, Expenses, Pay-In, Pay-Out)" },
      { key: "kas.hapus", label: "Hapus catatan Finance" },
      { key: "kartu.jual", label: "Jual Playing Card" },
      { key: "kartu.topup", label: "Top up saldo kartu" },
      { key: "kartu.backup", label: "Buat / unduh backup saldo kartu" },
      { key: "kartu.restore", label: "Restore backup saldo kartu" },
      { key: "kartu.hapusbackup", label: "Hapus backup saldo kartu" },
    ],
  },
  {
    label: "Meja kafe",
    items: [
      { key: "kafe.order", label: "Tambah order meja kafe" },
      { key: "kafe.hapusorder", label: "Hapus / batalkan item pesanan meja" },
      { key: "kafe.promo", label: "Terapkan / batalkan promo meja" },
      { key: "kafe.diskon", label: "Beri diskon meja" },
      { key: "kafe.gabung", label: "Gabung / lepas gabungan tagihan meja" },
      { key: "kafe.pindahmeja", label: "Pindahkan pesanan ke meja lain" },
      { key: "kafe.bayar", label: "Terima pembayaran meja kafe" },
      { key: "kafe.split", label: "Split bill meja kafe" },
      { key: "kafe.akhiri", label: "Akhiri sesi meja kafe" },
      { key: "kafe.void", label: "VOID pesanan meja kafe" },
    ],
  },
  {
    label: "Reservasi",
    items: [
      { key: "booking.buat", label: "Buat reservasi" },
      { key: "booking.ubah", label: "Ubah reservasi" },
      { key: "booking.checkin", label: "Check-in reservasi" },
      { key: "booking.batal", label: "Batalkan reservasi" },
      { key: "booking.hapus", label: "Hapus reservasi" },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { key: "tarif.ubah", label: "Ubah tarif, Station & notifikasi TV" },
      { key: "promo.kelola", label: "Kelola promo" },
      { key: "pelanggan.kelola", label: "Kelola data pelanggan" },
      { key: "pembayaran.kelola", label: "Kelola metode pembayaran" },
      { key: "pengguna.kelola", label: "Tambah / ubah pengguna" },
      { key: "pengguna.hakakses", label: "Atur hak akses per level" },
      { key: "backup.export", label: "Backup data (unduh)" },
      { key: "backup.import", label: "Pulihkan data" },
      { key: "backup.reset", label: "Reset ke pengaturan awal" },
      { key: "store.ubah", label: "Ubah data store" },
      { key: "printer.kelola", label: "Atur printer & layout cetak" },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.key),
);

const managerDefaults = ALL_PERMISSIONS.filter(
  (key) => key !== "store.ubah" && key !== "pengguna.hakakses",
);

/** Hak akses awal untuk setiap level (Installer selalu penuh). */
export const defaultRolePermissions: Record<AppRole, string[]> = {
  installer: ALL_PERMISSIONS,
  manager: managerDefaults,
  admin: managerDefaults,
  finance: [
    "menu.dashboard",
    "menu.laporan",
    "menu.kas",
    "menu.pembayaran",
    "menu.kartu",
    "menu.akun",
    "menu.tema",
    "laporan.receipt",
    "laporan.company",
    "laporan.card",
    "laporan.shift",
    "laporan.expense",
    "laporan.membership",
    "laporan.qris",
    "laporan.transfer",
    "laporan.logbook",
    "laporan.statistik",
    "laporan.void",
    "laporan.perangkat",
    "kas.tambah",
    "kartu.topup",
    "kartu.backup",
    "pembayaran.kelola",
    "backup.export",
    "laporan.cetak",
    "laporan.excel",
    "kas.hapus",
  ],
  kasir: [
    "menu.dashboard",
    "menu.kasir",
    "menu.shift",
    "menu.kafe",
    "menu.booking",
    "menu.pelanggan",
    "menu.kartu",
    "menu.kas",
    "menu.akun",
    "menu.tema",
    "sesi.mulai",
    "sesi.tambahwaktu",
    "sesi.bayar",
    "sesi.akhiri",
    "shift.checkin",
    "shift.closeout",
    "kas.tambah",
    "kartu.jual",
    "kartu.topup",
    "kartu.backup",
    "pelanggan.kelola",
    "cetak.struk",
    "cetak.label",
    "sesi.ekstra",
    "sesi.jeda",
    "sesi.pindah",
    "sesi.ubahpelanggan",
    "sesi.addon",
    "sesi.hapusaddon",
    "sesi.order",
    "sesi.hapusorder",
    "sesi.promo",
    "sesi.gabung",
    "sesi.split",
    "station.release",
    "kafe.order",
    "kafe.hapusorder",
    "kafe.promo",
    "kafe.gabung",
    "kafe.pindahmeja",
    "kafe.bayar",
    "kafe.split",
    "kafe.akhiri",
    "booking.buat",
    "booking.ubah",
    "booking.checkin",
    "booking.batal",
  ],
  operator: [
    "menu.dashboard",
    "menu.kasir",
    "menu.kafe",
    "menu.akun",
    "menu.tema",
    "sesi.mulai",
    "sesi.tambahwaktu",
    "sesi.ekstra",
    "sesi.order",
    "sesi.addon",
    "kafe.order",
    "cetak.label",
    "station.release",
  ],
};

export type RolePermissions = Partial<Record<string, string[]>>;

/**
 * Hak akses baru yang ditambahkan setelah pengaturan lama tersimpan.
 * Bila store sudah punya pengaturan sendiri, hak akses baru ini tetap
 * mengikuti bawaan levelnya supaya tidak ada fitur yang tiba-tiba hilang.
 */
const ADDED_PERMISSIONS: string[] = [
  "menu.station",
  "station.release",
  "laporan.excel",
  "sesi.kurangiwaktu",
  "sesi.ekstra",
  "sesi.jeda",
  "sesi.pindah",
  "sesi.ubahpelanggan",
  "sesi.addon",
  "sesi.hapusaddon",
  "sesi.order",
  "sesi.hapusorder",
  "sesi.promo",
  "sesi.gabung",
  "sesi.split",
  "sesi.batalbayar",
  "sesi.void",
  "kas.hapus",
  "kafe.order",
  "kafe.hapusorder",
  "kafe.promo",
  "kafe.diskon",
  "kafe.gabung",
  "kafe.pindahmeja",
  "kafe.bayar",
  "kafe.split",
  "kafe.akhiri",
  "kafe.void",
  "booking.buat",
  "booking.ubah",
  "booking.checkin",
  "booking.batal",
  "booking.hapus",
];

/** Hak akses yang berlaku untuk sebuah level (pengaturan Installer menimpa default). */
export function permissionsOf(
  role: AppRole | null,
  overrides: RolePermissions | undefined,
): string[] {
  if (!role) return [];
  if (role === "installer") return ALL_PERMISSIONS;
  const saved = overrides?.[role];
  const fallback = defaultRolePermissions[role] ?? [];
  if (!saved) return fallback;
  const missing = ADDED_PERMISSIONS.filter(
    (key) => fallback.includes(key) && !saved.includes(key),
  );
  return missing.length > 0 ? [...saved, ...missing] : saved;
}

export function can(
  role: AppRole | null,
  key: string,
  overrides?: RolePermissions,
): boolean {
  if (role === "installer") return true;
  // Manager selalu boleh membuka informasi dan pengaturan operasional store,
  // termasuk bila hak akses lama tersimpan sebelum menu Store dibuka untuk Manager.
  if ((role === "manager" || role === "admin") && key === "menu.store") return true;
  return permissionsOf(role, overrides).includes(key);
}
