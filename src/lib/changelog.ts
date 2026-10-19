/**
 * Riwayat perubahan aplikasi (Change Log).
 * Tambahkan entri baru PALING ATAS setiap kali merilis versi baru.
 * Ditampilkan di halaman /kontrol (Pusat Kontrol Developer).
 */
export type ChangelogEntry = {
  version: string;
  date: string; // format: "YYYY-MM-DD"
  changes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.6",
    date: "2026-10-19",
    changes: [
      "Tema Putih baru dengan warna lebih kontras di semua tema.",
      "Kartu TV satu latar netral; nama Station hitam (tema terang) / putih (tema gelap).",
      "Setup Station, Kafe, dan Store dirapikan menjadi tab per bagian.",
      "IP Layar TV digabung ke dalam detail Daftar Station.",
      "Volume TV dan pilihan HDMI selalu terlihat di panel Station; status dibaca otomatis.",
      "Seluruh kontrol TV dilipat ke dalam bagian \"Setup TV\" agar panel kasir ringkas.",
    ],
  },
  {
    version: "v1.5.1",
    date: "2026-10-12",
    changes: [
      "TV Companion: izin WAKE_LOCK ditambahkan, wake lock ditahan 10 detik.",
      "Kasir menunggu konfirmasi nyata dari TV saat menyalakan (bukan hanya WoL).",
    ],
  },
  {
    version: "v1.5",
    date: "2026-10-10",
    changes: [
      "Perintah \"bangun\" ke TV Companion via HTTP (PowerManager + setTurnScreenOn).",
      "Pengaturan Global TV: pola remote, judul & ucapan sambutan, splash.",
      "Daftar Station menjadi accordion ringkas (nama unit + IP).",
    ],
  },
  {
    version: "v1.4",
    date: "2026-09-25",
    changes: [
      "Standby TV dari kasir via HTTP port 8765 + pairing kode 6 angka.",
      "Pola arah D-Pad sebagai alternatif PIN remote (5 salah → jeda 30 detik).",
      "Layar hitam penuh 100% saat waktu habis.",
    ],
  },
  {
    version: "v1.3",
    date: "2026-09-19",
    changes: [
      "Backup & restore Playing Card.",
      "Laporan Excel ke Google Drive dan email store.",
      "Pembaca NFC eksternal USB untuk tablet tanpa NFC.",
    ],
  },
  {
    version: "v1.2",
    date: "2026-09-16",
    changes: [
      "End of Day (siklus hari usaha) dan rekap kas per tanggal.",
      "Kategori kas dikelola sendiri per store (Account Mapping).",
      "Pembatasan akses daftar kode perangkat per store.",
    ],
  },
  {
    version: "v1.1",
    date: "2026-09-13",
    changes: [
      "Aplikasi Android dengan cetak Bluetooth langsung (tanpa RawBT).",
      "Offline sync: antrean intent atomik store_apply_intents.",
    ],
  },
  {
    version: "v1.0",
    date: "2026-09-11",
    changes: [
      "Rilis perdana: billing timer rental, kafe, kasir/shift, multi-store, laporan, hak akses.",
    ],
  },
];
