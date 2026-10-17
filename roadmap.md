# Roadmap

- [x] Temuan monitoring: logo alarm dipisahkan dari PendingIntent dan dipulihkan receiver, DP tetap di PAY-IN periode penerimaan; jarak cetak sudah benar dua baris kosong (temuan stale). 19 tes Bun dan uji JVM bridge/receiver dengan logo 1,8 juta karakter lulus; build OK. APK Kasir 1.4.1 perlu dibuild/install ulang; uji TV/printer fisik belum dilakukan.

- [x] Tutup akses pemesanan Kafe di panel Station ketika modul mati, pertahankan tagihan lama dan Additional Rental; hapus TV/Table Connect lama dari Setup tanpa mengubah APK Companion. Dua belas tes lulus; sesi berjalan diuji dengan perubahan modul lokal tanpa menyimpan ke store.

- [x] Ringkaskan notifikasi TV, overlay habis 95%, judul/tiga baris pesan, logo lebih tajam dengan pilihan hapus latar polos; ZIP Kasir 1.3.0 dan Companion 1.2.0 siap. Delapan tes lulus dan pengaturan tersimpan melalui layar Station; kompilasi serta uji TV fisik belum dilakukan.

- [x] Perbaiki pemilihan logo di APK kasir, logo pada notifikasi TV, dan Release di samping Pause hanya saat waktu habis; ZIP Android terbaru disiapkan. Aturan Release lulus 3 tes, pemilih logo web terbuka; build/install Android dan uji layar TV menunggu perangkat pengguna.

- [x] Koreksi cetak Bluetooth: bill/struk mempertahankan jarak lama + dua baris; label satu baris + cutter terpisah dari ukuran kertas (data kiriman teruji; hasil fisik menunggu printer pengguna).

- [x] 1. Data Store: hapus hint versi, Manager/Installer boleh ubah perangkat, wildcard IP `192.168.80.*`
- [x] 2. Judul Setup & Report lebih tebal + warna aksen
- [x] 3. Setup berbentuk tabel + panel detail (Kafe menu & meja, Setup Price, Promo, Payment, Printer, Finance, Membership, Playing Card, User)
- [x] 4. Playing Card: tabel Data & Saldo + panel detail berisi riwayat transaksi
- [x] 5. Panel pembayaran TV: Additional Rental jadi dropdown
- [x] 6. Card TV & meja kafe: nama default Umum, picker hanya pelanggan terdaftar, draft order + tombol Sent Order, hapus order tercatat di Log Book
- [x] Pengaturan Unit TV & Kategori Menu Kafe jadi tabel + panel detail
- [x] Ekspor laporan ke Excel (unduh lokal + Google Drive akun pemilik, folder per store)
- [x] Menu Kafe: urutan awal Kategori lalu Nama Menu, drag tetap aktif dan menyimpan urutan manual
- [x] Tombol VOID di card TV & meja kafe + Laporan VOID (waktu, sumber, nilai, alasan, pelaku)
- [x] Auto logout bisa diatur (menit / nonaktif) + alarm waktu habis dengan nada pilihan, tampil juga di halaman masuk
- [x] Jenis promo: diskon, bonus jam rental, BOGO kafe, main X jam dapat menu gratis
- [x] Gabung tagihan TV+TV (satu nota) dan titip meja kafe ke TV induk
- [x] Tarif konsol Cosmo Gaming TS ter-reset lagi — cari akar masalah & kunci permanen
- [x] Menu Station: daftar station + IP + pesan/menit pengingat; layar penuh saat habis sampai dilepas kasir; identitas APK RenToPlay (perlu build ulang kedua APK)
