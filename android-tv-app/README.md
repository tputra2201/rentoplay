# RenToPlay TV (companion Android TV)

Dipasang di setiap TV. Menampilkan kartu notifikasi di atas layar PS (HDMI).

Versi 1.5.0 menambah perintah bangun layar dari dalam jaringan (dipakai saat Wake-on-LAN diblokir router Wi-Fi), pengaturan TV global sekali isi untuk semua unit, dan daftar station accordion di kasir. Pola remote 4–6 tombol arah/OK, volume, Home/HDMI, standby opsional dan layar waktu habis hitam pekat tetap tersedia. Release Splash tidak memulai billing/timer.
Build ulang dan pasang APK pembaruan di setiap TV. Overlay hanya menutupi gambar, tidak memutus HDMI atau mengunci konsol.
Untuk logo tajam/transparan, unggah ulang PNG transparan beresolusi tinggi melalui Data Store; tersedia pilihan hapus latar polos.

1. Build: buka folder ini di Android Studio → Build → Build APK, atau `gradle assembleRelease`.
2. Pasang APK di TV (flashdisk / Send Files to TV), buka "RenToPlay TV".
3. Tekan "Izinkan tampil di atas aplikasi lain" lalu aktifkan. Tekan "Tes tampilan".
4. Catat IP yang tampil, isi di RenToPlay kasir: Menu Station → IP Layar Station.

API lokal: `POST http://IP:8765/notify` body JSON `{title, message, level: info|warning|danger, duration}`.
Disarankan IP TV dibuat tetap (DHCP reservation di router).

## Pengaturan kontrol TV

1. Pasang pembaruan Companion 1.5.0 dan Kasir 1.6.0 tanpa uninstall, dengan kunci penandatanganan yang sama.
2. Buka Companion, salin IP dan kode kontrol ke Setup → Station di APK kasir. Kode ini rahasia; jaringan lokal harus tepercaya (HTTP tidak terenkripsi).
3. Isi MAC TV, buat pola 4–6 tombol arah/OK di Setup Station, isi judul dan ucapan sambutan. Aktifkan Splash saat TV dinyalakan, lalu **Kirim Pengaturan ke TV**. Logo dan nama store ikut disimpan di TV. Mengubah pengaturan kasir saja belum memperbarui TV. Tidak ada pola bawaan; PIN angka lama tetap berlaku sampai pengaturan baru dikirim.
4. Untuk standby, aktifkan **RenToPlay TV — Standby** di Aksesibilitas TV. Layanan tidak membaca isi layar; memakai aksi kunci layar Android, yang hasilnya bergantung model TV.
5. Nyalakan memakai Wake-on-LAN (broadcast subnet, broadcast umum dan IP TV, tiga pengiriman UDP 7/9); Mode Standby Berjaringan/Quick Start dan dukungan WOL diperlukan. MAC harus milik koneksi TV yang aktif (Wi-Fi/Ethernet). Balasan hanya mengonfirmasi pengiriman paket, bukan bahwa TV telah menyala. Cast wake tidak ditambahkan karena tidak ada protokol bangun generik yang terverifikasi untuk model ini.
6. Tekan pemeriksaan volume/input di panel Station. HDMI diambil dari daftar input perangkat, bukan nama/ID tebakan; pemindahan input dan Home bergantung izin/OEM TV. Tidak memakai atau mengklaim sudah melakukan pairing ADB.
7. Uji nyala dengan remote/tombol TV, splash/logo, pola benar/salah, Release Splash, volume, standby, WOL dan setiap HDMI pada TV TCL sebelum dipakai operasional. Tekan arah/OK sekali per langkah; tahan tombol tidak dihitung berulang. Back mengosongkan masukan, bukan membuka splash.

Splash memakai penerima SCREEN_ON di layanan foreground dan muncul lagi saat layanan dimulai ulang/boot. Beberapa firmware TCL dapat menghentikan layanan atau menyembunyikan overlay di HDMI; izin overlay, autostart, dan pembatasan energi perlu diuji langsung. Home/Input sistem tertentu dapat menghindari overlay: ini bukan pengunci konsol atau pengaman anti-tamper. Pola hanya membuka splash sambutan, tidak membuka overlay WAKTU HABIS. Lima pola salah memberi jeda 30 detik. Pola pada TV disimpan sebagai hash dengan salt; cache konfigurasi di kasir tetap privat perangkat dan perlu dijaga.

## Standby dari PC (ADB)

Pasang Android Platform Tools resmi. Di TV buka Proses Debug Nirkabel → Pasangkan perangkat dengan kode; port pairing berbeda dari port koneksi.

```sh
adb pair IP_TV:PORT_PAIRING
adb connect IP_TV:PORT_KONEKSI
adb shell settings get secure enabled_accessibility_services
```

Catat hasil perintah terakhir. Jika `null`/kosong gunakan komponen berikut; jika ada layanan lain, tambahkan komponen ini dengan pemisah titik dua ke nilai lama agar layanan lain tidak terhapus.

```sh
adb shell settings put secure enabled_accessibility_services "app.rentoplay.tv/app.rentoplay.tv.TvPowerService"
adb shell settings put secure accessibility_enabled 1
adb shell settings get secure enabled_accessibility_services
```

Periksa layanan tetap aktif di TV lalu uji Standby dari kasir. Firmware TV dapat menolak izin atau tidak mendukung GLOBAL_ACTION_LOCK_SCREEN; ini bukan jaminan. Uji standby langsung dari PC: `adb shell input keyevent 223` (SLEEP, bukan tombol toggle POWER). Matikan debugging setelah selesai bila tidak diperlukan.
