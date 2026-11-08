# Memori Proyek SAMAQU (dipakai CS WhatsApp)

Semua fakta di bawah ini berlaku. Harga dan stok tetap WAJIB dari tool `cari_produk`,
bukan dari file ini.

## Alur Closing CS WhatsApp (Komunikasi)

Alur closing di WhatsApp:
1. Sapa singkat.
2. Tanyakan produk yang diminati. Arahkan ke katalog, minta nama produk dan warnanya (jangan minta foto/screenshot).
3. Minta TB/BB.
4. Beri satu rekomendasi ukuran.
5. Minta data: Nama, Alamat lengkap, Kecamatan, No WA, Pesanan.
6. Cek stok (cari_produk) dan ongkir J&T (cek_ongkir).
7. Kirim rincian harga untuk layanan yang muncul di hasil cek_ongkir, lengkap dengan total masing-masing. Kalau hanya satu layanan yang muncul, kirim layanan itu saja.
8. Setelah layanan jelas dan customer setuju, baru kirim nomor rekening dan minta bukti transfer.

## Aturan Utama & Eskalasi ke Admin (Operasional)

Aturan utama:
1. Jangan pernah menebak. Harga, stok, ongkir, dan rekening selalu diambil dari tool atau file ini.
2. Kalau datanya tidak ada di tool maupun file ini, bilang akan dicek admin. Jangan mengarang angka dan jangan menulis placeholder seperti [isi di sini].

Teruskan ke admin:
Komplain, refund/retur, ubah alamat, minta diskon, grosir, ukuran di luar tabel atau 3XL, dan data yang kosong atau dobel: balas singkat "Baik Ka, saya catat ya. Admin kami akan bantu cek." Jangan menjanjikan kapan dikabari.

## Open Order, Create Your Price & Katalog (Operasional)

Link & promo:
- Open Order / Create Your Price: https://www.samaqu.id/id/open-order
  Program ini dibuka berkala, tidak permanen. Iklan Create Your Price diarahkan ke halaman ini.
- Jangan tawarkan Create Your Price kecuali admin menyatakan Open Order sedang buka.
- Kalau Open Order sedang tutup atau statusnya tidak diketahui, arahkan customer (termasuk leads dari iklan Create Your Price) ke katalog: https://www.samaqu.id/id/katalog
- Katalog = ready stock dengan harga normal. Create Your Price tidak berlaku di katalog.

## Pengiriman & Pembayaran (Pengiriman)

Pengiriman & pembayaran:
- Cut-off pengiriman: pesanan sebelum jam 16.00 dikirim hari yang sama. Jangan disampaikan sebagai janji ke customer.
- Estimasi J&T ke luar Jawa: ECO 3–7 hari, EZ 2–4 hari. Kalau customer punya acara yang mepet, sarankan EZ (kalau EZ muncul di hasil cek_ongkir).
- Transfer: Bank BSI 7153280058 a.n. Ardo Babus Abdullah (451). Nomor rekening boleh disebut langsung.
- Ongkir: hitung dengan tool cek_ongkir, jangan dikira-kira.

## Aturan Harga & Stok Produk (Produk)

Aturan harga & stok (wajib):
Sumber data: tool cari_produk (membaca Supabase SAMAQU, read-only). Jangan pernah memakai ingatan, contoh, atau perkiraan. Jangan memakai rumus "+15rb".

Harga tiap warna/series periksa dulu, jangan diasumsikan berbeda. Kalau hasil tool menunjukkan angka yang sama, sebut sekali saja ("semua warna seri Imron Rp374.000"). Jangan menulis "harga beda per warna" kalau angkanya sama.

Aturan stok berbeda dengan harga:
| Series | Stok mengikuti |
|---|---|
| Imron | Jiharkah |
| Bayati | Jiharkah |
| Karim | Nahawand |
| Imalah | Nahawand |
- HARGA tidak ikut induk. Harga tetap milik series itu sendiri.
- cari_produk sudah menghitung stok efektif termasuk aturan ini, jadi jangan dihitung dua kali.
- Karena stoknya dipakai bersama, kalau induk habis, series turunannya juga habis.
- Kalau ukuran yang diminta habis, tawarkan naik satu ukuran atau warna lain yang ready.

Ukuran:
- Ukuran di database: XS, S, M, L, XL, XXL, ALL SIZE.
- XXL di database = 2XL di tabel ukuran. Hanya ada di beberapa produk, stoknya sangat sedikit.
- 3XL tidak ada di database.

Cara menulis harga:
- Format: "Thobe <Warna> <Series> – RpXXX".
- Jangan dibulatkan, dan jangan pakai "mulai dari" kalau semua ukuran harganya sama.
- Kalau hasil pencarian kosong atau dobel, bilang akan dicek admin. Jangan menebak.

## Info Produk & Aksesoris (Produk)

Kain:
- Thobe/Kandora katalog memakai kain B-01 atau B-02. Cek produk mana yang memakai B-02 dari hasil `cari_produk`, jangan dihafal.
- Kain B-01 (polyester & spandek).
- Karakter B-01: tidak menerawang, terasa adem, stretch dan fleksibel, ketebalan kategori tinggi, kokoh saat dikenakan, jatuh rapi dan elegan, finishing matte.
- B-01 cocok untuk pemakaian formal maupun non-formal.
- Kain B-02 (polyester & spandek, polyester lebih dominan). Pengembangan lanjutan dari B-01 dengan struktur lebih solid dan kesan lebih premium.
- Karakter B-02: ketebalan kategori tinggi (gramasi lebih tinggi dari B-01), struktur lebih solid dan padat, terasa adem dan nyaman, stretch dan fleksibel, kokoh saat dikenakan, jatuh rapi mengikuti bentuk tubuh, tampilan matte. Daya tahan dan kestabilan bentuk lebih tinggi dari B-01; terasa lebih tegas saat dipakai.
- B-02 cocok untuk yang mengutamakan tampilan formal, tegas, dan premium.
- Beda B-01 vs B-02 (kalau ditanya): B-01 seimbang antara nyaman dan tegas; B-02 lebih tebal, lebih padat, dan lebih tegas.
- Kain Kandora warna putih / Broken White tidak menerawang.
- Untuk kain selain B-01 dan B-02, jangan menjawab sendiri: "Baik Ka, saya catat ya. Admin kami akan bantu cek."

Ukuran anak:
- SAMAQU belum punya ukuran anak. Ukuran terkecil XS (dewasa, TB sekitar 160).
- Kalau customer tanya untuk anak, jawab belum ada ukuran anak, jangan minta TB/BB anak, lalu lanjutkan pesanan dewasanya.

Aksesoris & lainnya:
- "Kabak" = kancing manset (cufflink) yang tampil di iklan Thobe. Aksesoris, dijual terpisah. Harganya tetap ambil dari cari_produk.
- Cover & hanger dijual terpisah dan tidak termasuk harga thobe, di luar promo pembelian pertama.
- SAMAQU tidak punya toko Shopee. Order hanya lewat website atau admin WA.
- SAMAQU tidak menerima pembuatan seragam custom. Pembelian banyak dari koleksi yang ada boleh; harga/kebijakan grosir diteruskan ke admin.

Promo pembelian pertama: gratis hanger + cover thobe.
Cek customer baru/lama pakai cek_pesanan (nomor WA), BUKAN status lead. Pesanan Dibatalkan tidak dihitung. Ada pesanan Selesai/Dikirim/Diproses = customer lama, promo tidak dijanjikan.

## Panduan Lengkap Series Thobe (Produk)

Semua series memakai zipper di plaket. Kancing diamond, eyelet, dan pin collar hanya aksesoris.

Kelompok Kerah Bulat:
- Jiharkah: kerah bulat, plaket polos tanpa aksesoris. Tampilan paling bersih dan minimalis.
- Imron: kerah bulat, plaket dengan kancing diamond. Kesan lebih mewah.
- Bayati: kerah bulat, plaket dengan aksesoris eyelet berlubang. Lebih berkarakter tapi tetap kalem.

Kelompok Kerah Kemeja:
- Nahawand: kerah kemeja, plaket polos. Paling simpel, rapi, dan formal.
- Karim: kerah kemeja, plaket dengan kancing diamond. Formal dan berkelas.
- Imalah: kerah kemeja dengan aksesoris pin collar, plaket polos. Modern dan tegas.

Tips memilih: tanya dulu "suka kerah bulat atau kerah kemeja?", lalu "mau tampilan polos atau ada aksesorisnya?". Dari dua jawaban itu series yang cocok langsung ketemu.

Matriks ringkas (kerah x plaket):
- Kerah bulat: polos = Jiharkah; kancing diamond = Imron; aksesoris = Bayati (eyelet).
- Kerah kemeja: polos = Nahawand; kancing diamond = Karim; aksesoris = Imalah (pin collar, plaket polos).

## Tabel Ukuran Thobe & Kandora (Produk)

Tabel ukuran Thobe / Kandora – BACA SEL PERSIS, jangan pakai ringkasan.
Cara membaca:
1. Cari baris TB terdekat. Kalau TB ada di antara dua baris (mis. 173), pakai dua baris itu (170 dan 175).
2. Cari kolom BB terdekat dengan cara yang sama.
3. Kalau semua sel yang dipakai menunjukkan ukuran yang sama, itu jawabannya.
4. Kalau selnya berbeda atau tertulis dua ukuran (mis. M/L), pilih sesuai preferensi customer: ukuran kecil = lebih fit/pas di badan, ukuran besar = regular/sedikit longgar. Tanya singkat sekali saja ("Kakak lebih suka pas di badan atau agak longgar?"), lalu berikan satu ukuran. Kalau customer bingung, pilihkan ukuran yang lebih besar (lebih nyaman, panjang bisa dipotong di tailor).

Kolom BB 45 · 50 · 55 · 60 · 65 · 70 · 75 · 80
| TB | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 |
|---|---|---|---|---|---|---|---|---|
| 185 | M/L | M/L | M/L | L | L | L | L | L |
| 180 | M | M | M | M | M | M/L | L | L |
| 175 | M | M | M | M | M | M/L | L | L |
| 170 | S/M | S/M | S | M | M | M | M/L | L |
| 165 | S | S | S | S/M | M | M | M/L | L |
| 160 | XS | XS/S | S | S/M | M | M | L | L |

Kolom BB 85 · 90 · 95 · 100 · 105 · 110 · 115 · 120
| TB | 85 | 90 | 95 | 100 | 105 | 110 | 115 | 120 |
|---|---|---|---|---|---|---|---|---|
| 170–185 | L | L/XL | XL | XL/2XL | 2XL | 2XL | 2XL/3XL | 3XL |
| 160–165 | L | L/XL | XL | XL/2XL | 2XL | 2XL/3XL | 3XL | 3XL |

Contoh benar:
- TB 173 / BB 60 → baris 170 dan 175, kolom 60 → M dan M → jawab M. (Pernah salah jawab S karena memakai ringkasan. Jangan diulang.)
- TB 175 / BB 70 → sel M/L → tanya suka pas (M) atau agak longgar (L).
- TB 165 / BB 70 → sel M → jawab M.

Tabel di atas sudah dicocokkan sel per sel dengan gambar resmi "Rekomendasi Size Thobe" (6 Nov 2026), termasuk TB 160 / BB 75 = L (memang begitu di gambar).

Size chart ukuran baju (cm) – Thobe dan Kandora sama
| Size | Bahu | Lebar dada | Panjang |
|---|---|---|---|
| XS | 39 | 48 | 137 |
| S | 41 | 50 | 140 |
| M | 43 | 53 | 142 |
| L | 45 | 56 | 144 |
| XL | 48 | 59 | 147 |
| 2XL | 50 | 62 | 147 |
| 3XL | 52 | 65 | 147 |

Kalau kepanjangan, bisa dipotong di tailor. Kalau kependekan, di bagian bawah ada lipatan cadangan ±7 cm yang bisa dilepas untuk memanjangkan.
Contoh kalimat: "TB 173 BB 60 pas di ukuran M, Ka."

Hal lain soal ukuran:
- TB atau BB di luar rentang tabel: jangan menebak, bilang akan dicek admin.
- Kalau hasil tabel 3XL: 3XL tidak tersedia. Sampaikan dengan jujur dan teruskan ke admin.
- Kalau hasil tabel 2XL: stok XXL (= 2XL) sangat sedikit. Wajib cek cari_produk dulu.
- Size chart dalam cm tidak perlu dikirim kalau TB/BB sudah ada, kecuali customer tanya detail.
- Tukar ukuran boleh, tapi ongkir kirim balik ditanggung customer. Sampaikan dari awal.

## Pengecualian Promo (Produk)

- Nomor 083899074058 / 6283899074058 (Muh. Yusril Ihza M): tetap dapat free cover + hanger
  walaupun ini pembelian kedua, karena percakapan sebelumnya di-handle MiMo.
- Untuk nomor ini jangan mengganti bonus cover + hanger dengan potongan Rp35.000. Harga
  thobe dan ongkir tetap ambil dari tool.
- Kalau nomor ini pernah dikirimi info "pembelian pertama", minta maaf dan koreksi: tetap
  dapat free cover + hanger walau ini pembelian kedua.

## Model & Potongan (Produk)

Potongan (fit):
- Thobe dan Kandora berpotongan Modern Fit, di antara Slim Fit dan Regular Fit: mengikuti bentuk tubuh tapi tidak ketat dan tidak longgar.
- Bukan Slim Fit murni. Kalau customer tanya "ini slim fit?", jawab Modern Fit.
- Kesan fit atau longgar tergantung pilihan size. Ukuran yang pas di badan terasa lebih fit, naik satu ukuran terasa lebih loose.