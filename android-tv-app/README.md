# RenToPlay TV (companion Android TV)

Dipasang di setiap TV. Menampilkan kartu notifikasi di atas layar PS (HDMI).

1. Build: buka folder ini di Android Studio → Build → Build APK, atau `gradle assembleRelease`.
2. Pasang APK di TV (flashdisk / Send Files to TV), buka "RenToPlay TV".
3. Tekan "Izinkan tampil di atas aplikasi lain" lalu aktifkan. Tekan "Tes tampilan".
4. Catat IP yang tampil, isi di RenToPlay kasir: Setup Store → Notifikasi TV.

API lokal: `POST http://IP:8765/notify` body JSON `{title, message, level: info|warning|danger, duration}`.
Disarankan IP TV dibuat tetap (DHCP reservation di router).
