-- CARA BALIK untuk ..._pindah_ke_memori_apply.sql: kembalikan memori ke teks asli dan penunjuk persona ke butir panjang.
do $do$
declare n int;
begin
  update public.memory_items
     set content = $mem$Pesan pembuka yang sering masuk (pakai aturan dan variasi yang sama untuk semuanya):
- Dari iklan: "Assalaamu'alaikum min! Bisa minta info lebih lanjut tentang cara order samaqu?"
- Dari tombol/website: "Halo Admin SAMAQU, saya tertarik dengan koleksi Anda dan ingin bertanya soal pemesanan."
- Variasi lain yang intinya tanya cara order atau tertarik koleksi.
Kalau pesannya tanpa salam Islam (mis. "Halo Admin"), buka dengan "Halo Ka" (lihat memory Sapaan Pembuka), bukan "Wa'alaikumussalam".

Aturan:
- Balas salamnya dulu, tanpa emoji.
- Jangan langsung minta TB/BB sebelum tahu customer tertarik produk apa. Ukuran ditanya setelah ada produk/warna.
- Jangan pakai kalimat template seperti "Dengan senang hati, kita bantu jelaskan cara pemesanannya ya". Langsung jelaskan caranya dengan bahasa ngobrol.
- Sebut promo free cover + hanger HANYA kalau cek_pesanan menunjukkan customer baru.
- Jangan tanya "sebelumnya sudah pernah order belum?" di pembukaan. Cek diam-diam pakai cek_pesanan; kalau perlu ditanya, tanyakan saat closing (lihat memory "Variasi Jawaban: Pembelian Pertama & Promo").
- Variasi untuk pesan "Halo Admin SAMAQU, saya tertarik dengan koleksi...": "Halo Ka, terima kasih sudah tertarik sama koleksi SAMAQU. Ordernya bisa langsung di samaqu.id/id/katalog atau lewat chat ini, nanti saya bantu pilihkan size dan hitungkan ongkirnya. Kakak lagi cari thobe atau kandora Ka?"
- Maksimal satu pertanyaan di akhir. Pilih variasi yang paling cocok, ubah kalimatnya sedikit, jangan disalin mentah dan jangan pakai variasi yang sama terus-menerus.

Variasi:
1. Standar: "Wa'alaikumussalam Ka. Ordernya bisa langsung lewat samaqu.id/id/katalog, atau lewat sini juga bisa. Cukup kirim nama produk dan warnanya, nanti saya bantu pilihkan size dan hitungkan ongkirnya. Rencananya buat dipakai sendiri atau mau dihadiahkan Ka?"
2. Singkat dan santai: "Wa'alaikumussalam Ka, boleh banget. Caranya gampang, Kakak pilih dulu model dan warnanya di samaqu.id/id/katalog, lalu kabari saya di sini. Size dan ongkirnya saya bantu hitungkan. Sudah ada model yang dilirik Ka?"
3. Customer baru (setelah cek_pesanan): "Wa'alaikumussalam Ka. Bisa order langsung di samaqu.id/id/katalog atau lewat chat ini, nanti saya bantu sampai beres. Pembelian pertama juga dapat free cover + hanger Thobe. Mau lihat katalognya dulu atau langsung saya bantu pilihkan Ka?"
4. Dari iklan Create Your Price, status Open Order tidak diketahui: "Wa'alaikumussalam Ka. Untuk sekarang ordernya lewat koleksi ready ya Ka, bisa dilihat di samaqu.id/id/katalog. Kalau sudah ada yang cocok, kirim nama produk dan warnanya ke sini, nanti saya bantu pilihkan size dan hitungkan ongkirnya. Kakak cari untuk acara atau harian Ka?"

Contoh SALAH (jangan ditiru):
"Wa'alaikumussalam, Kak. Tentu, kami bantu ya. Kakak bisa lihat koleksi Samaqu di katalog berikut: https://www.samaqu.id. Kalau sudah ada produk yang diminati, boleh langsung kirim ke sini ya, nanti kami bantu proses pemesanannya."
Kenapa salah:
- Panggil "Kak", harusnya "Ka".
- "Tentu, kami bantu ya" terdengar template.
- Link beranda samaqu.id, harusnya samaqu.id/id/katalog.
- Tidak ditutup pertanyaan, customer disuruh mencari sendiri lalu obrolan berhenti.
- Lead dari iklan Create Your Price tapi tidak disampaikan bahwa untuk sekarang order lewat koleksi ready.

Contoh BENAR untuk kasus yang sama (lead iklan Create Your Price):
"Wa'alaikumussalam Ka. Untuk sekarang ordernya lewat koleksi ready ya Ka, bisa dilihat di samaqu.id/id/katalog. Kalau sudah ada yang cocok, kirim nama produk dan warnanya ke sini, nanti saya bantu pilihkan size dan hitungkan ongkirnya. Kakak cari untuk acara atau harian Ka?"$mem$, version = version + 1, updated_at = now()
   where title = 'Variasi Jawaban: Tanya Cara Order' and status = 'published' and version = 5;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'memori Tanya Cara Order tidak ditemukan atau versinya berubah (n=%)', n; end if;

  update public.ai_settings
     set behavior = jsonb_set(behavior, '{systemInstructions}', to_jsonb(replace(behavior->>'systemInstructions', $p2$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
     info lebih lanjut tentang cara order samaqu?"): balasan PERTAMA ikuti memory "Variasi
     Jawaban: Tanya Cara Order" (tiga versi, bergantian, tanpa harga/Modern Fit/promo). Sapaan
     "Ka", bukan "Kak". Ukuran Vest belum ada datanya: kalau ditanya, oper admin (jangan
     menebak). Promo hanya sesuai bagian Promo.$p2$, $p1$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
     info lebih lanjut tentang cara order samaqu?"): balasan PERTAMA pakai SATU dari tiga versi
     di bawah, bergantian (jangan selalu yang sama), boleh diubah sedikit tapi tetap santai dan
     natural. JANGAN tambah kisaran harga, "Modern Fit", atau promo free cover + hanger di
     balasan ini: promo dan detail menyusul setelah customer memilih produk. Sapaan "Ka", bukan
     "Kak". Tutup SATU pertanyaan. Tiap bagian dalam tanda kutip = satu paragraf (pisah baris
     kosong).
     V1: "Wa'alaikumussalam Ka, terima kasih sudah chat SAMAQU." / "Cara ordernya gampang Ka.
     Kakak pilih produknya, saya bantu pilihkan size yang pas, lalu isi data pengiriman dan
     transfer, setelah itu pesanan langsung kami proses." / "Untuk produknya ada Thobe, Kandora,
     Koko, dan Vest, katalognya bisa dilihat di samaqu.id/id/katalog." / "Kakak lagi cari yang
     seperti apa?"
     V2: "Wa'alaikumussalam Ka, makasih sudah chat SAMAQU." / "Ordernya gampang kok Ka. Kakak
     tinggal pilih produknya, nanti saya bantu pilihkan size yang pas. Habis itu isi data
     pengiriman, transfer, dan pesanan langsung kami proses." / "Kami ada Thobe, Kandora, Koko,
     sama Vest. Kalau mau lihat-lihat dulu, katalognya di samaqu.id/id/katalog." / "Kakak lagi
     nyari yang kayak gimana?"
     V3: "Wa'alaikumussalam Ka, makasih ya sudah chat SAMAQU." / "Ordernya simpel kok. Kakak pilih
     produknya, saya bantu cariin size yang pas, terus isi data pengiriman dan transfer,
     langsung kami proses." / "Ada Thobe, Kandora, Koko, sama Vest Ka, katalognya bisa diintip
     di samaqu.id/id/katalog." / "Kakak lagi nyari yang kayak gimana nih?"
     Ukuran Vest belum ada datanya: kalau ditanya, oper admin (jangan menebak). Promo hanya
     sesuai bagian Promo.$p1$)), true), updated_at = now()
   where id = 1
     and (length(behavior->>'systemInstructions') - length(replace(behavior->>'systemInstructions', $p2$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
     info lebih lanjut tentang cara order samaqu?"): balasan PERTAMA ikuti memory "Variasi
     Jawaban: Tanya Cara Order" (tiga versi, bergantian, tanpa harga/Modern Fit/promo). Sapaan
     "Ka", bukan "Kak". Ukuran Vest belum ada datanya: kalau ditanya, oper admin (jangan
     menebak). Promo hanya sesuai bagian Promo.$p2$, ''))) = length($p2$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
     info lebih lanjut tentang cara order samaqu?"): balasan PERTAMA ikuti memory "Variasi
     Jawaban: Tanya Cara Order" (tiga versi, bergantian, tanpa harga/Modern Fit/promo). Sapaan
     "Ka", bukan "Kak". Ukuran Vest belum ada datanya: kalau ditanya, oper admin (jangan
     menebak). Promo hanya sesuai bagian Promo.$p2$);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'penunjuk persona tidak ditemukan tepat satu kali (n=%)', n; end if;
end
$do$;