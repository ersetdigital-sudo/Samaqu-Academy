-- Ganti SATU butir "Tanya cara order" di aturan ringkas bot (ai_settings.behavior.systemInstructions).
-- Pengaman: hanya jalan bila teks lama muncul TEPAT SATU kali. Tidak menyentuh bagian lain, memori, atau kode bot.
update public.ai_settings
set behavior = jsonb_set(
      behavior,
      '{systemInstructions}',
      to_jsonb(replace(
        behavior->>'systemInstructions',
        E'   - Tanya cara order: bisa lewat website samaqu.id/id/katalog atau lewat WA ini (kirim nama\n     produk + warna, dibantu size dan ongkir). Promo hanya sesuai bagian Promo.',
        $new$   - Tanya cara order / info order (termasuk pembuka iklan "Assalaamu'alaikum min! Bisa minta
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
     sesuai bagian Promo.$new$
      )),
      true
    ),
    updated_at = now()
where id = 1
  and (length(behavior->>'systemInstructions')
       - length(replace(
           behavior->>'systemInstructions',
           E'   - Tanya cara order: bisa lewat website samaqu.id/id/katalog atau lewat WA ini (kirim nama\n     produk + warna, dibantu size dan ongkir). Promo hanya sesuai bagian Promo.',
           ''))) = length(E'   - Tanya cara order: bisa lewat website samaqu.id/id/katalog atau lewat WA ini (kirim nama\n     produk + warna, dibantu size dan ongkir). Promo hanya sesuai bagian Promo.');
