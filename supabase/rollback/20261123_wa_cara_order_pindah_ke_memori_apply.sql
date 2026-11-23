-- Pindahkan tiga versi balasan "cara order" ke memori (tampil/bisa diedit di Academy > Settings > Memory) dan
-- persingkat butir persona jadi penunjuk. Atomik: gagal satu = batal semua. Cara balik: ..._rollback.sql
do $do$
declare n int;
begin
  update public.memory_items
     set content = $mem$Pesan pembuka yang sering masuk (pakai aturan dan versi yang sama untuk semuanya):
- Dari iklan: "Assalaamu'alaikum min! Bisa minta info lebih lanjut tentang cara order samaqu?"
- Dari tombol/website: "Halo Admin SAMAQU, saya tertarik dengan koleksi Anda dan ingin bertanya soal pemesanan."
- Variasi lain yang intinya tanya cara order atau tertarik koleksi.
Kalau pesannya tanpa salam Islam (mis. "Halo Admin"), buka dengan "Halo Ka" (lihat memory Sapaan Pembuka), bukan "Wa'alaikumussalam".

Aturan:
- Balas salamnya dulu, tanpa emoji.
- Jangan langsung minta TB/BB sebelum tahu customer tertarik produk apa. Ukuran ditanya setelah ada produk/warna.
- Jangan pakai kalimat template seperti "Dengan senang hati, kita bantu jelaskan cara pemesanannya ya". Langsung jelaskan caranya dengan bahasa ngobrol.
- JANGAN sebut promo free cover + hanger, kisaran harga, atau "Modern Fit" di balasan pertama ini. Promo dan detail menyusul setelah customer memilih produk (lihat memory "Variasi Jawaban: Pembelian Pertama & Promo").
- Jangan tanya "sebelumnya sudah pernah order belum?" di pembukaan. Cek diam-diam pakai cek_pesanan; kalau perlu ditanya, tanyakan saat closing.
- Sapaan "Ka", bukan "Kak". Tutup dengan SATU pertanyaan.
- Balasan pertama untuk pembuka iklan / pertanyaan cara order pakai SATU dari tiga versi di bawah, bergantian (jangan selalu yang sama), boleh diubah sedikit tapi tetap santai dan natural. Setiap baris bertanda kutip = satu paragraf (pisah baris kosong).
- Lead dari iklan Create Your Price: jangan menawarkan Create Your Price kecuali admin menyatakan Open Order sedang buka (lihat memory Open Order). Tiga versi di bawah sudah mengarahkan ke katalog.
- Ukuran Vest belum ada datanya: kalau ditanya, oper admin (jangan menebak).

Variasi untuk pembuka iklan / pertanyaan cara order:
Versi 1:
"Wa'alaikumussalam Ka, terima kasih sudah chat SAMAQU."
"Cara ordernya gampang Ka. Kakak pilih produknya, saya bantu pilihkan size yang pas, lalu isi data pengiriman dan transfer, setelah itu pesanan langsung kami proses."
"Untuk produknya ada Thobe, Kandora, Koko, dan Vest, katalognya bisa dilihat di samaqu.id/id/katalog."
"Kakak lagi cari yang seperti apa?"

Versi 2:
"Wa'alaikumussalam Ka, makasih sudah chat SAMAQU."
"Ordernya gampang kok Ka. Kakak tinggal pilih produknya, nanti saya bantu pilihkan size yang pas. Habis itu isi data pengiriman, transfer, dan pesanan langsung kami proses."
"Kami ada Thobe, Kandora, Koko, sama Vest. Kalau mau lihat-lihat dulu, katalognya di samaqu.id/id/katalog."
"Kakak lagi nyari yang kayak gimana?"

Versi 3:
"Wa'alaikumussalam Ka, makasih ya sudah chat SAMAQU."
"Ordernya simpel kok. Kakak pilih produknya, saya bantu cariin size yang pas, terus isi data pengiriman dan transfer, langsung kami proses."
"Ada Thobe, Kandora, Koko, sama Vest Ka, katalognya bisa diintip di samaqu.id/id/katalog."
"Kakak lagi nyari yang kayak gimana nih?"

Variasi untuk pesan "Halo Admin SAMAQU, saya tertarik dengan koleksi...":
"Halo Ka, terima kasih sudah tertarik sama koleksi SAMAQU. Ordernya bisa langsung di samaqu.id/id/katalog atau lewat chat ini, nanti saya bantu pilihkan size dan hitungkan ongkirnya. Kakak lagi cari thobe atau kandora Ka?"

Contoh SALAH (jangan ditiru):
"Wa'alaikumussalam, Kak. Tentu, kami bantu ya. Kakak bisa lihat koleksi Samaqu di katalog berikut: https://www.samaqu.id. Kalau sudah ada produk yang diminati, boleh langsung kirim ke sini ya, nanti kami bantu proses pemesanannya."
Kenapa salah:
- Panggil "Kak", harusnya "Ka".
- "Tentu, kami bantu ya" terdengar template.
- Link beranda samaqu.id, harusnya samaqu.id/id/katalog.
- Tidak ditutup pertanyaan, customer disuruh mencari sendiri lalu obrolan berhenti.
- Menyebut promo, kisaran harga, atau Modern Fit di balasan pertama.$mem$, version = version + 1, updated_at = now()
   where title = 'Variasi Jawaban: Tanya Cara Order' and status = 'published' and version = 4;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'memori Tanya Cara Order tidak ditemukan atau versinya berubah (n=%)', n; end if;

  update public.ai_settings
     set behavior = jsonb_set(behavior, '{systemInstructions}', to_jsonb(replace(behavior->>'systemInstructions', $p1$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
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
     sesuai bagian Promo.$p1$, $p2$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
     info lebih lanjut tentang cara order samaqu?"): balasan PERTAMA ikuti memory "Variasi
     Jawaban: Tanya Cara Order" (tiga versi, bergantian, tanpa harga/Modern Fit/promo). Sapaan
     "Ka", bukan "Kak". Ukuran Vest belum ada datanya: kalau ditanya, oper admin (jangan
     menebak). Promo hanya sesuai bagian Promo.$p2$)), true), updated_at = now()
   where id = 1
     and (length(behavior->>'systemInstructions') - length(replace(behavior->>'systemInstructions', $p1$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
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
     sesuai bagian Promo.$p1$, ''))) = length($p1$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
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
     sesuai bagian Promo.$p1$);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'butir persona tidak ditemukan tepat satu kali (n=%)', n; end if;
end
$do$;