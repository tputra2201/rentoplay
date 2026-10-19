# Transaksi luring aman setelah aplikasi ditutup

## Masalah yang sudah terbukti
Pengujian tutup–buka jendela menunjukkan transaksi masih tersimpan di perangkat, tetapi aplikasi baru tidak menemukan antrean lama. Ketika data pusat dimuat, transaksi itu dapat hilang dari tampilan dan tidak terkirim.

Perbaikan tidak cukup dengan satu antrean bersama: dua kasir pada tab berbeda dapat saling menimpa, dan antrean lama belum memiliki penanda toko yang cukup untuk dipulihkan sembarangan.

## Perubahan
- Simpan antrean transaksi dengan identitas toko yang tetap tersedia setelah aplikasi ditutup.
- Saat aplikasi dibuka, temukan dan pulihkan antrean toko yang sesuai, termasuk transaksi yang belum sempat masuk antrean pengiriman.
- Pertahankan antrean terpisah untuk setiap tab. Antrean tab yang masih aktif tidak boleh diambil atau ditimpa tab lain.
- Antrean toko lain tetap disimpan, tidak diterapkan atau dikirim ke toko yang sedang dibuka.
- Jika penyimpanan gagal, jangan hapus catatan transaksi yang belum berhasil dipindahkan; tampilkan peringatan kepada kasir.
- Antrean lama yang kepemilikan tokonya tidak bisa dibuktikan tetap disimpan untuk pemeriksaan, bukan dikirim otomatis atau dibuang.

## Rincian teknis
- Gunakan envelope antrean berversi berisi `storeId`, journal, dan outbox. Pemindahan journal ke outbox dilakukan dalam satu penulisan yang diperiksa keberhasilannya.
- Temukan envelope tersimpan dan gunakan kepemilikan eksklusif lintas tab untuk pemulihan. Jika penguncian lintas tab tidak tersedia, jangan lakukan pengambilalihan yang tidak aman; beri peringatan dan pertahankan datanya.
- Proses antrean yang dipulihkan secara terpisah, tanpa menggabungkan aksi dari tab berbeda berdasarkan ID entitas.
- Tetap gunakan aksi eksplisit, transaksi terkait, base asli, pemeriksaan keanggotaan toko, tarik sebelum kirim, dan pengiriman atomik yang sudah ada. Jangan membuat transaksi baru dari perbedaan salinan data.
- Jangan mengubah perhitungan tagihan, pembayaran, laporan, atau konfigurasi toko.

## Pengujian sebelum selesai
- Catat transaksi luring, tutup aplikasi, buka jendela baru: antrean dan transaksi tetap ditemukan.
- Sambungkan internet: transaksi terkirim dan terbaca kembali dari pusat, tidak terkirim ganda.
- Uji dua tab aktif dan dua tab yang mencoba memulihkan antrean yang sama.
- Pastikan antrean toko A tidak masuk ke toko B.
- Simulasikan kegagalan penyimpanan saat memindahkan journal ke outbox.
- Pastikan konflik tetap menahan seluruh aksi terkait dan percobaan ulang kiriman yang sudah diterima tetap aman.
- Jalankan tes sinkronisasi yang ada serta regresi baru; periksa hasil aplikasi sebelum menandai temuan selesai.

## Batasan
Transaksi yang sudah tertimpa dan tidak memiliki catatan antrean tersisa tidak bisa direkonstruksi dengan aman. Pembaruan web tidak dipublikasikan tanpa perintah Anda; APK tidak diubah.