# RenToPlay TV (companion Android TV)

Dipasang di setiap TV. Menampilkan kartu notifikasi di atas layar PS (HDMI).

Versi 1.3.0 menambahkan splash sambutan saat TV hidup, PIN remote angka 4–6 digit, volume, Home/HDMI, dan standby opsional. Release Splash tidak memulai billing/timer.
Build ulang dan pasang APK pembaruan di setiap TV. Overlay hanya menutupi gambar, tidak memutus HDMI atau mengunci konsol.
Untuk logo tajam/transparan, unggah ulang PNG transparan beresolusi tinggi melalui Data Store; tersedia pilihan hapus latar polos.

1. Build: buka folder ini di Android Studio → Build → Build APK, atau `gradle assembleRelease`.
2. Pasang APK di TV (flashdisk / Send Files to TV), buka "RenToPlay TV".
3. Tekan "Izinkan tampil di atas aplikasi lain" lalu aktifkan. Tekan "Tes tampilan".
4. Catat IP yang tampil, isi di RenToPlay kasir: Menu Station → IP Layar Station.

API lokal: `POST http://IP:8765/notify` body JSON `{title, message, level: info|warning|danger, duration}`.
Disarankan IP TV dibuat tetap (DHCP reservation di router).

## Pengaturan kontrol TV

1. Pasang pembaruan Companion 1.3.0 dan Kasir 1.5.0 tanpa uninstall, dengan kunci penandatanganan yang sama.
2. Buka Companion, salin IP dan kode kontrol ke Setup → Station di APK kasir. Kode ini rahasia; jaringan lokal harus tepercaya (HTTP tidak terenkripsi).
3. Isi MAC TV, PIN 4–6 angka, judul dan ucapan sambutan. Aktifkan Splash saat TV dinyalakan, lalu **Kirim Pengaturan ke TV**. Logo dan nama store ikut disimpan di TV. Mengubah pengaturan kasir saja belum memperbarui TV.
4. Untuk standby, aktifkan **RenToPlay TV — Standby** di Aksesibilitas TV. Layanan tidak membaca isi layar; memakai aksi kunci layar Android, yang hasilnya bergantung model TV.
5. Nyalakan memakai Wake-on-LAN; Mode Standby Berjaringan/Quick Start dan dukungan WOL diperlukan. Balasan hanya mengonfirmasi pengiriman paket, bukan bahwa TV telah menyala.
6. Tekan pemeriksaan volume/input di panel Station. HDMI diambil dari daftar input perangkat, bukan nama/ID tebakan; pemindahan input dan Home bergantung izin/OEM TV. Tidak memakai atau mengklaim sudah melakukan pairing ADB.
7. Uji nyala dengan remote/tombol TV, splash/logo, PIN benar/salah, Release Splash, volume, standby, WOL dan setiap HDMI pada TV TCL sebelum dipakai operasional.

Splash memakai penerima SCREEN_ON di layanan foreground dan muncul lagi saat layanan dimulai ulang/boot. Beberapa firmware TCL dapat menghentikan layanan atau menyembunyikan overlay di HDMI; izin overlay, autostart, dan pembatasan energi perlu diuji langsung. Home/Input sistem tertentu dapat menghindari overlay: ini bukan pengunci konsol atau pengaman anti-tamper. PIN hanya membuka splash sambutan, tidak membuka overlay WAKTU HABIS. Lima PIN salah memberi jeda 30 detik. PIN pada TV disimpan sebagai hash dengan salt; cache konfigurasi di kasir tetap privat perangkat dan perlu dijaga.
