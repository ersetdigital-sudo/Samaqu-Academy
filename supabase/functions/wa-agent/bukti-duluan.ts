/**
 * Aturan "bukti duluan" untuk prompt bot WA (server).
 *
 * Kasus nyata 26 Nov 2026 17.32-17.34 WIB (run 19592 dan 19595): customer mengirim foto bukti transfer sebelum
 * rekap disetujui. Run pertama membaca foto itu dengan benar, tetapi niatnya (closing setelah rekap disetujui)
 * tidak ikut ke run berikutnya, dan di riwayat foto itu hanya tampil sebagai "[lampiran]". Setelah "Iya kak
 * benar" bot mengirim nomor rekening lagi dan closing tidak tercatat.
 *
 * Uji lokal (DeepSeek V4.1 Flash, persona v8): tanpa aturan ini 4 dari 20 run mengirim rekening lagi; dengan
 * aturan ini 0 dari 20. Skenario foto produk di riwayat (bukan bukti) tetap mengirim rekening (8 dari 8) dan
 * skenario closing lain tidak berubah.
 *
 * Teks sengaja ASCII murni. Disisipkan di index.ts setelah ATURAN KONTEKS & CLOSING LANJUTAN.
 */
export const ATURAN_BUKTI_DULUAN =
  'ATURAN BUKTI DULUAN: lampiran gambar di "Konteks sebelumnya" yang dikirim SESUDAH harga atau total disebut, atau yang disusul kata "udah", "sudah tf", "sudah transfer", "sudah bayar", hampir pasti BUKTI TRANSFER (foto produk biasanya dikirim sebelum harga dibahas). ' +
  'Kalau customer menulis "udah"/"sudah" dan ada lampiran gambar di riwayat: JANGAN kirim nomor rekening dan JANGAN minta bukti lagi. ' +
  'Kalau rekap sudah disetujui dan data lengkap, panggil catat_closing dengan inbox_id lampiran itu dan nominal sesuai total pada rekap kami. ' +
  'Kalau ada data yang kurang (mis. kode pos), tanya data itu saja (jangan menulis "sudah kami terima" sebelum catat_closing berhasil). ' +
  'Kalau ragu apakah lampiran itu bukti, tanya sekali: "Ka, foto yang tadi bukti transfernya ya?" sebelum mengirim nomor rekening.';
