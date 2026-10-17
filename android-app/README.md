# RenToPlay Kasir untuk Android

Aplikasi Android ini membuka RenToPlay resmi dan mencetak langsung ke printer Bluetooth
Classic ESC/POS, termasuk Kassen MT-300 VL 80 mm. RawBT tidak diperlukan.

Versi 1.3.0 meneruskan judul khusus tiap pengingat dan tiga baris pesan dari Menu Station; pemilihan gambar galeri tetap didukung.
Build ulang lalu pasang APK ini sebagai pembaruan aplikasi lama (jangan hapus aplikasi agar IP Station tetap tersimpan).
Tombol Release pada kartu Station melepas layar penuh TV tanpa mengakhiri sesi/tagihan.

## Membuat APK

1. Pasang Android Studio versi terbaru.
2. Buka folder `android-app` sebagai proyek Android.
3. Tunggu proses sinkronisasi selesai dan pasang Android SDK 35 bila diminta.
4. Pilih **Build > Build APK(s)**.
5. Salin APK dari `app/build/outputs/apk/debug/app-debug.apk` ke perangkat Android lalu pasang.

Untuk APK operasional, buat kunci penandatanganan sendiri melalui **Build > Generate Signed App
Bundle or APK**. Jangan menyimpan kata sandi atau berkas kunci di repository.

## Menggunakan printer

1. Nyalakan Kassen MT-300 VL dan pasangkan melalui pengaturan Bluetooth Android.
2. Buka aplikasi RenToPlay dan izinkan akses perangkat Bluetooth.
3. Masuk ke menu **Printer**.
4. Pada printer struk, pilih **Aplikasi Android — Bluetooth langsung**.
5. Pilih Kassen dari daftar perangkat, pilih kertas **Thermal 80 mm**, lalu tekan **Uji cetak**.

Printer memakai koneksi Bluetooth Classic SPP dan perintah ESC/POS. Jika printer tidak muncul,
hapus pemasangan Bluetooth, pasangkan ulang, lalu tekan tombol muat ulang pada daftar printer.