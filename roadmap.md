# Roadmap

- [ ] Perbaiki siklus video splash mati–nyala, pemulihan tampilan di HDMI dan pembatasan remote selama terkunci; validasi aturan dan kompilasi Android. Uji HDMI-CEC/standby fisik memerlukan TV pengguna.

- [x] Antrean kosong dihapus setelah pengiriman dan antrean kosong lama dibersihkan dengan lock + baca ulang; transaksi tertunda, tab aktif, toko lain, dan data rusak tetap dipertahankan. 26 tes lulus; akun aktif: 20 antrean kosong lama terhapus dan tiga kali reload tidak menyimpan antrean kosong baru. Belum dipublikasikan.

- [x] Antrean transaksi luring tersimpan per toko dan dipulihkan dengan penguncian eksklusif setelah tutup–buka; journal/outbox dipindahkan atomik, antrean lama tanpa identitas tetap ditahan. Tes regresi dan uji akun aktif: tambah pelanggan luring, buka jendela baru, sambungkan internet, baca kembali dari pusat, hapus data uji. Publikasi tetap menunggu perintah pengguna.

- [x] Volume dan HDMI selalu terlihat di panel Station, status dibaca otomatis; kontrol daya tidak diubah. Lima tes lulus, build OK; akun aktif teruji dengan bridge simulasi (volume 35→36, HDMI 2), desktop/mobile tanpa error. Uji TV fisik menunggu perangkat pengguna.

- [x] Warna soft kelompok kartu TV lintas tema; rapikan Setup Station/Kafe/Store, IP TV dalam detail Daftar Station. Penyimpanan IP, daftar dan buka ulang teruji pada akun aktif; tab Kafe/Store, lima tema dan lebar mobile diperiksa tanpa error runtime.

- [x] Pola arah/OK di Setup Station, Release tetap terpisah dari billing, WOL subnet dengan tiga pengiriman; Cast wake tidak dipakai (tidak ada protokol generik terverifikasi). 12 tes Bun + JVM pola/WOL lulus, sumber Android terkompilasi API35, penyimpanan/kirim pola dan Release diuji akun aktif dengan bridge simulasi; tampilan desktop/mobile diperiksa. ZIP Kasir 1.6.0 dan Companion 1.4.0 siap; panduan standby PC/ADB di README Companion.

- [x] Implementasi kontrol TV: splash saat SCREEN_ON/boot, PIN angka yang dapat diubah, release terpisah dari timer, volume, Home/HDMI perangkat, Wake-on-LAN dan standby dengan izin opsional. Kasir 1.5.0/Companion 1.3.0; 31 tes lulus, sumber Android dikompilasi terhadap API35, uji JVM PIN dan alarm lulus, pengaturan tersimpan/Release diuji pada akun aktif dengan simulasi bridge native.
- [ ] Build/install APK Kasir 1.6.0 dan Companion 1.4.0 dengan kunci lama, kirim pola baru, uji fisik nyala remote/tombol/WOL, pola, standby dan Home/HDMI — memerlukan perangkat TV/tablet pengguna; dukungan daya/input tergantung firmware TCL.

- [x] Perkuat sinkronisasi multi-perangkat: antrean aksi eksplisit per tab, baseline pusat sebelum layar dibuka, RPC atomik menolak base basi/kiriman ganda, sesi retired dan shift close dilindungi, konflik disalin untuk pemeriksaan. Pengujian aturan lokal dan RPC autentikasi lulus; baris uji sementara dibersihkan.
- [ ] Publikasikan pembaruan web dan buka ulang pada semua perangkat — menunggu perintah publikasi pengguna; pengaman pusat sudah aktif dan menolak pengiriman versi lama. Uji operasional beberapa kasir fisik bersamaan masih menunggu perangkat pengguna.

- [x] Temuan monitoring: logo alarm dipisahkan dari PendingIntent dan dipulihkan receiver, DP tetap di PAY-IN periode penerimaan; jarak cetak sudah benar dua baris kosong (temuan stale). 19 tes Bun dan uji JVM bridge/receiver dengan logo 1,8 juta karakter lulus; build OK. ZIP Kasir 1.4.1 siap di Files; APK perlu dibuild/install dan uji TV/printer fisik menunggu perangkat pengguna.

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
